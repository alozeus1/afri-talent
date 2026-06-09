import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Premium Resume Templates | AfriTalent",
  description: "Browse and download ATS-optimized resume templates tailored for your industry and experience level.",
  openGraph: {
    title: "Premium Resume Templates | AfriTalent",
    description: "Download professional, ATS-ready resume templates.",
    type: "website",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
