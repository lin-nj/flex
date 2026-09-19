import type { PlanResult } from "@/lib/domain/types";
import { minutesSince } from "@/lib/offline/cache";

/**
 * One line, no panel. It still has to distinguish live conditions from sample
 * data — presenting a fixture as though it were live is the one thing this app
 * promises not to do — but that fits in a sentence rather than a disclosure.
 */
export default function DataAttribution({ result }: { result: PlanResult }) {
  const p = result.conditionsProvenance;
  const sources = [
    { label: "Train alerts", p: p.alerts },
    { label: "crowd levels", p: p.crowdForecast },
    { label: "weather", p: p.weather },
  ];
  const sampled = sources.filter((s) => s.p.mode !== "live");
  const freshestMin = Math.round(Math.min(...sources.map((s) => minutesSince(s.p.fetchedAt))));

  return (
    <p className="px-5 pb-2 pt-9 text-[13px] leading-relaxed text-text-muted">
      {sampled.length === 0 ? (
        <>Live from LTA DataMall and data.gov.sg, updated {freshestMin} min ago.</>
      ) : (
        <>
          {sampled.map((s) => s.label).join(" and ")} unavailable — showing sample data.
          {sampled.length < sources.length && <> Everything else live from LTA DataMall and data.gov.sg.</>}
        </>
      )}{" "}
      Map © OpenStreetMap contributors.
    </p>
  );
}
