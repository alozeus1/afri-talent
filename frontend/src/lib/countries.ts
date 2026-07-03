// Canonical country list for profile/job forms. Values are ISO 3166-1 alpha-2
// codes so they match Job.eligibleCountries exactly ("NG", "GLOBAL", …);
// names are display-only. African countries listed first for quicker selection.

export interface CountryOption {
  code: string;
  name: string;
}

export const AFRICAN_COUNTRIES: CountryOption[] = [
  { code: "DZ", name: "Algeria" }, { code: "AO", name: "Angola" },
  { code: "BJ", name: "Benin" }, { code: "BW", name: "Botswana" },
  { code: "BF", name: "Burkina Faso" }, { code: "BI", name: "Burundi" },
  { code: "CV", name: "Cabo Verde" }, { code: "CM", name: "Cameroon" },
  { code: "CF", name: "Central African Republic" }, { code: "TD", name: "Chad" },
  { code: "KM", name: "Comoros" }, { code: "CG", name: "Congo (Brazzaville)" },
  { code: "CD", name: "Congo (DRC)" }, { code: "CI", name: "Côte d'Ivoire" },
  { code: "DJ", name: "Djibouti" }, { code: "EG", name: "Egypt" },
  { code: "GQ", name: "Equatorial Guinea" }, { code: "ER", name: "Eritrea" },
  { code: "SZ", name: "Eswatini" }, { code: "ET", name: "Ethiopia" },
  { code: "GA", name: "Gabon" }, { code: "GM", name: "Gambia" },
  { code: "GH", name: "Ghana" }, { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" }, { code: "KE", name: "Kenya" },
  { code: "LS", name: "Lesotho" }, { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" }, { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" }, { code: "ML", name: "Mali" },
  { code: "MR", name: "Mauritania" }, { code: "MU", name: "Mauritius" },
  { code: "MA", name: "Morocco" }, { code: "MZ", name: "Mozambique" },
  { code: "NA", name: "Namibia" }, { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" }, { code: "RW", name: "Rwanda" },
  { code: "ST", name: "São Tomé and Príncipe" }, { code: "SN", name: "Senegal" },
  { code: "SC", name: "Seychelles" }, { code: "SL", name: "Sierra Leone" },
  { code: "SO", name: "Somalia" }, { code: "ZA", name: "South Africa" },
  { code: "SS", name: "South Sudan" }, { code: "SD", name: "Sudan" },
  { code: "TZ", name: "Tanzania" }, { code: "TG", name: "Togo" },
  { code: "TN", name: "Tunisia" }, { code: "UG", name: "Uganda" },
  { code: "ZM", name: "Zambia" }, { code: "ZW", name: "Zimbabwe" },
];

export const OTHER_COUNTRIES: CountryOption[] = [
  { code: "AR", name: "Argentina" }, { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" }, { code: "BD", name: "Bangladesh" },
  { code: "BE", name: "Belgium" }, { code: "BR", name: "Brazil" },
  { code: "BG", name: "Bulgaria" }, { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" }, { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" }, { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" }, { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" }, { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" }, { code: "FR", name: "France" },
  { code: "GE", name: "Georgia" }, { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" }, { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" }, { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" }, { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" }, { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" }, { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" }, { code: "KZ", name: "Kazakhstan" },
  { code: "KW", name: "Kuwait" }, { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" }, { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" }, { code: "MY", name: "Malaysia" },
  { code: "MT", name: "Malta" }, { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" }, { code: "NZ", name: "New Zealand" },
  { code: "NO", name: "Norway" }, { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" }, { code: "PA", name: "Panama" },
  { code: "PE", name: "Peru" }, { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" }, { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" }, { code: "RO", name: "Romania" },
  { code: "SA", name: "Saudi Arabia" }, { code: "RS", name: "Serbia" },
  { code: "SG", name: "Singapore" }, { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" }, { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" }, { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Sweden" }, { code: "CH", name: "Switzerland" },
  { code: "TH", name: "Thailand" }, { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" }, { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" }, { code: "VN", name: "Vietnam" },
];

/** "Worldwide (remote)" — stored as GLOBAL to match Job.eligibleCountries. */
export const WORLDWIDE_CODE = "GLOBAL";
export const WORLDWIDE_OPTION = "Worldwide (remote)";

const CODE_TO_NAME = new Map<string, string>([
  ...AFRICAN_COUNTRIES.map((c) => [c.code, c.name] as [string, string]),
  ...OTHER_COUNTRIES.map((c) => [c.code, c.name] as [string, string]),
  [WORLDWIDE_CODE, WORLDWIDE_OPTION],
]);

/** Display name for a stored value; legacy free-text values render as-is. */
export function countryDisplayName(codeOrLegacy: string): string {
  return CODE_TO_NAME.get(codeOrLegacy.toUpperCase()) ?? codeOrLegacy;
}

// Back-compat name lists (display-only consumers)
export const AFRICAN_COUNTRY_NAMES = AFRICAN_COUNTRIES.map((c) => c.name);
export const OTHER_COUNTRY_NAMES = OTHER_COUNTRIES.map((c) => c.name);
export const ALL_COUNTRY_NAMES = [...AFRICAN_COUNTRY_NAMES, ...OTHER_COUNTRY_NAMES];
