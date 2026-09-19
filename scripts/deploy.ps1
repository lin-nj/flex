[CmdletBinding()]
param(
  [string]$GcloudPath = 'gcloud',
  [ValidatePattern('^[1-9][0-9]*$')][string]$LtaSecretVersion,
  [switch]$UploadLtaKey,
  [string]$ReviewedExistingImage,
  [switch]$PreflightOnly
)
$ErrorActionPreference = 'Stop'
$project = 'qwiklabs-gcp-04-d64717e9afa3'
$region = 'us-central1'
$account = 'student-04-845287239544@qwiklabs.net'
$service = 'flex'
$runtime = "flex-runtime@$project.iam.gserviceaccount.com"
$secret = 'flex-lta-account-key'
$appRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $appRoot

if (-not (Get-Command $GcloudPath -ErrorAction SilentlyContinue)) {
  $candidate = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
  if (-not (Test-Path -LiteralPath $candidate)) { throw 'Install Google Cloud CLI and perform browser login first. See DEPLOYMENT.md.' }
  $GcloudPath = $candidate
}
function Invoke-Gcloud {
  param([string[]]$Arguments)
  $output = & $GcloudPath @Arguments "--project=$project" "--account=$account" --quiet
  if ($LASTEXITCODE -ne 0) { throw "gcloud failed ($LASTEXITCODE): $($Arguments[0..([Math]::Min(2, $Arguments.Length - 1))] -join ' '). Stop here; inspect permissions/policy with a mentor." }
  return $output
}
function Read-CloudJson {
  param([string[]]$Arguments)
  $output = Invoke-Gcloud ($Arguments + '--format=json')
  return ($output -join "`n" | ConvertFrom-Json)
}

$accounts = @(& $GcloudPath auth list '--format=value(account)')
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect authenticated accounts.' }
if ($accounts -notcontains $account) { throw "Manual browser login required: gcloud auth login $account" }
$projectInfo = Read-CloudJson @('projects','describe',$project)
if ($projectInfo.projectId -ne $project -or $projectInfo.lifecycleState -ne 'ACTIVE') { throw 'Unexpected or inactive lab project.' }
Write-Host "Account: $account; project: $project; region: $region; app root: $appRoot"

# Inspect the exact upload list before enabling services or sending any source.
$files = @(Invoke-Gcloud @('meta','list-files-for-upload'))
foreach ($file in $files) {
  $normalized = $file -replace '\\','/'
  if ($normalized -match '(^|/)(\.env[^/]*|env\.local|env\.[^/]*\.local|node_modules|\.next|\.git|\.deploy|PS2)(/|$)' -or $normalized -match '\.(pem|key|env)$') {
    throw "Unsafe source upload path: $normalized"
  }
  if ($normalized -notmatch '^(src/|public/|tests/|scripts/|package(-lock)?\.json$|next\.config\.ts$|tsconfig\.json$|eslint\.config\.mjs$|postcss\.config\.mjs$|vitest\.config\.mts$|Dockerfile$|\.dockerignore$|\.gcloudignore$|DEPLOYMENT\.md$)') {
    throw "Unreviewed source upload path: $normalized"
  }
}
New-Item -ItemType Directory -Force -Path '.deploy' | Out-Null
$files | Set-Content -LiteralPath '.deploy/upload-files.txt'
Write-Host "Reviewed $($files.Count) source files; list: .deploy/upload-files.txt"

$enabled = @(Invoke-Gcloud @('services','list','--enabled','--format=value(config.name)'))
if ($enabled -contains 'run.googleapis.com') {
  $services = @(Read-CloudJson @('run','services','list',"--region=$region"))
  $existing = $services | Where-Object { $_.metadata.name -eq $service }
  if ($existing) {
    $existingImage = $existing.spec.template.spec.containers[0].image
    Write-Host "Existing flex image: $existingImage"
    Write-Host "Existing flex URL: $($existing.status.url)"
    if ($existing.metadata.labels.'flex-app' -ne 'commuter' -and (!$ReviewedExistingImage -or $ReviewedExistingImage -ne $existingImage)) {
      throw 'Existing flex service needs inspection. After confirming it is Flex, pass its exact image with -ReviewedExistingImage. Never overwrite an unrelated app.'
    }
  }
}
if ($PreflightOnly) { Write-Host 'Preflight passed. No cloud resources were changed.'; exit 0 }

$needed = @('run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','secretmanager.googleapis.com')
$missing = @($needed | Where-Object { $enabled -notcontains $_ })
if ($missing.Count) { Invoke-Gcloud (@('services','enable') + $missing) | Out-Host }

