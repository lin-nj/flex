#!/usr/bin/env bash
# Run only in the specified lab project's Cloud Shell, from the reviewed archive.
set -euo pipefail
set +x
cd "$(dirname "$0")/.."
project=qwiklabs-gcp-04-d64717e9afa3
region=us-central1
account=student-04-845287239544@qwiklabs.net
runtime="flex-runtime@$project.iam.gserviceaccount.com"
secret=flex-lta-account-key
gc() { gcloud "$@" --project="$project" --account="$account" --quiet; }
gcloud auth list --format='value(account)' | grep -Fx "$account" >/dev/null || { echo 'Authenticate the intended lab account first.'; exit 1; }
gc projects describe "$project" --format='value(projectId)' | grep -Fx "$project" >/dev/null
mkdir -p .deploy
gc meta list-files-for-upload > .deploy/upload-files.txt
if grep -E '(^|/)(\.env[^/]*|env\.local|node_modules|\.next|\.git|PS2|\.deploy)(/|$)|\.(pem|key|env)$' .deploy/upload-files.txt; then
  echo 'Unsafe upload list; stopping.'; exit 1
fi
gc services list --enabled --format='value(config.name)' > .deploy/enabled-services.txt
if grep -Fx 'run.googleapis.com' .deploy/enabled-services.txt >/dev/null; then
  gc run services list --region="$region" --format=json > .deploy/services.json
  if jq -e '.[] | select(.metadata.name == "flex")' .deploy/services.json >/dev/null; then
    image=$(jq -r '.[] | select(.metadata.name == "flex") | .spec.template.spec.containers[0].image' .deploy/services.json)
    label=$(jq -r '.[] | select(.metadata.name == "flex") | .metadata.labels["flex-app"]' .deploy/services.json)
    echo "Existing flex image: $image"
    if [[ "$label" != commuter && "${REVIEWED_EXISTING_IMAGE:-}" != "$image" ]]; then
      echo 'Inspect the existing service. If it is Flex, set REVIEWED_EXISTING_IMAGE to its exact image before rerunning.'; exit 1
    fi
  fi
fi
gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
builder=$(gc builds get-default-service-account --region="$region" | grep -oE '[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com')
test -n "$builder"
echo "Build identity: $builder"
gc projects add-iam-policy-binding "$project" --member="serviceAccount:$builder" --role=roles/run.builder --condition=None >/dev/null
identities=$(gc iam service-accounts list --format='value(email)')
if ! grep -Fx "$runtime" <<< "$identities" >/dev/null; then gc iam service-accounts create flex-runtime --display-name='Flex commuter runtime'; fi
secret_names=$(gc secrets list --format='value(name)')
if ! grep -E "(^|/)$secret$" <<< "$secret_names" >/dev/null; then gc secrets create "$secret" --replication-policy=automatic --labels=flex-app=commuter; fi
version=${LTA_SECRET_VERSION:-}
if [[ -z "$version" ]]; then
  version=$(gc secrets versions list "$secret" --filter=state:ENABLED --format='value(name)' | sed 's|.*/||' | sort -nr | head -1)
fi
if [[ -z "$version" ]]; then
  echo 'Enter the DataMall API key below (hidden input; never the OBU key).'
  read -r -s -p 'DataMall key: ' lta_key
  echo
  test -n "$lta_key"
  version=$(printf '%s' "$lta_key" | gc secrets versions add "$secret" --data-file=- --format='value(name)')
  unset lta_key
  version=${version##*/}
fi
[[ "$version" =~ ^[1-9][0-9]*$ ]] || { echo 'Expected a numeric secret version'; exit 1; }
gc secrets add-iam-policy-binding "$secret" --member="serviceAccount:$runtime" --role=roles/secretmanager.secretAccessor --condition=None >/dev/null
gc run deploy flex --source=. --region="$region" --service-account="$runtime" \
  --build-service-account="projects/$project/serviceAccounts/$builder" \
  --update-secrets="LTA_ACCOUNT_KEY=$secret:$version" \
  --update-env-vars=NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1 \
  --labels=flex-app=commuter --no-invoker-iam-check --ingress=all \
  --cpu=1 --memory=1Gi --min=0 --max=2 --concurrency=20 --timeout=60
gc run services describe flex --region="$region" --format=json > .deploy/service.json
jq -e '.status.conditions[] | select(.type == "Ready" and .status == "True")' .deploy/service.json >/dev/null
revision=$(jq -r '.status.latestReadyRevisionName' .deploy/service.json)
jq -e --arg revision "$revision" '.status.traffic[] | select(.revisionName == $revision and .percent == 100)' .deploy/service.json >/dev/null
url=$(jq -r '.status.url' .deploy/service.json)
echo "Ready revision: $revision; public URL: $url; secret version: $version"
node scripts/smoke.mjs "$url"
echo 'Public smoke checks passed. Complete browser, phone and log checks in DEPLOYMENT.md.'
