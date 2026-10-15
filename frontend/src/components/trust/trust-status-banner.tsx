import { ReactNode } from "react";

type TrustStatusTone = "info" | "success" | "warning" | "danger";

interface TrustStatusBannerProps {
  tone?: TrustStatusTone;
  title: string;
  body: string;
  actions?: ReactNode;
}

const toneClasses: Record<TrustStatusTone, { wrapper: string; icon: string }> = {
  info: {
    wrapper: "border-info-line bg-info-soft text-fg",
    icon: "bg-surface text-info",
  },
  success: {
    wrapper: "border-success-line bg-success-soft text-fg",
    icon: "bg-surface text-success",
  },
  warning: {
    wrapper: "border-warning-line bg-warning-soft text-fg",
    icon: "bg-surface text-warning",
  },
  danger: {
    wrapper: "border-danger-line bg-danger-soft text-fg",
    icon: "bg-surface text-danger",
  },
};

const toneIcons: Record<TrustStatusTone, string> = {
  info: "i",
  success: "✓",
  warning: "!",
  danger: "!",
};

export function TrustStatusBanner({
  tone = "info",
  title,
  body,
  actions,
}: TrustStatusBannerProps) {
  const palette = toneClasses[tone];

  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`rounded-2xl border px-4 py-4 ${palette.wrapper}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.icon}`}
            aria-hidden="true"
          >
            {toneIcons[tone]}
          </span>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm leading-6 text-fg-secondary">{body}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
      </div>
    </div>
  );
}
