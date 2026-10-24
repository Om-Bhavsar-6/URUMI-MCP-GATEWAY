# scripts/deploy-store.ps1
# Deploys Phase 2: MariaDB, WordPress, WooCommerce, and runs automated store initialization

$ErrorActionPreference = "Stop"

$binDir = "C:\Users\omkbh.OM.000\bin"
if ($env:Path -notlike "*$binDir*") {
    $env:Path = "$binDir;" + $env:Path
}

Write-Host "=========================================="
Write-Host " Phase 2: WooCommerce Store Deployment    "
Write-Host "=========================================="

# 1. Deploy / Upgrade Helm Release
Write-Host "`n[1/5] Deploying Store components via Helm..."
kubectl delete job store-init-job -n urumi-store --ignore-not-found 2>$null | Out-Null
& "$binDir\helm.exe" upgrade --install urumi helm/mcp-gateway -f helm/mcp-gateway/values-local.yaml --timeout 15m

# 2. Wait for MariaDB to be Ready
Write-Host "`n[2/5] Waiting for MariaDB StatefulSet to be ready..."
kubectl rollout status statefulset/mariadb -n urumi-store --timeout=180s

# 3. Wait for WordPress Deployment to be Ready
Write-Host "`n[3/5] Waiting for WordPress Deployment to be ready..."
kubectl rollout status deployment/wordpress -n urumi-store --timeout=180s

# 4. Wait for Store Init Job to Complete (if running)
$jobExists = kubectl get job store-init-job -n urumi-store --ignore-not-found -o jsonpath='{.metadata.name}'
if ($jobExists) {
    Write-Host "`n[4/5] Waiting for store-init-job to finish WooCommerce setup..."
    kubectl wait --for=condition=complete job/store-init-job -n urumi-store --timeout=180s 2>$null | Out-Null
    Write-Host "--> Store init job logs:"
    kubectl logs job/store-init-job -n urumi-store --tail=30 2>$null
} else {
    Write-Host "`n[4/5] Store already initialized and configured."
}

# 5. Verify Storefront & WooCommerce REST API
Write-Host "`n[5/5] Verifying Storefront & WooCommerce REST API..."

# Wait for Ingress sync
$storeUrl = "http://store.127.0.0.1.nip.io"
$storeSuccess = $false
for ($i = 1; $i -le 15; $i++) {
    try {
        $res = Invoke-WebRequest -Uri $storeUrl -UseBasicParsing -TimeoutSec 10
        if ($res.StatusCode -eq 200) {
            Write-Host "SUCCESS: Storefront loaded at $storeUrl (HTTP 200)" -ForegroundColor Green
            $storeSuccess = $true
            break
        }
    } catch {
        Write-Host "Waiting for Store Ingress to sync (attempt $i/15)..."
        Start-Sleep -Seconds 3
    }
}

if (-not $storeSuccess) {
    Write-Error "Failed to load storefront at $storeUrl"
}

# Test REST API with Consumer Key & Secret
Write-Host "`nTesting WooCommerce REST API v3 /products..."
$key = "ck_urumi_live_test_key_123"
$secret = "cs_urumi_live_test_secret_123"
$authPair = "${key}:${secret}"
$encodedAuth = [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes($authPair))
$headers = @{
    Authorization = "Basic $encodedAuth"
}

$apiUrl = "http://store.127.0.0.1.nip.io/wp-json/wc/v3/products"
try {
    $apiRes = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 15
    Write-Host "SUCCESS: WooCommerce REST API authenticated and returned $($apiRes.Count) products!" -ForegroundColor Green
    foreach ($p in $apiRes) {
        Write-Host "  - Product ID: $($p.id) | Name: '$($p.name)' | Price: `$$($p.price) | Status: $($p.status)"
    }
} catch {
    Write-Error "WooCommerce REST API call failed: $($_.Exception.Message)"
}

Write-Host "`n=========================================="
Write-Host " Phase 2 Store Deployment & Verification PASSED! " -ForegroundColor Green
Write-Host "=========================================="
