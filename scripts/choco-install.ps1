Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Make native command failures behave like errors in PS7+ (prevents "choco failed but we continued" style issues)
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
  $global:PSNativeCommandUseErrorActionPreference = $true
}

# ---------------------------
# Config
# ---------------------------
$NodeMajor = 20
$Arch = "x64"

# Allow selecting an existing Node only if explicitly permitted; default is to prefer toolcache/portable/download
$AllowExistingNode = $false

# Cache under repo tmp (so your CI cache can persist it)
$CacheRoot = Join-Path $PSScriptRoot "..\tmp"
$NodeCache = Join-Path $CacheRoot "node-cache"
New-Item -Path $NodeCache -ItemType Directory -Force | Out-Null

# Optional: semicolon-separated list of choco packages to install, e.g. "git;7zip;cmake"
$ChocoPackages = @()
if ($env:CHOCO_PACKAGES) {
  $ChocoPackages = $env:CHOCO_PACKAGES.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
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

function Find-ToolcacheNodeBin([int] $major, [string] $arch) {
  $toolcache = $env:RUNNER_TOOL_CACHE
  if (-not $toolcache -or -not (Test-Path -LiteralPath $toolcache)) {
    $toolcache = "C:\hostedtoolcache\windows"
  }

  $nodeRoot = Join-Path $toolcache "node"
  if (-not (Test-Path -LiteralPath $nodeRoot)) { return $null }

  $best = Get-ChildItem -LiteralPath $nodeRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "$major.*" } |
    ForEach-Object {
      $ver = Parse-Version $_.Name
      if ($ver) { [pscustomobject]@{ Ver = $ver; Dir = $_.FullName } }
    } |
    Sort-Object Ver -Descending |
    Select-Object -First 1

  if (-not $best) { return $null }

  $bin = Join-Path $best.Dir $arch
  if ((Test-Path -LiteralPath (Join-Path $bin "node.exe")) -and (Test-Path -LiteralPath (Join-Path $bin "npm.cmd"))) {
    return $bin
  }
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

function Ensure-PortableNode([string] $version, [string] $arch, [string] $cacheDir) {
  $zipName = "node-v$version-win-$arch.zip"
  $zipPath = Join-Path $cacheDir $zipName
  $dirPath = Join-Path $cacheDir "node-v$version-win-$arch"
  $exePath = Join-Path $dirPath "node.exe"
  $npmPath = Join-Path $dirPath "npm.cmd"

  if ((Test-Path -LiteralPath $exePath) -and (Test-Path -LiteralPath $npmPath)) { return $dirPath }

  $base = "https://nodejs.org/dist/v$version"
  $zipUrl = "$base/$zipName"
  $shaUrl = "$base/SHASUMS256.txt"
  $shaPath = Join-Path $cacheDir "SHASUMS256-v$version.txt"

  if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -MaximumRedirection 5
  }
  if (-not (Test-Path -LiteralPath $shaPath -PathType Leaf)) {
    Invoke-WebRequest -Uri $shaUrl -OutFile $shaPath -MaximumRedirection 5
  }

  $line = (Select-String -LiteralPath $shaPath -Pattern ([regex]::Escape($zipName)) | Select-Object -First 1).Line
  if (-not $line) { throw "No hash entry for $zipName in SHASUMS256.txt" }
  $expected = ($line -split '\s+')[0].Trim().ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    throw "SHA256 mismatch for $zipName"
  }

  Expand-Archive -LiteralPath $zipPath -DestinationPath $cacheDir -Force

  if (-not ((Test-Path -LiteralPath $exePath) -and (Test-Path -LiteralPath $npmPath))) {
    throw "Portable Node extraction missing node/npm: $dirPath"
  }
  return $dirPath
}

function Find-BestCachedPortableNodeBin([int] $major, [string] $arch, [string] $cacheDir) {
  $best = Get-ChildItem -LiteralPath $cacheDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "node-v$major.*-win-$arch" } |
    ForEach-Object {
      if ($_.Name -match "^node-v(\d+\.\d+\.\d+)-win-$arch$") {
        $ver = Parse-Version $Matches[1]
        $exe = Join-Path $_.FullName "node.exe"
        $npm = Join-Path $_.FullName "npm.cmd"
        if ($ver -and (Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $npm)) {
          [pscustomobject]@{ Ver = $ver; Dir = $_.FullName }
        }
      }
    } |
    Sort-Object Ver -Descending |
    Select-Object -First 1

  if ($best) { return $best.Dir }
  return $null
}

