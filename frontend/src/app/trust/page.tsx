"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { localizePath, useLocale } from "@/lib/i18n/client";

const employerBadges = [
  { label: "Domain verified employer", meaning: "The employer uses a company email that matches its website domain." },
  { label: "Business-doc verified employer", meaning: "AfriTalent has reviewed business registration evidence." },
  { label: "Manually reviewed employer", meaning: "The employer passed additional human review checks." },
  { label: "Premium trusted employer", meaning: "The employer is manually approved and on the highest trust tier." },
];

const candidateBadges = [
  { label: "Email verified", meaning: "The candidate has verified their email." },
  { label: "Phone verified", meaning: "The candidate completed phone OTP verification." },
  { label: "Identity verified", meaning: "Identity evidence has been reviewed." },
  { label: "Skills verified", meaning: "Skills or certifications were validated." },
  { label: "Employment history checked", meaning: "Employment evidence was partially verified." },
];

const safetyTips = [
  "Never pay application, processing, equipment, or training fees to get a job.",
  "Be cautious when anyone tries to move you immediately to WhatsApp, Telegram, or private email.",
  "Premium filters and trust badges are backed by real checks, not self-attestation alone.",
  "If a salary looks unrealistically high or the job description feels vague, report it for review.",
];

export default function TrustCenterPage() {
  const locale = useLocale();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 mb-3">Trust Center</p>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">How AfriTalent keeps hiring safer and more credible</h1>
        <p className="text-lg text-gray-600 max-w-3xl mb-6">
          We combine verification, risk scoring, moderation, and visible trust signals so candidates and employers can make better decisions without adding unnecessary friction.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={localizePath("/trust/report", locale)}>
            <Button>Report suspicious activity</Button>
          </Link>
          <Link href={localizePath("/jobs", locale)}>
            <Button variant="outline">Browse jobs</Button>
          </Link>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Employer verification</h2>
            <p className="text-sm text-gray-600">No employer badge is shown unless it is backed by actual checks.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {employerBadges.map((badge) => (
              <div key={badge.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="font-medium text-gray-900">{badge.label}</p>
                <p className="text-sm text-gray-600 mt-1">{badge.meaning}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Candidate authenticity</h2>
            <p className="text-sm text-gray-600">Verification stays optional at first, but trusted signals unlock premium filters and better employer confidence.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidateBadges.map((badge) => (
              <div key={badge.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="font-medium text-gray-900">{badge.label}</p>
                <p className="text-sm text-gray-600 mt-1">{badge.meaning}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">What we actively block</h2>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3 text-sm text-gray-700">
              {[
                "Duplicate employer accounts",
                "Throwaway or mismatched domains",
                "Fake salary bait",
                "Off-platform contact scams",
                "Advance-fee requests",
                "Impersonation of known employers",
                "High-volume spam applications",
                "Fake candidate profiles",
              ].map((item) => (
                <div key={item} className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                  {item}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Safety tips</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {safetyTips.map((tip) => (
                <li key={tip} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
