import { describe, expect, it } from "vitest";
import { buildDefaultTripRequest } from "@/lib/domain/defaultTrip";
import { isTripRequest } from "@/lib/domain/validateTrip";

describe("public trip request validation", () => {
  const trip = buildDefaultTripRequest(new Date("2026-09-18T23:31:00Z"));
  it("defaults to the Singapore date and clock even on a UTC host", () => {
    expect(trip.date).toBe("2026-09-19"); expect(trip.earliestDeparture).toBe("07:35"); expect(isTripRequest(trip)).toBe(true);
  });
  it("rejects null, missing preferences and non-finite coordinates", () => {
    expect(isTripRequest(null)).toBe(false);
    expect(isTripRequest({ ...trip, preferences: null })).toBe(false);
    expect(isTripRequest({ ...trip, origin: { label: "x", coord: [NaN, 1] } })).toBe(false);
  });
  it("rejects unbounded or reversed time windows and invalid preferences", () => {
    expect(isTripRequest({ ...trip, earliestDeparture: "-1:00" })).toBe(false);
    expect(isTripRequest({ ...trip, latestArrival: "07:00" })).toBe(false);
    expect(isTripRequest({ ...trip, preferences: { ...trip.preferences, comfortWeight: 100 } })).toBe(false);
  });
});
