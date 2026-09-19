# Flex — Write-up

**Problem Statement 2: Smart Commuter Companion.** Team submission, built around persona **2 — Arjun, the flexible-start, multi-modal commuter** (PS2_README.md §2.2). We did not build for Rachel or Mdm Lim; Arjun's needs (crowding, sheltered/short walking exposure, cycling and bike handling, a ~1-hour flexible departure window) shaped every decision below.

The app lives at the **repository root** — a Next.js/TypeScript/Leaflet web app. See `README.md` for setup, run instructions and the first journey to try.

## 1. The product insight

A generic route planner tells you the shortest path. Arjun doesn't need that — he already knows several ways to get from Punggol to one-north. What he needs is a decision: **leave now, leave later, or take another route**, made *for* his actual constraints (a flexible start, a preference for predictability over raw speed, real bike-carriage rules), and made visibly — with the trade-off he's accepting shown, not asserted.

Flex's one demonstration, end to end: given the same origin, destination and arrival deadline, injecting a disruption on Arjun's usual route changes the recommendation — to a different departure time, a different route, or both — and says why, in one sentence, using numbers the app actually computed.

## 2. Architecture

```
repository root/
  src/lib/domain/      pure, framework-free ranking logic (unit-tested)
    types.ts             shared domain types
    corridor.ts           real station data + two real route options
    scoring.ts             per-candidate evaluation (crowd, disruption, bike, weather)
    planTrip.ts             candidate generation, ranking, explanation text
    disruptionMatch.ts       matches a TrainServiceAlerts segment to a specific route
    bikeRules.ts              official folding-bike carriage rule, cited
    crowdScale.ts              l/m/h/NA -> low/moderate/high/unknown, unknown != low
  src/lib/data/          server-side adapters: live/unknown or explicit synthetic demo
    trainAlerts.ts, crowding.ts, weather.ts, osrm.ts
  src/fixtures/          labelled synthetic fixtures, matching each real endpoint's shape
  src/app/api/            route handlers (plan, push subscribe/test) — keeps API keys server-side
  src/components/        presentation only — no ranking logic lives here
  src/lib/offline/        localStorage cache for the last computed plan + a saved trip
  src/lib/push/            Web Push client + server helpers
  tests/                    vitest — see §6
```

The ranking engine (`src/lib/domain/`) never calls `fetch`; the API route (`src/app/api/plan/route.ts`) fetches everything first and hands it in as plain data. That split is what makes the constraint logic testable without a network, and is a direct response to the rubric's "keep recommendation logic separate from presentation."

## 3. Data sources, and their licences

| Source | Use | Licence / terms | Live in this build? |
|---|---|---|---|
| `PS2/data/AmendmenttoMP2014RailStation.geojson` (provided) | Real station coordinates (polygon centroids) for the corridor | Provided under the hackathon dataset terms | Static, always |
| OpenStreetMap (via `routing.openstreetmap.de` OSRM instances, and `tile.openstreetmap.org`) | Real walking/cycling route geometry; map tiles | ODbL — attribution shown on every map (`© OpenStreetMap contributors`) | Live |
| data.gov.sg two-hr-forecast | Weather exposure flag for walk/cycle legs | Singapore Open Data Licence | Live, keyless |
| LTA DataMall `TrainServiceAlerts`, `PCDForecast` | Disruptions, station crowd forecast | Free registered use, DataMall terms | Live locally verified; explicit scenarios use fixtures. Cloud verification: `DEPLOYMENT.md` |
| LTA / Tower Transit foldable-bicycle notice | Bike-carriage eligibility rule | Public notice, cited in `src/lib/domain/bikeRules.ts` | Static fact, verified during development (Sept 2026) |
| Wikipedia (North East MRT line, Circle MRT line) | Cross-check of station sequence while building `corridor.ts` | Reference only, not redistributed | — |

**Station sequence and canonical line-code table**: built from PS2_README.md §2.4's own documented trap (line codes differ between `TrainServiceAlerts` and the PCD endpoints) plus the North East Line / Circle Line topology, which has been stable since the Circle Line loop closed in 2011. This was cross-checked against Wikipedia during development rather than taken from memory alone.

## 4. Ranking: what it is, and what it deliberately isn't

Deterministic, weighted scoring (`src/lib/domain/scoring.ts`) — not a trained model. Per candidate (a departure time × route option × access mode), the score combines: normalised total duration, average crowd-forecast rank across every station on the route (sampled at the clock time Arjun is actually expected to reach each one, not his departure time), a disruption penalty (halved if an official shuttle/free-bus mitigation is active, per the real `FreeMRTShuttle`/`FreePublicBus` fields), and a small transfer penalty. The weight between speed and comfort is a user-facing slider, not a hidden constant.

