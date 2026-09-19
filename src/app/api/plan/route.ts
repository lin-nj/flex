import { NextResponse } from "next/server";
import { planTrip } from "@/lib/domain/planTrip";
import { fetchTrainServiceAlerts } from "@/lib/data/trainAlerts";
import { fetchCrowdForecast } from "@/lib/data/crowding";
import { fetchWeatherFor } from "@/lib/data/weather";
import { walkLeg, cycleLeg, haversineKm } from "@/lib/data/osrm";
import { CORRIDOR_ORIGIN_STATION, CORRIDOR_DEST_STATION } from "@/lib/domain/defaultTrip";
import type { ScenarioId } from "@/fixtures/trainAlerts";
import type { CrowdForecastEntry, TripRequest } from "@/lib/domain/types";
import { isTripRequest } from "@/lib/domain/validateTrip";
import { DEMO_DATE, DEMO_REFERENCE, demoWeather } from "@/lib/domain/demo";

export const dynamic = "force-dynamic";

const MAX_ACCESS_KM = 6; // bounded-corridor disclosure threshold — see WRITEUP.md "Known limits"

interface PlanApiBody {
  request: TripRequest;
  scenario?: ScenarioId;
  simulateStale?: boolean;
}

export async function POST(req: Request) {
  let body: PlanApiBody;
  try {
    if (Number(req.headers.get("content-length")) > 8192) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    const input = await req.text();
    if (input.length > 8192) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    body = JSON.parse(input);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { request, scenario = "live", simulateStale = false } = body ?? {};
  if (!isTripRequest(request) || !["live", "normal", "planned-works", "disruption", "irrelevant-disruption"].includes(scenario) || typeof simulateStale !== "boolean") {
    return NextResponse.json({ error: "A valid trip, same-day Singapore time window, preferences and scenario are required." }, { status: 400 });
  }
  if (scenario !== "live" && request.date !== DEMO_DATE) {
    return NextResponse.json({ error: `Demo scenarios use ${DEMO_DATE} Singapore time. Select a demo in the app to load its separate example trip.` }, { status: 400 });
  }
  if (scenario === "live" && simulateStale) {
    return NextResponse.json({ error: "Stale-data simulation is available only in demo mode; Live observation times are preserved." }, { status: 400 });
  }

  const originGapKm = haversineKm(request.origin.coord, CORRIDOR_ORIGIN_STATION);
  const destGapKm = haversineKm(request.destination.coord, CORRIDOR_DEST_STATION);
  if (originGapKm > MAX_ACCESS_KM || destGapKm > MAX_ACCESS_KM) {
    return NextResponse.json(
      {
        error:
          "This demo only plans the Punggol ↔ one-north corridor (North East Line + Circle Line). Your origin or destination is too far from that corridor's access stations for this bounded demo to route honestly.",
        boundary: { originGapKm: Math.round(originGapKm * 10) / 10, destGapKm: Math.round(destGapKm * 10) / 10, maxKm: MAX_ACCESS_KM },
      },
      { status: 422 }
    );
  }

  const [alerts, nelCrowd, cclCrowd, weatherOrigin, weatherDest, originWalkLeg, originCycleLeg, destWalkLeg] =
    await Promise.all([
      fetchTrainServiceAlerts(scenario),
      fetchCrowdForecast("NEL", request.date, scenario !== "live"),
      fetchCrowdForecast("CCL", request.date, scenario !== "live"),
      scenario === "live" ? fetchWeatherFor("Punggol") : demoWeather("Punggol"),
      scenario === "live" ? fetchWeatherFor("Queenstown") : demoWeather("Queenstown"),
      walkLeg(request.origin.coord, CORRIDOR_ORIGIN_STATION, request.origin.label, "Punggol"),
      cycleLeg(request.origin.coord, CORRIDOR_ORIGIN_STATION, request.origin.label, "Punggol"),
      walkLeg(CORRIDOR_DEST_STATION, request.destination.coord, "one-north", request.destination.label),
    ]);

  const crowdByStation = new Map<string, CrowdForecastEntry[]>();
  for (const entry of [...nelCrowd.entries, ...cclCrowd.entries]) {
    const list = crowdByStation.get(entry.station) ?? [];
    list.push(entry);
    crowdByStation.set(entry.station, list);
  }

  if (simulateStale) {
    const staleTime = new Date(Date.parse(DEMO_REFERENCE) - 3 * 3600_000).toISOString();
    alerts.provenance.fetchedAt = staleTime;
    alerts.provenance.note = (alerts.provenance.note ? alerts.provenance.note + " " : "") + "Simulated stale cache for demo purposes.";
  }

  const result = planTrip(request, {
    affectedSegments: alerts.affectedSegments,
    crowdByStation,
    weatherOrigin,
    weatherDestination: weatherDest,
    originWalkLeg,
    originCycleLeg,
    destWalkLeg,
    provenance: {
      alerts: alerts.provenance,
      crowdForecast: {
        mode: nelCrowd.provenance.mode === "unavailable" || cclCrowd.provenance.mode === "unavailable" ? "unavailable" : nelCrowd.provenance.mode,
        source: scenario === "live" ? "LTA DataMall PCDForecast (NEL + CCL)" : "Constructed NEL + CCL crowd forecasts",
        fetchedAt: [nelCrowd.provenance.fetchedAt, cclCrowd.provenance.fetchedAt].sort()[0],
        note: `NEL: ${nelCrowd.provenance.note ?? nelCrowd.provenance.mode} CCL: ${cclCrowd.provenance.note ?? cclCrowd.provenance.mode}`,
      },
      weather: weatherOrigin.provenance,
    },
  });

  if (scenario !== "live") result.simulation = { referenceTime: DEMO_REFERENCE, stale: simulateStale };

  return NextResponse.json({
    scenario,
    result,
    alerts: { status: alerts.status, messages: alerts.messages, affectedSegments: alerts.affectedSegments, provenance: alerts.provenance },
    weather: { origin: weatherOrigin, destination: weatherDest },
  }, { headers: { "Cache-Control": "no-store" } });
}
