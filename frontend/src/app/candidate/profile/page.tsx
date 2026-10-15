"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { AFRICAN_COUNTRIES, OTHER_COUNTRIES, WORLDWIDE_CODE } from "@/lib/countries";
import { parseProfilePeriod } from "@/lib/profile-period";
import { useAuth } from "@/lib/auth-context";
import {
  CandidateCertificationItem,
  CandidateEducationItem,
  CandidateWorkHistoryItem,
  profile,
} from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  CandidateSwitch,
  CandidateTagInput,
  URL_PLACEHOLDERS,
  candidateFieldClass,
  candidateLabelClass,
  useCountryName,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

// Country picker: dropdown-only entry (no free text) so targetCountries stays
// clean for matching. African countries listed first; names are localised.
function CountrySelect({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useCandidateT();
  const countryName = useCountryName();
  const addCountry = (country: string) => {
    if (country && !values.includes(country)) onChange([...values, country]);
  };
  const sortByName = (list: typeof AFRICAN_COUNTRIES) =>
    [...list].sort((a, b) => countryName(a.code).localeCompare(countryName(b.code)));
  return (
    <div>
      <p className={candidateLabelClass}>{label}</p>
      {values.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {values.map((country) => (
            <li
              key={country}
              className="inline-flex items-center gap-1 rounded-full border border-success-line bg-primary-soft py-1 pe-1.5 ps-3 text-sm text-primary-text"
            >
              {countryName(country)}
              <button
                type="button"
                onClick={() => onChange(values.filter((c) => c !== country))}
                className="rounded-full px-1 font-semibold hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label={t("ui.removeTag", { tag: countryName(country) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <select
        value=""
        onChange={(e) => addCountry(e.target.value)}
        className={candidateFieldClass}
        aria-label={t("profile.addCountryLabel")}
      >
        <option value="">{t("profile.addCountry")}</option>
        {/* Values are ISO codes ("NG", "GLOBAL") so they match
            Job.eligibleCountries exactly in search and retention matching. */}
        <option value={WORLDWIDE_CODE}>{t("ui.worldwide")}</option>
        <optgroup label={t("profile.africa")}>
          {sortByName(AFRICAN_COUNTRIES).map((c) => (
            <option key={c.code} value={c.code}>
              {countryName(c.code)}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("profile.restOfWorld")}>
          {sortByName(OTHER_COUNTRIES).map((c) => (
            <option key={c.code} value={c.code}>
              {countryName(c.code)}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

// Period picker: calendar month inputs instead of free text. Serializes to the
// existing string format ("2022-03 – Present") so no schema change is needed;
// best-effort parses previously saved free-text values. "Present" is stored
// in English on purpose (it is data, not UI copy).
function PeriodPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const t = useCandidateT();
  const { start, end, isPresent } = parseProfilePeriod(value);

  const emit = (s: string, e: string, present: boolean) => {
    if (!s && !e && !present) return onChange("");
    onChange(`${s || ""} – ${present ? "Present" : e || ""}`.trim());
  };

  return (
    <fieldset>
      <legend className={candidateLabelClass}>{t("profile.period")}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={start}
          onChange={(e) => emit(e.target.value, end, isPresent)}
          className={`${candidateFieldClass} w-auto`}
          aria-label={t("profile.period.start")}
        />
        <span aria-hidden="true" className="text-fg-muted">
          –
        </span>
        <input
          type="month"
          value={end}
          disabled={isPresent}
          onChange={(e) => emit(start, e.target.value, false)}
          className={`${candidateFieldClass} w-auto`}
          aria-label={t("profile.period.end")}
        />
        <label className="inline-flex items-center gap-1.5 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={isPresent}
            onChange={(e) => emit(start, end, e.target.checked)}
            className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
          />
          {t("profile.period.present")}
        </label>
      </div>
    </fieldset>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-fg">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function RepeatableItem({ title, onRemove, children }: { title: string; onRemove: () => void; children: ReactNode }) {
  const t = useCandidateT();
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface-sunken p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <Button type="button" variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("ui.remove")}
        </Button>
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface-sunken px-4 py-5 text-sm text-fg-secondary">
      {children}
    </div>
  );
}

export default function CandidateProfilePage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const { user, isLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saveState, setSaveState] = useState<"saved" | "failed" | null>(null);

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
  const [workHistory, setWorkHistory] = useState<CandidateWorkHistoryItem[]>([]);
  const [educationHistory, setEducationHistory] = useState<CandidateEducationItem[]>([]);
  const [certifications, setCertifications] = useState<CandidateCertificationItem[]>([]);
  const [openToWork, setOpenToWork] = useState(false);
  const [completeness, setCompleteness] = useState(0);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

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
        setWorkHistory(data.workHistory || []);
        setEducationHistory(data.educationHistory || []);
        setCertifications(data.certifications || []);
        setOpenToWork(data.openToWork);
        setCompleteness(data.profileCompleteness);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      loadProfile();
    }
  }, [user, loadProfile]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = setTimeout(() => setSaveState(null), 4000);
    return () => clearTimeout(timer);
  }, [saveState]);

  const handleSave = async () => {
    setSaving(true);
    setSaveState(null);
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
        workHistory,
        educationHistory,
        certifications,
        openToWork,
      });
      setCompleteness(updated.profileCompleteness);
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    } finally {
      setSaving(false);
    }
  };

  const updateWorkHistory = (index: number, field: keyof CandidateWorkHistoryItem, value: string) => {
    setWorkHistory((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const updateEducationHistory = (index: number, field: keyof CandidateEducationItem, value: string) => {
    setEducationHistory((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const updateCertification = (index: number, field: keyof CandidateCertificationItem, value: string) => {
    setCertifications((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <LoadingState lines={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <CandidateLoadError error={error} subject={t("ui.subject.profile")} onRetry={loadProfile} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-6 lg:px-8 lg:pt-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader title={t("profile.title")} description={t("profile.subtitle")} />

      <Card className="mb-8">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="relative h-16 w-16 shrink-0"
              role="progressbar"
              aria-valuenow={completeness}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("profile.completeness")}
            >
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  stroke={completeness >= 80 ? "var(--success)" : "var(--warning)"}
                  strokeWidth="3"
                  strokeDasharray={`${completeness} ${100 - completeness}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-fg">
                {completeness}%
              </span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg">{t("profile.completeness")}</h2>
              <p className="text-sm text-fg-muted">
                {completeness >= 80 ? t("profile.completeness.great") : t("profile.completeness.more")}
              </p>
            </div>
          </div>
          <Link href={localizePath("/candidate/trust", locale)} className="shrink-0">
            <Button variant="outline" size="sm">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t("profile.viewTrust")}
            </Button>
          </Link>
        </CardContent>
      </Card>

      <SectionCard title={t("profile.personal")}>
        <Input
          id="headline"
          label={t("profile.headline")}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder={t("profile.headlinePlaceholder")}
        />
        <div>
          <label htmlFor="bio" className={candidateLabelClass}>
            {t("profile.bio")}
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t("profile.bioPlaceholder")}
            rows={4}
            className={`${candidateFieldClass} resize-y`}
          />
        </div>
      </SectionCard>

      <SectionCard title={t("profile.skills")}>
        <CandidateTagInput
          id="skills"
          label={t("profile.yourSkills")}
          tags={skills}
          onChange={setSkills}
          placeholder={t("profile.skillsPlaceholder")}
        />
      </SectionCard>

      <SectionCard title={t("profile.career")}>
        <CandidateTagInput
          id="target-roles"
          label={t("profile.targetRoles")}
          tags={targetRoles}
          onChange={setTargetRoles}
          placeholder={t("profile.targetRolesPlaceholder")}
        />
        <CountrySelect label={t("profile.targetCountries")} values={targetCountries} onChange={setTargetCountries} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="yearsExperience"
            label={t("profile.years")}
            type="number"
            min={0}
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={t("profile.yearsPlaceholder")}
          />
          <Input
            id="visaStatus"
            label={t("profile.visa")}
            value={visaStatus}
            onChange={(e) => setVisaStatus(e.target.value)}
            placeholder={t("profile.visaPlaceholder")}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t("profile.work")}
        description={t("profile.work.desc")}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWorkHistory((current) => [...current, { company: "", title: "", period: "", description: "" }])}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("profile.work.add")}
          </Button>
        }
      >
        {workHistory.length === 0 ? (
          <EmptyRow>{t("profile.work.empty")}</EmptyRow>
        ) : (
          workHistory.map((item, index) => (
            <RepeatableItem
              key={`work-${index}`}
              title={t("profile.work.item", { n: index + 1 })}
              onRemove={() => setWorkHistory((current) => current.filter((_, i) => i !== index))}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id={`work-${index}-title`}
                  label={t("profile.work.title")}
                  value={item.title || ""}
                  onChange={(event) => updateWorkHistory(index, "title", event.target.value)}
                  placeholder={t("profile.work.titlePlaceholder")}
                />
                <Input
                  id={`work-${index}-company`}
                  label={t("profile.work.company")}
                  value={item.company || ""}
                  onChange={(event) => updateWorkHistory(index, "company", event.target.value)}
                  placeholder={t("profile.work.companyPlaceholder")}
                />
              </div>
              <PeriodPicker value={item.period || ""} onChange={(next) => updateWorkHistory(index, "period", next)} />
              <div>
                <label htmlFor={`work-${index}-highlights`} className={candidateLabelClass}>
                  {t("profile.work.highlights")}
                </label>
                <textarea
                  id={`work-${index}-highlights`}
                  value={item.description || ""}
                  onChange={(event) => updateWorkHistory(index, "description", event.target.value)}
                  rows={3}
                  placeholder={t("profile.work.highlightsPlaceholder")}
                  className={`${candidateFieldClass} resize-y`}
                />
              </div>
            </RepeatableItem>
          ))
        )}
      </SectionCard>

      <SectionCard
        title={t("profile.edu")}
        description={t("profile.edu.desc")}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEducationHistory((current) => [...current, { institution: "", degree: "", period: "" }])}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("profile.edu.add")}
          </Button>
        }
      >
        {educationHistory.length === 0 ? (
          <EmptyRow>{t("profile.edu.empty")}</EmptyRow>
        ) : (
          educationHistory.map((item, index) => (
            <RepeatableItem
              key={`education-${index}`}
              title={t("profile.edu.item", { n: index + 1 })}
              onRemove={() => setEducationHistory((current) => current.filter((_, i) => i !== index))}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id={`edu-${index}-institution`}
                  label={t("profile.edu.institution")}
                  value={item.institution || ""}
                  onChange={(event) => updateEducationHistory(index, "institution", event.target.value)}
                  placeholder={t("profile.edu.institutionPlaceholder")}
                />
                <Input
                  id={`edu-${index}-degree`}
                  label={t("profile.edu.degree")}
                  value={item.degree || ""}
                  onChange={(event) => updateEducationHistory(index, "degree", event.target.value)}
                  placeholder={t("profile.edu.degreePlaceholder")}
                />
              </div>
              <PeriodPicker value={item.period || ""} onChange={(next) => updateEducationHistory(index, "period", next)} />
            </RepeatableItem>
          ))
        )}
      </SectionCard>

      <SectionCard
        title={t("profile.cert")}
        description={t("profile.cert.desc")}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCertifications((current) => [...current, { name: "", issuer: "", credentialUrl: "" }])}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("profile.cert.add")}
          </Button>
        }
      >
        {certifications.length === 0 ? (
          <EmptyRow>{t("profile.cert.empty")}</EmptyRow>
        ) : (
          certifications.map((item, index) => (
            <RepeatableItem
              key={`certification-${index}`}
              title={t("profile.cert.item", { n: index + 1 })}
              onRemove={() => setCertifications((current) => current.filter((_, i) => i !== index))}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id={`cert-${index}-name`}
                  label={t("profile.cert.name")}
                  value={item.name || ""}
                  onChange={(event) => updateCertification(index, "name", event.target.value)}
                  placeholder={t("profile.cert.namePlaceholder")}
                />
                <Input
                  id={`cert-${index}-issuer`}
                  label={t("profile.cert.issuer")}
                  value={item.issuer || ""}
                  onChange={(event) => updateCertification(index, "issuer", event.target.value)}
                  placeholder={t("profile.cert.issuerPlaceholder")}
                />
              </div>
              <Input
                id={`cert-${index}-url`}
                label={t("profile.cert.url")}
                type="url"
                value={item.credentialUrl || ""}
                onChange={(event) => updateCertification(index, "credentialUrl", event.target.value)}
                placeholder={URL_PLACEHOLDERS.generic}
              />
            </RepeatableItem>
          ))
        )}
      </SectionCard>

      <SectionCard title={t("profile.links")}>
        <Input
          id="linkedinUrl"
          label={t("profile.linkedin")}
          type="url"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder={URL_PLACEHOLDERS.linkedin}
        />
        <Input
          id="githubUrl"
          label={t("profile.github")}
          type="url"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          placeholder={URL_PLACEHOLDERS.github}
        />
        <Input
          id="portfolioUrl"
          label={t("profile.portfolio")}
          type="url"
          value={portfolioUrl}
          onChange={(e) => setPortfolioUrl(e.target.value)}
          placeholder={URL_PLACEHOLDERS.generic}
        />
      </SectionCard>

      <SectionCard title={t("profile.visibility")}>
        <div className="flex items-center gap-3">
          <CandidateSwitch checked={openToWork} onChange={setOpenToWork} label={t("profile.openToWork")} />
          <div>
            <span className="text-sm font-medium text-fg">
              {openToWork ? t("profile.openToWork") : t("profile.notLooking")}
            </span>
            <p className="text-xs text-fg-muted">{openToWork ? t("profile.visible") : t("profile.hidden")}</p>
          </div>
        </div>
      </SectionCard>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div aria-live="polite" className="min-h-5 text-sm">
            {saveState === "saved" ? (
              <span className="font-medium text-success">{t("profile.saved")}</span>
            ) : saveState === "failed" ? (
              <CandidateNotice className="py-2">{t("profile.saveFailed")}</CandidateNotice>
            ) : (
              <span className="text-fg-muted">{t("profile.unsaved")}</span>
            )}
          </div>
          <Button size="lg" onClick={handleSave} disabled={saving} isLoading={saving}>
            {t("profile.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
