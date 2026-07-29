[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $SourceRoot
)

$ErrorActionPreference = 'Stop'

$portableRoot = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $portableRoot 'app'
$source = (Resolve-Path -LiteralPath $SourceRoot).Path

if (-not (Test-Path -LiteralPath (Join-Path $source 'index.php') -PathType Leaf)) {
    throw "SourceRoot is not a valid Pamantau source directory: $source"
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null

$rootFiles = @(
    'index.php',
    'login.php',
    'update.php',
    'update.sh',
    'version.json'
)
$rootDirectories = @(
    'api',
    'assets',
    'cli',
    'database',
    'includes'
)

foreach ($name in $rootFiles) {
    $item = Join-Path $source $name
    if (Test-Path -LiteralPath $item -PathType Leaf) {
        Copy-Item -LiteralPath $item -Destination $destination -Force
    }
}

foreach ($name in $rootDirectories) {
    $item = Join-Path $source $name
    if (Test-Path -LiteralPath $item -PathType Container) {
        Copy-Item -LiteralPath $item -Destination $destination -Recurse -Force
    }
}

Get-ChildItem -LiteralPath $source -File -Filter '*.json' |
    Where-Object Name -ne 'version.json' |
    ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }

Write-Host "Application source copied to: $destination"
