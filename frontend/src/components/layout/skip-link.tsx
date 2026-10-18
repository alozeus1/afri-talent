"use client";

import { usePublicT } from "@/lib/i18n/public-messages";

/** Keyboard "skip to content" link, translated into the active locale. */
export function SkipLink() {
  const tp = usePublicT();
  return (
    <a href="#main-content" className="skip-link">
      {tp("site.skipToContent")}
    </a>
  );
}
