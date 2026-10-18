"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdminPath } from "@/components/layout/use-dropdown";
import { FREE_MODE } from "@/lib/free-mode";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

// Brand names are not translated.
const BRAND_NAME = "AfriTalent";
const STUDIO_NAME = "Maralito Labs Studio";

const socialLinks = [
  {
    name: "Instagram",
    url: "https://instagram.com/afritalent",
    icon: <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />,
  },
  {
    name: "Facebook",
    url: "https://facebook.com/afritalent",
    icon: <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />,
  },
  {
    name: "X (Twitter)",
    url: "https://twitter.com/afritalent",
    icon: <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />,
  },
  {
    name: "LinkedIn",
    url: "https://linkedin.com/company/afritalent",
    icon: <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />,
  },
];

/** Marketing footer. The admin console is a dedicated app shell and omits it. */
export function Footer() {
  const pathname = usePathname();
  if (isAdminPath(pathname)) return null;
  return <SiteFooter />;
}

function SiteFooter() {
  const t = useT();
  const tp = usePublicT();
  const locale = useLocale();
  const href = (path: string) => localizePath(path, locale);
  return (
    <footer className="section-shell mt-12 border-t border-line bg-surface text-fg-secondary">
      <div className="page-frame py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href={href("/")} prefetch={false} className="mb-5 flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500 bg-emerald-600 shadow-sm">
                <span className="font-display text-lg font-bold text-white">A</span>
              </div>
              <div className="flex flex-col">
                <span className="font-display text-xl font-bold text-fg">{BRAND_NAME}</span>
                <span className="text-[11px] uppercase tracking-widest text-fg-secondary">{tp("site.footer.brandTagline")}</span>
              </div>
            </Link>
            <p className="max-w-lg text-sm leading-7 text-fg-secondary">
              {tp("site.footer.about")}
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-4">{tp("site.footer.forCandidates")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href={href("/jobs")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.browseJobs")}
                </Link>
              </li>
              <li>
                <Link href={href("/companies")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.companyReviews")}
                </Link>
              </li>
              <li>
                <Link href={href("/salaries")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.salaryComparison")}
                </Link>
              </li>
              <li>
                <Link href={href("/interviews")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.interviewPrep")}
                </Link>
              </li>
              <li>
                <Link href={href("/immigration")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.visaTracker")}
                </Link>
              </li>
              <li>
                <Link href={href("/learning")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.learningHub")}
                </Link>
              </li>
              <li>
                <Link href={href("/resources")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.careerResources")}
                </Link>
              </li>
              <li>
                <Link href={href("/pricing")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {FREE_MODE ? t("nav.freeForEveryone") : t("nav.pricing")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-4">{tp("site.footer.forEmployers")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href={href("/register?role=employer")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.postJob")}
                </Link>
              </li>
              <li>
                <Link href={href("/employer/talent")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.browseTalent")}
                </Link>
              </li>
              <li>
                <Link href={href("/hiring-resources")} prefetch={false} className="text-fg-secondary hover:text-fg transition-colors">
                  {tp("site.footer.hiringResources")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-6 border-t border-line pt-8 md:flex-row">
          <nav aria-label={tp("site.footer.socialLinks")} className="flex items-center gap-3">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.name}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-sunken text-fg-secondary shadow-sm transition-colors hover:bg-surface-muted hover:text-fg"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  {link.icon}
                </svg>
              </a>
            ))}
          </nav>

          {/* Legal nav */}
          <nav aria-label={tp("site.footer.legal")} className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-fg-secondary">
            <Link href={href("/contact")} prefetch={false} className="hover:text-fg dark:hover:text-white transition-colors">{tp("site.footer.contact")}</Link>
            <Link href={href("/privacy-policy")} prefetch={false} className="hover:text-fg dark:hover:text-white transition-colors">{tp("site.footer.privacy")}</Link>
            <Link href={href("/terms-of-service")} prefetch={false} className="hover:text-fg dark:hover:text-white transition-colors">{tp("site.footer.terms")}</Link>
            <Link href={href("/cookies-policy")} prefetch={false} className="hover:text-fg dark:hover:text-white transition-colors">{tp("site.footer.cookies")}</Link>
            <Link href={href("/accessibility")} prefetch={false} className="hover:text-fg dark:hover:text-white transition-colors">{tp("site.footer.accessibility")}</Link>
          </nav>

          <p className="whitespace-nowrap text-sm text-fg-secondary">
            {tp("site.footer.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>

        <div className="mt-6 border-t border-line pt-4 text-center">
          <p className="text-xs text-fg-secondary">
            {tp("site.footer.poweredBy")} <span className="font-semibold text-fg-secondary">{STUDIO_NAME}</span>
            <sup className="text-fg-secondary ms-0.5">{"TM"}</sup>
          </p>
        </div>
      </div>
    </footer>
  );
}
