"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TalentProfile, talent } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MessageCandidateButton } from "@/components/employer/message-candidate-button";
import { localizePath, useLocale } from "@/lib/i18n/client";

function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export default function EmployerTalentProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const locale = useLocale();
  const { user, isLoading } = useAuth();

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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load candidate");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, userId]);

  if (isLoading || !user || loading) {
    return (
      <div className="flex justify-center py-24" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const backLink = (
    <Link href={localizePath("/employer/talent", locale)} className="mb-6 inline-flex items-center text-sm font-medium text-emerald-700 hover:text-emerald-800">
      &larr; Back to talent search
    </Link>
  );

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {backLink}
        <Card>
          <CardContent className="py-10 text-center">
            <h1 className="text-xl font-semibold text-gray-900">Candidate unavailable</h1>
            <p className="mt-2 text-sm text-gray-600">
              {error || "This candidate profile could not be found or is no longer open to work."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const links = [
    { label: "LinkedIn", url: safeExternalUrl(profile.linkedinUrl) },
    { label: "GitHub", url: safeExternalUrl(profile.githubUrl) },
    { label: "Portfolio", url: safeExternalUrl(profile.portfolioUrl) },
  ].filter((link): link is { label: string; url: string } => Boolean(link.url));
  const workHistory = profile.workHistory ?? [];
  const education = profile.educationHistory ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {backLink}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">{profile.user.name}</h1>
              {profile.headline && <p className="mt-1 text-gray-700">{profile.headline}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-600">
                {profile.yearsExperience !== null && (
                  <span>{profile.yearsExperience} yrs experience</span>
                )}
                {profile.match && <Badge variant="default">{Math.round(profile.match.score)}% match</Badge>}
                {profile.mobility && <Badge variant="default">Mobility: {profile.mobility.label}</Badge>}
              </div>
            </div>
            <div className="sm:w-72">
              <MessageCandidateButton candidateUserId={profile.user.id} candidateName={profile.user.name} className="w-full" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {profile.bio && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">About</h2>
              <p className="mt-2 whitespace-pre-line text-gray-700">{profile.bio}</p>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Skills</h2>
            {profile.skills.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <Badge key={skill} variant="default">{skill}</Badge>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No skills listed yet.</p>
            )}
            {(profile.verifiedSkills?.length ?? 0) > 0 && (
              <p className="mt-2 text-sm text-emerald-700">
                Verified: {profile.verifiedSkills!.map((skill) => skill.skillName).join(", ")}
              </p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Experience</h2>
            {workHistory.length > 0 ? (
              <ul className="mt-2 space-y-3">
                {workHistory.map((item, index) => (
                  <li key={`${item.company}-${item.title}-${index}`}>
                    <p className="font-medium text-gray-900">
                      {[item.title, item.company].filter(Boolean).join(" at ") || "Role"}
                    </p>
                    {item.period && <p className="text-sm text-gray-500">{item.period}</p>}
                    {item.description && <p className="mt-1 text-sm text-gray-700">{item.description}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No work history shared yet.</p>
            )}
            {education.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-gray-700">
                {education.map((item, index) => (
                  <li key={`${item.institution}-${index}`}>
                    {[item.degree, item.institution].filter(Boolean).join(", ")}
                    {item.period ? ` (${item.period})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Location &amp; mobility</h2>
            <dl className="mt-2 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Target countries</dt>
                <dd>{profile.targetCountries.length > 0 ? profile.targetCountries.join(", ") : "Not specified"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Visa status</dt>
                <dd>{profile.visaStatus || "Not specified"}</dd>
              </div>
              {profile.targetRoles.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Target roles</dt>
                  <dd>{profile.targetRoles.join(", ")}</dd>
                </div>
              )}
            </dl>
          </section>

          {links.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Links</h2>
              <ul className="mt-2 flex flex-wrap gap-4 text-sm">
                {links.map((link) => (
                  <li key={link.label}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 hover:underline">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
