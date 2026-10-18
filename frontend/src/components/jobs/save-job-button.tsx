"use client";

// Save/unsave toggle for job detail pages. Anonymous users are routed to
// /login. Saved-state is fetched once on mount.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { savedJobs } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

export function SaveJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const tp = usePublicT();
  const locale = useLocale();
  const [saved, setSaved] = useState<boolean | null>(null); // null = unknown/anonymous
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    savedJobs
      .ids()
      .then((data) => setSaved(data.jobIds.includes(jobId)))
      .catch(() => setSaved(false)); // anonymous → treat as unsaved; login on click
  }, [jobId]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (saved) {
        await savedJobs.unsave(jobId);
        setSaved(false);
      } else {
        await savedJobs.save(jobId);
        setSaved(true);
      }
    } catch (err) {
      if ((err as { status?: number })?.status === 401) {
        router.push(localizePath("/login", locale));
        return;
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={saved ? "secondary" : "outline"} size="sm" onClick={toggle} disabled={busy || saved === null} aria-pressed={Boolean(saved)}>
      <span aria-hidden="true">{saved ? "★" : "☆"}</span> {saved ? tp("discover.card.saved") : tp("discover.card.save")}
    </Button>
  );
}
