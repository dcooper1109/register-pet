export type PlanKey = "one" | "two" | "three";
export type PricingOption = { subscriptionType: string; subscriptionPrice: number };

const TYPES: Record<PlanKey, string> = {
  one: "One Pet", two: "Two Pets", three: "Three or More Pets"
};

export function pricingPartner(): string {
  const partner = process.env.PRICING_PARTNER_NAME?.trim();
  if (!partner) throw new Error("PRICING_PARTNER_NAME is not configured.");
  return partner;
}

export async function getPricing(): Promise<Record<PlanKey, { type: string; price: string; minimum: number }>> {
  const url = process.env.GET_PRICE_URL;
  const key = process.env.GET_PRICE_SUBSCRIPTION_KEY;
  if (!url || !key) throw new Error("GET_PRICE_URL or GET_PRICE_SUBSCRIPTION_KEY is missing.");
  const target = new URL(url);
  if (target.protocol !== "https:" || target.hostname !== "exouzamaxapis.azure-api.net") {
    throw new Error("Unexpected pricing API host.");
  }
  const response = await fetch(target.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key
    },
    body: JSON.stringify({ partnerName: pricingPartner() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Pricing API returned HTTP ${response.status}.`);
  const raw = await response.json();
  let body: any = raw?.body ?? raw;
  if (typeof body === "string") body = JSON.parse(body);
  if (raw?.statusCode && Number(raw.statusCode) !== 200) throw new Error("Pricing API reported an error.");
  const options = body?.subscriptionOptions;
  if (!Array.isArray(options)) throw new Error("Pricing API returned no subscription options.");
  const result = {} as Record<PlanKey, { type: string; price: string; minimum: number }>;
  for (const [key, type, minimum] of [["one", TYPES.one, 1], ["two", TYPES.two, 2], ["three", TYPES.three, 3]] as const) {
    const matches = options.filter((item: PricingOption) => item?.subscriptionType === type);
    if (matches.length !== 1) throw new Error(`Missing or duplicate price for ${type}.`);
    const value = matches[0].subscriptionPrice;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || Math.round(value * 100) !== value * 100) {
      throw new Error(`Invalid price for ${type}.`);
    }
    result[key] = { type, price: value.toFixed(2), minimum };
  }
  return result;
}
