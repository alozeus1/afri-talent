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
    wrapper: "border-blue-200 bg-blue-50 text-blue-950",
    icon: "bg-blue-100 text-blue-700",
  },
  success: {
    wrapper: "border-emerald-200 bg-emerald-50 text-emerald-950",
    icon: "bg-emerald-100 text-emerald-700",
  },
  warning: {
    wrapper: "border-amber-200 bg-amber-50 text-amber-950",
    icon: "bg-amber-100 text-amber-700",
  },
  danger: {
    wrapper: "border-red-200 bg-red-50 text-red-950",
    icon: "bg-red-100 text-red-700",
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
    <div className={`rounded-2xl border px-4 py-4 ${palette.wrapper}`}>
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
            <p className="mt-1 text-sm leading-6 opacity-90">{body}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
      </div>
    </div>
  );
}
