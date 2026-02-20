import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | AfriTalent",
  description: "How AfriTalent collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-emerald-600 hover:underline">← Back to Home</Link>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: February 2026</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
          <p>AfriTalent (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform at afri-talent.com.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
          <p><strong>Information you provide:</strong> Name, email address, resume content, employment history, skills, and other profile information you choose to submit.</p>
          <p className="mt-2"><strong>Automatically collected:</strong> Log data including IP address, browser type, pages visited, and session duration. We do not log raw resume or job description text in our application logs.</p>
          <p className="mt-2"><strong>AI-processed data:</strong> When you use our AI Assistant, your resume and job descriptions are processed by Claude (Anthropic) to generate match scores and tailored materials. We store structured outputs in our database — not raw text.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide and improve our job-matching and AI career services</li>
            <li>To send you account notifications and service updates</li>
            <li>To process payments via Stripe (we do not store card data)</li>
            <li>To comply with legal obligations</li>
            <li>To detect and prevent fraud or abuse</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Data Sharing</h2>
          <p>We do not sell your personal information. We share data only with:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Service providers:</strong> AWS (infrastructure), Anthropic (AI processing), Stripe (payments), SES (email)</li>
            <li><strong>Employers:</strong> Only information you explicitly submit as part of a job application</li>
            <li><strong>Legal requirements:</strong> When required by law or to protect rights</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Retention</h2>
          <p>We retain your account data for as long as your account is active. AI run history is retained for 90 days. You may request deletion of your data at any time by contacting us.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Your Rights</h2>
          <p>Depending on your location, you may have rights to: access, correct, or delete your personal data; object to or restrict processing; and data portability. Contact us at <a href="mailto:privacy@afri-talent.com" className="text-emerald-600 hover:underline">privacy@afri-talent.com</a> to exercise these rights.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookies</h2>
          <p>We use essential cookies for authentication (HttpOnly, Secure). See our <Link href="/cookies-policy" className="text-emerald-600 hover:underline">Cookies Policy</Link> for details.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Security</h2>
          <p>We implement industry-standard security measures including HTTPS, encrypted database storage, and role-based access controls. No transmission over the internet is 100% secure.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Contact Us</h2>
          <p>Questions about this Privacy Policy? Contact us at: <a href="mailto:privacy@afri-talent.com" className="text-emerald-600 hover:underline">privacy@afri-talent.com</a></p>
        </section>
      </div>
    </main>
  );
}
