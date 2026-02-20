import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Accessibility Statement | AfriTalent",
  description: "AfriTalent's commitment to digital accessibility for all users.",
};

export default function AccessibilityPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-emerald-600 hover:underline">← Back to Home</Link>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Accessibility Statement</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: February 2026</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Our Commitment</h2>
          <p>AfriTalent is committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone and apply relevant accessibility standards.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Conformance Status</h2>
          <p>We aim to conform to the <strong>Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</strong>. These guidelines explain how to make web content more accessible to people with disabilities.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Technical Specifications</h2>
          <p>AfriTalent relies on the following technologies for conformance:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>HTML5</li>
            <li>CSS (Tailwind CSS)</li>
            <li>JavaScript / React</li>
            <li>ARIA (Accessible Rich Internet Applications)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Known Limitations</h2>
          <p>We are actively working to address the following known accessibility limitations:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Some AI-generated content may not have complete alternative text</li>
            <li>Complex data tables in AI match results are being improved for screen reader support</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Feedback &amp; Contact</h2>
          <p>We welcome your feedback on the accessibility of AfriTalent. If you experience accessibility barriers, please contact us:</p>
          <ul className="list-none space-y-1 mt-2">
            <li>
              📧{" "}
              <a href="mailto:accessibility@afri-talent.com" className="text-emerald-600 hover:underline">
                accessibility@afri-talent.com
              </a>
            </li>
          </ul>
          <p className="mt-3">We aim to respond to accessibility feedback within 2 business days.</p>
        </section>
      </div>
    </main>
  );
}
