Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---- Config ----
$NodeMajor = 20
$Arch = "x64"

# Keep using your repo tmp area so it's easy to cache between runs
$CacheRoot = Join-Path $PSScriptRoot "..\tmp\chocolatey"
$NodeCache = Join-Path $CacheRoot "node"
New-Item -Path $NodeCache -ItemType Directory -Force | Out-Null

# (Optional) keep your original Chocolatey cache source spirit (harmless if you later add more choco pkgs)
if ($env:ChocolateyInstall) {
  New-Item -Path $CacheRoot -ItemType Directory -Force | Out-Null
  & choco source remove --name="cache" -y --no-progress 2>$null | Out-Null
  & choco source add --name="cache" --source="$CacheRoot" --priority=1 -y --no-progress | Out-Null
}

# ---- Helpers ----
function Get-NodeVersionString {
  try { return (& node -v).Trim() } catch { return $null }
}

function Parse-Version([string] $v) {
  if (-not $v) { return $null }
  $vv = $v.Trim().TrimStart('v')
  try { return [version]$vv } catch { return $null }
}

function Prepend-Path([string] $dir) {
  $env:Path = "$dir;$env:Path"
  if ($env:GITHUB_PATH) { Add-Content -LiteralPath $env:GITHUB_PATH -Value $dir }
}

function Patch-RefreshEnvToKeepNodeFirst([string] $nodeBinDir) {
  # Your workflow calls refreshenv AFTER this script.
  # Wrap it so our chosen node stays first.
  $cmd = Get-Command refreshenv -ErrorAction SilentlyContinue
  if (-not $cmd) { return }
  if ($cmd.CommandType -ne 'Function') { return }

  $global:__ORIG_REFRESHENV = $cmd.ScriptBlock
  $global:__NODE_BIN_DIR = $nodeBinDir

  function global:refreshenv {
    if ($global:__ORIG_REFRESHENV) { & $global:__ORIG_REFRESHENV }
    if ($global:__NODE_BIN_DIR) { $env:Path = "$($global:__NODE_BIN_DIR);$env:Path" }
  }
}

function Find-ToolcacheNodeBin {
  param([Parameter(Mandatory)][int] $Major, [ValidateSet('x64','x86')][string] $Arch = 'x64')

  $toolcache = $env:RUNNER_TOOL_CACHE
  if (-not $toolcache -or -not (Test-Path -LiteralPath $toolcache)) {
    # common GH windows hosted path; best-effort fallback
    $toolcache = "C:\hostedtoolcache\windows"
  }

  $nodeRoot = Join-Path $toolcache "node"
  if (-not (Test-Path -LiteralPath $nodeRoot)) { return $null }

  $best = Get-ChildItem -LiteralPath $nodeRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "$Major.*" } |
    ForEach-Object {
      $ver = Parse-Version $_.Name
      if ($ver) { [pscustomobject]@{ Dir = $_.FullName; Ver = $ver } }
    } |
    Sort-Object Ver -Descending |
    Select-Object -First 1

  if (-not $best) { return $null }

  $bin = Join-Path $best.Dir $Arch
  if (Test-Path -LiteralPath (Join-Path $bin "node.exe")) { return $bin }
  return $null
}

function Get-LatestNodeMajorFromIndex {
  param([Parameter(Mandatory)][int] $Major)

  $indexUrl = "https://nodejs.org/dist/index.json"
  $ProgressPreference = 'SilentlyContinue'

  # best-effort TLS nudge
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

  $index = Invoke-RestMethod -Uri $indexUrl -MaximumRedirection 5
  if (-not $index) { throw "Failed to fetch Node dist index." }

  $best = $index |
    Where-Object { $_.version -match "^v$Major\." } |
    ForEach-Object {
      $ver = Parse-Version $_.version
      if ($ver) { [pscustomobject]@{ Ver = $ver; VersionStr = $_.version } }
    } |
    Sort-Object Ver -Descending |
    Select-Object -First 1

  if (-not $best) { throw "Could not find Node v$Major.* in dist index." }
  return $best.Ver.ToString()
}

