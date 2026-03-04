"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { notifications as notificationsApi, messages as messagesApi } from "@/lib/api";

export function Header() {
  const { user, isLoading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!user) return;
    notificationsApi.unreadCount().then(d => setUnreadNotifs(d.count)).catch(() => {});
    messagesApi.unreadCount().then(d => setUnreadMessages(d.count)).catch(() => {});
    const interval = setInterval(() => {
      notificationsApi.unreadCount().then(d => setUnreadNotifs(d.count)).catch(() => {});
      messagesApi.unreadCount().then(d => setUnreadMessages(d.count)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const getDashboardLink = () => {
    if (!user) return "/login";
    switch (user.role) {
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

  return (
    <>
      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Logout</h3>
            <p className="text-gray-600 mb-4">Are you sure you want to logout?</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">A</span>
                </div>
                <span className="font-bold text-xl text-gray-900">AfriTalent</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              <Link href="/jobs" className="text-gray-600 hover:text-gray-900 font-medium">
                Find Jobs
              </Link>
              <Link href="/companies" className="text-gray-600 hover:text-gray-900 font-medium">
                Companies
              </Link>
              <Link href="/salaries" className="text-gray-600 hover:text-gray-900 font-medium">
                Salaries
              </Link>
              <Link href="/interviews" className="text-gray-600 hover:text-gray-900 font-medium">
                Interviews
              </Link>
              <Link href="/learning" className="text-gray-600 hover:text-gray-900 font-medium">
                Learn
              </Link>
              {user?.role === "CANDIDATE" && (
                <Link href="/candidate/ai-assistant" className="text-gray-600 hover:text-gray-900 font-medium">
                  AI Assistant
                </Link>
              )}
              {user && (
                <Link href="/messages" className="relative text-gray-600 hover:text-gray-900 font-medium">
                  Messages
                  {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-3 bg-emerald-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                    </span>
                  )}
                </Link>
              )}
              {user && (
                <Link href="/notifications" className="relative text-gray-600 hover:text-gray-900">
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

              {/* Auth Buttons */}
              {isLoading ? (
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-16 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-9 w-24 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              ) : user ? (
                <div className="flex items-center space-x-4">
                  <Link href={getDashboardLink()}>
                    <Button variant="ghost">Dashboard</Button>
                  </Link>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-600">{user.name}</span>
                    <Button variant="outline" size="sm" onClick={() => setShowLogoutConfirm(true)}>
                      Logout
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <Link href="/login">
                    <Button variant="ghost">Login</Button>
                  </Link>
                  <Link href="/register">
                    <Button>Get Started</Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                aria-label="Toggle menu"
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

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4">
              <div className="flex flex-col space-y-3">
                <Link
                  href="/jobs"
                  className="text-gray-600 hover:text-gray-900 font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Find Jobs
                </Link>
                <Link
                  href="/companies"
                  className="text-gray-600 hover:text-gray-900 font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Companies
                </Link>
                <Link
                  href="/salaries"
                  className="text-gray-600 hover:text-gray-900 font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Salaries
                </Link>
                <Link
                  href="/interviews"
                  className="text-gray-600 hover:text-gray-900 font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Interviews
                </Link>
                <Link
                  href="/learning"
                  className="text-gray-600 hover:text-gray-900 font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Learn
                </Link>
                <Link
                  href="/resources"
                  className="text-gray-600 hover:text-gray-900 font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Resources
                </Link>
                {isLoading ? (
                  <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ) : user ? (
                  <>
                    <Link
                      href={getDashboardLink()}
                      className="text-gray-600 hover:text-gray-900 font-medium py-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                    {user.role === "CANDIDATE" && (
                      <Link
                        href="/candidate/ai-assistant"
                        className="text-gray-600 hover:text-gray-900 font-medium py-2"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        AI Assistant
                      </Link>
                    )}
                    <Link
                      href="/messages"
                      className="text-gray-600 hover:text-gray-900 font-medium py-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Messages {unreadMessages > 0 && <span className="ml-1 bg-emerald-600 text-white text-xs rounded-full px-1.5">{unreadMessages}</span>}
                    </Link>
                    <Link
                      href="/notifications"
                      className="text-gray-600 hover:text-gray-900 font-medium py-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Notifications {unreadNotifs > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{unreadNotifs}</span>}
                    </Link>
                    {user.role === "CANDIDATE" && (
                      <Link
                        href="/immigration"
                        className="text-gray-600 hover:text-gray-900 font-medium py-2"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Visa Tracker
                      </Link>
                    )}
                    <Link
                      href="/billing"
                      className="text-gray-600 hover:text-gray-900 font-medium py-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Pricing
                    </Link>
                    <button
                      onClick={() => setShowLogoutConfirm(true)}
                      className="text-left text-gray-600 hover:text-gray-900 font-medium py-2"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="text-gray-600 hover:text-gray-900 font-medium py-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Login
                    </Link>
                    <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                      <Button className="w-full">Get Started</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </nav>
      </header>
    </>
  );
}
