"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { skills, GeneratedResume } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const { user } = useAuth();
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) {
    router.push("/login");
    return null;
  }

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate resume");
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
        rawText: generated.rawText,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save resume");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Resume Builder</h1>
            <p className="text-sm text-gray-500 mt-1">
              Generate an ATS-optimised resume tailored to your target role
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!generated ? (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Your Information</h2>
            </CardHeader>
            <CardContent className="space-y-6">
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
                  placeholder="Optional — Claude will generate a compelling summary if left blank"
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
                      placeholder="Brief description of responsibilities and achievements"
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
                <Button onClick={() => { setGenerated(null); setSaved(false); }} className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
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
              <CardContent className="p-6">
                <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 leading-relaxed">
                  {generated.rawText}
                </pre>
              </CardContent>
            </Card>

            {saved && (
              <p className="text-sm text-green-600 text-center">
                Resume saved. Job Matcher will now use this for similarity scoring.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
