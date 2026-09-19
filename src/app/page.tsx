"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import TripForm from "@/components/TripForm";
import RecommendationCard from "@/components/RecommendationCard";
import DepartureComparison from "@/components/DepartureComparison";
import RouteMap from "@/components/RouteMap";
import ScenarioPicker from "@/components/ScenarioPicker";
import OfflineBanner from "@/components/OfflineBanner";
import NoRouteCard from "@/components/NoRouteCard";
import SavedTripControls from "@/components/SavedTripControls";
import Disclosure from "@/components/Disclosure";
import DataAttribution from "@/components/DataAttribution";
import { buildDefaultTripRequest } from "@/lib/domain/defaultTrip";
import { ROUTE_OPTIONS } from "@/lib/domain/corridor";
import { assessDisruptionForRoute } from "@/lib/domain/disruptionMatch";
import { cachePlan, readCachedPlan, readSavedTrip, saveTrip, clearSavedTrip } from "@/lib/offline/cache";
import { subscribeToPush } from "@/lib/push/client";
import type { ScenarioId } from "@/fixtures/trainAlerts";
import type { AffectedSegment, CandidateEvaluation, PlanResult, TripRequest } from "@/lib/domain/types";

interface PlanApiResponse {
  result: PlanResult;
  alerts: { status: 1 | 2; messages: { content: string; createdDate: string }[]; affectedSegments: AffectedSegment[] };
  error?: string;
}

