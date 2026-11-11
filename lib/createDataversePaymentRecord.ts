import "server-only";
import { getDataverseToken } from "@/lib/dataverseAuth";

export type DirectPaymentInput = {
  registrationToken: string;
  memberSubID: string;
  memberEmail: string;
  subscriptionType: string;
  subscriptionPrice: string | number;
  partnerName: string;
  affinityGroup: string;
  trustedContact?: { contactId: string; accountId: string; lastName: string };
};

type Contact = {
  contactid: string;
  lastname: string | null;
  statecode: number;
  _parentcustomerid_value: string | null;
  "_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"?:
    string;
};

type Payment = {
  new_auctionpetregistrationpaymentid: string;
};

const ENTITY_SET = "new_auctionpetregistrationpayments";

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

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return (
    `${get("month")}/${get("day")}/${get("year")} ` +
    `${get("hour")}:${get("minute")} ${get("dayPeriod")}`
  );
}

function requireGuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid Dataverse record ID");
  }
  return value;
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid Dataverse response: HTTP ${response.status}`);
  }
}

export async function createDataversePaymentRecord(
  input: DirectPaymentInput
): Promise<{ success: boolean; paymentRecordId: string }> {
  const started = performance.now();

  if (
    process.env.VERCEL_ENV !== "preview" &&
    process.env.VERCEL_ENV !== "production"
  ) {
    throw new Error("Direct Dataverse creation requires Vercel Preview or Production");
  }

  if (process.env.PAYMENT_RECORD_BACKEND !== "direct") {
    throw new Error("Direct Payment Record backend is not enabled");
  }

  const tenant = process.env.DATAVERSE_TENANT_ID;
  const client = process.env.DATAVERSE_CLIENT_ID;
  const secret = process.env.DATAVERSE_CLIENT_SECRET;
  const base = process.env.DATAVERSE_URL?.replace(/\/$/, "");

  if (!tenant || !client || !secret || !base) {
    throw new Error("Dataverse configuration missing");
  }

  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.memberSubID) ||
    !input.registrationToken?.trim() ||
    !input.memberEmail?.trim() ||
    !input.subscriptionType?.trim()
  ) {
    throw new Error("Invalid payment record input");
  }

  const price = Number(
    String(input.subscriptionPrice)
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .trim()
  );

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid subscription price");
  }

  const tokenStart = performance.now();

  const token = await getDataverseToken();
  const tokenMs = Math.round(performance.now() - tokenStart);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "OData-Version": "4.0",
    "OData-MaxVersion": "4.0",
    Prefer: "odata.include-annotations=\"Microsoft.Dynamics.CRM.lookuplogicalname\"",
  };

  const api = `${base}/api/data/v9.2`;

  const contactStart = performance.now();

  const contactUrl = new URL(`${api}/contacts`);
  contactUrl.searchParams.set(
    "$select",
    "contactid,lastname,statecode,_parentcustomerid_value"
  );
  contactUrl.searchParams.set(
    "$filter",
    `new_petsubscriptionid eq '${escapeOData(input.memberSubID)}'`
  );
  contactUrl.searchParams.set("$top", "2");

  let contactId: string;
  let accountId: string;
  let contactLastName: string | null = null;
  let contactMs = 0;
  if (input.trustedContact) {
    // Trusted context is supplied only after a one-time Redis handoff was consumed
    // and verified by the checkout route. Never accept these IDs from browser input.
    contactId = requireGuid(input.trustedContact.contactId);
    accountId = requireGuid(input.trustedContact.accountId);
    contactLastName = input.trustedContact.lastName;
  } else {
    const contactResponse = await fetch(contactUrl, { headers, cache: "no-store" });
    if (!contactResponse.ok) throw new Error(`Dataverse Contact lookup failed: ${contactResponse.status}`);
    const contactData = await readJson(contactResponse);
    const contacts: Contact[] = contactData.value ?? [];
    if (contacts.length !== 1) throw new Error("Expected exactly one matching Contact");
    const contact = contacts[0];
    if (contact.statecode !== 0) throw new Error("Contact is inactive");
    if (!contact._parentcustomerid_value) throw new Error("Contact has no Partner Account");
    const parentType = contact["_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"];
    if (parentType !== "account") throw new Error("Contact parent is not an Account");
    contactId = requireGuid(contact.contactid);
    accountId = requireGuid(contact._parentcustomerid_value);
    contactLastName = contact.lastname;
    contactMs = Math.round(performance.now() - contactStart);
  }

  const paymentStart = performance.now();

  async function findExisting(): Promise<string | null> {
    const url = new URL(`${api}/${ENTITY_SET}`);
    url.searchParams.set(
      "$select",
      "new_auctionpetregistrationpaymentid"
    );
    url.searchParams.set(
      "$filter",
      `new_membersubid eq '${escapeOData(input.memberSubID)}'`
    );
    url.searchParams.set("$top", "2");

    const response = await fetch(url, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Dataverse Payment lookup failed: ${response.status}`);
    }

    const data = await readJson(response);
    const payments: Payment[] = data.value ?? [];

    if (payments.length > 1) {
      throw new Error("Duplicate Payment Records detected");
    }

    return payments[0]?.new_auctionpetregistrationpaymentid ?? null;
  }

  const existing = await findExisting();
  const paymentMs = Math.round(performance.now() - paymentStart);

  if (existing) {
    console.log("[PVR DATAVERSE TIMING]", JSON.stringify({
      operation: "existing-payment",
      tokenMs,
      contactMs,
      paymentMs,
      createMs: 0,
      totalMs: Math.round(performance.now() - started),
    }));

    return { success: true, paymentRecordId: existing };
  }

  const createStart = performance.now();

  const record = {
    new_name:
      `${contactLastName ?? ""}${input.memberSubID}-` +
      easternTimestamp(),
    new_affinitygroup: input.affinityGroup ?? "",
    new_initialpaymentstatus: "unpaid",
    new_memberemail: input.memberEmail,
    "new_MemberName@odata.bind": `/contacts(${contactId})`,
    new_membersubid: input.memberSubID,
    "new_PartnerName@odata.bind": `/accounts(${accountId})`,
    new_paymenttrackingstatus: "Creating Checkout",
    new_registrationtoken: input.registrationToken,
    new_stripepaymentstatus: "unpaid",
    new_stripesubscriptionid: "",
    new_stripesubscriptionstatus: "",
    new_subscriptionprice: price,
    new_subscriptiontype: input.subscriptionType,
  };

  const createResponse = await fetch(`${api}/${ENTITY_SET}`, {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "return=representation",
    },
    body: JSON.stringify(record),
    cache: "no-store",
  });

  const createData = await readJson(createResponse);
  const createMs = Math.round(performance.now() - createStart);

  if (!createResponse.ok) {
    // The alternate key prevents concurrent duplicate creation.
    // If another request won the race, retrieve its record.
    if (createResponse.status === 409 || createResponse.status === 412) {
      const concurrentRecord = await findExisting();

      if (concurrentRecord) {
        return {
          success: true,
          paymentRecordId: concurrentRecord,
        };
      }
    }

    console.error("[PVR DATAVERSE CREATE ERROR]", {
      status: createResponse.status,
      code: createData?.error?.code,
    });

    throw new Error(`Dataverse Payment creation failed: ${createResponse.status}`);
  }

  const paymentRecordId =
    createData.new_auctionpetregistrationpaymentid;

  if (!paymentRecordId) {
    throw new Error("Dataverse created record but returned no ID");
  }

  console.log("[PVR DATAVERSE TIMING]", JSON.stringify({
    operation: "created-payment",
    tokenMs,
    contactMs,
    paymentMs,
    createMs,
    totalMs: Math.round(performance.now() - started),
  }));

  return {
    success: true,
    paymentRecordId: requireGuid(paymentRecordId),
  };
}
