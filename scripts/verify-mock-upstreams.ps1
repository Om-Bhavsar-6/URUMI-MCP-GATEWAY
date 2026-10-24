# Verification Script for Mock Upstream MCP Servers (Weather & Notes)
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  VERIFYING MOCK UPSTREAM MCP SERVERS (Weather & Notes)   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Start background port-forwards for testing
$weatherPort = 13001
$notesPort = 13002

Write-Host "[1/8] Setting up port-forward to weather-mcp (13001:3001) and notes-mcp (13002:3002)..." -ForegroundColor Yellow
$weatherPf = Start-Process -FilePath "kubectl" -ArgumentList "port-forward -n urumi-gateway svc/weather-mcp ${weatherPort}:3001" -PassThru -WindowStyle Hidden
$notesPf = Start-Process -FilePath "kubectl" -ArgumentList "port-forward -n urumi-gateway svc/notes-mcp ${notesPort}:3002" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 3

try {
    # 2. Check health endpoints
    Write-Host "[2/8] Testing /healthz endpoints..." -ForegroundColor Yellow
    $weatherHealth = Invoke-RestMethod -Uri "http://127.0.0.1:${weatherPort}/healthz" -Method Get
    Write-Host "  -> Weather health: $($weatherHealth.status), server: $($weatherHealth.server)" -ForegroundColor Green

    $notesHealth = Invoke-RestMethod -Uri "http://127.0.0.1:${notesPort}/healthz" -Method Get
    Write-Host "  -> Notes health: $($notesHealth.status), server: $($notesHealth.server), total notes: $($notesHealth.total_notes)" -ForegroundColor Green

    # 3. Test Security Guardrail: 401 Unauthorized without bearer token
    Write-Host "[3/8] Testing Security Guardrail: Rejecting unauthenticated requests..." -ForegroundColor Yellow
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:${weatherPort}/mcp" -Method Post -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' -ContentType "application/json" -Headers @{"Accept"="application/json, text/event-stream"}
        Write-Error "Security Failure: Weather server accepted unauthenticated request!"
    } catch {
        Write-Host "  -> Weather server correctly rejected unauthenticated request: $($_.Exception.Message)" -ForegroundColor Green
    }

    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:${notesPort}/mcp" -Method Post -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' -ContentType "application/json" -Headers @{"Accept"="application/json, text/event-stream"}
        Write-Error "Security Failure: Notes server accepted unauthenticated request!"
    } catch {
        Write-Host "  -> Notes server correctly rejected unauthenticated request: $($_.Exception.Message)" -ForegroundColor Green
    }

    $authHeaders = @{
        "Authorization" = "Bearer urumi_internal_mcp_secure_token_123"
        "Accept" = "application/json, text/event-stream"
    }

    # 4. Initialize Streamable HTTP handshake for Weather MCP
    Write-Host "[4/8] Initializing Weather MCP handshake..." -ForegroundColor Yellow
    $initBody = @{
        jsonrpc = "2.0"
        id = 1
        method = "initialize"
        params = @{
            protocolVersion = "2024-11-05"
            capabilities = @{}
            clientInfo = @{ name = "mcp-verifier"; version = "1.0.0" }
        }
    } | ConvertTo-Json -Depth 5

    $weatherInitResp = Invoke-WebRequest -Uri "http://127.0.0.1:${weatherPort}/mcp" -Method Post -Body $initBody -ContentType "application/json" -Headers $authHeaders
    $weatherSessionId = $weatherInitResp.Headers["mcp-session-id"]
    if ($weatherSessionId -is [array]) { $weatherSessionId = $weatherSessionId[0] }
    Write-Host "  -> Weather MCP initialized successfully! Session ID: $weatherSessionId" -ForegroundColor Green

    $weatherHeaders = @{
        "Authorization" = "Bearer urumi_internal_mcp_secure_token_123"
        "Accept" = "application/json, text/event-stream"
        "mcp-session-id" = $weatherSessionId
    }

    # 5. Test Weather Tools (List, weather_get_forecast, shipping_get_rates)
    Write-Host "[5/8] Testing Weather & Shipping MCP Tools..." -ForegroundColor Yellow
    $listToolsBody = @{ jsonrpc = "2.0"; id = 2; method = "tools/list" } | ConvertTo-Json
    $toolsResp = Invoke-RestMethod -Uri "http://127.0.0.1:${weatherPort}/mcp" -Method Post -Body $listToolsBody -ContentType "application/json" -Headers $weatherHeaders
    $toolNames = $toolsResp.result.tools | ForEach-Object { $_.name }
    Write-Host "  -> Available tools: $($toolNames -join ', ')" -ForegroundColor Green

    # Test weather_get_forecast
    $forecastBody = @{
        jsonrpc = "2.0"
        id = 3
        method = "tools/call"
        params = @{
            name = "weather_get_forecast"
            arguments = @{ city = "Bengaluru"; days = 3 }
        }
    } | ConvertTo-Json -Depth 5
    $forecastResp = Invoke-RestMethod -Uri "http://127.0.0.1:${weatherPort}/mcp" -Method Post -Body $forecastBody -ContentType "application/json" -Headers $weatherHeaders
    Write-Host "  -> weather_get_forecast output:" -ForegroundColor Gray
    Write-Host "     $($forecastResp.result.content[0].text)" -ForegroundColor Gray

    # Test shipping_get_rates
    $shippingBody = @{
        jsonrpc = "2.0"
        id = 4
        method = "tools/call"
        params = @{
            name = "shipping_get_rates"
            arguments = @{ destination_country = "IN"; weight_kg = 2.5; service_level = "express" }
        }
    } | ConvertTo-Json -Depth 5
    $shippingResp = Invoke-RestMethod -Uri "http://127.0.0.1:${weatherPort}/mcp" -Method Post -Body $shippingBody -ContentType "application/json" -Headers $weatherHeaders
    Write-Host "  -> shipping_get_rates output:" -ForegroundColor Gray
    Write-Host "     $($shippingResp.result.content[0].text)" -ForegroundColor Gray

    # 6. Initialize Streamable HTTP handshake for Customer Notes MCP
    Write-Host "[6/8] Initializing Customer Notes MCP handshake..." -ForegroundColor Yellow
    $notesInitResp = Invoke-WebRequest -Uri "http://127.0.0.1:${notesPort}/mcp" -Method Post -Body $initBody -ContentType "application/json" -Headers $authHeaders
    $notesSessionId = $notesInitResp.Headers["mcp-session-id"]
    if ($notesSessionId -is [array]) { $notesSessionId = $notesSessionId[0] }
    Write-Host "  -> Customer Notes MCP initialized successfully! Session ID: $notesSessionId" -ForegroundColor Green

    $notesHeaders = @{
        "Authorization" = "Bearer urumi_internal_mcp_secure_token_123"
        "Accept" = "application/json, text/event-stream"
        "mcp-session-id" = $notesSessionId
    }

    # 7. Test Customer Notes Tools (List, customer_notes_get, customer_notes_save, customer_notes_list_recent)
    Write-Host "[7/8] Testing Customer Notes MCP Tools..." -ForegroundColor Yellow
    $notesToolsResp = Invoke-RestMethod -Uri "http://127.0.0.1:${notesPort}/mcp" -Method Post -Body $listToolsBody -ContentType "application/json" -Headers $notesHeaders
    $nToolNames = $notesToolsResp.result.tools | ForEach-Object { $_.name }
    Write-Host "  -> Available tools: $($nToolNames -join ', ')" -ForegroundColor Green

    # Get notes for alice@example.com
    $getNotesBody = @{
        jsonrpc = "2.0"
        id = 5
        method = "tools/call"
        params = @{
            name = "customer_notes_get"
            arguments = @{ customer_email = "alice@example.com" }
        }
    } | ConvertTo-Json -Depth 5
    $getNotesResp = Invoke-RestMethod -Uri "http://127.0.0.1:${notesPort}/mcp" -Method Post -Body $getNotesBody -ContentType "application/json" -Headers $notesHeaders
    Write-Host "  -> customer_notes_get (alice@example.com) output:" -ForegroundColor Gray
    Write-Host "     $($getNotesResp.result.content[0].text)" -ForegroundColor Gray

    # Save new note for alice@example.com
    $saveNoteBody = @{
        jsonrpc = "2.0"
        id = 6
        method = "tools/call"
        params = @{
            name = "customer_notes_save"
            arguments = @{
                customer_email = "alice@example.com"
                note = "Customer requested express shipping upgrade and contactless delivery."
                category = "vip"
            }
        }
    } | ConvertTo-Json -Depth 5
    $saveResp = Invoke-RestMethod -Uri "http://127.0.0.1:${notesPort}/mcp" -Method Post -Body $saveNoteBody -ContentType "application/json" -Headers $notesHeaders
    Write-Host "  -> customer_notes_save output:" -ForegroundColor Gray
    Write-Host "     $($saveResp.result.content[0].text)" -ForegroundColor Gray

    # List recent notes
    $recentNotesBody = @{
        jsonrpc = "2.0"
        id = 7
        method = "tools/call"
        params = @{
            name = "customer_notes_list_recent"
            arguments = @{ limit = 3 }
        }
    } | ConvertTo-Json -Depth 5
    $recentResp = Invoke-RestMethod -Uri "http://127.0.0.1:${notesPort}/mcp" -Method Post -Body $recentNotesBody -ContentType "application/json" -Headers $notesHeaders
    Write-Host "  -> customer_notes_list_recent output:" -ForegroundColor Gray
    Write-Host "     $($recentResp.result.content[0].text)" -ForegroundColor Gray

    # 8. Test Input Guardrails
    Write-Host "[8/8] Testing Input Guardrails on Notes & Weather..." -ForegroundColor Yellow
    $invalidEmailBody = @{
        jsonrpc = "2.0"
        id = 8
        method = "tools/call"
        params = @{
            name = "customer_notes_get"
            arguments = @{ customer_email = "not-an-email" }
        }
    } | ConvertTo-Json -Depth 5
    $invalidResp = Invoke-RestMethod -Uri "http://127.0.0.1:${notesPort}/mcp" -Method Post -Body $invalidEmailBody -ContentType "application/json" -Headers $notesHeaders
    if ($invalidResp.result.isError) {
        Write-Host "  -> Guardrail caught invalid email successfully: $($invalidResp.result.content[0].text)" -ForegroundColor Green
    } else {
        Write-Error "Guardrail failure: Invalid email was accepted!"
    }

    Write-Host "`nAll Mock Upstream MCP Server verification tests PASSED!" -ForegroundColor Green

} finally {
    Write-Host "Cleaning up port-forwards..." -ForegroundColor Yellow
    Stop-Process -Id $weatherPf.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $notesPf.Id -Force -ErrorAction SilentlyContinue
}
