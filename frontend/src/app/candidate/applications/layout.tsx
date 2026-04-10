import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Applications | AfriTalent",
  description: "Track all your job applications and their status in one place.",
  openGraph: {
    title: "My Applications | AfriTalent",
    description: "Track all your job applications and their status in one place.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
