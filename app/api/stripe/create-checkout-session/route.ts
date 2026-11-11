import { createDataversePaymentRecord } from "@/lib/createDataversePaymentRecord";
import Stripe from "stripe";
import { getPricing, pricingPartner } from "@/lib/getPricing";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
type CreatePaymentRecordInput = {
  registrationToken: string;
  memberSubID: string;
  memberEmail: string;
  subscriptionType: string;
  subscriptionPrice: string | number;
  partnerName: string;
  affinityGroup: string;
};

type CreatePaymentRecordResult = {
  success: boolean;
  paymentRecordId: string;
};

type UpdatePaymentRecordInput = {
  paymentRecordId: string;
  registrationToken: string;
  partnerName?: string;
  memberSubID?: string;
  memberEmail?: string;
  stripeCheckoutID: string;
  stripeCheckoutURL?: string;
  stripeCustomerID?: string;
  stripeSubscriptionID?: string;
  stripePaymentStatus?: string;
  paymentTrackingStatus: string;
  errorMessage?: string;
};

function convertDollarsToCents(price: number | string): number {
  const normalizedPrice =
    typeof price === "string"
      ? price.replace(/\$/g, "").replace(/,/g, "").trim()
      : price;

  const numericPrice = Number(normalizedPrice);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new Error("Invalid subscription price.");
  }
  return Math.round(numericPrice * 100);
}

function parsePossibleJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractResponseBody(data: any): any {
  let responseBody =
    data?.response?.body ??
    data?.body ??
    data?.response ??
    data;
  responseBody = parsePossibleJson(responseBody);
  /*
   * Handles an additional APIM/Power Automate wrapper:
   * {
   *   statusCode: "200",
   *   body: { ... }
   * }
   */

  if (
    responseBody &&
    typeof responseBody === "object" &&
    "body" in responseBody
  ) {
    responseBody = parsePossibleJson(responseBody.body);
  }

  return responseBody;
}

async function createPaymentRecordPowerAutomate(
  input: CreatePaymentRecordInput
): Promise<CreatePaymentRecordResult> {
  const url = process.env.APIM_CREATE_PAYMENT_RECORD_URL;
  const key = process.env.APIM_CREATE_PAYMENT_RECORD_KEY;

  if (!url || !key) {
    throw new Error(
      "Payment-record API configuration is missing."
    );
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
    },

    body: JSON.stringify({
      registrationToken: input.registrationToken,
      memberSubID: input.memberSubID,
      memberEmail: input.memberEmail,
      subscriptionType: input.subscriptionType,
      subscriptionPrice: input.subscriptionPrice,
      partnerName: input.partnerName,
      affinityGroup: input.affinityGroup,
      paymentTrackingStatus: "Creating Checkout",
      stripePaymentStatus: "unpaid",
    }),
    cache: "no-store",
  });

  const data = await response.json();
  const responseBody = extractResponseBody(data);

  if (!response.ok || responseBody?.success !== true) {
    throw new Error(
      responseBody?.message ||
        responseBody?.results ||
        "Unable to create the payment tracking record."
    );
  }

  const paymentRecordId =
    responseBody?.paymentRecordId ??
    responseBody?.registrationPaymentId ??
    responseBody?.rowId ??
    responseBody?.id;
  if (!paymentRecordId) {
    throw new Error(
      "The payment record was created, but its Dataverse row ID was not returned."
    );
  }

  return {
    success: true,
    paymentRecordId: String(paymentRecordId),
  };
}

async function createPaymentRecord(
  input: CreatePaymentRecordInput
): Promise<CreatePaymentRecordResult> {
  if (process.env.PAYMENT_RECORD_BACKEND === "direct") {
    return createDataversePaymentRecord(input);
  }

  return createPaymentRecordPowerAutomate(input);
}

