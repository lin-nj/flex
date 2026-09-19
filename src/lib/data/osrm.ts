// Server-side adapter for real walking/cycling route geometry.
//
// Uses the FOSSGIS e.V. community OSRM instances at routing.openstreetmap.de
// (routed-foot / routed-bike) rather than the router.project-osrm.org demo
// server. Verified during development (September 2026) that
// router.project-osrm.org's public instance only actually hosts the driving
// profile — its /foot and /bike endpoints silently return identical
// car-graph, car-speed results (same distance/duration/geometry as
// /driving for the same coordinates, tested directly). routing.openstreetmap.de
// returns genuinely different, correctly-paced foot and bike routes, so
// that's what door-to-door legs use. This is what keeps them honest:
// PS2_README.md is explicit that a straight line between station centres is
// a fabricated walking route, not a real one — and a car-profile route
// dressed up as a walking route would be nearly as dishonest.
//
// Both instances are meant for light, targeted use — not bulk queries — so
// every result is cached in-process, keyed by rounded coordinates, for the
// life of the server. Each trip plan issues only the handful of access-leg
// queries it actually needs (never a bulk/batch fetch).

import type { RouteLeg } from "../domain/types";

const OSRM_HOST: Record<"foot" | "cycling", string> = {
  foot: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
  cycling: "https://routing.openstreetmap.de/routed-bike/route/v1/bike",
};
const cache = new Map<string, { distanceMeters: number; durationSeconds: number; geometry: [number, number][] }>();

function cacheKey(profile: string, from: [number, number], to: [number, number]): string {
  const r = (n: number) => n.toFixed(5);
  return `${profile}:${r(from[0])},${r(from[1])}:${r(to[0])},${r(to[1])}`;
}

async function routeVia(
  profile: "foot" | "cycling",
  from: [number, number],
  to: [number, number]
): Promise<{ distanceMeters: number; durationSeconds: number; geometry: [number, number][] }> {
  const key = cacheKey(profile, from, to);
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${OSRM_HOST[profile]}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
  const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== "Ok") throw new Error(`OSRM code ${json.code}`);
  const route = json.routes[0];
  const result = {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry.coordinates as [number, number][],
  };
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

/** Straight-line fallback (Haversine) for when OSRM is unreachable — used only
 * to keep the app usable offline/degraded, and always paired with a note that
 * this is a straight-line estimate, never presented as a routed path. */
export function haversineKm(from: [number, number], to: [number, number]): number {
  const R = 6371;
  const [lon1, lat1] = from.map((d) => (d * Math.PI) / 180);
  const [lon2, lat2] = to.map((d) => (d * Math.PI) / 180);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function haversineMinutes(from: [number, number], to: [number, number], speedKmh: number): number {
  return (haversineKm(from, to) / speedKmh) * 60;
}

export async function walkLeg(from: [number, number], to: [number, number], fromLabel: string, toLabel: string): Promise<RouteLeg> {
  try {
    const r = await routeVia("foot", from, to);
    const minutes = r.durationSeconds / 60;
    return {
      kind: "walk",
      fromLabel,
      toLabel,
      distanceMeters: r.distanceMeters,
      durationMinutesRange: [Math.round(minutes * 0.9), Math.round(minutes * 1.25)],
      geometry: r.geometry,
    };
  } catch {
    const minutes = haversineMinutes(from, to, 4.5);
    return {
      kind: "walk",
      fromLabel,
      toLabel,
      durationMinutesRange: [Math.round(minutes * 0.9), Math.round(minutes * 1.4)],
    };
  }
}

export async function cycleLeg(from: [number, number], to: [number, number], fromLabel: string, toLabel: string): Promise<RouteLeg> {
  try {
    const r = await routeVia("cycling", from, to);
    const minutes = r.durationSeconds / 60;
    return {
      kind: "cycle",
      fromLabel,
      toLabel,
      distanceMeters: r.distanceMeters,
      durationMinutesRange: [Math.round(minutes * 0.9), Math.round(minutes * 1.2)],
      geometry: r.geometry,
    };
  } catch {
    const minutes = haversineMinutes(from, to, 14);
    return {
      kind: "cycle",
      fromLabel,
      toLabel,
      durationMinutesRange: [Math.round(minutes * 0.9), Math.round(minutes * 1.3)],
    };
  }
}
