# 🦊 OutFox Cloud Vault

> **Production-ready, zero-dependency Multi-Account API Key Vault, Load Balancer & Auto-Failover Proxy for Apollo.io, Hunter.io, and Apify.**

---

## ⚡ What is OutFox Cloud Vault?
If you have multiple accounts across Apollo.io, Hunter.io, or Apify (each with free monthly credits that refresh every 30 days), this microservice pools all those keys into an **active load-balanced array queue**:
- **Sequential Round-Robin Load Balancing:** Distributes requests evenly across all active accounts so no single key gets rate-limited.
- **Zero-Downtime Auto-Failover:** If a key hits `429 (Rate Limit)` or `402 (Monthly Cap Exhausted)`, it is automatically demoted to the back of the queue, and the next fresh key fulfills the lead within 50ms.
- **Invisible Magic for Frontends:** Your extensions, scrapers, and web apps call a single master endpoint (`/api/enrich/waterfall`). Users never see API keys, accounts, or rate limits.
- **Zero Dependencies:** Built entirely with native Node.js (`http`, `fs`, `crypto`, `fetch`). No heavy `node_modules` required.

---

## 🚀 1-Click Quickstart (Local Run in 5 Seconds)

```bash
# 1. Clone or extract the repo
cd outfox-vault

# 2. Run the server (Zero npm install needed!)
node server.js
```

Open your browser at **`http://localhost:4000/`** to access the Private Admin Dashboard.

---

## ☁️ 1-Click Deployment to Render

1. Create a new GitHub repository (e.g. `outfox-cloud-vault`) and push this folder:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit of outfox cloud vault"
   git branch -M main
   git remote add origin https://github.com/<your-username>/outfox-cloud-vault.git
   git push -u origin main
   ```
2. Log in to [Render.com](https://render.com) and click **New + ➔ Web Service**.
3. Select your GitHub repository.
4. Render will auto-detect the configuration:
   - **Runtime:** `Node`
   - **Build Command:** *(Leave empty)*
   - **Start Command:** `node server.js`
5. *(Optional)* Add Environment Variables in Render:
   - `ADMIN_API_KEY`: A secret password to protect your admin dashboard.
   - `CLIENT_API_KEY`: An API token for extensions and scrapers to authenticate.
6. Click **Deploy Web Service**! You'll get a public live URL: `https://outfox-cloud-vault.onrender.com`.

---

## 📊 Private Admin Dashboard Features

Navigate to `http://localhost:4000` (or your live Render URL):
- **Bulk Key Ingestion:** Paste 10, 20, 50 keys at once (one per line or comma-separated).
- **1-Click Live Test All:** Probes real Apollo/Hunter/Apify APIs to test validity and fetch remaining search credits.
- **1-Click Clean:** Purges dead or expired keys with one click.
- **Diagnostic Table:** Shows masked keys (`sk_••••1234`), status (`🟢 Active`, `🟡 Cooldown`, `🔴 Dead`, `⚠️ Limit Reached`), usage count, and last active timestamp.

---

## 🔗 Universal Endpoints Summary

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/enrich/waterfall` | `POST` | **Master Endpoint:** Cascades Hunter ➔ Apollo ➔ Pattern Generator with auto-key rotation. |
| `/api/enrich/apollo` | `POST` | Direct Apollo.io People Match using rotated Apollo keys pool. |
| `/api/enrich/hunter` | `POST` | Direct Hunter.io Email Finder using rotated Hunter keys pool. |
| `/api/scrape/apify` | `POST` | Direct Apify Actor Trigger using rotated Apify tokens pool. |
| `/health` | `GET` | Health check monitor for Render, Railway, or UptimeRobot. |

👉 **Read `DOCS.md` for complete API payload specifications and copy-pasteable code components (cURL, JavaScript, Python, Chrome Extension).**
