# 🦊 Vault

> **Standalone, zero-dependency Multi-Account API Key Vault, Load Balancer, Auto-Failover Proxy & LinkedIn Endpoint Control Plane on `https://vault.api.crafture.space/`.**

---

## ⚡ Architecture & Core Capabilities
1. **Dynamic LinkedIn Voyager & SDUI Endpoint Registry:**
   - Persistent store in `storage/endpoints.json`.
   - Seeded with OutFox's working endpoints: `sendInvite`, `withdrawInvitation`, `listSentInvitations`, `connectionsSummary`, `messengerConversations`, and `profileView`.
   - Stores `lastStatus`, `lastCheckedAt`, `lastError`, and exact developer `captureGuide`.
   - Hot-update endpoints remotely via Vault Admin UI without republishing the Chrome extension.
   - Remote health audits triggered via `POST /api/endpoints/audit-request` and live scorecard reporting via `POST /api/endpoints/health`.
   - **12-Hour Deduplicated Telegram Alerts** to developers on `400`/`404`/`410` errors containing full F12 DevTools capture instructions.

2. **Lead Enrichment Key Vault & Load Balancer:**
   - Multi-account pools for Apollo.io, Hunter.io, and Apify.
   - Sequential round-robin queue load-balancing with auto-demotion on `429` (Rate Limit) and `402` (Cap Exhausted).
   - <50ms failover fulfilling requests with the next active key.

3. **Security by Default:**
   - Admin Passkey: `007_haiSecret` (protects `/admin/vault/*` and dashboard UI via `#auth-lock-overlay`).
   - Client API Key: `007_haiSecret` (enforced on all `/api/*` endpoints via header `x-api-key: 007_haiSecret`).

4. **Crisp Pure White UI Design:**
   - Surfaces: `#FFFFFF`
   - Canvas: `#F8FAFC`
   - Accents: `#FF6B00` Fox Orange

---

## 🚀 Quickstart

```bash
# Start server (Zero external npm dependencies needed!)
node server.js
```

Admin Web UI: `http://localhost:4000/` (or `https://vault.api.crafture.space/`)

---

## 🧪 Verification Commands

```bash
node --check server.js
node --check engine/key-pool.js
node --check engine/apollo-adapter.js
node --check engine/hunter-adapter.js
node --check engine/endpoint-registry.js
node --check storage/vault-storage.js
node --check storage/endpoint-storage.js
node --check public/app.js
```
