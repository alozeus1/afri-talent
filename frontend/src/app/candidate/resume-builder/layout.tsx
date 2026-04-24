import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Resume Builder | AfriTalent",
  description: "Generate an ATS-optimised resume tailored to your target role in seconds using Claude AI.",
  openGraph: {
    title: "AI Resume Builder | AfriTalent",
    description: "Build a professional, ATS-ready resume with AI assistance.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
