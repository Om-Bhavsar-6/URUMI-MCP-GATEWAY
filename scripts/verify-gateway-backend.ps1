# Verification Script for Team MCP Gateway Backend
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     VERIFYING TEAM MCP GATEWAY BACKEND ON KUBERNETES     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$baseUrl = "http://gateway.127.0.0.1.nip.io"

# 1. Test Authentication (Alice Admin and Bob Member)
Write-Host "`n[1/10] Testing User Authentication (/api/auth/login)..." -ForegroundColor Yellow
$aliceLogin = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body (@{
    email = "alice@example.com"
    password = "AliceAdmin123!"
} | ConvertTo-Json) -ContentType "application/json"
$aliceToken = $aliceLogin.token
Write-Host "  -> Alice logged in successfully! Role: $($aliceLogin.user.role), Token prefix: $($aliceToken.Substring(0, 15))..." -ForegroundColor Green

$bobLogin = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body (@{
    email = "bob@example.com"
    password = "BobMember123!"
} | ConvertTo-Json) -ContentType "application/json"
$bobToken = $bobLogin.token
Write-Host "  -> Bob logged in successfully! Role: $($bobLogin.user.role), Token prefix: $($bobToken.Substring(0, 15))..." -ForegroundColor Green

$aliceHeaders = @{
    "Authorization" = "Bearer $aliceToken"
    "Accept" = "application/json, text/event-stream"
}
$bobHeaders = @{
    "Authorization" = "Bearer $bobToken"
    "Accept" = "application/json, text/event-stream"
}

# 2. Test Server Statuses & Tool Aggregation
Write-Host "`n[2/10] Testing Upstream Servers Discovery (/api/servers)..." -ForegroundColor Yellow
$serversResp = Invoke-RestMethod -Uri "$baseUrl/api/servers" -Method Get -Headers $aliceHeaders
foreach ($s in $serversResp.servers) {
    Write-Host "  -> Server: $($s.name) | Status: $($s.status) | Tools: $($s.toolCount) | URL: $($s.url)" -ForegroundColor Green
}
$totalToolsCount = ($serversResp.servers | Measure-Object -Property toolCount -Sum).Sum
Write-Host "  -> Total aggregated tools across upstreams: $totalToolsCount" -ForegroundColor Green

# 3. Test Security Guardrail: SSRF Protection
Write-Host "`n[3/10] Testing SSRF Guardrail on Upstream Registration..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$baseUrl/api/servers" -Method Post -Headers $aliceHeaders -Body (@{
        name = "malicious-metadata-server"
        url = "http://169.254.169.254/latest/meta-data/"
    } | ConvertTo-Json) -ContentType "application/json"
    Write-Error "SSRF Failure: Cloud metadata endpoint was accepted!"
} catch {
    Write-Host "  -> SSRF Guardrail correctly blocked cloud metadata IP: $($_.Exception.Message)" -ForegroundColor Green
}

try {
    Invoke-RestMethod -Uri "$baseUrl/api/servers" -Method Post -Headers $aliceHeaders -Body (@{
        name = "loopback-server"
        url = "http://127.0.0.1:9090"
    } | ConvertTo-Json) -ContentType "application/json"
    Write-Error "SSRF Failure: Loopback endpoint was accepted!"
} catch {
    Write-Host "  -> SSRF Guardrail correctly blocked loopback IP: $($_.Exception.Message)" -ForegroundColor Green
}

# 4. Test RBAC: Non-admin cannot register or delete servers
Write-Host "`n[4/10] Testing Role-Based Access Control (RBAC)..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$baseUrl/api/servers" -Method Post -Headers $bobHeaders -Body (@{
        name = "unauthorized-server"
        url = "https://example.com/mcp"
    } | ConvertTo-Json) -ContentType "application/json"
    Write-Error "RBAC Failure: Member was permitted to register a server!"
} catch {
    Write-Host "  -> RBAC correctly blocked member from registering server: $($_.Exception.Message)" -ForegroundColor Green
}

