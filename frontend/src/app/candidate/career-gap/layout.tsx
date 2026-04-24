import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Career Gap Explainer | AfriTalent",
  description: "Turn employment gaps into strengths with AI-powered reframing tailored for African job markets.",
  openGraph: {
    title: "Career Gap Explainer | AfriTalent",
    description: "Turn employment gaps into strengths with AI-powered reframing for African job markets.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
