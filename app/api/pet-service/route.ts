export async function POST(req: Request) {
  try {
    const { action, payload } = await req.json();

    const addSubscriptionKey = process.env.APIM_ADD_MEMBER_SUBSCRIPTION_KEY;
    const serviceUpdateSubscriptionKey =
      process.env.APIM_PET_SERVICE_UPDATE_SUBSCRIPTION_KEY;

    const addMemberUrl = process.env.ADD_MEMBER_AND_PET_URL;
    const serviceUpdateUrl = process.env.PET_SERVICE_UPDATE_URL;

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
        { success: false, message: "Missing API URL or subscription key." },
        { status: 500 }
      );
    }

    if (!payload) {
      return Response.json(
        { success: false, message: "Missing request payload." },
        { status: 400 }
      );
    }

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": subscriptionKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await apiResponse.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return Response.json(
      {
        success: apiResponse.ok,
        status: apiResponse.status,
        sentBody: payload,
        response: data,
      },
      { status: apiResponse.status }
    );
  } catch (err) {
    return Response.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}