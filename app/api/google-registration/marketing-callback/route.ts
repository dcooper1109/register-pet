import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
type Handoff = { state: string; oauthSub: string; email: string; authenticationMethod: string };
export async function GET(request: NextRequest) {
  const marketingOrigin = process.env.MARKETING_SITE_ORIGIN;
  if (!marketingOrigin) return NextResponse.json({ message: "Marketing origin is not configured." }, { status: 500 });
  const target = new URL(marketingOrigin);
  if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash) return NextResponse.json({ message: "Invalid marketing origin." }, { status: 500 });
  const code = request.nextUrl.searchParams.get("google_handoff") || "";
  const state = request.cookies.get("pvr_google_state")?.value || "";
  if (!/^[a-f0-9]{64}$/.test(code) || !/^[a-f0-9]{64}$/.test(state)) return NextResponse.json({ message: "Google registration expired. Start again from Join." }, { status: 403 });
  const redis = Redis.fromEnv();
  const pending = await redis.get<Handoff>(`pvr:google-handoff:${code}`);
  if (!pending || !/^[a-f0-9]{64}$/.test(pending.state) || !timingSafeEqual(Buffer.from(state, "hex"), Buffer.from(pending.state, "hex"))) return NextResponse.json({ message: "Google verification failed." }, { status: 403 });
  const identity = await redis.getdel<Handoff>(`pvr:google-handoff:${code}`);
  if (!identity || identity.authenticationMethod !== "google" || !identity.oauthSub?.startsWith("google-oauth2|") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) return NextResponse.json({ message: "Invalid Google identity." }, { status: 403 });
  const ticket = randomBytes(32).toString("hex");
  const result = await redis.set(`pvr:marketing-google:${ticket}`, { email: identity.email.trim().toLowerCase(), oauthSub: identity.oauthSub, authenticationMethod: "google" }, { ex: 3600, nx: true });
  if (result !== "OK") return NextResponse.json({ message: "Unable to create Google registration." }, { status: 500 });
  target.searchParams.set("google_ticket", ticket);
  target.hash = "signup";
  const response = NextResponse.redirect(target);
  response.cookies.delete("pvr_google_state");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
