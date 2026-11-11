import "server-only";

type TokenEntry = { token: string; expiresAt: number };
let cached: TokenEntry | null = null;
let pending: Promise<string> | null = null;
let cachedKey = "";

export async function getDataverseToken(): Promise<string> {
  const tenant = process.env.DATAVERSE_TENANT_ID;
  const client = process.env.DATAVERSE_CLIENT_ID;
  const secret = process.env.DATAVERSE_CLIENT_SECRET;
  const base = process.env.DATAVERSE_URL?.replace(/\/$/, "");
  if (!tenant || !client || !secret || !base) throw new Error("Dataverse configuration missing");
  const key = `${tenant}|${client}|${base}`;
  if (key !== cachedKey) { cached = null; pending = null; cachedKey = key; }
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  if (pending) return pending;
  const request = (async () => {
    const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials", client_id: client, client_secret: secret,
        scope: `${base}/.default`,
      }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Dataverse authentication failed: ${response.status}`);
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("access_token" in data) ||
        typeof data.access_token !== "string") throw new Error("Dataverse access token missing");
    const expiresIn = "expires_in" in data && typeof data.expires_in === "number" ? data.expires_in : 300;
    cached = { token: data.access_token, expiresAt: Date.now() + Math.max(0, expiresIn - 120) * 1000 };
    return data.access_token;
  })();
  pending = request;
  try { return await request; } finally { if (pending === request) pending = null; }
}
