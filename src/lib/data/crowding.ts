// Server-side adapter for LTA DataMall's Station Crowd Density endpoints.
//
//   GET /ltaodataservice/PCDForecast?TrainLine=<code>   — 30-min buckets, 24h ahead
//   GET /ltaodataservice/PCDRealTime?TrainLine=<code>   — refreshed every 10 min
//
// PCDForecast nests two levels deep inside the OData envelope, and publishes
// only an interval START — there is no EndTime field:
//   { value: [ { Date, Stations: [ { Station, Interval: [ { Start, CrowdLevel } ] } ] } ] }
// Verified against the live endpoint. CrowdLevel is in {l, m, h, NA}; NA must
// surface as "unknown", never as "low" — see src/lib/domain/crowdScale.ts.
//
// Falls back to the labelled fixture (src/fixtures/crowdForecast.ts) when no
// AccountKey is configured or the live call fails.

import type { CrowdForecastEntry, CrowdForecastResponse, LineCode, RawCrowdLevel } from "../domain/types";
import { buildCrowdForecastFixture } from "../../fixtures/crowdForecast";
import { mapRawCrowd } from "../domain/crowdScale";
import { CANONICAL_LINES } from "../domain/corridor";

function pcdCodeFor(line: LineCode): string | null {
  return CANONICAL_LINES.find((l) => l.canonical === line)?.pcdCode ?? null;
}

interface RawPcdInterval {
  Start: string;
  CrowdLevel: RawCrowdLevel;
}
interface RawPcdStation {
  Station: string;
  Interval: RawPcdInterval[];
}
interface RawPcdDay {
  Date: string;
  Stations: RawPcdStation[];
}
interface RawPcdResponse {
  value: RawPcdDay[];
}

/** The feed's documented bucket length. Used only to derive the end of a
 *  bucket the API states implicitly — not to interpolate finer than 30 min. */
const BUCKET_MINUTES = 30;

function toHHmm(iso: string): string {
  // LTA returns full timestamps for PCDForecast; keep just HH:mm for display/matching.
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : iso;
}

function bucketEnd(startHHmm: string): string {
  const [h, m] = startHHmm.split(":").map(Number);
  const end = h * 60 + m + BUCKET_MINUTES;
  // The last bucket of the day ends at midnight. Express that as 24:00 rather
  // than 00:00 so the half-open [start, end) match in scoring.ts doesn't wrap
  // to zero and silently drop the bucket.
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export async function fetchCrowdForecast(line: LineCode): Promise<CrowdForecastResponse> {
  const key = process.env.LTA_ACCOUNT_KEY;
  const pcdCode = pcdCodeFor(line);
  if (!key || !pcdCode) {
    return {
      line,
      entries: buildCrowdForecastFixture(line),
      provenance: {
        mode: "synthetic",
        source: "PCDForecast (constructed fixture, matches real schema)",
        fetchedAt: new Date().toISOString(),
        note: !key ? "LTA_ACCOUNT_KEY not configured." : undefined,
      },
    };
  }
  try {
    const res = await fetch(
      `https://datamall2.mytransport.sg/ltaodataservice/PCDForecast?TrainLine=${pcdCode}`,
      { headers: { AccountKey: key, Accept: "application/json" }, next: { revalidate: 21600 } } // 24h feed; cache 6h
    );
    if (!res.ok) throw new Error(`PCDForecast HTTP ${res.status}`);
    const raw = (await res.json()) as RawPcdResponse;

    // The 24h horizon can span two calendar dates. Buckets are matched on HH:mm
    // alone downstream, so keep a single day — otherwise tomorrow's 07:00 would
    // shadow today's depending on array order.
    const days = raw.value ?? [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const day = days.find((d) => d.Date?.startsWith(today)) ?? days[0];

    const entries: CrowdForecastEntry[] = (day?.Stations ?? []).flatMap((station) =>
      (station.Interval ?? []).map((interval) => {
        const startTime = toHHmm(interval.Start);
        return {
          station: station.Station,
          startTime,
          endTime: bucketEnd(startTime),
          level: mapRawCrowd(interval.CrowdLevel),
        };
      })
    );
    // An empty parse means the shape moved under us. Fail into the labelled
    // fixture rather than reporting zero entries as `mode: "live"`.
    if (entries.length === 0) throw new Error("PCDForecast returned no station intervals");
    return {
      line,
      entries,
      provenance: { mode: "live", source: "LTA DataMall PCDForecast", fetchedAt: new Date().toISOString() },
    };
  } catch (err) {
    return {
      line,
      entries: buildCrowdForecastFixture(line),
      provenance: {
        mode: "synthetic",
        source: "PCDForecast (constructed fixture, matches real schema)",
        fetchedAt: new Date().toISOString(),
        note: `Live PCDForecast call failed (${(err as Error).message}); showing labelled fixture instead.`,
      },
    };
  }
}
