export const JOB_FIELDS = [
  "Technology",
  "Data",
  "Cybersecurity",
  "Product",
  "Design",
  "Healthcare",
  "Finance",
  "Accounting",
  "Sales",
  "Marketing",
  "Customer Support",
  "Operations",
  "Human Resources",
  "Legal",
  "Education",
  "Engineering Non-Software",
  "Skilled Trades",
  "Logistics",
  "Hospitality",
  "Nonprofit",
  "Executive",
] as const;

export type JobField = typeof JOB_FIELDS[number];

// Fields are scored, not first-match. Each tier (title, then
// department/category/tags, then description) counts how many of a field's
// patterns match; the highest score wins and ties go to the earlier entry.
// Specialist tech fields come first so a generic word ("growth", "financial",
// "medical insurance") in boilerplate can never outrank an engineering title.
// Note: the IT pattern is case-sensitive on purpose — /\bit\b/i matches the
// English pronoun in every description.
const FIELD_PATTERNS: Array<{ field: JobField; patterns: RegExp[] }> = [
  {
    field: "Cybersecurity",
    patterns: [
      /\bcyber ?security\b/i,
      /\bsecurity (?:engineer|analyst|architect|operations|researcher)\b/i,
      /\bsoc analyst\b/i,
      /\bappsec\b/i,
      /\bpenetration tester\b/i,
      /\binformation security\b/i,
    ],
  },
  {
    field: "Engineering Non-Software",
    patterns: [
      /\bmechanical engineer/i,
      /\belectrical engineer/i,
      /\bcivil engineer/i,
      /\bchemical engineer/i,
      /\bmanufacturing engineer/i,
      /\bstructural engineer/i,
      /\bpetroleum engineer/i,
    ],
  },
  {
    field: "Technology",
    patterns: [
      /\bsoftware\b/i,
      /\bengineer(?:ing)?\b/i,
      /\bdevelopers?\b/i,
      /\bprogrammer\b/i,
      /\bcoding\b/i,
      /\bdevops\b/i,
      /\bdevsecops\b/i,
      /\bsre\b/i,
      /\bsite reliability\b/i,
      /\bplatform\b/i,
      /\binfrastructure\b/i,
      /\bfront[- ]?end\b/i,
      /\bback[- ]?end\b/i,
      /\bfull[- ]?stack\b/i,
      /\bcloud\b/i,
      /\b(?:machine learning|ml|ai|llm) engineer\b/i,
      /\bmember of technical staff\b/i,
      /\brobotics\b/i,
      /\bsystems? administrator\b/i,
      /\bsysadmin\b/i,
      /\binformation systems\b/i,
      /\bqa\b/i,
      /\btest automation\b/i,
      /\b(?:ios|android|mobile|web) (?:engineer|developer)\b/i,
      /\bIT\b/,
    ],
  },
  {
    field: "Data",
    patterns: [
      /\bdata\b/i,
      /\bdata (?:scientist|analyst|engineer)\b/i,
      /\bdataops\b/i,
      /\banalytics\b/i,
      /\bmachine learning\b/i,
      /\bml\b/i,
      /\bbi\b/i,
      /\bbusiness intelligence\b/i,
      /\bai trainer\b/i,
      /\bstatistician\b/i,
    ],
  },
  {
    field: "Design",
    patterns: [
      /\bdesigner\b/i,
      /\bdesign\b/i,
      /\bux\b/i,
      /\bui\b/i,
      /\b(?:ux|user) researcher\b/i,
      /\billustrator\b/i,
      /\banimator\b/i,
    ],
  },
  {
    field: "Product",
    patterns: [/\bproduct\b/i, /\bproduct (?:manager|owner|lead)\b/i, /\bpm\b/i],
  },
  {
    field: "Sales",
    patterns: [
      /\bsales\b/i,
      /\baccount (?:executive|manager|director)\b/i,
      /\bbusiness development\b/i,
      /\bbdr\b/i,
      /\bsdr\b/i,
      /\bpre-?sales\b/i,
    ],
  },
  {
    field: "Marketing",
    patterns: [
      /\bmarketing\b/i,
      /\bproduct marketing\b/i,
      /\bgrowth\b/i,
      /\bcontent\b/i,
      /\bseo\b/i,
      /\bbrand\b/i,
      /\bcopywriter\b/i,
      /\bsocial media\b/i,
      /\bdemand generation\b/i,
      /\bpaid (?:ads|media|search)\b/i,
      /\bcommunications\b/i,
      /\bpublic (?:relations|affairs)\b/i,
      /\banalyst relations\b/i,
    ],
  },
  {
    field: "Customer Support",
    patterns: [
      /\bcustomer (?:support|success|service|care|experience)\b/i,
      /\bsupport (?:specialist|agent|representative)\b/i,
      /\bhelp ?desk\b/i,
      /\bcall cent(?:er|re)\b/i,
    ],
  },
  {
    field: "Human Resources",
    patterns: [
      /\bhuman resources\b/i,
      /\bhr\b/i,
      /\brecruit(?:er|ing|ment)\b/i,
      /\btalent acquisition\b/i,
      /\bpeople (?:operations|partner|business partner)\b/i,
    ],
  },
  {
    field: "Finance",
    patterns: [
      /\bfinance\b/i,
      /\bfinancial\b/i,
      /\bfinancial analyst\b/i,
      /\binvestment\b/i,
      /\btreasury\b/i,
      /\bbilling\b/i,
      /\bcollections\b/i,
    ],
  },
  {
    field: "Accounting",
    patterns: [/\baccountant\b/i, /\baccounting\b/i, /\baudit(?:or)?\b/i, /\bbookkeep/i, /\btax\b/i, /\bpayroll\b/i],
  },
  {
    field: "Legal",
    patterns: [/\blegal\b/i, /\bcounsel\b/i, /\blawyer\b/i, /\battorney\b/i, /\bparalegal\b/i, /\bcompliance\b/i],
  },
  {
    field: "Healthcare",
    patterns: [
      /\bnurs(?:e|ing)\b/i,
      /\bdoctor\b/i,
      /\bphysician\b/i,
      /\bclinical\b/i,
      /\bmedical\b/i,
      /\bpharmac(?:ist|y)\b/i,
      /\btherap(?:ist|y)\b/i,
      /\bhealthcare\b/i,
      /\bcaregiver\b/i,
      /\bradiolog/i,
    ],
  },
  {
    field: "Education",
    patterns: [
      /\bteacher\b/i,
      /\beducation\b/i,
      /\binstructor\b/i,
      /\btutor\b/i,
      /\bcurriculum\b/i,
      /\bacademic\b/i,
      /\binstructional\b/i,
      /\binstructional design/i,
    ],
  },
  {
    field: "Skilled Trades",
    patterns: [/\belectrician\b/i, /\bplumber\b/i, /\bwelder\b/i, /\btechnician\b/i, /\bmechanic\b/i, /\bcarpenter\b/i],
  },
  {
    field: "Logistics",
    patterns: [/\blogistics\b/i, /\bsupply chain\b/i, /\bwarehouse\b/i, /\bprocurement\b/i, /\btransportation\b/i],
  },
  {
    field: "Hospitality",
    patterns: [/\bhospitality\b/i, /\bhotel\b/i, /\brestaurant\b/i, /\bchef\b/i, /\bfood service\b/i, /\bfront desk\b/i],
  },
  {
    field: "Nonprofit",
    patterns: [/\bnonprofit\b/i, /\bngo\b/i, /\bfundraising\b/i, /\bgrant\b/i, /\bcommunity\b/i, /\badvocacy\b/i],
  },
  {
    field: "Operations",
    patterns: [
      /\boperations\b/i,
      /\bprogram manager\b/i,
      /\bproject manager\b/i,
      /\bchief of staff\b/i,
      /\bprocess\b/i,
    ],
  },
  {
    field: "Executive",
    patterns: [/\bchief\b/i, /\bceo\b/i, /\bcfo\b/i, /\bcoo\b/i, /\bcto\b/i, /\bvp\b/i, /\bdirector\b/i],
  },
];