function Add-ToGitHubPath([string] $dir) {
  if ($env:GITHUB_PATH) {
    $dir | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
  }
  $env:Path = "$dir;$env:Path"
}

# ---------------------------
# 1) Optional choco installs
# ---------------------------
if ($ChocoPackages.Count -gt 0) {
  if (-not $env:ChocolateyInstall) { throw "CHOCO_PACKAGES set but Chocolatey not available." }

  Write-Host "Installing choco packages: $($ChocoPackages -join ', ')"
  foreach ($p in $ChocoPackages) {
    & choco install $p -y --no-progress
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  # Pull registry env var changes from those installs into this session
  if ($env:ChocolateyInstall) {
    $profile = Join-Path $env:ChocolateyInstall "helpers\chocolateyProfile.psm1"
    if (Test-Path -LiteralPath $profile) {
      Import-Module $profile -Force -ErrorAction SilentlyContinue | Out-Null
    }
  }
  $cmd = Get-Command Update-SessionEnvironment -ErrorAction SilentlyContinue
  if ($cmd) { Update-SessionEnvironment }
}

# ---------------------------
# 2) Select Node (paired node/npm)
# ---------------------------
$selected = $null

# If explicitly allowed, reuse existing node only if it matches major and has npm colocated
if ($AllowExistingNode) {
  try {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $existingBin = Split-Path -Parent $nodeExe
    $v = Parse-Version ((& node -v).Trim())
    if ($v -and $v.Major -eq $NodeMajor -and (Test-Path -LiteralPath (Join-Path $existingBin "npm.cmd"))) {
      $selected = $existingBin
      Write-Host "Using existing Node v$($v.ToString()) from $selected"
    }
  } catch {}
}

# Prefer toolcache
if (-not $selected) {
  $bin = Find-ToolcacheNodeBin -major $NodeMajor -arch $Arch
  if ($bin) {
    $selected = $bin
    Write-Host "Selecting Node from toolcache: $selected"
  }
}

# Cached portable
if (-not $selected) {
  $cached = Find-BestCachedPortableNodeBin -major $NodeMajor -arch $Arch -cacheDir $NodeCache
  if ($cached) {
    $selected = $cached
    Write-Host "Selecting Node from cached portable zip: $selected"
  }
}

# Optional download
if (-not $selected) {
  if ($env:ALLOW_NODE_DOWNLOAD -eq "0") {
    throw "No Node $NodeMajor.x found in toolcache/cache and ALLOW_NODE_DOWNLOAD=0"
  }
  $latest = Get-LatestNodeMajorVersion -Major $NodeMajor
  $selected = Ensure-PortableNode -version $latest -arch $Arch -cacheDir $NodeCache
  Write-Host "Selecting Node from downloaded portable zip: $selected"
}

# Apply selection to PATH and GITHUB_PATH (next steps) and current step
Add-ToGitHubPath $selected

# Final verification: ensure npm is colocated and running under Node major
$nodeCmd = Get-Command node -ErrorAction Stop
$npmCmd = Get-Command npm -ErrorAction Stop
$nodeDir = Split-Path -Parent $nodeCmd.Source
$npmDir = Split-Path -Parent $npmCmd.Source
Write-Host "node path: $($nodeCmd.Source)"
Write-Host "npm path:  $($npmCmd.Source)"
if ($nodeDir -ne $npmDir) { throw "node and npm are not colocated: $nodeDir vs $npmDir" }

$nodeV = (& node -v).Trim()
$npmV = (& npm -v).Trim()
$npmInfo = npm version --json | ConvertFrom-Json
$npmRuntimeNodeV = $npmInfo.node
$npmRuntimeParsed = Parse-Version $npmRuntimeNodeV
Write-Host "Using Node: $nodeV"
Write-Host "npm version: $npmV"
Write-Host "npm runtime node: $npmRuntimeNodeV"

$nv = Parse-Version $nodeV
if (-not $nv -or $nv.Major -ne $NodeMajor) { throw "node is not v$NodeMajor (got $nodeV)" }
if (-not $npmRuntimeParsed -or $npmRuntimeParsed.Major -ne $NodeMajor) { throw "npm is not running under Node $NodeMajor (got $npmRuntimeNodeV)" }
