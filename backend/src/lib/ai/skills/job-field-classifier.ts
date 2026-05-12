import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import logger from "../../logger.js";
import {
  JOB_TAXONOMY,
  TAXONOMY_VERSION,
  isTaxonomyField,
  type TaxonomyField,
} from "../../jobs/taxonomy.js";

// §4.1 — LLM-classified job field.
//
// Production: Claude Haiku 4.5 returns a strict JSON envelope; we Zod-validate
// it and only trust labels in the controlled taxonomy.
// Fallback: deterministic keyword matcher kicks in when the LLM is unavailable
// (no API key, MOCK_AI=1, or the LLM response is malformed or low-confidence).
//
// The fallback is what CI exercises against the fixture — it has to be good
// enough to hit the master prompt's ≥92% accuracy gate on its own.

const FAST_MODEL = process.env.AI_FAST_MODEL || "claude-haiku-4-5-20251001";
const MOCK_AI = process.env.MOCK_AI === "1";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

const MIN_LLM_CONFIDENCE = 0.6; // master prompt §4.1
const KEYWORD_FALLBACK_CONFIDENCE = 0.5;

export interface ClassifierInput {
  title: string;
  description?: string;
  companyName?: string;
  seniority?: string;
  tags?: string[];
}

export interface ClassificationResult {
  field: TaxonomyField;
  version: number;
  confidence: number;
  rationale: string;
  source: "llm" | "keyword_fallback";
}

const llmResponseSchema = z.object({
  field: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(400),
});

// ─── Keyword fallback ────────────────────────────────────────────────────────
//
// Each entry is a list of canonical phrases that strongly imply a category.
// Order matters within a category (most specific first); across categories,
// the scorer assigns one point per matched phrase and picks the max — ties
// broken by the order below (more specialist categories first).

interface KeywordSpec {
  field: TaxonomyField;
  phrases: RegExp[];
}

