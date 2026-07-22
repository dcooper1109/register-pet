import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type PriceApiResult = {
  subscriptionType: string;
  subscriptionPrice: number | string;
};

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

function extractAvailablePrices(priceData: any): PriceApiResult[] {
  const parsedTopLevel = parsePossibleJson(priceData);
  const parsedBody = parsePossibleJson((parsedTopLevel as any)?.body);
  const parsedResponseBody = parsePossibleJson(
    (parsedTopLevel as any)?.response?.body
  );

  const possibleArrays = [
    parsedTopLevel,
    (parsedTopLevel as any)?.subscriptionOptions,
    (parsedTopLevel as any)?.prices,
    parsedBody,
    (parsedBody as any)?.subscriptionOptions,
    (parsedBody as any)?.prices,
    parsedResponseBody,
    (parsedResponseBody as any)?.subscriptionOptions,
    (parsedResponseBody as any)?.prices,
  ];

  const found = possibleArrays.find((value) => Array.isArray(value));

  return Array.isArray(found) ? found : [];
}

async function createPaymentRecord(
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

export async function POST(request: Request) {
  let paymentRecordId = "";
  let registrationToken = "";
  let partnerName = "";
  let memberSubID = "";
  let memberEmail = "";

  try {
    const body = await request.json();

    const {
      subscriptionType,
      affinityGroup,
    } = body;

    registrationToken = String(body.registrationToken ?? "").trim();
    partnerName = String(body.partnerName ?? "").trim();
    memberSubID = String(body.memberSubID ?? "").trim();
    memberEmail = String(body.memberEmail ?? "").trim();

    if (
      !registrationToken ||
      !subscriptionType ||
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

    /*
     * Verify the current matched subscription type and price
     * using the server-side Get Price API.
     */
    const priceUrl = process.env.GET_PRICE_URL;
    const priceKey = process.env.GET_PRICE_SUBSCRIPTION_KEY;

    if (!priceUrl || !priceKey) {
      throw new Error("Get Price API configuration is missing.");
    }

    const priceResponse = await fetch(priceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": priceKey,
      },
      body: JSON.stringify({
        partnerName,
        affinityGroup,
      }),
      cache: "no-store",
    });

    if (!priceResponse.ok) {
      const errorText = await priceResponse.text();
      console.error("Get Price API error:", errorText);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to verify the subscription price.",
        },
        { status: 502 }
      );
    }

    const priceData = await priceResponse.json();
    const availablePrices = extractAvailablePrices(priceData);

    if (availablePrices.length === 0) {
      console.error(
        "Unexpected Get Price API response:",
        JSON.stringify(priceData, null, 2)
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "The Get Price API did not return any subscription options.",
        },
        { status: 502 }
      );
    }

    const normalizedRequestedType = String(subscriptionType)
      .trim()
      .toLowerCase();

    const matchedPrice = availablePrices.find((item) => {
      if (!item?.subscriptionType) {
        return false;
      }

      return (
        String(item.subscriptionType).trim().toLowerCase() ===
        normalizedRequestedType
      );
    });

    if (!matchedPrice) {
      return NextResponse.json(
        {
          success: false,
          message:
            "The selected subscription type is no longer available.",
        },
        { status: 400 }
      );
    }

    const unitAmount = convertDollarsToCents(
      matchedPrice.subscriptionPrice
    );

    const verifiedSubscriptionType = String(
      matchedPrice.subscriptionType
    ).trim();

    const verifiedSubscriptionPrice = (
      unitAmount / 100
    ).toFixed(2);

    /*
     * Create the Auction Pet Registration Payment row
     * before creating the Stripe Checkout Session.
     */
    const paymentRecord = await createPaymentRecord({
      registrationToken,
      memberSubID,
      memberEmail,
      subscriptionType: verifiedSubscriptionType,
      subscriptionPrice: verifiedSubscriptionPrice,
      partnerName,
      affinityGroup: affinityGroup ?? "",
    });

    paymentRecordId = paymentRecord.paymentRecordId;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      "https://register.petvantagerx.com";

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
            product_data: {
              name: verifiedSubscriptionType,
              description: "PetVantageRx monthly subscription",
            },
          },
          quantity: 1,
        },
      ],

      metadata: {
        registrationToken,
        paymentRecordId,
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
          partnerName,
          memberSubID,
          memberEmail,
          subscriptionType: verifiedSubscriptionType,
          subscriptionPrice: verifiedSubscriptionPrice,
        },
      },

      success_url:
        "https://purchase.petvantagerx.com/" +
        "?stripe_session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://register.petvantagerx.com/" +
        `?payment=cancelled` +
        `&registrationToken=${encodeURIComponent(registrationToken)}`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    const stripeCustomerID =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? "";

    const stripeSubscriptionID =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? "";

    /*
     * Save the initial Stripe values on the payment row.
     * The webhook will later add the final paid/customer/
     * subscription/invoice values.
     */
    await updatePaymentRecord({
      paymentRecordId,
      registrationToken,
      partnerName,
      memberSubID,
      memberEmail,
      stripeCheckoutID: session.id,
      stripeCheckoutURL: session.url,
      stripeCustomerID,
      stripeSubscriptionID,
      stripePaymentStatus: session.payment_status,
      paymentTrackingStatus: "Checkout Created",
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
      paymentRecordId,
    });
  } catch (error) {
    console.error("Stripe Checkout error:", error);

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