async function updatePaymentRecord(
  input: UpdatePaymentRecordInput
): Promise<void> {

  const url = process.env.APIM_UPDATE_PAYMENT_RECORD_URL;
  const key = process.env.APIM_UPDATE_PAYMENT_RECORD_KEY;
  if (!url || !key) {
    throw new Error(
      "Payment-record update API configuration is missing."
    );
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Unable to update the payment tracking record: ${responseText}`
    );
  }

  if (responseText) {
    const parsed = parsePossibleJson(responseText);
    const responseBody = extractResponseBody(parsed);

    if (
      responseBody &&
      typeof responseBody === "object" &&
      responseBody.success === false
    ) {
      throw new Error(
        responseBody.message ||
          responseBody.results ||
          "The payment tracking record update failed."
      );
    }
  }
}

type VerifiedGoogleIdentity = {
  oauthSub: string;
  email: string;
  authenticationMethod: "google";
};

export async function POST(request: Request) {
  let paymentRecordId = "";
  let registrationToken = "";
  let partnerName = "";
  let memberSubID = "";
  let memberEmail = "";
  const routeStart=Date.now();
  const logTiming=(step:string,started:number,details:Record<string,unknown>={})=>
    console.log("[PVR TIMING]",JSON.stringify({route:"create-checkout-session",step,elapsedMs:Date.now()-started,memberSubID,...details}));

  try {
    const body = await request.json();
    const googleLookupStart=Date.now();
    // Only the server-side, HttpOnly Redis identity can select Google registration.
    const cookieHeader = request.headers.get("cookie") || "";
    const googleCookie = cookieHeader.split(";").map(x => x.trim())
      .find(x => x.startsWith("pvr_google_registration="))?.slice("pvr_google_registration=".length) || "";
    let googleIdentity: VerifiedGoogleIdentity | null = null;
    if (googleCookie && body?.authenticationMethod === "google") {
      if (!/^[a-f0-9]{64}$/.test(googleCookie)) {
        return NextResponse.json({ success: false, message: "Invalid Google registration session." }, { status: 403 });
      }
      const stored = await Redis.fromEnv().get<VerifiedGoogleIdentity>(`pvr:google-registration:${googleCookie}`);
      if (!stored || stored.authenticationMethod !== "google" ||
          !stored.oauthSub?.startsWith("google-oauth2|") || !stored.email) {
        return NextResponse.json({ success: false, message: "Google registration expired. Please sign in with Google again." }, { status: 403 });
      }
      googleIdentity = stored;
    }

    logTiming("google-identity-lookup",googleLookupStart);
    const authenticationMethod = body?.authenticationMethod;
    if (authenticationMethod !== "google" && authenticationMethod !== "password") {
      return NextResponse.json(
        { success: false, message: "Invalid registration authentication method." },
        { status: 400 }
      );
    }
    if (authenticationMethod === "google" && !googleIdentity) {
      return NextResponse.json(
        { success: false, message: "Google verification expired. Please sign in with Google again." },
        { status: 403 }
      );
    }
    const {
      subscriptionType,
      subscriptionPrice,
      affinityGroup,
    } = body;

    registrationToken = String(body.registrationToken ?? "").trim();
    partnerName = String(body.partnerName ?? "").trim();
    memberSubID = String(body.memberSubID ?? "").trim();
    memberEmail = String(body.memberEmail ?? "").trim();
    if (googleIdentity && (
      googleIdentity.email.trim().toLowerCase() !== memberEmail.toLowerCase() ||
      partnerName !== pricingPartner()
    )) {
      return NextResponse.json({ success: false, message: "Google account does not match this registration." }, { status: 403 });
    }

      if (
        !registrationToken ||
        !subscriptionType ||
        subscriptionPrice === null ||
        subscriptionPrice === undefined ||
        subscriptionPrice === "" ||
        !memberEmail ||
        !memberSubID ||
        !partnerName
      ) {
      return NextResponse.json(
        {
          success: false,
          message: "Required registration information is missing.",
        },
        { status: 400 }
      );
    }

    // Marketing registrations use one identifier for both Add Member and Stripe.
    // Do not require the Add Member API to finish before creating a payment record.
    // Keep partner registrations compatible with their existing token conventions.
    if (partnerName === pricingPartner() && registrationToken !== memberSubID) {
      return NextResponse.json(
        { success: false, message: "Registration token must match member subscription ID." },
        { status: 400 }
      );
    }

    // Marketing registrations must match current server-side Dataverse pricing.
    // Existing non-marketing partner registrations retain their own pricing rules.
    if (partnerName === pricingPartner()) {
      let prices: Awaited<ReturnType<typeof getPricing>>;
      try { prices = await getPricing(); }
      catch (error) {
        console.error("Checkout pricing lookup failed:", error);
        return NextResponse.json({ success: false, message: "Subscription pricing is temporarily unavailable." }, { status: 503 });
      }
      const option = Object.values(prices).find(p => p.type === String(subscriptionType).trim());
      if (!option || convertDollarsToCents(subscriptionPrice) !== convertDollarsToCents(option.price)) {
        return NextResponse.json({ success: false, message: "Subscription price does not match current pricing." }, { status: 409 });
      }
    }

    const verifiedSubscriptionType =
      String(subscriptionType).trim();

    const unitAmount =
      convertDollarsToCents(subscriptionPrice);

    const verifiedSubscriptionPrice =
      (unitAmount / 100).toFixed(2);

    const createPaymentStart = Date.now();
    console.log("TIMING - Create Payment Record: started");
    const paymentRecord = await createPaymentRecord({
      registrationToken,
      memberSubID,
      memberEmail,
      subscriptionType: verifiedSubscriptionType,
      subscriptionPrice: verifiedSubscriptionPrice,
      partnerName,
      affinityGroup: affinityGroup ?? "",
    });

    logTiming("create-payment-record",createPaymentStart);

    paymentRecordId = paymentRecord.paymentRecordId;
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??

      "https\://register.petvantagerx.com";

    const stripeProductId =
      process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID;

    if (!stripeProductId) {
      throw new Error(
        "STRIPE_SUBSCRIPTION_PRODUCT_ID is not configured."
      );
    }

    // Only configured Marketing origin (or local development) can receive a cancel redirect.
    let marketingCancelUrl = "";
    try {
      const candidate = new URL(String(body.returnUrl || ""));
      const allowed = [process.env.MARKETING_SITE_ORIGIN, ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:8080", "http://127.0.0.1:8080"])].filter(Boolean);
      if (allowed.includes(candidate.origin)) {
        candidate.searchParams.set("payment","cancelled");
        candidate.hash = "signup";
        marketingCancelUrl = candidate.toString();
      }
    } catch {}

    const stripeCheckoutStart = Date.now();
    console.log("TIMING - Stripe Checkout Session: started");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: memberEmail,
      client_reference_id: registrationToken,

      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            recurring: {
              interval: "month",
            },
            product: stripeProductId,
          },
          quantity: 1,
        },
      ],

      metadata: {
        registrationToken,
        paymentRecordId,
        ...(googleIdentity ? { authenticationMethod: "google" } : {}),
        partnerName,
        memberSubID,
        memberEmail,
        subscriptionType: verifiedSubscriptionType,
        subscriptionPrice: verifiedSubscriptionPrice,
      },

      subscription_data: {
        metadata: {
          registrationToken,
          paymentRecordId,
          ...(googleIdentity ? { authenticationMethod: "google" } : {}),
          partnerName,
          memberSubID,
          memberEmail,
          subscriptionType: verifiedSubscriptionType,
          subscriptionPrice: verifiedSubscriptionPrice,
        },
      },

      success_url:
        `${baseUrl}/` +
        "?stripe_session_id={CHECKOUT_SESSION_ID}",
      cancel_url: marketingCancelUrl ||
        `${baseUrl}/` +
        `?payment=cancelled` +
        `&registrationToken=${encodeURIComponent(registrationToken)}`,
    });

    logTiming("stripe-session-create",stripeCheckoutStart);

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    const googleBindingStart=Date.now();
    // Persist the identity with this specific checkout, not with a browser-provided flag.
    // It survives the Stripe redirect and expiration of the initial Google cookie.
    if (googleIdentity) {
      const result = await Redis.fromEnv().set(`pvr:google-checkout:${session.id}`, {
        oauthSub: googleIdentity.oauthSub,
        email: googleIdentity.email.trim().toLowerCase(),
        authenticationMethod: "google",
        registrationToken,
        paymentRecordId,
      }, { ex: 60 * 60 * 24 * 7, nx: true });
      if (result !== "OK") throw new Error("Unable to bind Google identity to checkout.");
    }

    logTiming("google-checkout-binding",googleBindingStart);
    // The checkout.session.completed webhook saves the Checkout Session ID
    // and subsequent Stripe details after payment. Do not block the
    // redirect with a separate "Checkout Created" Dataverse update.

    const checkoutResult = NextResponse.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
      paymentRecordId,
    });

    // Bind the returning browser to the same registration.
    checkoutResult.cookies.set(`pvr_checkout_${session.id}`, registrationToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    logTiming("total-checkout-api",routeStart,{success:true});
    return checkoutResult;

  } catch (error) {

    console.error("Stripe Checkout error:", error);
    logTiming("total-checkout-api",routeStart,{success:false});

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unable to start the Stripe payment process.";

    /*
     * If the Dataverse payment row was already created,
     * make a best-effort attempt to record the failure.
     */
    if (paymentRecordId) {
      try {
        await updatePaymentRecord({
          paymentRecordId,
          registrationToken,
          partnerName,
          memberSubID,
          memberEmail,
          stripeCheckoutID: "",
          paymentTrackingStatus: "Checkout Error",
          errorMessage,
        });
      } catch (updateError) {
        console.error(
          "Unable to record Checkout error in Dataverse:",
          updateError
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}