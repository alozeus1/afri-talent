// ─────────────────────────────────────────────────────────────────────────────
// Africa-eligibility — deterministic rules first.
//
// Answers one question per posting: can a candidate living in Africa
// realistically get this job? Eligible when any of:
//   - the role is based in Africa (country / city / "Africa" in location),
//   - the role is remote and open worldwide, EMEA/MENA, or Africa,
//   - the role is remote with a timezone window overlapping Africa (UTC-1..+4),
//   - the employer sponsors visas or offers relocation.
// Ineligible when the source or text restricts candidates to non-African
// countries/regions (e.g. "Remote - US", "must be based in Canada") or the
// role is on-site abroad with no sponsorship/relocation.
// Anything else is "uncertain" and may go to the cheap LLM tie-breaker.
// ─────────────────────────────────────────────────────────────────────────────

import type { EligibilityResult, EligibilityScope } from "./types.js";

const AFRICAN_COUNTRIES = [
  "algeria", "angola", "benin", "botswana", "burkina faso", "burundi", "cabo verde", "cape verde",
  "cameroon", "central african republic", "chad", "comoros", "congo", "drc", "dr congo",
  "democratic republic of the congo", "cote d'ivoire", "côte d'ivoire", "cote divoire", "ivory coast",
  "djibouti", "egypt", "equatorial guinea", "eritrea", "eswatini", "swaziland", "ethiopia", "gabon",
  "gambia", "ghana", "guinea", "guinea-bissau", "kenya", "lesotho", "liberia", "libya", "madagascar",
  "malawi", "mali", "mauritania", "mauritius", "morocco", "mozambique", "namibia", "niger", "nigeria",
  "rwanda", "sao tome", "são tomé", "senegal", "seychelles", "sierra leone", "somalia", "somaliland",
  "south africa", "south sudan", "sudan", "tanzania", "togo", "tunisia", "uganda", "zambia", "zimbabwe",
];

const AFRICAN_CITIES = [
  "lagos", "abuja", "ibadan", "port harcourt", "enugu", "kano", "nairobi", "mombasa", "kisumu", "accra",
  "kumasi", "cape town", "johannesburg", "pretoria", "durban", "stellenbosch", "sandton", "cairo",
  "giza", "kigali", "addis ababa", "casablanca", "rabat", "marrakech", "tangier", "tunis", "dakar",
  "kampala", "dar es salaam", "zanzibar", "arusha", "lusaka", "harare", "bulawayo", "gaborone",
  "windhoek", "maputo", "luanda", "abidjan", "douala", "yaounde", "yaoundé", "lome", "lomé", "cotonou",
  "bamako", "ouagadougou", "freetown", "monrovia", "antananarivo", "port louis", "ebene", "algiers",
  "khartoum", "mogadishu", "hargeisa", "kinshasa", "brazzaville", "lilongwe", "blantyre", "niamey",
  "conakry", "banjul", "nouakchott", "djibouti city", "asmara", "maseru", "mbabane", "victoria, seychelles",
];

const AFRICA_REGION_TERMS = [
  "africa", "african", "sub-saharan", "subsaharan", "mena", "middle east and north africa",
  "middle east & north africa", "north africa", "west africa", "east africa", "southern africa",
];

const EMEA_TERMS = ["emea", "europe, middle east and africa", "europe, middle east & africa", "europe middle east africa"];

const WORLDWIDE_TERMS = [
  "worldwide", "world wide", "anywhere", "global", "globally", "international", "all countries",
  "any country", "any location", "everywhere", "remote - world", "planet earth", "earth",
];

