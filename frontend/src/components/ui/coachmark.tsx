"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";

interface CoachmarkProps {
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

export function Coachmark({ title, description, position = "top", children }: CoachmarkProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      className="relative inline-flex"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={(e) => {
        // Prevent click from propagating up to the link if it wraps this
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Target Element */}
      <div className="relative">
        {children}
        
        {/* Pulsing indicator */}
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 border-2 border-white dark:border-zinc-950"></span>
        </span>
      </div>

      {/* Tooltip Card */}
      {isOpen && (
        <div 
          className={`absolute z-[100] w-64 p-4 rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900 transition-all duration-200 animate-in fade-in zoom-in-95
            ${position === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-3' : ''}
            ${position === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-3' : ''}
          `}
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 p-2 bg-emerald-50 text-emerald-600 rounded-lg dark:bg-emerald-900/30 dark:text-emerald-400">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h4>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{description}</p>
            </div>
          </div>
          
          {/* Arrow */}
          <div className={`absolute w-3 h-3 bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 rotate-45
            ${position === 'top' ? '-bottom-1.5 left-1/2 -translate-x-1/2 border-t-0 border-l-0' : ''}
            ${position === 'bottom' ? '-top-1.5 left-1/2 -translate-x-1/2 border-b-0 border-r-0' : ''}
          `} />
        </div>
      )}
    </div>
  );
}
