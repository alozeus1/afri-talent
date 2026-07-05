"use client";

// Save/unsave toggle for job detail pages. Anonymous users are routed to
// /login. Saved-state is fetched once on mount.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { savedJobs } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function SaveJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
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
        router.push("/login");
        return;
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={saved ? "secondary" : "outline"} size="sm" onClick={toggle} disabled={busy || saved === null}>
      {saved ? "★ Saved" : "☆ Save job"}
    </Button>
  );
}
