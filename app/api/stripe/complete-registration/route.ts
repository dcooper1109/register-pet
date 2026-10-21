import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // This HttpOnly cookie MUST be set by create-checkout-session before
  // redirecting to Stripe. It binds this browser to the registration.
  const boundToken = request.cookies.get("pvr_checkout_binding")?.value;
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

    // createAuth0User MUST independently validate the payment record's
    // invoice.paid confirmation, ensure idempotent user creation, and
    // authorize the registration before issuing a password ticket.
    const flowResponse = await fetch(flowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CREATE_AUTH0_USER_APIM_KEY
          ? { "Ocp-Apim-Subscription-Key": process.env.CREATE_AUTH0_USER_APIM_KEY }
          : {}),
      },
      body: JSON.stringify({ paymentRecordId }),
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
    const passwordSetupUrl = result?.passwordSetupUrl;
    if (typeof passwordSetupUrl !== "string") {
      return json({ message: "Auth0 setup did not return a password URL." }, 502);
    }
    const parsed = new URL(passwordSetupUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname) {
      return json({ message: "Invalid Auth0 password setup URL." }, 502);
    }
    // Configure the exact expected Auth0 tenant/custom domain in Vercel.
    const allowedHost = process.env.AUTH0_PASSWORD_SETUP_HOST;
    if (!allowedHost || parsed.hostname !== allowedHost) {
      return json({ message: "Untrusted Auth0 password setup domain." }, 502);
    }
    return json({ status: "ready", passwordSetupUrl });
  } catch {
    return json({ message: "Unable to finish registration. Please contact support; do not pay again." }, 502);
  }
}
