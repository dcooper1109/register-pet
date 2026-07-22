import Stripe from "stripe";
import { headers } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type StripeUpdatePayload = {
  eventId: string;
  eventType: string;

  registrationToken: string;
  paymentRecordId: string;
  memberSubID: string;

  stripeCheckoutId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionStatus: string;
  stripePaymentStatus: string;

  stripeInvoiceId: string;

  stripePaymentMethodId?: string;
  stripePaymentMethodType?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpirationMonth?: number | null;
  cardExpirationYear?: number | null;
  cardFingerprint?: string;
};

function getStripeId(
  value: string | { id: string } | null | undefined
): string {
  if (!value) {
    return "";
  }

  return typeof value === "string" ? value : value.id;
}

async function sendStripeUpdate(payload: StripeUpdatePayload) {
  const updateUrl = process.env.APIM_UPDATE_PAYMENT_RECORD_URL;
  const updateKey = process.env.APIM_UPDATE_PAYMENT_RECORD_KEY;

  if (!updateUrl) {
    throw new Error(
      "STRIPE_PAYMENT_UPDATE_URL is missing from the environment variables."
    );
  }

  if (!updateKey) {
    throw new Error(
      "STRIPE_PAYMENT_UPDATE_KEY is missing from the environment variables."
    );
  }

  const response = await fetch(updateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": updateKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Stripe update API returned ${response.status}: ${errorText}`
    );
  }
}