// Non-African places that, when they are the *only* scope of a remote role,
// make it unavailable to candidates in Africa. Matched with word boundaries.
const NON_AFRICAN_PLACES = [
  "us", "usa", "u\\.s\\.", "u\\.s\\.a\\.", "united states", "america", "americas", "north america",
  "canada", "uk", "u\\.k\\.", "united kingdom", "england", "scotland", "ireland", "europe", "european union",
  "eu", "eea", "germany", "deutschland", "france", "spain", "portugal", "netherlands", "belgium", "poland",
  "italy", "sweden", "norway", "denmark", "finland", "switzerland", "austria", "czechia", "romania",
  "latam", "latin america", "south america", "brazil", "mexico", "argentina", "colombia", "chile", "peru",
  "apac", "asia", "asia pacific", "india", "pakistan", "philippines", "indonesia", "vietnam", "singapore",
  "japan", "korea", "china", "hong kong", "taiwan", "australia", "new zealand", "anz", "israel", "turkey",
  "uae", "united arab emirates", "saudi arabia", "qatar", "est", "pst", "cst", "mst", "cet",
  "eastern time", "pacific time", "central time", "new york", "san francisco", "london", "berlin",
  "toronto", "seattle", "austin", "boston", "chicago", "los angeles", "paris", "amsterdam", "dublin",
  "bangalore", "bengaluru", "sydney", "tokyo", "madrid", "barcelona", "lisbon", "warsaw", "munich",
  // More countries
  "albania", "andorra", "armenia", "azerbaijan", "belarus", "bosnia", "bulgaria", "croatia", "cyprus",
  "estonia", "georgia", "greece", "hungary", "iceland", "kosovo", "latvia", "liechtenstein", "lithuania",
  "luxembourg", "malta", "moldova", "monaco", "montenegro", "north macedonia", "serbia", "slovakia",
  "slovenia", "ukraine", "russia", "czech republic", "great britain", "wales", "northern ireland",
  "bangladesh", "sri lanka", "nepal", "malaysia", "thailand", "cambodia", "myanmar", "mongolia",
  "kazakhstan", "uzbekistan", "jordan", "lebanon", "kuwait", "bahrain", "oman", "iraq", "iran",
  "uruguay", "paraguay", "bolivia", "ecuador", "venezuela", "costa rica", "panama", "guatemala",
  "honduras", "el salvador", "nicaragua", "dominican republic", "puerto rico", "jamaica", "cuba",
  "central america", "caribbean", "oceania", "nordics", "dach", "benelux", "emea excluding africa",
  // US states and Canadian provinces (city-less US postings)
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
  "florida", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska",
  "nevada", "new hampshire", "new jersey", "new mexico", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee",
  "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
  "district of columbia", "ontario", "quebec", "british columbia", "alberta", "manitoba", "nova scotia",
  "saskatchewan", "vancouver", "montreal", "denver", "atlanta", "miami", "dallas", "houston", "phoenix",
];

const REMOTE_RX = /\b(remote|remotely|work from home|wfh|telecommut\w*|distributed|anywhere|worldwide)\b/i;

const VISA_POSITIVE_RX =
  /\b(visa sponsorship (is )?(available|provided|offered|possible)|(we|will|can|able to|happy to) sponsor (your |a |work |the )?(work )?(visa|permit)s?|offer(s|ing)? (visa|work permit) sponsorship|sponsorship (is )?available|visa support|visa assistance|support (with|for) (your )?(visa|work permit)|relocation and visa|visa and relocation)\b/i;
const VISA_NEGATIVE_RX =
  /\b(no (visa )?sponsorship|(do|does|will|can|are|is) not (currently |be able to )?(offer |provide )?sponsor|unable to (offer |provide )?sponsor|cannot (offer |provide )?sponsor|not (be )?(able to )?(offer|provide) (visa |any )?sponsorship|without (the need for )?(current or future )?(visa |employer )?sponsorship|sponsorship (is )?not (available|offered|provided)|not eligible for (visa )?sponsorship)\b/i;
const RELOCATION_RX =
  /\b(relocation (package|assistance|support|bonus|stipend|allowance|is provided|provided|offered|available)|(we|will) (help|support|assist) (you )?(with )?relocat\w*|relocat\w* (to [a-z ]+ )?(is |are )?(supported|covered|paid))\b/i;

const AFRICA_FRIENDLY_TEXT_RX =
  /\b((open to|welcome|welcoming|hire|hiring|accept\w*) (candidates|applicants|talent|people|engineers|applications)? ?(from|in|across|based in) (anywhere|africa|any country|all countries|around the world)|from anywhere in the world|anywhere in the world|work from anywhere|we hire globally|hire (talent )?globally|fully distributed (team|company)|candidates in africa|across africa)\b/i;

function placeRegex(places: string[]): RegExp {
  return new RegExp(`(^|[^a-z])(${places.join("|")})(?=$|[^a-z])`, "i");
}

