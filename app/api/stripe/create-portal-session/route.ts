import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type PortalRequest = {
  stripeCustomerId?: string;
};

export async function POST(req: Request) {
  try {
    const { stripeCustomerId } =
      (await req.json()) as PortalRequest;

    if (!stripeCustomerId) {
      return Response.json(
        {
          success: false,
          message: "Stripe Customer ID is required.",
        },
        { status: 400 }
      );
    }

    /*
     * SECURITY:
     * In production, confirm that this Stripe Customer ID belongs
     * to the currently authenticated PetVantageRx member.
     *
     * Ideally, retrieve the Stripe Customer ID from your server-side
     * Dataverse/API lookup instead of trusting a browser-supplied ID.
     */

    const portalSession =
      await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,

        return_url:
          process.env.STRIPE_PORTAL_RETURN_URL ??
          "https://purchase.petvantagerx.com",
      });

    return Response.json({
      success: true,
      url: portalSession.url,
    });
  } catch (error) {
    console.error(
      "Unable to create Stripe portal session:",
      error
    );

    return Response.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to open the billing portal.",
      },
      { status: 500 }
    );
  }
}