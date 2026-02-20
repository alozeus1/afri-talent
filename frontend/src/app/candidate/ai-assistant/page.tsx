"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  runOrchestrator,
  OrchestratorError,
  getRunHistory,
  searchJobs,
} from "@/lib/api/orchestratorClient";
import type {
  OrchestratorRunPayload,
  OrchestratorRunResponse,
  RankedJob,
  TailoredOutput,
  AiRunHistory,
  SearchJobResult,
} from "@/lib/api/orchestratorTypes";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_JOBS = 10;
const APPLY_PACK_THRESHOLD = 40; // min match score to enable apply pack

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobSlot {
  /** Stable ID passed as `job_id` to the orchestrator so we can correlate
   *  ranked results back to the original slot text. */
  id: string;
  text: string;
}

type ActiveOp = "analyze" | "match" | "pack";
type FieldErrors = Record<string, string[]>;

// Module-level counter keeps IDs unique across slot add/remove in a session.
let _slotSeq = 0;
function makeSlotId(): string {
  return `slot-${++_slotSeq}`;
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

function shortId(id: string) {
  return id.length > 13 ? `${id.slice(0, 8)}…` : id;
}

const REC_VARIANT: Record<string, "success" | "warning" | "danger"> = {
  apply: "success",
  stretch: "warning",
  skip: "danger",
};

function ScoreBar({
  value,
  color = "emerald",
}: {
  value: number;
  color?: "emerald" | "blue";
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full bg-${color}-500 rounded-full transition-all`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-semibold text-${color}-600 w-8 text-right`}>
        {value}
      </span>
    </div>
  );
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function ResumePanel({ result }: { result: OrchestratorRunResponse }) {
  const r = result.resume_json;
  if (!r) return null;

  return (
    <div>
      <SectionLabel>Resume Analysis</SectionLabel>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-sm text-gray-600">
        {r.name && (
          <span>
            <span className="font-medium">Name:</span> {r.name}
          </span>
        )}
        {r.years_of_experience != null && (
          <span>
            <span className="font-medium">Experience:</span>{" "}
            {r.years_of_experience} yr{r.years_of_experience !== 1 ? "s" : ""}
          </span>
        )}
        {r.skills.length > 0 && (
          <span>
            <span className="font-medium">Skills:</span> {r.skills.length} identified
          </span>
        )}
        {r.work_auth_status && (
          <span>
            <span className="font-medium">Work auth:</span> {r.work_auth_status}
          </span>
        )}
      </div>
      {r.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {r.skills.slice(0, 12).map((s) => (
            <Badge key={s} variant="info">
              {s}
            </Badge>
          ))}
          {r.skills.length > 12 && (
            <Badge variant="default">+{r.skills.length - 12} more</Badge>
          )}
        </div>
      )}
      {result.notes_for_ui.length > 0 && (
        <ul className="space-y-1">
          {result.notes_for_ui.map((note, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Single row in the ranked-jobs table. */
function RankedJobRow({
  job,
  rank,
  isSelected,
  onSelect,
}: {
  job: RankedJob;
  rank: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { match, job_json } = job;
  const title = job_json.title ?? `Job ${rank}`;
  const company = job_json.company;
  const eligible = match.score >= APPLY_PACK_THRESHOLD;

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isSelected
          ? "border-emerald-400 bg-emerald-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: rank + info */}
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              isSelected
                ? "bg-emerald-500 text-white"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {rank}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {title}
              {company && (
                <span className="font-normal text-gray-500"> · {company}</span>
              )}
            </p>
            {job_json.visa_sponsorship === "YES" && (
              <span className="text-xs text-emerald-600 font-medium">
                ✓ Visa sponsored
              </span>
            )}
          </div>
        </div>

        {/* Right: select button */}
        <Button
          size="sm"
          variant={isSelected ? "primary" : "outline"}
          onClick={onSelect}
          className="shrink-0"
        >
          {isSelected ? "Selected ✓" : "Select"}
        </Button>
      </div>

      {/* Score bars */}
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-0.5">
            <span>Match score</span>
          </div>
          <ScoreBar value={match.score} color="emerald" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-0.5">
            <span>Must-have coverage</span>
          </div>
          <ScoreBar value={match.must_have_coverage_pct} color="blue" />
        </div>
      </div>

      {/* Recommendation + eligibility */}
      <div className="mt-2 flex items-center gap-2">
        <Badge variant={REC_VARIANT[match.recommendation] ?? "default"}>
          {match.recommendation.toUpperCase()}
        </Badge>
        {!eligible && (
          <span className="text-xs text-gray-400">
            Score below threshold ({APPLY_PACK_THRESHOLD}) for apply pack
          </span>
        )}
      </div>
    </div>
  );
}

/** Expandable detail for the currently selected job. */
function SelectedJobDetail({ job }: { job: RankedJob }) {
  const { match, job_json } = job;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Why it matches
      </p>
      {match.matched_skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {match.matched_skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs"
            >
              ✓ {s}
            </span>
          ))}
        </div>
      )}
      {match.missing_must_haves.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Gaps (required skills)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {match.missing_must_haves.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded-full text-xs"
              >
                ✗ {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {match.missing_nice_to_haves.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {match.missing_nice_to_haves.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full text-xs"
            >
              ~ {s}
            </span>
          ))}
        </div>
      )}
      {match.explanation && (
        <p className="text-sm text-gray-600 italic border-l-2 border-emerald-300 pl-3">
          {match.explanation}
        </p>
      )}
      {job_json.requirements.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Key requirements
          </p>
          <ul className="space-y-1">
            {job_json.requirements.slice(0, 5).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Download utilities ────────────────────────────────────────────────────────

/** Triggers a client-side file download from in-memory text content. */
function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download has time to start
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/** First 8 hex chars of the run_id, safe for filenames. */
function safeRunId(runId: string): string {
  return runId.slice(0, 8).replace(/[^a-z0-9]/gi, "");
}

function buildResumeText(output: TailoredOutput, runId: string): string {
  const { tailored_resume } = output;
  const hr = "=".repeat(72);
  const lines: string[] = [
    "TAILORED RESUME",
    `Generated by AfriTalent AI Assistant  |  Run: ${runId}`,
    hr,
    "",
  ];

  if (tailored_resume.summary) {
    lines.push("PROFESSIONAL SUMMARY", "", tailored_resume.summary, "");
  }
  if (tailored_resume.skills.length > 0) {
    lines.push("CORE SKILLS", "", tailored_resume.skills.join("  •  "), "");
  }
  if (tailored_resume.experience.length > 0) {
    lines.push("EXPERIENCE", "");
    for (const exp of tailored_resume.experience) {
      lines.push(`${exp.title}  |  ${exp.company}`, exp.period);
      for (const b of exp.bullets) lines.push(`  • ${b}`);
      lines.push("");
    }
  }
  if (tailored_resume.ats_keywords.length > 0) {
    lines.push("ATS KEYWORDS", "", tailored_resume.ats_keywords.join(", "), "");
  }
  if (tailored_resume.warnings.length > 0) {
    lines.push(hr, "REVIEW BEFORE SENDING", "");
    for (const w of tailored_resume.warnings) lines.push(`  ! ${w}`);
    lines.push("");
  }
  if (tailored_resume.change_log && tailored_resume.change_log.length > 0) {
    lines.push("CHANGES FROM ORIGINAL", "");
    for (const c of tailored_resume.change_log) lines.push(`  • ${c}`);
    lines.push("");
  }
  lines.push(hr);
  return lines.join("\n");
}

function buildCoverLetterText(output: TailoredOutput, runId: string): string {
  const { cover_letter_pack } = output;
  const hr = "=".repeat(72);
  return [
    cover_letter_pack.subject_line,
    hr,
    "",
    cover_letter_pack.salutation,
    "",
    cover_letter_pack.body,
    "",
    cover_letter_pack.closing,
    "",
    hr,
    `${cover_letter_pack.word_count} words  |  ${cover_letter_pack.tone} tone`,
    `Generated by AfriTalent AI Assistant  |  Run: ${runId}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────

function ApplyPackPanel({
  output,
  runId,
}: {
  output: TailoredOutput;
  runId: string;
}) {
  const { tailored_resume, cover_letter_pack, guard_report } = output;
  const [showCoverLetter, setShowCoverLetter] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SectionLabel>Apply Pack</SectionLabel>
        <Badge variant={guard_report.verdict === "PASS" ? "success" : "warning"}>
          Guard: {guard_report.verdict}
        </Badge>
      </div>

      {/* Tailored resume */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Tailored Resume
        </p>
        {tailored_resume.summary && (
          <p className="text-sm text-gray-600 mb-3">{tailored_resume.summary}</p>
        )}
        {tailored_resume.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tailored_resume.skills.map((s) => (
              <Badge key={s} variant="info">
                {s}
              </Badge>
            ))}
          </div>
        )}
        {tailored_resume.experience.length > 0 && (
          <div className="space-y-3">
            {tailored_resume.experience.map((exp, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900">
                  {exp.title} · {exp.company}
                </p>
                <p className="text-xs text-gray-500 mb-2">{exp.period}</p>
                <ul className="space-y-1">
                  {exp.bullets.map((b, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {tailored_resume.warnings.length > 0 && (
          <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
            <p className="text-xs font-medium text-yellow-800 mb-1">
              Review before sending:
            </p>
            <ul className="space-y-1">
              {tailored_resume.warnings.map((w, i) => (
                <li key={i} className="text-xs text-yellow-700">
                  ⚠ {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Cover letter */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Cover Letter
          </p>
          <button
            onClick={() => setShowCoverLetter((v) => !v)}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {showCoverLetter ? "Hide" : "Show"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
          <span className="truncate max-w-xs">{cover_letter_pack.subject_line}</span>
          <span>·</span>
          <span>{cover_letter_pack.word_count} words</span>
          <span>·</span>
          <span className="capitalize">{cover_letter_pack.tone} tone</span>
        </div>
        {showCoverLetter && (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {cover_letter_pack.salutation}
            {"\n\n"}
            {cover_letter_pack.body}
            {"\n\n"}
            {cover_letter_pack.closing}
          </div>
        )}
      </div>

      {/* Guard issues */}
      {guard_report.issues.length > 0 && (
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="text-xs font-medium text-red-800 mb-2">
            Guard report — issues detected:
          </p>
          <ul className="space-y-1.5">
            {guard_report.issues.map((issue, i) => (
              <li key={i} className="text-xs text-red-700">
                <span className="font-medium">{issue.field}:</span>{" "}
                {issue.type} ({issue.severity} severity)
              </li>
            ))}
          </ul>
        </div>
      )}

      {guard_report.requires_user_confirmation.length > 0 && (
        <div className="p-3 bg-yellow-50 rounded-lg">
          <p className="text-xs font-medium text-yellow-800 mb-1">
            Please verify before submitting:
          </p>
          <ul className="space-y-1">
            {guard_report.requires_user_confirmation.map((item, i) => (
              <li key={i} className="text-xs text-yellow-700">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Downloads */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2.5">
          Download
        </p>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            label="Tailored Resume"
            ext=".txt"
            onClick={() =>
              downloadBlob(
                buildResumeText(output, runId),
                "text/plain;charset=utf-8",
                `afritalent_apply_pack_${safeRunId(runId)}_tailored_resume.txt`
              )
            }
          />
          <DownloadButton
            label="Cover Letter"
            ext=".txt"
            onClick={() =>
              downloadBlob(
                buildCoverLetterText(output, runId),
                "text/plain;charset=utf-8",
                `afritalent_apply_pack_${safeRunId(runId)}_cover_letter.txt`
              )
            }
          />
          <DownloadButton
            label="Guard Report"
            ext=".json"
            onClick={() =>
              downloadBlob(
                JSON.stringify(guard_report, null, 2),
                "application/json;charset=utf-8",
                `afritalent_apply_pack_${safeRunId(runId)}_guard_report.json`
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIAssistantPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // ── Input state ────────────────────────────────────────────────────────────
  const [resumeText, setResumeText] = useState("");
  const [jobSlots, setJobSlots] = useState<JobSlot[]>([
    { id: makeSlotId(), text: "" },
  ]);

  // ── Operation state ────────────────────────────────────────────────────────
  const [activeOp, setActiveOp] = useState<ActiveOp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | null>(null);

  // ── Result buckets (each op writes to its own bucket) ─────────────────────
  const [analyzeResult, setAnalyzeResult] =
    useState<OrchestratorRunResponse | null>(null);
  const [matchResult, setMatchResult] =
    useState<OrchestratorRunResponse | null>(null);
  const [packResult, setPackResult] =
    useState<OrchestratorRunResponse | null>(null);

  // ── Selection ──────────────────────────────────────────────────────────────
  // Stores the job_id (= slot.id we passed) of the selected ranked job
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // ── Run history ───────────────────────────────────────────────────────────
  const [runHistory, setRunHistory] = useState<AiRunHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── Job picker ────────────────────────────────────────────────────────────
  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [jobSearchResults, setJobSearchResults] = useState<SearchJobResult[]>([]);
  const [jobSearchLoading, setJobSearchLoading] = useState(false);
  const [showJobDropdown, setShowJobDropdown] = useState(false);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  // ── Load run history on mount ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    getRunHistory(10)
      .then((runs) => {
        if (!cancelled) {
          setRunHistory(runs);
          setHistoryLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Debounced job search ──────────────────────────────────────────────────
  useEffect(() => {
    if (!jobSearchQuery.trim()) {
      setJobSearchResults([]);
      setShowJobDropdown(false);
      return;
    }
    const timer = setTimeout(() => {
      setJobSearchLoading(true);
      searchJobs(jobSearchQuery, 8)
        .then((jobs) => {
          setJobSearchResults(jobs);
          setShowJobDropdown(jobs.length > 0);
          setJobSearchLoading(false);
        })
        .catch(() => setJobSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [jobSearchQuery]);

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-emerald-600" />
      </div>
    );
  }

  // ── Slot helpers ───────────────────────────────────────────────────────────
  function addSlot() {
    if (jobSlots.length >= MAX_JOBS) return;
    setJobSlots((prev) => [...prev, { id: makeSlotId(), text: "" }]);
  }

  function removeSlot(id: string) {
    setJobSlots((prev) => prev.filter((s) => s.id !== id));
    if (selectedJobId === id) setSelectedJobId(null);
  }

  function updateSlot(id: string, text: string) {
    setJobSlots((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  }

  function handleSelectJob(job: SearchJobResult) {
    const emptySlotIdx = jobSlots.findIndex((s) => s.text.trim() === "");
    if (emptySlotIdx >= 0) {
      setJobSlots((prev) =>
        prev.map((s, i) =>
          i === emptySlotIdx ? { ...s, text: job.rawText, id: job.id } : s
        )
      );
    } else if (jobSlots.length < MAX_JOBS) {
      setJobSlots((prev) => [...prev, { id: job.id, text: job.rawText }]);
    }
    setJobSearchQuery("");
    setShowJobDropdown(false);
  }

  // ── Core runner ─────────────────────────────────────────────────────────────
  async function run(op: ActiveOp, payload: OrchestratorRunPayload) {
    setActiveOp(op);
    setError(null);
    setFieldErrors(null);

    try {
      const result = await runOrchestrator(payload);
      if (op === "analyze") {
        setAnalyzeResult(result);
      } else if (op === "match") {
        setMatchResult(result);
        setSelectedJobId(null); // clear selection on new match
        setPackResult(null);    // clear stale apply pack
      } else {
        setPackResult(result);
      }
    } catch (err) {
      if (err instanceof OrchestratorError) {
        setError(err.message);
        const details = err.response?.details as
          | { fieldErrors?: FieldErrors }
          | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
      } else {
        setError("Unexpected error — please try again.");
      }
    } finally {
      setActiveOp(null);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const validSlots = jobSlots.filter((s) => s.text.length >= 50);
  const selectedJob: RankedJob | null =
    matchResult?.ranked_jobs.find((j) => j.job_id === selectedJobId) ?? null;
  const applyPackEnabled =
    activeOp === null &&
    selectedJob !== null &&
    selectedJob.match.score >= APPLY_PACK_THRESHOLD;
  // Resume facts come from whichever run last parsed the resume
  const resumeResult = matchResult ?? analyzeResult;

  // ── Action handlers ────────────────────────────────────────────────────────
  function handleAnalyze() {
    run("analyze", {
      run_type: "resume_review",
      resume_text: resumeText,
      limits: { token_budget_total: 15_000 },
    });
  }

  function handleMatch() {
    // Scale token budget with job count (12k per job, capped at 120k)
    const budget = Math.min(120_000, Math.max(30_000, validSlots.length * 12_000));
    run("match", {
      run_type: "job_match",
      resume_text: resumeText,
      // Pass slot.id as job_id so ranked results map back to slots
      jobs: validSlots.map((s) => ({ raw_text: s.text, job_id: s.id })),
      limits: {
        max_jobs: validSlots.length,
        max_tailored_jobs: 1,
        token_budget_total: budget,
      },
      // Reuse cached resume_json from a previous run to save tokens
      ...(analyzeResult?.resume_json
        ? { cached: { resume_json: analyzeResult.resume_json } }
        : {}),
    });
  }

  function handleApplyPack() {
    if (!selectedJob) return;
    const slot = jobSlots.find((s) => s.id === selectedJobId);
    if (!slot) return;

    const latestResumeJson =
      matchResult?.resume_json ?? analyzeResult?.resume_json;

    const cached: OrchestratorRunPayload["cached"] = {
      ...(latestResumeJson ? { resume_json: latestResumeJson } : {}),
      job_json_by_job_id: { [selectedJob.job_id]: selectedJob.job_json },
    };

    run("pack", {
      run_type: "apply_pack",
      resume_text: resumeText,
      jobs: [{ raw_text: slot.text, job_id: selectedJob.job_id }],
      limits: { max_jobs: 1, max_tailored_jobs: 1, token_budget_total: 60_000 },
      cached,
    });
  }

  // ── Meta for results header ────────────────────────────────────────────────
  // Pick the most recent result for the header badge/run_id/token display
  const latestResult = packResult ?? matchResult ?? analyzeResult;
  const hasAnyResult = latestResult !== null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Page header */}
      <div className="mb-8">
        <Link
          href="/candidate"
          className="inline-flex items-center text-sm text-emerald-600 hover:text-emerald-700 mb-3"
        >
          <svg
            className="w-4 h-4 mr-1.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Assistant</h1>
        <p className="text-gray-600">
          Paste your resume and up to {MAX_JOBS} job descriptions to get ranked
          match scores, gap analysis, and a tailored apply pack for your best fit.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs ──────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Step 1 · Resume */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <StepBadge n={1} />
                <h2 className="font-semibold text-gray-900">Your Resume</h2>
              </div>
            </CardHeader>
            <CardContent>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume text here (plain text or Markdown)…"
                rows={10}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-y"
              />
              <FieldError errors={fieldErrors} field="resume_text" />
              <div className="mt-3 flex items-center justify-between">
                <CharCount current={resumeText.length} max={30_000} min={100} />
                <Button
                  onClick={handleAnalyze}
                  disabled={resumeText.length < 100 || activeOp !== null}
                  size="sm"
                >
                  {activeOp === "analyze" ? (
                    <LoadingLabel label="Analyzing…" />
                  ) : (
                    "Analyze Resume"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step 2 · Job descriptions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <StepBadge n={2} />
                  <h2 className="font-semibold text-gray-900">
                    Job Descriptions
                  </h2>
                </div>
                <span className="text-xs text-gray-400">
                  {jobSlots.length}/{MAX_JOBS}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Job Picker */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search jobs from database
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={jobSearchQuery}
                    onChange={(e) => setJobSearchQuery(e.target.value)}
                    placeholder="Search by title, company, or keyword…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {jobSearchLoading && (
                    <span className="absolute right-3 top-2.5">
                      <Spinner className="w-4 h-4 text-gray-400" />
                    </span>
                  )}
                </div>
                {showJobDropdown && jobSearchResults.length > 0 && (
                  <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {jobSearchResults.map((job) => (
                      <li key={job.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm"
                          onClick={() => handleSelectJob(job)}
                        >
                          <span className="font-medium">{job.title}</span>
                          <span className="text-gray-500 ml-2">@ {job.company}</span>
                          <span className="text-gray-400 ml-2 text-xs">{job.location}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Or paste a job description manually below
                </p>
              </div>

              {jobSlots.map((slot, idx) => (
                <div key={slot.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-500">
                      Job {idx + 1}
                    </span>
                    {jobSlots.length > 1 && (
                      <button
                        onClick={() => removeSlot(slot.id)}
                        disabled={activeOp !== null}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        aria-label={`Remove job ${idx + 1}`}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <textarea
                    value={slot.text}
                    onChange={(e) => updateSlot(slot.id, e.target.value)}
                    placeholder="Paste the full job description here…"
                    rows={5}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-y"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <CharCount current={slot.text.length} max={20_000} min={50} />
                  </div>
                </div>
              ))}

              <FieldError errors={fieldErrors} field="jobs" />

              {/* Add job + Match button row */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addSlot}
                  disabled={jobSlots.length >= MAX_JOBS || activeOp !== null}
                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                >
                  + Add Job
                  {jobSlots.length >= MAX_JOBS && (
                    <span className="ml-1 text-gray-400">(max {MAX_JOBS})</span>
                  )}
                </Button>
                <Button
                  onClick={handleMatch}
                  disabled={
                    resumeText.length < 100 ||
                    validSlots.length === 0 ||
                    activeOp !== null
                  }
                  size="sm"
                >
                  {activeOp === "match" ? (
                    <LoadingLabel
                      label={`Matching ${validSlots.length} job${validSlots.length !== 1 ? "s" : ""}…`}
                    />
                  ) : (
                    `Match Job${validSlots.length !== 1 ? "s" : ""}`
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step 3 · Apply pack */}
          <Card className={!selectedJob ? "opacity-60" : ""}>
            <CardContent>
              <div className="flex items-start justify-between gap-4 py-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <StepBadge n={3} />
                    <h2 className="font-semibold text-gray-900">Apply Pack</h2>
                  </div>
                  <p className="text-xs text-gray-500 ml-9 truncate">
                    {!matchResult
                      ? "Match jobs first, then select one"
                      : !selectedJob
                      ? "Select a job from the results →"
                      : selectedJob.match.score < APPLY_PACK_THRESHOLD
                      ? `Score ${selectedJob.match.score} — below threshold (${APPLY_PACK_THRESHOLD})`
                      : "Tailored resume · cover letter · guard check"}
                  </p>
                  {selectedJob &&
                    selectedJob.match.score >= APPLY_PACK_THRESHOLD && (
                      <p className="text-xs text-emerald-600 font-medium mt-1 ml-9">
                        ✓ Score {selectedJob.match.score}/100 — eligible
                      </p>
                    )}
                </div>
                <Button
                  onClick={handleApplyPack}
                  disabled={!applyPackEnabled}
                  variant={applyPackEnabled ? "primary" : "secondary"}
                  size="sm"
                  className="shrink-0"
                >
                  {activeOp === "pack" ? (
                    <LoadingLabel label="Generating…" />
                  ) : (
                    "Generate Apply Pack"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Results ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-3">

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4">
              <p className="font-medium text-sm mb-1">Error</p>
              <p className="text-sm">{error}</p>
              {fieldErrors && (
                <ul className="mt-2 space-y-0.5">
                  {Object.entries(fieldErrors).map(([field, msgs]) => (
                    <li key={field} className="text-xs">
                      <span className="font-medium">{field}:</span>{" "}
                      {msgs.join(", ")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Loading — no results yet */}
          {activeOp !== null && !hasAnyResult && (
            <Card>
              <CardContent className="py-16">
                <div className="flex flex-col items-center gap-3 text-gray-500">
                  <Spinner className="h-8 w-8 text-emerald-600" />
                  <p className="text-sm font-medium">
                    {activeOp === "analyze" && "Analyzing your resume…"}
                    {activeOp === "match" &&
                      `Matching ${validSlots.length} job${validSlots.length !== 1 ? "s" : ""}…`}
                    {activeOp === "pack" && "Generating apply pack…"}
                  </p>
                  <p className="text-xs text-gray-400">Usually takes 10–30 seconds</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {activeOp === null && !hasAnyResult && !error && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <p className="text-gray-600 font-medium mb-1">Ready when you are</p>
              <p className="text-gray-400 text-sm max-w-xs">
                Paste your resume, add one or more job descriptions, then click{" "}
                <span className="text-gray-500 font-medium">Match Jobs</span>.
              </p>
            </div>
          )}

          {/* Results card */}
          {hasAnyResult && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900">Results</h2>
                    {activeOp !== null && (
                      <Spinner className="h-4 w-4 text-emerald-600" />
                    )}
                    {activeOp === null && latestResult && (
                      <Badge
                        variant={
                          latestResult.status === "ok"
                            ? "success"
                            : latestResult.status === "partial"
                            ? "warning"
                            : "danger"
                        }
                      >
                        {latestResult.status.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {latestResult && (
                      <>
                        <span title={latestResult.run_id}>
                          ID: {shortId(latestResult.run_id)}
                        </span>
                        <span>
                          {latestResult.budget.token_used_estimate.toLocaleString()}{" "}
                          tokens
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="divide-y divide-gray-100">

                {/* Resume facts */}
                {resumeResult?.resume_json && (
                  <div className="py-5 first:pt-0">
                    <ResumePanel result={resumeResult} />
                  </div>
                )}

                {/* Ranked jobs list */}
                {matchResult && matchResult.ranked_jobs.length > 0 && (
                  <div className="py-5">
                    <div className="flex items-center justify-between mb-3">
                      <SectionLabel>
                        Ranked Jobs ({matchResult.ranked_jobs.length})
                      </SectionLabel>
                      {selectedJob && (
                        <button
                          onClick={() => setSelectedJobId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {matchResult.ranked_jobs.map((job, i) => (
                        <RankedJobRow
                          key={job.job_id}
                          job={job}
                          rank={i + 1}
                          isSelected={job.job_id === selectedJobId}
                          onSelect={() =>
                            setSelectedJobId(
                              job.job_id === selectedJobId ? null : job.job_id
                            )
                          }
                        />
                      ))}
                    </div>

                    {/* Expanded detail for selected job */}
                    {selectedJob && (
                      <SelectedJobDetail job={selectedJob} />
                    )}
                  </div>
                )}

                {/* Apply pack */}
                {packResult?.tailored_outputs[0] && (
                  <div className="py-5">
                    <ApplyPackPanel
                      output={packResult.tailored_outputs[0]}
                      runId={packResult.run_id}
                    />
                  </div>
                )}

                {/* Blocked / no output */}
                {latestResult?.status === "blocked" &&
                  !matchResult?.ranked_jobs.length &&
                  !packResult?.tailored_outputs.length &&
                  !resumeResult?.resume_json && (
                    <div className="py-5">
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-sm text-red-700 font-medium">
                          {latestResult.error ?? "Run blocked"}
                        </p>
                        {latestResult.budget.stopped_reason && (
                          <p className="text-xs text-red-500 mt-1">
                            Stopped: {latestResult.budget.stopped_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                {/* Notes only */}
                {analyzeResult &&
                  !analyzeResult.resume_json &&
                  analyzeResult.notes_for_ui.length > 0 && (
                    <div className="py-5">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Notes
                      </p>
                      <ul className="space-y-1">
                        {analyzeResult.notes_for_ui.map((note, i) => (
                          <li key={i} className="flex gap-2 text-sm text-gray-600">
                            <span className="text-emerald-500 shrink-0">•</span>
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          {/* Run History Toggle */}
          <div className="mt-6 border-t pt-4">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-emerald-600"
            >
              <span>{showHistory ? "\u25B2" : "\u25BC"}</span>
              <span>Recent Runs ({runHistory.length})</span>
              {historyLoading && <Spinner className="w-3 h-3" />}
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2">
                {runHistory.length === 0 && !historyLoading && (
                  <p className="text-sm text-gray-500 italic">
                    No previous runs found.
                  </p>
                )}
                {runHistory.map((run) => {
                  const sortedJobs = [...run.jobs].sort(
                    (a, b) => (b.score ?? 0) - (a.score ?? 0)
                  );
                  const topJob = sortedJobs[0];
                  const topScore = topJob?.score ?? null;
                  const statusColor =
                    run.status === "COMPLETE"
                      ? "emerald"
                      : run.status === "PARTIAL"
                      ? "yellow"
                      : "red";

                  return (
                    <div
                      key={run.id}
                      className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        alert(
                          `Run ${run.runId.slice(0, 8)}: ${run.notes.join(", ") || "No notes"}`
                        );
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium bg-${statusColor}-100 text-${statusColor}-700`}
                          >
                            {run.status}
                          </span>
                          <span className="text-gray-600">
                            {run.runType.replace("_", " ")}
                          </span>
                          {topJob?.jobTitle && (
                            <span className="text-gray-500">
                              — {topJob.jobTitle}
                              {topJob.jobCompany
                                ? ` @ ${topJob.jobCompany}`
                                : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-gray-400">
                          {topScore !== null && (
                            <span className="font-semibold text-emerald-600">
                              {topScore}%
                            </span>
                          )}
                          <span>
                            {new Date(run.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {run.jobs.length > 0 && (
                        <div className="mt-1 flex gap-3 text-xs text-gray-400">
                          <span>
                            {run.jobs.length} job
                            {run.jobs.length !== 1 ? "s" : ""}
                          </span>
                          <span>
                            {Math.round(run.tokenBudgetUsed / 1000)}k tokens
                            used
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small inline components ────────────────────────────────────────────────────

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0">
      {n}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
      {children}
    </p>
  );
}

function CharCount({
  current,
  min,
  max,
}: {
  current: number;
  min: number;
  max: number;
}) {
  const ok = current === 0 || current >= min;
  return (
    <span className={`text-xs ${ok ? "text-gray-400" : "text-amber-500"}`}>
      {current.toLocaleString()} / {max.toLocaleString()}
      {!ok && ` (min ${min})`}
    </span>
  );
}

function FieldError({
  errors,
  field,
}: {
  errors: FieldErrors | null;
  field: string;
}) {
  const msgs = errors?.[field];
  if (!msgs?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{msgs[0]}</p>;
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <Spinner className="h-3.5 w-3.5 text-white" />
      {label}
    </span>
  );
}

function DownloadButton({
  label,
  ext,
  onClick,
}: {
  label: string;
  ext: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
    >
      <svg
        className="w-3.5 h-3.5 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      {label}
      <span className="text-gray-400">{ext}</span>
    </button>
  );
}
