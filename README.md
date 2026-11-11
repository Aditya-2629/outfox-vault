# 🦊 Vault

> **Standalone, zero-dependency Multi-Account API Key Vault, Load Balancer & Auto-Failover Proxy for Apollo.io, Hunter.io, and Apify on `https://vault.api.crafture.space/`.**

---

## ⚡ Architecture & Core Capabilities
Pool multiple free or paid accounts across Apollo.io, Hunter.io, and Apify into an **active load-balanced array queue**:
- **Sequential Round-Robin Load Balancing:** Distributes enrichment requests evenly across all active accounts so no single key gets rate-limited.
- **Zero-Downtime Auto-Failover (<50ms):** When an account hits `429 (Rate Limit)` or `402 (Monthly Cap Exhausted)`, it is auto-demoted to cooldown, and the next fresh key fulfills the request in under 50ms.
- **Default Security:** 
  - Admin Passkey: `007_haiSecret` (protects `/admin/vault/*` and dashboard UI via `#auth-lock-overlay`).
  - Client API Key: `007_haiSecret` (enforced on all `/api/enrich/*` endpoints via header `x-api-key: 007_haiSecret`).
- **Interactive In-App Documentation Modal (`#modal-docs-overlay`):**
  - Opened via `📖 API Docs` in the navbar.
  - Pre-populated code components for cURL, JavaScript, Python, and the OutFox Chrome Extension.
  - 1-click copy with instant confirmation.
- **Crisp Pure White UI Design:**
  - Surfaces: `#FFFFFF`
  - Canvas: `#F8FAFC`
  - Accents: `#FF6B00` Fox Orange
  - Zero AI-slop design system.

---

## 🚀 Quickstart

```bash
# Start the server (Zero external dependencies needed!)
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
node --check storage/vault-storage.js
node --check public/app.js
```
