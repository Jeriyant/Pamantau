[CmdletBinding()]
param(
    [string] $SourceRoot = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$portableRoot = Join-Path $source 'pamantau-portable'
$versionFile = Join-Path $source 'version.json'
$serverExe = Join-Path $portableRoot 'PamantauServer.exe'
$distRoot = Join-Path $source 'dist-pack'
$appStage = Join-Path $distRoot 'app-release'
$portableStage = Join-Path $distRoot 'portable-release'

if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) {
    throw "Version file not found: $versionFile"
}
if (-not (Test-Path -LiteralPath $serverExe -PathType Leaf)) {
    throw "Build PamantauServer.exe before packaging the release."
}

$versionData = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
$version = [string] $versionData.version
if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid release version: $version"
}

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
$distResolved = (Resolve-Path -LiteralPath $distRoot).Path
foreach ($stage in @($appStage, $portableStage)) {
    $stageFull = [IO.Path]::GetFullPath($stage)
    if (-not $stageFull.StartsWith(
        $distResolved + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Refusing to clean a staging path outside dist-pack: $stageFull"
    }
    if (Test-Path -LiteralPath $stageFull) {
        Remove-Item -LiteralPath $stageFull -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $stageFull | Out-Null
}

function Copy-PamantauApplication {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Destination
    )

    foreach ($name in @(
        'index.php',
        'login.php',
        'update.php',
        'update.sh',
        'version.json'
    )) {
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination $Destination -Force
    }

    foreach ($name in @('api', 'assets', 'cli', 'includes')) {
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination $Destination -Recurse -Force
    }

    $databaseTarget = Join-Path $Destination 'database'
    New-Item -ItemType Directory -Force -Path $databaseTarget | Out-Null
    $databaseHtaccess = Join-Path $source 'database\.htaccess'
    if (Test-Path -LiteralPath $databaseHtaccess -PathType Leaf) {
        Copy-Item -LiteralPath $databaseHtaccess -Destination $databaseTarget -Force
    }
}

Copy-PamantauApplication -Destination $appStage

foreach ($name in @(
    'PamantauServer.exe',
    'PORTABLE-MANIFEST.json',
    'README.md',
    'REQUIREMENTS.md'
)) {
    Copy-Item -LiteralPath (Join-Path $portableRoot $name) -Destination $portableStage -Force
}

foreach ($name in @(
    'licenses',
    'php',
    'prerequisites',
    'scripts',
    'server',
    'server-src'
)) {
    Copy-Item -LiteralPath (Join-Path $portableRoot $name) -Destination $portableStage -Recurse -Force
}

foreach ($relativeBuildPath in @('server-src\bin', 'server-src\obj')) {
    $buildPath = Join-Path $portableStage $relativeBuildPath
    if (Test-Path -LiteralPath $buildPath) {
        Remove-Item -LiteralPath $buildPath -Recurse -Force
    }
}

$portableApp = Join-Path $portableStage 'app'
New-Item -ItemType Directory -Force -Path $portableApp | Out-Null
Copy-PamantauApplication -Destination $portableApp

$portableData = Join-Path $portableStage 'data'
foreach ($name in @('logs', 'sessions', 'temp', 'update-work', 'update-backups')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $portableData $name) | Out-Null
}

$appZip = Join-Path $source 'pamantau-dist.zip'
$portableZip = Join-Path $source ("Pamantau-Portable-v{0}-win-x64.zip" -f $version)
foreach ($archive in @($appZip, $portableZip)) {
    if (Test-Path -LiteralPath $archive) {
        Remove-Item -LiteralPath $archive -Force
    }
}

Compress-Archive -Path (Join-Path $appStage '*') -DestinationPath $appZip -CompressionLevel Optimal
Compress-Archive -Path (Join-Path $portableStage '*') -DestinationPath $portableZip -CompressionLevel Optimal

$artifacts = foreach ($archive in @($appZip, $portableZip)) {
    $item = Get-Item -LiteralPath $archive
    [pscustomobject]@{
        File = $item.Name
        Size = $item.Length
        SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant()
    }
}

$artifacts | Format-Table -AutoSize
