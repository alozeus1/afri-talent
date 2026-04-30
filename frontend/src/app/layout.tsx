import type { Metadata } from "next";
import { Inter, DM_Sans, Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { NetworkStatusBanner } from "@/components/layout/network-status-banner";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AfriTalent - Connect African Tech Talent with Global Opportunities",
  description: "Africa's premier platform connecting skilled tech professionals with innovative companies worldwide.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className={`${inter.variable} ${dmSans.variable} antialiased app-shell`}>
        <a
          href="#main-content"
          className="skip-link"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <AuthProvider>
            <div className="min-h-screen flex flex-col">
              <Header />
              <NetworkStatusBanner />
              <main id="main-content" className="flex-1">{children}</main>
              <Footer />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
