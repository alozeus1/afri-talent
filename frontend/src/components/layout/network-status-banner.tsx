"use client";

import { RetryButton } from "@/components/ui/retry-button";
import { useNetworkProfile } from "@/lib/network-profile";
import { usePublicT } from "@/lib/i18n/public-messages";

export function NetworkStatusBanner() {
  const profile = useNetworkProfile();
  const tp = usePublicT();

  if (!profile.online) {
    return (
      <div role="status" className="border-b border-warning-line bg-warning-soft px-4 py-3 text-sm text-fg">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-warning">{tp("site.network.offlineTitle")}</p>
            <p className="text-fg-secondary">{tp("site.network.offlineBody")}</p>
          </div>
          <RetryButton label={tp("site.network.retry")} className="w-full sm:w-auto" />
        </div>
      </div>
    );
  }

  if (profile.isLowBandwidth) {
    return (
      <div role="status" className="border-b border-info-line bg-info-soft px-4 py-3 text-sm text-fg">
        <div className="mx-auto max-w-7xl">
          <p className="font-semibold text-info">{tp("site.network.liteTitle")}</p>
          <p className="text-fg-secondary">{tp("site.network.liteBody")}</p>
        </div>
      </div>
    );
  }

  return null;
}
