import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Salary Negotiation Guide | AfriTalent",
  description: "Get market-aware salary negotiation scripts with African currency support — NGN, KES, ZAR, GHS and more.",
  openGraph: {
    title: "Salary Negotiation Guide | AfriTalent",
    description: "AI-powered salary negotiation guidance with African currency support.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
