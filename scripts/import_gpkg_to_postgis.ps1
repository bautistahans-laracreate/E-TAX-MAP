param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$ContainerName = "taxfiling-postgis",
    [string]$DbName = "taxfiling",
    [string]$DbUser = "taxuser",
    [string]$DbPassword = "pops1245",
    [int]$DbPort = 5433,
    [string]$OgrBin = $null,
    [string]$ProjData = $null,
    [string]$GdalData = $null
)

# --- Dynamic Discovery of OSGeo4W/QGIS ---
if (-not $OgrBin) {
    if ($env:OSGEO4W_ROOT -and (Test-Path $env:OSGEO4W_ROOT)) {
        $OgrBin = Join-Path $env:OSGEO4W_ROOT "bin"
    } else {
        $possibleRoots = New-Object System.Collections.Generic.List[string]
        @("A:\OSGeo4W", "A:\OSGeo4W64", "A:\QGIS", "C:\OSGeo4W", "C:\OSGeo4W64", "D:\OSGeo4W", "D:\OSGeo4W64").ForEach({ $possibleRoots.Add($_) })
        
        # Add QGIS installations from Program Files
        $progFiles = @($env:ProgramFiles, ${env:ProgramFiles(x86)})
        foreach ($pf in $progFiles) {
            if ($pf -and (Test-Path $pf)) {
                try {
                    $qgisDirs = Get-ChildItem $pf -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "QGIS*" }
                    foreach ($dir in $qgisDirs) {
                        $possibleRoots.Add($dir.FullName)
                    }
                } catch {}
            }
        }

        foreach ($root in $possibleRoots) {
            if ($root -and (Test-Path (Join-Path $root "bin\ogr2ogr.exe"))) {
                $OgrBin = Join-Path $root "bin"
                break
            }
        }
    }
}

# If we found or were given OgrBin, try to set ProjData and GdalData if they are null
if ($OgrBin) {
    $root = (Resolve-Path (Join-Path $OgrBin "..")).Path
    if (-not $ProjData) {
        $ProjData = Join-Path $root "share\proj"
    }
    if (-not $GdalData) {
        $GdalData = Join-Path $root "apps\gdal\share\gdal"
    }
    Write-Host "Using GDAL/OGR from: $OgrBin"
}

if ((-not $OgrBin) -or -not (Test-Path (Join-Path $OgrBin "ogr2ogr.exe"))) {
    Write-Error "Could not find ogr2ogr.exe. Please install QGIS/OSGeo4W or provide the path via -OgrBin"
    return
}
# ------------------------------------------

# ------------------------------------------


$ErrorActionPreference = "Stop"

function Escape-SqlLiteral([string]$value) {
    if ($null -eq $value) { return "" }
    return $value.Replace("'", "''")
}

function Get-NormalizedBarangayName([System.IO.FileInfo]$fileInfo) {
    $filename = $fileInfo.BaseName
    $fromFile = [regex]::Match($filename, "^(.*?)\s+[Ss]ection")
    if ($fromFile.Success) {
        return $fromFile.Groups[1].Value.Trim()
    }

    $dir = $fileInfo.Directory
    if ($dir.Name -ieq "sections" -or $dir.Name -ieq "enlargements") {
        $raw = $dir.Parent.Name
    } else {
        $raw = $dir.Name
    }

    # Remove trailing notes like "(9 Sections)" or "[...]" from folder names.
    $clean = ($raw -replace "\s*[\(\[].*$", "").Trim()
    return $clean
}

function Get-SectionNumber([string]$name) {
    $match = [regex]::Match($name, "(?:section|seec|sec)\s*(\d+)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) {
        return [int]$match.Groups[1].Value
    }
    return $null
}

function Invoke-Psql([string]$sql) {
    docker exec -i $ContainerName psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -c $sql | Out-Host
}

