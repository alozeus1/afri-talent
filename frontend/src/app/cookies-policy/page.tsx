import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Cookies Policy | AfriTalent",
  description: "Information about how AfriTalent uses cookies.",
};

export default function CookiesPolicyPage() {
  return <LegalDocument id="cookies" />;
}
