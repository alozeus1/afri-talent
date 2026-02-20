import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookies Policy | AfriTalent",
  description: "Information about how AfriTalent uses cookies.",
};

export default function CookiesPolicyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-emerald-600 hover:underline">← Back to Home</Link>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Cookies Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: February 2026</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">What Are Cookies</h2>
          <p>Cookies are small text files stored on your device when you visit a website. We use cookies to keep you logged in and improve your experience.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Cookies We Use</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Cookie</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Type</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Purpose</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-3 py-2 font-mono">auth_token</td>
                  <td className="border border-gray-200 px-3 py-2">Essential</td>
                  <td className="border border-gray-200 px-3 py-2">Authentication (HttpOnly, Secure)</td>
                  <td className="border border-gray-200 px-3 py-2">7 days</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Essential Cookies Only</h2>
          <p>We only use essential cookies required for the platform to function (authentication). We do not use advertising, analytics, or tracking cookies.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Managing Cookies</h2>
          <p>You can control cookies through your browser settings. Disabling the authentication cookie will prevent you from staying logged in. See your browser&apos;s help documentation for cookie management instructions.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
          <p>
            Questions?{" "}
            <a href="mailto:privacy@afri-talent.com" className="text-emerald-600 hover:underline">
              privacy@afri-talent.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
