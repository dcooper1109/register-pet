import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { partnerName } = await request.json();

    if (!partnerName?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "Partner Name is required.",
        },
        { status: 400 }
      );
    }

    const url = process.env.GET_PRICE_URL;
    const subscriptionKey =
      process.env.GET_PRICE_SUBSCRIPTION_KEY;

    if (!url) {
      return NextResponse.json(
        {
          success: false,
          message: "GET_PRICE_URL is not configured.",
        },
        { status: 500 }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (subscriptionKey) {
      headers["Ocp-Apim-Subscription-Key"] =
        subscriptionKey;
    }

    const apiResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        partnerName: partnerName.trim(),
      }),
      cache: "no-store",
    });

    const responseText = await apiResponse.text();

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = {
        message: responseText,
      };
    }

    let responseBody = data?.body ?? data;

    if (typeof responseBody === "string") {
      try {
        responseBody = JSON.parse(responseBody);
      } catch {
        // Keep the original string.
      }
    }

    const subscriptionOptions =
      responseBody?.subscriptionOptions;

    if (
      !apiResponse.ok ||
      !Array.isArray(subscriptionOptions)
    ) {
      const message =
        responseBody?.results ||
        responseBody?.message ||
        data?.results ||
        data?.message ||
        "Unable to retrieve subscription pricing.";

      return NextResponse.json(
        {
          success: false,
          message,
          response: data,
        },
        {
          status: apiResponse.ok
            ? 500
            : apiResponse.status,
        }
      );
    }

    return NextResponse.json({
      success: true,
      subscriptionOptions,
    });
  } catch (error) {
    console.error("Get price error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unexpected error retrieving pricing.",
      },
      { status: 500 }
    );
  }
}