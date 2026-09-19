import { describe, it, expect } from "vitest";
import { assessDisruptionForRoute, isRouteSevered } from "@/lib/domain/disruptionMatch";
import { ROUTE_OPTIONS } from "@/lib/domain/corridor";
import { buildTrainAlertsFixture } from "@/fixtures/trainAlerts";

const viaHarbourFront = ROUTE_OPTIONS.find((r) => r.id === "via-harbourfront")!;
const viaSerangoon = ROUTE_OPTIONS.find((r) => r.id === "via-serangoon")!;

describe("disruption matching", () => {
  it("matches the transfer platform code even when map stations omit that alias", () => {
    const impact = assessDisruptionForRoute({ line: "CCL", direction: "Both", stations: ["CC13"] }, viaSerangoon);
    expect(impact.relevant).toBe(true);
    expect(isRouteSevered(viaSerangoon, impact)).toBe(true);
  });
  it("flags a real disruption on a segment this route actually uses", () => {
    const alerts = buildTrainAlertsFixture("disruption");
    const impact = assessDisruptionForRoute(alerts.affectedSegments[0], viaHarbourFront);
    expect(impact.relevant).toBe(true);
    expect(impact.blockedStations.length).toBeGreaterThan(0);
    expect(impact.hasMitigation).toBe(true);
  });

  it("does NOT flag the same disruption for a route that never touches those stations", () => {
    const alerts = buildTrainAlertsFixture("disruption");
    const impact = assessDisruptionForRoute(alerts.affectedSegments[0], viaSerangoon);
    // via-serangoon's CCL stations are CC13..CC23, disjoint from CC24-CC29
    expect(impact.relevant).toBe(false);
    expect(impact.blockedStations).toHaveLength(0);
  });

  it("does not reroute for an incident on an unrelated line (NSL, nowhere near this corridor)", () => {
    const alerts = buildTrainAlertsFixture("irrelevant-disruption");
    const impactA = assessDisruptionForRoute(alerts.affectedSegments[0], viaHarbourFront);
    const impactB = assessDisruptionForRoute(alerts.affectedSegments[0], viaSerangoon);
    expect(impactA.relevant).toBe(false);
    expect(impactB.relevant).toBe(false);
  });

  it("treats a mitigated disruption as not fully severing the route", () => {
    const alerts = buildTrainAlertsFixture("disruption");
    const impact = assessDisruptionForRoute(alerts.affectedSegments[0], viaHarbourFront);
    expect(isRouteSevered(viaHarbourFront, impact)).toBe(false);
  });

  it("severs a route when the same disruption carries no mitigation fields", () => {
    const alerts = buildTrainAlertsFixture("disruption");
    const unmitigated = { ...alerts.affectedSegments[0], freeMrtShuttle: undefined, freePublicBus: undefined };
    const impact = assessDisruptionForRoute(unmitigated, viaHarbourFront);
    expect(isRouteSevered(viaHarbourFront, impact)).toBe(true);
  });
});
