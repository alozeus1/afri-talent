import { HTMLAttributes, forwardRef } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = "", variant = "default", children, ...props }, ref) => {
    const variants = {
      default: "border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
      success: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-900/40 dark:text-emerald-300",
      warning: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/30 dark:bg-amber-900/40 dark:text-amber-300",
      danger: "border-red-200 bg-red-100 text-red-800 dark:border-red-800/30 dark:bg-red-900/40 dark:text-red-300",
      info: "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800/30 dark:bg-sky-900/40 dark:text-sky-300",
    };

    return (
      <span
        ref={ref}
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
