"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutTemplate } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  profile,
  skills,
  billing,
  type CandidateProfile,
  type GeneratedResume,
  type BillingStatus,
  type AtsRubricResponse,
  type AtsRubricError,
} from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PremiumGate } from "@/components/ui/premium-gate";
import { FREE_MODE } from "@/lib/free-mode";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { StepIndicator } from "@/components/resume-builder/step-indicator";
import { BasicsStep, basicsStepValid } from "@/components/resume-builder/basics-step";
import { ExperienceStep } from "@/components/resume-builder/experience-step";
import { EducationStep, educationStepValid } from "@/components/resume-builder/education-step";
import { SummaryStep } from "@/components/resume-builder/summary-step";
import { TemplateStep } from "@/components/resume-builder/template-step";
import { LivePreview } from "@/components/resume-builder/live-preview";
import { RubricScorePanel, type RubricPanelError } from "@/components/resume-builder/rubric-score-panel";
import type { ResumePreviewData, TemplateId } from "@/components/resume-builder/types";
import {
  CandidateBackLink,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  candidateFieldClass,
  describeCandidateError,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateT, type CandidateMessageKey, type CandidateT } from "@/lib/i18n/candidate-messages";

interface WorkEntry {
  company: string;
  title: string;
  period: string;
  description: string;
}

interface EduEntry {
  institution: string;
  degree: string;
  period: string;
}

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  yearsExperience: string;
  summary: string;
  skills: string;
  certifications: string;
  workHistory: WorkEntry[];
  educationHistory: EduEntry[];
}

const emptyWork: WorkEntry = { company: "", title: "", period: "", description: "" };
const emptyEdu: EduEntry = { institution: "", degree: "", period: "" };

const STEP_KEYS: CandidateMessageKey[] = [
  "rb.step.basics",
  "rb.step.experience",
  "rb.step.education",
  "rb.step.summary",
  "rb.step.template",
];
const TOTAL_STEPS = STEP_KEYS.length;

function formHasDraft(value: FormState): boolean {
  return Boolean(
    value.targetRole ||
      value.location ||
      value.summary ||
      value.skills ||
      value.certifications ||
      value.workHistory.some((item) => item.company || item.title || item.description) ||
      value.educationHistory.some((item) => item.institution || item.degree),
  );
}

function fromProfile(
  candidateProfile: CandidateProfile,
  account?: { name?: string | null; email?: string | null } | null,
): Partial<FormState> {
  return {
    // Account identity fills the required Basics fields so "Start from
    // profile" leaves the wizard ready to advance.
    ...(account?.name ? { fullName: account.name } : {}),
    ...(account?.email ? { email: account.email } : {}),
    location: candidateProfile.targetCountries?.[0] || "",
    targetRole: candidateProfile.targetRoles?.[0] || candidateProfile.headline || "",
    yearsExperience: String(candidateProfile.yearsExperience ?? 0),
    summary: candidateProfile.bio || candidateProfile.headline || "",
    skills: candidateProfile.skills.join(", "),
    certifications: (candidateProfile.certifications || [])
      .map((item) => item.name)
      .filter(Boolean)
      .join(", "),
    workHistory: candidateProfile.workHistory?.length
      ? candidateProfile.workHistory.map((item) => ({
          company: item.company || "",
          title: item.title || "",
          period: item.period || "",
          description: item.description || "",
        }))
      : [{ ...emptyWork }],
    educationHistory: candidateProfile.educationHistory?.length
      ? candidateProfile.educationHistory.map((item) => ({
          institution: item.institution || "",
          degree: item.degree || "",
          period: item.period || "",
        }))
      : [{ ...emptyEdu }],
  };
}

function asPanelError(err: unknown, t: CandidateT): RubricPanelError {
  const friendly = describeCandidateError(err, t);
  return { ...friendly, tone: "error" };
}

