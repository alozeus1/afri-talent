import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", isLoading = false, children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 font-medium rounded-md border transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100";

    const variants = {
      primary:
        "border-transparent bg-emerald-600 text-white shadow-sm hover:shadow-md hover:bg-emerald-700 focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-600",
      secondary:
        "border-zinc-200 bg-white text-zinc-900 shadow-sm hover:shadow-md hover:bg-zinc-50 focus-visible:ring-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800",
      outline:
        "border-zinc-200 bg-transparent text-zinc-900 shadow-sm hover:shadow-md hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-zinc-500 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-800",
      ghost:
        "border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 focus-visible:ring-zinc-500 dark:text-zinc-300 dark:hover:bg-zinc-800",
      danger:
        "border-transparent bg-red-600 text-white shadow-sm hover:shadow-md hover:bg-red-700 focus-visible:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600",
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
