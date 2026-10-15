import type { Metadata } from "next";
import { TrustAndApplyContent } from "./trust-and-apply-content";

export const metadata: Metadata = {
  title: "Trust & Apply | AfriTalent",
  description:
    "How AfriTalent applies on your behalf, the four submission tracks we use, the proof we keep for every application, and how employers can opt out.",
};

export default function TrustAndApplyPage() {
  return <TrustAndApplyContent />;
}
