"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isSupportedLocale } from "@/lib/i18n/config";
import { AdminMessageKey, useAdminT } from "@/lib/i18n/admin-messages";
import { muted, strong } from "./console-ui";
import "./admin-console.css";

// Brand name, intentionally not translated.
const BRAND = "AfriTalent";

type NavItem = { href: string; key: AdminMessageKey; icon: string };

const MANAGE: NavItem[] = [
  { href: "/admin", key: "nav.overview", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/admin/users", key: "nav.users", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0" },
  { href: "/admin/companies", key: "nav.companies", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" },
  { href: "/admin/jobs", key: "nav.jobs", icon: "M4 7h16v12H4zM9 7V5h6v2" },
  { href: "/admin/messages", key: "nav.messages", icon: "M4 5h16v11H7l-3 3z" },
  { href: "/admin/trust", key: "nav.trust", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" },
  { href: "/admin/support", key: "nav.support", icon: "M4 5h16v11H9l-5 4zM9 9h6M9 12h4" },
  { href: "/admin/reviews", key: "nav.reviews", icon: "M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.5-.8z" },
  { href: "/admin/audit-logs", key: "nav.auditLogs", icon: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" },
];

const PLATFORM: NavItem[] = [
  { href: "/admin/ops", key: "nav.operations", icon: "M4 19V9m6 10V5m6 14v-7m4 7H2" },
  { href: "/admin/billing", key: "nav.billing", icon: "M3 7h18v10H3zM3 11h18" },
  { href: "/admin/bulk", key: "nav.bulk", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/admin/integrations", key: "nav.integrations", icon: "M8 12h8M12 8v8M5 5h14v14H5z" },
  { href: "/admin/partners", key: "nav.partners", icon: "M7 12l3 3 7-7M3 12a9 9 0 1018 0 9 9 0 00-18 0" },
  { href: "/admin/blog", key: "nav.blog", icon: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
  { href: "/admin/learning-feedback", key: "nav.learningFeedback", icon: "M4 6l8-3 8 3-8 3zM6 9v5c0 2 3 4 6 4s6-2 6-4V9" },
];

function useAdminPrefix(): { prefix: string; strip: (path: string) => string } {
  const pathname = usePathname() ?? "/";
  const first = pathname.split("/").filter(Boolean)[0];
  const prefix = isSupportedLocale(first) ? `/${first}` : "";
  return {
    prefix,
    strip: (path: string) => (prefix && path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path),
  };
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useAdminT();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { user, isLoading } = useAuth();
  const { prefix, strip } = useAdminPrefix();
  const current = strip(pathname);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push(`${prefix}/login`);
    }
  }, [user, isLoading, router, prefix]);

  if (isLoading || !user || user.role !== "ADMIN") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
        <p className={`text-sm ${muted}`}>{isLoading ? t("common.loading") : t("common.signInRequired")}</p>
      </div>
    );
  }

  const isActive = (href: string) => (href === "/admin" ? current === "/admin" : current.startsWith(href));

  const renderLink = (item: NavItem, compact = false) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={`${prefix}${item.href}`}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${compact ? "whitespace-nowrap" : ""} ${
          active
            ? "bg-primary text-primary-fg shadow-xs"
            : "text-fg-secondary hover:bg-surface-muted hover:text-fg"
        }`}
      >
        <NavIcon d={item.icon} />
        {t(item.key)}
      </Link>
    );
  };

  return (
    <div className="admin-console mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6 lg:py-8">
      <aside className="lg:w-60 lg:shrink-0">
        <div className="lg:sticky lg:top-24">
          <div className="mb-4 hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-text">{BRAND}</p>
            <p className={`mt-1 text-lg font-semibold ${strong}`}>{t("shell.title")}</p>
            <p className={`text-xs ${muted}`}>{t("shell.subtitle")}</p>
          </div>
          {/* Mobile: horizontal scroller */}
          <nav aria-label={t("shell.menu")} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {[...MANAGE, ...PLATFORM].map((item) => renderLink(item, true))}
          </nav>
          {/* Desktop: grouped sidebar */}
          <nav aria-label={t("shell.menu")} className="hidden space-y-6 lg:block">
            <div>
              <p className={`mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider ${muted}`}>{t("nav.sectionManage")}</p>
              <div className="space-y-0.5">{MANAGE.map((item) => renderLink(item))}</div>
            </div>
            <div>
              <p className={`mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider ${muted}`}>{t("nav.sectionPlatform")}</p>
              <div className="space-y-0.5">{PLATFORM.map((item) => renderLink(item))}</div>
            </div>
            <Link href={prefix || "/"} className={`block rounded-sm px-3 text-xs underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${muted}`}>
              <span aria-hidden className="inline-block rtl:rotate-180">←</span> {t("shell.backToSite")}
            </Link>
          </nav>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function useAdminHref() {
  const { prefix } = useAdminPrefix();
  return (path: string) => `${prefix}${path}`;
}
