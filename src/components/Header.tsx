"use client";

export default function Header({ panelOpen, onTogglePanel }: { panelOpen: boolean; onTogglePanel: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold leading-tight">Flex</h1>
          <p className="truncate text-[13px] text-text-muted">Punggol → one-north</p>
        </div>
        <button
          type="button"
          onClick={onTogglePanel}
          aria-expanded={panelOpen}
          className="shrink-0 rounded-full bg-muted-fill px-3.5 py-1.5 text-[15px] font-medium text-accent"
        >
          {panelOpen ? "Done" : "Scenarios"}
        </button>
      </div>
    </header>
  );
}
