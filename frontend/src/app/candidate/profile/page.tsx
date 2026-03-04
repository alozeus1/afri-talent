"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { profile } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Toast {
  type: "success" | "error";
  message: string;
}

function TagInput({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");

  const addTags = (value: string) => {
    const newTags = value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !tags.includes(t));
    if (newTags.length > 0) {
      onChange([...tags, ...newTags]);
    }
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTags(inputValue);
    }
    if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-emerald-100 text-emerald-800"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-emerald-600 hover:text-emerald-800 font-bold"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => inputValue.trim() && addTags(inputValue)}
        placeholder={placeholder || "Type and press Enter or comma to add"}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
      />
    </div>
  );
}

export default function CandidateProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Form state
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState<number | "">("");
  const [visaStatus, setVisaStatus] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [openToWork, setOpenToWork] = useState(false);
  const [completeness, setCompleteness] = useState(0);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profile.get();
      if (data) {
        setHeadline(data.headline || "");
        setBio(data.bio || "");
        setSkills(data.skills || []);
        setTargetRoles(data.targetRoles || []);
        setTargetCountries(data.targetCountries || []);
        setYearsExperience(data.yearsExperience ?? "");
        setVisaStatus(data.visaStatus || "");
        setLinkedinUrl(data.linkedinUrl || "");
        setGithubUrl(data.githubUrl || "");
        setPortfolioUrl(data.portfolioUrl || "");
        setOpenToWork(data.openToWork);
        setCompleteness(data.profileCompleteness);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      loadProfile();
    }
  }, [user, loadProfile]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await profile.update({
        headline: headline || null,
        bio: bio || null,
        skills,
        targetRoles,
        targetCountries,
        yearsExperience: yearsExperience === "" ? null : Number(yearsExperience),
        visaStatus: visaStatus || null,
        linkedinUrl: linkedinUrl || null,
        githubUrl: githubUrl || null,
        portfolioUrl: portfolioUrl || null,
        openToWork,
      });
      setCompleteness(updated.profileCompleteness);
      setToast({ type: "success", message: "Profile updated successfully!" });
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save profile",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Profile</h1>
      <p className="text-gray-600 mb-8">
        Complete your profile to stand out to employers
      </p>

      {/* Profile Completeness */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 flex-shrink-0">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  stroke={completeness >= 80 ? "#059669" : "#f59e0b"}
                  strokeWidth="3"
                  strokeDasharray={`${completeness} ${100 - completeness}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">
                {completeness}%
              </span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Profile Completeness
              </h3>
              <p className="text-sm text-gray-500">
                {completeness >= 80
                  ? "Your profile looks great!"
                  : "Fill in more details to improve your visibility"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Personal Info */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Personal Information
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            id="headline"
            label="Headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="e.g. Senior Full-Stack Developer"
          />
          <div>
            <label
              htmlFor="bio"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell employers about yourself, your experience, and what you're looking for"
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Skills */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Skills</h2>
        </CardHeader>
        <CardContent>
          <TagInput
            label="Your Skills"
            tags={skills}
            onChange={setSkills}
            placeholder="e.g. React, Node.js, Python (comma-separated)"
          />
        </CardContent>
      </Card>

      {/* Section 3: Career Preferences */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Career Preferences
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <TagInput
            label="Target Roles"
            tags={targetRoles}
            onChange={setTargetRoles}
            placeholder="e.g. Software Engineer, Product Manager"
          />
          <TagInput
            label="Target Countries"
            tags={targetCountries}
            onChange={setTargetCountries}
            placeholder="e.g. Germany, Canada, UK"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="yearsExperience"
              label="Years of Experience"
              type="number"
              min={0}
              value={yearsExperience}
              onChange={(e) =>
                setYearsExperience(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              placeholder="e.g. 5"
            />
            <Input
              id="visaStatus"
              label="Visa Status"
              value={visaStatus}
              onChange={(e) => setVisaStatus(e.target.value)}
              placeholder="e.g. EU Citizen, H1B, etc."
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Links */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Links</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            id="linkedinUrl"
            label="LinkedIn URL"
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/your-profile"
          />
          <Input
            id="githubUrl"
            label="GitHub URL"
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/your-username"
          />
          <Input
            id="portfolioUrl"
            label="Portfolio URL"
            type="url"
            value={portfolioUrl}
            onChange={(e) => setPortfolioUrl(e.target.value)}
            placeholder="https://your-portfolio.com"
          />
        </CardContent>
      </Card>

      {/* Section 5: Open to Work */}
      <Card className="mb-8">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Job Visibility
          </h2>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpenToWork(!openToWork)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                openToWork ? "bg-emerald-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  openToWork ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-gray-900">
                {openToWork ? "Open to Work" : "Not Looking"}
              </span>
              <p className="text-xs text-gray-500">
                {openToWork
                  ? "Your profile is visible to employers"
                  : "Your profile is hidden from employer searches"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Profile"}
        </Button>
      </div>
    </div>
  );
}
