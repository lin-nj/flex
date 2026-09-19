# Flex on Google Cloud

Target: `qwiklabs-gcp-04-d64717e9afa3`, `us-central1`, Cloud Run service `flex`.
Deploying account: `student-04-845287239544@qwiklabs.net`.
The application root is this repository root, **not** the retired `PS2/app`.
Base source commit: `f18fcd6692a34faa67ede77d0e496838a88320fd`, plus the local changes described below.
No commit or push is performed by deployment. Vercel is untouched.

## Current status

**VERIFIED LIVE, including the scenario fix — 19 September 2026.** Public application and server-side APIs:
**https://flex-tbqkdfa42a-uc.a.run.app**

Cloud Run also reports the service alias https://flex-251697422306.us-central1.run.app (root checked publicly).
Revision **`flex-00002-k2h`** is ready and receives **100%** of traffic. The service-level invoker IAM check is disabled; browser/API verification used no Google login or special cookies.

Cloud Build **`0544e9cc-61d9-472f-bb5c-544db825ce51`** succeeded using Node 24. Image digest: `sha256:af07a21d5164626b407ebebe8c82f7a2cbda455a837eae47a6fbfb2fbb5a4f5e`.
Application source is base commit `f18fcd6692a34faa67ede77d0e496838a88320fd` plus preserved local changes and the focused scenario fixes below. Verification documentation was updated after deployment; application code was not changed after this build. No commit or push was made.

Runtime identity: `flex-runtime@qwiklabs-gcp-04-d64717e9afa3.iam.gserviceaccount.com`, with no project-wide role grants and `roles/secretmanager.secretAccessor` on `flex-lta-account-key` only. Runtime secret version: **1**. Actual builder identity: `251697422306-compute@developer.gserviceaccount.com`, granted the documented `roles/run.builder` role.
Current evidence is saved in ignored `.deploy/fixed-deployment.json`, `.deploy/public-fixed-fresh.json`, `.deploy/public-fixed-used.json`, `.deploy/public-fixed-edges.json`, `.deploy/public-live-stale-parity.json`, `.deploy/fixed-build-audit.json` and `.deploy/fixed-runtime-audit.json`. Redeployment metadata is saved in `.deploy/deployment.json`.

## Windows deployment

