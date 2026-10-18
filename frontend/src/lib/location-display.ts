// Tidies raw job location strings from ATS feeds for display. Stored values
// stay raw; this only shapes what candidates read:
//   "Paris, Paris"                -> "Paris"
//   "Berlin Office"               -> "Berlin"
//   "EMEA; Roles - EMEA"          -> "EMEA"
//   "Time zone: CET +/- 3 hours"  -> timezone "CET ±3h" (rendered "Remote (CET ±3h)")
//   "UK / Brazil / … (21 places)" -> list "South Africa" + 20 more (compact mode, African place first)
// Pure and locale-free: public-labels.ts translates the result.

export type TidyLocation =
  | { kind: "text"; text: string }
  | { kind: "timezone"; zone: string }
  | { kind: "list"; first: string; more: number };

export interface TidyLocationOptions {
  /** Collapse long place lists to "first + N more" (cards). */
  compact?: boolean;
  /** Most places shown in full before a list is collapsed (compact only). */
  maxPlaces?: number;
}

const TZ_NAMES = "UTC|GMT|CET|CEST|EET|EEST|WET|WEST|WAT|CAT|EAT|SAST|BST|IST|EST|EDT|CST|CDT|MST|MDT|PST|PDT";
const TZ_PREFIX = String.raw`(?:(?:time\s*zones?|tz)\s*[:\-–]?\s*)?`;
const TZ_ONLY_RX = new RegExp(
  String.raw`^${TZ_PREFIX}(${TZ_NAMES})\s*(?:\(?\s*(?:\+\s*\/\s*-|-\s*\/\s*\+|±|\+-|plus or minus)\s*(\d{1,2})\s*(?:h|hrs?|hours?)?\s*\)?)?$`,
  "i",
);
const UTC_RANGE_RX = new RegExp(
  String.raw`^${TZ_PREFIX}((?:UTC|GMT)\s*[+\-−]\s*\d{1,2}(?::\d{2})?(?:\s*(?:to|-|–)\s*(?:UTC|GMT)?\s*[+\-−]\s*\d{1,2}(?::\d{2})?)?)$`,
  "i",
);

const LABEL_PREFIX_RX = /^(?:roles?|locations?|offices?)\s*[-–:]\s*/i;
const OFFICE_SUFFIX_RX = /\s+(?:office|hq|headquarters)$/i;
const LIST_SPLIT_RX = /\s*\/\s*/;

const AFRICAN_PLACES = new Set(
  [
    "algeria", "angola", "benin", "botswana", "burkina faso", "burundi", "cabo verde", "cape verde", "cameroon",
    "central african republic", "chad", "comoros", "congo", "democratic republic of the congo", "drc",
    "côte d'ivoire", "cote d'ivoire", "ivory coast", "djibouti", "egypt", "equatorial guinea", "eritrea", "eswatini",
    "ethiopia", "gabon", "gambia", "ghana", "guinea", "guinea-bissau", "kenya", "lesotho", "liberia", "libya",
    "madagascar", "malawi", "mali", "mauritania", "mauritius", "morocco", "mozambique", "namibia", "niger",
    "nigeria", "rwanda", "senegal", "seychelles", "sierra leone", "somalia", "south africa", "south sudan",
    "sudan", "tanzania", "togo", "tunisia", "uganda", "zambia", "zimbabwe", "africa",
  ],
);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function timezoneOf(value: string): string | null {
  const named = value.match(TZ_ONLY_RX);
  if (named) {
    const zone = named[1].toUpperCase();
    return named[2] ? `${zone} ±${Number.parseInt(named[2], 10)}h` : zone;
  }
  const range = value.match(UTC_RANGE_RX);
  if (range) {
    return collapseWhitespace(range[1])
      .replace(/\b(utc|gmt)\b/gi, (name) => name.toUpperCase())
      .replace(/\s*([+\-−])\s*(?=\d)/g, "$1");
  }
  return null;
}

/** "Berlin Office" -> "Berlin", "Roles - EMEA" -> "EMEA". */
function cleanPlace(value: string): string {
  return collapseWhitespace(value).replace(LABEL_PREFIX_RX, "").replace(OFFICE_SUFFIX_RX, "").trim();
}

/** Drops repeated places, case-insensitively, keeping the first spelling. */
function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function tidyLocation(raw: string | null | undefined, options: TidyLocationOptions = {}): TidyLocation {
  const value = collapseWhitespace(raw ?? "");
  if (!value) return { kind: "text", text: "" };

  const zone = timezoneOf(value);
  if (zone) return { kind: "timezone", zone };

  // "APAC; EMEA; Roles - EMEA" -> segments, each cleaned and de-duplicated.
  const segments = unique(value.split(";").map(cleanPlace));

  // Slash-separated place lists ("EMEA / Romania / … / South Africa").
  const places = unique(segments.flatMap((segment) => segment.split(LIST_SPLIT_RX).map(cleanPlace)));
  const maxPlaces = options.maxPlaces ?? 3;
  if (options.compact && places.length > maxPlaces && segments.some((segment) => LIST_SPLIT_RX.test(segment))) {
    const first = places.find((place) => AFRICAN_PLACES.has(place.toLowerCase())) ?? places[0];
    return { kind: "list", first, more: places.length - 1 };
  }

  // "Paris, Paris" -> "Paris"; "Lagos, Lagos, Nigeria" -> "Lagos, Nigeria".
  const text = segments
    .map((segment) => unique(segment.split(",").map((part) => collapseWhitespace(part))).join(", "))
    .join(", ");
  return { kind: "text", text: text || value };
}