const KEYWORD_RULES: KeywordSpec[] = [
  // Specialist tech first — these phrases shouldn't bleed into generic SWE.
  {
    field: "AI_ML",
    phrases: [
      /\b(machine learning|deep learning|llm|prompt engineer|ml engineer|nlp|computer vision|recommender|generative ai)\b/i,
      /\b(pytorch|tensorflow|hugging\s?face|transformer|mlops|ai engineer|ai scientist|ml research|llm researcher)\b/i,
    ],
  },
  {
    field: "DATA",
    phrases: [
      /\b(data engineer|data analyst|data scientist|analytics engineer|bi engineer|business intelligence)\b/i,
      /\b(snowflake|databricks|airflow|dbt|etl|elt|warehouse engineer|streaming pipeline|kafka stream)\b/i,
      /\b(sql analyst|reporting analyst)\b/i,
    ],
  },
  {
    field: "SECURITY",
    phrases: [
      /\b(security engineer|appsec|application security|infosec|information security|soc analyst|threat intel)\b/i,
      /\b(red team|penetration test|pentest|incident response|grc|compliance engineer|iam engineer|siem)\b/i,
    ],
  },
  {
    field: "CLOUD_DEVOPS",
    phrases: [
      /\b(devops|site reliability|sre|platform engineer|cloud engineer|cloud architect|infrastructure engineer)\b/i,
      /\b(kubernetes|terraform|aws engineer|gcp engineer|azure engineer|ci\s*\/?\s*cd|reliability engineer)\b/i,
    ],
  },
  {
    field: "SOFTWARE_ENGINEERING",
    phrases: [
      /\b(software engineer|backend engineer|frontend engineer|fullstack|full-stack|mobile engineer|ios engineer|android engineer)\b/i,
      /\b(react|node\.?js|typescript|swe|software developer|web developer|engineering manager|tech lead)\b/i,
      /\b(staff engineer|principal engineer|senior software)\b/i,
    ],
  },
  {
    field: "PRODUCT",
    phrases: [
      /\b(product manager|pm|head of product|product owner|product designer|growth pm|technical pm|principal pm)\b/i,
      /\b(product lead|director of product|chief product officer|cpo)\b/i,
    ],
  },
  {
    field: "DESIGN",
    phrases: [
      /\b(ux designer|ui designer|product designer|design lead|interaction designer|visual designer|brand designer)\b/i,
      /\b(graphic designer|design systems|motion designer|figma|design researcher)\b/i,
    ],
  },
  {
    field: "SALES",
    phrases: [
      /\b(account executive|sales development|sdr|bdr|sales manager|sales director|enterprise sales|customer success)\b/i,
      /\b(business development|partnerships manager|inside sales|outbound sales|account manager)\b/i,
    ],
  },
  {
    field: "MARKETING",
    phrases: [
      /\b(marketing manager|growth marketer|content marketer|brand marketer|product marketing|demand gen|seo specialist)\b/i,
      /\b(performance marketing|social media manager|community manager|head of marketing|cmo)\b/i,
    ],
  },
  {
    field: "CUSTOMER_SUPPORT",
    phrases: [
      /\b(customer support|customer experience|cx|support specialist|technical support|help desk|customer advocate)\b/i,
      /\b(contact center agent|client services representative)\b/i,
    ],
  },
  {
    field: "FINANCE",
    phrases: [
      /\b(financial analyst|finance manager|fp&a|cfo|treasury|investment analyst|controller analyst|finance director)\b/i,
      /\b(financial planner|corporate finance|head of finance)\b/i,
    ],
  },
  {
    field: "ACCOUNTING",
    phrases: [
      /\b(accountant|bookkeeper|payroll specialist|tax accountant|audit associate|accounts payable|accounts receivable)\b/i,
      /\b(ledger accountant|junior accountant|senior accountant)\b/i,
    ],
  },
  {
    field: "HR",
    phrases: [
      /\b(people partner|hr business partner|hrbp|talent acquisition|recruiter|head of people|people operations)\b/i,
      /\b(human resources|compensation specialist|hr generalist|people manager)\b/i,
    ],
  },
  {
    field: "LEGAL",
    phrases: [
      /\b(legal counsel|in-house counsel|paralegal|associate attorney|compliance officer|contract manager|trademark attorney)\b/i,
      /\b(general counsel|deputy general counsel|associate general counsel)\b/i,
    ],
  },
  {
    field: "HEALTHCARE",
    phrases: [
      /\b(registered nurse|rn|nurse practitioner|physician|md|pediatrician|surgeon|clinical pharmacist)\b/i,
      /\b(medical assistant|healthcare analyst|radiologist|clinical research associate|pharmacist|physical therapist)\b/i,
    ],
  },
  {
    field: "EDUCATION",
    phrases: [
      /\b(teacher|professor|lecturer|instructional designer|curriculum developer|education specialist|tutor)\b/i,
      /\b(academic advisor|principal of school|dean of students|adjunct professor)\b/i,
    ],
  },
  {
    field: "LOGISTICS",
    phrases: [
      /\b(supply chain|logistics coordinator|warehouse manager|fleet manager|procurement specialist|inventory manager)\b/i,
      /\b(transportation manager|distribution analyst|fulfillment associate)\b/i,
    ],
  },
  {
    field: "SKILLED_TRADES",
    phrases: [
      /\b(electrician|plumber|hvac technician|carpenter|welder|construction foreman|mechanic|locksmith)\b/i,
      /\b(industrial electrician|automotive technician|machinist)\b/i,
    ],
  },
  {
    field: "HOSPITALITY",
    phrases: [
      /\b(hotel manager|chef|line cook|barista|restaurant manager|food and beverage|concierge|front desk agent)\b/i,
      /\b(general manager hotel|sous chef|executive chef|housekeeping supervisor)\b/i,
    ],
  },
  {
    field: "MANUFACTURING",
    phrases: [
      /\b(manufacturing engineer|production supervisor|quality engineer|process engineer|maintenance technician|plant manager)\b/i,
      /\b(production planner|industrial engineer|assembly technician)\b/i,
    ],
  },
  {
    field: "ENGINEERING_NON_SOFTWARE",
    phrases: [
      /\b(mechanical engineer|civil engineer|electrical engineer|chemical engineer|structural engineer|aerospace engineer)\b/i,
      /\b(petroleum engineer|environmental engineer|biomedical engineer)\b/i,
    ],
  },
  {
    field: "OPERATIONS",
    phrases: [
      /\b(operations manager|business operations|biz ops|ops analyst|chief of staff|head of operations|coo)\b/i,
      /\b(strategy and operations|operations specialist)\b/i,
    ],
  },
  {
    field: "EXECUTIVE",
    phrases: [
      /\b(chief executive|ceo|chief operating|coo|chief financial|cfo|chief technology|cto|chief marketing|cmo)\b/i,
      /\b(chief product|chief revenue|cro|chief people|cpo)\b/i,
    ],
  },
  {
    field: "NONPROFIT",
    phrases: [
      /\b(non-?profit|ngo program|grant manager|fundraising manager|development director nonprofit|charity coordinator)\b/i,
      /\b(community engagement coordinator|program officer ngo)\b/i,
    ],
  },
];

