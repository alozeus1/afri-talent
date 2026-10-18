import { HTMLAttributes, forwardRef } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = "", variant = "default", children, ...props }, ref) => {
    const variants = {
      default: "border-line bg-surface-muted text-fg-secondary",
      success: "border-success-line bg-success-soft text-success",
      warning: "border-warning-line bg-warning-soft text-warning",
      danger: "border-danger-line bg-danger-soft text-danger",
      info: "border-info-line bg-info-soft text-info",
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
