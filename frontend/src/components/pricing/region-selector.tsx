"use client";

import { pricingEvents } from "@/lib/analytics";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";

interface RegionSelectorProps {
  currentRegion: string;
  onChange: (region: string) => void;
}

const REGIONS: Array<{ key: string; label: PublicMessageKey; short: PublicMessageKey; emoji: string }> = [
  { key: "AFRICA", label: "discover.region.africa", short: "discover.region.africaShort", emoji: "\uD83C\uDF0D" },
  { key: "EUROPE", label: "discover.region.europe", short: "discover.region.europeShort", emoji: "\uD83C\uDF0D" },
  { key: "ROW", label: "discover.region.row", short: "discover.region.rowShort", emoji: "\uD83C\uDF0E" },
];

export function RegionSelector({ currentRegion, onChange }: RegionSelectorProps) {
  const tp = usePublicT();
  const current = REGIONS.find((r) => r.key === currentRegion) ?? REGIONS[2];
  return (
    <div className="flex flex-col items-center gap-3" data-testid="region-selector">
      <p className="text-sm text-fg-muted">
        {tp("discover.region.shownFor")}{" "}
        <span className="font-medium text-fg-secondary">{tp(current.label)}</span>
      </p>
      <div className="inline-flex rounded-lg border border-line bg-surface p-1 shadow-sm">
        {REGIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => {
              if (r.key !== currentRegion) {
                pricingEvents.regionChange(currentRegion, r.key);
                onChange(r.key);
              }
            }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition whitespace-nowrap ${
              currentRegion === r.key
                ? "bg-primary text-primary-fg shadow-sm"
                : "text-fg-secondary hover:text-fg hover:bg-surface-sunken"
            }`}
            aria-pressed={currentRegion === r.key}
            data-testid={`region-${r.key}`}
          >
            <span className="me-1" aria-hidden="true">{r.emoji}</span>
            <span className="hidden sm:inline">{tp(r.label)}</span>
            <span className="sm:hidden">{tp(r.short)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
