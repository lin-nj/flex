import type { CrowdForecastEntry, CrowdForecastResponse, LineCode, RawCrowdLevel } from "../domain/types";
import { buildCrowdForecastFixture } from "../../fixtures/crowdForecast";
import { mapRawCrowd } from "../domain/crowdScale";
import { fetchLta, record, textField } from "./lta";
import { DEMO_DATE, DEMO_OBSERVED } from "../domain/demo";

function singaporeDate(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

// Guide v6.9 section 2.25: nested Date/Stations/Interval; Start spans 30 min.
// Match the requested Singapore date, never a different day's HH:mm.
export function parseCrowdForecast(data: unknown, line: LineCode, date: string): CrowdForecastEntry[] {
  const days = record(data).value;
  if (!Array.isArray(days)) throw new Error("Unexpected PCDForecast schema.");
  const entries: CrowdForecastEntry[] = [];
  const prefix = line === "NEL" ? /^NE\d+$/ : /^CC\d+$/;
  for (const item of days) {
    const day = record(item);
    if (!Array.isArray(day.Stations)) throw new Error("Unexpected PCDForecast station list.");
    for (const item of day.Stations) {
      const station = record(item);
      const code = textField(station.Station);
      if (!prefix.test(code)) continue;
      if (!Array.isArray(station.Interval)) throw new Error("Unexpected PCDForecast interval list.");
      for (const item of station.Interval) {
        const interval = record(item);
        const iso = textField(interval.Start);
        if (!/(Z|[+-]\d{2}:\d{2})$/.test(iso)) throw new Error("PCDForecast timestamp has no timezone.");
        const start = new Date(iso);
        if (!Number.isFinite(start.getTime())) throw new Error("Invalid PCDForecast timestamp.");
        if (singaporeDate(start) !== date) continue;
        const clock = start.toLocaleTimeString("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false });
        const [h, m] = clock.split(":").map(Number);
        const end = h * 60 + m + 30;
        entries.push({ station: code, startTime: clock,
          endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
          level: mapRawCrowd(interval.CrowdLevel as RawCrowdLevel) });
      }
    }
  }
  return entries;
}

export async function fetchCrowdForecast(line: "NEL" | "CCL", date: string, demo = false): Promise<CrowdForecastResponse> {
  if (demo) return {
    line, entries: date === DEMO_DATE ? buildCrowdForecastFixture(line) : [],
    provenance: { mode: "synthetic", source: `${line} crowd forecast: constructed demo`, fetchedAt: DEMO_OBSERVED, note: `Synthetic ${DEMO_DATE} 07:00–09:30 Singapore pattern; missing intervals stay unknown.` },
  };
  try {
    const snapshot = await fetchLta(`PCDForecast?TrainLine=${line}`);
    const entries = parseCrowdForecast(snapshot.data, line, date);
    return { line, entries, provenance: { mode: "live", source: `LTA DataMall PCDForecast (${line})`, fetchedAt: snapshot.fetchedAt,
      note: entries.length ? `Forecast intervals for ${date} Singapore time; gaps are unknown.` : `No forecast coverage for ${date}; crowd levels are unknown.` } };
  } catch (error) {
    return { line, entries: [], provenance: {
      mode: "unavailable", source: `LTA DataMall PCDForecast (${line})`, fetchedAt: new Date().toISOString(),
      note: error instanceof Error ? error.message : "Live crowd forecast unavailable.",
    } };
  }
}