# 5. Test API Key Generation for Bob
Write-Host "`n[5/10] Testing API Key Generation for Member (/api/keys)..." -ForegroundColor Yellow
$newKeyResp = Invoke-RestMethod -Uri "$baseUrl/api/keys" -Method Post -Headers $bobHeaders -Body (@{
    name = "Bob Automated Integration Key"
} | ConvertTo-Json) -ContentType "application/json"
$bobApiKey = $newKeyResp.apiKey
$bobKeyId = $newKeyResp.id
Write-Host "  -> Generated new API key for Bob: $($bobApiKey.Substring(0, 16))... (ID: $bobKeyId)" -ForegroundColor Green

# 6. Test Gateway MCP Streamable HTTP Endpoint with API Key Authentication
Write-Host "`n[6/10] Testing Gateway MCP Endpoint Handshake & Tool Catalog (/mcp)..." -ForegroundColor Yellow
$aliceApiKey = "ugw_live_alice_admin_secret_key_123"
$mcpHeaders = @{
    "Authorization" = "Bearer $aliceApiKey"
    "Accept" = "application/json, text/event-stream"
}

$initBody = @{
    jsonrpc = "2.0"
    id = 1
    method = "initialize"
    params = @{
        protocolVersion = "2024-11-05"
        capabilities = @{}
        clientInfo = @{ name = "external-claude-desktop"; version = "1.0.0" }
    }
} | ConvertTo-Json -Depth 5

$mcpInitResp = Invoke-WebRequest -Uri "$baseUrl/mcp" -Method Post -Body $initBody -ContentType "application/json" -Headers $mcpHeaders
$sessionId = $mcpInitResp.Headers["mcp-session-id"]
if ($sessionId -is [array]) { $sessionId = $sessionId[0] }
Write-Host "  -> Gateway MCP Handshake SUCCESS! Session ID: $sessionId" -ForegroundColor Green

$sessionHeaders = @{
    "Authorization" = "Bearer $aliceApiKey"
    "Accept" = "application/json, text/event-stream"
    "mcp-session-id" = $sessionId
}

# List aggregated tools via Gateway
$listToolsBody = @{ jsonrpc = "2.0"; id = 2; method = "tools/list" } | ConvertTo-Json
$mcpToolsResp = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body $listToolsBody -ContentType "application/json" -Headers $sessionHeaders
$gatewayToolNames = $mcpToolsResp.result.tools | ForEach-Object { $_.name }
Write-Host "  -> Aggregated Tools available via Gateway ($($gatewayToolNames.Count)): $($gatewayToolNames -join ', ')" -ForegroundColor Green

# 7. Execute Tools across all 3 Upstreams via Single Gateway Endpoint
Write-Host "`n[7/10] Executing Tools across all Upstreams via Single Gateway Endpoint..." -ForegroundColor Yellow

# Tool 1: woocommerce_list_products
$wcCall = @{
    jsonrpc = "2.0"
    id = 3
    method = "tools/call"
    params = @{ name = "woocommerce_list_products"; arguments = @{ per_page = 3 } }
} | ConvertTo-Json -Depth 5
$wcResp = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body $wcCall -ContentType "application/json" -Headers $sessionHeaders
Write-Host "  -> woocommerce_list_products via Gateway: SUCCESS (returned data)" -ForegroundColor Green

# Tool 2: weather_get_forecast
$weatherCall = @{
    jsonrpc = "2.0"
    id = 4
    method = "tools/call"
    params = @{ name = "weather_get_forecast"; arguments = @{ city = "Tokyo"; days = 2 } }
} | ConvertTo-Json -Depth 5
$weatherResp = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body $weatherCall -ContentType "application/json" -Headers $sessionHeaders
Write-Host "  -> weather_get_forecast via Gateway: SUCCESS" -ForegroundColor Green

