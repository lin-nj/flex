import { describe, it, expect } from "vitest";
import { planTrip, type PlanContext } from "@/lib/domain/planTrip";
import { buildTrainAlertsFixture } from "@/fixtures/trainAlerts";
import type { CrowdForecastEntry, RouteLeg, TripRequest, WeatherSnapshot } from "@/lib/domain/types";

const mockLeg = (minutes: number, kind: RouteLeg["kind"] = "walk"): RouteLeg => ({
  kind,
  fromLabel: "A",
  toLabel: "B",
  durationMinutesRange: [minutes, minutes + 2],
});

const dryWeather: WeatherSnapshot = {
  forecastText: "Fair",
  areaName: "Punggol",
  isWet: false,
  validUntil: new Date().toISOString(),
  provenance: { mode: "synthetic", source: "test", fetchedAt: new Date().toISOString() },
};

function baseRequest(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    origin: { label: "Origin", coord: [103.8972, 1.4051] },
    destination: { label: "Dest", coord: [103.79, 1.2983] },
    date: "2026-09-21",
    earliestDeparture: "07:15",
    latestArrival: "09:00",
    preferences: {
      comfortWeight: 0.7,
      walkToleranceMinutes: 15,
      cycleToleranceMinutes: 20,
      allowCycleAndPark: true,
      allowFoldingBikeCarry: false,
    },
    ...overrides,
  };
}

function baseContext(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    affectedSegments: [],
    crowdByStation: new Map<string, CrowdForecastEntry[]>(),
    weatherOrigin: dryWeather,
    weatherDestination: dryWeather,
    originWalkLeg: mockLeg(8, "walk"),
    originCycleLeg: mockLeg(4, "cycle"),
    destWalkLeg: mockLeg(9, "walk"),
    provenance: {
      alerts: { mode: "synthetic", source: "test", fetchedAt: new Date().toISOString() },
      crowdForecast: { mode: "synthetic", source: "test", fetchedAt: new Date().toISOString() },
      weather: { mode: "synthetic", source: "test", fetchedAt: new Date().toISOString() },
    },
    ...overrides,
  };
}

describe("planTrip — latest arrival constraint", () => {
  it("does not wrap a next-day arrival into a feasible same-day journey", () => {
    const result = planTrip(baseRequest({ earliestDeparture: "23:40", latestArrival: "23:59" }), baseContext());
    expect(result.noFeasibleRoute).toBe(true);
  });
  it("marks a candidate infeasible when it would arrive after the latest acceptable arrival", () => {
    const request = baseRequest({ earliestDeparture: "07:15", latestArrival: "07:25" }); // impossibly tight
    const result = planTrip(request, baseContext());
    expect(result.noFeasibleRoute).toBe(true);
    expect(result.limitingConstraint).toMatch(/latest acceptable arrival/i);
  });
});

describe("planTrip — no feasible route", () => {
  it("explains the limiting constraint when walking/cycling is disabled and the walk leg exceeds tolerance", () => {
    const request = baseRequest({
      preferences: {
        comfortWeight: 0.7,
        walkToleranceMinutes: 2, // origin walk leg is 8 min in the mock context — too tight
        cycleToleranceMinutes: 20,
        allowCycleAndPark: false,
        allowFoldingBikeCarry: false,
      },
    });
    const result = planTrip(request, baseContext());
    expect(result.noFeasibleRoute).toBe(true);
    expect(result.limitingConstraint).toBeTruthy();
  });
});

describe("planTrip — departure window changes the recommendation", () => {
  it("recommends a later departure when the crowd forecast eases later in the window", () => {
    // Serangoon (NE12/CC13) is on both route options' shared NEL trunk exit —
    // make it high-crowd early, low later, and weight comfort heavily.
    const crowdByStation = new Map<string, CrowdForecastEntry[]>();
    crowdByStation.set("NE12", [
      { station: "NE12", startTime: "07:00", endTime: "07:45", level: "high" },
      { station: "NE12", startTime: "07:45", endTime: "09:00", level: "low" },
    ]);
    const request = baseRequest({ preferences: { ...baseRequest().preferences, comfortWeight: 0.95 } });
    const result = planTrip(request, baseContext({ crowdByStation }));
    expect(result.noFeasibleRoute).toBe(false);
    expect(result.recommended).not.toBeNull();
    // Recommended departure should be late enough that NE12 is reached after 07:45.
    expect(result.recommended!.departureClock >= "07:25").toBe(true);
  });
});

describe("planTrip — disruption routes around a severed segment", () => {
  it("recommends the unaffected route option when the other is severed with no mitigation", () => {
    const alerts = buildTrainAlertsFixture("disruption");
    const unmitigated = alerts.affectedSegments.map((s) => ({ ...s, freeMrtShuttle: undefined, freePublicBus: undefined }));
    const request = baseRequest();
    const result = planTrip(request, baseContext({ affectedSegments: unmitigated }));
    expect(result.noFeasibleRoute).toBe(false);
    expect(result.recommended!.routeOptionId).toBe("via-serangoon");
  });

  it("does not penalise either route for a disruption on an unrelated line", () => {
    const alerts = buildTrainAlertsFixture("irrelevant-disruption");
    const request = baseRequest();
    const withIrrelevant = planTrip(request, baseContext({ affectedSegments: alerts.affectedSegments }));
    const withNone = planTrip(request, baseContext({ affectedSegments: [] }));
    expect(withIrrelevant.recommended!.routeOptionId).toBe(withNone.recommended!.routeOptionId);
    expect(withIrrelevant.recommended!.affectedByDisruption).toBe(false);
  });
});
