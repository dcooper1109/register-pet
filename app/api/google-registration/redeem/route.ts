import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

type GoogleHandoff = {
  state: string;
  oauthSub: string;
  email: string;
  authenticationMethod: string;
};

function equalHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin !== request.nextUrl.origin) {
      return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
    }

    const { code } = await request.json();
    if (typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code)) {
      return NextResponse.json({ message: "Invalid Google registration code." }, { status: 400 });
    }
    const browserState = request.cookies.get("pvr_google_state")?.value || "";
    if (!/^[a-f0-9]{64}$/.test(browserState)) {
      return NextResponse.json({ message: "Google registration session expired. Please try again." }, { status: 403 });
    }

    const redis = Redis.fromEnv();
    // Check state BEFORE consuming the one-time code.
    const key = `pvr:google-handoff:${code}`;
    const pending = await redis.get<GoogleHandoff>(key);
    if (!pending) {
      return NextResponse.json({ message: "Google registration code expired or was already used." }, { status: 410 });
    }
    if (!equalHex(browserState, pending.state)) {
      return NextResponse.json({ message: "Google registration browser verification failed." }, { status: 403 });
    }

    // Atomic GETDEL ensures a code can only be successfully consumed once.
    const identity = await redis.getdel<GoogleHandoff>(key);
    if (!identity) {
      return NextResponse.json({ message: "Google registration code was already used." }, { status: 410 });
    }
    if (!equalHex(browserState, identity.state) ||
        identity.authenticationMethod !== "google" ||
        !identity.oauthSub?.startsWith("google-oauth2|") ||
        typeof identity.email !== "string" || !identity.email.includes("@")) {
      return NextResponse.json({ message: "Invalid Google identity." }, { status: 403 });
    }

    const registrationId = randomBytes(32).toString("hex");
    const stored = await redis.set(`pvr:google-registration:${registrationId}`, {
      oauthSub: identity.oauthSub,
      email: identity.email.trim().toLowerCase(),
      authenticationMethod: "google",
    }, { ex: 3600, nx: true });
    if (stored !== "OK") throw new Error("Unable to store verified registration identity.");

    const response = NextResponse.json({
      success: true,
      authenticationMethod: "google",
      email: identity.email.trim().toLowerCase(),
    });
    response.cookies.set("pvr_google_registration", registrationId, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600,
    });
    response.cookies.delete("pvr_google_state");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[Google Registration Redeem]", error);
    return NextResponse.json({ message: "Unable to redeem Google registration code." }, { status: 500 });
  }
}
