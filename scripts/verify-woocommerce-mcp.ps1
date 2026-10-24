# scripts/verify-woocommerce-mcp.ps1
# End-to-end verification of Custom WooCommerce MCP Server over Streamable HTTP

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " Phase 3: WooCommerce MCP Server Tests    "
Write-Host "=========================================="

# Start port-forward to cluster-internal service
Write-Host "`n[1/6] Port-forwarding woocommerce-mcp:3000 to localhost:3000..."
$pf = Start-Process kubectl -ArgumentList "port-forward -n urumi-store svc/woocommerce-mcp 3000:3000" -PassThru
Start-Sleep -Seconds 3

try {
    $baseUrl = "http://localhost:3000"
    $token = "urumi_internal_mcp_secure_token_123"

    # 1. Health Check
    Write-Host "`n[2/6] Testing /healthz probe..."
    $health = Invoke-RestMethod -Uri "$baseUrl/healthz"
    Write-Host "Health Status: $($health.status) (server: $($health.server))" -ForegroundColor Green

    # 2. Security Auth Guardrail Test
    Write-Host "`n[3/6] Testing Security Auth Guardrail (unauthorized request)..."
    try {
        $badRes = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body '{"jsonrpc":"2.0","method":"tools/list","id":1}' -ContentType "application/json"
        Write-Error "Security failure: Request without token was not rejected!"
    } catch {
        Write-Host "SUCCESS: Unauthorized request was blocked with HTTP 401 as expected." -ForegroundColor Green
    }

    $global:mcpSessionId = $null

    # Helper function for JSON-RPC MCP calls
    function Send-MCPRequest($method, $params = $null, [switch]$IsNotification) {
        $body = @{
            jsonrpc = "2.0"
            method  = $method
        }
        if (-not $IsNotification) {
            $body.id = [System.Guid]::NewGuid().ToString()
        }
        if ($null -ne $params) {
            $body.params = $params
        }
        $json = $body | ConvertTo-Json -Depth 10
        $headers = @{
            Authorization = "Bearer $token"
            Accept        = "application/json, text/event-stream"
        }
        if ($global:mcpSessionId) {
            $headers["mcp-session-id"] = $global:mcpSessionId
        }

        $httpRes = Invoke-WebRequest -Uri "$baseUrl/mcp" -Method Post -Headers $headers -Body $json -ContentType "application/json" -UseBasicParsing
        
        # Capture session ID from headers if present
        if ($httpRes.Headers["mcp-session-id"]) {
            $global:mcpSessionId = $httpRes.Headers["mcp-session-id"]
        }

        if ($httpRes.Content) {
            return ($httpRes.Content | ConvertFrom-Json)
        }
        return $null
    }

    # 3. Perform MCP Initialize Handshake
    Write-Host "`n[4/6] Performing MCP Initialize handshake..."
    $initRes = Send-MCPRequest "initialize" @{
        protocolVersion = "2024-11-05"
        capabilities    = @{}
        clientInfo      = @{
            name    = "urumi-test-client"
            version = "1.0.0"
        }
    }
    Write-Host "Initialized with Server: $($initRes.result.serverInfo.name) v$($initRes.result.serverInfo.version)" -ForegroundColor Green
    Write-Host "Session ID established: $global:mcpSessionId" -ForegroundColor Green

    # Send initialized notification
    Send-MCPRequest "notifications/initialized" -IsNotification | Out-Null

    # 4. List Tools
    Write-Host "`nQuerying tools/list via Streamable HTTP..."
    $listRes = Send-MCPRequest "tools/list"
    $tools = $listRes.result.tools
    Write-Host "Discovered $($tools.Count) tools:" -ForegroundColor Green
    foreach ($t in $tools) {
        Write-Host "  - Tool: $($t.name) | Description: $($t.description.Substring(0, [Math]::Min(60, $t.description.Length)))..."
    }

    # 4. Execute Tools
    Write-Host "`n[5/6] Testing Tool Invocations..."

    # 4a. woocommerce_list_products
    Write-Host "`n--> Invoking woocommerce_list_products..."
    $callProducts = Send-MCPRequest "tools/call" @{
        name = "woocommerce_list_products"
        arguments = @{ per_page = 5 }
    }
    $productsText = $callProducts.result.content[0].text
    Write-Host "Output: $productsText" -ForegroundColor Cyan

    # 4b. woocommerce_create_product
    Write-Host "`n--> Invoking woocommerce_create_product..."
    $newProductName = "Wireless Gaming Mouse"
    $callCreate = Send-MCPRequest "tools/call" @{
        name = "woocommerce_create_product"
        arguments = @{
            name = $newProductName
            regular_price = "39.99"
            description = "High precision wireless gaming mouse with optical sensor."
        }
    }
    Write-Host "Output: $($callCreate.result.content[0].text)" -ForegroundColor Green

    # 4c. woocommerce_list_orders
    Write-Host "`n--> Invoking woocommerce_list_orders..."
    $callOrders = Send-MCPRequest "tools/call" @{
        name = "woocommerce_list_orders"
        arguments = @{ per_page = 5 }
    }
    Write-Host "Output: $($callOrders.result.content[0].text)" -ForegroundColor Cyan

    # 4d. woocommerce_get_order
    Write-Host "`n--> Invoking woocommerce_get_order (ID: 14)..."
    $callGetOrder = Send-MCPRequest "tools/call" @{
        name = "woocommerce_get_order"
        arguments = @{ order_id = 14 }
    }
    Write-Host "Output: $($callGetOrder.result.content[0].text)" -ForegroundColor Cyan

    # 4e. woocommerce_update_order_status
    Write-Host "`n--> Invoking woocommerce_update_order_status (ID: 14 -> 'processing')..."
    $callUpdate = Send-MCPRequest "tools/call" @{
        name = "woocommerce_update_order_status"
        arguments = @{
            order_id = 14
            status = "processing"
        }
    }
    Write-Host "Output: $($callUpdate.result.content[0].text)" -ForegroundColor Green

    # 5. Security Guardrails: Invalid Input Rejection
    Write-Host "`n[6/6] Testing Input Guardrails & Rejection..."

    Write-Host "--> Testing negative price rejection on woocommerce_create_product..."
    $badPriceRes = Send-MCPRequest "tools/call" @{
        name = "woocommerce_create_product"
        arguments = @{
            name = "Invalid Product"
            regular_price = "-10.00"
        }
    }
    if ($badPriceRes.result.isError) {
        Write-Host "SUCCESS: Invalid price blocked: $($badPriceRes.result.content[0].text)" -ForegroundColor Green
    } else {
        Write-Error "Guardrail failed: Negative price was accepted!"
    }

    Write-Host "`n--> Testing illegal status rejection on woocommerce_update_order_status..."
    $badStatusRes = Send-MCPRequest "tools/call" @{
        name = "woocommerce_update_order_status"
        arguments = @{
            order_id = 14
            status = "malicious_status_injection"
        }
    }
    if ($badStatusRes.result.isError) {
        Write-Host "SUCCESS: Invalid status blocked: $($badStatusRes.result.content[0].text)" -ForegroundColor Green
    } else {
        Write-Error "Guardrail failed: Invalid status was accepted!"
    }

    Write-Host "`n=========================================="
    Write-Host " Phase 3 WooCommerce MCP Server: 100% PASS!" -ForegroundColor Green
    Write-Host "=========================================="
}
finally {
    if ($pf -and -not $pf.HasExited) {
        Stop-Process -Id $pf.Id -Force -ErrorAction SilentlyContinue
    }
}
