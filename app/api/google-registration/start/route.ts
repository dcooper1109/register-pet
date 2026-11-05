import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const dashboardBase = process.env.GOOGLE_DASHBOARD_BASE_URL;
  if (!dashboardBase) {
    return NextResponse.json({ message: "Google dashboard URL is not configured." }, { status: 500 });
  }

  const target = new URL("/google-registration", dashboardBase);
  if (target.protocol !== "https:" || target.username || target.password || target.origin !== new URL(dashboardBase).origin) {
    return NextResponse.json({ message: "Invalid Google dashboard URL." }, { status: 500 });
  }

  const existingState =
    request.cookies.get("pvr_google_state")?.value || "";

  const state = /^[a-f0-9]{64}$/.test(existingState)
    ? existingState
    : randomBytes(32).toString("hex");
    
  target.searchParams.set("state", state);
  const response = NextResponse.redirect(target);
  response.cookies.set("pvr_google_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