function Import-OneFile([string]$filePath) {
    $ogr = Join-Path $OgrBin "ogr2ogr.exe"
    if (-not (Test-Path $ogr)) {
        throw "ogr2ogr.exe not found at $ogr"
    }

    # 1) Try with source CRS auto-detected by GDAL.
    & $ogr `
        --config PROJ_DATA $ProjData `
        --config GDAL_DATA $GdalData `
        -f PostgreSQL `
        "PG:host=localhost port=$DbPort dbname=$DbName user=$DbUser password=$DbPassword" `
        $filePath `
        -nln "tmp_import" `
        -overwrite `
        -lco "GEOMETRY_NAME=geom" `
        -lco "FID=id" `
        -t_srs "EPSG:4326" `
        -nlt "PROMOTE_TO_MULTI" `
        -makevalid `
        -skipfailures

    if ($LASTEXITCODE -eq 0) {
        return
    }

    Write-Warning "Auto CRS import failed. Retrying with source EPSG:3123 for file: $filePath"

    # 2) Fallback for files with missing/incorrect source SRS metadata.
    & $ogr `
        --config PROJ_DATA $ProjData `
        --config GDAL_DATA $GdalData `
        -f PostgreSQL `
        "PG:host=localhost port=$DbPort dbname=$DbName user=$DbUser password=$DbPassword" `
        $filePath `
        -nln "tmp_import" `
        -overwrite `
        -lco "GEOMETRY_NAME=geom" `
        -lco "FID=id" `
        -s_srs "EPSG:3123" `
        -t_srs "EPSG:4326" `
        -nlt "PROMOTE_TO_MULTI" `
        -makevalid `
        -skipfailures

    if ($LASTEXITCODE -ne 0) {
        throw "ogr2ogr failed for file: $filePath"
    }
}

Write-Host "Applying schema..."
$schemaPath = Join-Path $ProjectRoot "scripts\postgis_schema.sql"
Get-Content $schemaPath -Raw | docker exec -i $ContainerName psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName | Out-Host

Invoke-Psql "TRUNCATE cad_maps, pim_barangay_boundaries, pim_sections, pim_enlargements RESTART IDENTITY;"

$cadDir = Join-Path $ProjectRoot "maps\static\CAD"
$pimDir = Join-Path $ProjectRoot "maps\static\PIM"

Write-Host "Importing CAD index map..."
$indexMapPath = Join-Path $cadDir "BarangayBoundaryIndexMap.gpkg"
if (Test-Path $indexMapPath) {
    $source = "BarangayBoundaryIndexMap.gpkg"
    Import-OneFile $indexMapPath

    $sourceSql = Escape-SqlLiteral $source
    Invoke-Psql @"
INSERT INTO cad_maps (barangay_name, source_file, properties, geom)
SELECT "Barangay", '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
} else {
    Write-Warning "BarangayBoundaryIndexMap.gpkg not found in $cadDir. Skipping CAD import."
}

Write-Host "Importing PIM barangay boundary index map..."
$indexMapPath = Join-Path $cadDir "BarangayBoundaryIndexMap.gpkg"
if (Test-Path $indexMapPath) {
    $source = "BarangayBoundaryIndexMap.gpkg"
    Import-OneFile $indexMapPath

    $sourceSql = Escape-SqlLiteral $source
    Invoke-Psql @"
INSERT INTO pim_barangay_boundaries (barangay_name, source_file, properties, geom)
SELECT "Barangay", '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
} else {
    Write-Warning "BarangayBoundaryIndexMap.gpkg not found for PIM boundaries. Skipping."
}

Write-Host "Importing PIM files (supports old and new folder layouts)..."
Get-ChildItem $pimDir -Recurse -Filter *.gpkg -File | ForEach-Object {
    $file = $_.FullName
    $source = $_.Name
    $barangay = Get-NormalizedBarangayName $_
    $baseLower = $_.BaseName.ToLowerInvariant()
    $sectionNumber = Get-SectionNumber $_.BaseName

    Import-OneFile $file

    if ($baseLower -match "enlargement") {
        if ($null -eq $sectionNumber) {
            Write-Warning "Skipping enlargement file with no section number: $file"
            return
        }
        $barangaySql = Escape-SqlLiteral $barangay
        $sourceSql = Escape-SqlLiteral $source
        Invoke-Psql @"
INSERT INTO pim_enlargements (barangay_name, section_number, source_file, properties, geom)
SELECT '$barangaySql', $sectionNumber, '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
    } elseif ($null -ne $sectionNumber) {
        $barangaySql = Escape-SqlLiteral $barangay
        $sourceSql = Escape-SqlLiteral $source
        Invoke-Psql @"
INSERT INTO pim_sections (barangay_name, section_number, source_file, properties, geom)
SELECT '$barangaySql', $sectionNumber, '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
    } else {
        $barangaySql = Escape-SqlLiteral $barangay
        $sourceSql = Escape-SqlLiteral $source
        Invoke-Psql @"
INSERT INTO pim_barangay_boundaries (barangay_name, source_file, properties, geom)
SELECT '$barangaySql', '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
    }
}

Write-Host "Import complete. Summary:"
Invoke-Psql "SELECT 'cad_maps' AS table_name, COUNT(*) AS rows FROM cad_maps;"
Invoke-Psql "SELECT 'pim_barangay_boundaries' AS table_name, COUNT(*) AS rows FROM pim_barangay_boundaries;"
Invoke-Psql "SELECT 'pim_sections' AS table_name, COUNT(*) AS rows FROM pim_sections;"
Invoke-Psql "SELECT 'pim_enlargements' AS table_name, COUNT(*) AS rows FROM pim_enlargements;"
