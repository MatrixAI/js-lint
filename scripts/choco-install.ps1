Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Make native command failures behave like errors in PS7+ (prevents "choco failed but we continued" style issues)
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
  $global:PSNativeCommandUseErrorActionPreference = $true
}

# ---------------------------
# Config
# ---------------------------
$NodeMajor = if ($env:NODE_MAJOR) { [int]$env:NODE_MAJOR } else { 20 }
$Arch = "x64"

# Cache under repo tmp (so your CI cache can persist it)
$CacheRoot = Join-Path $PSScriptRoot "..\tmp"
$NodeCache = Join-Path $CacheRoot "node-cache"
New-Item -Path $NodeCache -ItemType Directory -Force | Out-Null

# Keep the spirit of the original: ensure choco cache dir exists + source (harmless even if unused here)
if ($env:ChocolateyInstall) {
  $ChocoCache = Join-Path $CacheRoot "chocolatey"
  New-Item -Path $ChocoCache -ItemType Directory -Force | Out-Null
  & choco source remove --name="cache" -y --no-progress 2>$null | Out-Null
  & choco source add --name="cache" --source="$ChocoCache" --priority=1 -y --no-progress | Out-Null
}

# ---------------------------
# Helpers
# ---------------------------
function Parse-Version([string] $v) {
  if (-not $v) { return $null }
  $vv = $v.Trim().TrimStart('v')
  try { return [version]$vv } catch { return $null }
}

function Get-CommandPath([string] $name) {
  try { return (Get-Command $name -ErrorAction Stop).Source } catch { return $null }
}

function Find-ToolcacheNodeHome([int] $Major, [string] $Arch) {
  $toolcache = $env:RUNNER_TOOL_CACHE
  if (-not $toolcache -or -not (Test-Path -LiteralPath $toolcache)) {
    $toolcache = "C:\hostedtoolcache\windows"
  }
  $root = Join-Path $toolcache "node"
  if (-not (Test-Path -LiteralPath $root)) { return $null }

  $best = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "$Major.*" } |
    ForEach-Object {
      $ver = Parse-Version $_.Name
      if ($ver) { [pscustomobject]@{ Ver = $ver; Dir = $_.FullName } }
    } |
    Sort-Object Ver -Descending |
    Select-Object -First 1

  if (-not $best) { return $null }

  $home = Join-Path $best.Dir $Arch
  if (Test-Path -LiteralPath (Join-Path $home "node.exe")) { return $home }
  return $null
}

function Get-LatestNodeMajorVersion([int] $Major) {
  $ProgressPreference = 'SilentlyContinue'
  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -MaximumRedirection 5

  $best = $index |
    Where-Object { $_.version -match "^v$Major\." } |
    ForEach-Object {
      $ver = Parse-Version $_.version
      if ($ver) { [pscustomobject]@{ Ver = $ver; S = $_.version } }
    } |
    Sort-Object Ver -Descending |
    Select-Object -First 1

  if (-not $best) { throw "No Node v$Major.* found in dist index." }
  return $best.Ver.ToString()
}

function Ensure-PortableNodeHome([string] $Version, [string] $Arch, [string] $CacheDir) {
  $zipName = "node-v$Version-win-$Arch.zip"
  $zipPath = Join-Path $CacheDir $zipName
  $homeDir = Join-Path $CacheDir "node-v$Version-win-$Arch"
  $nodeExe = Join-Path $homeDir "node.exe"

  if (Test-Path -LiteralPath $nodeExe) { return $homeDir }

  $base = "https://nodejs.org/dist/v$Version"
  $zipUrl = "$base/$zipName"
  $shaUrl = "$base/SHASUMS256.txt"
  $shaPath = Join-Path $CacheDir "SHASUMS256-v$Version.txt"

  if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    Write-Host "Downloading Node $Version ($zipName)"
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -MaximumRedirection 5
  }
  if (-not (Test-Path -LiteralPath $shaPath -PathType Leaf)) {
    Invoke-WebRequest -Uri $shaUrl -OutFile $shaPath -MaximumRedirection 5
  }

  # Integrity check (hash from SHASUMS256.txt)
  $line = (Select-String -LiteralPath $shaPath -Pattern ([regex]::Escape($zipName)) | Select-Object -First 1).Line
  if (-not $line) { throw "No hash entry for $zipName in SHASUMS256.txt" }
  $expected = ($line -split '\s+')[0].Trim().ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    throw "SHA256 mismatch for $zipName (expected $expected got $actual)"
  }

  Write-Host "Extracting Node $Version"
  Expand-Archive -LiteralPath $zipPath -DestinationPath $CacheDir -Force

  if (-not (Test-Path -LiteralPath $nodeExe)) {
    throw "node.exe missing after extraction: $nodeExe"
  }
  return $homeDir
}

