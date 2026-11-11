/**
 * Vault — Multi-Account API Key Vault, Load Balancer & Auto-Failover Proxy
 * Zero-dependency production server with default security passkeys.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Load local .env if present (zero-dependency)
if (fs.existsSync(path.join(__dirname, '.env'))) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  } catch {}
}

const pool = require('./engine/key-pool');
const apollo = require('./engine/apollo-adapter');
const hunter = require('./engine/hunter-adapter');
const apify = require('./engine/apify-adapter');

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Security Passkeys (defaults to '007_haiSecret' by specification)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '007_haiSecret';
const CLIENT_API_KEY = process.env.CLIENT_API_KEY || '007_haiSecret';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-admin-key',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req, expectedKey, headerName = 'x-api-key', query = {}) {
  if (!expectedKey) return true;
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const customHeader = req.headers[headerName] || req.headers[headerName.toLowerCase()] || '';
  const queryParam = query[headerName] || query['key'] || query['admin_key'] || query['api_key'] || '';
  return customHeader === expectedKey || bearerToken === expectedKey || queryParam === expectedKey;
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    }
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-admin-key',
    });
    return res.end();
  }

  // Health check endpoint (for Render / Railway / Uptime monitors)
  if (pathname === '/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'healthy',
      service: 'Vault',
      domain: 'vault.api.crafture.space',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  }

  // =========================================================================
  // 1. CLIENT ENRICHMENT ENDPOINTS (Protected by x-api-key: 007_haiSecret)
  // =========================================================================
  if (pathname.startsWith('/api/')) {
    if (!isAuthorized(req, CLIENT_API_KEY, 'x-api-key', query)) {
      return sendJson(res, 401, {
        ok: false,
        error: 'Unauthorized: Invalid or missing x-api-key header (passkey required: 007_haiSecret)',
      });
    }

    // A. Master Waterfall Endpoint (Hunter -> Apollo -> Pattern Generator)
    if (pathname === '/api/enrich/waterfall' && method === 'POST') {
      try {
        const payload = await parseJsonBody(req);
        let match = null;

        const firstName = payload.firstName || (payload.fullName ? payload.fullName.split(' ')[0] : '');
        const lastName = payload.lastName || (payload.fullName ? payload.fullName.split(' ').slice(1).join(' ') : '');

        // 1. Try Hunter first if domain present
        if (payload.domain) {
          try {
            match = await pool.executeWithRotation('hunter', async (key) => {
              return hunter.enrichHunter({
                apiKey: key,
                domain: payload.domain,
                firstName,
                lastName,
              });
            });
          } catch {}
        }

        // 2. Cascade to Apollo if Hunter returned no email
        if (!match || !match.email) {
          try {
            match = await pool.executeWithRotation('apollo', async (key) => {
              return apollo.enrichApollo({
                apiKey: key,
                firstName,
                lastName,
                domain: payload.domain,
                company: payload.company || payload.companyName,
                linkedinUrl: payload.linkedinUrl,
              });
            });
          } catch {}
        }

        // 3. Fallback Corporate Pattern Generator
        if (!match || !match.email) {
          if (payload.domain && (firstName || payload.fullName)) {
            const f = (firstName || 'contact').toLowerCase().replace(/[^a-z]/g, '');
            const l = (lastName || 'lead').toLowerCase().replace(/[^a-z]/g, '');
            const d = payload.domain.toLowerCase().trim();
            match = {
              email: `${f}.${l}@${d}`,
              phone: null,
              provider: 'pattern',
              confidence: 0.5,
            };
          }
        }

        return sendJson(res, 200, {
          ok: true,
          data: match || { email: null, phone: null, provider: 'none', reason: 'No match found' },
        });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // B. Apollo Direct Pool
    if (pathname === '/api/enrich/apollo' && method === 'POST') {
      try {
        const payload = await parseJsonBody(req);
        const firstName = payload.firstName || (payload.fullName ? payload.fullName.split(' ')[0] : '');
        const lastName = payload.lastName || (payload.fullName ? payload.fullName.split(' ').slice(1).join(' ') : '');

        const result = await pool.executeWithRotation('apollo', async (key) => {
          return apollo.enrichApollo({
            apiKey: key,
            firstName,
            lastName,
            domain: payload.domain,
            company: payload.company || payload.companyName,
            linkedinUrl: payload.linkedinUrl,
          });
        });
        return sendJson(res, 200, { ok: true, data: result });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // C. Hunter Direct Pool
    if (pathname === '/api/enrich/hunter' && method === 'POST') {
      try {
        const payload = await parseJsonBody(req);
        const firstName = payload.firstName || (payload.fullName ? payload.fullName.split(' ')[0] : '');
        const lastName = payload.lastName || (payload.fullName ? payload.fullName.split(' ').slice(1).join(' ') : '');

        const result = await pool.executeWithRotation('hunter', async (key) => {
          return hunter.enrichHunter({
            apiKey: key,
            domain: payload.domain,
            firstName,
            lastName,
          });
        });
        return sendJson(res, 200, { ok: true, data: result });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // D. Apify Direct Pool
    if (pathname === '/api/scrape/apify' && method === 'POST') {
      try {
        const payload = await parseJsonBody(req);
        const result = await pool.executeWithRotation('apify', async (key) => {
          return apify.runApifyActor({
            apiKey: key,
            actorId: payload.actorId,
            input: payload.input || {},
          });
        });
        return sendJson(res, 200, { ok: true, data: result });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }

  // =========================================================================
  // 2. PRIVATE ADMIN VAULT ENDPOINTS (Protected by x-admin-key: 007_haiSecret)
  // =========================================================================
  if (pathname.startsWith('/admin/')) {
    if (!isAuthorized(req, ADMIN_API_KEY, 'x-admin-key', query)) {
      return sendJson(res, 401, {
        ok: false,
        error: 'Unauthorized: Invalid or missing x-admin-key (passkey required: 007_haiSecret)',
      });
    }

    // Status
    if (pathname === '/admin/vault/status' && method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        data: pool.getVaultStatus(),
        authRequired: Boolean(ADMIN_API_KEY),
      });
    }

    // Bulk Add
    if (pathname === '/admin/vault/add' && method === 'POST') {
      try {
        const { provider, keys } = await parseJsonBody(req);
        if (!provider || !keys) return sendJson(res, 400, { ok: false, error: 'provider and keys are required' });
        const result = pool.addKeys(provider, keys);
        return sendJson(res, 200, { ok: true, data: result });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }

    // Test All Keys
    if (pathname === '/admin/vault/test' && method === 'POST') {
      try {
        const { provider } = await parseJsonBody(req);
        if (!provider) return sendJson(res, 400, { ok: false, error: 'provider is required' });
        const results = await pool.testAllKeys(provider);
        return sendJson(res, 200, { ok: true, data: results });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }

    // Clean Dead/Exhausted
    if (pathname === '/admin/vault/clean' && method === 'POST') {
      try {
        const { provider } = await parseJsonBody(req);
        if (!provider) return sendJson(res, 400, { ok: false, error: 'provider is required' });
        const result = pool.cleanPool(provider);
        return sendJson(res, 200, { ok: true, data: result });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }

    // Delete Single Key
    if (pathname === '/admin/vault/key' && method === 'DELETE') {
      const provider = query.provider;
      const id = query.id;
      if (!provider || !id) return sendJson(res, 400, { ok: false, error: 'provider and id query params required' });
      const success = pool.removeKey(provider, id);
      return sendJson(res, 200, { ok: success });
    }
  }

  // =========================================================================
  // 3. STATIC FILES (Admin Dashboard Web UI)
  // =========================================================================
  if (method === 'GET') {
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    return serveStatic(res, filePath);
  }

  return sendJson(res, 404, { ok: false, error: 'Endpoint not found' });
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🦊 Vault — Multi-Account Key Pool & Failover Proxy ACTIVE!`);
  console.log(`📡 Port:               ${PORT}`);
  console.log(`🌐 Public Domain:      https://vault.api.crafture.space/`);
  console.log(`🔒 Admin Passkey:      ${ADMIN_API_KEY ? 'Configured (007_haiSecret)' : 'Open'}`);
  console.log(`🔑 Client API Key:     ${CLIENT_API_KEY ? 'Configured (007_haiSecret)' : 'Open'}`);
  console.log(`📊 Admin Web UI:       http://localhost:${PORT}/`);
  console.log(`⚡ Master Waterfall:   https://vault.api.crafture.space/api/enrich/waterfall`);
  console.log(`=============================================================\n`);
});
