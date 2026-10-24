# scripts/bootstrap-cluster.ps1
# Bootstraps local Kind cluster with ingress-nginx and host port routing (80/443)

$ErrorActionPreference = "Stop"

Write-Host "==> Checking Docker daemon..."
$dockerReady = $false
for ($i = 0; $i -lt 15; $i++) {
    docker ps 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $dockerReady = $true
        break
    }
    Write-Host "Waiting for Docker daemon to become responsive ($i/15)..."
    Start-Sleep -Seconds 3
}

if (-not $dockerReady) {
    Write-Error "Docker daemon is not running or responsive. Please make sure Docker Desktop is started."
}

Write-Host "==> Docker is responsive."

$binDir = "C:\Users\omkbh.OM.000\bin"
if ($env:Path -notlike "*$binDir*") {
    $env:Path = "$binDir;" + $env:Path
}

Write-Host "==> Checking for existing kind cluster 'urumi-cluster'..."
$ErrorActionPreference = "Continue"
$existingClusters = (& "$binDir\kind.exe" get clusters 2>&1)
$ErrorActionPreference = "Stop"

if ($existingClusters -contains "urumi-cluster") {
    Write-Host "Kind cluster 'urumi-cluster' already exists. Switching context..."
    kubectl cluster-info --context kind-urumi-cluster
} else {
    Write-Host "Creating Kind cluster 'urumi-cluster' with ingress configuration..."
    & "$binDir\kind.exe" create cluster --config "k8s/kind-config.yaml"
}

Write-Host "==> Deploying ingress-nginx for Kind..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

Write-Host "==> Waiting for ingress-nginx controller to be ready (this may take 1-2 minutes)..."
kubectl wait --namespace ingress-nginx `
  --for=condition=ready pod `
  --selector=app.kubernetes.io/component=controller `
  --timeout=180s

Write-Host "==> Ingress-NGINX is ready!"
Write-Host "==> Verifying cluster nodes and pods:"
kubectl get nodes -o wide
kubectl get pods -n ingress-nginx