Install the [official Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk#windows).
Open a new PowerShell terminal and authenticate in Google's browser page (password only in that page):

```powershell
gcloud auth login student-04-845287239544@qwiklabs.net
Set-Location C:\Users\65820\nebulax
.\scripts\deploy.ps1 -PreflightOnly
```

If `gcloud` is not on PATH, the script checks its usual per-user Windows installation.
It checks lab-account authentication and project access, reviews the effective upload list, and inspects an existing `flex` service before any resource changes. An existing service without the Flex label stops deployment; inspect it before passing its exact image through `-ReviewedExistingImage`. Never use that option to overwrite an unrelated application.

Enter `LTA_ACCOUNT_KEY` in ignored root `.env.local` using an editor. This is the **DataMall API key**, not the Extended OBU SDK key. Root configuration wins over the retired location. No OBU integration is used.

```powershell
# First deployment: securely uploads the local key to Secret Manager.
.\scripts\deploy.ps1 -UploadLtaKey
if ($LASTEXITCODE -ne 0) { throw 'Deployment/checks failed' }

# Repeat deployment: pin the actual numeric secret version from deployment.json.
$deployment = Get-Content .deploy/deployment.json | ConvertFrom-Json
.\scripts\deploy.ps1 -LtaSecretVersion $deployment.ltaSecretVersion
```

The script enables only Cloud Run, Cloud Build, Artifact Registry and Secret Manager if needed. It discovers Cloud Build's real default identity and grants the documented `roles/run.builder` role if absent. It creates a dedicated `flex-runtime` service identity and grants `roles/secretmanager.secretAccessor` on `flex-lta-account-key` only. Server secrets enter the container at runtime with a numeric Secret Manager version. Existing unrelated Cloud Run secret mappings are preserved with `--update-secrets`.

Permission, quota, billing, or policy failures stop the script. Give the exact failed operation to a lab mentor; ask for only the missing permission. Do not grant Owner/Editor, attach personal billing, delete resources, or disable organisation policies. The script uses the authorised service-level `--no-invoker-iam-check` setting; a policy rejection requires mentor assistance.

Source deployment builds the included Dockerfile on Cloud Build; local Docker is unnecessary. Node 24 builds the lockfile with `npm ci`, runs tests/lint/types/build, and serves Next standalone on `0.0.0.0:$PORT`. Public assets and `.next/static` are included. Resource settings: 1 CPU, 1 GiB, 0 minimum / 2 maximum instances, concurrency 20; these are limits, not a cost guarantee. There is no database or background scheduler.

`.gcloudignore` uses an explicit source allowlist. `.dockerignore` excludes local secrets, Git metadata, generated output, old `PS2` artifacts and dependencies. Inspect `.deploy/upload-files.txt`; do not copy `.env.local` into a build context or source archive. No `NEXT_PUBLIC_*` value is needed for this hosted deployment.

**Push automation audit, 19 September 2026:** read-only inspection found no Cloud Build triggers in `global` or `us-central1`, and no local or remote GitHub Actions workflows. However, GitHub `main` has Vercel status contexts for `app-821m`, `app`, and `flex`. Treat a push as potentially triggering Vercel. Vercel project root directories, production branches, ignored-build/path rules, private webhooks, and Cloud Build triggers in other regions remain unverified; public webhook inspection returned 401, location discovery returned 404, and wildcard trigger listing was rejected. Do not infer that every push is deployment-free. See [CLEANUP.md](CLEANUP.md) for the preservation and isolated-build audit. No push or deployment was performed during that audit.

## Scenario investigation (19 September)

The first deployment's API smoke used 07:15–09:00. Its browser checks verified notices and route presence but did not verify crowd coverage. The earlier statement that all scenarios passed was too broad.

Reproduced on `flex-00001-g95` through the visible controls, without editing initial inputs: a fresh session used 2026-09-19 15:10–17:10; the previously used, service-worker-controlled session restored 14:45–16:45. Live returned low crowd. Every demo returned HTTP 200 and a feasible route, but every station arrival was outside the fixture's 07:00–09:30 window. `CrowdBadge` rendered this as “Crowd unknown” and compact “No data”. Identical direct API requests matched the browser. There were no browser exceptions in that reproduction. This was a clock/fixture mismatch, not a missing API response, invalid scenario name, missing packaged fixture or credential override.

The fix gives demo mode a separate 2026-09-21 07:15–09:00 example trip and a visible 07:15 Singapore simulation clock. Fixtures were observed at 07:00; incidents are explicitly assumed active for that simulation day. Planned works remain an advance notice for 26 Sep, outside the demo trip. Demo weather is a labelled fair-weather assumption; OSRM still supplies real access geometry. The API rejects other demo dates instead of silently changing inputs. Editable demo time windows can still be infeasible or outside forecast coverage. Returning to Live restores the untouched Live request and disables stale simulation; real timestamps are never rewritten.

The morning fixture intentionally has a Kovan gap: with actual OSRM timing the recommendation has 14 of 15 known station forecasts. The UI shows “Partial crowd data”, the coverage count and the highest known level, preserving the unknown value and original ranking. A completely uncovered trip still says “Crowd unknown”. Demo plans no longer overwrite or restore the Live offline cache; older cached synthetic plans are rejected without clearing saved trips. A late response cannot replace the latest selection. Map fitting no longer animates across scenario unmounts.

`tests/demoScenarios.test.ts` covers clocks, configured-key demo isolation, return to Live, stale isolation, honest unknowns, impossible windows and legacy cache rejection. `scripts/scenario-browser.mjs` drives the visible controls, compares identical API inputs, checks phone/desktop overflow and console errors, exercises rapid switching and deliberately releases an older disruption response after Live has rendered. It failed against the original deployment. Run with an isolated Chrome remote-debugging port, for example:

```powershell
node scripts/scenario-browser.mjs https://flex-tbqkdfa42a-uc.a.run.app 9224 scenario-check 390
```

Browser evidence and screenshots are stored only in ignored `.deploy/`. Public revalidation passed on `flex-00002-k2h` in a new unauthenticated Chrome profile at 390×844 and the original service-worker-controlled profile at 1440×844, followed by 1440×1000 reloads. Existing storage was preserved. No console warnings/exceptions or horizontal overflow occurred in the normal click-throughs. Map tiles and OpenStreetMap attribution rendered. The extra failure-path test intentionally blocked planning requests to verify safe cache fallback.

All times below are Singapore time. The trip is Near Soo Teck LRT, Punggol → Fusionopolis One, with comfort 0.7, walking tolerance 15 min, cycling tolerance 20 min, cycle-and-park enabled and folding-bike carry disabled.

| Visible control | Trip/date/window actually tested | Observed public result | Source | Result |
| --- | --- | --- | --- | --- |
| Live conditions | 19 Sep 2026, fresh 15:25–17:25; existing saved 14:45–16:45; fresh reload 15:30–17:30 | Usable Serangoon route, low crowd, 15/15 station forecasts; original request restored on return | Live LTA + weather; OSRM geometry | Pass |
| Normal day | 21 Sep 2026, 07:15–09:00 | Leave 07:15, cycle-and-park via Serangoon, arrive by 08:12; 14/15 crowd estimates, Kovan unknown, partial-data label | Synthetic alerts/crowd/weather; OSRM geometry | Pass |
| Planned works | Same demo trip | 26 Sep advance notice visible; same recommendation, no disruption penalty | Synthetic | Pass |
| Unplanned disruption | Same demo trip | HarbourFront–Kent Ridge notice visible; unaffected Serangoon recommendation with accurate avoidance explanation; selecting Another route displays affected stations | Synthetic | Pass |
| Irrelevant disruption | Same demo trip | NSL notice visible; recommendation identical to Normal, neither route penalised | Synthetic | Pass |
| 3-hour-old cached feed | Same demo trip, toggle on then off | Explicit stale banner and 180-minute alert age at simulated clock; warning clears; Live resets/disables simulation | Synthetic, deliberately aged | Pass |

Identical direct `/api/plan` requests matched the visible results for all demo modes, Live, and stale on/off. Live → disruption → Normal → Live, rapid switching, and releasing an older disruption response after Live had rendered all preserved the final Live selection. Public edge checks also confirmed that 21 Sep 15:10–17:10 produces an honest 0/15 crowd-coverage plan; 07:15–07:20 produces a latest-arrival explanation; a failed demo request cannot show the cached Live plan; and failed Live requests restore only the matching Live plan.

Changed files for this investigation (other existing workspace changes were preserved):

| Files | Purpose |
| --- | --- |
| `src/app/page.tsx`, `src/components/ScenarioPicker.tsx` | Separate demo/Live trip state, explicit reference clock, Live restoration, stale-mode reset and no old result under a new pending selection |
| `src/lib/domain/demo.ts`, `src/lib/domain/types.ts`, `src/app/api/plan/route.ts` | Fixed demo date/observations/weather, response simulation metadata, date validation, unchanged Live timestamps |
| `src/fixtures/trainAlerts.ts`, `src/fixtures/crowdForecast.ts`, `src/lib/data/crowding.ts` | Coherent fixture observations/date coverage and corrected provider comments; existing crowd values preserved |
| `src/components/CrowdBadge.tsx`, `RecommendationCard.tsx`, `DepartureComparison.tsx`, `DataAttribution.tsx` | Partial/unknown coverage display and age relative to the simulation clock |
| `src/lib/domain/planTrip.ts`, `src/components/RouteMapInner.tsx` | Explain the actual weighted score without claiming unknown crowds are lower; avoid map animation callbacks after unmount |
| `src/lib/offline/cache.ts` | Keep demo and legacy synthetic results out of the Live cache; match request inputs on failure |
| `tests/demoScenarios.test.ts`, `scripts/scenario-browser.mjs`, `scripts/smoke.mjs` | Timing/provider/cache regression coverage, actual browser assertions and aligned demo smoke inputs |
| `DEPLOYMENT.md`, `scripts/deployment-files.txt` | Correct the previous overbroad verification statement and record the reviewed changes/results |

## Verification

```powershell
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Install failed; do not test partial dependencies' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Types failed' }
npm.cmd run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
node scripts/smoke.mjs $deployment.url
if ($LASTEXITCODE -ne 0) { throw 'Public checks failed' }
```

The smoke script checks the root and referenced JS/CSS, JSON APIs, four explicitly synthetic scenarios, irrelevant-disruption matching, stale labels, infeasible windows, out-of-corridor inputs and disabled public push endpoints. It reports observed live feed provenance without printing credentials. Local checks do not prove the Google Cloud endpoint works. Review revision readiness, 100% traffic, recent Cloud Build and Cloud Run error logs, and the browser after deployment. Do not dump environment values or whole service configurations into shared logs.

Current local checks: **36 tests**, type checking, lint (zero warnings/errors), and the standalone production build passed. The same browser regression and additional edge checks passed on the local production server with the configured Live key. Initial-deployment checks also covered no-key degradation: unavailable conditions, never fixture substitution.

Headless Chrome passed at 390×844 and 1440×1000: no horizontal overflow, map tiles and attribution, disruption/planned/stale notices, disabled push, saved trip and offline reload, with no browser exceptions. Browser testing found and fixed network-failure cache restoration when `navigator.onLine` remains true. These browser checks also passed against the public Cloud Run URL in an isolated profile with no Google login. Real-phone testing remains pending. Local Windows installation first hit sandbox `spawn EPERM`, then succeeded outside the sandbox; rebuilding while the two test servers were running hit `EBUSY`, then succeeded after stopping only those identified servers. Supplied local LTA/VAPID secret values were absent from tracked files and all 12 reachable Git commits. This is a targeted credential scan, not an assurance about every possible secret.

**Historical first-deployment checks:** public root and eight required JS/CSS assets returned valid responses; `/api/plan` returned JSON from the same Cloud Run origin. Morning API smoke checks covered all four demos, irrelevant-disruption matching, stale simulation, impossible arrival, out-of-corridor and invalid-request rejection. They did not establish correct crowd display when a user switched from current-time Live defaults; see the investigation above. Browser traffic showed no localhost or Vercel backend requests.

**Deployed live feeds:** TrainServiceAlerts mode `live`, status 1 (normal/minor delays), zero affected segments; NEL and CCL forecasts mode `live` with Singapore-date matching; data.gov.sg weather mode `live`; both selected access legs had routed geometry. No fixture fallback was used in live mode. Demo scenarios remained explicitly synthetic.

**Current cloud validation and logs:** Cloud Build passed clean installation, all **36 tests**, lint, type checking and production build. Inspected **287 build log entries**: no error-severity entries or known credential-value matches. Inspected **122 new-revision log entries**: no unexpected runtime errors or known credential-value matches; the two error-level HTTP entries were expected 503 responses from disabled push probes. The public smoke passed the root, eight required JS/CSS assets, all scenario APIs, constraints and disabled push. A targeted scan of 132 tracked/uploaded file paths found no configured LTA/VAPID credential values. This does not claim to detect every possible secret.

## Data and notification limits

- `Live conditions` fetches LTA alerts and date-matched forecasts. Missing credentials, rejected authentication and unavailable feeds become **unknown**, never sample data labelled live. Alerts cache for 60 seconds; forecasts for one hour; failures for 60 seconds per instance. Cache time is retained and is not refreshed on each plan request. Two instances have separate caches.
- Normal/planned/disrupted/irrelevant demo modes explicitly inject fixtures even with a live key. Selecting one loads a separate 21 Sep 2026 07:15–09:00 trip, preserving the Live trip. Crowd coverage is 07:00–09:30, with an intentional Kovan gap; other intervals stay unknown. Stale simulation is demo-only and measures a three-hour-old alert against the fixed 07:15 reference clock.
- All trip clocks and forecast dates use Singapore time. Planning covers one calendar day; a next-day arrival cannot satisfy a same-day deadline. Live train alerts and weather describe current conditions, not guaranteed future service. Planned notices are displayed as advisories; free-text future closures are not converted into scheduled routing restrictions.
- Door-to-door walk/cycle geometry uses OSRM over OpenStreetMap. On provider failure the missing geometry and straight-line timing estimate are disclosed. Rail geometry and timing are assumptions. No bus routing, sheltered-path guarantee, full island coverage, or reverse journey routing is implemented.
- Hosted Web Push subscribe/test APIs return 503 and the test control is disabled. The old developer-only bounded push demonstration remains in source. In-memory subscriptions, frontend timers and Cloud Run local disk are not durable background monitoring. No VAPID secret is uploaded for this deployment.
- Saved trips and cached plans are browser-local. The new Cloud Run origin has separate storage, permissions, caches and subscriptions from Vercel. Visit/reload online after service-worker activation before checking an offline reload; map tiles are never bulk-cached. Offline data is shown with its saved timestamp, not as rechecked conditions.
- Real phone testing and a submission recording remain team actions unless separately recorded as completed. Existing project limitations have not been replaced by claims of full production readiness.

## Two-minute phone/judge check

1. Open the actual Google Cloud URL in private browsing on mobile data. Confirm no Google login, a route, readable text and OpenStreetMap attribution.
2. Open Scenarios: Normal day automatically loads the labelled morning simulation. Select Unplanned disruption, Another route, then Irrelevant disruption. Explain the 14/15 crowd coverage, injected data labels and arrival ranges.
3. Select Planned works to show its notice; enable stale simulation and verify its warning. Return to Live conditions: the original trip returns and stale simulation turns off. Read the live/unknown source labels.
4. Save a trip. Explain foreground-only reevaluation and disabled background push. After an online reload, use airplane mode and check the cached journey timestamp. Reconnect. Record a short phone demo and add its link to README.

## Cloud Shell fallback

Use this only if Windows tooling remains blocked. Transfer the **current reviewed working tree**, including these local fixes, rather than cloning stale GitHub HEAD. The archive must use the exact gcloud upload list and exclude every local credential:

```powershell
New-Item -ItemType Directory -Force .deploy | Out-Null
gcloud meta list-files-for-upload | Set-Content -Encoding ascii .deploy/upload-files.txt
if ($LASTEXITCODE -ne 0) { throw 'Upload list failed' }
tar.exe -czf .deploy/flex-source.tgz -T .deploy/upload-files.txt
if ($LASTEXITCODE -ne 0) { throw 'Archive failed' }
tar.exe -tzf .deploy/flex-source.tgz
```

Upload that archive with Cloud Shell's upload control in the **lab project's** console. Extract into a new empty directory, then run:

```bash
mkdir flex-reviewed
tar -xzf flex-source.tgz -C flex-reviewed
cd flex-reviewed
gcloud auth list
bash scripts/deploy-cloudshell.sh
```

The shell script requires the intended lab identity, checks an existing service, discovers the builder identity, creates the scoped runtime/secret setup and deploys the same reviewed source. If no secret version exists, its prompt reads the DataMall key without echo; it sends the value over stdin to Secret Manager, never in a command argument. Stop and consult a mentor on policy/permission failures. This fallback has not been executed; uploading the archive alone is not a deployment.

## Manual Git review and publication

Both inspected Git remotes point to `lin-nj/flex`. No files have been staged, committed or pushed. The pre-existing untracked `PS2/app/package-lock.json` remains untouched and is intentionally excluded below. Run from the repository root; inspect every diff before committing. These commands stage only the deployment changes from this task:

```powershell
$files = Get-Content scripts/deployment-files.txt
git status --short
git diff -- $files
# New files do not appear in git diff until staged; review them in your editor too.
git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Diff checks failed' }
git diff --cached
git commit -m "Prepare Flex Cloud Run deployment and verify live LTA data"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git remote get-url --push origin
if ($LASTEXITCODE -ne 0) { throw 'Remote inspection failed' }
# Explicit destination prevents an altered origin from pushing to the organiser.
git push https://github.com/lin-nj/flex.git HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'Push failed; inspect without force-pushing' }
```

## Official references

- [Next.js on Cloud Run](https://docs.cloud.google.com/run/docs/quickstarts/frameworks/deploy-nextjs-service), [source builds](https://docs.cloud.google.com/run/docs/deploying-source-code), [build identity](https://docs.cloud.google.com/run/docs/configuring/services/build-service-account).
- [Secret integration](https://docs.cloud.google.com/run/docs/configuring/services/secrets), [public access](https://docs.cloud.google.com/run/docs/authenticating/public), [container contract](https://docs.cloud.google.com/run/docs/container-contract), [upload exclusions](https://docs.cloud.google.com/sdk/gcloud/reference/topic/gcloudignore).
- [LTA API guide v6.9](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf), sections 2.11 / 2.25 and Annex C. Deleted PS2 brief and full specification were recovered read-only from `98a05c9^`; old application code and datasets were not restored.
