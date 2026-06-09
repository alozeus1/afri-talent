import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, isSupportedLocale, normalizeLocale } from "@/lib/i18n/config";

const LOCALE_COOKIE = "afritalent-locale";

// Wave 6 §7.2 — legacy/SEO onboarding entry points collapse to /register so
// the funnel is unambiguous and external/inbound links keep working. Strict
// 301 (not next.config redirects() — those return 308) so search engines and
// older clients treat the move as permanent in the canonical sense.
const REGISTER_ALIASES = new Set(["/signup", "/sign-up", "/join", "/get-started"]);

function shouldLocalize(pathname: string): boolean {
  if (pathname === "/") return true;
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/candidate") ||
    pathname.startsWith("/jobs")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (REGISTER_ALIASES.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/register";
    return NextResponse.redirect(url, 301);
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (isSupportedLocale(firstSegment)) {
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, firstSegment, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return response;
  }

  if (!shouldLocalize(pathname)) {
    return NextResponse.next();
  }

  const cookieLocale = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : normalizeLocale(req.headers.get("accept-language")) || DEFAULT_LOCALE;

  const url = req.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
