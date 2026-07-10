export async function POST(req: Request) {
  try {
    const { action, payload } = await req.json();

    const addSubscriptionKey =
      process.env.APIM_ADD_MEMBER_SUBSCRIPTION_KEY;

    const serviceUpdateSubscriptionKey =
      process.env.APIM_PET_SERVICE_UPDATE_SUBSCRIPTION_KEY;

    const addMemberUrl =
      process.env.ADD_MEMBER_AND_PET_URL;

    const serviceUpdateUrl =
      process.env.PET_SERVICE_UPDATE_URL;

    let url = "";
    let subscriptionKey = "";

    if (action === "addMemberAndPet" || action === "addSubsequentPet") {
      url = addMemberUrl ?? "";
      subscriptionKey = addSubscriptionKey ?? "";
    }

    if (
      action === "removePet" ||
      action === "cancelService" ||
      action === "reactivateService"
    ) {
      url = serviceUpdateUrl ?? "";
      subscriptionKey = serviceUpdateSubscriptionKey ?? "";
    }

    if (!url || !subscriptionKey) {
      return Response.json(
        {
          success: false,
          message: "Missing API URL or subscription key.",
        },
        { status: 500 }
      );
    }

    if (!payload || typeof payload !== "object") {
      return Response.json(
        {
          success: false,
          message: "Missing or invalid request payload.",
        },
        { status: 400 }
      );
    }

    /*
     * Require Terms acceptance when creating a new member/subscription.
     * Do not require it for pet updates, cancellation, or reactivation.
     */
    if (action === "addMemberAndPet") {
      if (payload.termsAccepted !== true) {
        return Response.json(
          {
            success: false,
            message:
              "You must read and accept the Terms and Conditions before registering.",
          },
          { status: 400 }
        );
      }

      if (
        typeof payload.termsVersion !== "string" ||
        !payload.termsVersion.trim()
      ) {
        return Response.json(
          {
            success: false,
            message: "The Terms and Conditions version is missing.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * Read the IP forwarded by Vercel or another proxy.
     * x-forwarded-for can contain multiple addresses, so use the first.
     */
    const forwardedFor = req.headers.get("x-forwarded-for");

    const acceptanceIp =
      forwardedFor?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";

    /*
     * Build a new outgoing payload.
     *
     * The server creates termsAcceptedAt so a browser cannot submit
     * an altered acceptance date.
     */
    const outgoingPayload =
      action === "addMemberAndPet"
        ? {
            ...payload,

            termsAccepted: true,
            termsVersion: payload.termsVersion.trim(),
            termsAcceptedAt: new Date().toISOString(),
            termsAcceptanceSource: "register-pet",
            termsAcceptanceIp: acceptanceIp,
          }
        : payload;

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": subscriptionKey,
      },
      body: JSON.stringify(outgoingPayload),
    });

    const text = await apiResponse.text();

    let data: unknown;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return Response.json(
      {
        success: apiResponse.ok,
        status: apiResponse.status,

        /*
         * You can temporarily keep sentBody while testing.
         * Remove it in production because it exposes personal data.
         */
        sentBody: outgoingPayload,
        response: data,
      },
      { status: apiResponse.status }
    );
  } catch (err) {
    console.error("Pet service route error:", err);

    return Response.json(
      {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "Unknown server error",
      },
      { status: 500 }
    );
  }
}