"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { toFriendlyError, type FriendlyError } from "@/lib/friendly-error";
import { PremiumGate } from "@/components/ui/premium-gate";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { reviewResumeInput } from "@/lib/early-tester-content";
import { StepIndicator } from "@/components/resume-builder/step-indicator";
import { BasicsStep, basicsStepValid } from "@/components/resume-builder/basics-step";
import { ExperienceStep } from "@/components/resume-builder/experience-step";
import { EducationStep, educationStepValid } from "@/components/resume-builder/education-step";
import { SummaryStep } from "@/components/resume-builder/summary-step";
import { TemplateStep } from "@/components/resume-builder/template-step";
import { LivePreview } from "@/components/resume-builder/live-preview";
import { RubricScorePanel } from "@/components/resume-builder/rubric-score-panel";
import type { ResumePreviewData, TemplateId } from "@/components/resume-builder/types";

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

const STEP_LABELS = ["Basics", "Experience", "Education", "Summary", "Template"] as const;
const TOTAL_STEPS = STEP_LABELS.length;

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

function fromProfile(candidateProfile: CandidateProfile): Partial<FormState> {
  return {
    location: candidateProfile.targetCountries?.[0] || "",
    targetRole: candidateProfile.targetRoles?.[0] || "",
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

// Defers to toFriendlyError for the generic 4xx / 5xx cases. Only special-
// cases the size-aware codes where we have `limit_bytes` to surface in the
// description. Source of truth:
//   backend/src/routes/skills/resume-builder.ts @ 3a07488.
function rubricErrorToFriendly(err: AtsRubricError): FriendlyError {
  const limitBytes = err.limit_bytes ?? 256 * 1024;
  switch (err.code) {
    case "RESUME_TOO_LARGE":
    case "RESUME_FIELD_TOO_LARGE":
      return {
        title: "Resume is too large to score",
        description: `Try removing image data or trimming long fields. The limit is ${Math.round(
          limitBytes / 1024,
        )} KB per field.`,
        tone: "warning",
      };
    case "RESUME_NOT_SERIALIZABLE":
      return {
        title: "Couldn't process your resume",
        description:
          "Your resume contains a self-reference. Try regenerating it and re-running the score.",
        tone: "error",
      };
    default:
      // VALIDATION_FAILED / ATS_RUBRIC_INTERNAL_ERROR / unknown → generic mapping.
      return toFriendlyError(err);
  }
}

export default function ResumeBuilderPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

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
  const [error, setError] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedProfile, setSavedProfile] = useState<CandidateProfile | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);

  const [rubric, setRubric] = useState<AtsRubricResponse | null>(null);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [rubricError, setRubricError] = useState<FriendlyError | null>(null);
  const [rubricJobDescription, setRubricJobDescription] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, router, user]);

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
          setProfileNotice("Resume builder started from your saved profile.");
          return { ...current, ...fromProfile(candidateProfile) };
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isProfessional = billingStatus?.plan === "PROFESSIONAL";

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

  function goNext() {
    if (canAdvance && step < TOTAL_STEPS) setStep(step + 1);
  }
  function goBack() {
    if (step > 1) setStep(step - 1);
  }

  function applyProfileToForm(candidateProfile: CandidateProfile, overwrite = false) {
    const profileForm = fromProfile(candidateProfile);
    setForm((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(profileForm).filter(([key, value]) => {
          if (overwrite) return true;
          const current = prev[key as keyof FormState];
          if (Array.isArray(current)) {
            return (
              current.length === 0 ||
              current.every((item) => Object.values(item).every((field) => !field))
            );
          }
          return !current && Boolean(value);
        }),
      ),
    }));
    setProfileNotice(
      overwrite
        ? "Resume fields updated from your latest profile."
        : "Blank resume fields were prefilled from your profile.",
    );
  }

  async function handleGenerate() {
    const readiness = reviewResumeInput(form);
    if (readiness.missing.length > 0) {
      setError({
        title: "Resume details missing",
        description: `Add these required details before generating: ${readiness.missing.join(", ")}.`,
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
      setError(toFriendlyError(err));
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
      setError(toFriendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  async function handleScoreRubric() {
    if (!generated) return;
    setRubricLoading(true);
    setRubricError(null);
    setRubric(null);
    try {
      const result = await skills.scoreAtsRubric({
        resumeContent: generated.sections as unknown as Record<string, unknown>,
        targetJobDescription: rubricJobDescription.trim() || undefined,
      });
      setRubric(result);
    } catch (err) {
      // skills.scoreAtsRubric throws AtsRubricError shapes for non-2xx
      // responses; fall back to toFriendlyError for anything else
      // (network failure, unexpected shape, etc).
      if (err && typeof err === "object" && "status" in err) {
        setRubricError(rubricErrorToFriendly(err as AtsRubricError));
      } else {
        setRubricError(toFriendlyError(err));
      }
    } finally {
      setRubricLoading(false);
    }
  }

  if (authLoading || !user) return null;

  if (!isProfessional && billingStatus) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <PremiumGate
            feature="AI Resume Builder & Templates"
            requiredPlan="Professional"
            benefits={[
              "AI-generated ATS-optimized resume drafts",
              "Premium downloadable resume templates",
              "Auto-fill your profile into any template",
              "Unlimited ATS compatibility scans",
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-0 print:px-0">
      <div className="mx-auto max-w-7xl space-y-6 print:max-w-none print:space-y-0">
        <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Resume Builder</h1>
            <p className="text-sm text-gray-500 mt-1">
              Build an ATS-friendly resume draft from truthful profile, project, and work details.
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="resume-builder-error"
            className={`rounded-md border p-4 text-sm print:hidden ${
              error.tone === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : error.tone === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5">{error.description}</p>
          </div>
        )}

        {profileNotice && !generated && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 print:hidden">
            {profileNotice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 print:grid-cols-1">
          <div className="space-y-6 print:hidden">
            <Card>
              <CardHeader>
                <StepIndicator step={step} total={TOTAL_STEPS} labels={STEP_LABELS} />
              </CardHeader>
              <CardContent className="space-y-6">
                {!generated && savedProfile && step === 1 && (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyProfileToForm(savedProfile, false)}
                    >
                      Update from profile
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyProfileToForm(savedProfile, true)}
                    >
                      Start from profile
                    </Button>
                  </div>
                )}

                {!generated && step === 1 && (
                  <BasicsStep
                    value={form}
                    onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
                    isActive
                  />
                )}
                {!generated && step === 2 && (
                  <ExperienceStep
                    value={form.workHistory}
                    onChange={(workHistory) => setForm((p) => ({ ...p, workHistory }))}
                    isActive
                  />
                )}
                {!generated && step === 3 && (
                  <EducationStep
                    value={educationValue}
                    onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
                    isActive
                  />
                )}
                {!generated && step === 4 && (
                  <SummaryStep
                    value={form.summary}
                    onChange={(summary) => setForm((p) => ({ ...p, summary }))}
                    isActive
                  />
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
                        {generated.source === "ai" ? "AI Generated" : "Template"}
                      </Badge>
                      {saved && <Badge variant="success">Saved</Badge>}
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
                        Edit Inputs
                      </Button>
                      <Button onClick={handlePrint} variant="outline">
                        Export / Print
                      </Button>
                      <Button onClick={handleSave} disabled={saving || saved}>
                        {saving ? "Saving..." : saved ? "Saved" : "Save Resume"}
                      </Button>
                    </div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Preview text{" "}
                      <span className="normal-case font-normal text-gray-400">
                        (editable — refine before saving)
                      </span>
                    </label>
                    <textarea
                      value={editedText}
                      onChange={(e) => {
                        setEditedText(e.target.value);
                        setSaved(false);
                      }}
                      rows={18}
                      data-testid="resume-preview-textarea"
                      className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {saved && (
                      <p className="text-sm text-emerald-700">
                        Resume saved. Job Matcher will now use this for similarity scoring.
                      </p>
                    )}
                  </div>
                )}

                {!generated && (
                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <Button
                      variant="outline"
                      onClick={goBack}
                      disabled={step === 1}
                      data-testid="resume-step-back"
                    >
                      Back
                    </Button>
                    {step < TOTAL_STEPS && (
                      <Button
                        onClick={goNext}
                        disabled={!canAdvance}
                        data-testid="resume-step-next"
                      >
                        Next
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

            <EarlyTesterFeedback area="resume-builder" />

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 print:hidden">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Premium template bundle</p>
                  <p className="mt-1">
                    Preview ATS-ready layouts and download templates included with your plan.
                  </p>
                </div>
                <Link
                  href="/candidate/resume-templates"
                  className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-transparent px-3.5 py-2 text-sm font-medium text-zinc-900 shadow-sm transition-all duration-200 hover:bg-zinc-100"
                >
                  Browse templates
                </Link>
              </div>
            </div>
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start print:static print:col-span-2">
            <LivePreview data={previewData} template={selectedTemplate} />
          </div>
        </div>
      </div>
    </div>
  );
}