# Discover the build identity; do not assume the legacy Cloud Build address.
$builderOutput = Invoke-Gcloud @('builds','get-default-service-account',"--region=$region")
$builderMatch = [regex]::Match(($builderOutput -join ' '), '[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com')
if (!$builderMatch.Success) { throw 'Could not determine the actual Cloud Build service account.' }
$builder = $builderMatch.Value
Write-Host "Build identity: $builder"
$policy = Read-CloudJson @('projects','get-iam-policy',$project)
$builderBinding = $policy.bindings | Where-Object { $_.role -eq 'roles/run.builder' -and $_.members -contains "serviceAccount:$builder" }
if (!$builderBinding) {
  Invoke-Gcloud @('projects','add-iam-policy-binding',$project,"--member=serviceAccount:$builder",'--role=roles/run.builder','--condition=None') | Out-Null
}
$identities = @(Read-CloudJson @('iam','service-accounts','list'))
if (!($identities | Where-Object { $_.email -eq $runtime })) {
  Invoke-Gcloud @('iam','service-accounts','create','flex-runtime','--display-name=Flex commuter runtime') | Out-Host
}
$secrets = @(Read-CloudJson @('secrets','list'))
if (!($secrets | Where-Object { ($_.name -split '/')[-1] -eq $secret })) {
  Invoke-Gcloud @('secrets','create',$secret,'--replication-policy=automatic','--labels=flex-app=commuter') | Out-Host
}
if ($UploadLtaKey) {
  # The key goes only into an ignored, excluded temporary file; never arguments,
  # console output, source archive or image. Root config wins over retired config.
  $envPath = Join-Path $appRoot '.env.local'
  if (!(Test-Path -LiteralPath $envPath)) { $envPath = Join-Path $appRoot 'PS2/app/.env.local' }
  $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*LTA_ACCOUNT_KEY\s*=' } | Select-Object -First 1
  if (!$line) { throw 'Enter LTA_ACCOUNT_KEY in the ignored root .env.local using your editor.' }
  $key = ($line -replace '^\s*LTA_ACCOUNT_KEY\s*=','').Trim().Trim('"').Trim("'")
  if (!$key) { throw 'LTA_ACCOUNT_KEY is empty.' }
  $secretTemp = Join-Path (Join-Path $appRoot '.deploy') ([guid]::NewGuid().ToString() + '.secret')
  try {
    [IO.File]::WriteAllText($secretTemp, $key, (New-Object Text.UTF8Encoding($false)))
    $version = Read-CloudJson @('secrets','versions','add',$secret,"--data-file=$secretTemp")
    $LtaSecretVersion = ($version.name -split '/')[-1]
  } finally {
    $key = $null
    if (Test-Path -LiteralPath $secretTemp) { Remove-Item -LiteralPath $secretTemp }
  }
}
if (!$LtaSecretVersion) {
  $versions = @(Read-CloudJson @('secrets','versions','list',$secret,'--filter=state:ENABLED'))
  $LtaSecretVersion = ($versions | ForEach-Object { [int](($_.name -split '/')[-1]) } | Sort-Object -Descending | Select-Object -First 1)
}
if (!$LtaSecretVersion) { throw 'Secret has no enabled version. Use -UploadLtaKey or securely add a version in Secret Manager console.' }
Invoke-Gcloud @('secrets','add-iam-policy-binding',$secret,"--member=serviceAccount:$runtime",'--role=roles/secretmanager.secretAccessor','--condition=None') | Out-Null

$commit = & git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { $commit = 'source-archive' }
Write-Host "Deploying reviewed working-tree source (base $commit), LTA secret version $LtaSecretVersion."
Invoke-Gcloud @('run','deploy',$service,'--source=.',"--region=$region", "--service-account=$runtime",
  "--build-service-account=projects/$project/serviceAccounts/$builder",
  "--update-secrets=LTA_ACCOUNT_KEY=${secret}:$LtaSecretVersion", '--update-env-vars=NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1',
  '--labels=flex-app=commuter','--no-invoker-iam-check','--ingress=all','--cpu=1','--memory=1Gi','--min=0','--max=2','--concurrency=20','--timeout=60') | Out-Host

$deployed = Read-CloudJson @('run','services','describe',$service,"--region=$region")
$ready = $deployed.status.conditions | Where-Object { $_.type -eq 'Ready' }
if ($ready.status -ne 'True') { throw 'Revision is not ready; do not report deployment success.' }
$revision = $deployed.status.latestReadyRevisionName
$traffic = $deployed.status.traffic | Where-Object { $_.revisionName -eq $revision -and $_.percent -eq 100 }
if (!$traffic) { throw 'Latest ready revision is not receiving 100% traffic. Inspect before changing traffic.' }
$url = $deployed.status.url
if ($url -notmatch '^https://[a-zA-Z0-9.-]+\.run\.app$') { throw 'Unexpected service URL.' }
$summary = [ordered]@{ status='DEPLOYED; public smoke checks pending'; url=$url; project=$project; region=$region; service=$service; revision=$revision; baseCommit=$commit; source='working tree including local changes'; ltaSecretVersion=$LtaSecretVersion; buildIdentity=$builder; runtimeIdentity=$runtime }
$summary | ConvertTo-Json | Set-Content -LiteralPath '.deploy/deployment.json'
Write-Host "Ready revision: $revision; public URL: $url"
node scripts/smoke.mjs $url
if ($LASTEXITCODE -ne 0) { throw 'Public smoke checks failed; deployment is not verified.' }
$summary.status = 'PUBLIC SMOKE PASSED; browser, phone and log review tracked separately'
$summary | ConvertTo-Json | Set-Content -LiteralPath '.deploy/deployment.json'
Write-Host 'Public HTTP/API smoke checks passed. Browser, phone and log review remain required; see DEPLOYMENT.md.'
