# scripts/verify-store.ps1
# Verifies Phase 2: WooCommerce Storefront, Products API, and Orders API

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " Verifying WooCommerce Store & REST API   "
Write-Host "=========================================="

# 1. Storefront HTTP Check
Write-Host "`n[1/3] Testing Storefront HTTP connection..."
$storeUrl = "http://store.127.0.0.1.nip.io"
$storeRes = Invoke-WebRequest -Uri $storeUrl -UseBasicParsing -TimeoutSec 10
Write-Host "Storefront Status: $($storeRes.StatusCode) OK" -ForegroundColor Green

# 2. REST API /products Check
Write-Host "`n[2/3] Testing WooCommerce REST API /products..."
$key = "ck_urumi_live_test_key_123"
$secret = "cs_urumi_live_test_secret_123"
$authPair = "${key}:${secret}"
$encodedAuth = [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes($authPair))
$headers = @{
    Authorization = "Basic $encodedAuth"
}

$productsUrl = "http://store.127.0.0.1.nip.io/wp-json/wc/v3/products"
$products = Invoke-RestMethod -Uri $productsUrl -Headers $headers -TimeoutSec 10
Write-Host "SUCCESS: Authenticated and retrieved $($products.Count) products:" -ForegroundColor Green
foreach ($p in $products) {
    Write-Host "  - Product #$($p.id): '$($p.name)' | Price: `$$($p.price) | Status: $($p.status)"
}

# 3. REST API /orders Check
Write-Host "`n[3/3] Testing WooCommerce REST API /orders..."
$ordersUrl = "http://store.127.0.0.1.nip.io/wp-json/wc/v3/orders"
$orders = Invoke-RestMethod -Uri $ordersUrl -Headers $headers -TimeoutSec 10
Write-Host "SUCCESS: Authenticated and retrieved $($orders.Count) orders:" -ForegroundColor Green
foreach ($o in $orders) {
    Write-Host "  - Order #$($o.id): Customer '$($o.billing.first_name) $($o.billing.last_name)' | Total: `$$($o.total) | Status: $($o.status) | Method: $($o.payment_method_title)"
}

Write-Host "`n=========================================="
Write-Host " Phase 2 WooCommerce Store: 100% VERIFIED!" -ForegroundColor Green
Write-Host "=========================================="
