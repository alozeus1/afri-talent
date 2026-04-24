// ─────────────────────────────────────────────────────────────────────────────
// AI Output Quality Rubric
//
// Deterministic, model-free checks that can be run against any AI-generated
// resume, cover letter, or match explanation before it is shown to a user.
//
// The rubric returns:
//   - a coarse grade (PASS | WARN | FAIL)
//   - a numeric 0..100 score
//   - structured issues (severity + code + human-readable message)
//
// This module must have NO external dependencies (pure TS) so it can run in
// unit tests and inside request handlers without any live model calls.
// ─────────────────────────────────────────────────────────────────────────────
// Common resume / cover-letter anti-patterns — if any of these appear, it is
// almost always a sign the model slipped into cliche / filler mode.
const BANNED_PHRASES = [
    "hard-working",
    "hard working",
    "team player",
    "self-starter",
    "detail-oriented",
    "detail oriented",
    "think outside the box",
    "results-driven",
    "results driven",
    "go-getter",
    "go getter",
    "synergy",
    "synergistic",
    "best of breed",
    "leverage synergies",
    "passionate professional",
    "dynamic professional",
    "rockstar",
    "ninja",
    "guru",
    "wizard",
];
// Filler words that signal low-confidence or padded writing.
const FILLER_WORDS = [
    "very",
    "really",
    "basically",
    "actually",
    "literally",
    "just",
    "simply",
    "kind of",
    "sort of",
    "in order to",
    "as a matter of fact",
    "at the end of the day",
];
// Placeholders that occasionally leak through when the model can't fill them.
const PLACEHOLDER_PATTERNS = [
    /\[insert[^\]]*\]/i,
    /\[your[^\]]*\]/i,
    /\{\{[^}]+\}\}/,
    /\bTBD\b/,
    /lorem ipsum/i,
    /xx+[\s,.]/,
    /\bN\/A\b/,
    /\bplaceholder\b/i,
];
// Simple heuristic for quantified achievement: a number attached to % / $ / k /
// M / years / users / revenue etc.
const QUANTIFICATION_PATTERN = /\b\d{1,3}(?:[.,]\d+)?(?:\s?%| percent|\+|k|K|M|bn|BN|\s?(?:users|customers|clients|dollars|USD|EUR|GBP|₦|NGN|ZAR|KES|months|years|weeks|days))\b/;
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
        .split(/[^a-z0-9%$+\-/]+/)
        .filter(Boolean);
}
function countSentences(text) {
    // Avoid regex-lookbehind for broader TS target compatibility.
    const raw = text
        .replace(/\s+/g, " ")
        .split(/[.!?]+\s/)
        .map((s) => s.trim())
        .filter(Boolean);
    return Math.max(1, raw.length);
}
function collectBannedHits(text) {
    const hits = [];
    const hay = text.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
        if (hay.includes(phrase))
            hits.push(phrase);
    }
    return hits;
}
function collectFillerHits(text) {
    const hits = [];
    const hay = text.toLowerCase();
    for (const word of FILLER_WORDS) {
        const pattern = new RegExp(`\\b${word.replace(/\s+/g, "\\s+")}\\b`, "g");
        const matches = hay.match(pattern);
        if (matches)
            hits.push(...matches);
    }
    return hits;
}
function collectPlaceholderHits(text) {
    const hits = [];
    for (const re of PLACEHOLDER_PATTERNS) {
        const match = text.match(re);
        if (match)
            hits.push(match[0]);
    }
    return hits;
}
function countQuantifiedAchievements(text) {
    // Look at each sentence and see how many include quantification.
    const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
    let count = 0;
    for (const s of sentences) {
        if (QUANTIFICATION_PATTERN.test(s))
            count++;
    }
    return count;
}
/**
 * Grade AI output. Pure function — no I/O.
 */
