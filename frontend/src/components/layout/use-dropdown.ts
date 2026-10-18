"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSupportedLocale } from "@/lib/i18n/config";

/**
 * Minimal disclosure state for header menus: closes on outside click and on
 * Escape (returning focus to the trigger). The container ref must wrap both
 * the trigger button and the panel.
 */
export function useDropdown<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<T>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      containerRef.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, close, toggle, containerRef };
}

/** True for /admin and /<locale>/admin routes, which use their own app shell. */
export function isAdminPath(pathname: string | null | undefined): boolean {
  const segments = (pathname ?? "").split("/").filter(Boolean);
  const first = segments[0];
  const rest = isSupportedLocale(first) ? segments.slice(1) : segments;
  return rest[0] === "admin";
}

/** Two-letter initials for an avatar chip. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}
