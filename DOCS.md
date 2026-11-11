# 📖 OutFox Cloud Vault — Complete API Reference & Integration Guide

Welcome to the official developer documentation for **OutFox Cloud Vault**. This guide provides ready-to-copy components and integration examples for any web application, scraper, bot, or Chrome extension.

---

## 🔒 Authentication

If you configure `CLIENT_API_KEY` in your `.env` (or Render Environment Variables), pass it in every request using either:
- **Header:** `x-api-key: your_client_api_key`
- **Bearer Token:** `Authorization: Bearer your_client_api_key`

*(If `CLIENT_API_KEY` is not set, endpoints are open for local development).*

---

## 1. Master Waterfall Endpoint: `POST /api/enrich/waterfall`

The primary endpoint for lead enrichment. Automatically runs the **Hunter.io ➔ Apollo.io ➔ Corporate Pattern** waterfall with multi-key auto-rotation.

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

Routes directly to the active Apollo.io key pool. Extracts verified emails, direct phone numbers, and job titles.

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

Routes directly to the active Hunter.io key pool. Ideal for domain-level email finding and verification scores.

### Request Body:
```json
{
  "domain": "stripe.com",
  "firstName": "Patrick",
  "lastName": "Collison"
}
```

---

## 4. Apify Scraper Endpoint: `POST /api/scrape/apify`

Triggers Apify actors with automated token rotation across your Apify accounts pool.

### Request Body:
```json
{
  "actorId": "apify/web-scraper",
  "input": {
    "runMode": "PRODUCTION",
    "startUrls": [{ "url": "https://example.com" }]
  }
}
```

---

## 💻 Ready-to-Copy Integration Components

### A. JavaScript / TypeScript (`fetch`):
```javascript
async function enrichLead(lead) {
  const VAULT_URL = 'http://localhost:4000'; // Replace with your Render URL
  const CLIENT_KEY = 'outfox_client_key_2026'; // Optional

  const res = await fetch(`${VAULT_URL}/api/enrich/waterfall`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLIENT_KEY,
    },
    body: JSON.stringify({
      firstName: lead.firstName,
      lastName: lead.lastName,
      fullName: lead.fullName,
      domain: lead.companyDomain || lead.domain,
      company: lead.companyName,
      linkedinUrl: lead.linkedinUrl,
    }),
  });

  const json = await res.json();
  if (json.ok && json.data?.email) {
    console.log('Verified Email:', json.data.email);
    console.log('Phone Number:', json.data.phone);
    console.log('Provider Used:', json.data.provider);
    return json.data;
  }
  return null;
}
```

---

### B. Python (`requests`):
```python
import requests

def enrich_lead(first_name, last_name, domain, company=""):
    vault_url = "http://localhost:4000/api/enrich/waterfall"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": "outfox_client_key_2026"
    }
    payload = {
        "firstName": first_name,
        "lastName": last_name,
        "domain": domain,
        "company": company
    }

    response = requests.post(vault_url, json=payload, headers=headers)
    if response.status_code == 200:
        data = response.json().get("data", {})
        print(f"Discovered: {data.get('email')} (Phone: {data.get('phone')})")
        return data
    return None

# Test Run
enrich_lead("Tim", "Cook", "apple.com", "Apple")
```

---

### C. cURL CLI:
```bash
curl -X POST "http://localhost:4000/api/enrich/waterfall" \
  -H "Content-Type: application/json" \
  -H "x-api-key: outfox_client_key_2026" \
  -d '{
    "firstName": "Elon",
    "lastName": "Musk",
    "domain": "tesla.com"
  }'
```

---

### D. OutFox Chrome Extension Integration (`extension/src/background/enrich.js`):
To connect OutFox extension to your deployed Cloud Vault, simply configure `vaultUrl`:

```javascript
// extension/src/background/enrich.js
export async function lookupEmail(profile, company) {
  const VAULT_URL = 'https://outfox-cloud-vault.onrender.com'; // Your live Render URL

  try {
    const res = await fetch(`${VAULT_URL}/api/enrich/waterfall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: profile.fullName,
        domain: profile.companyDomain || company.website,
        company: company.name || profile.companyName,
        linkedinUrl: profile.publicId ? `https://linkedin.com/in/${profile.publicId}` : undefined,
      }),
    });

    const json = await res.json();
    if (json.ok && json.data?.email) {
      return json.data;
    }
  } catch (err) {
    console.warn('[Enrichment] Vault error:', err.message);
  }
  return { provider: 'none', email: null };
}
```

---

## 🛠️ Error Codes & Failover Matrix

The engine handles HTTP error codes automatically behind the scenes:

| Error Code | HTTP Status | Vault Engine Behavior |
| :--- | :--- | :--- |
| **`RATE_LIMITED`** | `429` | Demotes failing key to `cooldown` for 15 mins. Rotates to next key instantly. |
| **`PAYMENT_REQUIRED`** | `402` | Flags key as `exhausted` (monthly cap reached). Rotates to next account. |
| **`UNAUTHORIZED`** | `401` | Flags key as `dead` (revoked/invalid). Purges from rotation. |
| **`NOT_FOUND`** | `404` | If Hunter returns no email, automatically cascades to Apollo.io pool. |
