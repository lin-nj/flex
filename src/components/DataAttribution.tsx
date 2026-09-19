import type { PlanResult } from "@/lib/domain/types";
import { minutesSince, STALE_THRESHOLD_MINUTES } from "@/lib/offline/cache";

export default function DataAttribution({ result }: { result: PlanResult }) {
  const p = result.conditionsProvenance;
  const sources = [
    { label: "Train alerts", p: p.alerts, threshold: STALE_THRESHOLD_MINUTES.alerts },
    { label: "Crowd forecast", p: p.crowdForecast, threshold: STALE_THRESHOLD_MINUTES.crowdForecast },
    { label: "Weather", p: p.weather, threshold: STALE_THRESHOLD_MINUTES.weather },
  ];
  const estimated = result.recommended?.legs.some((leg) => leg.kind !== "rail" && !leg.geometry);
  return (
    <section className="px-5 pb-2 pt-9 text-[13px] leading-relaxed text-text-muted" aria-label="Data sources and limitations">
      {sources.map(({ label, p, threshold }) => {
        const age = Math.max(0, Math.round(result.simulation
          ? (Date.parse(result.simulation.referenceTime) - Date.parse(p.fetchedAt)) / 60000
          : minutesSince(p.fetchedAt)));
        const stale = age > threshold;
        return <p key={label} className={stale || p.mode === "unavailable" ? "text-warn" : ""}>
          {label}: {p.mode === "synthetic" ? "demo sample" : p.mode}. {stale ? "Stale — " : ""}{age} min since observation/attempt{result.simulation ? " at the simulation clock" : ""}. {p.note}
        </p>;
      })}
      <p className="mt-2">Rail geometry is schematic. Rail timing assumes 2.3 min per segment, 2–3 min initial wait and 3–4 min transfers; shuttle mitigation adds an assumed 15 min. Arrival times are estimates, not guarantees.</p>
      {estimated && <p className="text-warn">Walking/cycling routing unavailable for at least one leg: straight-line timing estimate only; no routed path is shown for that leg.</p>}
      <p className="mt-2">Map and walking/cycling routes © OpenStreetMap contributors. Only Punggol → one-north via NEL/CCL is modelled; no bus or island-wide routing.</p>
    </section>
  );
}
