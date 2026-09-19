// Server-side adapter for data.gov.sg's real-time weather API. Unlike LTA
// DataMall, the 2-hour nowcast needs no key, so this one runs live by
// default — verified reachable during development (September 2026).
//
//   GET https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast
//   -> { data: { area_metadata: [{name, label_location}], items: [{ timestamp, forecasts: [{area, forecast}] }] } }
//
// "Punggol" and "Queenstown" (which covers one-north) are both named areas
// in this feed — used directly, no nearest-neighbour guessing needed.

import type { WeatherSnapshot } from "../domain/types";

const ENDPOINT = "https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast";

const WET_KEYWORDS = ["Rain", "Showers", "Thundery", "Drizzle"];

interface RawResponse {
  data: {
    items: { timestamp: string; valid_period: { end: string }; forecasts: { area: string; forecast: string }[] }[];
  };
}

async function fetchArea(area: string, fallbackNote?: string): Promise<WeatherSnapshot> {
  try {
    const res = await fetch(ENDPOINT, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
    const raw = (await res.json()) as RawResponse;
    const item = raw.data.items[0];
    const entry = item.forecasts.find((f) => f.area === area);
    const text = entry?.forecast ?? "Forecast unavailable for this area";
    return {
      forecastText: text,
      areaName: area,
      isWet: WET_KEYWORDS.some((w) => text.includes(w)),
      validUntil: item.valid_period.end,
      provenance: {
        mode: "live",
        source: "data.gov.sg two-hr-forecast",
        fetchedAt: item.timestamp,
        note: fallbackNote,
      },
    };
  } catch {
    return {
      forecastText: "Weather unavailable",
      areaName: area,
      isWet: false,
      validUntil: new Date(Date.now() + 2 * 3600_000).toISOString(),
      provenance: {
        mode: "unavailable",
        source: "data.gov.sg two-hr-forecast",
        fetchedAt: new Date().toISOString(),
        note: "Live weather unavailable; dry conditions are not verified.",
      },
    };
  }
}

export async function fetchWeatherFor(area: "Punggol" | "Queenstown"): Promise<WeatherSnapshot> {
  return fetchArea(area);
}
