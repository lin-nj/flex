import type { TripRequest } from "./types";
import { toMinutes } from "./clock";

export function isTripRequest(value: unknown): value is TripRequest {
  if (!value || typeof value !== "object") return false;
  const r = value as TripRequest;
  const point = (p: TripRequest["origin"]) => p && typeof p.label === "string" && p.label.length <= 150 &&
    Array.isArray(p.coord) && p.coord.length === 2 && p.coord.every(Number.isFinite) &&
    Math.abs(p.coord[0]) <= 180 && Math.abs(p.coord[1]) <= 90;
  const clock = (s: string) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const finiteRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
  const p = r.preferences;
  return Boolean(point(r.origin) && point(r.destination) && typeof r.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(Date.parse(`${r.date}T00:00:00+08:00`)) &&
    clock(r.earliestDeparture) && clock(r.latestArrival) &&
    toMinutes(r.earliestDeparture) < toMinutes(r.latestArrival) && p &&
    finiteRange(p.comfortWeight, 0, 1) && finiteRange(p.walkToleranceMinutes, 0, 120) &&
    finiteRange(p.cycleToleranceMinutes, 0, 120) && typeof p.allowCycleAndPark === "boolean" &&
    typeof p.allowFoldingBikeCarry === "boolean");
}