export async function POST(req: Request) {
  const body = await req.text();

  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return new Response("Missing signature", {
      status: 400,
    });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is missing.");

    return new Response("Webhook configuration error", {
      status: 500,
    });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    console.error("Invalid Stripe webhook signature:", err);

    return new Response("Invalid signature", {
      status: 400,
    });
  }

  console.log("Webhook Event:", event.type);
  console.log("Webhook Event ID:", event.id);

  try {
    switch (event.type) {
      /*
       * The Checkout Session gives you:
       * - Checkout Session ID
       * - Customer ID
       * - Subscription ID
       * - Checkout payment status
       */
      case "checkout.session.completed": {
        const session =
          event.data.object as Stripe.Checkout.Session;

        const metadata = session.metadata ?? {};

        let subscriptionStatus = "";

        const subscriptionId = getStripeId(
          session.subscription
        );

        if (subscriptionId) {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);

          subscriptionStatus = subscription.status;
        }

        const payload: StripeUpdatePayload = {
          eventId: event.id,
          eventType: event.type,

          registrationToken:
            metadata.registrationToken ?? "",

          paymentRecordId:
            metadata.paymentRecordId ?? "",

          memberSubID:
            metadata.memberSubID ?? "",

          stripeCheckoutId: session.id,

          stripeCustomerId: getStripeId(
            session.customer
          ),

          stripeSubscriptionId: subscriptionId,

          stripeSubscriptionStatus:
            subscriptionStatus,

          stripePaymentStatus:
            session.payment_status,

          stripeInvoiceId:
            getStripeId(session.invoice),
        };

        console.log(
          "Checkout update payload:",
          JSON.stringify(payload, null, 2)
        );

        await sendStripeUpdate(payload);

        break;
      }

      /*
       * Subscription events give you:
       * - Customer ID
       * - Subscription ID
       * - Subscription status
       *
       * These events also contain the metadata that you showed.
       */
      case "customer.subscription.paused":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription =
          event.data.object as Stripe.Subscription;

        const metadata = subscription.metadata ?? {};

        const latestInvoiceId = getStripeId(
          subscription.latest_invoice
        );

        let paymentStatus = "";

        if (latestInvoiceId) {
          const invoice =
            await stripe.invoices.retrieve(latestInvoiceId);

          paymentStatus = invoice.status ?? "";
        }

        const payload: StripeUpdatePayload = {
          eventId: event.id,
          eventType: event.type,

          registrationToken:
            metadata.registrationToken ?? "",

          paymentRecordId:
            metadata.paymentRecordId ?? "",

          memberSubID:
            metadata.memberSubID ?? "",

          stripeCheckoutSessionId: "",

          stripeCustomerId:
            getStripeId(subscription.customer),

          stripeSubscriptionId:
            subscription.id,

          stripeSubscriptionStatus:
            subscription.status,

          stripePaymentStatus:
            paymentStatus,

          stripeInvoiceId:
            latestInvoiceId,
        };

        console.log(
          "Subscription update payload:",
          JSON.stringify(payload, null, 2)
        );

        await sendStripeUpdate(payload);

        break;
      }

      /*
       * Invoice events tell you whether the initial or recurring
       * subscription payment succeeded or failed.
       */
      case "invoice.paid":
      case "invoice.payment_failed":
      case "invoice.payment_action_required": {
        const invoice =
          event.data.object as Stripe.Invoice;

        const subscriptionDetails =
          invoice.parent?.type === "subscription_details"
            ? invoice.parent.subscription_details
            : null;

        const subscriptionId = getStripeId(
          subscriptionDetails?.subscription
        );

        let subscription: Stripe.Subscription | null = null;

        if (subscriptionId) {
          subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
        }

        const metadata =
          subscription?.metadata ??
          invoice.metadata ??
          {};

        const paymentStatus =
          event.type === "invoice.paid"
            ? "paid"
            : event.type === "invoice.payment_action_required"
              ? "action_required"
              : "payment_failed";

        const payload: StripeUpdatePayload = {
          eventId: event.id,
          eventType: event.type,

          registrationToken:
            metadata.registrationToken ?? "",

          paymentRecordId:
            metadata.paymentRecordId ?? "",

          memberSubID:
            metadata.memberSubID ?? "",

          stripeCheckoutId: "",

          stripeCustomerId: getStripeId(
            invoice.customer
          ),

          stripeSubscriptionId:
            subscriptionId,

          stripeSubscriptionStatus:
            subscription?.status ?? "",

          stripePaymentStatus:
            paymentStatus,

          stripeInvoiceId:
            invoice.id,
        };

        console.log(
          "Invoice update payload:",
          JSON.stringify(payload, null, 2)
        );

        await sendStripeUpdate(payload);

        break;
      }

      case "payment_method.updated":
      case "payment_method.automatically_updated": {
        const paymentMethod =
          event.data.object as Stripe.PaymentMethod;

        const customerId = getStripeId(
          paymentMethod.customer
        );

        /*
        * PaymentMethod metadata usually won't contain your
        * registrationToken, paymentRecordId, or memberSubID.
        *
        * Your APIM flow should locate the payment record using
        * stripeCustomerId.
        */
        const payload: StripeUpdatePayload = {
          eventId: event.id,
          eventType: event.type,

          registrationToken: "",
          paymentRecordId: "",
          memberSubID: "",

          stripeCheckoutId: "",

          stripeCustomerId:
            customerId,

          stripeSubscriptionId: "",

          stripeSubscriptionStatus: "",

          stripePaymentStatus: "",

          stripeInvoiceId: "",

          stripePaymentMethodId:
            paymentMethod.id,

          stripePaymentMethodType:
            paymentMethod.type,

          cardBrand:
            paymentMethod.card?.brand ?? "",

          cardLast4:
            paymentMethod.card?.last4 ?? "",

          cardExpirationMonth:
            paymentMethod.card?.exp_month ?? null,

          cardExpirationYear:
            paymentMethod.card?.exp_year ?? null,

          cardFingerprint:
            paymentMethod.card?.fingerprint ?? "",
        };

        console.log(
          "Payment method update payload:",
          JSON.stringify(payload, null, 2)
        );

        await sendStripeUpdate(payload);

        break;
      }

      default:
        console.log(
          `Stripe event not currently handled: ${event.type}`
        );
    }

    return Response.json({
      received: true,
      eventId: event.id,
      eventType: event.type,
    });
  } catch (err) {
    console.error(
      `Error processing Stripe event ${event.id}:`,
      err
    );

    /*
     * Returning 500 tells Stripe that processing failed.
     * Stripe can then retry delivery.
     */
    return Response.json(
      {
        received: false,
        eventId: event.id,
        eventType: event.type,
        error:
          err instanceof Error
            ? err.message
            : "Webhook processing failed.",
      },
      {
        status: 500,
      }
    );
  }
}