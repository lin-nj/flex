"use client";

import { useId, useState } from "react";

/**
 * iOS-style row that expands in place.
 *
 * Deliberately React state rather than a native <details>: collapsed <details>
 * content stays in the DOM at display:none, where anything measuring itself on
 * mount initialises to zero height.
 */
export default function Disclosure({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-[17px]">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-text-muted">
          {hint && <span className="text-[15px]">{hint}</span>}
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div id={panelId} className="border-t border-border px-4 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}