export function gradeAiOutput(input) {
    const text = (input.text || "").trim();
    const issues = [];
    if (text.length === 0) {
        return {
            grade: "FAIL",
            score: 0,
            issues: [
                { code: "EMPTY_OUTPUT", severity: "error", message: "AI returned an empty output." },
            ],
            stats: {
                words: 0,
                sentences: 0,
                avgSentenceWords: 0,
                bannedPhraseHits: 0,
                fillerHits: 0,
                quantifiedAchievements: 0,
                placeholderHits: 0,
            },
        };
    }
    const words = tokenize(text);
    const sentenceCount = countSentences(text);
    const avgSentenceWords = Number((words.length / sentenceCount).toFixed(1));
    const banned = collectBannedHits(text);
    const filler = collectFillerHits(text);
    const placeholders = collectPlaceholderHits(text);
    const quantified = countQuantifiedAchievements(text);
    // Banned phrases — always an error.
    for (const phrase of banned) {
        issues.push({
            code: "BANNED_PHRASE",
            severity: "error",
            message: `Cliche phrase "${phrase}" — rewrite with a concrete achievement.`,
            evidence: phrase,
        });
    }
    // Placeholder leakage — always an error (user would see "[insert company]").
    for (const placeholder of placeholders) {
        issues.push({
            code: "PLACEHOLDER_LEAK",
            severity: "error",
            message: `Placeholder left in output: ${placeholder}`,
            evidence: placeholder,
        });
    }
    // Length checks — kind-specific.
    if (input.kind === "cover_letter") {
        if (words.length < 120) {
            issues.push({
                code: "COVER_LETTER_TOO_SHORT",
                severity: "warn",
                message: `Cover letter is only ${words.length} words — target 180–320.`,
            });
        }
        else if (words.length > 400) {
            issues.push({
                code: "COVER_LETTER_TOO_LONG",
                severity: "warn",
                message: `Cover letter is ${words.length} words — target 180–320.`,
            });
        }
    }
    if (input.kind === "resume") {
        if (words.length < 160) {
            issues.push({
                code: "RESUME_TOO_SHORT",
                severity: "warn",
                message: `Resume body is only ${words.length} words — expect 250+.`,
            });
        }
        if (quantified === 0) {
            issues.push({
                code: "NO_QUANTIFICATION",
                severity: "warn",
                message: "No quantified achievements detected. Add metrics (%, $, users, months).",
            });
        }
    }
    if (input.kind === "match_explanation") {
        if (words.length < 12) {
            issues.push({
                code: "EXPLANATION_TOO_SHORT",
                severity: "warn",
                message: `Match explanation is only ${words.length} words — target 20–60.`,
            });
        }
        else if (words.length > 120) {
            issues.push({
                code: "EXPLANATION_TOO_LONG",
                severity: "info",
                message: `Match explanation is ${words.length} words — consider trimming for scanability.`,
            });
        }
    }
    // Filler density.
    const fillerDensity = filler.length / Math.max(1, words.length);
    if (fillerDensity > 0.04) {
        issues.push({
            code: "HIGH_FILLER_DENSITY",
            severity: "warn",
            message: `${filler.length} filler words across ${words.length} words (${(fillerDensity * 100).toFixed(1)}%) — aim for < 4%.`,
        });
    }
    // Sentence-length check — catches walls of prose.
    if (avgSentenceWords > 32) {
        issues.push({
            code: "LONG_SENTENCES",
            severity: "warn",
            message: `Average sentence is ${avgSentenceWords} words — split into shorter statements.`,
        });
    }
    // Keyword coverage check (ATS targeting).
    if (input.expectedKeywords && input.expectedKeywords.length > 0) {
        const lower = text.toLowerCase();
        const missing = input.expectedKeywords
            .filter((k) => k && k.trim().length > 0)
            .filter((k) => !lower.includes(k.toLowerCase()));
        if (missing.length > 0) {
            issues.push({
                code: "MISSING_KEYWORDS",
                severity: missing.length > input.expectedKeywords.length / 2 ? "error" : "warn",
                message: `Missing expected keywords: ${missing.slice(0, 10).join(", ")}`,
            });
        }
    }
    // Compute score: start at 100, deduct per issue severity.
    let score = 100;
    for (const issue of issues) {
        if (issue.severity === "error")
            score -= 15;
        else if (issue.severity === "warn")
            score -= 7;
        else
            score -= 2;
    }
    if (score < 0)
        score = 0;
    // Grade thresholds.
    const hasError = issues.some((i) => i.severity === "error");
    const grade = hasError || score < 55 ? "FAIL" : score < 80 ? "WARN" : "PASS";
    return {
        grade,
        score,
        issues,
        stats: {
            words: words.length,
            sentences: sentenceCount,
            avgSentenceWords,
            bannedPhraseHits: banned.length,
            fillerHits: filler.length,
            quantifiedAchievements: quantified,
            placeholderHits: placeholders.length,
        },
    };
}
/**
 * Helper: format a QualityReport as a single short status line for logging.
 */
export function formatReportLine(report) {
    const codes = report.issues.map((i) => i.code).join(",") || "-";
    return `[${report.grade}] score=${report.score} words=${report.stats.words} issues=${codes}`;
}
//# sourceMappingURL=quality-rubric.js.map