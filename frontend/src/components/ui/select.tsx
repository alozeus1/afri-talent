import { HTMLAttributes, forwardRef, SelectHTMLAttributes } from "react";

const Select = forwardRef<
    HTMLSelectElement,
    SelectHTMLAttributes<HTMLSelectElement>
>(({ className = "", children, ...props }, ref) => {
    return (
        <select
            ref={ref}
            className={`px-3 py-2 border border-line-strong rounded-[var(--radius-control)] bg-surface-raised text-sm text-fg focus:outline-none focus:ring-2 focus:ring-focus ${className}`}
            {...props}
        >
            {children}
        </select>
    );
});

Select.displayName = "Select";

export { Select };
