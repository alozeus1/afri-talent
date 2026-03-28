"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  adminPartners,
  AdminPartnerDetail,
  AdminPartnerSummary,
  CandidatePartnerMarkerType,
  PartnerOrganizationType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrustBadge } from "@/components/trust/trust-badge";
import { humanizeTrustValue } from "@/lib/trust-labels";
import { localizePath, useLocale } from "@/lib/i18n/client";

const organizationTypes: PartnerOrganizationType[] = [
  "UNIVERSITY",
  "BOOTCAMP",
  "TRAINING_INSTITUTE",
  "SCHOLARSHIP_PARTNER",
];

const markerTypes: CandidatePartnerMarkerType[] = [
  "UNIVERSITY_VERIFIED",
  "BOOTCAMP_VERIFIED",
  "TRAINING_VERIFIED",
  "SCHOLARSHIP_ALUMNI",
  "SCHOLARSHIP_FELLOW",
  "PARTNER_RECOMMENDED",
];

export default function AdminPartnersPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [partners, setPartners] = useState<AdminPartnerSummary[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [detail, setDetail] = useState<AdminPartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    externalId: "",
    name: "",
    organizationType: "UNIVERSITY" as PartnerOrganizationType,
    country: "",
    website: "",
    apiKey: "",
  });

  const [markerForm, setMarkerForm] = useState({
    userId: "",
    markerType: "UNIVERSITY_VERIFIED" as CandidatePartnerMarkerType,
    label: "",
    description: "",
  });

  const [skillForm, setSkillForm] = useState({
    userId: "",
    skillName: "",
    method: "PARTNER_ISSUED" as "PARTNER_ISSUED" | "MANUAL_REVIEW",
    evidenceLabel: "",
    evidenceUrl: "",
    score: "",
    confidenceNote: "",
  });

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminPartners.list();
      setPartners(response.partners);
      setSelectedPartnerId((current) => current || response.partners[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load partners.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPartnerDetail = useCallback(async (partnerId: string) => {
    try {
      const response = await adminPartners.detail(partnerId);
      setDetail(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load partner detail.");
    }
  }, []);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push(localizePath("/login", locale));
    }
  }, [isLoading, locale, router, user]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadPartners();
    }
  }, [loadPartners, user]);

  useEffect(() => {
    if (selectedPartnerId) {
      loadPartnerDetail(selectedPartnerId);
    } else {
      setDetail(null);
    }
  }, [loadPartnerDetail, selectedPartnerId]);

  const handleCreatePartner = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setSuccess(null);
    try {
      await adminPartners.create({
        ...createForm,
        country: createForm.country.toUpperCase(),
        website: createForm.website.trim() || undefined,
      });
      setCreateForm({
        externalId: "",
        name: "",
        organizationType: "UNIVERSITY",
        country: "",
        website: "",
        apiKey: "",
      });
      await loadPartners();
      setSuccess("Partner created.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to create partner.");
    } finally {
      setBusy(null);
    }
  };

  const handleIssueMarker = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPartnerId) return;
    setBusy("marker");
    setError(null);
    setSuccess(null);
    try {
      await adminPartners.issueMarker(selectedPartnerId, {
        ...markerForm,
        label: markerForm.label.trim() || undefined,
        description: markerForm.description.trim() || undefined,
      });
      setMarkerForm({
        userId: "",
        markerType: "UNIVERSITY_VERIFIED",
        label: "",
        description: "",
      });
      await loadPartnerDetail(selectedPartnerId);
      setSuccess("Partner marker issued.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to issue partner marker.");
    } finally {
      setBusy(null);
    }
  };

  const handleIssueSkill = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPartnerId) return;
    setBusy("skill");
    setError(null);
    setSuccess(null);
    try {
      await adminPartners.issueVerifiedSkill(selectedPartnerId, {
        userId: skillForm.userId,
        skillName: skillForm.skillName,
        method: skillForm.method,
        evidenceLabel: skillForm.evidenceLabel.trim() || undefined,
        evidenceUrl: skillForm.evidenceUrl.trim() || undefined,
        score: skillForm.score ? Number(skillForm.score) : undefined,
        confidenceNote: skillForm.confidenceNote.trim() || undefined,
      });
      setSkillForm({
        userId: "",
        skillName: "",
        method: "PARTNER_ISSUED",
        evidenceLabel: "",
        evidenceUrl: "",
        score: "",
        confidenceNote: "",
      });
      await loadPartnerDetail(selectedPartnerId);
      setSuccess("Verified skill issued.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to issue verified skill.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">
              Partner Operations
            </p>
            <h1 className="text-3xl font-bold text-gray-900">Institution and training trust tooling</h1>
            <p className="mt-3 max-w-3xl text-sm text-gray-600">
              Create approved partner organizations, review ingestion records, and issue employer-facing candidate trust markers or verified skills.
            </p>
          </div>
          <Link href={localizePath("/admin", locale)}>
            <Button variant="outline">Back to admin</Button>
          </Link>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Create partner</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreatePartner} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="External ID"
                  value={createForm.externalId}
                  onChange={(event) => setCreateForm((current) => ({ ...current, externalId: event.target.value }))}
                  placeholder="partner-uni-lagos"
                />
                <Input
                  label="Partner name"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="University of Lagos"
                />
                <div>
                  <label htmlFor="organizationType" className="block text-sm font-medium text-gray-700 mb-1">
                    Organization type
                  </label>
                  <select
                    id="organizationType"
                    value={createForm.organizationType}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        organizationType: event.target.value as PartnerOrganizationType,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {organizationTypes.map((type) => (
                      <option key={type} value={type}>
                        {humanizeTrustValue(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Country"
                  value={createForm.country}
                  onChange={(event) => setCreateForm((current) => ({ ...current, country: event.target.value }))}
                  placeholder="NG"
                />
                <Input
                  label="Website"
                  value={createForm.website}
                  onChange={(event) => setCreateForm((current) => ({ ...current, website: event.target.value }))}
                  placeholder="https://example.org"
                />
                <Input
                  label="API key"
                  value={createForm.apiKey}
                  onChange={(event) => setCreateForm((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder="Paste generated partner key"
                />
              </div>

              <Button type="submit" disabled={busy === "create"}>
                {busy === "create" ? "Creating..." : "Create partner"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Partner directory</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {partners.length === 0 ? (
              <p className="text-sm text-gray-600">No partners configured yet.</p>
            ) : (
              partners.map((partner) => (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => setSelectedPartnerId(partner.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedPartnerId === partner.id
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-gray-200 bg-white hover:border-emerald-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{partner.name}</p>
                    <TrustBadge label={humanizeTrustValue(partner.organizationType)} variant="info" />
                    <TrustBadge label={humanizeTrustValue(partner.status)} variant={partner.status === "ACTIVE" ? "success" : "warning"} />
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {partner.externalId} • {partner.country}
                  </p>
                  {partner._count && (
                    <p className="mt-2 text-xs text-gray-500">
                      {partner._count.records} records • {partner._count.verifiedSkills} issued skills • {partner._count.partnerMarkers} markers
                    </p>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {detail && (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Issue candidate marker</h2>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleIssueMarker} className="space-y-4">
                  <Input
                    label="Candidate user ID"
                    value={markerForm.userId}
                    onChange={(event) => setMarkerForm((current) => ({ ...current, userId: event.target.value }))}
                    placeholder="Candidate UUID"
                  />
                  <div>
                    <label htmlFor="markerType" className="block text-sm font-medium text-gray-700 mb-1">
                      Marker type
                    </label>
                    <select
                      id="markerType"
                      value={markerForm.markerType}
                      onChange={(event) =>
                        setMarkerForm((current) => ({
                          ...current,
                          markerType: event.target.value as CandidatePartnerMarkerType,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {markerTypes.map((type) => (
                        <option key={type} value={type}>
                          {humanizeTrustValue(type)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Label"
                    value={markerForm.label}
                    onChange={(event) => setMarkerForm((current) => ({ ...current, label: event.target.value }))}
                    placeholder={`${detail.partner.name} verified`}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={markerForm.description}
                      onChange={(event) => setMarkerForm((current) => ({ ...current, description: event.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                      placeholder="What was validated and why employers should trust it."
                    />
                  </div>
                  <Button type="submit" disabled={busy === "marker"}>
                    {busy === "marker" ? "Issuing..." : "Issue marker"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Issue verified skill</h2>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleIssueSkill} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Candidate user ID"
                      value={skillForm.userId}
                      onChange={(event) => setSkillForm((current) => ({ ...current, userId: event.target.value }))}
                      placeholder="Candidate UUID"
                    />
                    <Input
                      label="Skill"
                      value={skillForm.skillName}
                      onChange={(event) => setSkillForm((current) => ({ ...current, skillName: event.target.value }))}
                      placeholder="React"
                    />
                    <div>
                      <label htmlFor="skillMethod" className="block text-sm font-medium text-gray-700 mb-1">
                        Method
                      </label>
                      <select
                        id="skillMethod"
                        value={skillForm.method}
                        onChange={(event) =>
                          setSkillForm((current) => ({
                            ...current,
                            method: event.target.value as "PARTNER_ISSUED" | "MANUAL_REVIEW",
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="PARTNER_ISSUED">Partner issued</option>
                        <option value="MANUAL_REVIEW">Manual review</option>
                      </select>
                    </div>
                    <Input
                      label="Score"
                      type="number"
                      value={skillForm.score}
                      onChange={(event) => setSkillForm((current) => ({ ...current, score: event.target.value }))}
                      placeholder="85"
                    />
                    <Input
                      label="Evidence label"
                      value={skillForm.evidenceLabel}
                      onChange={(event) => setSkillForm((current) => ({ ...current, evidenceLabel: event.target.value }))}
                      placeholder="Partner capstone review"
                    />
                    <Input
                      label="Evidence URL"
                      type="url"
                      value={skillForm.evidenceUrl}
                      onChange={(event) => setSkillForm((current) => ({ ...current, evidenceUrl: event.target.value }))}
                      placeholder="https://example.org/credential"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reviewer note
                    </label>
                    <textarea
                      value={skillForm.confidenceNote}
                      onChange={(event) => setSkillForm((current) => ({ ...current, confidenceNote: event.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                      placeholder="Why this skill should be trusted."
                    />
                  </div>
                  <Button type="submit" disabled={busy === "skill"}>
                    {busy === "skill" ? "Issuing..." : "Issue verified skill"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr_1fr]">
            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Ingestion records</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.records.length === 0 ? (
                  <p className="text-sm text-gray-600">No partner records received yet.</p>
                ) : (
                  detail.records.slice(0, 10).map((record) => (
                    <div key={record.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <TrustBadge label={humanizeTrustValue(record.type)} variant="info" />
                        <TrustBadge label={humanizeTrustValue(record.status)} variant="warning" />
                      </div>
                      <p className="mt-2 text-sm font-medium text-gray-900">{record.externalRecordId}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Issued markers</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.issuedMarkers.length === 0 ? (
                  <p className="text-sm text-gray-600">No markers issued yet.</p>
                ) : (
                  detail.issuedMarkers.slice(0, 10).map((marker) => (
                    <div key={marker.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="font-medium text-gray-900">{marker.user.name}</p>
                      <p className="mt-1 text-sm text-gray-600">{marker.label}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <TrustBadge label={humanizeTrustValue(marker.markerType)} variant="info" />
                        <TrustBadge label={humanizeTrustValue(marker.status)} variant="success" />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Issued skills</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.issuedSkills.length === 0 ? (
                  <p className="text-sm text-gray-600">No verified skills issued yet.</p>
                ) : (
                  detail.issuedSkills.slice(0, 10).map((skill) => (
                    <div key={skill.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="font-medium text-gray-900">{skill.user.name}</p>
                      <p className="mt-1 text-sm text-gray-600">{skill.skillName}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <TrustBadge label={humanizeTrustValue(skill.method)} variant="info" />
                        <TrustBadge label={humanizeTrustValue(skill.status)} variant="success" />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
