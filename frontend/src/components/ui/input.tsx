import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`w-full rounded-2xl border px-4 py-3 bg-[rgba(255,255,255,0.68)] text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all dark:bg-[rgba(7,17,29,0.72)] dark:text-gray-100 ${
            error ? "border-red-500" : "border-[rgba(15,23,32,0.12)] dark:border-[rgba(210,226,244,0.12)]"
          } ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
