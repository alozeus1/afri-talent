import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Job Matches | AfriTalent",
  description: "Discover jobs matched to your skills and experience using AI-powered vector matching.",
  openGraph: {
    title: "AI Job Matches | AfriTalent",
    description: "AI-powered job matching tailored to your skills and experience.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
