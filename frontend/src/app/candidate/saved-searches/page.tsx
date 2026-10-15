"use client";

import { useEffect, useState, useCallback, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, MapPin, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { savedSearches, SavedSearchItem } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  CandidateSwitch,
  candidateFieldClass,
  candidateLabelClass,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import {
  enumLabel,
  useCandidateFormatters,
  useCandidateT,
  type CandidateMessageKey,
} from "@/lib/i18n/candidate-messages";

type AlertFrequency = "INSTANT" | "DAILY" | "WEEKLY";

const JOB_TYPE_OPTIONS = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "FREELANCE"];
const FREQUENCIES: AlertFrequency[] = ["INSTANT", "DAILY", "WEEKLY"];

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

const checkboxClass =
  "h-4 w-4 rounded border-line-strong bg-surface-raised accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

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
  const t = useCandidateT();
  const id = useId();
  const [inputValue, setInputValue] = useState("");

  const addTags = (value: string) => {
    const newTags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && !tags.includes(tag));
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

  return (
    <div>
      <label htmlFor={id} className={candidateLabelClass}>
        {label}
      </label>
      {tags.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-success-line bg-primary-soft py-1 pe-1.5 ps-3 text-sm text-primary-text"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== tag))}
                aria-label={t("searches.form.removeTag", { tag })}
                className="rounded-full p-0.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        id={id}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => inputValue.trim() && addTags(inputValue)}
        placeholder={placeholder || t("searches.form.tagHint")}
        className={candidateFieldClass}
      />
      <p className="mt-1 text-xs text-fg-muted">{t("searches.form.tagHint")}</p>
    </div>
  );
}

