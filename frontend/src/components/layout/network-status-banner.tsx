"use client";

import { RetryButton } from "@/components/ui/retry-button";
import { useNetworkProfile } from "@/lib/network-profile";

export function NetworkStatusBanner() {
  const profile = useNetworkProfile();

  if (!profile.online) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">You&apos;re offline right now.</p>
            <p className="text-amber-900">
              AfriTalent will keep what&apos;s already on screen, but new jobs and actions may pause until your connection returns.
            </p>
          </div>
          <RetryButton label="Retry connection" className="w-full sm:w-auto" />
        </div>
      </div>
    );
  }

  if (profile.isLowBandwidth) {
    return (
      <div className="border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <div className="mx-auto max-w-7xl">
          <p className="font-semibold">Lite network mode is active.</p>
          <p className="text-sky-900">
            AfriTalent is reducing background refreshes for slower or data-sensitive connections.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
