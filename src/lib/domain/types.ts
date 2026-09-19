// Core domain types for Flex — kept free of any UI or fetch concerns so the
// recommendation logic can be unit-tested and audited independently of
// presentation (PS2 rubric 3.2: "keep recommendation logic separate from
// presentation").

export type CrowdLevel = "low" | "moderate" | "high" | "unknown";

/** Raw LTA PCD scale: l / m / h / NA. Mapped to CrowdLevel at the adapter boundary. */
export type RawCrowdLevel = "l" | "m" | "h" | "NA";

export type LineCode =
  | "NEL" // North East Line — TrainServiceAlerts code
  | "CCL" // Circle Line — TrainServiceAlerts code
  | "PTL" // Punggol LRT — TrainServiceAlerts code
  | "NSL"
  | "EWL"
  | "DTL"
  | "TEL";

/** The line-code translation trap called out in PS2_README.md 2.4: the same
 * physical line carries different codes in TrainServiceAlerts vs the Station
 * Crowd Density (PCD) endpoints. One canonical table, everything joins through it. */
export interface CanonicalLine {
  canonical: LineCode;
  name: string;
  trainServiceAlertsCode: string;
  pcdCode: string | null; // null where PCD does not cover the line
}

export type AccessMode = "walk" | "cycle_park" | "cycle_carry_folding";
export type TransitMode = "rail";

export interface Station {
  /** Station code as used in PCDRealTime/PCDForecast, e.g. "NE17", "CC23". Used as the graph key. */
  code: string;
  name: string;
  /** [lon, lat] — WGS84, matching the provided AmendmenttoMP2014RailStation.geojson convention. */
  coord: [number, number];
  line: LineCode;
  interchange?: LineCode[];
}

export interface CorridorSegment {
  from: string; // Station.code
  to: string; // Station.code
  line: LineCode;
}

export interface RouteOption {
  id: string;
  label: string;
  /** Ordered station codes, origin access point to destination access point. */
  stations: string[];
  segments: CorridorSegment[];
  interchanges: { at: string; fromLine: LineCode; toLine: LineCode; walkMinutes: number }[];
  /** One-line, honest description of why this route exists as an alternative. */
  description: string;
}

export interface GeoPoint {
  label: string;
  coord: [number, number]; // [lon, lat]
}

export interface TripPreferences {
  /** 0 = pure speed, 1 = pure comfort/predictability. Arjun's default sits high. */
  comfortWeight: number;
  walkToleranceMinutes: number;
  cycleToleranceMinutes: number;
  allowCycleAndPark: boolean;
  allowFoldingBikeCarry: boolean;
}

export interface TripRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  date: string; // YYYY-MM-DD
  earliestDeparture: string; // HH:mm
  latestArrival: string; // HH:mm
  preferences: TripPreferences;
}

export type DataSourceMode = "live" | "replay" | "synthetic" | "unavailable";

export interface Provenance {
  mode: DataSourceMode;
  source: string;
  fetchedAt: string; // ISO timestamp
  note?: string;
}

export interface AffectedSegment {
  line: string; // as given by TrainServiceAlerts, e.g. "CCL"
  direction: string; // "Both" or "(towards X)"
  stations: string[]; // station codes, TrainServiceAlerts convention
  freePublicBus?: string;
  freeMrtShuttle?: string;
  mrtShuttleDirection?: string;
}

export interface TrainServiceAlertsResponse {
  status: 1 | 2 | null;
  affectedSegments: AffectedSegment[];
  messages: { content: string; createdDate: string }[];
  provenance: Provenance;
}

export interface CrowdForecastEntry {
  station: string; // PCD station code
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  level: CrowdLevel;
}

export interface CrowdForecastResponse {
  line: LineCode;
  entries: CrowdForecastEntry[];
  provenance: Provenance;
}

export interface WeatherSnapshot {
  forecastText: string;
  areaName: string;
  isWet: boolean;
  validUntil: string; // ISO
  provenance: Provenance;
}

export interface RouteLeg {
  kind: "walk" | "cycle" | "rail";
  fromLabel: string;
  toLabel: string;
  distanceMeters?: number;
  durationMinutesRange: [number, number];
  /** [lon, lat][] real routed geometry (OSRM) for walk/cycle legs. Absent for schematic rail legs. */
  geometry?: [number, number][];
  line?: LineCode;
  stations?: string[];
}

export interface StationCrowdEstimate {
  stationCode: string;
  estimatedArrivalClock: string; // HH:mm, when Arjun is expected to be there
  level: CrowdLevel;
  bucketSource: string; // e.g. "07:30-08:00"
}

export interface CandidateEvaluation {
  id: string;
  departureClock: string; // HH:mm
  routeOptionId: string;
  accessMode: AccessMode;
  legs: RouteLeg[];
  arrivalRange: [string, string]; // HH:mm, HH:mm
  totalDurationRange: [number, number]; // minutes
  transfers: number;
  walkingExposureMinutes: number;
  cyclingMinutes: number;
  crowdEstimates: StationCrowdEstimate[];
  worstCrowd: CrowdLevel;
  disruptionPenalty: number;
  predictabilityScore: number; // 0-1, higher = more predictable
  score: number; // final weighted score, lower is better
  feasible: boolean;
  infeasibleReason?: string;
  affectedByDisruption: boolean;
  mitigations: string[];
  weatherFlag?: string;
}

export interface PlanResult {
  simulation?: { referenceTime: string; stale: boolean };
  request: TripRequest;
  recommended: CandidateEvaluation | null;
  alternatives: CandidateEvaluation[];
  allCandidates: CandidateEvaluation[];
  explanation: string;
  noFeasibleRoute: boolean;
  limitingConstraint?: string;
  generatedAt: string;
  conditionsProvenance: {
    alerts: Provenance;
    crowdForecast: Provenance;
    weather: Provenance;
  };
}
