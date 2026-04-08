import { HTMLAttributes, forwardRef } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = "", variant = "default", children, ...props }, ref) => {
    const variants = {
      default: "border border-[rgba(15,23,32,0.08)] bg-[rgba(255,255,255,0.72)] text-gray-800 dark:border-[rgba(210,226,244,0.1)] dark:bg-[rgba(255,255,255,0.06)] dark:text-gray-200",
      success: "border border-emerald-200 bg-emerald-50/85 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
      warning: "border border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
      danger: "border border-red-200 bg-red-50/90 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
      info: "border border-sky-200 bg-sky-50/90 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    };

    return (
      <span
        ref={ref}
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-[0.02em] ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
