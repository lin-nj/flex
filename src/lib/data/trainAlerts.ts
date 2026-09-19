import type { TrainServiceAlertsResponse } from "../domain/types";
import { buildTrainAlertsFixture, type ScenarioId } from "../../fixtures/trainAlerts";
import { fetchLta, record, textField } from "./lta";

// DataMall guide v6.9, section 2.11/Annex C: nested segments, independent
// messages, and an empty segment list for normal service.
export function parseTrainAlerts(data: unknown, fetchedAt: string): TrainServiceAlertsResponse {
  const value = record(record(data).value);
  const status = Number(value.Status);
  if ((status !== 1 && status !== 2) || !Array.isArray(value.AffectedSegments) || !Array.isArray(value.Message)) {
    throw new Error("Unexpected TrainServiceAlerts schema; service status is unknown.");
  }
  const optional = (v: unknown) => v == null ? undefined : textField(v).trim() || undefined;
  return {
    status,
    affectedSegments: value.AffectedSegments.map((item) => {
      const s = record(item);
      return {
        line: textField(s.Line), direction: textField(s.Direction),
        stations: textField(s.Stations).split(",").map((v) => v.trim()).filter(Boolean),
        freePublicBus: optional(s.FreePublicBus), freeMrtShuttle: optional(s.FreeMRTShuttle),
        mrtShuttleDirection: optional(s.MRTShuttleDirection),
      };
    }),
    messages: value.Message.map((item) => {
      const m = record(item);
      return { content: textField(m.Content), createdDate: textField(m.CreatedDate) };
    }),
    provenance: { mode: "live", source: "LTA DataMall TrainServiceAlerts", fetchedAt },
  };
}

export async function fetchTrainServiceAlerts(scenario: ScenarioId): Promise<TrainServiceAlertsResponse> {
  if (scenario !== "live") return buildTrainAlertsFixture(scenario);
  try {
    const snapshot = await fetchLta("TrainServiceAlerts");
    return parseTrainAlerts(snapshot.data, snapshot.fetchedAt);
  } catch (error) {
    return {
      status: null, affectedSegments: [], messages: [],
      provenance: { mode: "unavailable", source: "LTA DataMall TrainServiceAlerts", fetchedAt: new Date().toISOString(),
        note: error instanceof Error ? error.message : "Live train alerts unavailable." },
    };
  }
}