const NON_AFRICAN_RX = placeRegex(NON_AFRICAN_PLACES);
const RESTRICTIVE_TEXT_RX = new RegExp(
  [
    `(must|need to|needs to|should|required to|have to) (be )?(currently )?(located|based|residing|reside|live|living|domiciled) (in|within) (the )?(${NON_AFRICAN_PLACES.join("|")})(?=$|[^a-z])`,
    `(^|[^a-z])(us|usa|u\\.s\\.|uk|canada|eu|europe)[- ](only|based only|residents only)(?=$|[^a-z])`,
    `only (open to|accepting|considering|hiring) (candidates|applicants|residents|people)? ?(in|from|located in|based in) (the )?(${NON_AFRICAN_PLACES.join("|")})(?=$|[^a-z])`,
    `(legally )?authori[sz]ed to work in (the )?(us|u\\.s\\.|usa|united states|uk|united kingdom|canada|eu|european union|australia)(?=$|[^a-z])`,
    `(us|u\\.s\\.) (citizenship|citizen|security clearance|green card)`,
    `security clearance`,
  ].join("|"),
  "i",
);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const AFRICA_LOCATION_RX = placeRegex(
  [...AFRICAN_COUNTRIES, ...AFRICAN_CITIES, ...AFRICA_REGION_TERMS].map((term) =>
    normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ),
);
const EMEA_RX = placeRegex(EMEA_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
const WORLDWIDE_RX = placeRegex(WORLDWIDE_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

/** True when a location/restriction string names an African place or Africa itself. */
export function mentionsAfrica(text: string): boolean {
  const value = normalize(text);
  if (!value) return false;
  if (/papua new guinea|new guinea/.test(value)) {
    return AFRICA_LOCATION_RX.test(value.replace(/papua new guinea|new guinea/g, ""));
  }
  return AFRICA_LOCATION_RX.test(value);
}

export function mentionsWorldwide(text: string): boolean {
  return WORLDWIDE_RX.test(normalize(text));
}

export function mentionsEmea(text: string): boolean {
  return EMEA_RX.test(normalize(text));
}

export function mentionsNonAfricanPlace(text: string): boolean {
  return NON_AFRICAN_RX.test(normalize(text));
}

const NEGATION_BEFORE_RX = /\b(not|no|n't|unable|cannot|can't|without|nor|never)\b[^.!?\n]{0,40}$/i;

/** True when `rx` matches somewhere in `text` that is not negated just before the match. */
function hasUnnegatedMatch(text: string, rx: RegExp): boolean {
  const global = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : `${rx.flags}g`);
  for (const match of text.matchAll(global)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 60), match.index ?? 0);
    if (!NEGATION_BEFORE_RX.test(before)) return true;
  }
  return false;
}

export function detectVisaSponsorshipText(text: string): "YES" | "NO" | "UNKNOWN" {
  if (VISA_NEGATIVE_RX.test(text)) return "NO";
  if (hasUnnegatedMatch(text, VISA_POSITIVE_RX)) return "YES";
  if (VISA_POSITIVE_RX.test(text)) return "NO"; // only negated mentions ("we do not provide visa assistance")
  return "UNKNOWN";
}

export function detectRelocationText(text: string): boolean {
  return hasUnnegatedMatch(text, RELOCATION_RX);
}

// Timezone names → UTC offset (standard time; DST shifts are within tolerance).
const TIMEZONE_OFFSETS: Record<string, number> = {
  utc: 0, gmt: 0, wet: 0, bst: 1, cet: 1, wat: 1, cest: 2, eet: 2, cat: 2, sast: 2, eat: 3, msk: 3,
  est: -5, edt: -4, cst: -6, cdt: -5, mst: -7, mdt: -6, pst: -8, pdt: -7, sgt: 8, jst: 9,
  aest: 10, aedt: 11, nzst: 12, brt: -3,
};
const TIMEZONE_RX = new RegExp(
  `\\b(${Object.keys(TIMEZONE_OFFSETS).join("|")})\\b(?:\\s*(?:\\(|time ?zone)?\\s*(?:[+±]\\s*\\/?\\s*-?|plus or minus|within)\\s*(\\d{1,2})\\s*(?:h|hrs?|hours?))?`,
  "i",
);
const UTC_OFFSET_RX = /\b(?:utc|gmt)\s*([-+−]\s*\d{1,2}(?:[:.]\d{2})?)(?:\s*(?:to|-|–)\s*(?:utc|gmt)?\s*([-+−]\s*\d{1,2}(?:[:.]\d{2})?))?/i;

