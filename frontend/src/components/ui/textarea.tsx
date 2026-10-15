import { HTMLAttributes, forwardRef, TextareaHTMLAttributes } from "react";

const Textarea = forwardRef<
    HTMLTextAreaElement,
    TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => {
    return (
        <textarea
            ref={ref}
            className={`px-3 py-2 border border-line-strong rounded-[var(--radius-control)] bg-surface-raised text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-focus ${className}`}
            {...props}
        />
    );
});

Textarea.displayName = "Textarea";

export { Textarea };
