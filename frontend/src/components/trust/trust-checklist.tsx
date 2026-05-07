"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrustChecklistItem } from "@/lib/api";
import { getLocaleFromPath } from "@/lib/i18n/client";

// Maps backend checklist keys → destination paths (without locale prefix)
const CHECKLIST_ROUTES: Record<string, string> = {
  email_verified: "/candidate/trust",
  phone_verified: "/candidate/trust",
  identity_verified: "/candidate/trust",
  profile_complete: "/candidate/profile",
  linkedin_added: "/candidate/profile",
  github_added: "/candidate/profile",
  portfolio_added: "/candidate/profile",
  skill_verified: "/candidate/trust",
  evidence_uploaded: "/candidate/trust",
  employer_profile_complete: "/candidate/profile",
};

const CHECKLIST_SUBTITLE: Record<string, string> = {
  email_verified: "Verify via the link sent to your inbox",
  phone_verified: "Get a 6-digit code sent to your phone",
  identity_verified: "Upload a government-issued ID or credential document",
  profile_complete: "Add headline, bio, skills, and target roles",
  linkedin_added: "Paste your LinkedIn URL in Edit Profile",
  github_added: "Paste your GitHub URL in Edit Profile",
  portfolio_added: "Add a portfolio or personal website link",
  skill_verified: "Submit evidence for at least one professional skill",
  evidence_uploaded: "Upload a certificate, credential, or work sample",
  employer_profile_complete: "Complete all fields so employers can evaluate you",
};

interface TrustChecklistProps {
  items: TrustChecklistItem[];
  emptyMessage?: string;
}

export function TrustChecklist({
  items,
  emptyMessage = "No verification checks have been completed yet.",
}: TrustChecklistProps) {
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const rawPath = CHECKLIST_ROUTES[item.key] ?? "/candidate/trust";
        const href = `/${locale}${rawPath}`;
        const subtitle =
          CHECKLIST_SUBTITLE[item.key] ??
          (item.done ? "Completed" : "Tap to complete this step");

        return (
          <Link
            key={item.key}
            href={href}
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
              item.done
                ? "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50"
                : "border-amber-200 bg-white hover:bg-amber-50/40"
            }`}
            aria-label={`${item.label}${item.done ? " — completed" : " — action required"}`}
          >
            <span
              className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                item.done
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-800"
              }`}
              aria-hidden="true"
            >
              {item.done ? "✓" : "!"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">{item.label}</p>
              <p className="text-sm text-gray-500">{subtitle}</p>
            </div>
            {!item.done && (
              <span className="self-center text-amber-600 text-xs font-semibold flex-shrink-0" aria-hidden="true">
                →
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
