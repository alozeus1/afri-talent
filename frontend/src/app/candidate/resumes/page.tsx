"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { profile, ResumeFile, ResumeProfileDraft } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { localizePath, useLocale } from "@/lib/i18n/client";

export default function ResumesPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [resumes, setResumes] = useState<ResumeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingActive, setSettingActive] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applyingDraft, setApplyingDraft] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [parsedName, setParsedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<ResumeProfileDraft | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      fetchResumes();
    }
  }, [user]);

  const fetchResumes = async () => {
    try {
      const data = await profile.resumes();
      setResumes(data);
    } catch (err) {
      console.error("Failed to load resumes", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterResume = async () => {
    if (!fileName.trim()) {
      setError("Please enter a file name");
      return;
    }

    if (!user) return;

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const sanitizedName = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      await profile.uploadResume({
        s3Key: `resumes/${user.id}/${sanitizedName}`,
        fileName: sanitizedName,
        setActive: true,
      });
      setSuccessMessage(`Resume "${sanitizedName}" is quarantined pending a security scan. It cannot be used until cleared.`);
      setFileName("");
      await fetchResumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register resume");
    } finally {
      setUploading(false);
    }
  };

  const handleSetActive = async (resumeId: string, resumeFileName: string) => {
    setSettingActive(resumeId);
    setError(null);
    setSuccessMessage(null);

    try {
      // Re-upload/register with setActive to mark it active
      const resume = resumes.find((r) => r.id === resumeId);
      if (!resume || !user) return;

      await profile.uploadResume({
        s3Key: resume.s3Key,
        fileName: resume.fileName,
        setActive: true,
      });
      setSuccessMessage(`"${resumeFileName}" is now your active resume.`);
      await fetchResumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set active resume");
    } finally {
      setSettingActive(null);
    }
  };

  const handleParseResume = async () => {
    if (!selectedFile) {
      setError("Please choose a PDF or DOCX file first.");
      return;
    }

    setParsing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await profile.parseResume(selectedFile);
      setDraft(response.profileDraft || {});
      setParsedName(response.parsed.name || null);
      setSuccessMessage("Resume parsed successfully. Review the draft fields before applying.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse resume");
    } finally {
      setParsing(false);
    }
  };

  const updateDraftField = (field: keyof ResumeProfileDraft, value: string) => {
    setDraft((prev) => ({
      ...(prev || {}),
      [field]: value || undefined,
    }));
  };

  const handleApplyDraft = async () => {
    if (!draft) return;
    setApplyingDraft(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await profile.applyResumeDraft({
        confirm: true,
        overwriteExisting,
        draft: {
          ...draft,
          skills: draft.skills?.map((item) => item.trim()).filter(Boolean),
          targetRoles: draft.targetRoles?.map((item) => item.trim()).filter(Boolean),
        },
      });
      setSuccessMessage("Resume draft applied to your profile.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply parsed draft");
    } finally {
      setApplyingDraft(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const activeResume = resumes.find((r) => r.isActive);
  const resumeSecurityLabel = (resume: ResumeFile) => {
    switch (resume.securityStatus) {
      case "CLEAN": return "Security cleared";
      case "QUARANTINED": return "Quarantined";
      case "REJECTED": return "Rejected";
      default: return "Security scan pending";
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <Link href={localizePath("/candidate", locale)} className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-4">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Resume Management</h1>
        <p className="text-gray-600">Upload and manage your resumes for Quick Apply</p>
      </div>

      {/* Success / Error Messages */}
      {successMessage && (
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-6 flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Section 1: Active Resume */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Active Resume</h2>
        </CardHeader>
        <CardContent>
          {activeResume ? (
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{activeResume.fileName}</p>
                  <p className="text-sm text-gray-600">
                    Uploaded {new Date(activeResume.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No active resume set</p>
              <p className="text-sm mt-1">Upload a resume, then wait for its security scan to clear before using Quick Apply</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Upload Resume */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Upload Resume</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Accepted formats: .pdf, .doc, .docx. Enter your resume file name to register it.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="e.g. my-resume.pdf"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                disabled={uploading}
              />
            </div>
            <Button
              onClick={handleRegisterResume}
              disabled={uploading || !fileName.trim()}
            >
              {uploading ? "Registering..." : "Register Resume"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Parse Resume to Profile Draft */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">AI Resume Parsing</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Upload a PDF or DOCX to extract profile data. We never auto-overwrite your profile. Review and confirm first.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            />
            <Button onClick={handleParseResume} disabled={!selectedFile || parsing}>
              {parsing ? "Parsing..." : "Parse Resume"}
            </Button>
          </div>

          {draft && (
            <div className="mt-6 rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Profile Draft Review</h3>
                  {parsedName && <p className="text-xs text-gray-500 mt-1">Detected name: {parsedName}</p>}
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(event) => setOverwriteExisting(event.target.checked)}
                  />
                  Overwrite existing profile fields
                </label>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <Input
                  id="draftHeadline"
                  label="Headline"
                  value={draft.headline || ""}
                  onChange={(event) => updateDraftField("headline", event.target.value)}
                />
                <Input
                  id="draftYears"
                  type="number"
                  label="Years of experience"
                  value={draft.yearsExperience?.toString() || ""}
                  onChange={(event) => setDraft((prev) => ({
                    ...(prev || {}),
                    yearsExperience: event.target.value ? Number(event.target.value) : undefined,
                  }))}
                />
                <Input
                  id="draftSkills"
                  label="Skills (comma-separated)"
                  value={(draft.skills || []).join(", ")}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...(prev || {}),
                      skills: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    }))
                  }
                />
                <Input
                  id="draftRoles"
                  label="Target roles (comma-separated)"
                  value={(draft.targetRoles || []).join(", ")}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...(prev || {}),
                      targetRoles: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    }))
                  }
                />
                <Input
                  id="draftLinkedIn"
                  label="LinkedIn URL"
                  value={draft.linkedinUrl || ""}
                  onChange={(event) => updateDraftField("linkedinUrl", event.target.value)}
                />
                <Input
                  id="draftGithub"
                  label="GitHub URL"
                  value={draft.githubUrl || ""}
                  onChange={(event) => updateDraftField("githubUrl", event.target.value)}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Summary / Bio</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  rows={5}
                  value={draft.bio || ""}
                  onChange={(event) => updateDraftField("bio", event.target.value)}
                />
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={handleApplyDraft} disabled={applyingDraft}>
                  {applyingDraft ? "Applying..." : "Apply Draft to Profile"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: All Resumes */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">All Resumes</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
            </div>
          ) : resumes.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-600 mb-2">Upload your resume to enable Quick Apply</p>
              <p className="text-sm text-gray-400">Your resumes will appear here once uploaded</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {resumes.map((resume) => (
                <div key={resume.id} className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{resume.fileName}</p>
                      <p className="text-sm text-gray-500">
                        Uploaded {new Date(resume.uploadedAt).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-amber-700">{resumeSecurityLabel(resume)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {resume.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : resume.securityStatus !== "CLEAN" ? (
                      <Badge variant="warning">{resumeSecurityLabel(resume)}</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetActive(resume.id, resume.fileName)}
                        disabled={settingActive === resume.id}
                      >
                        {settingActive === resume.id ? "Setting..." : "Set Active"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
