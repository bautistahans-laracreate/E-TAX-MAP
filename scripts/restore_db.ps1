param(
    [string]$DumpPath = "taxfiling.sql",
    [string]$ContainerName = "taxfiling-postgis",
    [string]$DbName = "taxfiling",
    [string]$DbUser = "taxuser",
    [switch]$SkipMigrate,
    [switch]$SkipCacheRebuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ProjectPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot,
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $PathValue))
}

function Get-ProjectPython {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot
    )

    $candidates = @(
        (Join-Path $ProjectRoot ".venv\Scripts\python.exe"),
        (Join-Path $ProjectRoot "venv\Scripts\python.exe"),
        "python"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -eq "python") {
            $command = Get-Command python -ErrorAction SilentlyContinue
            if ($command) {
                return $command.Source
            }
            continue
        }

        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw "No Python interpreter was found. Create a project venv or ensure python is in PATH."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir ".."))
$resolvedDumpPath = Resolve-ProjectPath -ProjectRoot $projectRoot -PathValue $DumpPath
$pythonExe = Get-ProjectPython -ProjectRoot $projectRoot

if (-not (Test-Path -LiteralPath $resolvedDumpPath)) {
    throw "Dump file '$resolvedDumpPath' was not found."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker is not installed or not available in PATH."
}

& docker inspect $ContainerName *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Container '$ContainerName' was not found."
}

& docker exec $ContainerName pg_isready -U $DbUser -d $DbName *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Database '$DbName' is not ready in container '$ContainerName'."
}

Write-Host "Ensuring PostGIS extension exists..."
& docker exec $ContainerName psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -c "CREATE EXTENSION IF NOT EXISTS postgis;"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to ensure the PostGIS extension exists."
}
Write-Host "Cleaning up existing system schemas..."
& docker exec $ContainerName psql -U $DbUser -d $DbName -c "DROP SCHEMA IF EXISTS ogr_system_tables CASCADE; DROP SCHEMA IF EXISTS tiger CASCADE; DROP SCHEMA IF EXISTS tiger_data CASCADE; DROP SCHEMA IF EXISTS topology CASCADE;"

Write-Host "Restoring '$resolvedDumpPath' into '$DbName'..."
Get-Content -LiteralPath $resolvedDumpPath | & docker exec -i $ContainerName psql -U $DbUser -d $DbName
if ($LASTEXITCODE -ne 0) {
    throw "psql restore failed with exit code $LASTEXITCODE."
}

Push-Location $projectRoot
try {
    if (-not $SkipMigrate) {
        Write-Host "Running Django migrations..."
        & $pythonExe manage.py migrate
        if ($LASTEXITCODE -ne 0) {
            throw "Django migrations failed with exit code $LASTEXITCODE."
        }
    }

    if (-not $SkipCacheRebuild) {
        Write-Host "Rebuilding dashboard cache..."
        & $pythonExe manage.py build_rpt_report_cache
        if ($LASTEXITCODE -ne 0) {
            throw "Dashboard cache rebuild failed with exit code $LASTEXITCODE."
        }
    }
}
finally {
    Pop-Location
}

Write-Host "Database restore complete."
