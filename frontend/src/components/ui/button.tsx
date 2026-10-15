import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", isLoading = false, children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius-control)] border transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100";

    // Variants use semantic tokens only, so text stays legible in light and
    // dark mode on any surface (see docs/design-system.md).
    const variants = {
      primary: "border-transparent bg-primary text-primary-fg shadow-xs hover:bg-primary-hover hover:shadow-card",
      secondary: "border-line bg-surface-raised text-fg shadow-xs hover:bg-surface-muted hover:border-line-strong",
      outline: "border-line-strong bg-transparent text-fg hover:bg-surface-muted",
      ghost: "border-transparent bg-transparent text-fg-secondary hover:bg-surface-muted hover:text-fg",
      danger: "border-transparent bg-red-700 text-white shadow-xs hover:bg-red-800 hover:shadow-card",
    };

    const sizes = {
      sm: "px-3.5 py-2 text-sm",
      md: "px-5 py-2.5 text-sm",
      lg: "px-6 py-3.5 text-base",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
