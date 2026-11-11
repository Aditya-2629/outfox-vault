/**
 * OutFox Cloud Proxy Vault & Load Balancer Server
 * Production-ready zero-dependency HTTP server with security authentication.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const pool = require('./engine/key-pool');
const apollo = require('./engine/apollo-adapter');
const hunter = require('./engine/hunter-adapter');
const apify = require('./engine/apify-adapter');

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Optional Security Keys (set in environment on Render/Railway)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const CLIENT_API_KEY = process.env.CLIENT_API_KEY || '';

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

function isAuthorized(req, expectedKey, headerName = 'x-api-key') {
  if (!expectedKey) return true; // Open if no key configured
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const customHeader = req.headers[headerName] || req.headers[headerName.toLowerCase()] || '';
  return customHeader === expectedKey || bearerToken === expectedKey;
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
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(content);
    }
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

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
    return sendJson(res, 200, { status: 'healthy', uptime: process.uptime(), timestamp: Date.now() });
  }

  // =========================================================================
  // 1. PUBLIC ENRICHMENT ENDPOINTS
  // =========================================================================
  if (pathname.startsWith('/api/')) {
    if (!isAuthorized(req, CLIENT_API_KEY, 'x-api-key')) {
      return sendJson(res, 401, { ok: false, error: 'Unauthorized: Invalid or missing x-api-key header' });
    }

    // A. Master Waterfall Endpoint (Hunter -> Apollo -> Pattern Generator)
    if (pathname === '/api/enrich/waterfall' && method === 'POST') {
      try {
        const payload = await parseJsonBody(req);
        let match = null;

        // 1. Try Hunter first if domain present
        if (payload.domain) {
          try {
            match = await pool.executeWithRotation('hunter', async (key) => {
              return hunter.enrichHunter({
                apiKey: key,
                domain: payload.domain,
                firstName: payload.firstName || (payload.fullName || '').split(' ')[0],
                lastName: payload.lastName || (payload.fullName || '').split(' ').slice(1).join(' '),
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
                firstName: payload.firstName || (payload.fullName || '').split(' ')[0],
                lastName: payload.lastName || (payload.fullName || '').split(' ').slice(1).join(' '),
                domain: payload.domain,
                company: payload.company || payload.companyName,
                linkedinUrl: payload.linkedinUrl,
              });
            });
          } catch {}
        }

        // 3. Fallback Corporate Pattern Generator
        if (!match || !match.email) {
          if (payload.domain && (payload.firstName || payload.fullName)) {
            const f = (payload.firstName || payload.fullName.split(' ')[0]).toLowerCase().replace(/[^a-z]/g, '');
            const l = (payload.lastName || payload.fullName.split(' ').slice(1).join(' ') || '').toLowerCase().replace(/[^a-z]/g, '');
            const d = payload.domain.toLowerCase().trim();
            match = {
              email: `${f}.${l || 'lead'}@${d}`,
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
        const result = await pool.executeWithRotation('apollo', async (key) => {
          return apollo.enrichApollo({
            apiKey: key,
            firstName: payload.firstName || (payload.fullName || '').split(' ')[0],
            lastName: payload.lastName || (payload.fullName || '').split(' ').slice(1).join(' '),
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
        const result = await pool.executeWithRotation('hunter', async (key) => {
          return hunter.enrichHunter({
            apiKey: key,
            domain: payload.domain,
            firstName: payload.firstName || (payload.fullName || '').split(' ')[0],
            lastName: payload.lastName || (payload.fullName || '').split(' ').slice(1).join(' '),
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
  // 2. PRIVATE ADMIN VAULT ENDPOINTS
  // =========================================================================
  if (pathname.startsWith('/admin/')) {
    if (!isAuthorized(req, ADMIN_API_KEY, 'x-admin-key')) {
      return sendJson(res, 401, { ok: false, error: 'Unauthorized: Invalid or missing x-admin-key' });
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
      const provider = parsedUrl.query.provider;
      const id = parsedUrl.query.id;
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
  console.log(`🦊 OutFox Cloud Key Vault & Load Balancer is ACTIVE!`);
  console.log(`📡 Port:               ${PORT}`);
  console.log(`🔒 Admin Auth:         ${ADMIN_API_KEY ? 'Enabled (Protected)' : 'Open (Dev Mode)'}`);
  console.log(`🔑 Client API Key:     ${CLIENT_API_KEY ? 'Required' : 'Public / Open'}`);
  console.log(`📊 Admin Web UI:       http://localhost:${PORT}/`);
  console.log(`⚡ Master Waterfall:   http://localhost:${PORT}/api/enrich/waterfall`);
  console.log(`=============================================================\n`);
});
