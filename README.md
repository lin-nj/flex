# Flex — Smart Commuter Companion

**Find the best time and way to travel within your flexible arrival window.**

**Live on Google Cloud:** https://flex-tbqkdfa42a-uc.a.run.app
Public app and APIs verified on 19 September 2026. Deployment details and limits: [DEPLOYMENT.md](DEPLOYMENT.md).

Built for **Arjun**, the flexible-start, multi-modal commuter (PS2 persona 2.2): Punggol → one-north, start time flexible by about an hour, optimises for comfort and predictability over raw speed, cares about crowding, cycling and whether he can bring his bike.

The core decision Flex answers: **leave now, leave later, or take another route.**

---

## 1. Prerequisites

- Node.js **22.12+ or 24** (Cloud Build uses Node 24)
- npm (ships with Node)
- Internet access at runtime — the app calls live public services directly (see §4); it does not need internet at *build* time beyond `npm install`

No database, no account system, no paid service is required to run or judge this app.

## 2. Install & run

From the repository root (not the retired `PS2/app`):

```powershell
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Install failed" }
npm.cmd run dev
```


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

Copy `.env.example` to ignored root `.env.local`. Live LTA calls need `LTA_ACCOUNT_KEY`; failures and missing keys remain visibly unknown. Explicit Scenarios use labelled synthetic fixtures. See [DEPLOYMENT.md](DEPLOYMENT.md) for cloud deployment and verification status.

| Variable | What it unlocks | Where to get it |
|---|---|---|
| `LTA_ACCOUNT_KEY` | Live `TrainServiceAlerts`, `PCDForecast` (station crowd) | Free registration at [datamall.lta.gov.sg](https://datamall.lta.gov.sg) |
| `ONEMAP_TOKEN` | Unused; reserved for future extensions | Not needed for this app |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Development-only bounded push test; disabled in production | Generate your own: `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same value as `VAPID_PUBLIC_KEY`, exposed client-side | — |

Weather (`data.gov.sg`) and the walking/cycling routing (OSM-based) run **live, with no key**, out of the box.

## 4. What's live, what's a labelled fixture

| Source | Status without any key | Notes |
|---|---|---|
| Weather (data.gov.sg two-hr-forecast) | **Live** | Keyless public API |
| Walking/cycling routes (OSRM over OSM data) | **Live** | Real routed geometry, not straight lines — see §6 |
| Station geometry | **Static** | Coordinates embedded in `src/lib/domain/corridor.ts`; source dataset is recoverable from Git history |
| TrainServiceAlerts | **Unavailable / unknown** in Live mode | Add `LTA_ACCOUNT_KEY`; explicit scenarios use fixtures |
| PCDForecast (station crowd) | **Unavailable / unknown** in Live mode | Add `LTA_ACCOUNT_KEY`; explicit scenarios use fixtures |

The UI always shows which mode each figure is in — read **Data sources and limitations** under any result. Nothing is ever silently swapped from live to fixture without saying so.

## 5. The first journey to try

The app opens pre-filled with Arjun's example trip — **no sign-up, no input required**:

1. Load the app. It plans Punggol → one-north from the current Singapore time. For the synthetic morning crowd demo, edit Trip settings to 07:15–09:00.
2. Open **Scenarios** in the header and tap **"Unplanned disruption."**
3. Watch the recommendation change: it now explains *why* — the HarbourFront route is down, so it routes you via Serangoon instead — and the map redraws to that route with the affected stations marked in red on the other option.
4. Tap **"Another route"** in "Compare your options" to see the disrupted alternative side by side.
5. Read **Data sources and limitations** for source modes, age and timing assumptions. Select **Live conditions** to return to live feeds.

Try the other three demo scenarios (**Normal day**, **Planned works**, **Irrelevant disruption**) — the last one exists specifically to prove the app does *not* reroute you for an incident on an unrelated line.

## 6. Bounded scope, stated honestly

This is a **bounded corridor demo**, not an island-wide router: only Punggol → one-north via the North East Line and Circle Line is modelled (two options: HarbourFront and Serangoon). Requesting a trip whose origin/destination sits far outside that corridor returns an explicit error. Bus routing and reverse journeys are not implemented.

Within that corridor:

- **Walking/cycling legs are real, routed geometry** from OpenStreetMap data via a public OSRM instance (`routing.openstreetmap.de`) — not straight lines between station centres. (The other common public demo, `router.project-osrm.org`, was tried first and rejected: its `/foot` and `/bike` endpoints were found, by direct comparison, to silently return identical car-graph/car-speed results to `/driving` — see `src/lib/data/osrm.ts`.)
- **Rail segments are schematic** — a polyline through real station coordinates in the correct sequence, not a live GPS trace. Disclosed in the source panel.
- **Inter-station timing is a documented assumption** (~2.3 min/segment, typical scheduled run+dwell), always shown as a range.
- Map tiles are OpenStreetMap's own tile server, with attribution, at ordinary single-session demo volume (not bulk/production traffic — see code comments in `src/components/RouteMapInner.tsx` for why CARTO's free tier was tried and rejected).

## 7. Notifications & offline

- **Foreground, while the tab is active and connected:** save a trip and Flex re-checks conditions every ~2 minutes while the tab is open, flagging any change to your recommendation.
- **Closed-app Web Push:** disabled on the hosted demo. The development-only bounded test remains in source; no durable subscription store or background scheduler exists.
- **Offline:** the last successfully computed journey is cached client-side with its own timestamp. Losing connectivity shows a visible "offline, last updated at…" banner — it never implies conditions were re-checked while offline.

## 8. Known limitations / not done

- Local LTA checks on 19 September returned live train alerts and NEL/CCL forecasts. Cloud verification status is recorded in [DEPLOYMENT.md](DEPLOYMENT.md).
- Real-device testing (an actual phone, not devtools emulation) is **pending** — this was validated with the app's own responsive layout rules and a resized browser viewport, not a physical device.
- OneMap is not integrated. Planned-work notices are displayed, but future free-text closures do not automatically restrict routing.
- Push subscriptions are held in an in-memory server store (cleared on restart) — intentionally, to avoid standing up a database for a hackathon-scope demo. See `WRITEUP.md` for the privacy reasoning.

## 9. Tests

```bash
npm test
```

30 unit tests cover the parts of the brief a demo click-through can't prove on its own: disruption relevance vs irrelevance, latest-arrival infeasibility, unknown-crowd handling, invalid (non-folding) bike carriage, no-feasible-route explanations, and departure-window changes in response to crowd forecasts and disruptions. See `tests/`.

## Google Cloud deployment

Use [DEPLOYMENT.md](DEPLOYMENT.md) and `scripts/deploy.ps1` from this root. Revision `flex-00001-g95` is verified publicly on Cloud Run with live LTA data. GitHub pushes do not automatically redeploy Cloud Run. Background push is disabled; saved-trip reevaluation runs while the tab is active. Demo recording and real-phone check: pending.
