// Orchestrates candidate generation and ranking. Pure and synchronous: all
// data (alerts, crowd forecasts, weather, routed access legs) is fetched
// ahead of time by the API route and passed in here, which is what keeps
// this function unit-testable without network access.

import { ROUTE_OPTIONS } from "./corridor";
import { evaluateCandidate } from "./scoring";
import { toMinutes, fromMinutes } from "./clock";
import type {
  AccessMode,
  AffectedSegment,
  CandidateEvaluation,
  CrowdForecastEntry,
  PlanResult,
  Provenance,
  RouteLeg,
  TripRequest,
  WeatherSnapshot,
} from "./types";

export interface PlanContext {
  affectedSegments: AffectedSegment[];
  crowdByStation: Map<string, CrowdForecastEntry[]>;
  weatherOrigin: WeatherSnapshot;
  weatherDestination: WeatherSnapshot;
  originWalkLeg: RouteLeg;
  originCycleLeg: RouteLeg;
  destWalkLeg: RouteLeg;
  provenance: { alerts: Provenance; crowdForecast: Provenance; weather: Provenance };
}

const STEP_MINUTES = 10;

function accessModesFor(request: TripRequest): AccessMode[] {
  const modes: AccessMode[] = ["walk"];
  if (request.preferences.allowCycleAndPark) modes.push("cycle_park");
  if (request.preferences.allowFoldingBikeCarry) modes.push("cycle_carry_folding");
  return modes;
}

export function planTrip(request: TripRequest, ctx: PlanContext): PlanResult {
  const modes = accessModesFor(request);
  const candidates: CandidateEvaluation[] = [];

  let t = toMinutes(request.earliestDeparture);
  const end = toMinutes(request.latestArrival);

  while (t < end) {
    const departureClock = fromMinutes(t);
    for (const routeOption of ROUTE_OPTIONS) {
      for (const mode of modes) {
        const originLeg = mode === "walk" ? ctx.originWalkLeg : ctx.originCycleLeg;
        const evalResult = evaluateCandidate({
          departureClock,
          routeOption,
          accessMode: mode,
          originLeg,
          destLeg: ctx.destWalkLeg,
          crowdByStation: ctx.crowdByStation,
          affectedSegments: ctx.affectedSegments,
          weatherOrigin: ctx.weatherOrigin,
          preferences: request.preferences,
          latestArrival: request.latestArrival,
        });
        candidates.push(evalResult);
      }
    }
    t += STEP_MINUTES;
  }

  const feasible = candidates.filter((c) => c.feasible);

  if (feasible.length === 0) {
    return {
      request,
      recommended: null,
      alternatives: [],
      allCandidates: candidates,
      explanation: "",
      noFeasibleRoute: true,
      limitingConstraint: mostCommonReason(candidates),
      generatedAt: new Date().toISOString(),
      conditionsProvenance: ctx.provenance,
    };
  }

  feasible.sort((a, b) => a.score - b.score);
  const recommended = feasible[0];

  // Alternatives: (1) best candidate on a DIFFERENT route option than the
  // recommendation (surfaces "take another route" concretely), and (2) the
  // best candidate at a meaningfully different departure time (surfaces
  // "leave later/earlier"). Both must be genuinely distinct, not near-ties.
  const alternatives: CandidateEvaluation[] = [];

  const otherRoute = feasible.find((c) => c.routeOptionId !== recommended.routeOptionId);
  if (otherRoute) alternatives.push(otherRoute);

  const differentTime = feasible.find(
    (c) =>
      Math.abs(toMinutes(c.departureClock) - toMinutes(recommended.departureClock)) >= 20 &&
      !alternatives.includes(c)
  );
  if (differentTime && alternatives.length < 2) alternatives.push(differentTime);

  const explanation = buildExplanation(request, recommended, candidates, feasible);

  return {
    request,
    recommended,
    alternatives: alternatives.slice(0, 2),
    allCandidates: candidates,
    explanation,
    noFeasibleRoute: false,
    generatedAt: new Date().toISOString(),
    conditionsProvenance: ctx.provenance,
  };
}

function mostCommonReason(candidates: CandidateEvaluation[]): string {
  const counts = new Map<string, number>();
  for (const c of candidates) {
    if (!c.infeasibleReason) continue;
    counts.set(c.infeasibleReason, (counts.get(c.infeasibleReason) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "No candidate departure satisfies your constraints.";
}

function buildExplanation(
  request: TripRequest,
  recommended: CandidateEvaluation,
  allCandidates: CandidateEvaluation[],
  feasible: CandidateEvaluation[]
): string {
  // Compare against the "naive default" a commuter would pick without this
  // app: earliest departure, walking, the first-listed route — not merely
  // the earliest candidate sharing the recommendation's own mode. This is
  // what lets the explanation surface a disruption or crowd contrast even
  // when the recommendation happens to also be the earliest departure.
  const sortedByTime = (list: CandidateEvaluation[]) =>
    [...list].sort((a, b) => toMinutes(a.departureClock) - toMinutes(b.departureClock));

  const naiveBaseline =
    sortedByTime(feasible.filter((c) => c.accessMode === "walk" && c.routeOptionId === "via-harbourfront"))[0] ??
    sortedByTime(feasible.filter((c) => c.accessMode === recommended.accessMode))[0] ??
    sortedByTime(feasible)[0];

  const earliestBaseline = naiveBaseline;

  if (!earliestBaseline || earliestBaseline.id === recommended.id) {
    return `Leaving at ${recommended.departureClock} gets you in by ${recommended.arrivalRange[1]}, within your ${request.latestArrival} arrival window, with ${recommended.worstCrowd} crowding at worst.`;
  }

  const reasons: string[] = [];

  if (recommended.routeOptionId !== earliestBaseline.routeOptionId) {
    if (earliestBaseline.affectedByDisruption && !recommended.affectedByDisruption) {
      reasons.push(
        `the ${earliestBaseline.routeOptionId === "via-harbourfront" ? "HarbourFront" : "Serangoon"} route is currently disrupted; routing via ${recommended.routeOptionId === "via-harbourfront" ? "HarbourFront" : "Serangoon"} avoids it entirely`
      );
    } else {
      reasons.push(`routing via ${recommended.routeOptionId === "via-harbourfront" ? "HarbourFront" : "Serangoon"} has the better combined time, crowd and disruption score for your preferences`);
    }
  } else if (toMinutes(recommended.departureClock) > toMinutes(earliestBaseline.departureClock)) {
    if (recommended.worstCrowd !== "high" && earliestBaseline.worstCrowd === "high") {
      reasons.push(
        `leaving ${toMinutes(recommended.departureClock) - toMinutes(earliestBaseline.departureClock)} minutes later avoids the busiest forecast period on this route (worst case eases from ${earliestBaseline.worstCrowd} to ${recommended.worstCrowd})`
      );
    } else {
      reasons.push(`leaving a little later still keeps you inside your arrival window with less crowd exposure`);
    }
  }

  if (recommended.mitigations.length > 0) {
    reasons.push(`a mitigation is active (${recommended.mitigations.join("; ")})`);
  }

  const reasonText = reasons.length > 0 ? reasons.join(", and ") : "it has the best balance of crowding, transfers and duration for your preferences";

  return `Recommended: leave at ${recommended.departureClock}, arriving by ${recommended.arrivalRange[1]} — ${reasonText}.`;
}
