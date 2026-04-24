import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Interview Prep | AfriTalent",
  description: "Practice role-specific interview questions and get instant AI feedback using the STAR method.",
  openGraph: {
    title: "AI Interview Prep | AfriTalent",
    description: "Practice role-specific interview questions and get instant AI feedback.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
