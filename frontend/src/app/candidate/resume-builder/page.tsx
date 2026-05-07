"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { profile, skills, CandidateProfile, GeneratedResume } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ATSScoreDisplay } from "@/components/ui/ats-score-display";
import { LoadingState } from "@/components/ui/loading-state";
import { toFriendlyError, type FriendlyError } from "@/lib/friendly-error";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { RESUME_IMPROVEMENT_TIPS, reviewResumeInput } from "@/lib/early-tester-content";

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

  const [generated, setGenerated] = useState<GeneratedResume | null>(null);
  const [editedText, setEditedText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedProfile, setSavedProfile] = useState<CandidateProfile | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  // ATS scan state
  const [atsJobDescription, setAtsJobDescription] = useState("");
  const [atsResult, setAtsResult] = useState<{
    score: number;
    missingKeywords: string[];
    presentKeywords: string[];
    suggestions: string[];
    source: "ai" | "heuristic";
  } | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState<FriendlyError | null>(null);

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

  function applyProfileToForm(candidateProfile: CandidateProfile, overwrite = false) {
    const profileForm = fromProfile(candidateProfile);
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
    setProfileNotice(overwrite ? "Resume fields updated from your latest profile." : "Blank resume fields were prefilled from your profile.");
  }

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    profile.get()
      .then((candidateProfile) => {
        if (cancelled || !candidateProfile) return;
        setSavedProfile(candidateProfile);
        setForm((current) => {
          if (formHasDraft(current)) return current;
          const profileForm = fromProfile(candidateProfile);
          setProfileNotice("Resume builder started from your saved profile.");
          return { ...current, ...profileForm };
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || !user) return null;

  function updateWork(index: number, field: keyof WorkEntry, value: string) {
    setForm((prev) => {
      const updated = [...prev.workHistory];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, workHistory: updated };
    });
  }

  function updateEdu(index: number, field: keyof EduEntry, value: string) {
    setForm((prev) => {
      const updated = [...prev.educationHistory];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, educationHistory: updated };
    });
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
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        workHistory: form.workHistory.filter((w) => w.company && w.title),
        educationHistory: form.educationHistory.filter((e) => e.institution && e.degree),
        certifications: form.certifications
          ? form.certifications.split(",").map((c) => c.trim()).filter(Boolean)
          : undefined,
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

  async function handleAtsScan() {
    if (!generated) return;
    setAtsLoading(true);
    setAtsError(null);
    setAtsResult(null);
    try {
      const result = await skills.scanResumeAts({
        resumeText: editedText || generated.rawText,
        jobDescription: atsJobDescription.trim() || undefined,
      });
      setAtsResult(result);
    } catch (err) {
      setAtsError(toFriendlyError(err));
    } finally {
      setAtsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
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
            className={`rounded-md border p-4 text-sm ${
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

        {profileNotice && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {profileNotice}
          </div>
        )}

        {!generated ? (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Your Information</h2>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">Resume safety checklist</p>
                <p className="mt-1">
                  Keep every claim verifiable. AfriTalent can improve wording and structure, but it should not invent tools, employers, certifications, or results.
                </p>
              </div>
              {savedProfile && (
                <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-4">
                  <Button size="sm" variant="outline" onClick={() => applyProfileToForm(savedProfile, false)}>
                    Update from profile
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      applyProfileToForm(savedProfile, true);
                    }}
                  >
                    Start from profile
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setForm({
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
                      setProfileNotice("Started a blank resume draft.");
                    }}
                  >
                    Start blank
                  </Button>
                </div>
              )}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-950">Premium template bundle</p>
                    <p className="mt-1 text-sm text-emerald-800">
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

              <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
                {reviewResumeInput(form).suggestions.slice(0, 4).map((item) => (
                  <div key={item} className="rounded-lg bg-white p-3 text-xs text-gray-700">
                    {item}
                  </div>
                ))}
                {reviewResumeInput(form).suggestions.length === 0 && (
                  RESUME_IMPROVEMENT_TIPS.slice(0, 4).map((item) => (
                    <div key={item} className="rounded-lg bg-white p-3 text-xs text-gray-700">
                      {item}
                    </div>
                  ))
                )}
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+234 800 000 0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Lagos, Nigeria"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Role *</label>
                  <input
                    type="text"
                    value={form.targetRole}
                    onChange={(e) => setForm((p) => ({ ...p, targetRole: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Senior Software Engineer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience *</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={form.yearsExperience}
                    onChange={(e) => setForm((p) => ({ ...p, yearsExperience: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Skills * <span className="text-gray-400">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.skills}
                  onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="React, TypeScript, Node.js, PostgreSQL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certifications <span className="text-gray-400">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.certifications}
                  onChange={(e) => setForm((p) => ({ ...p, certifications: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="AWS Certified Developer, Google Cloud Professional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Professional Summary</label>
                <textarea
                  value={form.summary}
                  onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional — AfriTalent can draft this from your real experience if left blank"
                />
              </div>

              {/* Work History */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Work History</label>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, workHistory: [...p.workHistory, { ...emptyWork }] }))}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    + Add Role
                  </button>
                </div>
                {form.workHistory.map((w, i) => (
                  <div key={i} className="border border-gray-200 rounded-md p-4 space-y-3 mb-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input
                        type="text"
                        placeholder="Company"
                        value={w.company}
                        onChange={(e) => updateWork(i, "company", e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Job Title"
                        value={w.title}
                        onChange={(e) => updateWork(i, "title", e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="2022 - Present"
                        value={w.period}
                        onChange={(e) => updateWork(i, "period", e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <textarea
                      placeholder="Responsibilities and truthful achievements. Add metrics where available."
                      value={w.description}
                      onChange={(e) => updateWork(i, "description", e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>

              {/* Education */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Education</label>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, educationHistory: [...p.educationHistory, { ...emptyEdu }] }))}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    + Add Education
                  </button>
                </div>
                {form.educationHistory.map((e, i) => (
                  <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-3">
                    <input
                      type="text"
                      placeholder="Institution"
                      value={e.institution}
                      onChange={(ev) => updateEdu(i, "institution", ev.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Degree / Course"
                      value={e.degree}
                      onChange={(ev) => updateEdu(i, "degree", ev.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="2018 - 2022"
                      value={e.period}
                      onChange={(ev) => updateEdu(i, "period", ev.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>

              <Button
                onClick={handleGenerate}
                disabled={loading || !form.fullName || !form.targetRole || !form.skills}
                className="w-full"
              >
                {loading ? "Generating with Claude..." : "Generate Resume"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={generated.source === "ai" ? "success" : "default"}>
                  {generated.source === "ai" ? "AI Generated" : "Template"}
                </Badge>
                {saved && <Badge variant="success">Saved</Badge>}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => { setGenerated(null); setSaved(false); setEditedText(""); }} className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                  Edit Inputs
                </Button>
                <Button onClick={handlePrint} className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                  Export / Print
                </Button>
                <Button onClick={handleSave} disabled={saving || saved}>
                  {saving ? "Saving..." : saved ? "Saved" : "Save Resume"}
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-6 space-y-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Preview{" "}
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
                  rows={24}
                  data-testid="resume-preview-textarea"
                  className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Review before saving. Remove any claim you cannot prove or explain in an interview. ATS-friendly does not mean guaranteed ATS approval.
                </div>
              </CardContent>
            </Card>

            {saved && (
              <p className="text-sm text-green-600 text-center">
                Resume saved. Job Matcher will now use this for similarity scoring.
              </p>
            )}

            {/* ATS Scanner */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">ATS Score Check</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Optionally paste a job description for a targeted analysis
                    </p>
                  </div>
                  <Badge variant="info">Premium</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <textarea
                  value={atsJobDescription}
                  onChange={(e) => setAtsJobDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Paste a job description here for a targeted keyword match (optional)"
                />
                <Button onClick={handleAtsScan} disabled={atsLoading} className="w-full">
                  {atsLoading ? "Scanning..." : "Scan ATS Compatibility"}
                </Button>

                {atsError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    data-testid="ats-scan-error"
                    className={`rounded-md border p-3 text-sm ${
                      atsError.tone === "error"
                        ? "bg-red-50 border-red-200 text-red-800"
                        : atsError.tone === "warning"
                          ? "bg-amber-50 border-amber-200 text-amber-900"
                          : "bg-blue-50 border-blue-200 text-blue-900"
                    }`}
                  >
                    <p className="font-medium">{atsError.title}</p>
                    <p className="mt-0.5">{atsError.description}</p>
                  </div>
                )}

                {atsLoading && <LoadingState lines={4} />}

                {atsResult && !atsLoading && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-4">
                      <ATSScoreDisplay score={atsResult.score} size="lg" />
                      <div className="text-sm text-gray-500">
                        {atsResult.source === "ai" ? "AI-powered analysis" : "Heuristic analysis"}
                      </div>
                    </div>

                    {atsResult.presentKeywords.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
                          Keywords Found ({atsResult.presentKeywords.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {atsResult.presentKeywords.map((kw) => (
                            <span
                              key={kw}
                              className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {atsResult.missingKeywords.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                          Missing Keywords ({atsResult.missingKeywords.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {atsResult.missingKeywords.map((kw) => (
                            <span
                              key={kw}
                              className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                {atsResult.suggestions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                          Suggestions
                        </p>
                        <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                          {atsResult.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <EarlyTesterFeedback area="Resume review" />
          </div>
        )}
        {!generated && <EarlyTesterFeedback area="Resume review" />}
      </div>
    </div>
  );
}
