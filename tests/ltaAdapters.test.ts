import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTrainAlerts, fetchTrainServiceAlerts } from "@/lib/data/trainAlerts";
import { parseCrowdForecast, fetchCrowdForecast } from "@/lib/data/crowding";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
const stamp = "2026-09-19T06:00:00Z";
describe("LTA adapters", () => {
  it("accepts verified normal service and preserves independent advisories", () => {
    const r = parseTrainAlerts({ value: { Status: 1, AffectedSegments: [], Message: [{ Content: "Planned works", CreatedDate: stamp }] } }, stamp);
    expect(r.status).toBe(1); expect(r.affectedSegments).toEqual([]);
    expect(r.messages[0].content).toBe("Planned works"); expect(r.provenance.mode).toBe("live");
  });
  it("parses nested affected stations and mitigation", () => {
    const r = parseTrainAlerts({ value: { Status: 2, AffectedSegments: [{ Line: "CCL", Direction: "Both", Stations: "CC29, CC28", FreeMRTShuttle: "CC29 to CC28" }], Message: [] } }, stamp);
    expect(r.affectedSegments[0].stations).toEqual(["CC29", "CC28"]);
    expect(r.affectedSegments[0].freeMrtShuttle).toBe("CC29 to CC28");
  });
  it("rejects malformed responses rather than claiming normal service", () => {
    expect(() => parseTrainAlerts({ value: {} }, stamp)).toThrow();
  });
  it("keeps explicit demo scenarios when a real key is configured", async () => {
    vi.stubEnv("LTA_ACCOUNT_KEY", "test-key"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const alerts = await fetchTrainServiceAlerts("disruption");
    expect(alerts.provenance.mode).toBe("synthetic"); expect(alerts.status).toBe(2);
    expect((await fetchCrowdForecast("NEL", "2026-09-19", true)).provenance.mode).toBe("synthetic");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("missing credentials yield unknown conditions, never a normal fixture", async () => {
    vi.stubEnv("LTA_ACCOUNT_KEY", "");
    const alerts = await fetchTrainServiceAlerts("live");
    expect(alerts.status).toBeNull(); expect(alerts.provenance.mode).toBe("unavailable");
    expect((await fetchCrowdForecast("NEL", "2026-09-19")).entries).toEqual([]);
  });
  it("auth failure is labelled without exposing upstream response text", async () => {
    vi.stubEnv("LTA_ACCOUNT_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive upstream content", { status: 401 })));
    const { fetchLta } = await import("@/lib/data/lta");
    await expect(fetchLta("TrainServiceAlerts")).rejects.toThrow("authentication rejected");
  });
  it("caches a snapshot without advancing its observation time", async () => {
    vi.stubEnv("LTA_ACCOUNT_KEY", "test-key");
    const fetch = vi.fn().mockResolvedValue(Response.json({ value: [] })); vi.stubGlobal("fetch", fetch);
    const { fetchLta } = await import("@/lib/data/lta");
    const a = await fetchLta("PCDForecast?TrainLine=NEL"); const b = await fetchLta("PCDForecast?TrainLine=NEL");
    expect(a.fetchedAt).toBe(b.fetchedAt); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("matches the Singapore date across UTC midnight and preserves unknown", () => {
    const data = { value: [{ Date: "2026-09-19T00:00:00+08:00", Stations: [{ Station: "NE17", Interval: [
      { Start: "2026-09-18T23:30:00Z", CrowdLevel: "NA" },
      { Start: "2026-09-19T23:30:00+08:00", CrowdLevel: "l" },
      { Start: "2026-09-20T07:30:00+08:00", CrowdLevel: "h" },
    ] }] }] };
    const entries = parseCrowdForecast(data, "NEL", "2026-09-19");
    expect(entries).toHaveLength(2); expect(entries[0]).toMatchObject({ startTime: "07:30", endTime: "08:00", level: "unknown" });
    expect(entries[1].endTime).toBe("24:00");
    expect(parseCrowdForecast(data, "NEL", "2026-09-21")).toEqual([]);
    expect(parseCrowdForecast(data, "CCL", "2026-09-19")).toEqual([]);
  });
});
