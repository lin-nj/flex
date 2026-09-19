import type { CandidateEvaluation } from "@/lib/domain/types";
import CrowdBadge from "./CrowdBadge";
import { routeLabel, ACCESS_MODE_LABEL, formatDuration } from "@/lib/domain/labels";

/**
 * The answer, at iOS large-title weight. Arjun opens this to settle one
 * question — when do I leave — so the departure time is the page, not a card
 * on it.
 */
export default function RecommendationCard({
  candidate,
  explanation,
}: {
  candidate: CandidateEvaluation;
  explanation: string;
}) {
  const activeMinutes = Math.round(candidate.walkingExposureMinutes + candidate.cyclingMinutes);

  return (
    <section className="px-5 pb-6 pt-7" aria-label="Recommended departure">
      <p className="text-[17px] text-text-muted">Leave at</p>
      <p className="mt-1 text-[76px] font-bold leading-[0.95] tracking-[-0.03em] tabular-nums">
        {candidate.departureClock}
      </p>

      <p className="mt-5 text-[22px] leading-snug">
        Arrive by <span className="font-semibold tabular-nums">{candidate.arrivalRange[1]}</span>
      </p>
      <p className="mt-1.5 text-[17px] text-text-muted">
        {routeLabel(candidate.routeOptionId)} · {ACCESS_MODE_LABEL[candidate.accessMode]}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <CrowdBadge level={candidate.worstCrowd} />
        {candidate.weatherFlag && (
          <span className="rounded-full bg-muted-fill px-3 py-1.5 text-[15px] font-medium text-text-muted">
            {candidate.weatherFlag}
          </span>
        )}
        {candidate.mitigations.length > 0 && (
          <span className="rounded-full bg-warn-soft px-3 py-1.5 text-[15px] font-medium text-warn">
            {candidate.mitigations.join(" · ")}
          </span>
        )}
      </div>

      <p className="mt-5 text-[17px] leading-relaxed">{explanation}</p>

      <p className="mt-3 text-[15px] text-text-muted tabular-nums">
        {formatDuration(candidate.totalDurationRange)} · {candidate.transfers}{" "}
        {candidate.transfers === 1 ? "transfer" : "transfers"} · {activeMinutes} min on foot or bike
      </p>
    </section>
  );
}
