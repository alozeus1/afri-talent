"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Download, Lightbulb, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { runOrchestrator, OrchestratorError, getRunHistory, searchJobs } from "@/lib/api/orchestratorClient";
import { profile } from "@/lib/api";
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
import {
  CandidateBackLink,
  CandidateErrorAlert,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  candidateFieldClass,
  candidateLabelClass,
  toCandidateFriendly,
  type CandidateFriendlyError,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import {
  enumLabel,
  useCandidateFormatters,
  useCandidateT,
  type CandidateMessageKey,
  type CandidateT,
} from "@/lib/i18n/candidate-messages";

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
      aria-hidden="true"
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

function ScoreBar({ value, tone = "primary", label }: { value: number; tone?: "primary" | "info"; label: string }) {
  const bar = tone === "primary" ? "bg-primary" : "bg-info";
  const text = tone === "primary" ? "text-primary-text" : "text-info";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(value, 100)}
      >
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`w-8 text-end text-xs font-semibold tabular-nums ${text}`}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{children}</p>;
}

function StepBadge({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-text"
    >
      {n}
    </span>
  );
}

function CharCount({ current, min, max }: { current: number; min: number; max: number }) {
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const ok = current === 0 || current >= min;
  const vars = { current: fmt.number(current), max: fmt.number(max), min: fmt.number(min) };
  return (
    <span className={`text-xs tabular-nums ${ok ? "text-fg-muted" : "text-warning"}`}>
      {ok ? t("aa.chars", vars) : t("aa.charsMin", vars)}
    </span>
  );
}

