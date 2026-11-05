#!/usr/bin/env python3
"""Patch register-pet Dev checkout for verified Google registrations. Run from repository root."""
from pathlib import Path
import sys

root = Path.cwd()
checkout_path = root / 'app/api/stripe/create-checkout-session/route.ts'
complete_path = root / 'app/api/stripe/complete-registration/route.ts'
page_path = root / 'app/page.tsx'
for p in (checkout_path, complete_path, page_path):
    if not p.is_file(): sys.exit(f'Missing {p}; no files changed.')
checkout = checkout_path.read_text()
complete = complete_path.read_text()
page = page_path.read_text()
if 'pvr:google-checkout:' in checkout or 'pvr:google-checkout:' in complete:
    sys.exit('Google checkout patch already present; no files changed.')

def replace_once(source, old, new, label):
    n=source.count(old)
    if n != 1: sys.exit(f'{label}: expected exactly one anchor, found {n}: {old[:95]!r}. No files changed.')
    return source.replace(old,new,1)

checkout=replace_once(checkout, 'import Stripe from "stripe";', '''import Stripe from "stripe";
import { Redis } from "@upstash/redis";''','checkout imports')
checkout=replace_once(checkout, 'export async function POST(request: Request) {', '''type VerifiedGoogleIdentity = {
  oauthSub: string;
  email: string;
  authenticationMethod: "google";
};

export async function POST(request: Request) {''','checkout function')
checkout=replace_once(checkout, '''    const body = await request.json();''', '''    // Only the server-side, HttpOnly Redis identity can select Google registration.
    const cookieHeader = request.headers.get("cookie") || "";
    const googleCookie = cookieHeader.split(";").map(x => x.trim())
      .find(x => x.startsWith("pvr_google_registration="))?.slice("pvr_google_registration=".length) || "";
    let googleIdentity: VerifiedGoogleIdentity | null = null;
    if (googleCookie) {
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
    const body = await request.json();''','checkout body')
checkout=replace_once(checkout, '''    memberEmail = String(body.memberEmail ?? "").trim();''', '''    memberEmail = String(body.memberEmail ?? "").trim();
    if (googleIdentity && (
      googleIdentity.email.trim().toLowerCase() !== memberEmail.toLowerCase() ||
      partnerName !== "Direct Registration"
    )) {
      return NextResponse.json({ success: false, message: "Google account does not match this registration." }, { status: 403 });
    }''','checkout identity match')
checkout=replace_once(checkout, '''    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }''', '''    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

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
    }''','checkout session storage')
# Server-derived method marker allows completion to fail closed if Redis expires.
checkout=replace_once(checkout, '''        paymentRecordId,
        partnerName,
        memberSubID,''', '''        paymentRecordId,
        ...(googleIdentity ? { authenticationMethod: "google" } : {}),
        partnerName,
        memberSubID,''', 'checkout metadata method')
checkout=replace_once(checkout, '''          paymentRecordId,
          partnerName,
          memberSubID,''', '''          paymentRecordId,
          ...(googleIdentity ? { authenticationMethod: "google" } : {}),
          partnerName,
          memberSubID,''', 'subscription metadata method')
# Important: preserve original email/password path and do not modify its response.
complete_new = '''import { NextRequest, NextResponse } from "next/server";
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
'''
if 'const flowUrl = process.env.CREATE_AUTH0_USER_FLOW_URL;' not in complete or 'const cookieName = `pvr_checkout_${checkoutSessionId}`;' not in complete:
    sys.exit('Unexpected complete-registration route; no files changed.')
# Remove only the two intentionally temporary Google checkout blocks.
page=replace_once(page, '''  // Google checkout remains blocked until server-side Dataverse/Stripe binding is implemented.
  const submitDisabled = isSubmitting || !termsAccepted || draftUnavailable ||
    googleHandoffPending || Boolean(googleVerifiedEmail);''', '''  const submitDisabled = isSubmitting || !termsAccepted || draftUnavailable || googleHandoffPending;''','page submit guard')
page=replace_once(page, '''    if (googleHandoffPending || googleVerifiedEmail) {
      setIsError(true);
      setResult("Google checkout is not yet enabled. Account linking must be completed first.");
      return;
    }''', '''    if (googleHandoffPending) {
      setIsError(true);
      setResult("Google verification is still in progress.");
      return;
    }''','page action guard')
import re
helper_pattern = r"(?m)^[ \t]*\{googleVerifiedEmail && \(\n[ \t]*<p style=\{helperTextStyle\}>\n[ \t]*Google verification is ready\. Checkout for Google accounts is temporarily disabled\n[ \t]*until the server-side account linking is completed\.\n[ \t]*</p>\n[ \t]*\)\}\n"
page, helper_count = re.subn(helper_pattern, "", page)
if helper_count != 1: sys.exit(f"page Google helper: expected 1 block, found {helper_count}. No files changed.")
page=replace_once(page, '''        if (data?.status === "ready" && typeof data?.passwordSetupUrl === "string") {''', '''        if (data?.status === "ready" && typeof data?.redirectUrl === "string") {
          // The server supplies a configured dashboard URL only for verified Google checkout.
          const destination = new URL(data.redirectUrl);
          if (destination.protocol !== "https:" || destination.origin !== new URL(
            process.env.NEXT_PUBLIC_GOOGLE_DASHBOARD_BASE_URL || "https://dev-dashboard.petvantagerx.com"
          ).origin) {
            throw new Error("Untrusted dashboard redirect.");
          }
          window.location.replace(destination.href);
          return;
        }
        if (data?.status === "ready" && typeof data?.passwordSetupUrl === "string") {''','page completion redirect')
# NEXT_PUBLIC_ env is not required; explicitly validate against fixed dev/prod dashboard hostnames instead.
page=page.replace('''          if (destination.protocol !== "https:" || destination.origin !== new URL(
            process.env.NEXT_PUBLIC_GOOGLE_DASHBOARD_BASE_URL || "https://dev-dashboard.petvantagerx.com"
          ).origin) {''', '''          if (destination.protocol !== "https:" ||
              !["https://dev-dashboard.petvantagerx.com", "https://dashboard.petvantagerx.com"].includes(destination.origin) ||
              destination.pathname !== "/" || destination.search || destination.hash) {''')
# Atomic-ish: all anchors verified before any writes. Keep backups for easy rollback.
for p in (checkout_path,complete_path,page_path):
    backup=p.with_name(p.name+'.before-google-checkout')
    if backup.exists(): sys.exit(f'Backup already exists: {backup}. No files changed.')
for p in (checkout_path,complete_path,page_path):
    p.with_name(p.name+'.before-google-checkout').write_text(p.read_text())
checkout_path.write_text(checkout)
complete_path.write_text(complete_new)
page_path.write_text(page)
print('Updated checkout, completion, and registration page. Backups saved as *.before-google-checkout')
print('Next: npm run build')
