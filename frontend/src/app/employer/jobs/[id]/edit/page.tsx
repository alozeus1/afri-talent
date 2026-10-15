"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { CreateJobData, jobs } from "@/lib/api";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  EMPTY_JOB_MOBILITY,
  JobMobilityFields,
  type JobMobilityValues,
} from "@/components/employer/job-mobility-fields";
import {
  BackLink,
  EmployerDialog,
  Eyebrow,
  Notice,
  PageSpinner,
  controlClass,
  labelClass,
} from "@/components/employer/employer-ui";
import { CURRENCIES, JOB_TYPES, SENIORITY_LEVELS } from "@/components/employer/job-form-options";
import { parseCountryList } from "@/lib/job-options";

/** Keep a stored value selectable even if it predates the current option list. */
function withCurrent(options: readonly string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : [...options];
}

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const { user, isLoading } = useAuth();
  const locale = useLocale();
  const { t, tv } = useEmployerI18n();

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
  const [mobility, setMobility] = useState<JobMobilityValues>(EMPTY_JOB_MOBILITY);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "" means the load failed without a server message (shown as a generic error).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const loadJob = useCallback(async () => {
    try {
      // GET /api/jobs/:slug is the public slug route, so resolve the job by id
      // from the employer's own job list (also enforces ownership).
      const myJobs = await jobs.myJobs();
      const job = myJobs.find((candidate) => candidate.id === jobId);
      if (!job) {
        setNotFound(true);
        return;
      }
      setFormData({
        title: job.title || "",
        description: job.description || "",
        location: job.location || "",
        type: job.type || "Full-time",
        seniority: job.seniority || "Mid-level",
        salaryMin: job.salaryMin?.toString() || "",
        salaryMax: job.salaryMax?.toString() || "",
        currency: job.currency || "USD",
        tags: job.tags?.join(", ") || "",
      });
      setMobility({
        workplaceType: job.workplaceType || "",
        jobField: job.jobField || "",
        visaSponsorship: job.visaSponsorship || "UNKNOWN",
        relocationAssistance: Boolean(job.relocationAssistance),
        eligibleCountries: job.eligibleCountries?.join(", ") || "",
      });
    } catch (err) {
      setLoadError(err instanceof Error && err.message ? err.message : "");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (user?.role === "EMPLOYER" && jobId) {
      loadJob();
    }
  }, [user, jobId, loadJob]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const body = {
        title: formData.title,
        description: formData.description,
        location: formData.location,
        type: formData.type,
        seniority: formData.seniority,
        salaryMin: formData.salaryMin ? parseInt(formData.salaryMin, 10) : undefined,
        salaryMax: formData.salaryMax ? parseInt(formData.salaryMax, 10) : undefined,
        currency: formData.currency || undefined,
        tags: formData.tags ? formData.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
        workplaceType: mobility.workplaceType || undefined,
        jobField: mobility.jobField || undefined,
        visaSponsorship: mobility.visaSponsorship as CreateJobData["visaSponsorship"],
        relocationAssistance: mobility.relocationAssistance,
        eligibleCountries: parseCountryList(mobility.eligibleCountries),
      };

      await jobs.update(jobId, body);

      router.push(localizePath("/employer", locale));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("jobs.errUpdate"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await jobs.remove(jobId);

      router.push(localizePath("/employer", locale));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("jobs.errDelete"));
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateMobility = <K extends keyof JobMobilityValues>(field: K, value: JobMobilityValues[K]) => {
    setMobility((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading || !user || loading) {
    return <PageSpinner />;
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <BackLink href={localizePath("/employer", locale)}>{t("common.backToDashboard")}</BackLink>
        <Card>
          <CardContent className="py-10 text-center">
            <h1 className="text-xl font-semibold text-fg">{t("jobs.notFoundTitle")}</h1>
            <p className="mt-2 text-sm text-fg-secondary">{t("jobs.notFoundBody")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {showDeleteModal && (
        <EmployerDialog
          title={t("jobs.deleteTitle")}
          description={t("jobs.deleteBody")}
          onClose={() => !deleting && setShowDeleteModal(false)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={deleting} disabled={deleting}>
              {deleting ? t("jobs.deleting") : t("jobs.deleteConfirm")}
            </Button>
          </div>
        </EmployerDialog>
      )}

      <BackLink href={localizePath("/employer", locale)}>{t("common.backToDashboard")}</BackLink>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Eyebrow>{t("jobs.editEyebrow")}</Eyebrow>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{t("jobs.editTitle")}</h1>
              <p className="mt-1 text-sm text-fg-secondary">{t("jobs.editSubtitle")}</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
              {t("jobs.deleteConfirm")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {(error || loadError !== null) && (
              <Notice tone="danger" role="alert">
                {error || loadError || t("jobs.errLoad")}
              </Notice>
            )}

            <Input
              id="title"
              label={t("jobs.fieldTitle")}
              placeholder={t("jobs.titlePlaceholder")}
              value={formData.title}
              onChange={(e) => updateField("title", e.target.value)}
              required
            />

            <div>
              <label htmlFor="description" className={labelClass}>
                {t("jobs.fieldDescription")}
              </label>
              <textarea
                id="description"
                className={`${controlClass} min-h-[200px]`}
                placeholder={t("jobs.descriptionPlaceholder")}
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                required
              />
            </div>

            <Input
              id="location"
              label={t("jobs.fieldLocation")}
              placeholder={t("jobs.locationPlaceholder")}
              value={formData.location}
              onChange={(e) => updateField("location", e.target.value)}
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="type" className={labelClass}>
                  {t("jobs.fieldType")}
                </label>
                <select
                  id="type"
                  className={controlClass}
                  value={formData.type}
                  onChange={(e) => updateField("type", e.target.value)}
                >
                  {withCurrent(JOB_TYPES, formData.type).map((value) => (
                    <option key={value} value={value}>{tv("opt.jobType", value)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="seniority" className={labelClass}>
                  {t("jobs.fieldSeniority")}
                </label>
                <select
                  id="seniority"
                  className={controlClass}
                  value={formData.seniority}
                  onChange={(e) => updateField("seniority", e.target.value)}
                >
                  {withCurrent(SENIORITY_LEVELS, formData.seniority).map((value) => (
                    <option key={value} value={value}>{tv("opt.seniority", value)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                id="salaryMin"
                type="number"
                inputMode="numeric"
                min={0}
                label={t("jobs.fieldSalaryMinOptional")}
                placeholder="60000"
                value={formData.salaryMin}
                onChange={(e) => updateField("salaryMin", e.target.value)}
              />
              <Input
                id="salaryMax"
                type="number"
                inputMode="numeric"
                min={0}
                label={t("jobs.fieldSalaryMaxOptional")}
                placeholder="90000"
                value={formData.salaryMax}
                onChange={(e) => updateField("salaryMax", e.target.value)}
              />
              <div>
                <label htmlFor="currency" className={labelClass}>
                  {t("jobs.fieldCurrency")}
                </label>
                <select
                  id="currency"
                  className={controlClass}
                  value={formData.currency}
                  onChange={(e) => updateField("currency", e.target.value)}
                >
                  {withCurrent(CURRENCIES, formData.currency).map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
            </div>

            <JobMobilityFields values={mobility} onChange={updateMobility} />

            <Input
              id="tags"
              label={t("jobs.fieldTagsComma")}
              placeholder={t("jobs.tagsPlaceholder")}
              value={formData.tags}
              onChange={(e) => updateField("tags", e.target.value)}
            />

            <div className="flex flex-wrap gap-3 border-t border-line pt-6">
              <Button type="submit" className="flex-1" isLoading={saving} disabled={saving}>
                {saving ? t("common.saving") : t("common.saveChanges")}
              </Button>
              <Link href={localizePath("/employer", locale)}>
                <Button type="button" variant="ghost">
                  {t("common.cancel")}
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
