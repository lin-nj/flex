# Deployment-preserving cleanup — 19 September 2026

No production resources, traffic, service settings, IAM, authentication settings, secrets or container images were changed. No Cloud Build was submitted, and nothing was staged, committed or pushed. Existing application and scenario-fix changes were preserved.

## Verified production state

- Project `qwiklabs-gcp-04-d64717e9afa3`, service `flex`, region `us-central1`.
- Ready revision `flex-00002-k2h`, 100% of traffic, public URL https://flex-tbqkdfa42a-uc.a.run.app.
- Image digest `sha256:af07a21d5164626b407ebebe8c82f7a2cbda455a837eae47a6fbfb2fbb5a4f5e`.
- Runtime identity `flex-runtime@qwiklabs-gcp-04-d64717e9afa3.iam.gserviceaccount.com`.
- Runtime `LTA_ACCOUNT_KEY` references Secret Manager `flex-lta-account-key`, version `1`. No secret value was read from Secret Manager or printed. Production does not read either local `.env.local` file.
- The recorded successful build `0544e9cc-61d9-472f-bb5c-544db825ce51` used a source archive in the Cloud Run source bucket, not a Git checkout. The preserved deployment scripts explicitly select the repository root and deploy `--source=.`.

## Backup and exact cleanup

A full private backup is outside Git at:

`C:\Users\65820\nebulax-backups\cleanup-20260919-1545\workspace`

The backup includes `.git`, all uncommitted/untracked files, ignored local configuration, both dependency/build trees, deployment evidence, and test browser profiles. Its parent ACL grants access only to the current Windows user and SYSTEM. A SHA-256 comparison verified **29,447 files / 3,239,711,093 bytes**, with zero mismatches. `backup-manifest.json` and `copy.log` are beside the backup, outside the repository. Keep this backup private: it includes credentials.

Only these inactive, generated paths were removed, after checking their absolute paths and verified backup copies:

| Removed path | Bytes |
| --- | ---: |
| `.deploy/chrome-cloud` | 222,158,163 |
| `.deploy/chrome-postfix-fresh` | 202,116,410 |
| `.deploy/chrome-scenario-fresh` | 206,084,142 |
| `.deploy/chrome-test` | 202,701,458 |
| `.deploy/flex-source.tgz` | 129,964 |

Total removed from the repository: **833,190,137 bytes**, approximately 833 MB. The full backup remains available, so this cleanup is reversible rather than a net disk-space reduction.

To restore one removed artifact, copy its matching path from `workspace\.deploy` back into the repository's `.deploy` while the test browser is closed. For example, copy `workspace\.deploy\chrome-cloud` to `.deploy\chrome-cloud`. Do not overwrite newer source files or restore the entire `.git` directory over active work without reviewing the differences.

## Preserved dependencies and uncertain files

- Root `src`, `public`, tests, package manifest/lockfile, Next/TypeScript/Vitest/ESLint/PostCSS configuration, Dockerfile, all ignore rules, and deployment/testing scripts remain.
- `scripts/deploy.ps1`, `deploy-cloudshell.sh`, `smoke.mjs`, `scenario-browser.mjs`, and `deployment-files.txt` remain available for future review and deployment. They were read, not executed for deployment.
- Every existing `.deploy` Python/JavaScript helper remains, including build/runtime audits, readiness inspection, browser reproduction, edge tests and credential scanning. Some helpers intentionally contain historical revision IDs or depend on local environment files; preserve/review them rather than treating the directory as disposable.
- Deployment metadata, upload lists, JSON evidence, screenshots, and logs in `.deploy` remain. The obsolete source archive was backed up and removed because a fresh upload archive must reflect current source.
- All of `PS2/app` remains, including its unique untracked lockfile, environment file, generated files, dependency tree and empty source directories. There is no `PS2/app/package.json`; the verified deployment builds the root app and excludes PS2. Nevertheless, the Windows deployment script can fall back to `PS2/app/.env.local` when explicitly uploading a key, and audit helpers read that file. This is a local dependency, not the runtime secret source.
- Both local `.env.local` files remain ignored and private. No ignore rules changed.

## Isolated build validation

An intended-commit snapshot was assembled outside the repository from all existing tracked files plus nonignored uncommitted files, without staging or creating a commit. It contained **82 files** before this documentation update, including all scenario fixes. Local environment files, `.git`, `.deploy`, existing `node_modules`, and existing `.next` were absent. The unrelated PS2 lockfile was retained in the snapshot, then excluded by the actual upload rules.

The snapshot's actual `gcloud meta list-files-for-upload` produced **74 files**. All required source/assets/tests/configuration/deployment scripts and root lockfile were present; local secrets and PS2 were absent. Docker BuildKit exported the effective `COPY` context using the existing `.dockerignore`; its 74 files and hashes matched the upload context exactly. No upload or Cloud Build submission occurred.

Passed checks:

- Fresh Windows `npm ci --no-audit --no-fund`, **36 tests**, lint, `tsc --noEmit`, and production `next build` in `validation-context`.
- Actual two-stage deployment Dockerfile on the local `desktop-linux` engine: fresh `npm ci`, **36 tests**, lint, type checking, production build, and standalone runtime packaging under Node 24.
- Local image `flex-cleanup-check:20260919` started on loopback only, without credentials or host mounts. The smoke script passed the root, eight JS/CSS assets, planning APIs, all demos, stale simulation, constraints, input validation, and disabled push routes. Live LTA correctly reported unavailable without a key; real OSRM geometry and weather were available. This was not a new production Live-feed test.

The local validation image is retained; no image was pushed or removed. The temporary test container was stopped after validation. Docker Desktop was started locally for this check; no cloud runtime was changed. Validation contexts, build logs and manifests remain alongside the private backup. The documentation-only updates made after validation do not change executable build inputs.

## Push automation and remaining limits

- No local CI workflows or active Git hooks were found; only sample hooks were present. Remote GitHub `main` had no `.github/workflows` files, and the Actions API returned zero workflows.
- Cloud Build trigger lists in `global` and `us-central1` were empty: there are no branch/path filters to report in those verified scopes.
- GitHub's `main` commit has Vercel contexts `Vercel – app-821m`, `Vercel – app`, and `Vercel – flex`. A push may invoke these integrations. Their configured project root, production branch and ignored-build/path rules cannot be determined from public commit statuses.
- Private GitHub webhooks returned HTTP 401. Cloud Build location discovery returned HTTP 404 and all-location (`-`) trigger listing was rejected, so other Cloud Build regions remain unverified. No authentication or provider configuration was changed to bypass these limits.
- Future Cloud Run deploy permissions, billing, quotas and external feed availability were not exercised by a deployment. The Cloud Shell alternative and actual physical-phone behaviour were not retested.

Sanitized inspection evidence is in `.deploy/cleanup-cloud-inspection.json`; local input manifests, Docker context proof, removal records, and container smoke output use the `.deploy/cleanup-*` prefix. The earlier scenario browser evidence remains preserved separately. Do not treat historical public checks as a new browser verification during this cleanup.
