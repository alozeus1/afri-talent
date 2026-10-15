import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service | AfriTalent",
  description: "Terms and conditions for using AfriTalent.",
};

export default function TermsOfServicePage() {
  return <LegalDocument id="terms" />;
}
