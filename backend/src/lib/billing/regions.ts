import { BillingRegion } from "@prisma/client";

// ISO 3166-1 alpha-2 → BillingRegion mapping
// Source: African Union member states, EU/EEA/UK, everything else → ROW

const AFRICA_COUNTRIES = new Set([
  "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ",
  "EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG",
  "MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO",
  "ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW",
]);

const EUROPE_COUNTRIES = new Set([
  // EU member states
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  // EEA
  "IS","LI","NO",
  // UK (post-Brexit but still European billing region)
  "GB",
  // Switzerland
  "CH",
]);

export function countryToRegion(countryCode: string | null | undefined): BillingRegion {
  if (!countryCode) return BillingRegion.ROW;
  const code = countryCode.toUpperCase().trim();
  if (AFRICA_COUNTRIES.has(code)) return BillingRegion.AFRICA;
  if (EUROPE_COUNTRIES.has(code)) return BillingRegion.EUROPE;
  return BillingRegion.ROW;
}

export const REGION_DEFAULTS: Record<BillingRegion, { currency: string; currencies: string[] }> = {
  AFRICA: { currency: "USD", currencies: ["USD", "NGN", "KES", "GHS", "ZAR"] },
  EUROPE: { currency: "EUR", currencies: ["EUR", "GBP", "CHF"] },
  ROW:    { currency: "USD", currencies: ["USD"] },
};

const COUNTRY_DEFAULT_CURRENCY: Record<string, string> = {
  NG: "NGN",
};

export function isValidCountryCode(code: string): boolean {
  const upper = code.toUpperCase().trim();
  return AFRICA_COUNTRIES.has(upper) || EUROPE_COUNTRIES.has(upper) || upper.length === 2;
}

export function getDefaultCurrencyForCountry(countryCode: string | null | undefined): string | null {
  if (!countryCode) {
    return null;
  }

  return COUNTRY_DEFAULT_CURRENCY[countryCode.toUpperCase().trim()] ?? null;
}

export { AFRICA_COUNTRIES, EUROPE_COUNTRIES };
