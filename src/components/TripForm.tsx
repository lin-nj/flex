"use client";

import type { TripRequest } from "@/lib/domain/types";

export default function TripForm({
  request,
  onChange,
  onSubmit,
  loading,
}: {
  request: TripRequest;
  onChange: (r: TripRequest) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof TripRequest>(key: K, value: TripRequest[K]) => onChange({ ...request, [key]: value });
  const setPref = <K extends keyof TripRequest["preferences"]>(key: K, value: TripRequest["preferences"][K]) =>
    onChange({ ...request, preferences: { ...request.preferences, [key]: value } });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="rounded-xl bg-bg p-3 text-sm">
        <div className="font-semibold">{request.origin.label}</div>
        <div className="my-0.5 text-text-muted">↓ Punggol ↔ one-north corridor (North East Line + Circle Line)</div>
        <div className="font-semibold">{request.destination.label}</div>
        <p className="mt-1.5 text-xs text-text-muted">
          This demo plans Punggol → one-north only. Origin/destination editing and reverse trips are not supported.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Earliest departure</span>
          <input
            type="time"
            value={request.earliestDeparture}
            onChange={(e) => set("earliestDeparture", e.target.value)}
            className="rounded-lg border border-border bg-surface p-2.5 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Latest arrival</span>
          <input
            type="time"
            value={request.latestArrival}
            onChange={(e) => set("latestArrival", e.target.value)}
            className="rounded-lg border border-border bg-surface p-2.5 text-base"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">
          Priority: {request.preferences.comfortWeight >= 0.5 ? "comfort & predictability" : "speed"}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={request.preferences.comfortWeight}
          onChange={(e) => setPref("comfortWeight", Number(e.target.value))}
          className="w-full accent-accent"
          aria-label="Priority: speed vs comfort"
        />
        <div className="flex justify-between text-xs text-text-muted">
          <span>Fastest</span>
          <span>Most predictable</span>
        </div>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Walk tolerance (min)</span>
          <input
            type="number"
            min={2}
            max={40}
            value={request.preferences.walkToleranceMinutes}
            onChange={(e) => setPref("walkToleranceMinutes", Number(e.target.value))}
            className="rounded-lg border border-border bg-surface p-2.5 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Cycle tolerance (min)</span>
          <input
            type="number"
            min={2}
            max={40}
            value={request.preferences.cycleToleranceMinutes}
            onChange={(e) => setPref("cycleToleranceMinutes", Number(e.target.value))}
            className="rounded-lg border border-border bg-surface p-2.5 text-base"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <span className="text-sm font-semibold">Cycling</span>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={request.preferences.allowCycleAndPark}
            onChange={(e) => setPref("allowCycleAndPark", e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
          Cycle to Punggol and park (leave the bike there)
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={request.preferences.allowFoldingBikeCarry}
            onChange={(e) => setPref("allowFoldingBikeCarry", e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
          I have a folding bike (≤120×70×40cm folded) to carry aboard
        </label>
        <p className="text-xs text-text-muted">
          Standard (non-folding) bicycles aren&apos;t carried on trains or buses — see the source panel for the rule
          and citation.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-contrast disabled:opacity-60"
      >
        {loading ? "Planning…" : "Plan my trip"}
      </button>
    </form>
  );
}
