"use client";

import { pricingEvents } from "@/lib/analytics";

interface RegionSelectorProps {
  currentRegion: string;
  onChange: (region: string) => void;
}

const REGIONS = [
  { key: "AFRICA", label: "Africa", emoji: "\uD83C\uDF0D", description: "Discounted pricing" },
  { key: "EUROPE", label: "Europe", emoji: "\uD83C\uDF0D", description: "EUR / GBP pricing" },
  { key: "ROW", label: "Rest of World", emoji: "\uD83C\uDF0E", description: "Standard pricing" },
];

export function RegionSelector({ currentRegion, onChange }: RegionSelectorProps) {
  return (
    <div className="flex flex-col items-center gap-3" data-testid="region-selector">
      <p className="text-sm text-gray-500">
        Pricing shown for{" "}
        <span className="font-medium text-gray-700">
          {REGIONS.find((r) => r.key === currentRegion)?.label ?? "Rest of World"}
        </span>
      </p>
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
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
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
            aria-pressed={currentRegion === r.key}
            data-testid={`region-${r.key}`}
          >
            <span className="mr-1">{r.emoji}</span>
            <span className="hidden sm:inline">{r.label}</span>
            <span className="sm:hidden">{r.label.slice(0, 3)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