export default function SavedSearchesPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const { user, isLoading } = useAuth();
  const [searches, setSearches] = useState<SavedSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<CandidateMessageKey | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const href = (path: string) => localizePath(path, locale);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const fetchSearches = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await savedSearches.list();
      setSearches(data);
    } catch (err) {
      setLoadError(err);
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

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setActionError(null);
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
        setSearches((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
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
    } catch {
      setActionError("searches.error.save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (search: SavedSearchItem) => {
    if (!window.confirm(t("searches.confirmDelete", { name: search.name }))) return;
    setDeletingId(search.id);
    setActionError(null);
    try {
      await savedSearches.delete(search.id);
      setSearches((prev) => prev.filter((s) => s.id !== search.id));
    } catch {
      setActionError("searches.error.delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleAlert = async (search: SavedSearchItem) => {
    setActionError(null);
    try {
      const updated = await savedSearches.update(search.id, {
        alertEnabled: !search.alertEnabled,
      });
      setSearches((prev) => prev.map((s) => (s.id === search.id ? updated : s)));
    } catch {
      setActionError("searches.error.toggle");
    }
  };

  const handleViewJobs = (search: SavedSearchItem) => {
    const params = new URLSearchParams();
    if (search.keywords.length > 0) params.set("search", search.keywords.join(" "));
    if (search.locations.length > 0) params.set("location", search.locations[0]);
    if (search.jobTypes.length > 0) params.set("type", search.jobTypes[0]);
    if (search.remoteOnly) params.set("remote", "true");
    if (search.visaSponsorship) params.set("visaSponsorship", "YES");
    const query = params.toString();
    router.push(`${href("/jobs")}${query ? `?${query}` : ""}`);
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={href("/candidate")}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("searches.title")}
        description={t("searches.subtitle")}
        actions={
          <>
            <Link href={href("/candidate/preferences")}>
              <Button variant="outline">{t("searches.alertPrefs")}</Button>
            </Link>
            {!showForm && (
              <Button onClick={handleCreateNew}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("searches.createNew")}
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-8 border-warning-line bg-warning-soft">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold text-fg">{t("searches.stack.title")}</h2>
                <p className="mt-1 text-sm text-fg-secondary">{t("searches.stack.body")}</p>
              </div>
            </div>
            <Link href={href("/candidate/preferences")} className="shrink-0">
              <Button variant="outline">{t("searches.stack.cta")}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {actionError && <CandidateNotice className="mb-6">{t(actionError)}</CandidateNotice>}

      {showForm && (
        <Card className="mb-8">
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">
              {editingId ? t("searches.form.editTitle") : t("searches.form.createTitle")}
            </h2>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <Input
                id="search-name"
                label={t("searches.form.name")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("searches.form.namePlaceholder")}
                required
              />

              <TagInput
                label={t("searches.form.keywords")}
                tags={form.keywords}
                onChange={(keywords) => setForm({ ...form, keywords })}
                placeholder={t("searches.form.keywordsPlaceholder")}
              />

              <TagInput
                label={t("searches.form.locations")}
                tags={form.locations}
                onChange={(locations) => setForm({ ...form, locations })}
                placeholder={t("searches.form.locationsPlaceholder")}
              />

              <fieldset>
                <legend className={candidateLabelClass}>{t("searches.form.jobTypes")}</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {JOB_TYPE_OPTIONS.map((jt) => (
                    <label key={jt} className="flex items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={form.jobTypes.includes(jt)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            jobTypes: e.target.checked ? [...form.jobTypes, jt] : form.jobTypes.filter((x) => x !== jt),
                          })
                        }
                        className={checkboxClass}
                      />
                      {enumLabel(t, "jobType", jt)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={form.remoteOnly}
                    onChange={(e) => setForm({ ...form, remoteOnly: e.target.checked })}
                    className={checkboxClass}
                  />
                  {t("searches.form.remoteOnly")}
                </label>
                <label className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={form.visaSponsorship}
                    onChange={(e) => setForm({ ...form, visaSponsorship: e.target.checked })}
                    className={checkboxClass}
                  />
                  {t("searches.form.visa")}
                </label>
              </div>

              <div>
                <label htmlFor="search-frequency" className={candidateLabelClass}>
                  {t("searches.form.frequency")}
                </label>
                <select
                  id="search-frequency"
                  value={form.alertFrequency}
                  onChange={(e) => setForm({ ...form, alertFrequency: e.target.value as AlertFrequency })}
                  className={candidateFieldClass}
                >
                  {FREQUENCIES.map((freq) => (
                    <option key={freq} value={freq}>
                      {t(`searches.freq.${freq}` as CandidateMessageKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={submitting || !form.name.trim()}>
                  {submitting
                    ? t("ui.saving")
                    : editingId
                      ? t("searches.form.update")
                      : t("searches.form.create")}
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancel}>
                  {t("ui.cancel")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <CandidateSpinner />
      ) : loadError ? (
        <CandidateLoadError error={loadError} subject={t("ui.subject.savedSearches")} onRetry={fetchSearches} />
      ) : searches.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title={t("searches.emptyTitle")}
          description={t("searches.emptyBody")}
          primaryAction={showForm ? undefined : { label: t("searches.emptyCta"), onClick: handleCreateNew }}
        />
      ) : (
        <ul className="space-y-4">
          {searches.map((search) => (
            <li key={search.id}>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-fg">{search.name}</h3>
                        <Badge variant={search.alertEnabled ? "success" : "default"}>
                          {search.alertEnabled
                            ? t("searches.alertsOn", { frequency: enumLabel(t, "searches.freq", search.alertFrequency) })
                            : t("searches.alertsOff")}
                        </Badge>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-2">
                        {search.keywords.map((kw) => (
                          <span key={kw} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-text">
                            {kw}
                          </span>
                        ))}
                        {search.locations.map((loc) => (
                          <span
                            key={loc}
                            className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-medium text-info"
                          >
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {loc}
                          </span>
                        ))}
                        {search.jobTypes.map((jt) => (
                          <span key={jt} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
                            {enumLabel(t, "jobType", jt)}
                          </span>
                        ))}
                        {search.remoteOnly && (
                          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text">
                            {t("searches.remote")}
                          </span>
                        )}
                        {search.visaSponsorship && (
                          <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
                            {t("searches.form.visa")}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-fg-muted">{t("searches.created", { date: fmt.date(search.createdAt) })}</p>
                    </div>

                    <CandidateSwitch
                      checked={search.alertEnabled}
                      onChange={() => handleToggleAlert(search)}
                      label={t("searches.toggleAlerts", { name: search.name })}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <Button size="sm" onClick={() => handleViewJobs(search)}>
                      {t("searches.viewJobs")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(search)}>
                      {t("ui.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      onClick={() => handleDelete(search)}
                      disabled={deletingId === search.id}
                    >
                      {deletingId === search.id ? t("ui.deleting") : t("ui.delete")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
