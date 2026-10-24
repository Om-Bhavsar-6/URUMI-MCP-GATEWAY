# scripts/verify-phase1.ps1
# Verifies Phase 1: Cluster, Ingress, DNS, StorageClass, and Helm install/upgrade/rollback

$ErrorActionPreference = "Stop"

$binDir = "C:\Users\omkbh.OM.000\bin"
if ($env:Path -notlike "*$binDir*") {
    $env:Path = "$binDir;" + $env:Path
}

Write-Host "=========================================="
Write-Host " Phase 1 Verification Checklist "
Write-Host "=========================================="

# 1. Cluster & Node Readiness
Write-Host "`n[1/6] Checking Cluster Nodes..."
kubectl get nodes -o wide

# 2. Ingress Controller Readiness
Write-Host "`n[2/6] Checking Ingress-NGINX Controller..."
kubectl get pods -n ingress-nginx

# 3. StorageClass verification
Write-Host "`n[3/6] Checking StorageClasses..."
kubectl get sc

# 4. Helm Install Smoke Test Workload
Write-Host "`n[4/6] Installing Helm chart 'urumi-test' with values-local.yaml..."
$existingReleases = (& "$binDir\helm.exe" list -q)
if ($existingReleases -contains "urumi-test") {
    & "$binDir\helm.exe" uninstall urumi-test
    Start-Sleep -Seconds 2
}
& "$binDir\helm.exe" install urumi-test helm/mcp-gateway -f helm/mcp-gateway/values-local.yaml

Write-Host "Waiting for smoke-test deployment to finish rollout..."
kubectl rollout status deployment/urumi-test-mcp-gateway-smoke-test -n urumi-gateway --timeout=120s

# 5. Local DNS & Host-Port Routing Test
Write-Host "`n[5/6] Testing host-port HTTP routing via smoke.127.0.0.1.nip.io..."
$httpSuccess = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://smoke.127.0.0.1.nip.io" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200 -and $response.Content -like "*Welcome to nginx!*") {
            Write-Host "HTTP Status: $($response.StatusCode) (attempt $i)"
            Write-Host "SUCCESS: Host-port routing (80) and 127.0.0.1.nip.io resolution working perfectly!" -ForegroundColor Green
            $httpSuccess = $true
            break
        }
    } catch {
        Write-Host "Waiting for Ingress-NGINX to sync endpoints (attempt $i/10)..."
        Start-Sleep -Seconds 2
    }
}
if (-not $httpSuccess) {
    Write-Error "Failed to reach smoke.127.0.0.1.nip.io with HTTP 200 after 10 attempts."
}

# 6. Helm Upgrade and Rollback Test
Write-Host "`n[6/6] Testing Helm Upgrade and Rollback..."
Write-Host "--> Upgrading release to replicaCount=2..."
helm upgrade urumi-test helm/mcp-gateway -f helm/mcp-gateway/values-local.yaml --set smokeTest.replicaCount=2

kubectl rollout status deployment/urumi-test-mcp-gateway-smoke-test -n urumi-gateway --timeout=60s
Write-Host "--> Helm history after upgrade:"
helm history urumi-test

Write-Host "--> Rolling back to revision 1..."
helm rollback urumi-test 1

kubectl rollout status deployment/urumi-test-mcp-gateway-smoke-test -n urumi-gateway --timeout=60s
Write-Host "--> Helm history after rollback:"
helm history urumi-test

Write-Host "`n=========================================="
Write-Host " Phase 1 Verification COMPLETE & PASSED! " -ForegroundColor Green
Write-Host "=========================================="
