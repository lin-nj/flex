// Matches a TrainServiceAlerts AffectedSegments entry against a specific
// route option's actual station sequence — not just the line name. An
// incident on the North South Line must never trigger a reroute for a
// Circle Line / North East Line journey just because "a train line has a
// problem somewhere".

import { canonicalLineFor } from "./corridor";
import type { AffectedSegment, RouteOption } from "./types";

export interface DisruptionImpact {
  segment: AffectedSegment;
  relevant: boolean;
  blockedStations: string[]; // intersection with the route's own stations
  hasMitigation: boolean;
  mitigationNote?: string;
}

export function assessDisruptionForRoute(segment: AffectedSegment, route: RouteOption): DisruptionImpact {
  const canonical = canonicalLineFor(segment.line);
  const routeLines = new Set(route.segments.map((s) => s.line));

  if (!canonical || !routeLines.has(canonical)) {
    return { segment, relevant: false, blockedStations: [], hasMitigation: false };
  }

  const routeStationSet = new Set(route.segments.filter((s) => s.line === canonical).flatMap((s) => [s.from, s.to]));
  const blockedStations = segment.stations.filter((s) => routeStationSet.has(s));

  if (blockedStations.length === 0) {
    // Same line, but a part of it this route never touches (e.g. a different branch/segment).
    return { segment, relevant: false, blockedStations: [], hasMitigation: false };
  }

  const hasMitigation = Boolean(segment.freeMrtShuttle || segment.freePublicBus);
  const mitigationNote = [
    segment.freeMrtShuttle ? `Free MRT shuttle: ${segment.freeMrtShuttle}` : null,
    segment.freePublicBus ? `Free bus boarding: ${segment.freePublicBus}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return {
    segment,
    relevant: true,
    blockedStations,
    hasMitigation,
    mitigationNote: mitigationNote || undefined,
  };
}

/** True if the blocked stations fully sever the route (no mitigation covers the gap
 * and the blocked run isn't just the very first/last station of the route). */
export function isRouteSevered(route: RouteOption, impact: DisruptionImpact): boolean {
  if (!impact.relevant || impact.hasMitigation) return false;
  // If every blocked station sits strictly inside the route (not just touching one end),
  // continuity is broken with no official mitigation offered.
  return impact.blockedStations.some((code) => route.segments.some((s) => s.from === code || s.to === code));
}
