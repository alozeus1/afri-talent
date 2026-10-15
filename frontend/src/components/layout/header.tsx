"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { notifications as notificationsApi, messages as messagesApi } from "@/lib/api";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";
import { FREE_MODE } from "@/lib/free-mode";
import { useNetworkProfile } from "@/lib/network-profile";
import { usePathname } from "next/navigation";
import { initialsOf, isAdminPath, useDropdown } from "@/components/layout/use-dropdown";

// The Blog link only appears once at least one weekly digest is published, so
// an empty archive is never linked from the nav. Cached at module level — one
// request per full page load, shared across header remounts.
const BLOG_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
let blogAvailabilityPromise: Promise<boolean> | null = null;

function checkBlogAvailable(): Promise<boolean> {
  if (!blogAvailabilityPromise) {
    blogAvailabilityPromise = fetch(
      `${BLOG_API_URL}/api/resources?category=${encodeURIComponent("Weekly Hiring Trends")}&limit=1`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data?.pagination?.total ?? 0) > 0)
      .catch(() => false);
  }
  return blogAvailabilityPromise;
}

const navLinkClass =
  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const iconButtonClass =
  "relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-surface-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const menuPanelClass =
  "absolute top-full z-[60] mt-2 rounded-xl border border-line bg-surface p-1.5 shadow-xl ring-1 ring-black/5";
const menuItemClass =
  "flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-muted hover:text-fg focus:outline-none focus-visible:bg-surface-muted focus-visible:text-fg";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/** Public site header. The admin console renders its own app shell instead. */
export function Header() {
  const pathname = usePathname();
  if (isAdminPath(pathname)) return null;
  return <SiteHeader />;
}

