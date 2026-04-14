import { HTMLAttributes, forwardRef, TextareaHTMLAttributes } from "react";

const Textarea = forwardRef<
    HTMLTextAreaElement,
    TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => {
    return (
        <textarea
            ref={ref}
            className={`px-3 py-2 border border-[var(--border-soft)] rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
            {...props}
        />
    );
});

Textarea.displayName = "Textarea";

export { Textarea };
