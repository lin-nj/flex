// Server-side adapter for LTA DataMall's TrainServiceAlerts.
//
// GET https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts
// Header: AccountKey: <key>
//
// Response shape per PS2_README.md 2.4 / LTA_DataMall_API_User_Guide.pdf:
//   { Status: 1|2, AffectedSegments: [...], Message: [...] }
// AffectedSegments and Message are BOTH lists, and AffectedSegments detail
// (Line, Direction, Stations, FreePublicBus, FreeMRTShuttle,
// MRTShuttleDirection) is nested one level in, not flat on the response.
//
// This module never fabricates a live fetch: if LTA_ACCOUNT_KEY is unset or
// the call fails, it returns the labelled synthetic fixture untouched, with
// the failure reason attached so the caller can surface it honestly.

import type { AffectedSegment, TrainServiceAlertsResponse } from "../domain/types";
import { buildTrainAlertsFixture, type ScenarioId } from "../../fixtures/trainAlerts";

const ENDPOINT = "https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts";

interface RawAffectedSegment {
  Line: string;
  Direction: string;
  Stations: string;
  FreePublicBus?: string;
  FreeMRTShuttle?: string;
  MRTShuttleDirection?: string;
}
interface RawMessage {
  Content: string;
  CreatedDate: string;
}
interface RawResponse {
  // OData envelope key is lowercase `value` on the wire, despite the capitalised
  // field names nested inside it. Verified against the live endpoint.
  value: {
    Status: 1 | 2;
    AffectedSegments: RawAffectedSegment[];
    Message: RawMessage[];
  };
}

/** DataMall reports quota exhaustion as a 500 with a fault body, which is worth
 *  distinguishing from a genuine outage when the reason is shown to the user. */
async function describeFailure(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { fault?: { faultstring?: string; detail?: { errorcode?: string } } };
    const fault = body.fault?.faultstring;
    if (body.fault?.detail?.errorcode === "policies.ratelimit.QuotaViolation") {
      return "LTA DataMall rate limit reached for this AccountKey";
    }
    if (fault) return `TrainServiceAlerts: ${fault}`;
  } catch {
    /* fall through to the bare status */
  }
  return `TrainServiceAlerts HTTP ${res.status}`;
}

function parseSegment(raw: RawAffectedSegment): AffectedSegment {
  return {
    line: raw.Line,
    direction: raw.Direction,
    stations: raw.Stations.split(",").map((s) => s.trim()).filter(Boolean),
    freePublicBus: raw.FreePublicBus,
    freeMrtShuttle: raw.FreeMRTShuttle,
    mrtShuttleDirection: raw.MRTShuttleDirection,
  };
}

export async function fetchTrainServiceAlerts(
  fallbackScenario: ScenarioId
): Promise<TrainServiceAlertsResponse> {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) {
    return buildTrainAlertsFixture(fallbackScenario);
  }
  try {
    const res = await fetch(ENDPOINT, {
      headers: { AccountKey: key, Accept: "application/json" },
      // TrainServiceAlerts changes ad hoc, but DataMall enforces a per-key
      // quota and this endpoint is hit on every plan request — including the
      // saved-trip re-check timer. Uncached, an ordinary demo session exhausts
      // the quota and every alert silently degrades to a fixture. 60s is still
      // well inside "real time" for a commuter deciding when to leave.
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(await describeFailure(res));
    const raw = (await res.json()) as RawResponse;
    if (!raw.value) throw new Error("TrainServiceAlerts response had no `value` envelope");
    return {
      status: raw.value.Status,
      affectedSegments: (raw.value.AffectedSegments ?? []).map(parseSegment),
      messages: (raw.value.Message ?? []).map((m) => ({ content: m.Content, createdDate: m.CreatedDate })),
      provenance: {
        mode: "live",
        source: "LTA DataMall TrainServiceAlerts",
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    const fixture = buildTrainAlertsFixture(fallbackScenario);
    return {
      ...fixture,
      provenance: {
        ...fixture.provenance,
        note: `Live TrainServiceAlerts call failed (${(err as Error).message}); showing labelled fixture instead.`,
      },
    };
  }
}
