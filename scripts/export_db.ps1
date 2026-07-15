param(
    [string]$DumpPath = "taxfiling.sql",
    [string]$ContainerName = "taxfiling-postgis",
    [string]$DbName = "taxfiling",
    [string]$DbUser = "taxuser"
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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir ".."))
$resolvedDumpPath = Resolve-ProjectPath -ProjectRoot $projectRoot -PathValue $DumpPath
$dumpDirectory = Split-Path -Parent $resolvedDumpPath
$tempPath = "$resolvedDumpPath.tmp"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker is not installed or not available in PATH."
}

if (-not (Test-Path -LiteralPath $dumpDirectory)) {
    New-Item -ItemType Directory -Path $dumpDirectory -Force | Out-Null
}

& docker inspect $ContainerName *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Container '$ContainerName' was not found."
}

& docker exec $ContainerName pg_isready -U $DbUser -d $DbName *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Database '$DbName' is not ready in container '$ContainerName'."
}

Write-Host "Exporting database '$DbName' from '$ContainerName' to '$resolvedDumpPath'..."

$dumpArgs = @(
    "exec",
    $ContainerName,
    "pg_dump",
    "-U", $DbUser,
    "-d", $DbName,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--encoding=UTF8"
)

try {
    & docker @dumpArgs | Set-Content -LiteralPath $tempPath -Encoding UTF8
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE."
    }

    Move-Item -LiteralPath $tempPath -Destination $resolvedDumpPath -Force
}
finally {
    if (Test-Path -LiteralPath $tempPath) {
        Remove-Item -LiteralPath $tempPath -Force
    }
}

Write-Host "Database export complete."
Write-Host "Next steps:"
Write-Host "  git add $resolvedDumpPath"
Write-Host '  git commit -m "Update database dump"'
Write-Host "  git push"
