import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const headers = {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": process.env.MARKETING_SITE_ORIGIN || "",
    "Vary": "Origin",
  };

  try {
    const allowedOrigin = process.env.MARKETING_SITE_ORIGIN;
    if (!allowedOrigin || request.headers.get("origin") !== allowedOrigin) {
      return NextResponse.json(
        { message: "Invalid request origin." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { ticket } = await request.json();

    if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) {
      return NextResponse.json(
        { message: "Invalid Google ticket." },
        { status: 400, headers }
      );
    }

    const redis = Redis.fromEnv();
    const identity = await redis.get<{
      email: string;
      oauthSub: string;
      authenticationMethod: string;
    }>(`pvr:marketing-google:${ticket}`);

    if (
      !identity ||
      identity.authenticationMethod !== "google" ||
      !identity.oauthSub?.startsWith("google-oauth2|") ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)
    ) {
      return NextResponse.json(
        { message: "Google registration expired. Please sign in again." },
        { status: 403, headers }
      );
    }

    return NextResponse.json(
      { email: identity.email.trim().toLowerCase() },
      { headers }
    );
  } catch (error) {
    console.error("[Marketing Google Email]", error);
    return NextResponse.json(
      { message: "Unable to retrieve Google email." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const allowedOrigin = process.env.MARKETING_SITE_ORIGIN;

  if (!allowedOrigin || request.headers.get("origin") !== allowedOrigin) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    },
  });
}
