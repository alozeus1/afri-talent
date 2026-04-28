import type { Metadata } from "next";
import { Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { NetworkStatusBanner } from "@/components/layout/network-status-banner";

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
    <html lang="en">
      <body className={`${inter.variable} ${dmSans.variable} antialiased app-shell`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-emerald-600 focus:text-white focus:rounded-md focus:m-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
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
