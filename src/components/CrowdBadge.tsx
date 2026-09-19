import type { CrowdLevel } from "@/lib/domain/types";

const STYLES: Record<CrowdLevel, { bg: string; fg: string; dot: string; label: string; short: string }> = {
  low: { bg: "bg-accent-soft", fg: "text-accent", dot: "bg-accent", label: "Low crowd", short: "Low" },
  moderate: { bg: "bg-warn-soft", fg: "text-warn", dot: "bg-warn", label: "Moderate crowd", short: "Moderate" },
  high: { bg: "bg-danger-soft", fg: "text-danger", dot: "bg-danger", label: "High crowd", short: "Busy" },
  unknown: { bg: "bg-muted-fill", fg: "text-text-muted", dot: "bg-text-muted", label: "Crowd unknown", short: "No data" },
};

export default function CrowdBadge({ level, compact = false }: { level: CrowdLevel; compact?: boolean }) {
  const s = STYLES[level];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium ${s.bg} ${s.fg} ${
        compact ? "px-2.5 py-1 text-[13px]" : "px-3 py-1.5 text-[15px]"
      }`}
      aria-label={s.label}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${s.dot}`} />
      {compact ? s.short : s.label}
    </span>
  );
}
