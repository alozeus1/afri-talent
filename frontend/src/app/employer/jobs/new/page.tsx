"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { jobs } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const jobTypes = ["Full-time", "Part-time", "Contract", "Freelance", "Internship"];
const seniorityLevels = ["Junior", "Mid-level", "Senior", "Lead", "Executive"];

export default function NewJobPage() {
  const router = useRouter();
  const { user, token } = useAuth();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    type: "Full-time",
    seniority: "Mid-level",
    salaryMin: "",
    salaryMax: "",
    currency: "USD",
    tags: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setError(null);
    setLoading(true);

    try {
      await jobs.create(
        {
          title: formData.title,
          description: formData.description,
          location: formData.location,
          type: formData.type,
          seniority: formData.seniority,
          salaryMin: formData.salaryMin ? parseInt(formData.salaryMin) : undefined,
          salaryMax: formData.salaryMax ? parseInt(formData.salaryMax) : undefined,
          currency: formData.currency || undefined,
          tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()) : undefined,
        },
        token
      );
      router.push("/employer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (!user || user.role !== "EMPLOYER") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-600 mb-4">You must be logged in as an employer to post jobs.</p>
        <Link href="/login">
          <Button>Login</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/employer" className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900">Post a New Job</h1>
          <p className="text-gray-600">Your job will be reviewed before being published</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
            )}

            <Input
              id="title"
              label="Job Title"
              placeholder="e.g., Senior Full-Stack Engineer"
              value={formData.title}
              onChange={(e) => updateField("title", e.target.value)}
              required
            />

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Job Description
              </label>
              <textarea
                id="description"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[200px]"
                placeholder="Describe the role, responsibilities, requirements, and benefits..."
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                required
              />
            </div>

            <Input
              id="location"
              label="Location"
              placeholder="e.g., Remote, Lagos, Nigeria"
              value={formData.location}
              onChange={(e) => updateField("location", e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                  Job Type
                </label>
                <select
                  id="type"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={formData.type}
                  onChange={(e) => updateField("type", e.target.value)}
                >
                  {jobTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="seniority" className="block text-sm font-medium text-gray-700 mb-1">
                  Seniority Level
                </label>
                <select
                  id="seniority"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={formData.seniority}
                  onChange={(e) => updateField("seniority", e.target.value)}
                >
                  {seniorityLevels.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input
                id="salaryMin"
                type="number"
                label="Min Salary (optional)"
                placeholder="60000"
                value={formData.salaryMin}
                onChange={(e) => updateField("salaryMin", e.target.value)}
              />
              <Input
                id="salaryMax"
                type="number"
                label="Max Salary (optional)"
                placeholder="90000"
                value={formData.salaryMax}
                onChange={(e) => updateField("salaryMax", e.target.value)}
              />
              <div>
                <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                <select
                  id="currency"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={formData.currency}
                  onChange={(e) => updateField("currency", e.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="NGN">NGN</option>
                  <option value="KES">KES</option>
                  <option value="ZAR">ZAR</option>
                </select>
              </div>
            </div>

            <Input
              id="tags"
              label="Skills / Tags (comma-separated)"
              placeholder="e.g., React, Node.js, PostgreSQL"
              value={formData.tags}
              onChange={(e) => updateField("tags", e.target.value)}
            />

            <div className="flex gap-4">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Creating..." : "Post Job"}
              </Button>
              <Link href="/employer">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
