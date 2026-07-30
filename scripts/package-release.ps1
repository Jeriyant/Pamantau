[CmdletBinding()]
param(
    [string] $SourceRoot = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = Split-Path -Parent $PSScriptRoot
}

$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$versionFile = Join-Path $source 'version.json'
$distRoot = Join-Path $source 'dist-pack'
$stage = Join-Path $distRoot 'web-release'
$archive = Join-Path $source 'pamantau-dist.zip'

if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) {
    throw "Version file not found: $versionFile"
}

$version = [string] ((Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json).version)
if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid release version: $version"
}

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
$distResolved = (Resolve-Path -LiteralPath $distRoot).Path
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

foreach ($name in @(
    'index.php',
    'login.php',
    'update.php',
    'update.sh',
    'version.json'
)) {
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination $stageFull -Force
}

foreach ($name in @('api', 'assets', 'cli', 'includes')) {
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination $stageFull -Recurse -Force
}

$databaseTarget = Join-Path $stageFull 'database'
New-Item -ItemType Directory -Force -Path $databaseTarget | Out-Null
$databaseHtaccess = Join-Path $source 'database\.htaccess'
if (Test-Path -LiteralPath $databaseHtaccess -PathType Leaf) {
    Copy-Item -LiteralPath $databaseHtaccess -Destination $databaseTarget -Force
}

if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
}
Compress-Archive -Path (Join-Path $stageFull '*') -DestinationPath $archive -CompressionLevel Optimal

$item = Get-Item -LiteralPath $archive
[pscustomobject]@{
    Version = $version
    File = $item.Name
    Size = $item.Length
    SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant()
} | Format-List
