import { HTMLAttributes, forwardRef, SelectHTMLAttributes } from "react";

const Select = forwardRef<
    HTMLSelectElement,
    SelectHTMLAttributes<HTMLSelectElement>
>(({ className = "", children, ...props }, ref) => {
    return (
        <select
            ref={ref}
            className={`px-3 py-2 border border-[var(--border-soft)] rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
            {...props}
        >
            {children}
        </select>
    );
});

Select.displayName = "Select";

export { Select };