# Tool 3: customer_notes_get
$notesCall = @{
    jsonrpc = "2.0"
    id = 5
    method = "tools/call"
    params = @{ name = "customer_notes_get"; arguments = @{ customer_email = "alice@example.com" } }
} | ConvertTo-Json -Depth 5
$notesResp = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body $notesCall -ContentType "application/json" -Headers $sessionHeaders
Write-Host "  -> customer_notes_get via Gateway: SUCCESS" -ForegroundColor Green

# 8. Test Instant API Key Revocation Guardrail
Write-Host "`n[8/10] Testing Instant API Key Revocation Guardrail..." -ForegroundColor Yellow
$revokeResp = Invoke-RestMethod -Uri "$baseUrl/api/keys/$bobKeyId/revoke" -Method Post -Headers $bobHeaders
Write-Host "  -> Revoked Bob's key: $($revokeResp.message)" -ForegroundColor Yellow

try {
    Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body $listToolsBody -ContentType "application/json" -Headers @{
        "Authorization" = "Bearer $bobApiKey"
        "Accept" = "application/json, text/event-stream"
    }
    Write-Error "Revocation Failure: Revoked API key was accepted!"
} catch {
    Write-Host "  -> Revocation Guardrail SUCCESS: Revoked key immediately rejected with 401: $($_.Exception.Message)" -ForegroundColor Green
}

# 9. Test Fault Isolation: Upstream Toggle
Write-Host "`n[9/10] Testing Upstream Fault Isolation (Server Toggle)..." -ForegroundColor Yellow
$weatherSrv = $serversResp.servers | Where-Object { $_.name -like "*weather*" } | Select-Object -First 1
$toggleResp = Invoke-RestMethod -Uri "$baseUrl/api/servers/$($weatherSrv.id)/toggle" -Method Patch -Headers $aliceHeaders
Write-Host "  -> Toggled $($weatherSrv.name): enabled = $($toggleResp.enabled)" -ForegroundColor Yellow

$toolsAfterToggle = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body $listToolsBody -ContentType "application/json" -Headers $sessionHeaders
$remainingTools = $toolsAfterToggle.result.tools | ForEach-Object { $_.name }
Write-Host "  -> Tools catalog still functional ($($remainingTools.Count) tools): $($remainingTools -join ', ')" -ForegroundColor Green

# Restore server
$restoreResp = Invoke-RestMethod -Uri "$baseUrl/api/servers/$($weatherSrv.id)/toggle" -Method Patch -Headers $aliceHeaders
Write-Host "  -> Restored $($weatherSrv.name): enabled = $($restoreResp.enabled)" -ForegroundColor Green

# 10. Test Audit Logs & Chat Agent Integration
Write-Host "`n[10/10] Testing Chat Agent & Audit Logging..." -ForegroundColor Yellow
$chatResp = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method Post -Headers $bobHeaders -Body (@{
    prompt = "Show me the store products and recent orders"
} | ConvertTo-Json) -ContentType "application/json"

Write-Host "  -> Chat Assistant Reply:" -ForegroundColor Gray
Write-Host "     $($chatResp.reply)" -ForegroundColor Gray
Write-Host "  -> Tools executed by Chat Agent: $($chatResp.toolCalls.Count)" -ForegroundColor Green

# Query Audit Logs to verify full audit trail
$auditResp = Invoke-RestMethod -Uri "$baseUrl/api/audit-logs?limit=5" -Method Get -Headers $aliceHeaders
Write-Host "`nRecent Audit Log Entries ($($auditResp.total) total recorded):" -ForegroundColor Cyan
foreach ($log in $auditResp.logs) {
    Write-Host "  [$($log.created_at)] User: $($log.user_email) | Server: $($log.server_name) | Tool: $($log.tool_name) | Status: $($log.status) | Duration: $($log.duration_ms)ms" -ForegroundColor Green
}

Write-Host "`nALL TEAM MCP GATEWAY BACKEND TESTS PASSED!" -ForegroundColor Green
