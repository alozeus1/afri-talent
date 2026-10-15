import { HTMLAttributes, forwardRef, SelectHTMLAttributes } from "react";

const Select = forwardRef<
    HTMLSelectElement,
    SelectHTMLAttributes<HTMLSelectElement>
>(({ className = "", children, ...props }, ref) => {
    return (
        <select
            ref={ref}
            className={`px-3 py-2 border border-[var(--border-soft)] rounded-lg bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-900 dark:text-zinc-100 ${className}`}
            {...props}
        >
            {children}
        </select>
    );
});

Select.displayName = "Select";

export { Select };
