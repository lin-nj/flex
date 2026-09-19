import { buildDefaultTripRequest } from "./defaultTrip";
import type { TripRequest, WeatherSnapshot } from "./types";

// A separate simulation clock: never replace a commuter's Live trip or feed timestamps.
export const DEMO_DATE = "2026-09-21";
export const DEMO_REFERENCE = `${DEMO_DATE}T07:15:00+08:00`;
export const DEMO_OBSERVED = `${DEMO_DATE}T07:00:00+08:00`;

export function buildDemoTripRequest(): TripRequest {
  return { ...buildDefaultTripRequest(new Date(DEMO_REFERENCE)), latestArrival: "09:00" };
}

export function demoWeather(areaName: string): WeatherSnapshot {
  return {
    areaName, forecastText: "Fair (simulated)", isWet: false,
    validUntil: `${DEMO_DATE}T09:30:00+08:00`,
    provenance: { mode: "synthetic", source: "Constructed demo weather", fetchedAt: DEMO_OBSERVED,
      note: "Fixed fair-weather assumption for the morning simulation; not a weather prediction." },
  };
}
