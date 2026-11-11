export type PlanKey = "one" | "two" | "three";

export type PricingOption = {
  subscriptionType: string;
  subscriptionPrice: number;
};

const TYPES: Record<PlanKey, string> = {
  one: "One Pet",
  two: "Two Pets",
  three: "Three or More Pets",
};

const PLAN_MINIMUMS: Record<PlanKey, number> = {
  one: 1,
  two: 2,
  three: 3,
};

export function pricingPartner(): string {
  const partner = process.env.PRICING_PARTNER_NAME?.trim();

  if (!partner) {
    throw new Error("PRICING_PARTNER_NAME is not configured.");
  }

  return partner;
}

function unwrapPricingResponse(value: unknown): any {
  let result: any = value;

  for (let i = 0; i < 6; i++) {
    if (typeof result === "string") {
      result = JSON.parse(result);
      continue;
    }

    if (!result || typeof result !== "object") {
      break;
    }

    if (
      result.statusCode !== undefined &&
      Number(result.statusCode) !== 200
    ) {
      throw new Error(
        `Pricing API reported status ${result.statusCode}.`
      );
    }

    if (result.body !== undefined) {
      result = result.body;
      continue;
    }

    break;
  }

  return result;
}

function normalizeSubscriptionType(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");

  if (
    normalized === "3 or more pets" ||
    normalized === "three or more pets"
  ) {
    return "Three or More Pets";
  }

  if (normalized === "one pet") return "One Pet";
  if (normalized === "two pets") return "Two Pets";

  return value.trim();
}

export async function getPricing(): Promise<
  Record<PlanKey, { type: string; price: string; minimum: number }>
> {
  const url = process.env.GET_PRICE_URL?.trim();
  const key = process.env.GET_PRICE_SUBSCRIPTION_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "GET_PRICE_URL or GET_PRICE_SUBSCRIPTION_KEY is missing."
    );
  }

  const target = new URL(url);

  if (
    target.protocol !== "https:" ||
    target.hostname !== "exouzamaxapis.azure-api.net"
  ) {
    throw new Error("Unexpected pricing API host.");
  }

  const response = await fetch(target.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
    },
    body: JSON.stringify({
      partnerName: pricingPartner(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(
      `Pricing API returned HTTP ${response.status}.`
    );
  }

  const raw = await response.json();
  const body = unwrapPricingResponse(raw);

  const options = body?.subscriptionOptions;

  if (!Array.isArray(options)) {
    throw new Error(
      "Pricing API returned no subscription options."
    );
  }

  const result = {} as Record<
    PlanKey,
    { type: string; price: string; minimum: number }
  >;

  for (const key of ["one", "two", "three"] as PlanKey[]) {
    const type = TYPES[key];

    const matches = options.filter(
      (item: PricingOption) =>
        typeof item?.subscriptionType === "string" &&
        normalizeSubscriptionType(item.subscriptionType) === type
    );

    if (matches.length !== 1) {
      throw new Error(
        `Missing or duplicate price for ${type}.`
      );
    }

    const value = matches[0].subscriptionPrice;

    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0 ||
      !Number.isInteger(Math.round(value * 100)) ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.000001
    ) {
      throw new Error(
        `Invalid price for ${type}.`
      );
    }

    result[key] = {
      type,
      price: value.toFixed(2),
      minimum: PLAN_MINIMUMS[key],
    };
  }

  return result;
}
