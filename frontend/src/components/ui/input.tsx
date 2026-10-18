import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, id, "aria-describedby": ariaDescribedBy, ...props }, ref) => {
    const errorId = id && error ? `${id}-error` : undefined;
    const describedBy = [ariaDescribedBy, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-fg-secondary mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border px-4 py-3 bg-surface-raised text-fg placeholder:text-fg-muted shadow-xs focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent transition-colors ${
            error ? "border-danger" : "border-line-strong"
          } ${className}`}
          {...props}
        />
        {error && <p id={errorId} className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
