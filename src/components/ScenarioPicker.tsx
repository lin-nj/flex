"use client";

import type { ScenarioId } from "@/fixtures/trainAlerts";

const SCENARIOS: { id: ScenarioId; label: string; hint: string }[] = [
  { id: "live", label: "Live conditions", hint: "Current LTA feeds; unavailable data stays unknown." },
  { id: "normal", label: "Normal day", hint: "No disruption. Ordinary AM peak crowd forecast." },
  { id: "planned-works", label: "Planned works", hint: "Advance notice of a weekend maintenance closure." },
  { id: "disruption", label: "Unplanned disruption", hint: "CCL HarbourFront–Kent Ridge down, shuttle + free bus active." },
  { id: "irrelevant-disruption", label: "Irrelevant disruption", hint: "NSL incident, nowhere near this corridor — should NOT change the plan." },
];

export default function ScenarioPicker({
  scenario,
  onScenario,
  simulateStale,
  onStale,
  onSendTestPush,
  pushStatus,
}: {
  scenario: ScenarioId;
  onScenario: (s: ScenarioId) => void;
  simulateStale: boolean;
  onStale: (v: boolean) => void;
  onSendTestPush: () => void;
  pushStatus: string | null;
}) {
  return (
    <section className="border-b border-border bg-muted-fill px-5 py-4" aria-label="Scenario controls">
      <p className="mb-3 text-[13px] text-text-muted">
        Demos load a separate example trip: 21 Sep 2026, 07:15–09:00 Singapore time, with a fixed 07:15 simulation clock. Returning to Live restores your trip. Demo crowd coverage: 07:00–09:30.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            aria-pressed={scenario === s.id}
            onClick={() => onScenario(s.id)}
            className={`rounded-[10px] px-3 py-2.5 text-left text-[15px] ${
              scenario === s.id ? "bg-accent font-semibold text-accent-contrast" : "bg-surface text-text"
            }`}
            title={s.hint}
          >
            {s.label}
          </button>
        ))}
      </div>

      <label className="mt-3 flex items-center gap-2.5 text-[15px]">
        <input type="checkbox" disabled={scenario === "live"} checked={simulateStale} onChange={(e) => onStale(e.target.checked)} className="h-4 w-4" />
        Simulate a 3-hour-old cached feed (demo modes only)
      </label>

      <div className="mt-3 flex items-center gap-2">
        <button disabled={process.env.NODE_ENV === "production"} onClick={onSendTestPush} className="rounded-[10px] bg-surface px-3.5 py-2.5 text-[15px] font-semibold disabled:opacity-50">
          Send test notification
        </button>
        {pushStatus && <span className="text-[13px] text-text-muted">{pushStatus}</span>}
      </div>
      <p className="mt-2 text-[13px] text-text-muted">Background notifications are disabled on the hosted demo. Saved trips re-check only while this tab is open.</p>
    </section>
  );
}
