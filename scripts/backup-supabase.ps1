param(
  [string]$OutputRoot = "info/backup"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputRootPath = Join-Path $repoRoot $OutputRoot
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupPath = Join-Path $outputRootPath $stamp
$projectRefPath = Join-Path $repoRoot "supabase/.temp/project-ref"
$dockerPath = "C:/Program Files/Docker/Docker/resources/bin/docker.exe"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  if (-not (Test-Path -LiteralPath $dockerPath)) {
    throw "Docker CLI was not found. Start Docker Desktop before running the backup."
  }
  $env:PATH = "$(Split-Path -Parent $dockerPath);$env:PATH"
}

& docker info --format "{{.ServerVersion}}" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Engine is not available. Start Docker Desktop before running the backup."
}

if (-not (Test-Path -LiteralPath $projectRefPath)) {
  throw "The repository is not linked to a Supabase project."
}

$projectRef = (Get-Content -LiteralPath $projectRefPath -Raw).Trim()
New-Item -ItemType Directory -Path $backupPath | Out-Null

function Invoke-SupabaseDump {
  param(
    [string[]]$DumpArguments,
    [string]$ExpectedFile
  )

  & npx.cmd --yes supabase@latest db dump --linked @DumpArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase dump failed for $ExpectedFile"
  }

  $file = Get-Item -LiteralPath $ExpectedFile -ErrorAction Stop
  if ($file.Length -eq 0) {
    throw "Supabase dump created an empty file: $ExpectedFile"
  }
}

Push-Location $repoRoot
try {
  Invoke-SupabaseDump -DumpArguments @(
    "--role-only", "--file", (Join-Path $backupPath "roles.sql")
  ) -ExpectedFile (Join-Path $backupPath "roles.sql")

  Invoke-SupabaseDump -DumpArguments @(
    "--file", (Join-Path $backupPath "schema.sql")
  ) -ExpectedFile (Join-Path $backupPath "schema.sql")

  Invoke-SupabaseDump -DumpArguments @(
    "--data-only", "--use-copy",
    "--exclude", "storage.buckets_vectors",
    "--exclude", "storage.vector_indexes",
    "--file", (Join-Path $backupPath "data.sql")
  ) -ExpectedFile (Join-Path $backupPath "data.sql")

  Invoke-SupabaseDump -DumpArguments @(
    "--schema", "supabase_migrations",
    "--file", (Join-Path $backupPath "migration-history-schema.sql")
  ) -ExpectedFile (Join-Path $backupPath "migration-history-schema.sql")

  Invoke-SupabaseDump -DumpArguments @(
    "--schema", "supabase_migrations", "--data-only", "--use-copy",
    "--file", (Join-Path $backupPath "migration-history-data.sql")
  ) -ExpectedFile (Join-Path $backupPath "migration-history-data.sql")

  $migrationCount = (
    Select-String -Path (Join-Path $backupPath "migration-history-data.sql") -Pattern '^202[0-9]{11}\s' |
      Measure-Object
  ).Count

  $readme = @"
# OpenSlot Supabase Backup

- Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss K")
- Project ref: $projectRef
- Migration records: $migrationCount
- Format: Supabase CLI logical SQL dump

## Sensitive Data

data.sql contains customer personal data, cancellation tokens, push endpoints,
Auth password hashes, sessions, and refresh tokens. Keep this directory private.
Never commit it, upload it to a public service, or send it by email.

## Files

- roles.sql: custom PostgreSQL roles and grants.
- schema.sql: schema, functions, triggers, constraints, RLS, and policies.
- data.sql: public business data, Auth data, and Storage metadata.
- migration-history-schema.sql: migration history schema.
- migration-history-data.sql: applied migration records.
- manifest.sha256: integrity checksums.

## Not Included

- Actual files stored in Supabase Storage.
- Edge Function deployments and Supabase Secrets.
- API keys, JWT secrets, and database passwords.
- Cloudflare, Resend, DNS, domain, and GitHub configuration.
- Data created after this backup timestamp.

## Restore

Restore into a new Supabase project. Enable required extensions first, then restore
roles, schema, and data. Restore migration history separately. Afterward, redeploy
Edge Functions and verify Auth, Storage, Realtime, Cron, RLS, audits, and regression
tests before routing production traffic to the restored project.
"@
  Set-Content -LiteralPath (Join-Path $backupPath "README.md") -Value $readme -Encoding utf8

  Get-ChildItem -LiteralPath $backupPath -File |
    Where-Object Name -ne "manifest.sha256" |
    Sort-Object Name |
    ForEach-Object {
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      "$hash  $($_.Name)"
    } |
    Set-Content -LiteralPath (Join-Path $backupPath "manifest.sha256") -Encoding utf8
} finally {
  Pop-Location
}

Write-Output "Supabase backup created at $backupPath"
