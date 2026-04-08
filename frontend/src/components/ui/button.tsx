import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 font-semibold rounded-full border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none";

    const variants = {
      primary:
        "border-transparent bg-[linear-gradient(135deg,#14b89a,#0e7f6a)] text-white shadow-[0_18px_40px_rgba(15,143,120,0.28)] hover:-translate-y-0.5 hover:shadow-[0_24px_54px_rgba(15,143,120,0.34)] focus:ring-emerald-500",
      secondary:
        "border-transparent bg-[rgba(15,23,32,0.06)] text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] hover:bg-[rgba(15,23,32,0.1)] focus:ring-gray-500 dark:bg-[rgba(255,255,255,0.08)] dark:text-gray-100 dark:hover:bg-[rgba(255,255,255,0.12)]",
      outline:
        "border-[rgba(15,143,120,0.28)] bg-[rgba(255,255,255,0.55)] text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:-translate-y-0.5 hover:border-[rgba(15,143,120,0.42)] hover:bg-[rgba(255,255,255,0.75)] focus:ring-emerald-500 dark:border-[rgba(52,211,178,0.3)] dark:bg-[rgba(7,17,29,0.58)] dark:text-emerald-200 dark:hover:bg-[rgba(7,17,29,0.72)]",
      ghost:
        "border-transparent bg-transparent text-gray-700 hover:bg-[rgba(15,23,32,0.06)] focus:ring-gray-500 dark:text-gray-200 dark:hover:bg-[rgba(255,255,255,0.08)]",
      danger:
        "border-transparent bg-[linear-gradient(135deg,#ef4444,#b91c1c)] text-white shadow-[0_18px_40px_rgba(239,68,68,0.22)] hover:-translate-y-0.5 hover:shadow-[0_24px_54px_rgba(239,68,68,0.3)] focus:ring-red-500",
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
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
