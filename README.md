# Urumi Team MCP Gateway on Kubernetes

[![Kubernetes](https://img.shields.io/badge/Kubernetes-Kind%20%7C%20k3s-326CE5?logo=kubernetes&logoColor=white)](https://kubernetes.io)
[![Helm](https://img.shields.io/badge/Helm-v3.16-0F1689?logo=helm&logoColor=white)](https://helm.sh)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Streamable%20HTTP-6366F1)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-9.3.3-96588A?logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16--alpine-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![React](https://img.shields.io/badge/Dashboard-React%2018%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](https://react.dev)

An enterprise-ready, multi-tenant Model Context Protocol (MCP) Gateway deployed on Kubernetes. It aggregates multiple upstream MCP servers behind a single secure Streamable HTTP endpoint, enforces immediate API-key revocation, provides multi-user RBAC, persists a complete audit trail in PostgreSQL, and offers a React operations dashboard with an integrated AI chat agent.

---

## 1. Architecture Overview

The system is deployed into two isolated namespaces with strict network separation:
- **`urumi-store`**: Houses WordPress 6.6 with WooCommerce 9.3.3, a MariaDB 10.11 database, and the hardened custom WooCommerce Streamable HTTP MCP server.
- **`urumi-gateway`**: Houses the Team MCP Gateway Backend, PostgreSQL 16 stateful storage, additional mock upstream MCP servers (Weather & Shipping, Customer CRM Notes), and the Ingress controller routing layer.

> 💡 **Interactive Architecture Map:** Open [`docs/architecture-diagram.html`](docs/architecture-diagram.html) in any browser for an interactive, animated, and source-backed system architecture diagram generated with **Archify**.

```mermaid
flowchart TB
    subgraph Clients["Clients & Developers"]
        Claude["Claude Desktop / MCP Inspector"]
        WebUser["React Dashboard User"]
    end

    subgraph IngressLayer["Kubernetes Ingress (ingress-nginx)"]
        GW_ING["gateway.127.0.0.1.nip.io"]
        STORE_ING["store.127.0.0.1.nip.io"]
    end

    subgraph GatewayNamespace["Namespace: urumi-gateway"]
        GW["Team MCP Gateway Backend\n(Node.js / Express / TypeScript)\n:4000"]
        PG[("PostgreSQL 16\n(Users, Keys, Upstreams, Audit)\n:5432")]
        WEATHER["Weather & Shipping MCP\n:3001"]
        NOTES["Customer Notes CRM MCP\n:3002"]
        DASH["React 18 Dashboard & Chat Agent\n(SPA served by Gateway)"]
    end

    subgraph StoreNamespace["Namespace: urumi-store"]
        WC_MCP["WooCommerce MCP Server\n:3000"]
        WP["WordPress 6.6 / WooCommerce 9.3.3\n:80"]
        MDB[("MariaDB 10.11\n:3306")]
    end

    Claude -->|"Bearer API Key\nStreamable HTTP"| GW_ING
    WebUser -->|"Dashboard UI & Chat Agent"| GW_ING
    GW_ING --> GW
    STORE_ING --> WP

    GW <--> PG
    GW <-->|"Tool Routing"| WEATHER
    GW <-->|"Tool Routing"| NOTES
    GW <-->|"Cross-Namespace MCP"| WC_MCP

    WC_MCP <-->|"REST API v3"| WP
    WP <--> MDB
```
<img width="5052" height="2298" alt="urumi-team-mcp-gateway-on-kubernetes" src="https://github.com/user-attachments/assets/dfa8c6b9-f425-4ad5-8fc2-56c180170430" />

---

## 2. Key Features

- **Single Gateway Endpoint (`/mcp`)**: Implements the official `@modelcontextprotocol/sdk` Streamable HTTP protocol. Upstream servers remain cluster-internal; clients never access upstreams directly.
- **Custom WooCommerce MCP Server**: Built in Node.js/TypeScript exposing 5 essential tools (`woocommerce_list_products`, `woocommerce_get_product`, `woocommerce_create_product`, `woocommerce_list_orders`, `woocommerce_update_order_status`).
- **Three Upstream MCP Servers (10 Tools Total)**:
  1. `woocommerce-mcp` (5 store & order tools)
  2. `weather-shipping-mcp` (`weather_get_forecast`, `shipping_get_rates`)
  3. `customer-notes-mcp` (`customer_notes_save`, `customer_notes_get`, `customer_notes_list_recent`)
- **Multi-Tenant RBAC & Two-User Setup**:
  - **Admin (`alice@example.com`)**: Can register, toggle, and delete upstream servers, view all team audit logs, and manage keys.
  - **Member (`bob@example.com`)**: Can generate personal API keys and invoke tools through the gateway.
- **Instant API Key Revocation**: API keys (`ugw_live_...`) are stored as SHA-256 hashes in PostgreSQL. Revoking a key takes effect instantly without waiting for token expiry.
- **SSRF Protection**: Upstream server URLs are strictly validated. Registrations pointing to cloud metadata (`169.254.169.254`), loopback (`127.0.0.1`), or the Kubernetes control plane (`10.96.0.1`) are rejected.
- **Fault Isolation**: Upstream tool calls are executed in parallel via `Promise.allSettled` and wrapped in 5–8 second timeouts. Disabling or crashing one server leaves the remaining tools fully functional.
- **Full Audit Logging**: Every tool invocation is persisted in PostgreSQL with user identity, server name, tool name, sanitized payload, duration, and status.
- **Embedded AI Chat Agent**: Natural language assistant in the dashboard executing tool loops exclusively through the Gateway as the authenticated user.
- **Container Hardening**: All application containers run as non-root user (`node`, UID 1000), drop all Linux capabilities (`drop: [ALL]`), and utilize read-only root filesystems (`readOnlyRootFilesystem: true`) with memory `tmpfs` mounts.

---

## 3. Endpoints and Default Credentials

### URLs (Local Kind Cluster)
| Service | URL | Notes |
| :--- | :--- | :--- |
| **Storefront** | `http://store.127.0.0.1.nip.io` | WooCommerce catalog and customer checkout |
| **Store REST API** | `http://store.127.0.0.1.nip.io/wp-json/wc/v3` | WooCommerce REST API v3 |
| **Team Gateway Dashboard** | `http://gateway.127.0.0.1.nip.io` | Operations UI and AI Chat Agent |
| **Gateway MCP Endpoint** | `http://gateway.127.0.0.1.nip.io/mcp` | Unified Streamable HTTP endpoint for external clients |

### Pre-Configured Users
| User | Email | Password | Role | Default Pre-Seeded API Key |
| :--- | :--- | :--- | :--- | :--- |
| **Alice (Admin)** | `alice@example.com` | `AliceAdmin123!` | `admin` | `ugw_live_alice_admin_secret_key_123` |
| **Bob (Member)** | `bob@example.com` | `BobMember123!` | `member` | `ugw_live_bob_member_secret_key_456` |

### WooCommerce REST API Credentials
- **Consumer Key:** `ck_urumi_live_test_key_123`
- **Consumer Secret:** `cs_urumi_live_test_secret_123`
- *(Kept server-side inside Kubernetes Secret `wc-api-credentials`; never leaked to client)*

---

## 4. Local Deployment Quickstart (Kind)

### Prerequisites
- Docker Desktop (with WSL2 on Windows or native Linux)
- `kind` (v0.25+)
- `helm` (v3.16+)
- `kubectl`

### Step 1: Clone and Inspect
```bash
git clone https://github.com/Om-Bhavsar-6/URUMI-MCP-GATEWAY.git
cd URUMI-MCP-GATEWAY
```

### Step 2: Bootstrap Kind Cluster & Ingress Controller
```powershell
# Create cluster with host ports 80/443 mapped
kind create cluster --config k8s/kind-config.yaml --name urumi-cluster

# Deploy ingress-nginx for Kind
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for Ingress Controller to be ready
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=120s
```

### Step 3: Build & Load Docker Images
```powershell
# 1. Build WooCommerce MCP Server
docker build -t woocommerce-mcp:latest src/woocommerce-mcp

# 2. Build Mock Upstream MCP Servers (Weather & Notes)
docker build -t mock-upstreams:latest src/mock-upstreams

# 3. Build React Dashboard & Gateway Backend
cd src/dashboard; npm install; npm run build; cd ../..
Copy-Item -Recurse -Force src/dashboard/dist src/gateway-backend/public
docker build -t gateway-backend:latest src/gateway-backend

# 4. Load images into Kind node
kind load docker-image woocommerce-mcp:latest --name urumi-cluster
kind load docker-image mock-upstreams:latest --name urumi-cluster
kind load docker-image gateway-backend:latest --name urumi-cluster
```

### Step 4: Deploy with Helm
```powershell
helm upgrade --install urumi helm/mcp-gateway -f helm/mcp-gateway/values-local.yaml --timeout 15m
```

---

## 5. Automated Verification Suites

Automated PowerShell test suites are provided in `scripts/`:

```powershell
# 1. Verify Phase 1: Cluster, Ingress, and Helm lifecycle
.\scripts\verify-phase1.ps1

# 2. Verify Phase 2: WooCommerce Storefront, REST API, COD orders, seeding
.\scripts\verify-store.ps1

# 3. Verify Phase 3: WooCommerce MCP Server (5 tools, Streamable HTTP, auth guard)
.\scripts\verify-woocommerce-mcp.ps1

# 4. Verify Phase 4: Weather/Shipping & Customer Notes MCP servers
.\scripts\verify-mock-upstreams.ps1

# 5. Verify Phase 5: Team MCP Gateway (aggregation, auth, SSRF, RBAC, revocation, audit)
.\scripts\verify-gateway-backend.ps1

# 6. MASTER DEFINITION OF DONE: Tests all 10 requirements end-to-end
.\scripts\verify-dod.ps1
```

---

## 6. Connecting External MCP Clients

### Claude Desktop Configuration
Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "urumi-gateway": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/inspector",
        "--server-url",
        "http://gateway.127.0.0.1.nip.io/mcp",
        "--header",
        "Authorization: Bearer ugw_live_alice_admin_secret_key_123"
      ]
    }
  }
}
```

Or connect directly using Streamable HTTP via cURL / Postman / MCP Inspector:
```bash
# Handshake (Streamable HTTP initialize)
curl -X POST http://gateway.127.0.0.1.nip.io/mcp \
  -H "Authorization: Bearer ugw_live_alice_admin_secret_key_123" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "claude", "version": "1.0.0" }
    }
  }'
```

---

## 7. Production Deployment (Remote VPS with k3s)

To deploy the entire stack to a standard Ubuntu/Debian VPS:

1. **Install k3s on the VPS:**
   ```bash
   curl -sfL https://get.k3s.io | sh -
   export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
   ```

2. **Point DNS to VPS IP:**
   - Wildcard DNS: `*.urumi.<your-ip>.nip.io` pointing to your VPS public IPv4.
   - Example: `store.198.51.100.20.nip.io` and `gateway.198.51.100.20.nip.io`.

3. **Deploy using `values-prod.yaml`:**
   ```bash
   helm upgrade --install urumi ./helm/mcp-gateway \
     -f ./helm/mcp-gateway/values-prod.yaml \
     --set global.baseDomain="198.51.100.20.nip.io" \
     --set store.domain="store.198.51.100.20.nip.io" \
     --set gateway.domain="gateway.198.51.100.20.nip.io" \
     --namespace default
   ```

All storage is handled dynamically by k3s's built-in `local-path` StorageClass, and Traefik/Ingress-Nginx handles TLS certificates and routing automatically.

---



