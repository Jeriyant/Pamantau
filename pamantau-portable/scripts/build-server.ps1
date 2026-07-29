[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$portableRoot = Split-Path -Parent $PSScriptRoot
$projectFile = Join-Path $portableRoot 'server-src\PamantauServer.csproj'
$publishRoot = Join-Path $portableRoot 'data\temp\server-publish'
$publishedExe = Join-Path $publishRoot 'PamantauServer.exe'
$targetExe = Join-Path $portableRoot 'PamantauServer.exe'

if (-not (Test-Path -LiteralPath $projectFile -PathType Leaf)) {
    throw "Webserver project not found: $projectFile"
}

New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null

dotnet publish $projectFile `
    --configuration Release `
    --runtime win-x64 `
    --self-contained true `
    --output $publishRoot

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $publishedExe -PathType Leaf)) {
    throw 'Publishing PamantauServer.exe failed.'
}

Copy-Item -LiteralPath $publishedExe -Destination $targetExe -Force
Write-Host "Completed: $targetExe"
