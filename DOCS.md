# 📖 Vault — Production API Reference & Integration Guide

Welcome to the official developer documentation for **Vault** (`https://vault.api.crafture.space/`). This guide provides ready-to-copy components and integration examples for any web application, scraper, bot, or Chrome extension.

---

## 🔒 Authentication & Passkeys

All client enrichment requests require the client passkey passed in either the `x-api-key` header or Bearer token:
- **Header:** `x-api-key: 007_haiSecret`
- **Bearer Token:** `Authorization: Bearer 007_haiSecret`

All administrative `/admin/vault/*` endpoints and dashboard UI are secured via:
- **Header:** `x-admin-key: 007_haiSecret`
- **Dashboard UI:** Unlocked via `#auth-lock-overlay`

---

## 1. Master Waterfall Endpoint: `POST /api/enrich/waterfall`

The primary zero-downtime endpoint for lead enrichment. Automatically runs the **Hunter.io ➔ Apollo.io ➔ Corporate Pattern** waterfall with multi-account auto-rotation in under 50ms.

### Endpoint:
```
POST https://vault.api.crafture.space/api/enrich/waterfall
```

### Request Headers:
```http
Content-Type: application/json
x-api-key: 007_haiSecret
```

### Request Body (`application/json`):
```json
{
  "firstName": "Satya",
  "lastName": "Nadella",
  "fullName": "Satya Nadella",
  "domain": "microsoft.com",
  "company": "Microsoft",
  "linkedinUrl": "https://www.linkedin.com/in/satyanadella"
}
```

### Success Response (`200 OK`):
```json
{
  "ok": true,
  "data": {
    "provider": "apollo",
    "email": "satya.nadella@microsoft.com",
    "phone": "+1 (425) 882-8080",
    "confidence": 0.95,
    "keyUsed": "sk_l••••4b9f"
  }
}
```

---

## 2. Apollo Direct Endpoint: `POST /api/enrich/apollo`

Routes directly to the active Apollo.io key pool. Extracts verified emails, direct phone numbers, and job titles with round-robin rotation.

### Endpoint:
```
POST https://vault.api.crafture.space/api/enrich/apollo
```

### Request Body:
```json
{
  "firstName": "Sundar",
  "lastName": "Pichai",
  "domain": "google.com",
  "company": "Google",
  "linkedinUrl": "https://www.linkedin.com/in/sundarpichai"
}
```

---

## 3. Hunter Direct Endpoint: `POST /api/enrich/hunter`

Routes directly to the active Hunter.io key pool. Domain-level email finding and verification scores with automatic credit diagnostics.

### Endpoint:
```
POST https://vault.api.crafture.space/api/enrich/hunter
```

### Request Body:
```json
{
  "domain": "stripe.com",
  "firstName": "Patrick",
  "lastName": "Collison"
}
```

---

## 4. Apify Scraper Trigger: `POST /api/scrape/apify`

Triggers Apify Actors using pooled tokens with automatic rotation.

### Endpoint:
```
POST https://vault.api.crafture.space/api/scrape/apify
```

### Request Body:
```json
{
  "actorId": "apify/instagram-scraper",
  "input": {
    "directUrls": ["https://www.instagram.com/openai/"]
  }
}
```

---

## 5. Health Check Endpoint: `GET /health`

Public health check for uptime monitors, Render, Railway, and Docker container healthchecks.

### Endpoint:
```
GET https://vault.api.crafture.space/health
```

### Response:
```json
{
  "status": "healthy",
  "service": "Vault",
  "domain": "vault.api.crafture.space",
  "uptime": 128.45,
  "timestamp": 1731388800000
}
```

---

## 6. Ready-to-Copy Client Implementations

### cURL
```bash
curl -X POST "https://vault.api.crafture.space/api/enrich/waterfall" \
  -H "Content-Type: application/json" \
  -H "x-api-key: 007_haiSecret" \
  -d '{
    "firstName": "Satya",
    "lastName": "Nadella",
    "domain": "microsoft.com",
    "company": "Microsoft",
    "linkedinUrl": "https://www.linkedin.com/in/satyanadella"
  }'
```

### JavaScript / TypeScript
```javascript
const response = await fetch('https://vault.api.crafture.space/api/enrich/waterfall', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '007_haiSecret'
  },
  body: JSON.stringify({
    firstName: 'Satya',
    lastName: 'Nadella',
    domain: 'microsoft.com',
    company: 'Microsoft',
    linkedinUrl: 'https://www.linkedin.com/in/satyanadella'
  })
});

const result = await response.json();
console.log('Enrichment Result:', result.data);
```

### Python
```python
import requests

url = "https://vault.api.crafture.space/api/enrich/waterfall"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "007_haiSecret"
}
payload = {
    "firstName": "Satya",
    "lastName": "Nadella",
    "domain": "microsoft.com",
    "company": "Microsoft",
    "linkedinUrl": "https://www.linkedin.com/in/satyanadella"
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()
print("Enrichment Result:", data.get("data"))
```

### OutFox Chrome Extension Dispatcher
```javascript
async function enrichLeadViaVault(lead) {
  const VAULT_ENDPOINT = 'https://vault.api.crafture.space/api/enrich/waterfall';
  const VAULT_KEY = '007_haiSecret';

  try {
    const res = await fetch(VAULT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': VAULT_KEY
      },
      body: JSON.stringify({
        firstName: lead.firstName,
        lastName: lead.lastName,
        fullName: lead.fullName,
        domain: lead.domain,
        company: lead.company,
        linkedinUrl: lead.linkedinUrl
      })
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Vault enrichment failed');
    return json.data;
  } catch (err) {
    console.error('[OutFox Vault] Failover error:', err);
    return null;
  }
}
```