/**
 * Best-scoring field for one block of text, or null when nothing matches.
 * Score = number of the field's patterns that match; ties go to the field
 * listed first in FIELD_PATTERNS.
 */
function scoreFields(text: string): JobField | null {
  if (!text.trim()) return null;
  let best: JobField | null = null;
  let bestScore = 0;
  for (const { field, patterns } of FIELD_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) score += 1;
    }
    if (score > bestScore) {
      best = field;
      bestScore = score;
    }
  }
  return best;
}

/** Field implied by the job title alone, or null when the title is uninformative. */
export function classifyJobFieldFromTitle(title?: string | null): JobField | null {
  return scoreFields(title ?? "");
}

// Controlled taxonomy (src/lib/jobs/taxonomy.ts) -> public jobField facet.
// OTHER deliberately maps to null so the keyword path decides.
const TAXONOMY_TO_JOB_FIELD: Record<string, JobField | null> = {
  SOFTWARE_ENGINEERING: "Technology",
  CLOUD_DEVOPS: "Technology",
  AI_ML: "Technology",
  DATA: "Data",
  SECURITY: "Cybersecurity",
  PRODUCT: "Product",
  DESIGN: "Design",
  SALES: "Sales",
  MARKETING: "Marketing",
  CUSTOMER_SUPPORT: "Customer Support",
  FINANCE: "Finance",
  ACCOUNTING: "Accounting",
  HR: "Human Resources",
  LEGAL: "Legal",
  HEALTHCARE: "Healthcare",
  EDUCATION: "Education",
  LOGISTICS: "Logistics",
  SKILLED_TRADES: "Skilled Trades",
  HOSPITALITY: "Hospitality",
  OPERATIONS: "Operations",
  EXECUTIVE: "Executive",
  ENGINEERING_NON_SOFTWARE: "Engineering Non-Software",
  MANUFACTURING: "Engineering Non-Software",
  NONPROFIT: "Nonprofit",
  OTHER: null,
};

