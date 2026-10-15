import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy | AfriTalent",
  description: "How AfriTalent collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return <LegalDocument id="privacy" />;
}
