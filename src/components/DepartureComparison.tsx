import type { CandidateEvaluation } from "@/lib/domain/types";
import CrowdBadge from "./CrowdBadge";
import { routeLabel, formatDuration } from "@/lib/domain/labels";

/** iOS inset-grouped list: one card, hairline separators inset past the time. */
export default function DepartureComparison({
  recommended,
  alternatives,
  selectedId,
  onSelect,
}: {
  recommended: CandidateEvaluation;
  alternatives: CandidateEvaluation[];
  selectedId: string;
  onSelect: (c: CandidateEvaluation) => void;
}) {
  const options = [recommended, ...alternatives];

  return (
    <section aria-label="Other departure options">
      <h2 className="px-5 pb-2 text-[13px] font-medium uppercase tracking-wide text-text-muted">Other options</h2>
      <ul className="mx-5 overflow-hidden rounded-[14px] bg-surface">
        {options.map((c, i) => {
          const selected = c.id === selectedId;
          const tag = i === 0 ? "Recommended" : c.routeOptionId !== recommended.routeOptionId ? "Another route" : null;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3.5 px-4 py-3 text-left ${selected ? "bg-accent-soft" : ""}`}
              >
                <span className="w-[62px] shrink-0 text-[20px] font-semibold tabular-nums">{c.departureClock}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">
                    {routeLabel(c.routeOptionId)} · {formatDuration(c.totalDurationRange)}
                  </span>
                  <span className="block truncate text-[13px] text-text-muted">
                    arrive {c.arrivalRange[1]}
                    {tag && ` · ${tag}`}
                  </span>
                </span>
                <CrowdBadge level={c.worstCrowd} compact />
              </button>
              {i < options.length - 1 && <div className="ml-[76px] h-px bg-border" />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
