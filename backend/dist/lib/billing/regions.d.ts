import { BillingRegion } from "@prisma/client";
declare const AFRICA_COUNTRIES: Set<string>;
declare const EUROPE_COUNTRIES: Set<string>;
export declare function countryToRegion(countryCode: string | null | undefined): BillingRegion;
export declare const REGION_DEFAULTS: Record<BillingRegion, {
    currency: string;
    currencies: string[];
}>;
export declare function isValidCountryCode(code: string): boolean;
export declare function getDefaultCurrencyForCountry(countryCode: string | null | undefined): string | null;
export { AFRICA_COUNTRIES, EUROPE_COUNTRIES };
//# sourceMappingURL=regions.d.ts.map