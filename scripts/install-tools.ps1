# scripts/install-tools.ps1
$ErrorActionPreference = "Stop"

$binDir = "C:\Users\omkbh.OM.000\bin"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    Write-Host "Created directory: $binDir"
}

# 1. Download kind
$kindExe = Join-Path $binDir "kind.exe"
if (-not (Test-Path $kindExe)) {
    Write-Host "Downloading kind v0.25.0..."
    $kindUrl = "https://github.com/kubernetes-sigs/kind/releases/download/v0.25.0/kind-windows-amd64"
    Invoke-WebRequest -Uri $kindUrl -OutFile $kindExe -UseBasicParsing
    Write-Host "Downloaded kind.exe successfully."
} else {
    Write-Host "kind.exe already exists."
}

# 2. Download helm
$helmExe = Join-Path $binDir "helm.exe"
if (-not (Test-Path $helmExe)) {
    Write-Host "Downloading helm v3.16.3..."
    $helmZip = Join-Path $binDir "helm.zip"
    $helmUrl = "https://get.helm.sh/helm-v3.16.3-windows-amd64.zip"
    Invoke-WebRequest -Uri $helmUrl -OutFile $helmZip -UseBasicParsing
    
    $extractDir = Join-Path $binDir "helm-extracted"
    Expand-Archive -Path $helmZip -DestinationPath $extractDir -Force
    Copy-Item (Join-Path $extractDir "windows-amd64\helm.exe") $helmExe -Force
    Remove-Item $helmZip -Force
    Remove-Item $extractDir -Recurse -Force
    Write-Host "Extracted helm.exe successfully."
} else {
    Write-Host "helm.exe already exists."
}

# 3. Add to user PATH if not present
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$binDir", "User")
    Write-Host "Added $binDir to User PATH."
}
$env:Path = "$binDir;" + $env:Path

Write-Host "==> Verifying tool installations:"
& $kindExe version
& $helmExe version
Write-Host "==> Tools installed and verified successfully."