function Ensure-NodeZip {
  param(
    [Parameter(Mandatory)][string] $Version,
    [Parameter(Mandatory)][string] $CacheDir,
    [ValidateSet('x64','x86')][string] $Arch = 'x64'
  )

  New-Item -Path $CacheDir -ItemType Directory -Force | Out-Null

  $zipName = "node-v$Version-win-$Arch.zip"
  $zipPath = Join-Path $CacheDir $zipName
  $dirPath = Join-Path $CacheDir "node-v$Version-win-$Arch"
  $exePath = Join-Path $dirPath "node.exe"

  if (Test-Path -LiteralPath $exePath) { return $dirPath }

  $base = "https://nodejs.org/dist/v$Version"
  $zipUrl = "$base/$zipName"
  $shaUrl = "$base/SHASUMS256.txt"
  $shaPath = Join-Path $CacheDir "SHASUMS256-v$Version.txt"

  if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    Write-Host "Downloading Node $Version ($zipName) ..."
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -MaximumRedirection 5
  }

  if (-not (Test-Path -LiteralPath $shaPath -PathType Leaf)) {
    Invoke-WebRequest -Uri $shaUrl -OutFile $shaPath -MaximumRedirection 5
  }

  # Verify SHA256 (robust against bad caches / partial downloads)
  $expected = (Select-String -LiteralPath $shaPath -Pattern [regex]::Escape($zipName) | Select-Object -First 1).Line
  if (-not $expected) { throw "SHA file missing entry for $zipName" }
  $expectedHash = ($expected -split '\s+')[0].Trim().ToLowerInvariant()

  $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    throw "SHA256 mismatch for $zipName (expected $expectedHash, got $actualHash)"
  }

  Write-Host "Extracting Node $Version ..."
  Expand-Archive -LiteralPath $zipPath -DestinationPath $CacheDir -Force

  if (-not (Test-Path -LiteralPath $exePath)) {
    throw "Node exe not found after extraction: $exePath"
  }

  return $dirPath
}

function Find-BestCachedNodeDir {
  param([Parameter(Mandatory)][string] $CacheDir, [Parameter(Mandatory)][int] $Major, [string] $Arch = 'x64')

  $dirs = Get-ChildItem -LiteralPath $CacheDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "node-v$Major.*-win-$Arch" } |
    ForEach-Object {
      if ($_.Name -match "^node-v(\d+\.\d+\.\d+)-win-$Arch$") {
        $ver = Parse-Version $Matches[1]
        if ($ver -and (Test-Path -LiteralPath (Join-Path $_.FullName "node.exe"))) {
          [pscustomobject]@{ Dir = $_.FullName; Ver = $ver }
        }
      }
    } |
    Sort-Object Ver -Descending |
    Select-Object -First 1

  if ($dirs) { return $dirs.Dir }
  return $null
}

# ---- Main selection logic ----

# 0) If already Node 20 on PATH, keep it (simple + fastest)
$currentStr = Get-NodeVersionString
$currentVer = Parse-Version $currentStr
if ($currentVer -and $currentVer.Major -eq $NodeMajor) {
  Write-Host "Node already on PATH: $currentStr"
  exit 0
}

# 1) Prefer GH toolcache Node 20 if available
$toolBin = Find-ToolcacheNodeBin -Major $NodeMajor -Arch $Arch
if ($toolBin) {
  Write-Host "Selecting Node from toolcache: $toolBin"
  Prepend-Path $toolBin
  Patch-RefreshEnvToKeepNodeFirst $toolBin

  $v = Parse-Version (Get-NodeVersionString)
  if ($v -and $v.Major -eq $NodeMajor) {
    Write-Host "Using Node: $(& node -v)"
    exit 0
  }
  throw "Toolcache selection failed: node is not v$NodeMajor after PATH prepend."
}

# 2) If no toolcache, attempt to download latest Node 20.x (portable zip)
$selectedDir = $null
$onlineVersion = $null
try {
  $onlineVersion = Get-LatestNodeMajorFromIndex -Major $NodeMajor
  $selectedDir = Ensure-NodeZip -Version $onlineVersion -CacheDir $NodeCache -Arch $Arch
  Write-Host "Selecting Node from downloaded zip: $selectedDir"
} catch {
  Write-Host "Online fetch/download failed: $($_.Exception.Message)"
  Write-Host "Falling back to cached Node if available..."
  $selectedDir = Find-BestCachedNodeDir -CacheDir $NodeCache -Major $NodeMajor -Arch $Arch
  if (-not $selectedDir) {
    throw "No toolcache Node v$NodeMajor found, and no cached Node v$NodeMajor zip available."
  }
  Write-Host "Selecting Node from cache: $selectedDir"
}

Prepend-Path $selectedDir
Patch-RefreshEnvToKeepNodeFirst $selectedDir

# 3) Hard verify (never silently run tests on Node 22 again)
$afterStr = Get-NodeVersionString
$afterVer = Parse-Version $afterStr
if (-not $afterVer -or $afterVer.Major -ne $NodeMajor) {
  $which = (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
  throw "Expected Node v$NodeMajor.*, got '$afterStr' (node at: $which)"
}

Write-Host "Using Node: $afterStr"
