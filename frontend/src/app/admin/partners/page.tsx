"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  adminPartners,
  AdminPartnerDetail,
  AdminPartnerSummary,
  CandidatePartnerMarkerType,
  PartnerOrganizationType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAdminEnum, useAdminT } from "@/lib/i18n/admin-messages";
import {
  EmptyState,
  Field,
  Notice,
  PageHeader,
  Panel,
  Pill,
  Spinner,
  fieldClass,
  muted,
  statusTone,
  strong,
} from "@/components/admin/console-ui";

const organizationTypes: PartnerOrganizationType[] = ["UNIVERSITY", "BOOTCAMP", "TRAINING_INSTITUTE", "SCHOLARSHIP_PARTNER"];

const markerTypes: CandidatePartnerMarkerType[] = [
  "UNIVERSITY_VERIFIED",
  "BOOTCAMP_VERIFIED",
  "TRAINING_VERIFIED",
  "SCHOLARSHIP_ALUMNI",
  "SCHOLARSHIP_FELLOW",
  "PARTNER_RECOMMENDED",
];

// Example values shown as placeholders (identifiers, not user-facing copy).
const EXAMPLES = {
  externalId: "partner-uni-lagos",
  name: "University of Lagos",
  country: "NG",
  website: "https://example.org",
  skill: "React",
  score: "85",
  evidenceUrl: "https://example.org/credential",
};

const PARTNERS_ENABLED = process.env.NEXT_PUBLIC_PHASE4_UNIVERSITY_API_ENABLED === "true";

const emptyCreate = { externalId: "", name: "", organizationType: "UNIVERSITY" as PartnerOrganizationType, country: "", website: "", apiKey: "" };
const emptyMarker = { userId: "", markerType: "UNIVERSITY_VERIFIED" as CandidatePartnerMarkerType, label: "", description: "" };
const emptySkill = {
  userId: "",
  skillName: "",
  method: "PARTNER_ISSUED" as "PARTNER_ISSUED" | "MANUAL_REVIEW",
  evidenceLabel: "",
  evidenceUrl: "",
  score: "",
  confidenceNote: "",
};

