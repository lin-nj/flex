"use client";

import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import type { CandidateEvaluation, GeoPoint } from "@/lib/domain/types";
import { stationByCode } from "@/lib/domain/corridor";

// Tile source. CARTO's free basemap tiles (basemaps.cartocdn.com) were
// tried first and rejected during development: as of September 2026 they
// render an "API KEY REQUIRED" watermark baked into the tile image itself
// even on a 200 response — confirmed by fetching and inspecting actual tile
// bytes, not just the HTTP status. Falling back to OSMF's own tile server
// (tile.openstreetmap.org) instead. PS2_README.md 2.3 asks demo apps not to
// send it heavy/bulk traffic; this app issues only the ordinary tile
// requests one Leaflet map view generates for a single journey, well within
// that. For real production traffic this should move to a paid provider or
// a self-hosted tile server — noted in WRITEUP.md "Known limits".
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const originIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#0f6e5b;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.2)"></div>',
  iconSize: [14, 14],
});
const destIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:2px;background:#161b19;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.2)"></div>',
  iconSize: [14, 14],
});

const LINE_COLOR: Record<string, string> = { NEL: "#9900aa", CCL: "#fa9e0d" };

function toLatLng([lon, lat]: [number, number]): [number, number] {
  return [lat, lon];
}

// react-leaflet's <MapContainer center/zoom> props are only the INITIAL
// view — they don't reactively re-frame the map when the selected route
// changes later, which silently left an alternative route's differing leg
// off-screen (found by exercising the app: selecting "Another route"
// visually changed nothing because its Circle Line tail runs southwest of
// Punggol, outside the view the map opened with). This fits the view to
// whatever the current candidate actually covers, every time it changes.
function FitToRoute({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], animate: false });
  }, [map, points]);
  return null;
}

export default function RouteMapInner({
  origin,
  destination,
  candidate,
  disruptedStations,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  candidate: CandidateEvaluation;
  disruptedStations: Set<string>;
}) {
  const railLeg = candidate.legs.find((l) => l.kind === "rail");
  const originLeg = candidate.legs.find((l) => l.kind === "walk" || l.kind === "cycle");
  const destLeg = candidate.legs[candidate.legs.length - 1];

  const stationPoints = useMemo(
    () => (railLeg?.stations ?? []).map((code) => ({ code, station: stationByCode(code) })).filter((s) => s.station),
    [railLeg]
  );

  const railPolyline = stationPoints.map((s) => toLatLng(s.station!.coord));
  const center = toLatLng(origin.coord);

  const fitPoints = useMemo(
    () => [toLatLng(origin.coord), toLatLng(destination.coord), ...railPolyline],
    [origin.coord, destination.coord, railPolyline]
  );

  return (
    <MapContainer center={center} zoom={12} zoomAnimation={false} scrollWheelZoom={false} className="h-full w-full" attributionControl={true}>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <FitToRoute points={fitPoints} />

      <Marker position={toLatLng(origin.coord)} icon={originIcon}>
        <Tooltip permanent direction="top" offset={[0, -8]} className="!text-xs">
          {origin.label}
        </Tooltip>
      </Marker>
      <Marker position={toLatLng(destination.coord)} icon={destIcon}>
        <Tooltip permanent direction="top" offset={[0, -8]} className="!text-xs">
          {destination.label}
        </Tooltip>
      </Marker>

      {originLeg?.geometry && (
        <Polyline
          positions={originLeg.geometry.map(toLatLng)}
          pathOptions={{ color: "#0f6e5b", weight: 4, dashArray: originLeg.kind === "cycle" ? "1 8" : "1 10", lineCap: "round" }}
        />
      )}
      {destLeg?.geometry && (
        <Polyline positions={destLeg.geometry.map(toLatLng)} pathOptions={{ color: "#0f6e5b", weight: 4, dashArray: "1 10", lineCap: "round" }} />
      )}

      {/* Schematic rail polyline through real station coordinates — not a live GTFS shape, disclosed in the source panel. */}
      {railPolyline.length > 1 && (
        <Polyline positions={railPolyline} pathOptions={{ color: LINE_COLOR[stationPoints[0]?.station?.line ?? "NEL"], weight: 5, opacity: 0.85 }} />
      )}

      {stationPoints.map(({ code, station }) => {
        const disrupted = disruptedStations.has(code);
        return (
          <CircleMarker
            key={code}
            center={toLatLng(station!.coord)}
            radius={station!.interchange ? 6 : 4}
            pathOptions={{
              color: disrupted ? "#b3261e" : "#ffffff",
              weight: 2,
              fillColor: disrupted ? "#b3261e" : LINE_COLOR[station!.line],
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" className="!text-xs">
              {station!.name} ({code}){disrupted ? " — disruption" : ""}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
