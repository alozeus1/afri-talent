"use client";

import { usePathname } from "next/navigation";
import { isSupportedLocale } from "@/lib/i18n/config";

// Admin routes exist both unprefixed (/admin/*) and under a locale
// (/fr/admin/*). Links inside the console keep whichever form is active.
export function useAdminPrefix(): { prefix: string; strip: (path: string) => string } {
  const pathname = usePathname() ?? "/";
  const first = pathname.split("/").filter(Boolean)[0];
  const prefix = isSupportedLocale(first) ? `/${first}` : "";
  return {
    prefix,
    strip: (path: string) => (prefix && path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path),
  };
}

export function useAdminHref() {
  const { prefix } = useAdminPrefix();
  return (path: string) => `${prefix}${path}`;
}

export const ADMIN_SECURITY_PATH = "/admin/security";