This was a deliberate choice against an ML ranking model, per PS2_README.md §3.3.1's own allowance that "a well-argued decision not to use a model where a simpler method works is also creditable": the corridor is small (two route options), the factors are enumerable, and a transparent formula is something a judge — or a commuter — can actually audit, which a trained ranker would not be.

**What's a disclosed assumption, not a live measurement:**
- Inter-station running time (~2.3 min/segment) — typical scheduled run+dwell, not a live GTFS feed.
- Added delay when a mitigation is active (+15 min) — a stated assumption, not a modelled recovery time.
- Peak/off-peak expected wait (2 min / 3 min) at first boarding.

Every one of these is shown in the app's own "Why this recommendation" panel, not just in this document.

## 5. Privacy

Flex collects nothing about who is using it. There is no account, no login, no stored location history. The only thing that persists at all:

- **A saved trip** (origin/destination labels, times, preferences) — held in the browser's own `localStorage`, never sent anywhere except back to `/api/plan` to re-evaluate it. Clearing it is one tap.
- **A Web Push subscription**, if the user explicitly opts in via the demo push button — held in an in-memory server-side map (`src/lib/push/subscriptions.ts`), cleared on every server restart. No database. This was a deliberate scope decision: a real product would need durable subscription storage, but standing one up for a hackathon demo would mean handling and disclosing real retention policy for data this app doesn't otherwise need to keep.

No LTA DataMall `AccountKey` or any other credential is ever sent to the browser — every external call that needs one runs server-side (`src/lib/data/*.ts`), and `.env.local` is git-ignored.

## 6. Offline behaviour

Explicitly designed, not incidental:

- **Foreground reevaluation**: a saved trip is re-checked against live conditions roughly every 2 minutes while the tab stays open, with a visible banner if the recommendation actually changes — deduplicated so the same change isn't repeated.
- **Closed-app**: a genuine Web Push implementation (service worker, VAPID, a real push event from the server) is wired up as the brief's "bounded attempt" — but is honestly labelled as exactly that. **A timer in an open tab is not equivalent to real background delivery**, and this app does not claim otherwise anywhere in its copy.
- **iOS**: Apple only allows Web Push to a site that has been Added to Home Screen (verified against current WebKit behaviour during development, September 2026) — the app feature-detects this (`src/lib/push/client.ts`) and explains the limitation rather than silently failing or drawing a fake notification.
- **Losing connectivity**: the last successfully computed journey is cached client-side (`src/lib/offline/cache.ts`) with its own "as of" timestamp, shown with an explicit offline banner. It never implies conditions were rechecked while offline.

## 7. Known limits

- **Bounded corridor**: only Punggol ↔ one-north via NEL/CCL is modelled — a request far outside that corridor is honestly rejected (HTTP 422 with an explanation), not silently mishandled.
- **LTA DataMall**: live alerts and NEL/CCL forecasts passed local authenticated checks. Missing or failed live feeds now remain unknown; explicit demo scenarios are separate. See `DEPLOYMENT.md` for deployed verification.
- **Rail geometry is schematic**, not a live GPS trace — station-to-station through real coordinates.
- **Real-device testing is pending** — validated via the app's own responsive CSS and a resized browser viewport during development, not an actual phone. Per the brief's own instruction, this is stated rather than claimed.
- **Google Cloud deployment**: scripts and container configuration are at the repository root. Current deployment status is recorded in `DEPLOYMENT.md`; no public URL is claimed before verification.

## 8. Team

Repository: this NebulaX 2026 hackathon repo, now at the repository root. GitHub destination: `https://github.com/lin-nj/flex.git`; collaborators are managed by the team (see `PS2/submission/README.md` §"Logistics" — those details are marked "to be confirmed by the organisers" in the source brief and were not resolved as part of this build session).

## Deployment audit update ? 19 September 2026

The merged UI is preserved. Production push subscription/test endpoints and their control are disabled: the in-memory development demonstration described above is not reliable background monitoring. Saved-trip reevaluation remains foreground-only. Live and synthetic LTA modes are now explicit, forecasts match Singapore dates, and unavailable data stays unknown. Source notes, planned advisories and stale warnings are visible again. Rail timings remain assumptions; no bus routing or automatic future-closure interpretation is claimed. Current source/build/test/deployment evidence is in `DEPLOYMENT.md`.

The actual app and APIs are now verified publicly on Google Cloud at **https://flex-tbqkdfa42a-uc.a.run.app**, revision `flex-00001-g95`, in project `qwiklabs-gcp-04-d64717e9afa3`, region `us-central1`. Cloud Build passed 30 tests, lint, types and production compilation. An unauthenticated browser verified phone/desktop layout, map tiles, scenario notices and offline reload. Deployed LTA, weather and access routing were live. Real-phone testing and the submission recording remain pending. No Git commit or push was performed.
