import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_MEMBER_SUB_ID = "PRX1793991997997b85532bf4c39";

type PaymentInput = {
  memberSubID: string;
  registrationToken: string;
  memberEmail: string;
  affinityGroup: string;
  subscriptionType: string;
  subscriptionPrice: string | number;
  paymentTrackingStatus: string;
  stripePaymentStatus: string;
  stripeSubscriptionId: string;
  stripeSubscriptionStatus: string;
};

function authorized(request: Request): boolean {
  const expected = process.env.DATAVERSE_TEST_SECRET;
  const supplied = request.headers.get("x-test-secret");

  if (!expected || !supplied) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);

  return a.length === b.length && timingSafeEqual(a, b);
}

function easternTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return (
    `${part("month")}/${part("day")}/${part("year")} ` +
    `${part("hour")}:${part("minute")} ${part("dayPeriod")}`
  );
}

export async function POST(request: Request) {
  const started = performance.now();

  // This test endpoint must never create records in Production.
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json(
      { success: false, error: "Preview environment only" },
      { status: 403 }
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as Partial<PaymentInput>;

    if (body.memberSubID !== TEST_MEMBER_SUB_ID) {
      return NextResponse.json(
        { success: false, error: "Test Contact only" },
        { status: 403 }
      );
    }

    const requiredStrings = [
      "registrationToken",
      "memberEmail",
      "subscriptionType",
      "paymentTrackingStatus",
    ] as const;

    if (
      requiredStrings.some(
        (key) =>
          typeof body[key] !== "string" ||
          !body[key]?.trim()
      )
    ) {
      return NextResponse.json(
        { success: false, error: "Required fields missing" },
        { status: 400 }
      );
    }

    const price = Number(
      String(body.subscriptionPrice ?? "")
        .replace(/\$/g, "")
        .replace(/,/g, "")
        .trim()
    );

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid subscriptionPrice" },
        { status: 400 }
      );
    }

    const tenantId = process.env.DATAVERSE_TENANT_ID;
    const clientId = process.env.DATAVERSE_CLIENT_ID;
    const clientSecret = process.env.DATAVERSE_CLIENT_SECRET;
    const dataverseUrl = process.env.DATAVERSE_URL?.replace(/\/$/, "");

    if (!tenantId || !clientId || !clientSecret || !dataverseUrl) {
      throw new Error("Dataverse configuration missing");
    }

    const tokenStarted = performance.now();

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: `${dataverseUrl}/.default`,
        }),
        cache: "no-store",
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(`Entra authentication: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const tokenMs = Math.round(performance.now() - tokenStarted);

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-Version": "4.0",
      "OData-MaxVersion": "4.0",
    };

    const contactStarted = performance.now();

    const contactUrl = new URL(
      `${dataverseUrl}/api/data/v9.2/contacts`
    );
    contactUrl.searchParams.set(
      "$select",
      "contactid,lastname,new_petsubscriptionid,_parentcustomerid_value,statecode"
    );
    contactUrl.searchParams.set(
      "$filter",
      `new_petsubscriptionid eq '${TEST_MEMBER_SUB_ID}'`
    );
    contactUrl.searchParams.set("$top", "2");

    const contactResponse = await fetch(contactUrl, {
      headers,
      cache: "no-store",
    });

    if (!contactResponse.ok) {
      throw new Error(`Contact lookup: ${contactResponse.status}`);
    }

    const contactData = await contactResponse.json();
    const contactMs = Math.round(performance.now() - contactStarted);

    if (contactData.value?.length !== 1) {
      throw new Error("Expected exactly one Contact");
    }

    const contact = contactData.value[0];

    if (contact.statecode !== 0) {
      throw new Error("Contact is not active");
    }

    if (!contact._parentcustomerid_value) {
      throw new Error("Partner Account missing");
    }

    const paymentStarted = performance.now();

    const paymentUrl = new URL(
      `${dataverseUrl}/api/data/v9.2/new_auctionpetregistrationpayments`
    );
    paymentUrl.searchParams.set(
      "$select",
      "new_auctionpetregistrationpaymentid"
    );
    paymentUrl.searchParams.set(
      "$filter",
      `new_membersubid eq '${TEST_MEMBER_SUB_ID}'`
    );
    paymentUrl.searchParams.set("$top", "2");

    const paymentResponse = await fetch(paymentUrl, {
      headers,
      cache: "no-store",
    });

    if (!paymentResponse.ok) {
      throw new Error(`Payment lookup: ${paymentResponse.status}`);
    }

    const paymentData = await paymentResponse.json();
    const paymentMs = Math.round(performance.now() - paymentStarted);

    if (paymentData.value.length > 1) {
      throw new Error("Duplicate Payment Records detected");
    }

    if (paymentData.value.length === 1) {
      return NextResponse.json({
        success: true,
        created: false,
        paymentRecordId:
          paymentData.value[0].new_auctionpetregistrationpaymentid,
        timings: {
          tokenMs,
          contactMs,
          paymentMs,
          createMs: 0,
          totalMs: Math.round(performance.now() - started),
        },
      });
    }

    const createStarted = performance.now();

    const record = {
      new_name:
        `${contact.lastname ?? ""}${TEST_MEMBER_SUB_ID}-` +
        easternTimestamp(),
      new_affinitygroup: body.affinityGroup ?? "",
      new_initialpaymentstatus: "unpaid",
      new_memberemail: body.memberEmail,
      "new_MemberName@odata.bind": `/contacts(${contact.contactid})`,
      new_membersubid: TEST_MEMBER_SUB_ID,
      "new_PartnerName@odata.bind":
        `/accounts(${contact._parentcustomerid_value})`,
      new_paymenttrackingstatus: body.paymentTrackingStatus,
      new_registrationtoken: body.registrationToken,
      new_stripepaymentstatus: body.stripePaymentStatus ?? "",
      new_stripesubscriptionid: body.stripeSubscriptionId ?? "",
      new_stripesubscriptionstatus:
        body.stripeSubscriptionStatus ?? "",
      new_subscriptionprice: price,
      new_subscriptiontype: body.subscriptionType,
    };

    const createResponse = await fetch(
      `${dataverseUrl}/api/data/v9.2/new_auctionpetregistrationpayments`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation",
        },
        body: JSON.stringify(record),
        cache: "no-store",
      }
    );

    const createText = await createResponse.text();
    const createMs = Math.round(performance.now() - createStarted);

    if (!createResponse.ok) {
      console.error(
        "[Dataverse payment test] Create failed",
        createResponse.status,
        createText.slice(0, 2000)
      );
      return NextResponse.json(
        {
          success: false,
          stage: "Payment creation",
          status: createResponse.status,
          timings: { tokenMs, contactMs, paymentMs, createMs },
        },
        { status: 502 }
      );
    }

    const created = JSON.parse(createText);
    const paymentRecordId =
      created.new_auctionpetregistrationpaymentid;

    if (!paymentRecordId) {
      throw new Error("Created record ID missing");
    }

    return NextResponse.json({
      success: true,
      created: true,
      paymentRecordId,
      timings: {
        tokenMs,
        contactMs,
        paymentMs,
        createMs,
        totalMs: Math.round(performance.now() - started),
      },
    });
  } catch (error) {
    console.error(
      "[Dataverse payment test]",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      { success: false, error: "Dataverse operation failed" },
      { status: 500 }
    );
  }
}
