"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { notifications as notificationsApi, messages as messagesApi } from "@/lib/api";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { useNetworkProfile } from "@/lib/network-profile";

export function Header() {
  const locale = useLocale();
  const t = useT();
  const { user, isLoading, logout } = useAuth();
  const { online, isLowBandwidth } = useNetworkProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

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

  return (
    <>
      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm mx-4 shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Confirm Logout</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">Are you sure you want to logout?</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={handleLogout}>
                {t("nav.logout")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
        <nav className="page-frame">
          <div className="flex min-h-[72px] justify-between">
            <div className="flex items-center">
              <Link href={href("/")} prefetch={false} className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500 bg-emerald-600 shadow-sm">
                  <span className="font-display text-lg font-bold text-white">A</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-display text-xl font-bold text-zinc-900 dark:text-white">AfriTalent</span>
                  <span className="text-[11px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Trust-first hiring</span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              <Link href={href("/jobs")} prefetch={false} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                {t("nav.findJobs")}
              </Link>
              <Link href={href("/companies")} prefetch={false} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                {t("nav.companies")}
              </Link>
              <Link href={href("/salaries")} prefetch={false} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                {t("nav.salaries")}
              </Link>
              <Link href={href("/interviews")} prefetch={false} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                {t("nav.interviews")}
              </Link>
              <Link href={href("/learning")} prefetch={false} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                {t("nav.learn")}
              </Link>
              <Link href={href("/pricing")} prefetch={false} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                {t("nav.pricing")}
              </Link>
              <Link href={href("/trust")} prefetch={false} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                Trust
              </Link>
              {user?.role === "CANDIDATE" && (
                <Link href={href("/candidate/ai-assistant")} prefetch={false} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                  AI Assistant
                </Link>
              )}
              {user && (
                <Link href={href("/messages")} prefetch={false} className="relative text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium">
                  {t("nav.messages")}
                  {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-3 bg-emerald-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                    </span>
                  )}
                </Link>
              )}
              {user && (
                <Link href={href("/notifications")} prefetch={false} className="relative text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadNotifs > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {unreadNotifs > 9 ? "9+" : unreadNotifs}
                    </span>
                  )}
                </Link>
              )}
              <LanguageSwitcher />
              <ThemeToggle />

              {/* Auth Buttons */}
              {isLoading ? (
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
                  <div className="h-9 w-24 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
                </div>
              ) : user ? (
                <div className="flex items-center space-x-4">
                  <Link href={href(getDashboardLink())} prefetch={false}>
                <Button variant="ghost">{t("nav.dashboard")}</Button>
              </Link>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{user.name}</span>
                    <Button variant="outline" size="sm" onClick={() => setShowLogoutConfirm(true)}>
                      {t("nav.logout")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <Link href={href("/login")} prefetch={false}>
                    <Button variant="ghost">{t("nav.login")}</Button>
                  </Link>
                  <Link href={href("/register")} prefetch={false}>
                    <Button>{t("nav.getStarted")}</Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-2.5 text-zinc-600 shadow-sm hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors"
                aria-label="Toggle menu"
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
        <div className="md:hidden fixed inset-0 z-[70]" aria-modal="true" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu backdrop"
          />
          <div
            id="mobile-menu-panel"
            className="absolute right-0 top-0 h-full w-[85%] max-w-sm overflow-y-auto border-l border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between mb-6">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Menu</p>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close menu"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col">
              {[
                { href: "/jobs", label: t("nav.findJobs") },
                { href: "/companies", label: t("nav.companies") },
                { href: "/salaries", label: t("nav.salaries") },
                { href: "/interviews", label: t("nav.interviews") },
                { href: "/learning", label: t("nav.learn") },
                { href: "/pricing", label: t("nav.pricing") },
                { href: "/trust", label: "Trust" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={href(item.href)}
                  prefetch={false}
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-h-11 flex items-center py-2 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  {item.label}
                </Link>
              ))}

              <div className="h-px bg-gray-200 dark:bg-gray-800 my-3" />

              {isLoading ? (
                <div className="h-11 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
              ) : user ? (
                <>
                  <Link href={href(getDashboardLink())} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-gray-700 dark:text-gray-200">
                    {t("nav.dashboard")}
                  </Link>
                  {user.role === "CANDIDATE" && (
                    <Link href={href("/candidate/ai-assistant")} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-gray-700 dark:text-gray-200">
                      AI Assistant
                    </Link>
                  )}
                  <Link href={href("/messages")} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-gray-700 dark:text-gray-200">
                    {t("nav.messages")}
                    {unreadMessages > 0 && (
                      <span className="ml-2 bg-emerald-600 text-white text-xs rounded-full px-1.5">
                        {unreadMessages > 9 ? "9+" : unreadMessages}
                      </span>
                    )}
                  </Link>
                  <Link href={href("/notifications")} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-gray-700 dark:text-gray-200">
                    {t("nav.notifications")}
                    {unreadNotifs > 0 && (
                      <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5">
                        {unreadNotifs > 9 ? "9+" : unreadNotifs}
                      </span>
                    )}
                  </Link>
                  {user.role === "CANDIDATE" && (
                    <Link href={href("/immigration")} prefetch={false} onClick={() => setMobileMenuOpen(false)} className="min-h-11 flex items-center py-2 text-gray-700 dark:text-gray-200">
                      Visa Tracker
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
