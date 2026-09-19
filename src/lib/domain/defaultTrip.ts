// Arjun's editable example trip — real, verifiable endpoints so judges (or
// anyone) can try the app with zero setup.
//
//  - Origin: near Soo Teck LRT Station, Punggol. Coordinate is the polygon
//    centroid for "SOO TECK" in the provided
//    PS2/data/AmendmenttoMP2014RailStation.geojson (an LRT stop on the
//    Punggol loop, not a private address).
//  - Destination: Fusionopolis One, one-north — a real, named building in
//    the one-north business park, geocoded via OpenStreetMap Nominatim
//    (© OpenStreetMap contributors) during development.

import type { GeoPoint, TripRequest } from "./types";
import { fromMinutes, toMinutes } from "./clock";

export const ARJUN_ORIGIN: GeoPoint = {
  label: "Near Soo Teck LRT, Punggol",
  coord: [103.897229, 1.405145],
};

export const ARJUN_DESTINATION: GeoPoint = {
  label: "Fusionopolis One, one-north",
  coord: [103.7900874, 1.2982805],
};

/** Punggol MRT/LRT interchange — the real first station of both route options. */
export const CORRIDOR_ORIGIN_STATION: [number, number] = [103.902454, 1.405228];
/** one-north MRT station — the real last station of both route options. */
export const CORRIDOR_DEST_STATION: [number, number] = [103.787487, 1.299824];

const SG_TIMEZONE = "Asia/Singapore";

/**
 * Defaults to leaving *now*, in Singapore time. The window used to be pinned to
 * 07:15–09:00, which meant an afternoon visitor was shown a morning commute.
 * The timezone is named explicitly so the server and the browser agree no
 * matter where either one is running.
 */
export function buildDefaultTripRequest(now: Date = new Date()): TripRequest {
  const date = now.toLocaleDateString("en-CA", { timeZone: SG_TIMEZONE });
  const clock = now.toLocaleTimeString("en-GB", {
    timeZone: SG_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Round up to the next 5 minutes so the earliest option is still catchable,
  // and clamp near midnight rather than wrapping into yesterday.
  const earliestMin = Math.min(Math.ceil(toMinutes(clock) / 5) * 5, 23 * 60 + 55);
  const latestMin = Math.min(earliestMin + 120, 23 * 60 + 59);

  return {
    origin: ARJUN_ORIGIN,
    destination: ARJUN_DESTINATION,
    date,
    earliestDeparture: fromMinutes(earliestMin),
    latestArrival: fromMinutes(latestMin),
    preferences: {
      comfortWeight: 0.7,
      walkToleranceMinutes: 15,
      cycleToleranceMinutes: 20,
      allowCycleAndPark: true,
      allowFoldingBikeCarry: false,
    },
  };
}
