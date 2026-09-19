import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/plan/route";
import { buildDemoTripRequest, DEMO_DATE, DEMO_OBSERVED, DEMO_REFERENCE } from "@/lib/domain/demo";
import { buildDefaultTripRequest } from "@/lib/domain/defaultTrip";
import { cachePlan, readCachedPlan } from "@/lib/offline/cache";
import type { PlanResult, TripRequest } from "@/lib/domain/types";

vi.mock("@/lib/data/osrm", async (original) => ({
  ...await original<typeof import("@/lib/data/osrm")>(),
  walkLeg: vi.fn(async () => ({ kind: "walk", fromLabel: "A", toLabel: "B", durationMinutesRange: [8, 10] })),
  cycleLeg: vi.fn(async () => ({ kind: "cycle", fromLabel: "A", toLabel: "B", durationMinutesRange: [4, 6] })),
}));
vi.mock("@/lib/data/weather", () => ({ fetchWeatherFor: vi.fn(async () => ({
  areaName: "Punggol", forecastText: "Fair", isWet: false, validUntil: "2026-09-19T09:00:00Z",
  provenance: { mode: "live", source: "test weather", fetchedAt: "2026-09-19T07:00:00Z" },
})) }));

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function plan(scenario: string, request: TripRequest = buildDemoTripRequest(), simulateStale = false) {
  const response = await POST(new Request("http://localhost/api/plan", {
    method: "POST", body: JSON.stringify({ request, scenario, simulateStale }),
  }));
  return { status: response.status, body: await response.json() };
}

describe("demo and Live clocks/providers", () => {
  it("covers a demo selected from afternoon Live defaults, independently of wall clock and configured key", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-19T07:10:00Z"));
    vi.stubEnv("LTA_ACCOUNT_KEY", "test-key"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const live = buildDefaultTripRequest();
    expect(live.earliestDeparture).toBe("15:10");
    const demo = buildDemoTripRequest();
    for (const scenario of ["normal", "planned-works", "disruption", "irrelevant-disruption"]) {
      const { status, body } = await plan(scenario, demo);
      expect(status).toBe(200); expect(body.result.recommended).toBeTruthy();
      expect(body.result.recommended.crowdEstimates.filter((e: { level: string }) => e.level !== "unknown").length).toBeGreaterThanOrEqual(14);
      expect(body.result.recommended.crowdEstimates.some((e: { bucketSource: string }) => e.bucketSource === "outside forecast window")).toBe(false);
      expect(body.result.simulation.referenceTime).toBe(DEMO_REFERENCE);
      expect(body.result.conditionsProvenance.crowdForecast.fetchedAt).toBe(DEMO_OBSERVED);
      expect(body.result.conditionsProvenance.weather.mode).toBe("synthetic");
    }
    expect(fetch).not.toHaveBeenCalled(); expect(live.earliestDeparture).toBe("15:10");
  });
  it("keeps planned works as an advance notice, ignores unrelated incidents, and avoids a disrupted route", async () => {
    const normal = (await plan("normal")).body;
    const planned = (await plan("planned-works")).body;
    const irrelevant = (await plan("irrelevant-disruption")).body;
    const disrupted = (await plan("disruption")).body;
    expect(planned.alerts.messages[0].content).toContain("26 Sep 2026");
    expect(planned.result.recommended.id).toBe(normal.result.recommended.id);
    expect(irrelevant.result.recommended.id).toBe(normal.result.recommended.id);
    expect(irrelevant.result.allCandidates.every((c: { affectedByDisruption: boolean }) => !c.affectedByDisruption)).toBe(true);
    expect(disrupted.result.recommended.routeOptionId).toBe("via-serangoon");
    expect(disrupted.result.recommended.affectedByDisruption).toBe(false);
    expect(disrupted.result.explanation).toContain("avoids it entirely");
  });
  it("measures stale fixture age against the simulation clock without poisoning another request", async () => {
    const stale = (await plan("normal", buildDemoTripRequest(), true)).body;
    const fresh = (await plan("normal")).body;
    expect(Date.parse(DEMO_REFERENCE) - Date.parse(stale.alerts.provenance.fetchedAt)).toBe(180 * 60000);
    expect(fresh.alerts.provenance.fetchedAt).toBe(DEMO_OBSERVED);
    expect(fresh.result.simulation.stale).toBe(false);
  });
  it("returns unknown outside fixture coverage without erasing a feasible plan; keeps impossible trips infeasible", async () => {
    const unknown = (await plan("normal", { ...buildDemoTripRequest(), earliestDeparture: "15:10", latestArrival: "17:10" })).body.result;
    expect(unknown.recommended).toBeTruthy(); expect(unknown.recommended.worstCrowd).toBe("unknown");
    const impossible = (await plan("normal", { ...buildDemoTripRequest(), latestArrival: "07:20" })).body.result;
    expect(impossible.noFeasibleRoute).toBe(true); expect(impossible.limitingConstraint).toMatch(/latest acceptable arrival/);
    expect((await plan("normal", { ...buildDemoTripRequest(), date: "2026-09-22" })).status).toBe(400);
  });
  it("returns to Live providers after a demo and never simulates a Live observation timestamp", async () => {
    vi.stubEnv("LTA_ACCOUNT_KEY", "test-key");
    const fetch = vi.fn(async (url: string) => Response.json(url.includes("TrainServiceAlerts")
      ? { value: { Status: 1, AffectedSegments: [], Message: [] } } : { value: [] }));
    vi.stubGlobal("fetch", fetch);
    await plan("disruption");
    const request = buildDefaultTripRequest(new Date("2026-09-19T07:10:00Z"));
    const live = (await plan("live", request)).body;
    expect(live.result.request).toEqual(request); expect(live.result.simulation).toBeUndefined();
    expect(live.alerts.provenance.mode).toBe("live"); expect(live.result.conditionsProvenance.crowdForecast.mode).toBe("live");
    expect(fetch).toHaveBeenCalled();
    expect((await plan("live", request, true)).status).toBe(400);
  });
});

describe("offline cache isolation", () => {
  it("preserves the Live plan, rejects legacy demo cache, and matches request preferences/time", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
    const demo: PlanResult = (await plan("normal")).body.result;
    const live: PlanResult = { ...demo, simulation: undefined, conditionsProvenance: {
      alerts: { mode: "live", source: "test", fetchedAt: DEMO_REFERENCE },
      crowdForecast: { mode: "live", source: "test", fetchedAt: DEMO_REFERENCE },
      weather: { mode: "live", source: "test", fetchedAt: DEMO_REFERENCE },
    } };
    cachePlan(live); cachePlan(demo);
    expect(readCachedPlan(live.request)?.result.conditionsProvenance.alerts.mode).toBe("live");
    expect(readCachedPlan({ ...live.request, latestArrival: "08:00" })).toBeNull();
    expect(readCachedPlan({ ...live.request, preferences: { ...live.request.preferences, comfortWeight: 0 } })).toBeNull();
    values.set("flex:lastPlan:v1", JSON.stringify({ result: { ...demo, simulation: undefined }, cachedAt: DEMO_DATE }));
    expect(readCachedPlan()).toBeNull();
  });
});
