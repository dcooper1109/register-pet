import { NextRequest, NextResponse } from "next/server";
import { getPricing } from "@/lib/getPricing";

export const dynamic = "force-dynamic";

function cors(request: NextRequest): Record<string,string> {
  const origin = request.headers.get("origin") || "";
  const allowed = process.env.MARKETING_SITE_ORIGIN;
  const local = process.env.VERCEL_ENV !== "production" &&
    (origin === "http://localhost:8080" || origin === "http://127.0.0.1:8080");
  if (origin && (origin === allowed || local)) return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin"
  };
  return { "Vary": "Origin" };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !cors(request)["Access-Control-Allow-Origin"]) {
    return NextResponse.json({ message: "Origin not allowed." }, { status: 403 });
  }
  try {
    const prices = await getPricing();
    return NextResponse.json({
      subscriptionOptions: [prices.one, prices.two, prices.three].map(p => ({
        subscriptionType: p.type,
        subscriptionPrice: Number(p.price)
      }))
    }, { headers: { ...cors(request), "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Public pricing lookup failed:", error);
    return NextResponse.json({ message: "Subscription pricing is temporarily unavailable." },
      { status: 503, headers: { ...cors(request), "Cache-Control": "no-store" } });
  }
}
