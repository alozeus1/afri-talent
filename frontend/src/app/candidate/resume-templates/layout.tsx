import type { Metadata } from "next";
import { FREE_MODE } from "@/lib/free-mode";

const TITLE = FREE_MODE ? "Resume Templates | AfriTalent" : "Premium Resume Templates | AfriTalent";

export const metadata: Metadata = {
  title: TITLE,
  description: "Browse and download ATS-optimized resume templates tailored for your industry and experience level.",
  openGraph: {
    title: TITLE,
    description: "Download professional, ATS-ready resume templates.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
