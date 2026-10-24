# Threat Model and Security Architecture

## 1. Overview & Trust Boundaries

The **Urumi Team MCP Gateway** operates in a multi-tenant environment where external developers, automated systems, and web dashboard users interact with cluster-internal services and third-party tools.

### Trust Boundaries
1. **Public Internet $\leftrightarrow$ Kubernetes Ingress**: Untrusted incoming traffic. Protected by Ingress-Nginx, TLS termination, and rate/body-size limits.
2. **Ingress $\leftrightarrow$ Gateway Backend**: Authenticated boundary. Requires valid Bearer API key (`ugw_live_...`) or JWT token.
3. **Gateway Backend $\leftrightarrow$ Upstream MCP Servers**: Cluster-internal trusted network. Upstream services are bound to ClusterIP services and are not directly exposed to the public Internet.
4. **Upstream MCP Servers $\leftrightarrow$ Data Stores (WooCommerce / MariaDB / PostgreSQL)**: Authenticated internal boundary using Secret-injected credentials.

```
[ External User / Claude / Browser ]
               │
      (Internet Boundary)
               ▼
   [ ingress-nginx Controller ]
               │
     (Gateway Auth Boundary)
               ▼
    [ Team MCP Gateway Backend ]
     ├── DB Boundary ──────────► [ PostgreSQL 16 ]
     ├── Upstream Boundary ────► [ weather-mcp :3001 ]
     ├── Upstream Boundary ────► [ notes-mcp :3002 ]
     └── Cross-Namespace ──────► [ woocommerce-mcp :3000 ]
                                         │
                                  (Store Boundary)
                                         ▼
                             [ WordPress / MariaDB ]
```

---

## 2. Threat Analysis (STRIDE Matrix)

| Threat Category | Potential Vector | Impact | Implemented Mitigation |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Compromised or brute-forced API key used to execute store tools. | High | - Cryptographically random 256-bit API keys (`crypto.randomBytes(24)`).<br>- SHA-256 hashed storage in PostgreSQL.<br>- Instant revocation check on every request (`revoked_at IS NULL`). |
| **Tampering** | Malicious arguments (negative prices, illegal order status, SQLi). | High | - Strict **Zod schemas** on all MCP tool inputs.<br>- Price regex validation (`/^\d+(\.\d{1,2})?$/`).<br>- Whitelisted order status enum validation.<br>- Parameterized SQL queries (`pg` pool). |
| **Repudiation** | User denies performing an unauthorized action (e.g. canceling orders). | Medium | - Immutable **audit log** in PostgreSQL.<br>- Logs user email, user ID, server name, tool name, sanitized payload, timestamp, and duration for every tool call. |
| **Information Disclosure** | Server-Side Request Forgery (SSRF) targeting cloud metadata or internal pods; credential leakage in frontend. | Critical | - **SSRF Guardrail**: Rejects `169.254.169.254`, `localhost`, `127.0.0.1`, `kubernetes.default`, and private metadata IPs.<br>- Upstream credentials kept strictly server-side and masked in all API responses. |
| **Denial of Service** | Slow or malicious upstream MCP server blocking Gateway threads. | High | - Strict timeouts (`AbortSignal.timeout(5000)` and `8000ms`).<br>- Upstream aggregation runs via `Promise.allSettled`.<br>- Circuit-breaker style fault isolation. |
| **Elevation of Privilege** | Member user attempting to add/remove servers or container breakout. | Critical | - **Role-Based Access Control**: Only `admin` role can register, toggle, or delete servers.<br>- **Pod Security Standards**: Non-root UID 1000, `drop: [ALL]` capabilities, `readOnlyRootFilesystem: true`, `seccompProfile: RuntimeDefault`. |

---

## 3. Deep-Dive Security Mitigations

### 3.1. SSRF Guardrail (`src/security/ssrf-guard.ts`)
When an administrator registers or updates an upstream MCP server, the URL is parsed and validated before being saved:
```typescript
// Enforce HTTP / HTTPS protocol
if (url.protocol !== 'http:' && url.protocol !== 'https:') {
  return { valid: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
}

// Prohibit loopback and link-local addresses
if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('127.')) {
  return { valid: false, reason: 'Loopback and localhost addresses are forbidden' };
}

// Prohibit AWS, GCP, Azure, and OpenStack instance metadata endpoints
if (host === '169.254.169.254' || host === 'metadata.google.internal' || host.startsWith('169.254.')) {
  return { valid: false, reason: 'Cloud instance metadata endpoints are strictly forbidden' };
}

// Prohibit Kubernetes API server endpoints
if (host === 'kubernetes' || host === 'kubernetes.default' || host === '10.96.0.1') {
  return { valid: false, reason: 'Kubernetes control plane API endpoints cannot be registered' };
}
```

### 3.2. Real-Time API Key Revocation
Traditional JWT tokens suffer from delayed revocation windows unless stateful blacklists are maintained. In the Urumi Gateway:
1. API keys are generated with prefix `ugw_live_`.
2. The key is hashed with SHA-256 and stored in the `api_keys` table.
3. Every incoming `/mcp` or `/api` request computes `hashApiKey(token)` and checks:
   ```sql
   SELECT k.id, k.revoked_at, u.role, u.email
   FROM api_keys k
   JOIN users u ON k.user_id = u.id
   WHERE k.key_hash = $1
   ```
4. If `revoked_at` is non-null, the request is immediately rejected with HTTP 401 Unauthorized with zero grace period.

### 3.3. Defense-in-Depth Container Hardening
All application workloads (`gateway-backend`, `woocommerce-mcp`, `weather-mcp`, `notes-mcp`) enforce strict Kubernetes container security contexts:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
containers:
  - name: app
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
          - ALL
    volumeMounts:
      - name: tmp-volume
        mountPath: /tmp
volumes:
  - name: tmp-volume
    emptyDir:
      medium: Memory
      sizeLimit: 16Mi
```
Even in the event of an arbitrary code execution vulnerability in a third-party dependency, the attacker:
- Cannot escalate privileges to root.
- Cannot modify or overwrite container binary files on the root filesystem.
- Cannot leverage kernel capabilities (such as `CAP_SYS_ADMIN`, `CAP_NET_RAW`, or `CAP_CHOWN`).

---

## 4. Upstream Credential Isolation

- **Client Isolation**: External MCP clients and dashboard browsers never receive upstream WooCommerce keys or internal service tokens.
- **Internal Service Mesh Token**: Internal MCP servers (`weather-mcp`, `notes-mcp`, `woocommerce-mcp`) validate an internal bearer token (`INTERNAL_MCP_TOKEN`). This token is stored in Kubernetes Secrets and injected directly into the Gateway and upstream server Pods.
- **Store Credentials**: WooCommerce consumer key and consumer secret are stored in Kubernetes Secret `wc-api-credentials` and injected only into `woocommerce-mcp`.

---

## 5. Security Verification Tests

The platform includes automated scripts to prove security efficacy:
- `scripts/verify-gateway-backend.ps1`:
  - Validates rejection of unauthenticated requests (HTTP 401).
  - Validates rejection of SSRF cloud metadata IP `169.254.169.254` (HTTP 400).
  - Validates rejection of SSRF loopback IP `127.0.0.1` (HTTP 400).
  - Validates non-admin role blocking (HTTP 403 Forbidden).
  - Validates instant token revocation (immediate HTTP 401 on revoked key).
- `scripts/verify-woocommerce-mcp.ps1`:
  - Validates rejection of unauthenticated MCP handshake (HTTP 401).
  - Validates rejection of negative product prices.
  - Validates rejection of invalid order statuses.
