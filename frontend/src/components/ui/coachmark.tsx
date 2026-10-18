"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";

interface CoachmarkProps {
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

/**
 * Hover hint for a badge. It is decorative (the badge text already carries
 * the meaning), so it is hidden from assistive tech and adds no extra click
 * target inside the job-card link.
 */
export function Coachmark({ title, description, position = "top", children }: CoachmarkProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-flex" onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
      {/* Target element */}
      <span className="relative">
        {children}

        {/* Pulsing indicator */}
        <span className="absolute -top-1 -end-1 flex h-3 w-3" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:animate-none"></span>
          <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-surface bg-amber-500"></span>
        </span>
      </span>

      {/* Tooltip card */}
      {isOpen && (
        <span
          aria-hidden="true"
          className={`absolute z-[100] w-64 rounded-xl border border-line bg-surface-raised p-4 shadow-overlay transition-all duration-200 animate-in fade-in zoom-in-95
            ${position === "top" ? "bottom-full left-1/2 mb-3 -translate-x-1/2" : ""}
            ${position === "bottom" ? "top-full left-1/2 mt-3 -translate-x-1/2" : ""}
          `}
        >
          <span className="flex items-start gap-3">
            <span className="shrink-0 rounded-lg bg-success-soft p-2 text-primary-text">
              <Info className="h-4 w-4" />
            </span>
            <span className="block">
              <span className="block text-sm font-bold text-fg">{title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-fg-secondary">{description}</span>
            </span>
          </span>

          {/* Arrow */}
          <span
            className={`absolute h-3 w-3 rotate-45 border border-line bg-surface-raised
            ${position === "top" ? "-bottom-1.5 left-1/2 -translate-x-1/2 border-l-0 border-t-0" : ""}
            ${position === "bottom" ? "-top-1.5 left-1/2 -translate-x-1/2 border-b-0 border-r-0" : ""}
          `}
          />
        </span>
      )}
    </span>
  );
}
