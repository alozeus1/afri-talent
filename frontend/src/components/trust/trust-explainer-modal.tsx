"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { TrustBadge } from "@/components/trust/trust-badge";
import { usePublicT } from "@/lib/i18n/public-messages";

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
  triggerLabel,
  triggerVariant = "outline",
  footer,
}: TrustExplainerModalProps) {
  const tp = usePublicT();
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
        {triggerLabel ?? tp("site.trust.whyTrusted")}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            type="button"
            tabIndex={-1}
            aria-label={tp("site.trust.close")}
            className="absolute inset-0 cursor-default bg-slate-950/60"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-overlay"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-text">
                  {tp("site.trust.explainer")}
                </p>
                <h2 id={titleId} className="mt-3 text-2xl font-bold text-fg">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-fg-secondary">{description}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {tp("site.trust.close")}
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              {items.map((item) => (
                <div
                  key={`${item.title}-${item.description}`}
                  className="rounded-2xl border border-line bg-surface-sunken px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-fg">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-fg-secondary">{item.description}</p>
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
              <p className="mt-6 rounded-2xl border border-success-line bg-success-soft px-4 py-3 text-sm text-fg">
                {footer}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