function SiteHeader() {
  const locale = useLocale();
  const t = useT();
  const tp = usePublicT();
  const { user, isLoading, logout } = useAuth();
  const { online, isLowBandwidth } = useNetworkProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showBlogLink, setShowBlogLink] = useState(false);
  const { open: moreOpen, toggle: toggleMore, close: closeMore, containerRef: moreRef } = useDropdown();
  const { open: accountOpen, toggle: toggleAccount, close: closeAccount, containerRef: accountRef } = useDropdown();

  useEffect(() => {
    let cancelled = false;
    void checkBlogAvailable().then((available) => {
      if (!cancelled) setShowBlogLink(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user || !online) return;

    let cancelled = false;
    const intervalMs = isLowBandwidth ? 120000 : 30000;

    const refreshCounts = async () => {
      if (cancelled || document.visibilityState === "hidden") {
        return;
      }

      const [notificationsResult, messagesResult] = await Promise.allSettled([
        notificationsApi.unreadCount(),
        messagesApi.unreadCount(),
      ]);

      if (cancelled) {
        return;
      }

      if (notificationsResult.status === "fulfilled") {
        setUnreadNotifs(notificationsResult.value.count);
      }

      if (messagesResult.status === "fulfilled") {
        setUnreadMessages(messagesResult.value.count);
      }
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const idleHandle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(() => {
          void refreshCounts();
        }, { timeout: 1000 })
      : window.setTimeout(() => {
          void refreshCounts();
        }, 150);

    const interval = window.setInterval(() => {
      void refreshCounts();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshCounts();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(interval);
      if (idleWindow.cancelIdleCallback && typeof idleHandle === "number") {
        idleWindow.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle as number);
      }
    };
  }, [isLowBandwidth, online, user]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const getDashboardLink = () => {
    if (!user) return "/login";
    switch (user.role?.toUpperCase()) {
      case "ADMIN":
        return "/admin";
      case "EMPLOYER":
        return "/employer";
      case "CANDIDATE":
        return "/candidate";
      default:
        return "/";
    }
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setMobileMenuOpen(false);
    await logout();
  };

  const href = (path: string) => localizePath(path, locale);

  const PRIMARY_LINKS = [
    { href: "/jobs", label: t("nav.findJobs") },
    { href: "/companies", label: t("nav.companies") },
  ];
  const SECONDARY_LINKS = [
    { href: "/salaries", label: t("nav.salaries") },
    { href: "/interviews", label: t("nav.interviews") },
    { href: "/learning", label: t("nav.learn") },
    ...(showBlogLink ? [{ href: "/blog", label: t("nav.blog") }] : []),
    { href: "/pricing", label: FREE_MODE ? t("nav.freeForEveryone") : t("nav.pricing") },
    { href: "/trust", label: t("nav.trust") },
  ];
  const accountLinks = [
    { href: getDashboardLink(), label: t("nav.dashboard") },
    ...(user?.role === "CANDIDATE"
      ? [
          { href: "/candidate/ai-assistant", label: tp("site.header.aiAssistant") },
          { href: "/immigration", label: tp("site.header.visaTracker") },
        ]
      : []),
  ];

  return (
    <>
      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-xl p-6 max-w-sm mx-4 shadow-xl border border-line">
            <h3 className="text-lg font-semibold text-fg mb-2">{tp("site.header.confirmLogoutTitle")}</h3>
            <p className="text-fg-secondary mb-4">{tp("site.header.confirmLogoutBody")}</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowLogoutConfirm(false)}>
                {tp("site.common.cancel")}
              </Button>
              <Button variant="danger" className="flex-1" onClick={handleLogout}>
                {t("nav.logout")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 border-b border-line bg-surface/80 backdrop-blur-md supports-[backdrop-filter]:bg-surface/70">
        <nav className="page-frame">
          <div className="flex min-h-[72px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center">
              <Link href={href("/")} prefetch={false} className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500 bg-emerald-600 shadow-sm">
                  <span className="font-display text-lg font-bold text-white">A</span>
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="font-display text-xl font-bold text-fg whitespace-nowrap">{"AfriTalent"}</span>
                  <span className="hidden truncate whitespace-nowrap text-[11px] uppercase tracking-widest text-fg-muted sm:block">{tp("site.brand.tagline")}</span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation (xl and up; the drawer covers narrower widths) */}
            <div className="hidden xl:flex items-center gap-1">
              {PRIMARY_LINKS.map((item) => (
                <Link key={item.href} href={href(item.href)} prefetch={false} className={navLinkClass}>
                  {item.label}
                </Link>
              ))}
              <div ref={moreRef} className="relative">
                <button
                  type="button"
                  onClick={toggleMore}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-controls="header-more-menu"
                  aria-label={tp("site.header.moreMenu")}
                  className={`${navLinkClass} inline-flex items-center gap-1`}
                >
                  {t("nav.more")}
                  <Chevron open={moreOpen} />
                </button>
                {moreOpen && (
                  <div id="header-more-menu" role="menu" className={`${menuPanelClass} start-0 w-56`}>
                    {SECONDARY_LINKS.map((item) => (
                      <Link
                        key={item.href}
                        role="menuitem"
                        href={href(item.href)}
                        prefetch={false}
                        onClick={closeMore}
                        className={menuItemClass}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden xl:flex items-center gap-2">
              {user && (
                <Link
                  href={href("/messages")}
                  prefetch={false}
                  aria-label={t("nav.messages")}
                  title={t("nav.messages")}
                  className={iconButtonClass}
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 6l2.6-2.6A2 2 0 018 17h10a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v14z" />
                  </svg>
                  {unreadMessages > 0 && (
                    <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                    </span>
                  )}
                </Link>
              )}
              {user && (
                <Link
                  href={href("/notifications")}
                  prefetch={false}
                  aria-label={t("nav.notifications")}
                  title={t("nav.notifications")}
                  className={iconButtonClass}
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadNotifs > 0 && (
                    <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                      {unreadNotifs > 9 ? "9+" : unreadNotifs}
                    </span>
                  )}
                </Link>
              )}
              <LanguageSwitcher />
              <ThemeToggle />

              {/* Auth */}
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-9 w-16 bg-surface-muted rounded-lg animate-pulse" />
                  <div className="h-9 w-24 bg-surface-muted rounded-lg animate-pulse" />
                </div>
              ) : user ? (
                <div ref={accountRef} className="relative">
                  <button
                    type="button"
                    onClick={toggleAccount}
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                    aria-controls="header-account-menu"
                    aria-label={tp("site.header.accountMenu")}
                    className="inline-flex h-10 max-w-[13rem] items-center gap-2 rounded-full border border-line bg-surface ps-1 pe-2.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-semibold text-white">
                      {initialsOf(user.name)}
                    </span>
                    <span className="truncate whitespace-nowrap">{user.name}</span>
                    <Chevron open={accountOpen} />
                  </button>
                  {accountOpen && (
                    <div id="header-account-menu" role="menu" className={`${menuPanelClass} end-0 w-64`}>
                      <div className="border-b border-line px-3 pb-2 pt-1">
                        <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
                        {user.email && <p className="truncate text-xs text-fg-muted">{user.email}</p>}
                      </div>
                      <div className="py-1">
                        {accountLinks.map((item) => (
                          <Link
                            key={item.href}
                            role="menuitem"
                            href={href(item.href)}
                            prefetch={false}
                            onClick={closeAccount}
                            className={menuItemClass}
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                      <div className="border-t border-line pt-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeAccount();
                            setShowLogoutConfirm(true);
                          }}
                          className={`${menuItemClass} w-full text-start font-medium text-red-700 dark:text-red-300`}
                        >
                          {t("nav.logout")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href={href("/login")} prefetch={false}>
                    <Button variant="ghost" className="whitespace-nowrap">{t("nav.login")}</Button>
                  </Link>
                  <Link href={href("/register")} prefetch={false}>
                    <Button className="whitespace-nowrap">{t("nav.getStarted")}</Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="xl:hidden flex shrink-0 items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center rounded-md border border-line bg-surface p-2.5 text-fg-secondary shadow-sm hover:text-fg transition-colors"
                aria-label={mobileMenuOpen ? tp("site.header.closeMenu") : tp("site.header.openMenu")}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu-panel"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden fixed inset-0 z-[70]" aria-modal="true" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-label={tp("site.header.closeMenu")}
          />
          <div
            id="mobile-menu-panel"
            className="absolute right-0 top-0 h-full w-[85%] max-w-sm overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <p className="text-base font-semibold text-fg">{tp("site.header.menu")}</p>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-2 text-fg-secondary hover:bg-surface-muted dark:hover:bg-gray-800"
                aria-label={tp("site.header.closeMenu")}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col">
              {[...PRIMARY_LINKS, ...SECONDARY_LINKS].map((item) => (
                <Link
                  key={item.href}
                  href={href(item.href)}
                  prefetch={false}
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-h-11 flex items-center py-2 text-fg-secondary hover:text-fg"
                >
                  {item.label}
                </Link>
              ))}

              <div className="h-px bg-gray-200 dark:bg-gray-800 my-3" />

              {isLoading ? (
                <div className="h-11 bg-surface-muted rounded-lg animate-pulse" />
              ) : user ? (
                <>
                  <Link href={href(getDashboardLink())} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-fg-secondary">
                    {t("nav.dashboard")}
                  </Link>
                  {user.role === "CANDIDATE" && (
                    <Link href={href("/candidate/ai-assistant")} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-fg-secondary">
                      {tp("site.header.aiAssistant")}
                    </Link>
                  )}
                  <Link href={href("/messages")} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-fg-secondary">
                    {t("nav.messages")}
                    {unreadMessages > 0 && (
                      <span className="ml-2 bg-emerald-600 text-white text-xs rounded-full px-1.5">
                        {unreadMessages > 9 ? "9+" : unreadMessages}
                      </span>
                    )}
                  </Link>
                  <Link href={href("/notifications")} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-fg-secondary">
                    {t("nav.notifications")}
                    {unreadNotifs > 0 && (
                      <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5">
                        {unreadNotifs > 9 ? "9+" : unreadNotifs}
                      </span>
                    )}
                  </Link>
                  {user.role === "CANDIDATE" && (
                    <Link href={href("/immigration")} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-fg-secondary">
                      {tp("site.header.visaTracker")}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowLogoutConfirm(true);
                    }}
                    className="min-h-11 text-left py-2 text-red-600 dark:text-red-400 font-medium"
                  >
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <div className="space-y-3 mt-2">
                  <Link href={href("/login")} prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full min-h-11">{t("nav.login")}</Button>
                  </Link>
                  <Link href={href("/register")} prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full min-h-11">{t("nav.getStarted")}</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