/**
 * Parses timezone-only scopes such as "CET (+/- 3 hours)", "UTC+1 to UTC+3",
 * "EST". Returns the [min,max] UTC-offset window, or null when the text names
 * no timezone.
 */
export function parseTimezoneWindow(text: string): [number, number] | null {
  const offsetMatch = text.match(UTC_OFFSET_RX);
  if (offsetMatch) {
    const parse = (value: string) => Number.parseFloat(value.replace(/\s+/g, "").replace("−", "-").replace(":", "."));
    const first = parse(offsetMatch[1]);
    const second = offsetMatch[2] ? parse(offsetMatch[2]) : first;
    if (Number.isFinite(first) && Number.isFinite(second)) return [Math.min(first, second) - 1, Math.max(first, second) + 1];
  }
  const match = text.match(TIMEZONE_RX);
  if (!match) return null;
  const offset = TIMEZONE_OFFSETS[match[1].toLowerCase()];
  const tolerance = match[2] ? Number.parseInt(match[2], 10) : 1;
  return [offset - tolerance, offset + tolerance];
}

const TIMEZONE_RX_G = new RegExp(TIMEZONE_RX.source, "gi");
const UTC_OFFSET_RX_G = new RegExp(UTC_OFFSET_RX.source, "gi");

function stripTimezones(text: string): string {
  return text.replace(UTC_OFFSET_RX_G, " ").replace(TIMEZONE_RX_G, " ");
}

function windowOverlapsAfrica(window: [number, number]): boolean {
  return window[0] <= 4 && window[1] >= -1;
}

export interface EligibilityInput {
  title: string;
  location: string;
  /** Plain-text description (HTML already stripped). */
  description: string;
  remote?: boolean;
  hybrid?: boolean;
  locationRestrictions?: string[];
  timezoneRestrictions?: number[];
}

// Africa spans roughly UTC-1 (Cabo Verde) to UTC+4 (Mauritius/Seychelles).
const AFRICA_MIN_OFFSET = -1;
const AFRICA_MAX_OFFSET = 4;

function eligible(scopes: EligibilityScope[], reasons: string[]): EligibilityResult {
  return { verdict: "eligible", scopes: Array.from(new Set(scopes)), reasons, decidedBy: "rules" };
}

function ineligible(reasons: string[]): EligibilityResult {
  return { verdict: "ineligible", scopes: [], reasons, decidedBy: "rules" };
}

function uncertain(reasons: string[]): EligibilityResult {
  return { verdict: "uncertain", scopes: [], reasons, decidedBy: "rules" };
}

function mobilityFallback(
  visa: "YES" | "NO" | "UNKNOWN",
  relocation: boolean,
  reason: string,
): EligibilityResult {
  const scopes: EligibilityScope[] = [];
  if (visa === "YES") scopes.push("VISA_SPONSORSHIP");
  if (relocation && visa !== "NO") scopes.push("RELOCATION");
  if (scopes.length > 0) return eligible(scopes, [`${reason}, but ${scopes.join(" + ").toLowerCase()} offered`]);
  return ineligible([reason]);
}