export default function Home() {
  const [request, setRequest] = useState<TripRequest>(() => buildDefaultTripRequest());
  const [scenario, setScenario] = useState<ScenarioId>("normal");
  const [simulateStale, setSimulateStale] = useState(false);
  const [data, setData] = useState<PlanApiResponse | null>(null);
  const [selected, setSelected] = useState<CandidateEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [lastReevaluatedAt, setLastReevaluatedAt] = useState<string | null>(null);
  const [changedNotice, setChangedNotice] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const lastRecommendedId = useRef<string | null>(null);

  const plan = useCallback(
    async (req: TripRequest, sc: ScenarioId, stale: boolean, { silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: req, scenario: sc, simulateStale: stale }),
        });
        const json: PlanApiResponse = await res.json();
        if (!res.ok) {
          if (!silent) setError(json.error ?? "Could not plan this trip.");
          return;
        }
        setData(json);
        if (json.result.recommended) {
          setSelected(json.result.recommended);
          cachePlan(json.result);
          setCachedAt(new Date().toISOString());

          if (silent && lastRecommendedId.current && lastRecommendedId.current !== json.result.recommended.id) {
            setChangedNotice(
              `Your recommendation changed: now leave at ${json.result.recommended.departureClock} instead. Conditions shifted since you saved this trip.`
            );
          }
          lastRecommendedId.current = json.result.recommended.id;
        }
        setLastReevaluatedAt(new Date().toISOString());
      } catch {
        if (!silent) setError("Network error while planning — check your connection.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  // Initial load: restore a saved trip if present, check connectivity, plan.
  // This runs once on mount to hydrate from browser-only storage (localStorage,
  // navigator.onLine) that isn't available during server rendering — a
  // deliberate, one-time exception to "don't setState in an effect".
  useEffect(() => {
    const saved = readSavedTrip();
    const initialReq = saved ?? request;
    if (saved) {
      // One-time hydration from localStorage on mount — not a reactive sync loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRequest(saved);
      setIsSaved(true);
    }
    setIsOnline(navigator.onLine);

    if (navigator.onLine) {
      plan(initialReq, "normal", false);
    } else {
      const cached = readCachedPlan();
      if (cached) {
        setData({ result: cached.result, alerts: { status: 1, messages: [], affectedSegments: [] } });
        setSelected(cached.result.recommended);
        setCachedAt(cached.cachedAt);
      }
    }

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved-trip reevaluation while the tab stays open. Disclosed limit: this
  // is a foreground timer, not real background push — see ExplanationPanel
  // and WRITEUP.md.
  useEffect(() => {
    if (!isSaved) return;
    const id = setInterval(() => {
      if (navigator.onLine) plan(request, scenario, simulateStale, { silent: true });
    }, 120_000);
    return () => clearInterval(id);
  }, [isSaved, request, scenario, simulateStale, plan]);

  const handlePlan = () => {
    setChangedNotice(null);
    plan(request, scenario, simulateStale);
  };

  const handleScenario = (s: ScenarioId) => {
    setScenario(s);
    plan(request, s, simulateStale);
  };
  const handleStale = (v: boolean) => {
    setSimulateStale(v);
    plan(request, scenario, v);
  };

  const handleSave = () => {
    saveTrip(request);
    setIsSaved(true);
  };
  const handleClearSaved = () => {
    clearSavedTrip();
    setIsSaved(false);
    setChangedNotice(null);
  };

  const handleTestPush = async () => {
    const sub = await subscribeToPush();
    if (!sub.ok) {
      setPushStatus(`Push unavailable: ${sub.error ?? "unknown"}`);
      return;
    }
    const res = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const json = await res.json();
    setPushStatus(res.ok ? `Sent to ${json.sent}/${json.total} subscriber(s).` : json.error);
  };

  const result = data?.result;
  const routeOption = selected ? ROUTE_OPTIONS.find((r) => r.id === selected.routeOptionId) : undefined;
  const disruptedStations = new Set<string>();
  if (routeOption && data?.alerts?.affectedSegments) {
    for (const seg of data.alerts.affectedSegments) {
      const impact = assessDisruptionForRoute(seg, routeOption);
      if (impact.relevant) impact.blockedStations.forEach((s) => disruptedStations.add(s));
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col pb-[max(3rem,env(safe-area-inset-bottom))]">
      <Header panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((v) => !v)} />

      {isOnline && panelOpen && (
        <ScenarioPicker
          scenario={scenario}
          onScenario={handleScenario}
          simulateStale={simulateStale}
          onStale={handleStale}
          onSendTestPush={handleTestPush}
          pushStatus={pushStatus}
        />
      )}

      {(!isOnline || error) && (
        <div className="flex flex-col gap-3 px-5 pt-4">
          {!isOnline && <OfflineBanner cachedAt={cachedAt} />}
          {error && (
            <div className="rounded-[14px] bg-danger-soft p-4 text-[15px] text-danger" role="alert">
              {error}
            </div>
          )}
        </div>
      )}

      {result?.noFeasibleRoute && (
        <div className="px-5 pt-4">
          <NoRouteCard limitingConstraint={result.limitingConstraint} />
        </div>
      )}

      {loading && !result && <p className="px-5 pt-8 text-[17px] text-text-muted">Planning your trip…</p>}

      {result?.recommended && selected && (
        <>
          <RecommendationCard candidate={result.recommended} explanation={result.explanation} />

          <RouteMap
            origin={request.origin}
            destination={request.destination}
            candidate={selected}
            disruptedStations={disruptedStations}
          />

          <div className="pt-7">
            <DepartureComparison
              recommended={result.recommended}
              alternatives={result.alternatives}
              selectedId={selected.id}
              onSelect={setSelected}
            />
          </div>

          <div className="mx-5 mt-7 overflow-hidden rounded-[14px] bg-surface">
            <Disclosure title="Trip settings">
              <TripForm request={request} onChange={setRequest} onSubmit={handlePlan} loading={loading} />
            </Disclosure>
          </div>

          <div className="px-5 pt-7">
            <SavedTripControls
              isSaved={isSaved}
              onSave={handleSave}
              onClear={handleClearSaved}
              lastReevaluatedAt={lastReevaluatedAt}
              changedNotice={changedNotice}
            />
          </div>

          <DataAttribution result={result} />
        </>
      )}
    </main>
  );
}
