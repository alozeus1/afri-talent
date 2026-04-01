import { TrustChecklistItem } from "@/lib/api";

interface TrustChecklistProps {
  items: TrustChecklistItem[];
  emptyMessage?: string;
}

export function TrustChecklist({
  items,
  emptyMessage = "No verification checks have been completed yet.",
}: TrustChecklistProps) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3"
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
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{item.label}</p>
            <p className="text-sm text-gray-500">
              {item.done ? "Completed" : "Recommended next"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