export function evaluateAfricaEligibility(input: EligibilityInput): EligibilityResult {
  const location = input.location ?? "";
  const restrictions = (input.locationRestrictions ?? []).map((item) => String(item)).filter((item) => item.trim());
  const text = `${input.title}\n${input.description}`;
  const visa = detectVisaSponsorshipText(text);
  const relocation = detectRelocationText(text);
  const remote = Boolean(input.remote) || REMOTE_RX.test(location);
  // "Relocation" on a remote, country-restricted role is domestic relocation —
  // it does not open the role to candidates abroad. Only visa sponsorship does.
  const remoteRelocation = relocation && !remote;

  // 1. Based in, or explicitly open to, Africa.
  if (mentionsAfrica(location) || restrictions.some(mentionsAfrica)) {
    return eligible([remote ? "REMOTE_AFRICA" : "AFRICA_BASED"], ["location names Africa or an African country/city"]);
  }

  // 2. Structured candidate-location restrictions published by the source.
  if (restrictions.length > 0) {
    if (restrictions.some(mentionsWorldwide)) {
      return eligible(["REMOTE_WORLDWIDE"], ["source restriction: worldwide"]);
    }
    if (restrictions.some(mentionsEmea)) {
      return eligible(["REMOTE_EMEA"], ["source restriction: EMEA"]);
    }
    const restrictionText = restrictions.join(", ");
    const tzWindow = parseTimezoneWindow(restrictionText);
    if (tzWindow && !mentionsNonAfricanPlace(stripTimezones(restrictionText))) {
      if (windowOverlapsAfrica(tzWindow) && !RESTRICTIVE_TEXT_RX.test(text)) {
        return eligible(["REMOTE_TIMEZONE_COMPATIBLE"], [`timezone window ${restrictionText} overlaps Africa`]);
      }
      return mobilityFallback(visa, remoteRelocation, `timezone window ${restrictionText} excludes Africa`);
    }
    return mobilityFallback(visa, remoteRelocation, `restricted to ${restrictions.slice(0, 4).join(", ")}`);
  }

  const restrictiveText = RESTRICTIVE_TEXT_RX.test(text);

  // 3. Structured timezone window (remote roles).
  const offsets = (input.timezoneRestrictions ?? []).filter((value) => Number.isFinite(value));
  if (remote && offsets.length > 0) {
    const overlaps = offsets.some((offset) => offset >= AFRICA_MIN_OFFSET && offset <= AFRICA_MAX_OFFSET);
    if (overlaps && !restrictiveText) {
      return eligible(["REMOTE_TIMEZONE_COMPATIBLE"], ["timezone window overlaps African timezones"]);
    }
    if (!overlaps) {
      return mobilityFallback(visa, remoteRelocation, "timezone window excludes African timezones");
    }
  }

  // 4. Remote roles scoped by the location text.
  if (remote) {
    if (mentionsEmea(location)) {
      return eligible(["REMOTE_EMEA"], ["remote within EMEA"]);
    }
    const locationWithoutRemote = normalize(location)
      .replace(/\b(remote|remotely|fully|100%|work from home|wfh|distributed|first|friendly|position|role|job|option(al)?)\b/g, " ")
      .replace(/[()[\]\-–—,/|:;]+/g, " ")
      .trim();
    if (mentionsWorldwide(location) && !mentionsNonAfricanPlace(locationWithoutRemote.replace(WORLDWIDE_RX, " "))) {
      if (restrictiveText) return mobilityFallback(visa, remoteRelocation, "worldwide label but text restricts location");
      return eligible(["REMOTE_WORLDWIDE"], ["remote, worldwide"]);
    }
    const tzWindow = parseTimezoneWindow(location);
    if (tzWindow && !mentionsNonAfricanPlace(stripTimezones(location))) {
      if (windowOverlapsAfrica(tzWindow) && !restrictiveText) {
        return eligible(["REMOTE_TIMEZONE_COMPATIBLE"], ["timezone window overlaps Africa"]);
      }
      return mobilityFallback(visa, remoteRelocation, `timezone window ${location} excludes Africa`);
    }
    if (locationWithoutRemote && mentionsNonAfricanPlace(locationWithoutRemote)) {
      return mobilityFallback(visa, remoteRelocation, `remote but restricted to ${location}`);
    }
    if (restrictiveText) {
      return mobilityFallback(visa, remoteRelocation, "description restricts candidate location");
    }
    if (AFRICA_FRIENDLY_TEXT_RX.test(text)) {
      return eligible(["REMOTE_WORLDWIDE"], ["description says the team hires from anywhere/Africa"]);
    }
    if (visa === "YES") return eligible(["VISA_SPONSORSHIP"], ["remote role, visa sponsorship offered"]);
    return uncertain(["remote role without an explicit location scope"]);
  }

  // 5. On-site / hybrid outside Africa.
  if (!location.trim()) {
    if (AFRICA_FRIENDLY_TEXT_RX.test(text)) return eligible(["REMOTE_WORLDWIDE"], ["description says the team hires from anywhere"]);
    return uncertain(["no location published"]);
  }
  return mobilityFallback(visa, relocation, `${input.hybrid ? "hybrid" : "on-site"} in ${location}`);
}
