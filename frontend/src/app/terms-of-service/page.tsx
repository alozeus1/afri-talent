import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | AfriTalent",
  description: "Terms and conditions for using AfriTalent.",
};

export default function TermsOfServicePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-emerald-600 hover:underline">← Back to Home</Link>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: February 2026</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
          <p>By accessing or using AfriTalent (afri-talent.com), you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Use of the Platform</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>You must be at least 18 years old to use AfriTalent</li>
            <li>You are responsible for maintaining the security of your account</li>
            <li>You must not use the platform for unlawful purposes or to submit false information</li>
            <li>AI-generated content (tailored resumes, cover letters) must be reviewed for accuracy before submission to employers</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. AI Features</h2>
          <p>Our AI Assistant uses Claude (Anthropic) to help match you with jobs and generate career materials. You acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>AI outputs are suggestions only and require your review before use</li>
            <li>You are responsible for the accuracy of information you submit</li>
            <li>Daily usage limits apply to AI features</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Intellectual Property</h2>
          <p>You retain ownership of the resume content and materials you submit. AfriTalent retains rights to the platform, AI models, and aggregated anonymised data.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Subscriptions &amp; Billing</h2>
          <p>Paid features are billed through Stripe. Cancellations take effect at the end of the billing period. Refunds are evaluated on a case-by-case basis.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Limitation of Liability</h2>
          <p>AfriTalent is provided &quot;as is.&quot; We are not liable for employment outcomes, decisions made based on AI suggestions, or third-party employer actions.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Changes to Terms</h2>
          <p>We may update these terms. Continued use after changes constitutes acceptance. We will notify registered users of material changes by email.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Contact</h2>
          <p>
            Legal inquiries:{" "}
            <a href="mailto:legal@afri-talent.com" className="text-emerald-600 hover:underline">
              legal@afri-talent.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
