import { NextRequest, NextResponse } from "next/server";
import { getPricing } from "@/lib/getPricing";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = new Set([
  "https://prod-www.petvantagerx.com",
  "https://www.petvantagerx.com",
  "https://petvantagerx.com",
  "https://petvantagerx-new-website.vercel.app",
  "https://dev-www.petvantagerx.com",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }

  return headers;
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const pricing = await getPricing();

    return NextResponse.json(
      {
        subscriptionOptions: Object.values(pricing).map((plan) => ({
          subscriptionType: plan.type,
          subscriptionPrice: Number(plan.price),
        })),
      },
      {
        status: 200,
        headers: corsHeaders(origin),
      }
    );
  } catch (error) {
    console.error("Public pricing API error:", error);

    return NextResponse.json(
      {
        error: "Subscription pricing is temporarily unavailable.",
      },
      {
        status: 503,
        headers: corsHeaders(origin),
      }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Max-Age": "3600",
    },
  });
}
