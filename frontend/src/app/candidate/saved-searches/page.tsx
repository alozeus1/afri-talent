"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { savedSearches, SavedSearchItem } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type AlertFrequency = "INSTANT" | "DAILY" | "WEEKLY";

const JOB_TYPE_OPTIONS = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "FREELANCE",
];

const jobTypeLabels: Record<string, string> = {
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  FREELANCE: "Freelance",
};

interface FormState {
  name: string;
  keywords: string[];
  locations: string[];
  jobTypes: string[];
  remoteOnly: boolean;
  visaSponsorship: boolean;
  alertFrequency: AlertFrequency;
}

const defaultForm: FormState = {
  name: "",
  keywords: [],
  locations: [],
  jobTypes: [],
  remoteOnly: false,
  visaSponsorship: false,
  alertFrequency: "DAILY",
};

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

export default function SavedSearchesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [searches, setSearches] = useState<SavedSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  const fetchSearches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await savedSearches.list();
      setSearches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved searches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      fetchSearches();
    }
  }, [user, fetchSearches]);

  const handleCreateNew = () => {
    setEditingId(null);
    setForm(defaultForm);
    setShowForm(true);
  };

  const handleEdit = (search: SavedSearchItem) => {
    setEditingId(search.id);
    setForm({
      name: search.name,
      keywords: search.keywords || [],
      locations: search.locations || [],
      jobTypes: search.jobTypes || [],
      remoteOnly: search.remoteOnly,
      visaSponsorship: search.visaSponsorship,
      alertFrequency: (search.alertFrequency as AlertFrequency) || "DAILY",
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(defaultForm);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (editingId) {
        const updated = await savedSearches.update(editingId, {
          name: form.name,
          keywords: form.keywords,
          locations: form.locations,
          jobTypes: form.jobTypes,
          remoteOnly: form.remoteOnly,
          visaSponsorship: form.visaSponsorship,
          alertFrequency: form.alertFrequency,
        });
        setSearches((prev) =>
          prev.map((s) => (s.id === editingId ? updated : s))
        );
      } else {
        const created = await savedSearches.create({
          name: form.name,
          keywords: form.keywords,
          locations: form.locations,
          jobTypes: form.jobTypes,
          remoteOnly: form.remoteOnly,
          visaSponsorship: form.visaSponsorship,
          alertEnabled: true,
          alertFrequency: form.alertFrequency,
        });
        setSearches((prev) => [created, ...prev]);
      }
      handleCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save search");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await savedSearches.delete(id);
      setSearches((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete search");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleAlert = async (search: SavedSearchItem) => {
    try {
      const updated = await savedSearches.update(search.id, {
        alertEnabled: !search.alertEnabled,
      });
      setSearches((prev) =>
        prev.map((s) => (s.id === search.id ? updated : s))
      );
    } catch {
      // silently ignore
    }
  };

  const handleViewJobs = (search: SavedSearchItem) => {
    const params = new URLSearchParams();
    if (search.keywords.length > 0) {
      params.set("search", search.keywords.join(" "));
    }
    if (search.locations.length > 0) {
      params.set("location", search.locations[0]);
    }
    if (search.jobTypes.length > 0) {
      params.set("type", search.jobTypes[0]);
    }
    if (search.remoteOnly) {
      params.set("remote", "true");
    }
    if (search.visaSponsorship) {
      params.set("visaSponsorship", "YES");
    }
    const query = params.toString();
    router.push(`/jobs${query ? `?${query}` : ""}`);
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Saved Searches</h1>
          <p className="text-gray-600 mt-1">
            Manage your job search alerts and preferences
          </p>
        </div>
        {!showForm && (
          <Button onClick={handleCreateNew}>Create New Search</Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Inline Form */}
      {showForm && (
        <Card className="mb-8">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? "Edit Search" : "Create New Search"}
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              id="search-name"
              label="Search Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Remote React Developer in Europe"
            />

            <TagInput
              label="Keywords"
              tags={form.keywords}
              onChange={(keywords) => setForm({ ...form, keywords })}
              placeholder="e.g. React, TypeScript, Node.js"
            />

            <TagInput
              label="Locations"
              tags={form.locations}
              onChange={(locations) => setForm({ ...form, locations })}
              placeholder="e.g. Berlin, London, Remote"
            />

            {/* Job Types */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Types
              </label>
              <div className="flex flex-wrap gap-3">
                {JOB_TYPE_OPTIONS.map((jt) => (
                  <label key={jt} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.jobTypes.includes(jt)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({
                            ...form,
                            jobTypes: [...form.jobTypes, jt],
                          });
                        } else {
                          setForm({
                            ...form,
                            jobTypes: form.jobTypes.filter((t) => t !== jt),
                          });
                        }
                      }}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    {jobTypeLabels[jt] || jt}
                  </label>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.remoteOnly}
                  onChange={(e) =>
                    setForm({ ...form, remoteOnly: e.target.checked })
                  }
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Remote Only
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.visaSponsorship}
                  onChange={(e) =>
                    setForm({ ...form, visaSponsorship: e.target.checked })
                  }
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Visa Sponsorship
              </label>
            </div>

            {/* Alert Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alert Frequency
              </label>
              <select
                value={form.alertFrequency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    alertFrequency: e.target.value as AlertFrequency,
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
              >
                <option value="INSTANT">Instant</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSubmit} disabled={submitting || !form.name.trim()}>
                {submitting
                  ? "Saving…"
                  : editingId
                    ? "Update Search"
                    : "Create Search"}
              </Button>
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : searches.length === 0 ? (
        /* Empty State */
        <Card>
          <CardContent className="p-12 text-center">
            <span className="text-4xl mb-4 block">🔍</span>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No saved searches
            </h3>
            <p className="text-gray-500 mb-6">
              Create one to get job alerts!
            </p>
            {!showForm && (
              <Button onClick={handleCreateNew}>Create Your First Search</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Search Cards */
        <div className="space-y-4">
          {searches.map((search) => (
            <Card key={search.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {search.name}
                      </h3>
                      <Badge
                        variant={search.alertEnabled ? "success" : "default"}
                      >
                        {search.alertEnabled
                          ? `Alerts: ${search.alertFrequency}`
                          : "Alerts off"}
                      </Badge>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {search.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800"
                        >
                          {kw}
                        </span>
                      ))}
                      {search.locations.map((loc) => (
                        <span
                          key={loc}
                          className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800"
                        >
                          📍 {loc}
                        </span>
                      ))}
                      {search.jobTypes.map((jt) => (
                        <span
                          key={jt}
                          className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700"
                        >
                          {jobTypeLabels[jt] || jt}
                        </span>
                      ))}
                      {search.remoteOnly && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">
                          🏠 Remote
                        </span>
                      )}
                      {search.visaSponsorship && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">
                          🛂 Visa Sponsorship
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-400">
                      Created {new Date(search.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Alert Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleAlert(search)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                      search.alertEnabled ? "bg-emerald-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        search.alertEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                  <Button
                    size="sm"
                    onClick={() => handleViewJobs(search)}
                  >
                    View Matching Jobs
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(search)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(search.id)}
                    disabled={deletingId === search.id}
                  >
                    {deletingId === search.id ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
