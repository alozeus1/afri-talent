import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Career Advisor | AfriTalent",
  description: "Get personalised career advice and skills gap analysis powered by Claude AI.",
  openGraph: {
    title: "AI Career Advisor | AfriTalent",
    description: "Personalised career advice and gap analysis powered by Claude AI.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
