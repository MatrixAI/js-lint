Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Save-ChocoPackage {
  param(
    [Parameter(Mandatory)][string] $PackageName,
    [Parameter(Mandatory)][string] $Version,
    [Parameter(Mandatory)][string] $CacheDir
  )

  $pkgDir = Join-Path $env:ChocolateyInstall "lib\$PackageName"

  # Find the actual nupkg name (it is usually Package.Version.nupkg, not Package.nupkg)
  $nupkg = Get-ChildItem -LiteralPath $pkgDir -Filter "$PackageName*.nupkg" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "$PackageName.$Version.nupkg" } |
    Select-Object -First 1

  if (-not $nupkg) {
    throw "Could not find $PackageName.$Version.nupkg in $pkgDir"
  }

  # Expand the nupkg (it's a zip) into the package folder so we can repack it
  $zipPath = "$($nupkg.FullName).zip"
  Copy-Item -LiteralPath $nupkg.FullName -Destination $zipPath -Force
  Expand-Archive -LiteralPath $zipPath -DestinationPath $pkgDir -Force
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue

  # Cleanup zip artifacts
  Remove-Item -LiteralPath (Join-Path $pkgDir "_rels") -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $pkgDir "package") -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $pkgDir "[Content_Types].xml") -Force -ErrorAction SilentlyContinue

  # Pack into the CACHE ROOT (folder sources don't use subfolders)
  New-Item -Path $CacheDir -ItemType Directory -Force | Out-Null
  choco pack (Join-Path $pkgDir "$PackageName.nuspec") --outdir $CacheDir --no-progress | Out-Null
}

# Check for existence of required environment variables
if ( $null -eq $env:ChocolateyInstall -or -not $env:ChocolateyInstall.Trim() ) {
  [Console]::Error.WriteLine('Missing $env:ChocolateyInstall environment variable')
  exit 1
}

$CacheDir = Join-Path $PSScriptRoot "..\tmp\chocolatey"
New-Item -Path $CacheDir -ItemType Directory -Force | Out-Null

# Add the cached packages with source priority 1 (priority 0 = "no priority")
# Make it idempotent for CI
choco source remove --name="cache" -y --no-progress 2>$null | Out-Null
choco source add --name="cache" --source="$CacheDir" --priority=1 -y --no-progress | Out-Null

# We need Node 20.*. Default to 20.5.1 (your original pin), but avoid MSI downgrade fights:
# If Node 20 is already present on the runner, skip choco install unless forced.
$DesiredVersion = "20.5.1"
$ForceInstall = ($env:FORCE_CHOCONODE -eq "1")

$currentNode = $null
try { $currentNode = (& node -v).Trim() } catch {}

if (-not $ForceInstall -and $currentNode -match '^v?20\.') {
  Write-Host "Node already present ($currentNode). Skipping Chocolatey install."
  exit 0
}

# Install nodejs.install (direct installer package; avoids meta-package weirdness)
$nodePkg = "nodejs.install"
choco install $nodePkg --version="$DesiredVersion" --require-checksums -y --no-progress
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Internalise to cache if it doesn't exist yet (flat cache dir)
$cachedNupkg = Join-Path $CacheDir "$nodePkg.$DesiredVersion.nupkg"
if (-not (Test-Path -LiteralPath $cachedNupkg -PathType Leaf)) {
  Save-ChocoPackage -PackageName $nodePkg -Version $DesiredVersion -CacheDir $CacheDir
}
