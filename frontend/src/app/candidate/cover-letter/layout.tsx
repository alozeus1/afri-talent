import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Cover Letter Generator | AfriTalent",
  description: "Generate a personalised, tone-aware cover letter for any job in seconds.",
  openGraph: {
    title: "AI Cover Letter Generator | AfriTalent",
    description: "Generate a personalised, tone-aware cover letter for any job in seconds.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