function Find-BestCachedPortableNodeHome([int] $Major, [string] $Arch, [string] $CacheDir) {
  $best = Get-ChildItem -LiteralPath $CacheDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "node-v$Major.*-win-$Arch" } |
    ForEach-Object {
      if ($_.Name -match "^node-v(\d+\.\d+\.\d+)-win-$Arch$") {
        $ver = Parse-Version $Matches[1]
        $exe = Join-Path $_.FullName "node.exe"
        if ($ver -and (Test-Path -LiteralPath $exe)) { [pscustomobject]@{ Ver = $ver; Dir = $_.FullName } }
      }
    } |
    Sort-Object Ver -Descending |
    Select-Object -First 1

  if ($best) { return $best.Dir }
  return $null
}

function Install-NodeShims([string] $NodeHome) {
  $nodeExe = Join-Path $NodeHome "node.exe"
  $npmCmd  = Join-Path $NodeHome "npm.cmd"
  $npxCmd  = Join-Path $NodeHome "npx.cmd"

  if (-not (Test-Path -LiteralPath $nodeExe)) { throw "Missing $nodeExe" }
  if (-not (Test-Path -LiteralPath $npmCmd))  { throw "Missing $npmCmd" }

  # Shims make PATH irrelevant (survives refreshenv + system PATH ordering)
  function global:node { & $using:nodeExe @args; exit $LASTEXITCODE }
  function global:npm  { & $using:npmCmd  @args; exit $LASTEXITCODE }
  if (Test-Path -LiteralPath $npxCmd) {
    function global:npx { & $using:npxCmd @args; exit $LASTEXITCODE }
  }

  # Also prepend PATH (useful for child processes launched by other tooling)
  $env:Path = "$NodeHome;$env:Path"
  if ($env:GITHUB_PATH) { Add-Content -LiteralPath $env:GITHUB_PATH -Value $NodeHome }

  Write-Host "Pinned Node home: $NodeHome"
}

# ---------------------------
# Select Node home
# ---------------------------
$selectedHome = $null

# 0) If node already exists and is correct major AND has npm next to it, reuse it
$nodePath = Get-CommandPath "node"
if ($nodePath) {
  $v = Parse-Version (& node -v)
  if ($v -and $v.Major -eq $NodeMajor) {
    $home = Split-Path -Parent $nodePath
    if (Test-Path -LiteralPath (Join-Path $home "npm.cmd")) {
      $selectedHome = $home
      Write-Host "Using existing Node v$($v.ToString()) from $selectedHome"
    }
  }
}

# 1) Prefer GH toolcache highest patch for the major
if (-not $selectedHome) {
  $tcHome = Find-ToolcacheNodeHome -Major $NodeMajor -Arch $Arch
  if ($tcHome) {
    $selectedHome = $tcHome
    Write-Host "Selecting Node from toolcache: $selectedHome"
  }
}

# 2) Portable fallback (cache -> download latest)
if (-not $selectedHome) {
  $cached = Find-BestCachedPortableNodeHome -Major $NodeMajor -Arch $Arch -CacheDir $NodeCache
  if ($cached) {
    $selectedHome = $cached
    Write-Host "Selecting Node from cached portable zip: $selectedHome"
  } else {
    $allowDownload = ($env:ALLOW_NODE_DOWNLOAD -ne "0")
    if (-not $allowDownload) {
      throw "No toolcache Node v$NodeMajor found and ALLOW_NODE_DOWNLOAD=0. Failing."
    }
    $latest = Get-LatestNodeMajorVersion -Major $NodeMajor
    $selectedHome = Ensure-PortableNodeHome -Version $latest -Arch $Arch -CacheDir $NodeCache
    Write-Host "Selecting Node from downloaded portable zip: $selectedHome"
  }
}

# Pin node/npm regardless of refreshenv/PATH
Install-NodeShims -NodeHome $selectedHome

# Final verification: ensure npm is actually running under Node major
$nodeV = & node -v
Write-Host "Using Node: $nodeV"
# This is the key proof: npm is backed by the same Node home
$npmNodeV = & npm exec --yes node -v
Write-Host "npm-backed Node: $npmNodeV"

$nv = Parse-Version $nodeV
$nnv = Parse-Version $npmNodeV
if (-not $nv -or $nv.Major -ne $NodeMajor) { throw "node is not v$NodeMajor (got $nodeV)" }
if (-not $nnv -or $nnv.Major -ne $NodeMajor) { throw "npm is not backed by v$NodeMajor (got $npmNodeV)" }
