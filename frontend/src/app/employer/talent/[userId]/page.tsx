"use client";

import { ReactNode, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TalentProfile, talent } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MessageCandidateButton } from "@/components/employer/message-candidate-button";
import { BackLink, PageSpinner } from "@/components/employer/employer-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";

function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function EmployerTalentProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const locale = useLocale();
  const { user, isLoading } = useAuth();
  const { t, tn, tv } = useEmployerI18n();

  const [profile, setProfile] = useState<TalentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || (user.role !== "EMPLOYER" && user.role !== "ADMIN"))) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  useEffect(() => {
    if (!user || (user.role !== "EMPLOYER" && user.role !== "ADMIN") || !userId) return;
    let cancelled = false;
    talent
      .get(userId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, userId]);

  if (isLoading || !user || loading) {
    return <PageSpinner />;
  }

  const backLink = <BackLink href={localizePath("/employer/talent", locale)}>{t("profile.back")}</BackLink>;

  if (error !== null || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {backLink}
        <Card>
          <CardContent className="py-10 text-center">
            <h1 className="text-xl font-semibold text-fg">{t("profile.unavailableTitle")}</h1>
            <p className="mt-2 text-sm text-fg-secondary">{error || t("profile.unavailableBody")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const links = [
    { label: "LinkedIn", url: safeExternalUrl(profile.linkedinUrl) },
    { label: "GitHub", url: safeExternalUrl(profile.githubUrl) },
    { label: t("common.portfolio"), url: safeExternalUrl(profile.portfolioUrl) },
  ].filter((link): link is { label: string; url: string } => Boolean(link.url));
  const workHistory = profile.workHistory ?? [];
  const education = profile.educationHistory ?? [];
  const initials = profile.user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {backLink}

      <Card>
        <CardHeader className="py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-lg font-semibold text-primary-text"
              >
                {initials || "?"}
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-fg">{profile.user.name}</h1>
                {profile.headline && <p className="mt-1 text-fg-secondary">{profile.headline}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
                  {profile.yearsExperience !== null && <span>{tn("common.yearsExperience", profile.yearsExperience)}</span>}
                  {profile.match && <Badge variant="success">{t("profile.match", { score: Math.round(profile.match.score) })}</Badge>}
                  {profile.mobility && (
                    <Badge variant="info">{t("profile.mobility", { label: tv("mobility.label", profile.mobility.label) })}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="sm:w-72">
              <MessageCandidateButton candidateUserId={profile.user.id} candidateName={profile.user.name} className="w-full" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          {profile.bio && (
            <Section title={t("profile.about")}>
              <p className="whitespace-pre-line text-fg-secondary">{profile.bio}</p>
            </Section>
          )}

          <Section title={t("profile.skills")}>
            {profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <Badge key={skill} variant="default">{skill}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-fg-muted">{t("profile.noSkills")}</p>
            )}
            {(profile.verifiedSkills?.length ?? 0) > 0 && (
              <p className="mt-3 text-sm text-success">
                {t("profile.verified", { skills: profile.verifiedSkills!.map((skill) => skill.skillName).join(", ") })}
              </p>
            )}
          </Section>

          <Section title={t("profile.experience")}>
            {workHistory.length > 0 ? (
              <ol className="space-y-4 border-s border-line ps-4">
                {workHistory.map((item, index) => (
                  <li key={`${item.company}-${item.title}-${index}`} className="relative">
                    <span aria-hidden="true" className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="font-medium text-fg">
                      {item.title && item.company
                        ? t("profile.roleAt", { title: item.title, company: item.company })
                        : item.title || item.company || t("profile.role")}
                    </p>
                    {item.period && <p className="text-sm text-fg-muted">{item.period}</p>}
                    {item.description && <p className="mt-1 text-sm text-fg-secondary">{item.description}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-fg-muted">{t("profile.noWork")}</p>
            )}
            {education.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-fg-secondary">
                {education.map((item, index) => (
                  <li key={`${item.institution}-${index}`}>
                    {[item.degree, item.institution].filter(Boolean).join(", ")}
                    {item.period ? ` (${item.period})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("profile.locationMobility")}>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-fg-muted">{t("profile.targetCountries")}</dt>
                <dd className="mt-0.5 text-fg">
                  {profile.targetCountries.length > 0 ? profile.targetCountries.join(", ") : t("common.notSpecified")}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">{t("profile.visaStatus")}</dt>
                <dd className="mt-0.5 text-fg">{profile.visaStatus || t("common.notSpecified")}</dd>
              </div>
              {profile.targetRoles.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-fg-muted">{t("profile.targetRoles")}</dt>
                  <dd className="mt-0.5 text-fg">{profile.targetRoles.join(", ")}</dd>
                </div>
              )}
            </dl>
          </Section>

          {links.length > 0 && (
            <Section title={t("profile.links")}>
              <ul className="flex flex-wrap gap-4 text-sm">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
