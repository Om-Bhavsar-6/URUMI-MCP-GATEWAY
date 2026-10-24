# Urumi MCP Gateway - Voiceover Presentation Script

This script matches the video recording located at [`docs/full_demo_walkthrough.webp`](file:///c:/Users/omkbh.OM.000/URUMI/docs/full_demo_walkthrough.webp) (and in your artifact directory). You can read this voiceover directly as you play the recording or import it into your video editor (CapCut, Premiere, OBS, or QuickTime).

---

## 🎬 Section 1: Introduction & WooCommerce Storefront (0:00 – 0:45)

**Visual Cue:** Storefront loads at `http://store.127.0.0.1.nip.io/` showcasing the WooCommerce store and scrolling through catalog items.

**Spoken Voiceover:**
> "Hello everyone, and welcome to the presentation of the **Urumi Team MCP Gateway on Kubernetes**. 
>
> In this demo, I will walk you through an enterprise-grade Model Context Protocol Gateway architecture built to aggregate multiple distributed MCP servers behind a single secure Streamable HTTP endpoint.
>
> We start right here on our live e-commerce storefront running on Kubernetes at `store.127.0.0.1.nip.io`. In the `urumi-store` namespace, we deployed WordPress 6.6 with WooCommerce 9.3.3 and MariaDB 10.11. 
>
> Notice our seeded product catalog: Premium Ergonomic Chair, Noise-Cancelling Headphones, and Wireless Mechanical Keyboard. All persistent storage is backed by Kubernetes PVCs, and automated database bootstrapping was handled via a Kubernetes Job using the WordPress CLI."

---

## 🎬 Section 2: Gateway Dashboard & AI Chat Tool Aggregation (0:45 – 2:00)

**Visual Cue:** Browser navigates to `http://gateway.127.0.0.1.nip.io/`. User enters prompt: *"List our store products and check shipping rates to NY 10001"*. Expandable tool execution badges appear and are clicked open.

**Spoken Voiceover:**
> "Now, let’s switch over to the **Urumi MCP Gateway Dashboard** at `gateway.127.0.0.1.nip.io`. This single-page application is built in React 18 and Vite, communicating directly with our Gateway Backend.
>
> At the top, you can see our multi-tenant role indicator, currently logged in as **Alice Admin**, alongside live stats for connected upstream MCP servers and active API keys.
>
> Let's test the integrated Operations AI Agent. I'll prompt: *'List our store products and check shipping rates to NY 10001'*.
>
> Notice what happens behind the scenes: the Gateway uses standard Model Context Protocol Streamable HTTP. It receives the client request, aggregates tools from multiple distributed upstreams, and executes both `woocommerce_list_products` against our internal store and `shipping_get_rates` against our weather and logistics server.
>
> By clicking open the tool execution cards, we have complete visibility into the execution duration, the parameters passed, and the raw JSON payload returned from the cluster."

---

## 🎬 Section 3: Upstream Server Management & Fault Isolation (2:00 – 3:15)

**Visual Cue:** Navigating to the **MCP Upstreams** tab. Inspecting the three server cards. Opening the "Tools" drawer for `woocommerce-mcp`. Toggling disable/enable on `weather-shipping-mcp`. Opening the "+ Add Server" registration modal.

**Spoken Voiceover:**
> "Next, let's explore the **MCP Upstreams** tab.
>
> Here we see all three independent upstream servers currently connected:
> 1. First, our custom **`woocommerce-mcp`** server running inside the `urumi-store` namespace with 5 core tools for inventory and order management.
> 2. Second, **`weather-shipping-mcp`** handling regional forecasts and rate calculations.
> 3. Third, **`customer-notes-mcp`** managing customer CRM annotations.
>
> Clicking **'Tools'** on WooCommerce reveals our dynamic schema drawer. Notice how tool schemas are fetched on-demand using MCP's standard `tools/list` protocol.
>
> Now, let’s observe **Upstream Fault Isolation**. If an upstream server experiences downtime or maintenance, an admin can toggle it to Disabled. Notice that the server state immediately updates. The gateway handles this gracefully via circuit breaking: other upstreams remain 100% operational, and attempts to invoke a disabled server return an isolated error rather than crashing the gateway.
>
> In the **'+ Add Server'** modal, notice our built-in SSRF guardrail. The Gateway inspects all upstream URLs, strictly blocking attempts to reach cloud metadata endpoints like `169.254.169.254`, loopback addresses, or the Kubernetes control plane."

---

## 🎬 Section 4: Multi-User RBAC & Instant API Key Revocation (3:15 – 4:15)

**Visual Cue:** Switching user to **Bob Member** in the top bar. Navigating to the **API Keys** tab. Generating `Bob Production Key`, copying the secret, and clicking "Revoke".

**Spoken Voiceover:**
> "Now let's examine security and multi-user access control. In the top navbar, I switch the active user from Alice Admin to **Bob Member**.
>
> Navigating to the **API Keys** tab, each team member can generate their own personal API keys. Let's create a new key named `'Bob Production Key'`.
>
> The key is generated using cryptographic random bytes with a `ugw_live_` prefix. Notice our security guardrail: the raw key is displayed exactly once and never stored in plaintext in the database. Only a salted SHA-256 hash is persisted in PostgreSQL.
>
> Now, let’s test **Instant API Key Revocation**. In a production environment, if a key is compromised, revocation cannot wait for cache expirations or container restarts. 
>
> When I click **'Revoke'**, the revocation timestamp is updated in PostgreSQL immediately. Any subsequent incoming MCP Streamable HTTP request using this key is rejected on the spot with a `401 Unauthorized`."

---

## 🎬 Section 5: Immutable Audit Logs & Traceability (4:15 – 4:45)

**Visual Cue:** Navigating to the **Audit Logs** tab. Scrolling the table. Clicking **Inspect** on a log entry to view input/output JSON payloads.

**Spoken Voiceover:**
> "Moving to the **Audit Logs** tab, every single operation executed across the Gateway is tracked immutably.
>
> Each audit record captures the timestamp, the acting user persona (`alice_admin` or `bob_member`), the client IP, the upstream server, the exact MCP tool called, and the round-trip latency in milliseconds.
>
> Clicking **'Inspect'** allows security teams and compliance auditors to examine the exact input arguments and returned payloads, providing complete attribution and zero ambiguity."

---

## 🎬 Section 6: Architecture, VPS Production Story & Conclusion (4:45 – 5:15)

**Visual Cue:** Showing the final chat view and returning to the architecture overview.

**Spoken Voiceover:**
> "To summarize our Kubernetes and deployment architecture:
> - All workloads run as non-root users with read-only root filesystems and dropped Linux capabilities.
> - Zero upstream credentials, like WooCommerce REST API consumer keys or database passwords, ever leave the cluster or touch client browsers.
> - The entire application is deployed using a unified, production-grade Helm chart. Moving from local Kind to a VPS running k3s requires only swapping `values-local.yaml` for `values-prod.yaml` to enable Let's Encrypt TLS certificates, custom domain routing, and persistent volume provisioners.
>
> All 10 Definition-of-Done criteria are fully met, verified by our automated test suite. 
>
> Thank you for watching!"
