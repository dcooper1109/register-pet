import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleCheckout = {
  oauthSub: string;
  email: string;
  authenticationMethod: "google";
  registrationToken: string;
  paymentRecordId: string;
};

function json(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const flowUrl = process.env.CREATE_AUTH0_USER_FLOW_URL;
  if (!stripeKey || !flowUrl) {
    return json({ message: "Registration completion is not configured." }, 500);
  }

  let checkoutSessionId: unknown;
  try {
    ({ checkoutSessionId } = await request.json());
  } catch {
    return json({ message: "Invalid request." }, 400);
  }
  if (typeof checkoutSessionId !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(checkoutSessionId)) {
    return json({ message: "Invalid Checkout Session ID." }, 400);
  }

  const cookieName = `pvr_checkout_${checkoutSessionId}`;
  const boundToken = request.cookies.get(cookieName)?.value;
  if (!boundToken) {
    return json({ message: "Registration session expired. Please contact support; do not pay again." }, 403);
  }

  try {
    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(checkoutSessionId)}`,
      { headers: { Authorization: `Bearer ${stripeKey}` }, cache: "no-store" }
    );
    if (!stripeResponse.ok) {
      return json({ message: "Unable to verify the Stripe Checkout Session." }, 502);
    }
    const session = await stripeResponse.json();
    const registrationToken = session?.metadata?.registrationToken;
    const paymentRecordId = session?.metadata?.paymentRecordId;

    if (!registrationToken || registrationToken !== boundToken) {
      return json({ message: "Checkout Session does not match this registration." }, 403);
    }
    if (session.mode !== "subscription" || session.status !== "complete") {
      return json({ status: "pending" });
    }
    if (session.payment_status !== "paid") {
      return json({ status: "pending" });
    }
    if (typeof paymentRecordId !== "string" || !/^[a-f0-9-]{36}$/i.test(paymentRecordId)) {
      return json({ message: "Checkout Session is missing its payment record ID." }, 502);
    }

    // Only an identity stored by the server during checkout may select Google.
    const google = await Redis.fromEnv().get<GoogleCheckout>(`pvr:google-checkout:${checkoutSessionId}`);
    if (session?.metadata?.authenticationMethod === "google" && !google) {
      return json({ message: "Google checkout identity expired. Please contact support; do not pay again." }, 403);
    }
    if (google && session?.metadata?.authenticationMethod !== "google") {
      return json({ message: "Google checkout method mismatch." }, 403);
    }
    if (google && (
      google.authenticationMethod !== "google" ||
      !google.oauthSub?.startsWith("google-oauth2|") ||
      google.registrationToken !== registrationToken ||
      google.paymentRecordId !== paymentRecordId ||
      !google.email ||
      google.email.toLowerCase() !== String(session.customer_details?.email ?? session.customer_email ?? "").toLowerCase()
    )) {
      return json({ message: "Google checkout identity verification failed." }, 403);
    }

    // The Power Automate flow independently verifies invoice.paid and updates
    // Dataverse. For Google, it must be idempotent and must not create a DB user.
    const flowResponse = await fetch(flowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CREATE_AUTH0_USER_APIM_KEY
          ? { "Ocp-Apim-Subscription-Key": process.env.CREATE_AUTH0_USER_APIM_KEY }
          : {}),
      },
      body: JSON.stringify({
        paymentRecordId,
        userID: google?.email ?? (session.customer_details?.email ?? session.customer_email),
        ...(google ? { authenticationMethod: "google", oauthSub: google.oauthSub } : {}),
      }),
      cache: "no-store",
    });
    if (!flowResponse.ok) {
      return json({ message: "Account setup is temporarily unavailable. Please contact support if this continues." }, 502);
    }
    let result = await flowResponse.json();
    if (result?.body) {
      result = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
    }
    if (result?.status === "pending") return json({ status: "pending" });
    if (result?.success === false || result?.status === "error" || result?.status === "failed") {
      return json({ message: "Account setup did not complete. Please contact support; do not pay again." }, 502);
    }

    if (google) {
      // The Google branch must return an explicit success signal from the flow.
      // An HTTP 200 alone is not proof that the Dataverse update succeeded.
      if (result?.status !== "ready" && result?.success !== true) {
        return json({ message: "Google account setup did not confirm completion." }, 502);
      }
      const dashboardBase = process.env.GOOGLE_DASHBOARD_BASE_URL;
      if (!dashboardBase) return json({ message: "Google dashboard URL is not configured." }, 500);
      const dashboard = new URL(dashboardBase);
      if (dashboard.protocol !== "https:" || dashboard.username || dashboard.password ||
          dashboard.pathname !== "/" || dashboard.search || dashboard.hash) {
        return json({ message: "Invalid Google dashboard URL configuration." }, 500);
      }
      return json({ status: "ready", redirectUrl: dashboard.origin + "/" });
    }

    const passwordSetupUrl = result?.passwordSetupUrl;
    if (typeof passwordSetupUrl !== "string") {
      return json({ message: "Auth0 setup did not return a password URL." }, 502);
    }
    const parsed = new URL(passwordSetupUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname) {
      return json({ message: "Invalid Auth0 password setup URL." }, 502);
    }
    const allowedHost = process.env.AUTH0_PASSWORD_SETUP_HOST;
    if (!allowedHost || parsed.hostname !== allowedHost) {
      return json({ message: "Untrusted Auth0 password setup domain." }, 502);
    }
    return json({ status: "ready", passwordSetupUrl });
  } catch (error) {
    console.error("Registration completion failed:", error);
    return json({ message: "Unable to finish registration. Please contact support; do not pay again." }, 502);
  }
}
