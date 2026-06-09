import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trust & Apply | AfriTalent",
  description:
    "How AfriTalent applies on your behalf, the four submission tracks we use, the proof we keep for every application, and how employers can opt out.",
};

const TRACKS = [
  {
    name: "Direct API submission",
    badge: "ATS_API",
    summary:
      "When the employer's applicant tracking system supports a partner write API (Greenhouse, Lever, Ashby, Workable), AfriTalent submits the application directly through that API.",
    proof: "ATS provider application ID returned by the vendor.",
  },
  {
    name: "Pre-filled email draft",
    badge: "EMAIL_DRAFT",
    summary:
      "When the job description points to careers@ / apply@ / jobs@ at the employer's domain, we compose an email on your behalf with your tailored cover letter and CV attached. You see the full draft, then click Send.",
    proof: "SES message ID + delivery receipt.",
  },
  {
    name: "Operator handoff (supervised)",
    badge: "OPERATOR_HANDOFF",
    summary:
      "For form-based applicant trackers (Workday, Taleo, iCIMS, hosted Greenhouse/Lever boards we don't have API access to), an Anthropic Computer Use agent fills the form step-by-step. You watch the live preview and click Submit yourself — the agent never submits unsupervised.",
    proof: "Final screenshot + DOM snapshot + redirect URL.",
  },
  {
    name: "Assisted redirect",
    badge: "ASSISTED_REDIRECT",
    summary:
      "When the apply target doesn't fit any of the above, AfriTalent opens the apply page in a new tab and asks you afterwards whether you completed it.",
    proof: "Click-out timestamp + your confirmation of completion (within 7 days).",
  },
];

export default function TrustAndApplyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-emerald-600 hover:underline">
          ← Back to Home
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">Trust & Apply</h1>
      <p className="text-base text-gray-600 mb-8">
        How AfriTalent submits applications on your behalf, the proof we keep for every one, and the limits we
        enforce so employers don&apos;t see a flood.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">What AfriTalent does (and doesn&apos;t) do</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          AfriTalent classifies each job into one of four <em>apply tracks</em> at ingest time. Every track requires
          your explicit Draft → Preview → Submit consent — we never submit anything before you&apos;ve seen the
          final version and ticked the acknowledgements. There is no &quot;set it and forget it&quot; mode.
        </p>
        <p className="text-gray-700 leading-relaxed">
          We don&apos;t spam employers, we don&apos;t fabricate qualifications in your cover letter, and we don&apos;t
          apply to jobs you haven&apos;t reviewed.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The four tracks</h2>
        <ul className="space-y-5">
          {TRACKS.map((track) => (
            <li key={track.badge} className="border border-gray-200 rounded-xl p-5 bg-white">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900">{track.name}</h3>
                <span className="text-xs font-mono text-gray-500">{track.badge}</span>
              </div>
              <p className="text-gray-700 leading-relaxed mb-3">{track.summary}</p>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">Proof we keep:</span> {track.proof}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Apply limits</h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>At most <strong>one application per role per 60 days</strong> from any one candidate.</li>
          <li>At most <strong>three distinct roles per employer per 30 days</strong> from any one candidate.</li>
          <li>Hard rate-limits on the autopilot batch flow so a single user cannot fan out to thousands of jobs.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">For employers — how to opt out</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          If you don&apos;t want AfriTalent to send candidate applications to email addresses on your domain, send
          a message from <em>any</em> address on that domain to{" "}
          <a className="text-emerald-600 hover:underline" href="mailto:optout@afri-talent.com">
            optout@afri-talent.com
          </a>
          . We&apos;ll exclude every email-route application against your domain for 12 months, starting from the
          message you sent. Candidates can still apply via the other tracks (direct API, redirect, supervised
          operator) — the opt-out only covers email.
        </p>
        <p className="text-gray-700 leading-relaxed">
          To extend or lift the opt-out, contact{" "}
          <a className="text-emerald-600 hover:underline" href="mailto:support@afri-talent.com">
            support@afri-talent.com
          </a>
          .
        </p>
      </section>

      <section className="text-sm text-gray-500 border-t pt-6">
        Last updated: May 2026. See also our{" "}
        <Link href="/privacy-policy" className="text-emerald-600 hover:underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/terms-of-service" className="text-emerald-600 hover:underline">
          Terms of Service
        </Link>
        .
      </section>
    </main>
  );
}
