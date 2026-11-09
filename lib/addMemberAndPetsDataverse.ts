import "server-only";
import { randomUUID } from "node:crypto";

type Pet = {
  petName: string;
  petSpecies: string;
  petBreed?: string;
  petSex?: string;
};

export type AddMemberInput = {
  partnerName: string;
  affinityGroup: string;
  subscriptionType: string;
  subscriptionPrice: string | number;
  subscriptionStatus: string;
  memberFirst: string;
  memberLast: string;
  memberEmail: string;
  memberSubID: string;
  registrationToken: string;
  mobilePhone?: string;
  pets: Pet[];
  termsAccepted: boolean;
  termsVersion: string;
  termsAcceptedAt?: string;
  termsAcceptanceIp?: string;
  termsAcceptanceSource?: string;
};

function escapeOData(value: string) {
  return value.replace(/'/g, "''");
}

function requireGuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid Dataverse record ID");
  }
  return value;
}

async function json(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid Dataverse JSON: HTTP ${response.status}`);
  }
}

export async function addMemberAndPetsDataverse(
  input: AddMemberInput
): Promise<Record<string, unknown>> {
  const started = performance.now();

  if (process.env.VERCEL_ENV !== "preview") {
    throw new Error("Direct Add Member is permitted in Preview only");
  }

  const tenant = process.env.DATAVERSE_TENANT_ID;
  const client = process.env.DATAVERSE_CLIENT_ID;
  const secret = process.env.DATAVERSE_CLIENT_SECRET;
  const base = process.env.DATAVERSE_URL?.replace(/\/$/, "");

  if (!tenant || !client || !secret || !base) {
    throw new Error("Dataverse configuration missing");
  }

  if (
    !input.memberFirst?.trim() ||
    !input.memberLast?.trim() ||
    !input.memberEmail?.trim() ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.memberSubID) ||
    input.registrationToken !== input.memberSubID ||
    input.subscriptionStatus !== "Pending" ||
    input.termsAccepted !== true ||
    !input.termsVersion?.trim() ||
    !Array.isArray(input.pets) ||
    input.pets.length < 1 ||
    input.pets.length > 15
  ) {
    throw new Error("Invalid Add Member input");
  }

  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: client,
        client_secret: secret,
        scope: `${base}/.default`,
      }),
      cache: "no-store",
    }
  );

  if (!tokenResponse.ok) {
    throw new Error(`Dataverse authentication failed: ${tokenResponse.status}`);
  }

  const token = (await json(tokenResponse)).access_token;
  if (typeof token !== "string") {
    throw new Error("Dataverse access token missing");
  }

  const api = `${base}/api/data/v9.2`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "OData-Version": "4.0",
    "OData-MaxVersion": "4.0",
  };

  // Match the existing Power Automate duplicate-email check.
  const emailUrl = new URL(`${api}/contacts`);
  emailUrl.searchParams.set("$select", "contactid,statecode");
  emailUrl.searchParams.set(
    "$filter",
    `emailaddress1 eq '${escapeOData(input.memberEmail)}'`
  );
  emailUrl.searchParams.set("$top", "2");

  const emailResponse = await fetch(emailUrl, {
    headers,
    cache: "no-store",
  });

  if (!emailResponse.ok) {
    throw new Error(`Contact lookup failed: ${emailResponse.status}`);
  }

  const contacts = (await json(emailResponse)).value ?? [];

  if (contacts.length > 0) {
    return {
      success: false,
      message:
        contacts.some((c: any) => c.statecode === 0)
          ? "Email Exists"
          : "Inactive User",
    };
  }

  const accountUrl = new URL(`${api}/accounts`);
  accountUrl.searchParams.set("$select", "accountid");
  accountUrl.searchParams.set(
    "$filter",
    `name eq '${escapeOData(input.partnerName)}'`
  );
  accountUrl.searchParams.set("$top", "2");

  const accountResponse = await fetch(accountUrl, {
    headers,
    cache: "no-store",
  });

  if (!accountResponse.ok) {
    throw new Error(`Partner lookup failed: ${accountResponse.status}`);
  }

  const accounts = (await json(accountResponse)).value ?? [];

  if (accounts.length === 0) {
    return { success: false, message: "Partner does not exist" };
  }

  if (accounts.length !== 1) {
    throw new Error("Multiple Partner Accounts matched");
  }

  const accountId = requireGuid(accounts[0].accountid);
  const contactId = randomUUID();

  const contact = {
    contactid: contactId,
    new_contacttype: 100000006,
    lastname: input.memberLast,
    "parentcustomerid_account@odata.bind": `/accounts(${accountId})`,
    emailaddress1: input.memberEmail,
    firstname: input.memberFirst,
    mobilephone: input.mobilePhone || null,
    new_state: 100000014,
    new_accesstoadvantagex: true,
    new_affinitygroup: input.affinityGroup,
    new_petsubscriptionid: input.memberSubID,
    new_subscriptionstatus: input.subscriptionStatus,
    new_subscriptiontype: input.subscriptionType,
    new_termsaccepted: true,
    new_termsacceptedat: input.termsAcceptedAt || new Date().toISOString(),
    new_termsacceptedip: input.termsAcceptanceIp || "",
    new_termsacceptedsource: input.termsAcceptanceSource || "register-pet",
    new_termsversion: input.termsVersion,
  };

  const batchBoundary = `batch_${randomUUID().replace(/-/g, "")}`;
  const changeBoundary = `changeset_${randomUUID().replace(/-/g, "")}`;
  const CRLF = "\r\n";

  const operations: Array<{ entitySet: string; body: object }> = [
    { entitySet: "contacts", body: contact },
    ...input.pets.map((pet) => ({
      entitySet: "new_auctionpetinfos",
      body: {
        new_name: pet.petName,
        new_petbreed: pet.petBreed || "",
        "new_PetOwner@odata.bind": `/contacts(${contactId})`,
        new_petownername1: `${input.memberFirst} ${input.memberLast}`,
        ...(pet.petSex ? { new_petsex: pet.petSex } : {}),
        new_petspecies: pet.petSpecies,
        new_subscriptionstatus: 100000000,
      },
    })),
  ];

  // A Dataverse changeset is atomic: all writes succeed or none commit.
  let body = `--${batchBoundary}${CRLF}`;
  body += `Content-Type: multipart/mixed; boundary=${changeBoundary}${CRLF}${CRLF}`;

  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i];

    body += `--${changeBoundary}${CRLF}`;
    body += `Content-Type: application/http${CRLF}`;
    body += `Content-Transfer-Encoding: binary${CRLF}`;
    body += `Content-ID: ${i + 1}${CRLF}${CRLF}`;
    body += `POST ${api}/${operation.entitySet} HTTP/1.1${CRLF}`;
    body += `Content-Type: application/json; charset=utf-8${CRLF}`;
    body += `Accept: application/json${CRLF}${CRLF}`;
    body += `${JSON.stringify(operation.body)}${CRLF}`;
  }

  body += `--${changeBoundary}--${CRLF}`;
  body += `--${batchBoundary}--${CRLF}`;

  const batchResponse = await fetch(`${api}/$batch`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": `multipart/mixed; boundary=${batchBoundary}`,
    },
    body,
    cache: "no-store",
  });

  const batchText = await batchResponse.text();

  // A batch can return HTTP 200 even when an operation inside it failed.
  // Check the embedded HTTP statuses as well.
  const embeddedStatuses = [
    ...batchText.matchAll(/^HTTP\/1\.[01]\s+(\d{3})/gim),
  ].map((match) => Number(match[1]));

  const successful =
    batchResponse.ok &&
    embeddedStatuses.length === operations.length &&
    embeddedStatuses.every(
      (status) => status === 201 || status === 204
    );

  if (!successful) {
    console.error("[PVR DATAVERSE ADD MEMBER BATCH FAILED]", {
      outerStatus: batchResponse.status,
      embeddedStatuses,
      expectedOperations: operations.length,
      responseExcerpt: batchText.slice(0, 1500),
    });

    throw new Error("Dataverse Contact/Pet transaction failed");
  }

  console.log(
    "[PVR DATAVERSE TIMING]",
    JSON.stringify({
      operation: "add-member-and-pets",
      petCount: input.pets.length,
      elapsedMs: Math.round(performance.now() - started),
    })
  );

  return {
    success: true,
    results: `Member (${input.memberSubID}) and pet(s) have been successfully registered.`,
    registrationToken: input.registrationToken,
    subscriptionType: input.subscriptionType,
    subscriptionPrice: input.subscriptionPrice,
  };
}