// Only special-cases the size-aware codes where we have `limit_bytes` to
// surface. Source of truth: backend/src/routes/skills/resume-builder.ts.
function rubricErrorToPanel(err: AtsRubricError, t: CandidateT): RubricPanelError {
  const limitBytes = err.limit_bytes ?? 256 * 1024;
  switch (err.code) {
    case "RESUME_TOO_LARGE":
    case "RESUME_FIELD_TOO_LARGE":
      return {
        title: t("rb.err.tooLarge.title"),
        description: t("rb.err.tooLarge.body", { kb: Math.round(limitBytes / 1024) }),
        tone: "warning",
      };
    case "RESUME_NOT_SERIALIZABLE":
      return { title: t("rb.err.circular.title"), description: t("rb.err.circular.body"), tone: "error" };
    default:
      return asPanelError(err, t);
  }
}

export default function ResumeBuilderPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();

  const [form, setForm] = useState<FormState>({
    fullName: user?.name || "",
    email: user?.email || "",
    phone: "",
    location: "",
    targetRole: "",
    yearsExperience: "0",
    summary: "",
    skills: "",
    certifications: "",
    workHistory: [{ ...emptyWork }],
    educationHistory: [{ ...emptyEdu }],
  });

  const [step, setStep] = useState<number>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("classic");
  const [generated, setGenerated] = useState<GeneratedResume | null>(null);
  const [editedText, setEditedText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<RubricPanelError | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedProfile, setSavedProfile] = useState<CandidateProfile | null>(null);
  const [profileNotice, setProfileNotice] = useState<CandidateMessageKey | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);

  const [rubric, setRubric] = useState<AtsRubricResponse | null>(null);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [rubricError, setRubricError] = useState<RubricPanelError | null>(null);
  const [rubricJobDescription, setRubricJobDescription] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push(localizePath("/login", locale));
  }, [authLoading, router, user, locale]);

  useEffect(() => {
    if (!user || user.role !== "CANDIDATE") return;
    billing
      .status()
      .then(setBillingStatus)
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    profile
      .get()
      .then((candidateProfile) => {
        if (cancelled || !candidateProfile) return;
        setSavedProfile(candidateProfile);
        setForm((current) => {
          if (formHasDraft(current)) return current;
          setProfileNotice("rb.notice.started");
          return { ...current, ...fromProfile(candidateProfile, user) };
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isProfessional =
    FREE_MODE || billingStatus?.plan === "PROFESSIONAL" || billingStatus?.effectivePlan === "PROFESSIONAL";

  const skillsArray = useMemo(
    () =>
      form.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [form.skills],
  );
  const certificationsArray = useMemo(
    () =>
      form.certifications
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    [form.certifications],
  );

  const previewData: ResumePreviewData = useMemo(
    () => ({
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      location: form.location,
      targetRole: form.targetRole,
      yearsExperience: form.yearsExperience,
      summary: form.summary,
      skills: skillsArray,
      certifications: certificationsArray,
      workHistory: form.workHistory,
      educationHistory: form.educationHistory,
      generatedRawText: generated ? editedText || generated.rawText : undefined,
      generatedSource: generated?.source,
    }),
    [form, skillsArray, certificationsArray, generated, editedText],
  );

  const educationValue = useMemo(
    () => ({
      educationHistory: form.educationHistory,
      skills: form.skills,
      certifications: form.certifications,
    }),
    [form.educationHistory, form.skills, form.certifications],
  );

  const canAdvance = (() => {
    if (step === 1) return basicsStepValid(form);
    if (step === 3) return educationStepValid(educationValue);
    return true;
  })();
  const canGenerate = basicsStepValid(form) && educationStepValid(educationValue);
  const stepLabels = STEP_KEYS.map((key) => t(key));

  function goNext() {
    if (canAdvance && step < TOTAL_STEPS) setStep(step + 1);
  }
  function goBack() {
    if (step > 1) setStep(step - 1);
  }

  function applyProfileToForm(candidateProfile: CandidateProfile, overwrite = false) {
    const profileForm = fromProfile(candidateProfile, user);
    setForm((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(profileForm).filter(([key, value]) => {
          if (overwrite) return true;
          const current = prev[key as keyof FormState];
          if (Array.isArray(current)) {
            return current.length === 0 || current.every((item) => Object.values(item).every((field) => !field));
          }
          return !current && Boolean(value);
        }),
      ),
    }));
    setProfileNotice(overwrite ? "rb.notice.overwrite" : "rb.notice.prefill");
  }

  async function handleGenerate() {
    const missing: string[] = [];
    if (!form.fullName.trim()) missing.push(t("rb.basics.fullName"));
    if (!form.email.trim()) missing.push(t("rb.basics.email"));
    if (!form.targetRole.trim()) missing.push(t("rb.basics.targetRole"));
    if (missing.length > 0) {
      setError({
        title: t("rb.missing.title"),
        description: t("rb.missing.body", { fields: missing.join(", ") }),
        tone: "warning",
      });
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const result = await skills.generateResume({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        location: form.location || undefined,
        targetRole: form.targetRole,
        yearsExperience: Number(form.yearsExperience),
        summary: form.summary || undefined,
        skills: skillsArray,
        workHistory: form.workHistory.filter((w) => w.company && w.title),
        educationHistory: form.educationHistory.filter((e) => e.institution && e.degree),
        certifications: certificationsArray.length > 0 ? certificationsArray : undefined,
      });
      setGenerated(result.resume);
      setEditedText(result.resume.rawText);
    } catch (err) {
      setError(asPanelError(err, t));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!generated) return;
    setSaving(true);
    setError(null);
    try {
      await skills.saveResume({
        content: generated.sections as unknown as Record<string, unknown>,
        rawText: editedText || generated.rawText,
      });
      setSaved(true);
    } catch (err) {
      setError(asPanelError(err, t));
    } finally {
      setSaving(false);
    }
  }

  async function handleScoreRubric() {
    if (!generated) return;
    setRubricLoading(true);
    setRubricError(null);
    setRubric(null);
    try {
      const result = await skills.scoreAtsRubric({
        resumeContent: { rawText: editedText || generated.rawText },
        targetJobDescription: rubricJobDescription.trim() || undefined,
      });
      setRubric(result);
    } catch (err) {
      // skills.scoreAtsRubric throws AtsRubricError shapes for non-2xx responses.
      if (err && typeof err === "object" && "status" in err) {
        setRubricError(rubricErrorToPanel(err as AtsRubricError, t));
      } else {
        setRubricError(asPanelError(err, t));
      }
    } finally {
      setRubricLoading(false);
    }
  }

  if (authLoading || !user) return <CandidateSpinner className="py-24" />;

  if (!isProfessional && billingStatus) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <PremiumGate
          feature={t("rb.gate.feature")}
          requiredPlan="Professional"
          benefits={[t("rb.gate.b1"), t("rb.gate.b2"), t("rb.gate.b3"), t("rb.gate.b4")]}
        />
      </div>
    );
  }

  const errorTone = {
    error: "border-danger-line bg-danger-soft",
    warning: "border-warning-line bg-warning-soft",
    info: "border-info-line bg-info-soft",
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <CandidateBackLink href={localizePath("/candidate/resumes", locale)}>{t("resumes.title")}</CandidateBackLink>
        <CandidatePageHeader
          title={t("rb.title")}
          description={t("rb.subtitle")}
          actions={<Badge variant={FREE_MODE ? "success" : "info"}>{FREE_MODE ? t("ui.includedFree") : t("ui.premium")}</Badge>}
        />
      </div>

      <div className="space-y-6 print:space-y-0">
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="resume-builder-error"
            className={`rounded-xl border p-4 text-sm print:hidden ${errorTone[error.tone]}`}
          >
            <p className="font-medium text-fg">{error.title}</p>
            <p className="mt-0.5 text-fg-secondary">{error.description}</p>
          </div>
        )}

        {profileNotice && !generated && (
          <CandidateNotice tone="success" className="print:hidden">
            {t(profileNotice)}
          </CandidateNotice>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 print:grid-cols-1">
          <div className="space-y-6 print:hidden">
            <Card>
              <CardHeader>
                <StepIndicator step={step} total={TOTAL_STEPS} labels={stepLabels} />
              </CardHeader>
              <CardContent className="space-y-6">
                {!generated && savedProfile && step === 1 && (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface-sunken p-3">
                    <Button size="sm" variant="outline" onClick={() => applyProfileToForm(savedProfile, false)}>
                      {t("rb.updateFromProfile")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => applyProfileToForm(savedProfile, true)}>
                      {t("rb.startFromProfile")}
                    </Button>
                  </div>
                )}

                {!generated && step === 1 && (
                  <BasicsStep value={form} onChange={(patch) => setForm((p) => ({ ...p, ...patch }))} isActive />
                )}
                {!generated && step === 2 && (
                  <ExperienceStep
                    value={form.workHistory}
                    onChange={(workHistory) => setForm((p) => ({ ...p, workHistory }))}
                    isActive
                  />
                )}
                {!generated && step === 3 && (
                  <EducationStep value={educationValue} onChange={(patch) => setForm((p) => ({ ...p, ...patch }))} isActive />
                )}
                {!generated && step === 4 && (
                  <SummaryStep value={form.summary} onChange={(summary) => setForm((p) => ({ ...p, summary }))} isActive />
                )}
                {!generated && step === 5 && (
                  <TemplateStep
                    selected={selectedTemplate}
                    onSelect={setSelectedTemplate}
                    onGenerate={handleGenerate}
                    generating={loading}
                    canGenerate={canGenerate}
                    isActive
                  />
                )}

                {generated && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={generated.source === "ai" ? "success" : "default"}>
                        {generated.source === "ai" ? t("rb.source.ai") : t("rb.source.template")}
                      </Badge>
                      {saved && <Badge variant="success">{t("rb.saved")}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setGenerated(null);
                          setSaved(false);
                          setEditedText("");
                          setRubric(null);
                          setRubricError(null);
                          setStep(1);
                        }}
                        variant="outline"
                      >
                        {t("rb.editInputs")}
                      </Button>
                      <Button onClick={() => window.print()} variant="outline">
                        {t("rb.print")}
                      </Button>
                      <Button onClick={handleSave} disabled={saving || saved}>
                        {saving ? t("ui.saving") : saved ? t("rb.saved") : t("rb.save")}
                      </Button>
                    </div>
                    <label htmlFor="resume-preview-text" className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">
                      {t("rb.previewText")}{" "}
                      <span className="font-normal normal-case text-fg-muted">{t("rb.previewTextHint")}</span>
                    </label>
                    <textarea
                      id="resume-preview-text"
                      value={editedText}
                      onChange={(e) => {
                        setEditedText(e.target.value);
                        setSaved(false);
                      }}
                      rows={18}
                      data-testid="resume-preview-textarea"
                      className={`${candidateFieldClass} font-mono leading-relaxed`}
                    />
                    {saved && (
                      <p role="status" className="text-sm font-medium text-success">
                        {t("rb.savedMessage")}
                      </p>
                    )}
                  </div>
                )}

                {!generated && (
                  <div className="flex items-center justify-between border-t border-line pt-4">
                    <Button variant="outline" onClick={goBack} disabled={step === 1} data-testid="resume-step-back">
                      {t("ui.back")}
                    </Button>
                    {step < TOTAL_STEPS && (
                      <Button onClick={goNext} disabled={!canAdvance} data-testid="resume-step-next">
                        {t("ui.next")}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {generated && (
              <RubricScorePanel
                rubric={rubric}
                loading={rubricLoading}
                error={rubricError}
                jobDescription={rubricJobDescription}
                onJobDescriptionChange={setRubricJobDescription}
                onScore={handleScoreRubric}
              />
            )}

            <div className="rounded-2xl border border-success-line bg-success-soft p-4 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <LayoutTemplate className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-fg">{FREE_MODE ? t("rb.templatesBundle") : t("rb.templatesBundlePremium")}</p>
                    <p className="mt-1 text-fg-secondary">{t("rb.templatesBody")}</p>
                  </div>
                </div>
                <Link href={localizePath("/candidate/resume-templates", locale)} className="shrink-0">
                  <Button variant="outline" size="sm">
                    {t("rb.browseTemplates")}
                  </Button>
                </Link>
              </div>
            </div>

            <EarlyTesterFeedback area="resume-builder" />
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start print:static print:col-span-2">
            <LivePreview data={previewData} template={selectedTemplate} />
          </div>
        </div>
      </div>
    </div>
  );
}