function FieldError({ errors, field }: { errors: FieldErrors | null; field: string }) {
  const msgs = errors?.[field];
  if (!msgs?.length) return null;
  return <p className="mt-1 text-xs text-danger">{msgs[0]}</p>;
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <Spinner className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function DownloadButton({ label, ext, onClick }: { label: string; ext: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Download className="h-3.5 w-3.5 text-fg-muted" aria-hidden="true" />
      {label}
      <span className="text-fg-muted">{ext}</span>
    </button>
  );
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function ResumePanel({ result }: { result: OrchestratorRunResponse }) {
  const t = useCandidateT();
  const r = result.resume_json;
  if (!r) return null;

  return (
    <div>
      <SectionLabel>{t("aa.analysis.title")}</SectionLabel>
      <dl className="mb-3 mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-secondary">
        {r.name && (
          <div className="flex gap-1">
            <dt className="font-medium text-fg">{t("aa.analysis.name")}:</dt>
            <dd>{r.name}</dd>
          </div>
        )}
        {r.years_of_experience != null && (
          <div className="flex gap-1">
            <dt className="font-medium text-fg">{t("aa.analysis.experience")}:</dt>
            <dd>{t("aa.analysis.years", { count: r.years_of_experience })}</dd>
          </div>
        )}
        {r.skills.length > 0 && (
          <div className="flex gap-1">
            <dt className="font-medium text-fg">{t("aa.analysis.skills")}:</dt>
            <dd>{t("aa.analysis.skillsCount", { count: r.skills.length })}</dd>
          </div>
        )}
        {r.work_auth_status && (
          <div className="flex gap-1">
            <dt className="font-medium text-fg">{t("aa.analysis.workAuth")}:</dt>
            <dd>{r.work_auth_status}</dd>
          </div>
        )}
      </dl>
      {r.skills.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {r.skills.slice(0, 12).map((s) => (
            <Badge key={s} variant="info">
              {s}
            </Badge>
          ))}
          {r.skills.length > 12 && <Badge variant="default">{t("aa.analysis.more", { count: r.skills.length - 12 })}</Badge>}
        </div>
      )}
      {result.notes_for_ui.length > 0 && (
        <ul className="list-disc space-y-1 ps-5 text-sm text-fg-secondary marker:text-primary-text" dir="auto">
          {result.notes_for_ui.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const t = useCandidateT();
  const { match, job_json } = job;
  const title = job_json.title ?? t("aa.ranked.fallbackTitle", { n: rank });
  const company = job_json.company;
  const eligible = match.score >= APPLY_PACK_THRESHOLD;

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        isSelected ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isSelected ? "bg-primary text-primary-fg" : "bg-surface-muted text-fg-muted"
            }`}
          >
            {rank}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg" dir="auto">
              {title}
              {company && <span className="font-normal text-fg-muted"> · {company}</span>}
            </p>
            {job_json.visa_sponsorship === "YES" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-text">
                <Check className="h-3 w-3" aria-hidden="true" />
                {t("aa.ranked.visa")}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant={isSelected ? "primary" : "outline"} onClick={onSelect} className="shrink-0" aria-pressed={isSelected}>
          {isSelected ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {t("aa.ranked.selected")}
            </>
          ) : (
            t("aa.ranked.select")
          )}
        </Button>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <div>
          <p className="mb-0.5 text-xs text-fg-muted">{t("aa.ranked.matchScore")}</p>
          <ScoreBar value={match.score} tone="primary" label={t("aa.ranked.matchScore")} />
        </div>
        <div>
          <p className="mb-0.5 text-xs text-fg-muted">{t("aa.ranked.coverage")}</p>
          <ScoreBar value={match.must_have_coverage_pct} tone="info" label={t("aa.ranked.coverage")} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={REC_VARIANT[match.recommendation] ?? "default"}>{enumLabel(t, "aa.rec", match.recommendation)}</Badge>
        {!eligible && <span className="text-xs text-fg-muted">{t("aa.ranked.below", { threshold: APPLY_PACK_THRESHOLD })}</span>}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "success" | "danger" | "warning"; children: ReactNode }) {
  const tones = {
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

function SelectedJobDetail({ job }: { job: RankedJob }) {
  const t = useCandidateT();
  const { match, job_json } = job;

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <SectionLabel>{t("aa.detail.why")}</SectionLabel>
      {match.matched_skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {match.matched_skills.map((s) => (
            <Chip key={s} tone="success">
              <Check className="h-3 w-3" aria-hidden="true" /> {s}
            </Chip>
          ))}
        </div>
      )}
      {match.missing_must_haves.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">{t("aa.detail.gaps")}</p>
          <div className="flex flex-wrap gap-1.5">
            {match.missing_must_haves.map((s) => (
              <Chip key={s} tone="danger">
                <X className="h-3 w-3" aria-hidden="true" /> {s}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {match.missing_nice_to_haves.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">{t("aa.detail.nice")}</p>
          <div className="flex flex-wrap gap-1.5">
            {match.missing_nice_to_haves.map((s) => (
              <Chip key={s} tone="warning">
                {s}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {match.explanation && (
        <p className="border-s-2 border-success-line ps-3 text-sm italic text-fg-secondary" dir="auto">
          {match.explanation}
        </p>
      )}
      {job_json.requirements.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">{t("aa.detail.requirements")}</p>
          <ul className="list-disc space-y-1 ps-5 text-xs text-fg-secondary" dir="auto">
            {job_json.requirements.slice(0, 5).map((r, i) => (
              <li key={i}>{r}</li>
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

function buildResumeText(output: TailoredOutput, runId: string, t: CandidateT): string {
  const { tailored_resume } = output;
  const hr = "=".repeat(72);
  const lines: string[] = [t("aa.doc.resumeTitle"), t("aa.doc.generated", { id: runId }), hr, ""];

  if (tailored_resume.summary) lines.push(t("aa.doc.summary"), "", tailored_resume.summary, "");
  if (tailored_resume.skills.length > 0) lines.push(t("aa.doc.skills"), "", tailored_resume.skills.join("  •  "), "");
  if (tailored_resume.experience.length > 0) {
    lines.push(t("aa.doc.experience"), "");
    for (const exp of tailored_resume.experience) {
      lines.push(`${exp.title}  |  ${exp.company}`, exp.period);
      for (const b of exp.bullets) lines.push(`  • ${b}`);
      lines.push("");
    }
  }
  if (tailored_resume.ats_keywords.length > 0) lines.push(t("aa.doc.keywords"), "", tailored_resume.ats_keywords.join(", "), "");
  if (tailored_resume.warnings.length > 0) {
    lines.push(hr, t("aa.doc.review"), "");
    for (const w of tailored_resume.warnings) lines.push(`  ! ${w}`);
    lines.push("");
  }
  if (tailored_resume.change_log && tailored_resume.change_log.length > 0) {
    lines.push(t("aa.doc.changes"), "");
    for (const c of tailored_resume.change_log) lines.push(`  • ${c}`);
    lines.push("");
  }
  lines.push(hr);
  return lines.join("\n");
}

function buildCoverLetterText(output: TailoredOutput, runId: string, t: CandidateT): string {
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
    t("aa.doc.letterMeta", { words: cover_letter_pack.word_count, tone: cover_letter_pack.tone }),
    t("aa.doc.generated", { id: runId }),
  ].join("\n");
}

function ApplyPackPanel({ output, runId }: { output: TailoredOutput; runId: string }) {
  const t = useCandidateT();
  const { tailored_resume, cover_letter_pack, guard_report } = output;
  const [showCoverLetter, setShowCoverLetter] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel>{t("aa.pack.title")}</SectionLabel>
        <Badge variant={guard_report.verdict === "PASS" ? "success" : "warning"}>
          {t("aa.packPanel.guard", { verdict: guard_report.verdict })}
        </Badge>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">{t("aa.packPanel.resume")}</p>
        {tailored_resume.summary && (
          <p className="mb-3 text-sm text-fg-secondary" dir="auto">
            {tailored_resume.summary}
          </p>
        )}
        {tailored_resume.skills.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
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
              <div key={i} className="rounded-xl bg-surface-sunken p-3" dir="auto">
                <p className="text-sm font-medium text-fg">
                  {exp.title} · {exp.company}
                </p>
                <p className="mb-2 text-xs text-fg-muted">{exp.period}</p>
                <ul className="list-disc space-y-1 ps-5 text-xs text-fg-secondary marker:text-primary-text">
                  {exp.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {tailored_resume.warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-warning-line bg-warning-soft p-3">
            <p className="mb-1 text-xs font-medium text-fg">{t("aa.packPanel.review")}</p>
            <ul className="list-disc space-y-1 ps-5 text-xs text-fg-secondary" dir="auto">
              {tailored_resume.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{t("aa.packPanel.coverLetter")}</p>
          <button
            type="button"
            onClick={() => setShowCoverLetter((v) => !v)}
            aria-expanded={showCoverLetter}
            className="text-xs font-medium text-primary-text hover:underline"
          >
            {showCoverLetter ? t("aa.packPanel.hide") : t("aa.packPanel.show")}
          </button>
        </div>
        <div className="mb-2 flex flex-wrap gap-2 text-xs text-fg-muted">
          <span className="max-w-xs truncate">{cover_letter_pack.subject_line}</span>
          <span aria-hidden="true">·</span>
          <span>{t("aa.packPanel.words", { count: cover_letter_pack.word_count })}</span>
          <span aria-hidden="true">·</span>
          <span>{t("aa.packPanel.tone", { tone: cover_letter_pack.tone })}</span>
        </div>
        {showCoverLetter && (
          <div className="whitespace-pre-wrap rounded-xl bg-surface-sunken p-4 text-sm leading-relaxed text-fg-secondary" dir="auto">
            {cover_letter_pack.salutation}
            {"\n\n"}
            {cover_letter_pack.body}
            {"\n\n"}
            {cover_letter_pack.closing}
          </div>
        )}
      </div>

      {guard_report.issues.length > 0 && (
        <div className="rounded-xl border border-danger-line bg-danger-soft p-3">
          <p className="mb-2 text-xs font-medium text-fg">{t("aa.packPanel.issues")}</p>
          <ul className="space-y-1.5 text-xs text-fg-secondary">
            {guard_report.issues.map((issue, i) => (
              <li key={i}>
                {t("aa.packPanel.issue", { field: issue.field, type: issue.type, severity: issue.severity })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {guard_report.requires_user_confirmation.length > 0 && (
        <div className="rounded-xl border border-warning-line bg-warning-soft p-3">
          <p className="mb-1 text-xs font-medium text-fg">{t("aa.packPanel.confirm")}</p>
          <ul className="list-disc space-y-1 ps-5 text-xs text-fg-secondary" dir="auto">
            {guard_report.requires_user_confirmation.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-line pt-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-fg-muted">{t("aa.packPanel.download")}</p>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            label={t("aa.packPanel.dlResume")}
            ext=".txt"
            onClick={() =>
              downloadBlob(
                buildResumeText(output, runId, t),
                "text/plain;charset=utf-8",
                `afritalent_apply_pack_${safeRunId(runId)}_tailored_resume.txt`,
              )
            }
          />
          <DownloadButton
            label={t("aa.packPanel.dlLetter")}
            ext=".txt"
            onClick={() =>
              downloadBlob(
                buildCoverLetterText(output, runId, t),
                "text/plain;charset=utf-8",
                `afritalent_apply_pack_${safeRunId(runId)}_cover_letter.txt`,
              )
            }
          />
          <DownloadButton
            label={t("aa.packPanel.dlGuard")}
            ext=".json"
            onClick={() =>
              downloadBlob(
                JSON.stringify(guard_report, null, 2),
                "application/json;charset=utf-8",
                `afritalent_apply_pack_${safeRunId(runId)}_guard_report.json`,
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

function RunHistoryItem({ run }: { run: AiRunHistory }) {
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const [open, setOpen] = useState(false);
  const sortedJobs = [...run.jobs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topJob = sortedJobs[0];
  const topScore = topJob?.score ?? null;
  const statusVariant = run.status === "COMPLETE" ? "success" : run.status === "PARTIAL" ? "warning" : run.status === "RUNNING" ? "info" : "danger";

  return (
    <li className="rounded-xl border border-line bg-surface-sunken text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full p-3 text-start hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant={statusVariant}>{enumLabel(t, "aa.runStatus", run.status)}</Badge>
            <span className="text-fg-secondary">{enumLabel(t, "aa.runType", run.runType)}</span>
            {topJob?.jobTitle && (
              <span className="truncate text-fg-muted">
                — {topJob.jobTitle}
                {topJob.jobCompany ? ` · ${topJob.jobCompany}` : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-fg-muted">
            {topScore !== null && <span className="font-semibold tabular-nums text-primary-text">{topScore}%</span>}
            <span>{fmt.date(run.createdAt)}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </div>
        </div>
        {run.jobs.length > 0 && (
          <div className="mt-1 flex gap-3 text-xs text-fg-muted">
            <span>{t("aa.history.jobs", { count: run.jobs.length })}</span>
            <span>{t("aa.history.tokens", { count: Math.round(run.tokenBudgetUsed / 1000) })}</span>
          </div>
        )}
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2 text-xs text-fg-secondary">
          <p className="mb-1 text-fg-muted">{t("aa.runId", { id: shortId(run.runId) })}</p>
          {run.notes.length > 0 ? (
            <ul className="list-disc space-y-0.5 ps-5" dir="auto">
              {run.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : (
            <p>{t("aa.history.noNotes")}</p>
          )}
        </div>
      )}
    </li>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIAssistantPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const { user, isLoading } = useAuth();

  const [resumeText, setResumeText] = useState("");
  const [resumeUploadStatus, setResumeUploadStatus] = useState<{ key: CandidateMessageKey; file?: string } | null>(null);
  const [jobSlots, setJobSlots] = useState<JobSlot[]>([{ id: makeSlotId(), text: "" }]);

  const [activeOp, setActiveOp] = useState<ActiveOp | null>(null);
  const [error, setError] = useState<CandidateFriendlyError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | null>(null);

  const [analyzeResult, setAnalyzeResult] = useState<OrchestratorRunResponse | null>(null);
  const [matchResult, setMatchResult] = useState<OrchestratorRunResponse | null>(null);
  const [packResult, setPackResult] = useState<OrchestratorRunResponse | null>(null);

  // Stores the job_id (= slot.id we passed) of the selected ranked job
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const [runHistory, setRunHistory] = useState<AiRunHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [jobSearchResults, setJobSearchResults] = useState<SearchJobResult[]>([]);
  const [jobSearchLoading, setJobSearchLoading] = useState(false);
  const [showJobDropdown, setShowJobDropdown] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    getRunHistory(10)
      .then((runs) => {
        if (!cancelled) setRunHistory(runs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        })
        .catch(() => {})
        .finally(() => setJobSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [jobSearchQuery]);

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

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
      setJobSlots((prev) => prev.map((s, i) => (i === emptySlotIdx ? { ...s, text: job.rawText, id: job.id } : s)));
    } else if (jobSlots.length < MAX_JOBS) {
      setJobSlots((prev) => [...prev, { id: job.id, text: job.rawText }]);
    }
    setJobSearchQuery("");
    setShowJobDropdown(false);
  }

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
        setSelectedJobId(null);
        setPackResult(null);
      } else {
        setPackResult(result);
      }
      getRunHistory(10).then(setRunHistory).catch(console.error);
    } catch (err) {
      if (err instanceof OrchestratorError) {
        setError(toCandidateFriendly({ status: err.httpStatus }, t));
        const details = err.response?.details as { fieldErrors?: FieldErrors } | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
      } else {
        setError({ title: t("aa.error"), description: t("aa.unexpected"), tone: "error" });
      }
    } finally {
      setActiveOp(null);
    }
  }

  const validSlots = jobSlots.filter((s) => s.text.length >= 50);
  const selectedJob: RankedJob | null = matchResult?.ranked_jobs.find((j) => j.job_id === selectedJobId) ?? null;
  const applyPackEnabled = activeOp === null && selectedJob !== null && selectedJob.match.score >= APPLY_PACK_THRESHOLD;
  const resumeResult = matchResult ?? analyzeResult;

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
      jobs: validSlots.map((s) => ({ raw_text: s.text, job_id: s.id })),
      limits: { max_jobs: validSlots.length, max_tailored_jobs: 1, token_budget_total: budget },
      ...(analyzeResult?.resume_json ? { cached: { resume_json: analyzeResult.resume_json } } : {}),
    });
  }

  function handleApplyPack() {
    if (!selectedJob) return;
    const slot = jobSlots.find((s) => s.id === selectedJobId);
    if (!slot) return;
    const latestResumeJson = matchResult?.resume_json ?? analyzeResult?.resume_json;
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

  async function handleResumeUpload(file: File) {
    setResumeUploadStatus(null);
    setError(null);
    const fail = (key: CandidateMessageKey) => setError({ title: t("aa.error"), description: t(key), tone: "warning" });

    const lowerName = file.name.toLowerCase();
    const isText = lowerName.endsWith(".txt") || lowerName.endsWith(".md");
    const isDocument = lowerName.endsWith(".pdf") || lowerName.endsWith(".doc") || lowerName.endsWith(".docx");

    if (!isText && !isDocument) return fail("aa.upload.badType");
    if (file.size > 5 * 1024 * 1024) return fail("aa.upload.tooBig");

    try {
      if (isText) {
        const text = await file.text();
        if (text.trim().length < 40) return fail("aa.upload.tooShort");
        setResumeText(text);
        setResumeUploadStatus({ key: "aa.upload.textLoaded" });
        return;
      }
      const parsed = await profile.parseResume(file);
      if (!parsed.parsed.rawText || parsed.parsed.rawText.trim().length < 40) return fail("aa.upload.tooShort");
      setResumeText(parsed.parsed.rawText);
      setResumeUploadStatus({ key: "aa.upload.extracted", file: file.name });
    } catch {
      fail("aa.upload.failed");
    }
  }

  const latestResult = packResult ?? matchResult ?? analyzeResult;
  const hasAnyResult = latestResult !== null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("ai.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader title={t("aa.title")} description={t("aa.subtitle", { max: MAX_JOBS })} />

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <StepBadge n={1} />
                <h2 className="font-semibold text-fg">
                  <span className="sr-only">{t("aa.step", { n: 1 })}: </span>
                  {t("aa.resume.title")}
                </h2>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label htmlFor="aa-resume-file" className={candidateLabelClass}>
                  {t("aa.resume.upload")}
                </label>
                <input
                  id="aa-resume-file"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void handleResumeUpload(file);
                  }}
                  className="block w-full text-sm text-fg-muted file:me-4 file:rounded-md file:border-0 file:bg-primary-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-text hover:file:bg-surface-muted"
                />
                <p className="mt-1.5 text-xs text-fg-muted">{t("aa.resume.uploadHint")}</p>
                {resumeUploadStatus && (
                  <CandidateNotice tone="success" className="mt-2 text-xs">
                    {t(resumeUploadStatus.key, resumeUploadStatus.file ? { file: resumeUploadStatus.file } : undefined)}
                  </CandidateNotice>
                )}
              </div>

              <label htmlFor="aa-resume-text" className={candidateLabelClass}>
                {t("aa.resume.textLabel")}
              </label>
              <textarea
                id="aa-resume-text"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder={t("aa.resume.placeholder")}
                rows={10}
                dir="auto"
                className={`${candidateFieldClass} resize-y`}
              />
              <FieldError errors={fieldErrors} field="resume_text" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <CharCount current={resumeText.length} max={30_000} min={100} />
                <Button onClick={handleAnalyze} disabled={resumeText.length < 100 || activeOp !== null} size="sm">
                  {activeOp === "analyze" ? <LoadingLabel label={t("aa.resume.analyzing")} /> : t("aa.resume.analyze")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-fg-muted">{t("aa.resume.privacy")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <StepBadge n={2} />
                  <h2 className="font-semibold text-fg">
                    <span className="sr-only">{t("aa.step", { n: 2 })}: </span>
                    {t("aa.jobs.title")}
                  </h2>
                </div>
                <span className="text-xs tabular-nums text-fg-muted">
                  {t("aa.jobs.count", { count: jobSlots.length, max: MAX_JOBS })}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <label htmlFor="aa-job-search" className={candidateLabelClass}>
                  {t("aa.jobs.search")}
                </label>
                <div className="relative">
                  <input
                    id="aa-job-search"
                    type="search"
                    value={jobSearchQuery}
                    onChange={(e) => setJobSearchQuery(e.target.value)}
                    placeholder={t("aa.jobs.searchPlaceholder")}
                    autoComplete="off"
                    className={candidateFieldClass}
                  />
                  {jobSearchLoading && (
                    <span className="absolute end-3 top-2.5">
                      <Spinner className="h-4 w-4 text-fg-muted" />
                    </span>
                  )}
                </div>
                {showJobDropdown && jobSearchResults.length > 0 && (
                  <ul
                    id="aa-job-results"
                    className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-surface-raised shadow-raised"
                  >
                    {jobSearchResults.map((job) => (
                      <li key={job.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-start text-sm hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                          onClick={() => handleSelectJob(job)}
                        >
                          <span className="font-medium text-fg">{job.title}</span>
                          <span className="ms-2 text-fg-muted">· {job.company}</span>
                          {job.location ? <span className="ms-2 text-xs text-fg-muted">{job.location}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-fg-muted">{t("aa.jobs.orPaste")}</p>
              </div>

              {jobSlots.map((slot, idx) => (
                <div key={slot.id}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor={`aa-slot-${slot.id}`} className="text-xs font-medium text-fg-muted">
                      {t("aa.jobs.slot", { n: idx + 1 })}
                    </label>
                    {jobSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.id)}
                        disabled={activeOp !== null}
                        className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-danger disabled:opacity-50"
                        aria-label={t("aa.jobs.remove", { n: idx + 1 })}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("ui.remove")}
                      </button>
                    )}
                  </div>
                  <textarea
                    id={`aa-slot-${slot.id}`}
                    value={slot.text}
                    onChange={(e) => updateSlot(slot.id, e.target.value)}
                    placeholder={t("aa.jobs.placeholder")}
                    rows={5}
                    dir="auto"
                    className={`${candidateFieldClass} resize-y`}
                  />
                  <div className="mt-1">
                    <CharCount current={slot.text.length} max={20_000} min={50} />
                  </div>
                </div>
              ))}

              <FieldError errors={fieldErrors} field="jobs" />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={addSlot} disabled={jobSlots.length >= MAX_JOBS || activeOp !== null}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("aa.jobs.add")}
                  {jobSlots.length >= MAX_JOBS && <span className="text-fg-muted">{t("aa.jobs.max", { max: MAX_JOBS })}</span>}
                </Button>
                <Button onClick={handleMatch} disabled={resumeText.length < 100 || validSlots.length === 0 || activeOp !== null} size="sm">
                  {activeOp === "match" ? (
                    <LoadingLabel label={t("aa.jobs.matching", { count: validSlots.length })} />
                  ) : (
                    t("aa.jobs.match")
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={!selectedJob ? "opacity-70" : ""}>
            <CardContent>
              <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2.5">
                    <StepBadge n={3} />
                    <h2 className="font-semibold text-fg">
                      <span className="sr-only">{t("aa.step", { n: 3 })}: </span>
                      {t("aa.pack.title")}
                    </h2>
                  </div>
                  <p className="ms-9 text-xs text-fg-muted">
                    {!matchResult
                      ? t("aa.pack.matchFirst")
                      : !selectedJob
                        ? t("aa.pack.selectJob")
                        : selectedJob.match.score < APPLY_PACK_THRESHOLD
                          ? t("aa.pack.below", { score: selectedJob.match.score, threshold: APPLY_PACK_THRESHOLD })
                          : t("aa.pack.includes")}
                  </p>
                  {selectedJob && selectedJob.match.score >= APPLY_PACK_THRESHOLD && (
                    <p className="ms-9 mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-text">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("aa.pack.eligible", { score: selectedJob.match.score })}
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
                  {activeOp === "pack" ? <LoadingLabel label={t("aa.pack.generating")} /> : t("aa.pack.generate")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3" aria-live="polite">
          {error && (
            <CandidateErrorAlert error={error} className="mb-4">
              {fieldErrors && (
                <ul className="mt-2 space-y-0.5 text-xs text-fg-secondary">
                  {Object.entries(fieldErrors).map(([field, msgs]) => (
                    <li key={field}>
                      <span className="font-medium">{field}:</span> {msgs.join(", ")}
                    </li>
                  ))}
                </ul>
              )}
            </CandidateErrorAlert>
          )}

          {activeOp !== null && !hasAnyResult && (
            <Card>
              <CardContent className="py-16">
                <div className="flex flex-col items-center gap-3 text-fg-muted" role="status">
                  <Spinner className="h-8 w-8 text-primary-text" />
                  <p className="text-sm font-medium">
                    {activeOp === "analyze" && t("aa.loading.analyze")}
                    {activeOp === "match" && t("aa.jobs.matching", { count: validSlots.length })}
                    {activeOp === "pack" && t("aa.loading.pack")}
                  </p>
                  <p className="text-xs text-fg-muted">{t("aa.loading.time")}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeOp === null && !hasAnyResult && !error && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-20 text-center">
              <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary-text">
                <Lightbulb className="h-7 w-7" />
              </span>
              <p className="mb-1 font-semibold text-fg">{t("aa.empty.title")}</p>
              <p className="max-w-xs text-sm text-fg-muted">{t("aa.empty.body")}</p>
            </div>
          )}

          {hasAnyResult && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-fg">{t("aa.results")}</h2>
                    {activeOp !== null && <Spinner className="h-4 w-4 text-primary-text" />}
                    {activeOp === null && !error && latestResult && (
                      <Badge
                        variant={latestResult.status === "ok" ? "success" : latestResult.status === "partial" ? "warning" : "danger"}
                      >
                        {enumLabel(t, "aa.status", latestResult.status)}
                      </Badge>
                    )}
                  </div>
                  {latestResult && (
                    <div className="flex items-center gap-3 text-xs text-fg-muted">
                      <span title={latestResult.run_id}>{t("aa.runId", { id: shortId(latestResult.run_id) })}</span>
                      <span>{t("aa.tokens", { count: fmt.number(latestResult.budget.token_used_estimate) })}</span>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="divide-y divide-line">
                {resumeResult?.resume_json && (
                  <div className="py-5 first:pt-0">
                    <ResumePanel result={resumeResult} />
                  </div>
                )}

                {matchResult && matchResult.ranked_jobs.length > 0 && (
                  <div className="py-5">
                    <div className="mb-3 flex items-center justify-between">
                      <SectionLabel>{t("aa.ranked.title", { count: matchResult.ranked_jobs.length })}</SectionLabel>
                      {selectedJob && (
                        <button type="button" onClick={() => setSelectedJobId(null)} className="text-xs text-fg-muted hover:text-fg">
                          {t("aa.ranked.clear")}
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
                          onSelect={() => setSelectedJobId(job.job_id === selectedJobId ? null : job.job_id)}
                        />
                      ))}
                    </div>
                    {selectedJob && <SelectedJobDetail job={selectedJob} />}
                  </div>
                )}

                {packResult?.tailored_outputs[0] && (
                  <div className="py-5">
                    <ApplyPackPanel output={packResult.tailored_outputs[0]} runId={packResult.run_id} />
                  </div>
                )}

                {latestResult?.status === "blocked" &&
                  !matchResult?.ranked_jobs.length &&
                  !packResult?.tailored_outputs.length &&
                  !resumeResult?.resume_json && (
                    <div className="py-5">
                      <div className="rounded-xl border border-danger-line bg-danger-soft p-3">
                        <p className="text-sm font-medium text-fg">{latestResult.error ?? t("aa.blocked")}</p>
                        {latestResult.budget.stopped_reason && (
                          <p className="mt-1 text-xs text-fg-secondary">{t("aa.stopped", { reason: latestResult.budget.stopped_reason })}</p>
                        )}
                      </div>
                    </div>
                  )}

                {analyzeResult && !analyzeResult.resume_json && analyzeResult.notes_for_ui.length > 0 && (
                  <div className="py-5">
                    <SectionLabel>{t("aa.notes")}</SectionLabel>
                    <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-fg-secondary" dir="auto">
                      {analyzeResult.notes_for_ui.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="mt-6 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              aria-expanded={showHistory}
              className="flex items-center gap-2 text-sm font-medium text-fg-secondary hover:text-primary-text"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`} aria-hidden="true" />
              <span>{t("aa.history.title", { count: runHistory.length })}</span>
              {historyLoading && <Spinner className="h-3 w-3" />}
            </button>

            {showHistory && (
              <ul className="mt-3 space-y-2">
                {runHistory.length === 0 && !historyLoading && <li className="text-sm italic text-fg-muted">{t("aa.history.empty")}</li>}
                {runHistory.map((item) => (
                  <RunHistoryItem key={item.id} run={item} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
