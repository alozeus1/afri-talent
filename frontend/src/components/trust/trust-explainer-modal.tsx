"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { TrustBadge } from "@/components/trust/trust-badge";

export type TrustExplainerVariant = "default" | "success" | "warning" | "danger" | "info";

export interface TrustExplainerItem {
  title: string;
  description: string;
  statusLabel?: string;
  statusVariant?: TrustExplainerVariant;
}

interface TrustExplainerModalProps {
  title: string;
  description: string;
  items: TrustExplainerItem[];
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  footer?: string;
}

export function TrustExplainerModal({
  title,
  description,
  items,
  triggerLabel = "Why this is trusted",
  triggerVariant = "outline",
  footer,
}: TrustExplainerModalProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <Button type="button" variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Trust explainer
                </p>
                <h2 id={titleId} className="mt-3 text-2xl font-bold text-slate-950">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              {items.map((item) => (
                <div
                  key={`${item.title}-${item.description}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                    </div>
                    {item.statusLabel ? (
                      <TrustBadge
                        label={item.statusLabel}
                        variant={item.statusVariant || "info"}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {footer ? (
              <p className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {footer}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
