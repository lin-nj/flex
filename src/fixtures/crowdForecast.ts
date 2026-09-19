// Labelled fixture standing in for LTA DataMall's PCDForecast endpoint
// (GET /ltaodataservice/PCDForecast?TrainLine=<code>), which needs a
// registered AccountKey for Live mode. This fixture is used only on explicit
// demo selection, even with a configured key. It is labelled synthetic and
// never used as a fallback for a failed Live request.
//
// Shape matches the real endpoint: per-station, 30-minute buckets, the
// four-value l/m/h/NA scale. Values are NOT invented per-minute — they stay
// at the documented 30-minute resolution the real feed publishes.
//
// The pattern below (interchange stations busier 08:00-09:00, easing either
// side) reflects well-known AM peak shape on Singapore's rail network. It is
// a representative demo shape, not a captured forecast — labelled
// accordingly wherever it is shown.

import type { CrowdForecastEntry, LineCode, RawCrowdLevel } from "../lib/domain/types";
import { mapRawCrowd } from "../lib/domain/crowdScale";

const BUCKETS = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"];

type Shape = RawCrowdLevel[]; // one entry per bucket above

// Busy interchange / trunk stations: builds to 'h' through the peak.
const BUSY: Shape = ["l", "m", "h", "h", "m", "l"];
// Moderate stations: builds to 'm', never quite peaks.
const MODERATE: Shape = ["l", "l", "m", "m", "l", "l"];
// Quiet outer stations.
const QUIET: Shape = ["l", "l", "l", "m", "l", "l"];
// Deliberately unknown for a couple of buckets — demonstrates that missing
// data must be shown as "unknown", never silently treated as low.
const PARTIAL_UNKNOWN: Shape = ["l", "NA", "NA", "m", "l", "l"];

const NEL: Record<string, Shape> = {
  NE17: MODERATE, // Punggol
  NE16: QUIET, // Sengkang
  NE15: QUIET, // Buangkok
  NE14: QUIET, // Hougang
  NE13: PARTIAL_UNKNOWN, // Kovan — modelling a real gap in forecast coverage
  NE12: BUSY, // Serangoon (interchange)
  NE11: QUIET, // Woodleigh
  NE10: QUIET, // Potong Pasir
  NE9: QUIET, // Boon Keng
  NE8: MODERATE, // Farrer Park
  NE7: MODERATE, // Little India (interchange)
  NE6: BUSY, // Dhoby Ghaut (interchange)
  NE5: QUIET, // Clarke Quay
  NE4: MODERATE, // Chinatown (interchange)
  NE3: BUSY, // Outram Park (interchange)
  NE1: BUSY, // HarbourFront (interchange)
};

const CCL: Record<string, Shape> = {
  CC29: BUSY, // HarbourFront
  CC28: QUIET, // Telok Blangah
  CC27: QUIET, // Labrador Park
  CC26: QUIET, // Pasir Panjang
  CC25: QUIET, // Haw Par Villa
  CC24: MODERATE, // Kent Ridge
  CC23: MODERATE, // one-north
  CC13: BUSY, // Serangoon
  CC14: QUIET, // Lorong Chuan
  CC15: BUSY, // Bishan (interchange)
  CC16: QUIET, // Marymount
  CC17: MODERATE, // Caldecott (interchange)
  CC19: MODERATE, // Botanic Gardens (interchange)
  CC20: QUIET, // Farrer Road
  CC21: MODERATE, // Holland Village
  CC22: BUSY, // Buona Vista (interchange)
};

function buildLine(line: LineCode, table: Record<string, Shape>): CrowdForecastEntry[] {
  const out: CrowdForecastEntry[] = [];
  for (const [station, shape] of Object.entries(table)) {
    for (let i = 0; i < BUCKETS.length - 1; i++) {
      out.push({
        station,
        startTime: BUCKETS[i],
        endTime: BUCKETS[i + 1],
        level: mapRawCrowd(shape[i]),
      });
    }
  }
  return out;
}

export function buildCrowdForecastFixture(line: LineCode): CrowdForecastEntry[] {
  if (line === "NEL") return buildLine("NEL", NEL);
  if (line === "CCL") return buildLine("CCL", CCL);
  return [];
}
