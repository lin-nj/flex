import type { CrowdLevel, StationCrowdEstimate } from "@/lib/domain/types";

const STYLES: Record<CrowdLevel, { bg: string; fg: string; dot: string; label: string; short: string }> = {
  low: { bg: "bg-accent-soft", fg: "text-accent", dot: "bg-accent", label: "Low crowd", short: "Low" },
  moderate: { bg: "bg-warn-soft", fg: "text-warn", dot: "bg-warn", label: "Moderate crowd", short: "Moderate" },
  high: { bg: "bg-danger-soft", fg: "text-danger", dot: "bg-danger", label: "High crowd", short: "Busy" },
  unknown: { bg: "bg-muted-fill", fg: "text-text-muted", dot: "bg-text-muted", label: "Crowd unknown", short: "Unknown" },
};

export default function CrowdBadge({ level, compact = false, estimates = [] }: { level: CrowdLevel; compact?: boolean; estimates?: StationCrowdEstimate[] }) {
  const s = STYLES[level];
  const known = estimates.filter((e) => e.level !== "unknown").length;
  const partial = known > 0 && known < estimates.length;
  const label = partial ? "Partial crowd data" : s.label;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium ${s.bg} ${s.fg} ${
        compact ? "px-2.5 py-1 text-[13px]" : "px-3 py-1.5 text-[15px]"
      }`}
      aria-label={label}
      title={estimates.length ? `${known} of ${estimates.length} station forecasts available; missing values remain unknown.` : label}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${s.dot}`} />
      {partial ? (compact ? "Partial" : label) : compact ? s.short : s.label}
    </span>
  );
}
