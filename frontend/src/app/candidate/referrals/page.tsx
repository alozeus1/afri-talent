"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { referrals, ReferralItem, ReferralStats } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  CandidateStat,
  URL_PLACEHOLDERS,
  candidateFieldClass,
  candidateLabelClass,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateFormatters, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  ACCEPTED: "success",
  HIRED: "success",
  EXPIRED: "default",
};

export default function ReferralsPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const { user, isLoading } = useAuth();
  const [myReferrals, setMyReferrals] = useState<ReferralItem[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [refereeEmail, setRefereeEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<CandidateMessageKey | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const [updating, setUpdating] = useState<string | null>(null);
  const [updateFailed, setUpdateFailed] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [referralList, referralStats] = await Promise.all([referrals.list(), referrals.stats()]);
      setMyReferrals(referralList);
      setStats(referralStats);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") loadData();
  }, [user, loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refereeEmail.trim()) {
      setFormError("ref.form.emailRequired");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(false);
    // The API has no job-link field yet, so the link travels inside the message.
    const fullMessage = [message.trim(), jobLink.trim() ? t("ref.form.jobLinkPrefix", { url: jobLink.trim() }) : ""]
      .filter(Boolean)
      .join("\n\n");
    try {
      const newReferral = await referrals.create({
        refereeEmail: refereeEmail.trim(),
        companyName: companyName.trim() || undefined,
        message: fullMessage || undefined,
      });
      setMyReferrals((prev) => [newReferral, ...prev]);
      if (stats) {
        setStats({ ...stats, totalMade: stats.totalMade + 1 });
      }
      setRefereeEmail("");
      setCompanyName("");
      setJobLink("");
      setMessage("");
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 4000);
    } catch {
      setFormError("ref.form.failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    setUpdating(id);
    setUpdateFailed(false);
    try {
      const updated = await referrals.updateStatus(id, status);
      setMyReferrals((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setStats(await referrals.stats());
    } catch (err) {
      console.error("Failed to update referral status:", err);
      setUpdateFailed(true);
    } finally {
      setUpdating(null);
    }
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  const statValue = (n: number | undefined) => (loading ? "–" : fmt.number(n ?? 0));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader title={t("ref.title")} description={t("ref.subtitle")} />

      {error ? (
        <CandidateLoadError className="mb-6" error={error} subject={t("ui.subject.referrals")} onRetry={loadData} />
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <CandidateStat label={t("ref.stat.made")} value={statValue(stats?.totalMade)} tone="primary" />
        <CandidateStat label={t("ref.stat.accepted")} value={statValue(stats?.totalAccepted)} tone="info" />
        <CandidateStat label={t("ref.stat.hired")} value={statValue(stats?.totalHired)} tone="success" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="self-start">
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("ref.form.title")}</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="referee-email"
                label={`${t("ref.form.email")} *`}
                type="email"
                placeholder={t("ref.form.emailPlaceholder")}
                value={refereeEmail}
                onChange={(e) => setRefereeEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                id="referee-company"
                label={t("ref.form.company")}
                type="text"
                placeholder={t("ref.form.companyPlaceholder")}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <Input
                id="referee-job-link"
                label={t("ref.form.jobLink")}
                type="url"
                placeholder={URL_PLACEHOLDERS.generic}
                value={jobLink}
                onChange={(e) => setJobLink(e.target.value)}
              />
              <div>
                <label htmlFor="referee-message" className={candidateLabelClass}>
                  {t("ref.form.message")}
                </label>
                <textarea
                  id="referee-message"
                  className={`${candidateFieldClass} resize-none`}
                  rows={3}
                  placeholder={t("ref.form.messagePlaceholder")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              {formError && <CandidateNotice>{t(formError)}</CandidateNotice>}
              {formSuccess && <CandidateNotice tone="success">{t("ref.form.success")}</CandidateNotice>}
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? t("ref.form.sending") : t("ref.form.send")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("ref.list.title")}</h2>
          </CardHeader>
          <CardContent>
            {updateFailed ? <CandidateNotice className="mb-4">{t("ref.updateFailed")}</CandidateNotice> : null}
            {loading ? (
              <CandidateSpinner className="py-8" />
            ) : myReferrals.length === 0 ? (
              <div className="py-12 text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-text"
                >
                  <Handshake className="h-6 w-6" />
                </span>
                <p className="mb-1 font-semibold text-fg">{t("ref.list.emptyTitle")}</p>
                <p className="mx-auto max-w-sm text-sm text-fg-muted">{t("ref.list.emptyBody")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {myReferrals.map((referral) => (
                  <li key={referral.id} className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="break-all font-medium text-fg">{referral.refereeEmail}</span>
                          <Badge variant={statusVariants[referral.status] || "default"}>
                            {enumLabel(t, "ref.status", referral.status)}
                          </Badge>
                        </div>
                        {referral.companyName && <p className="text-sm text-fg-secondary">{referral.companyName}</p>}
                        {referral.message && (
                          <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-fg-muted">{referral.message}</p>
                        )}
                        <p className="mt-1 text-xs text-fg-muted">{fmt.date(referral.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {referral.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusUpdate(referral.id, "ACCEPTED")}
                            disabled={updating === referral.id}
                          >
                            {t("ref.markAccepted")}
                          </Button>
                        )}
                        {(referral.status === "PENDING" || referral.status === "ACCEPTED") && (
                          <Button
                            size="sm"
                            onClick={() => handleStatusUpdate(referral.id, "HIRED")}
                            disabled={updating === referral.id}
                            isLoading={updating === referral.id}
                          >
                            {t("ref.markHired")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
