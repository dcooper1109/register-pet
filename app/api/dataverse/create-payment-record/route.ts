import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.DATAVERSE_TEST_SECRET;
  const supplied = request.headers.get("x-test-secret");

  if (!expected || !supplied) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const started = performance.now();

  if (!authorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const memberSubID = body?.memberSubID;

    if (
      typeof memberSubID !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(memberSubID)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid memberSubID" },
        { status: 400 }
      );
    }

    const tenantId = process.env.DATAVERSE_TENANT_ID;
    const clientId = process.env.DATAVERSE_CLIENT_ID;
    const clientSecret = process.env.DATAVERSE_CLIENT_SECRET;
    const dataverseUrl = process.env.DATAVERSE_URL?.replace(/\/$/, "");

    if (!tenantId || !clientId || !clientSecret || !dataverseUrl) {
      return NextResponse.json(
        { success: false, error: "Dataverse configuration missing" },
        { status: 500 }
      );
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

    const tokenData = await tokenResponse.json();
    const tokenMs = Math.round(performance.now() - tokenStarted);

    if (!tokenResponse.ok || !tokenData.access_token) {
      return NextResponse.json(
        {
          success: false,
          stage: "Entra authentication",
          status: tokenResponse.status,
          entraError: tokenData.error,
          entraErrorCode: tokenData.error_codes?.[0] ?? null,
          tokenMs,
        },
        { status: 502 }
      );
    }

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
      "OData-Version": "4.0",
      "OData-MaxVersion": "4.0",
    };

    const contactStarted = performance.now();

    const contactQuery = new URL(
      `${dataverseUrl}/api/data/v9.2/contacts`
    );
    contactQuery.searchParams.set(
      "$select",
      "contactid,lastname,new_petsubscriptionid,_parentcustomerid_value"
    );
    contactQuery.searchParams.set(
      "$filter",
      `new_petsubscriptionid eq '${memberSubID}'`
    );
    contactQuery.searchParams.set("$top", "2");

    const contactResponse = await fetch(contactQuery, {
      headers,
      cache: "no-store",
    });

    const contactData = await contactResponse.json();
    const contactMs = Math.round(performance.now() - contactStarted);

    if (!contactResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          stage: "Contact lookup",
          status: contactResponse.status,
          tokenMs,
          contactMs,
        },
        { status: 502 }
      );
    }

    if (contactData.value?.length !== 1) {
      return NextResponse.json(
        {
          success: false,
          stage: "Contact lookup",
          error:
            contactData.value?.length === 0
              ? "Contact not found"
              : "Multiple Contacts found",
          tokenMs,
          contactMs,
        },
        { status: 404 }
      );
    }

    const contact = contactData.value[0];

    const paymentStarted = performance.now();

    const paymentQuery = new URL(
      `${dataverseUrl}/api/data/v9.2/new_auctionpetregistrationpayments`
    );
    paymentQuery.searchParams.set(
      "$select",
      "new_auctionpetregistrationpaymentid"
    );
    paymentQuery.searchParams.set(
      "$filter",
      `new_membersubid eq '${memberSubID}'`
    );
    paymentQuery.searchParams.set("$top", "2");

    const paymentResponse = await fetch(paymentQuery, {
      headers,
      cache: "no-store",
    });

    const paymentData = await paymentResponse.json();
    const paymentMs = Math.round(performance.now() - paymentStarted);

    if (!paymentResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          stage: "Payment lookup",
          status: paymentResponse.status,
          tokenMs,
          contactMs,
          paymentMs,
        },
        { status: 502 }
      );
    }

    if (paymentData.value?.length > 1) {
      return NextResponse.json(
        {
          success: false,
          stage: "Payment lookup",
          error: "Multiple Payment Records found",
          tokenMs,
          contactMs,
          paymentMs,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      readOnly: true,
      contactFound: true,
      partnerAccountAssigned: Boolean(
        contact._parentcustomerid_value
      ),
      paymentRecordExists: paymentData.value.length === 1,
      paymentRecordId:
        paymentData.value[0]?.new_auctionpetregistrationpaymentid ?? null,
      timings: {
        tokenMs,
        contactMs,
        paymentMs,
        totalMs: Math.round(performance.now() - started),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Dataverse test failed" },
      { status: 500 }
    );
  }
}
