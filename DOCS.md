# 📖 Vault — Production API Reference & Integration Guide

Welcome to the official developer documentation for **Vault** (`https://vault.api.crafture.space/`). This guide provides ready-to-copy components and integration examples for any web application, scraper, bot, or Chrome extension.

---

## 🔒 Authentication & Passkeys

All client requests (enrichment and LinkedIn endpoint control plane) require the client passkey passed in either the `x-api-key` header or Bearer token:
- **Header:** `x-api-key: 007_haiSecret`
- **Bearer Token:** `Authorization: Bearer 007_haiSecret`

All administrative `/admin/vault/*` endpoints and dashboard UI are secured via:
- **Header:** `x-admin-key: 007_haiSecret` (or `x-api-key: 007_haiSecret`)
- **Dashboard UI:** Unlocked via `#auth-lock-overlay`

---

## 🌐 Dynamic LinkedIn Endpoint Control Plane

Vault acts as the central remote control plane for OutFox's LinkedIn Voyager & SDUI endpoints. Changes made in Vault hot-update all connected extensions without republishing the Chrome extension.

### 1. Fetch All Endpoints: `GET /api/endpoints`
Returns the active registry, audit timestamp, and step-by-step developer capture guides.

```http
GET https://vault.api.crafture.space/api/endpoints
x-api-key: 007_haiSecret
```

**Response (`200 OK`):**
```json
{
  "ok": true,
  "updatedAt": 1731499200000,
  "auditRequestedAt": null,
  "endpoints": {
    "sendInvite": {
      "name": "Send Connection Invite",
      "url": "/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2",
      "method": "POST",
      "status": "healthy",
      "lastStatus": 200,
      "lastCheckedAt": 1731499200000,
      "lastError": null,
      "captureGuide": {
        "pageUrl": "https://www.linkedin.com/in/{profile}",
        "networkFilter": "verifyQuotaAndCreateV2",
        "action": "Click 'Connect' -> 'Send without note' on any member profile",
        "copyTarget": "Request URL (voyagerRelationshipsDashMemberRelationships with query params)"
      }
    },
    "withdrawInvitation": { ... },
    "listSentInvitations": { ... },
    "connectionsSummary": { ... },
    "messengerConversations": { ... },
    "profileView": { ... }
  }
}
```

---

### 2. Hot-Update Endpoint: `PUT /api/endpoints/:key`
Updates an endpoint's URL, method, sduiid, or queryId, and resets its status to `healthy`.

```http
PUT https://vault.api.crafture.space/api/endpoints/sendInvite
Content-Type: application/json
x-api-key: 007_haiSecret

{
  "url": "/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=...",
  "method": "POST"
}
```

---

### 3. Request Extension Health Audit: `POST /api/endpoints/audit-request`
Sets `auditRequestedAt = Date.now()` so extensions run a read-only probe across all endpoints on their next heartbeat.

```http
POST https://vault.api.crafture.space/api/endpoints/audit-request
x-api-key: 007_haiSecret
```

---

### 4. Push Audit Health Scorecard: `POST /api/endpoints/health`
Called by connected Chrome extensions to report live probe results back to Vault.

```http
POST https://vault.api.crafture.space/api/endpoints/health
Content-Type: application/json
x-api-key: 007_haiSecret

{
  "results": {
    "sendInvite": { "ok": true, "status": 200, "latencyMs": 142 },
    "profileView": { "ok": true, "status": 200, "latencyMs": 85 }
  }
}
```

---

### 5. Report Failure & Developer Telegram Alert: `POST /api/endpoints/report`
Called by extensions upon encountering unexpected `400`, `404`, or `410` responses. Automatically marks the endpoint `degraded` and sends a **12-hour deduplicated Telegram alert** with developer F12 capture instructions.

```http
POST https://vault.api.crafture.space/api/endpoints/report
Content-Type: application/json
x-api-key: 007_haiSecret

{
  "key": "sendInvite",
  "status": 404,
  "url": "/voyager/api/voyagerRelationshipsDashMemberRelationships?...",
  "error": "HTTP 404 Not Found"
}
```

---

## ⚡ Multi-Account Lead Enrichment Endpoints

### Master Waterfall: `POST /api/enrich/waterfall`
Runs Hunter.io ➔ Apollo.io ➔ Corporate Pattern Waterfall with auto-rotation in under 50ms.

```http
POST https://vault.api.crafture.space/api/enrich/waterfall
Content-Type: application/json
x-api-key: 007_haiSecret

{
  "firstName": "Satya",
  "lastName": "Nadella",
  "domain": "microsoft.com",
  "company": "Microsoft"
}
```

### Direct Apollo Pool: `POST /api/enrich/apollo`
### Direct Hunter Pool: `POST /api/enrich/hunter`
### Direct Apify Scraper: `POST /api/scrape/apify`
### Uptime Health Probe: `GET /health`