export function jobFieldFromTaxonomyField(taxonomyField?: string | null): JobField | null {
  if (!taxonomyField) return null;
  return TAXONOMY_TO_JOB_FIELD[taxonomyField] ?? null;
}

/**
 * Classify a posting into the public jobField facet.
 *
 * Order of evidence: title -> controlled taxonomyField (when supplied) ->
 * department/category/tags -> description. The description is only consulted
 * when nothing stronger matched, because it is full of benefits/company
 * boilerplate ("medical insurance", "financial wellbeing", "growth").
 */
export function classifyJobField(input: {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  category?: string | null;
  department?: string | null;
  taxonomyField?: string | null;
}): JobField {
  return (
    classifyJobFieldFromTitle(input.title) ??
    jobFieldFromTaxonomyField(input.taxonomyField) ??
    scoreFields([input.department, input.category, ...(input.tags ?? [])].filter(Boolean).join(" ")) ??
    scoreFields(input.description ?? "") ??
    "Operations"
  );
}

/**
 * Final jobField for an aggregated posting once the controlled taxonomy has
 * run: title wins, then taxonomyField, then the source-provided value (which
 * already reflects department/tags/description), then a full reclassify.
 */
export function resolveJobField(input: {
  title: string;
  taxonomyField?: string | null;
  existing?: string | null;
  description?: string | null;
  tags?: string[];
}): string {
  return (
    classifyJobFieldFromTitle(input.title) ??
    jobFieldFromTaxonomyField(input.taxonomyField) ??
    input.existing ??
    classifyJobField({ title: input.title, description: input.description, tags: input.tags })
  );
}

// "Remote" as a delimited qualifier in a title or location: "Sr Security
// Engineer | Remote | Europe", "People Partner (Remote Europe)", "Remote - EMEA",
// "Berlin or Remote". A leading word such as "Remote Sensing Scientist" is not
// a qualifier, so a bare "remote" must touch a delimiter or the string edge.
const REMOTE_QUALIFIER_RX =
  /(?:^|[(|[\-–—,/:;]|\bor)\s*(?:fully\s+|100%\s+)?remote\b(?!\s+(?:sensing|control|monitoring|patient|pilot|operated|operations)\b)|\bremote\s*(?:[)|\]\-–—,/:;]|$)/i;
const HYBRID_QUALIFIER_RX = /\bhybrid\b/i;

/** True when a title or location string marks the role as remote. */
export function signalsRemote(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value || HYBRID_QUALIFIER_RX.test(value)) return false;
  return REMOTE_QUALIFIER_RX.test(value);
}

/**
 * Maps the source's location type to Job.workplaceType. A source that reports
 * an on-site role whose title or location says "Remote" (e.g. "Sr Security
 * Engineer | Remote | Europe" listed under "Berlin Office") is stored REMOTE.
 */
export function normalizeWorkplaceType(
  locationType: "remote" | "hybrid" | "onsite",
  hints: { title?: string | null; location?: string | null } = {},
): "REMOTE" | "HYBRID" | "ONSITE" {
  if (locationType === "remote") return "REMOTE";
  if (locationType === "hybrid") return "HYBRID";
  if (signalsRemote(hints.title) || signalsRemote(hints.location)) return "REMOTE";
  return "ONSITE";
}