function classifyByKeywords(input: ClassifierInput): { field: TaxonomyField; confidence: number; matches: string[] } {
  const haystack = [
    input.title,
    input.description ?? "",
    input.companyName ?? "",
    (input.tags ?? []).join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const scores = new Map<TaxonomyField, { count: number; matches: string[] }>();

  for (const rule of KEYWORD_RULES) {
    for (const rx of rule.phrases) {
      const m = haystack.match(rx);
      if (!m) continue;
      const entry = scores.get(rule.field) ?? { count: 0, matches: [] };
      entry.count += 1;
      entry.matches.push(m[0].toLowerCase());
      scores.set(rule.field, entry);
    }
  }

  if (scores.size === 0) {
    return { field: "OTHER", confidence: 0.3, matches: [] };
  }

  // Pick the highest-scoring category. Order in KEYWORD_RULES is the
  // tiebreaker because Map preserves insertion order.
  let bestField: TaxonomyField = "OTHER";
  let bestCount = 0;
  let bestMatches: string[] = [];
  for (const [field, entry] of scores.entries()) {
    if (entry.count > bestCount) {
      bestField = field;
      bestCount = entry.count;
      bestMatches = entry.matches;
    }
  }

  // Confidence scales with how many distinct rule matches we hit, capped
  // a bit below 1.0 so the LLM (when available) still has room to outvote.
  const confidence = Math.min(KEYWORD_FALLBACK_CONFIDENCE + 0.1 * (bestCount - 1), 0.85);
  return { field: bestField, confidence, matches: bestMatches };
}

// ─── LLM path ────────────────────────────────────────────────────────────────

async function classifyByLlm(input: ClassifierInput): Promise<ClassificationResult | null> {
  if (MOCK_AI || !ANTHROPIC_KEY) return null;
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const allowed = JOB_TAXONOMY.join(", ");
  const prompt = `Classify the following job into EXACTLY ONE of these categories: ${allowed}.

Return ONLY valid JSON (no markdown):
{"field":"<one of the categories above>","confidence":0.0-1.0,"rationale":"<≤200 chars why>"}

Title: ${input.title}
Company: ${input.companyName ?? "(unknown)"}
Seniority: ${input.seniority ?? "(unknown)"}
Tags: ${(input.tags ?? []).join(", ") || "(none)"}
Description: ${(input.description ?? "").slice(0, 600)}`;

  try {
    const response = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== "text") return null;

    const cleaned = block.text.replace(/```(?:json)?/g, "").trim();
    const parsed = llmResponseSchema.parse(JSON.parse(cleaned));
    if (!isTaxonomyField(parsed.field)) return null;
    if (parsed.confidence < MIN_LLM_CONFIDENCE) return null;

    return {
      field: parsed.field,
      version: TAXONOMY_VERSION,
      confidence: parsed.confidence,
      rationale: parsed.rationale,
      source: "llm",
    };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, title: input.title.slice(0, 60) },
      "[job-field-classifier] LLM path failed; falling back to keyword classifier",
    );
    return null;
  }
}

export async function classifyJobField(input: ClassifierInput): Promise<ClassificationResult> {
  const llm = await classifyByLlm(input);
  if (llm) return llm;

  const kw = classifyByKeywords(input);
  return {
    field: kw.field,
    version: TAXONOMY_VERSION,
    confidence: kw.confidence,
    rationale:
      kw.matches.length > 0
        ? `Keyword match: ${kw.matches.slice(0, 3).join(", ")}`
        : "No category-distinctive keywords found; defaulted to OTHER",
    source: "keyword_fallback",
  };
}

// Exposed for the eval test — exercises the deterministic path without
// touching the network.
export function classifyByKeywordsForTesting(input: ClassifierInput): ClassificationResult {
  const kw = classifyByKeywords(input);
  return {
    field: kw.field,
    version: TAXONOMY_VERSION,
    confidence: kw.confidence,
    rationale:
      kw.matches.length > 0
        ? `Keyword match: ${kw.matches.slice(0, 3).join(", ")}`
        : "No category-distinctive keywords found; defaulted to OTHER",
    source: "keyword_fallback",
  };
}
