# Flex — Smart Commuter Companion

**Find the best time and way to travel within your flexible arrival window.**

Built for **Arjun**, the flexible-start, multi-modal commuter (PS2 persona 2.2): Punggol → one-north, start time flexible by about an hour, optimises for comfort and predictability over raw speed, cares about crowding, cycling and whether he can bring his bike.

The core decision Flex answers: **leave now, leave later, or take another route.**

---

## 1. Prerequisites

- Node.js **20+** (tested on Node 22)
- npm (ships with Node)
- Internet access at runtime — the app calls live public services directly (see §4); it does not need internet at *build* time beyond `npm install`

No database, no account system, no paid service is required to run or judge this app.

## 2. Install & run


Open **http://localhost:3000** on a phone-width browser window (or an actual phone on the same network, via the "Network:" URL Next prints on start).

Other commands:

```bash
npm run build      # production build
npm run start       # run the production build
npm run lint         # ESLint
npm run typecheck   # tsc --noEmit
npm test              # vitest — the ranking/constraint unit tests
```

## 3. Configuration (all optional)

Copy `.env.example` to `.env.local`. Every data source in this app runs on a clearly-labelled fixture when its key is absent — **nothing here is required to run or demo the app.**

| Variable | What it unlocks | Where to get it |
|---|---|---|
| `LTA_ACCOUNT_KEY` | Live `TrainServiceAlerts`, `PCDForecast` (station crowd) | Free registration at [datamall.lta.gov.sg](https://datamall.lta.gov.sg) |
| `ONEMAP_TOKEN` | Not required for this corridor demo; wired for future extension beyond Punggol↔one-north | Free registration at [onemap.gov.sg/apidocs](https://www.onemap.gov.sg/apidocs/) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | The Web Push "bounded attempt" (closed-app test notification) | Generate your own: `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same value as `VAPID_PUBLIC_KEY`, exposed client-side | — |

Weather (`data.gov.sg`) and the walking/cycling routing (OSM-based) run **live, with no key**, out of the box.

## 4. What's live, what's a labelled fixture

| Source | Status without any key | Notes |
|---|---|---|
| Weather (data.gov.sg two-hr-forecast) | **Live** | Keyless public API |
| Walking/cycling routes (OSRM over OSM data) | **Live** | Real routed geometry, not straight lines — see §6 |
| Station geometry | **Live, static** | From the provided `PS2/data/AmendmenttoMP2014RailStation.geojson` |
| TrainServiceAlerts | **Synthetic fixture** (labelled) | Add `LTA_ACCOUNT_KEY` for live |
| PCDForecast (station crowd) | **Synthetic fixture** (labelled) | Add `LTA_ACCOUNT_KEY` for live |

The UI always shows which mode each figure is in — expand **"Why this recommendation, and where the data comes from"** under any result. Nothing is ever silently swapped from live to fixture without saying so.

## 5. The first journey to try

The app opens pre-filled with Arjun's example trip — **no sign-up, no input required**:

1. Load the app. It plans immediately: Punggol → one-north, leave between 07:15–09:00.
2. Look at the **Demo controls** box (clearly separated, amber-dashed border — this is for judges/testers, not part of the commuter's own UI) and tap **"Unplanned disruption."**
3. Watch the recommendation change: it now explains *why* — the HarbourFront route is down, so it routes you via Serangoon instead — and the map redraws to that route with the affected stations marked in red on the other option.
4. Tap **"Another route"** in "Compare your options" to see the disrupted alternative side by side.
5. Expand **"Why this recommendation…"** for full source attribution, freshness timestamps, and every disclosed modelling assumption.

Try the other three demo scenarios (**Normal day**, **Planned works**, **Irrelevant disruption**) — the last one exists specifically to prove the app does *not* reroute you for an incident on an unrelated line.

## 6. Bounded scope, stated honestly

This is a **bounded corridor demo**, not an island-wide router: only Punggol ↔ one-north via the North East Line and Circle Line is modelled (two real route options — via HarbourFront, via Serangoon), per PS2_README.md's own note that a bounded corridor is acceptable as long as the boundary is disclosed. Requesting a trip whose origin/destination sits far outside that corridor returns an explicit error rather than a fabricated route.

Within that corridor:

- **Walking/cycling legs are real, routed geometry** from OpenStreetMap data via a public OSRM instance (`routing.openstreetmap.de`) — not straight lines between station centres. (The other common public demo, `router.project-osrm.org`, was tried first and rejected: its `/foot` and `/bike` endpoints were found, by direct comparison, to silently return identical car-graph/car-speed results to `/driving` — see `src/lib/data/osrm.ts`.)
- **Rail segments are schematic** — a polyline through real station coordinates in the correct sequence, not a live GPS trace. Disclosed in the source panel.
- **Inter-station timing is a documented assumption** (~2.3 min/segment, typical scheduled run+dwell), always shown as a range.
- Map tiles are OpenStreetMap's own tile server, with attribution, at ordinary single-session demo volume (not bulk/production traffic — see code comments in `src/components/RouteMapInner.tsx` for why CARTO's free tier was tried and rejected).

## 7. Notifications & offline

- **Foreground, always works:** save a trip and Flex re-checks conditions every ~2 minutes while the tab is open, flagging any change to your recommendation.
- **Closed-app Web Push:** a bounded, real implementation (service worker + VAPID + a genuine push event) — trigger it from Demo Controls → "Send test push". It only ever fires from an explicit demo action and is labelled `[DEMO]` in the notification itself. iOS requires the app to be **Added to Home Screen** first (verified against current Apple/WebKit behaviour, September 2026); the app feature-detects this and explains the limitation rather than silently failing.
- **Offline:** the last successfully computed journey is cached client-side with its own timestamp. Losing connectivity shows a visible "offline, last updated at…" banner — it never implies conditions were re-checked while offline.

## 8. Known limitations / not done

- LTA DataMall integration is code-complete but **untested against a live key** (none was available in this environment) — see §4.
- Real-device testing (an actual phone, not devtools emulation) is **pending** — this was validated with the app's own responsive layout rules and a resized browser viewport, not a physical device.
- OneMap routing/geocoding is wired but unused for this corridor (the provided station GeoJSON + OSM routing cover it); it's there for extending beyond Punggol↔one-north.
- Push subscriptions are held in an in-memory server store (cleared on restart) — intentionally, to avoid standing up a database for a hackathon-scope demo. See `WRITEUP.md` for the privacy reasoning.

## 9. Tests

```bash
npm test
```

17 unit tests cover the parts of the brief a demo click-through can't prove on its own: disruption relevance vs irrelevance, latest-arrival infeasibility, unknown-crowd handling, invalid (non-folding) bike carriage, no-feasible-route explanations, and departure-window changes in response to crowd forecasts and disruptions. See `tests/`.