export default function AdminPartnersPage() {
  const t = useAdminT();
  const label = useAdminEnum();

  const [partners, setPartners] = useState<AdminPartnerSummary[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [detail, setDetail] = useState<AdminPartnerDetail | null>(null);
  const [loading, setLoading] = useState(PARTNERS_ENABLED);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [markerForm, setMarkerForm] = useState(emptyMarker);
  const [skillForm, setSkillForm] = useState(emptySkill);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminPartners.list();
      setPartners(response.partners);
      setSelectedPartnerId((current) => current || response.partners[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadPartnerDetail = useCallback(
    async (partnerId: string) => {
      try {
        setDetail(await adminPartners.detail(partnerId));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("common.error"));
      }
    },
    [t],
  );

  useEffect(() => {
    if (PARTNERS_ENABLED) void loadPartners();
  }, [loadPartners]);

  useEffect(() => {
    if (selectedPartnerId) void loadPartnerDetail(selectedPartnerId);
    else setDetail(null);
  }, [loadPartnerDetail, selectedPartnerId]);

  const run = async (key: string, action: () => Promise<void>, successText: string) => {
    setBusy(key);
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(successText);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const handleCreatePartner = (event: FormEvent) => {
    event.preventDefault();
    void run(
      "create",
      async () => {
        await adminPartners.create({
          ...createForm,
          country: createForm.country.toUpperCase(),
          website: createForm.website.trim() || undefined,
        });
        setCreateForm(emptyCreate);
        await loadPartners();
      },
      t("partners.created"),
    );
  };

  const handleIssueMarker = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPartnerId) return;
    void run(
      "marker",
      async () => {
        await adminPartners.issueMarker(selectedPartnerId, {
          ...markerForm,
          label: markerForm.label.trim() || undefined,
          description: markerForm.description.trim() || undefined,
        });
        setMarkerForm(emptyMarker);
        await loadPartnerDetail(selectedPartnerId);
      },
      t("partners.markerIssued"),
    );
  };

  const handleIssueSkill = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPartnerId) return;
    void run(
      "skill",
      async () => {
        await adminPartners.issueVerifiedSkill(selectedPartnerId, {
          userId: skillForm.userId,
          skillName: skillForm.skillName,
          method: skillForm.method,
          evidenceLabel: skillForm.evidenceLabel.trim() || undefined,
          evidenceUrl: skillForm.evidenceUrl.trim() || undefined,
          score: skillForm.score ? Number(skillForm.score) : undefined,
          confidenceNote: skillForm.confidenceNote.trim() || undefined,
        });
        setSkillForm(emptySkill);
        await loadPartnerDetail(selectedPartnerId);
      },
      t("partners.skillIssued"),
    );
  };

  const header = (
    <PageHeader eyebrow={t("partners.eyebrow")} title={t("partners.title")} subtitle={PARTNERS_ENABLED ? t("partners.subtitle") : undefined} />
  );

  if (!PARTNERS_ENABLED) {
    return (
      <div>
        {header}
        <EmptyState title={t("partners.disabled")} description={t("partners.disabledHelp")} />
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        {header}
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}
      {success && <Notice tone="success" onDismiss={() => setSuccess(null)}>{success}</Notice>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel title={t("partners.create")}>
          <form onSubmit={handleCreatePartner} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("partners.externalId")}>
                {(id) => <input id={id} required className={`${fieldClass} font-mono`} value={createForm.externalId} placeholder={EXAMPLES.externalId}
                  onChange={(e) => setCreateForm((c) => ({ ...c, externalId: e.target.value }))} />}
              </Field>
              <Field label={t("partners.name")}>
                {(id) => <input id={id} required className={fieldClass} value={createForm.name} placeholder={EXAMPLES.name}
                  onChange={(e) => setCreateForm((c) => ({ ...c, name: e.target.value }))} />}
              </Field>
              <Field label={t("partners.orgType")}>
                {(id) => (
                  <select id={id} className={fieldClass} value={createForm.organizationType}
                    onChange={(e) => setCreateForm((c) => ({ ...c, organizationType: e.target.value as PartnerOrganizationType }))}>
                    {organizationTypes.map((type) => <option key={type} value={type}>{label("orgType", type)}</option>)}
                  </select>
                )}
              </Field>
              <Field label={t("partners.country")} help={t("partners.countryHelp")}>
                {(id) => <input id={id} maxLength={2} className={`${fieldClass} uppercase`} value={createForm.country} placeholder={EXAMPLES.country}
                  onChange={(e) => setCreateForm((c) => ({ ...c, country: e.target.value }))} />}
              </Field>
              <Field label={t("partners.website")}>
                {(id) => <input id={id} type="url" className={fieldClass} value={createForm.website} placeholder={EXAMPLES.website}
                  onChange={(e) => setCreateForm((c) => ({ ...c, website: e.target.value }))} />}
              </Field>
              <Field label={t("partners.apiKey")}>
                {(id) => <input id={id} autoComplete="off" className={`${fieldClass} font-mono`} value={createForm.apiKey} placeholder={t("partners.apiKeyPlaceholder")}
                  onChange={(e) => setCreateForm((c) => ({ ...c, apiKey: e.target.value }))} />}
              </Field>
            </div>
            <Button type="submit" isLoading={busy === "create"}>{t("partners.createSubmit")}</Button>
          </form>
        </Panel>

        <Panel title={t("partners.directory")}>
          {partners.length === 0 ? (
            <EmptyState title={t("partners.none")} />
          ) : (
            <ul className="space-y-2">
              {partners.map((partner) => {
                const active = selectedPartnerId === partner.id;
                return (
                  <li key={partner.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPartnerId(partner.id)}
                      aria-pressed={active}
                      className={`w-full rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                        active ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong hover:bg-surface-sunken"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-semibold ${strong}`}>{partner.name}</p>
                        <Pill tone="blue">{label("orgType", partner.organizationType)}</Pill>
                        <Pill tone={partner.status === "ACTIVE" ? "green" : "amber"}>{label("partnerStatus", partner.status)}</Pill>
                      </div>
                      <p className={`mt-1 text-sm ${muted}`}>{partner.externalId} · {partner.country}</p>
                      {partner._count && (
                        <p className={`mt-1 text-xs ${muted}`}>
                          {t("partners.counts", { records: partner._count.records, skills: partner._count.verifiedSkills, markers: partner._count.partnerMarkers })}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {detail && (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title={t("partners.issueMarker")} description={detail.partner.name}>
              <form onSubmit={handleIssueMarker} className="space-y-4">
                <Field label={t("partners.candidateId")}>
                  {(id) => <input id={id} required className={`${fieldClass} font-mono`} value={markerForm.userId} placeholder={t("partners.candidateIdPlaceholder")}
                    onChange={(e) => setMarkerForm((c) => ({ ...c, userId: e.target.value }))} />}
                </Field>
                <Field label={t("partners.markerType")}>
                  {(id) => (
                    <select id={id} className={fieldClass} value={markerForm.markerType}
                      onChange={(e) => setMarkerForm((c) => ({ ...c, markerType: e.target.value as CandidatePartnerMarkerType }))}>
                      {markerTypes.map((type) => <option key={type} value={type}>{label("markerType", type)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label={t("partners.label")}>
                  {(id) => <input id={id} className={fieldClass} value={markerForm.label} placeholder={t("partners.labelPlaceholder", { name: detail.partner.name })}
                    onChange={(e) => setMarkerForm((c) => ({ ...c, label: e.target.value }))} />}
                </Field>
                <Field label={t("partners.description")}>
                  {(id) => <textarea id={id} rows={3} className={`${fieldClass} resize-none`} value={markerForm.description} placeholder={t("partners.descriptionPlaceholder")}
                    onChange={(e) => setMarkerForm((c) => ({ ...c, description: e.target.value }))} />}
                </Field>
                <Button type="submit" isLoading={busy === "marker"}>{t("partners.issueMarkerSubmit")}</Button>
              </form>
            </Panel>

            <Panel title={t("partners.issueSkill")} description={detail.partner.name}>
              <form onSubmit={handleIssueSkill} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("partners.candidateId")}>
                    {(id) => <input id={id} required className={`${fieldClass} font-mono`} value={skillForm.userId} placeholder={t("partners.candidateIdPlaceholder")}
                      onChange={(e) => setSkillForm((c) => ({ ...c, userId: e.target.value }))} />}
                  </Field>
                  <Field label={t("partners.skill")}>
                    {(id) => <input id={id} required className={fieldClass} value={skillForm.skillName} placeholder={EXAMPLES.skill}
                      onChange={(e) => setSkillForm((c) => ({ ...c, skillName: e.target.value }))} />}
                  </Field>
                  <Field label={t("partners.method")}>
                    {(id) => (
                      <select id={id} className={fieldClass} value={skillForm.method}
                        onChange={(e) => setSkillForm((c) => ({ ...c, method: e.target.value as "PARTNER_ISSUED" | "MANUAL_REVIEW" }))}>
                        <option value="PARTNER_ISSUED">{label("skillMethod", "PARTNER_ISSUED")}</option>
                        <option value="MANUAL_REVIEW">{label("skillMethod", "MANUAL_REVIEW")}</option>
                      </select>
                    )}
                  </Field>
                  <Field label={t("partners.score")}>
                    {(id) => <input id={id} type="number" min={0} max={100} className={fieldClass} value={skillForm.score} placeholder={EXAMPLES.score}
                      onChange={(e) => setSkillForm((c) => ({ ...c, score: e.target.value }))} />}
                  </Field>
                  <Field label={t("partners.evidenceLabel")}>
                    {(id) => <input id={id} className={fieldClass} value={skillForm.evidenceLabel} placeholder={t("partners.evidenceLabelPlaceholder")}
                      onChange={(e) => setSkillForm((c) => ({ ...c, evidenceLabel: e.target.value }))} />}
                  </Field>
                  <Field label={t("partners.evidenceUrl")}>
                    {(id) => <input id={id} type="url" className={fieldClass} value={skillForm.evidenceUrl} placeholder={EXAMPLES.evidenceUrl}
                      onChange={(e) => setSkillForm((c) => ({ ...c, evidenceUrl: e.target.value }))} />}
                  </Field>
                </div>
                <Field label={t("partners.reviewerNote")}>
                  {(id) => <textarea id={id} rows={3} className={`${fieldClass} resize-none`} value={skillForm.confidenceNote} placeholder={t("partners.reviewerNotePlaceholder")}
                    onChange={(e) => setSkillForm((c) => ({ ...c, confidenceNote: e.target.value }))} />}
                </Field>
                <Button type="submit" isLoading={busy === "skill"}>{t("partners.issueSkillSubmit")}</Button>
              </form>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title={t("partners.records")}>
              {detail.records.length === 0 ? (
                <p className={`text-sm ${muted}`}>{t("partners.noRecords")}</p>
              ) : (
                <ul className="space-y-2">
                  {detail.records.slice(0, 10).map((record) => (
                    <li key={record.id} className="rounded-xl border border-line bg-surface-sunken p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Pill tone="blue">{label("recordType", record.type)}</Pill>
                        <Pill tone={statusTone(record.status)}>{label("recordStatus", record.status)}</Pill>
                      </div>
                      <p className={`mt-2 break-all font-mono text-xs ${strong}`}>{record.externalRecordId}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t("partners.markers")}>
              {detail.issuedMarkers.length === 0 ? (
                <p className={`text-sm ${muted}`}>{t("partners.noMarkers")}</p>
              ) : (
                <ul className="space-y-2">
                  {detail.issuedMarkers.slice(0, 10).map((marker) => (
                    <li key={marker.id} className="rounded-xl border border-line bg-surface-sunken p-3">
                      <p className={`font-medium ${strong}`}>{marker.user.name}</p>
                      <p className={`mt-0.5 text-sm ${muted}`}>{marker.label}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Pill tone="blue">{label("markerType", marker.markerType)}</Pill>
                        <Pill tone={statusTone(marker.status)}>{label("partnerStatus", marker.status)}</Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t("partners.skills")}>
              {detail.issuedSkills.length === 0 ? (
                <p className={`text-sm ${muted}`}>{t("partners.noSkills")}</p>
              ) : (
                <ul className="space-y-2">
                  {detail.issuedSkills.slice(0, 10).map((skill) => (
                    <li key={skill.id} className="rounded-xl border border-line bg-surface-sunken p-3">
                      <p className={`font-medium ${strong}`}>{skill.user.name}</p>
                      <p className={`mt-0.5 text-sm ${muted}`}>{skill.skillName}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Pill tone="blue">{label("skillMethod", skill.method)}</Pill>
                        <Pill tone={statusTone(skill.status)}>{label("skillStatus", skill.status)}</Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
