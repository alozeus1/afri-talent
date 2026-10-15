import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Accessibility Statement | AfriTalent",
  description: "AfriTalent's commitment to digital accessibility for all users.",
};

export default function AccessibilityPage() {
  return <LegalDocument id="accessibility" />;
}
