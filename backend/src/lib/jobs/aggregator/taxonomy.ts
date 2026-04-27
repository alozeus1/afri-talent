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

const FIELD_PATTERNS: Array<{ field: JobField; patterns: RegExp[] }> = [
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
    field: "Finance",
    patterns: [/\bfinance\b/i, /\bfinancial\b/i, /\bfinancial analyst\b/i, /\binvestment\b/i, /\btreasury\b/i],
  },
  {
    field: "Accounting",
    patterns: [/\baccountant\b/i, /\baccounting\b/i, /\baudit\b/i, /\bbookkeep/i, /\btax\b/i, /\bpayroll\b/i],
  },
  {
    field: "Sales",
    patterns: [/\bsales\b/i, /\baccount executive\b/i, /\bbusiness development\b/i, /\bbdr\b/i, /\bsdr\b/i],
  },
  {
    field: "Marketing",
    patterns: [/\bmarketing\b/i, /\bgrowth\b/i, /\bcontent\b/i, /\bseo\b/i, /\bbrand\b/i, /\bdemand generation\b/i],
  },
  {
    field: "Customer Support",
    patterns: [/\bcustomer support\b/i, /\bcustomer success\b/i, /\bsupport specialist\b/i, /\bhelpdesk\b/i, /\bcall center\b/i],
  },
  {
    field: "Operations",
    patterns: [/\boperations\b/i, /\bprogram manager\b/i, /\bproject manager\b/i, /\bchief of staff\b/i, /\bprocess\b/i],
  },
  {
    field: "Human Resources",
    patterns: [/\bhuman resources\b/i, /\bhr\b/i, /\brecruit(?:er|ing)\b/i, /\btalent acquisition\b/i, /\bpeople operations\b/i],
  },
  {
    field: "Legal",
    patterns: [/\blegal\b/i, /\bcounsel\b/i, /\blawyer\b/i, /\battorney\b/i, /\bparalegal\b/i, /\bcompliance\b/i],
  },
  {
    field: "Education",
    patterns: [/\bteacher\b/i, /\beducation\b/i, /\binstructor\b/i, /\btutor\b/i, /\bcurriculum\b/i, /\bacademic\b/i],
  },
  {
    field: "Engineering Non-Software",
    patterns: [
      /\bmechanical engineer\b/i,
      /\belectrical engineer\b/i,
      /\bcivil engineer\b/i,
      /\bchemical engineer\b/i,
      /\bmanufacturing engineer\b/i,
      /\bquality engineer\b/i,
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
    field: "Cybersecurity",
    patterns: [/\bcybersecurity\b/i, /\bsecurity engineer\b/i, /\bsecurity analyst\b/i, /\bsoc analyst\b/i, /\bappsec\b/i],
  },
  {
    field: "Data",
    patterns: [/\bdata\b/i, /\banalytics\b/i, /\bmachine learning\b/i, /\bml\b/i, /\bai\b/i, /\bbi\b/i],
  },
  {
    field: "Product",
    patterns: [/\bproduct manager\b/i, /\bproduct owner\b/i, /\bproduct lead\b/i, /\bpm\b/i],
  },
  {
    field: "Design",
    patterns: [/\bdesigner\b/i, /\bdesign\b/i, /\bux\b/i, /\bui\b/i, /\bresearcher\b/i],
  },
  {
    field: "Executive",
    patterns: [/\bchief\b/i, /\bceo\b/i, /\bcfo\b/i, /\bcoo\b/i, /\bcto\b/i, /\bvp\b/i, /\bdirector\b/i],
  },
  {
    field: "Technology",
    patterns: [
      /\bsoftware\b/i,
      /\bengineer\b/i,
      /\bdeveloper\b/i,
      /\bdevops\b/i,
      /\bsre\b/i,
      /\bfrontend\b/i,
      /\bbackend\b/i,
      /\bfull[- ]?stack\b/i,
      /\bcloud\b/i,
      /\bit\b/i,
    ],
  },
];

export function classifyJobField(input: {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  category?: string | null;
  department?: string | null;
}): JobField {
  const text = [
    input.title,
    input.category,
    input.department,
    ...(input.tags ?? []),
    input.description,
  ].filter(Boolean).join(" ");

  for (const { field, patterns } of FIELD_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(text))) {
      return field;
    }
  }

  return "Operations";
}

export function normalizeWorkplaceType(locationType: "remote" | "hybrid" | "onsite"): "REMOTE" | "HYBRID" | "ONSITE" {
  if (locationType === "remote") return "REMOTE";
  if (locationType === "hybrid") return "HYBRID";
  return "ONSITE";
}
