/**
 * Vault — Multi-Account API Key Vault, Load Balancer & Auto-Failover Proxy
 * Cloudflare Worker with Workers KV for persistent storage.
 * Zero external runtime dependencies.
 */

import { INDEX_HTML, STYLE_CSS, APP_JS } from './static-assets.js';
import {
  enrichApollo,
  testApolloKey,
  enrichHunter,
  testHunterKey,
  runApifyActor,
  testApifyToken,
} from './adapters.js';

// =========================================================================
// 1. DEFAULT DATA SEEDS & REGISTRIES
// =========================================================================

const DEFAULT_ENDPOINTS_REGISTRY = {
  updatedAt: Date.now(),
  auditRequestedAt: null,
  endpoints: {
    me: {
      name: 'Current User (Me)',
      url: '/voyager/api/me',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/feed/',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Press Ctrl+R (Refresh)',
        hint: '/voyager/api/me',
        copyTarget: 'Headers → Request URL',
      },
    },
    sendInvite: {
      name: 'Send Connection Invite',
      url: '/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2',
      method: 'POST',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'POST_ACTION',
        method: 'POST',
        pageUrl: 'https://www.linkedin.com/in/{profile}',
        networkFilter: 'status-code:200 method:POST',
        action: 'Click "Connect" -> "Send" (without note)',
        hint: 'verifyQuotaAndCreateV2',
        copyTarget: 'Headers → Request URL',
      },
    },
    withdrawInvitation: {
      name: 'Withdraw Invitation',
      url: '/flagship-web/rsc-action/actions/server-request?sduiid=com.linkedin.sdui.requests.mynetwork.addaWithdrawInvitation',
      method: 'POST',
      sduiid: 'com.linkedin.sdui.requests.mynetwork.addaWithdrawInvitation',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'POST_ACTION',
        method: 'POST',
        pageUrl: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
        networkFilter: 'status-code:200 method:POST',
        action: 'Click "Withdraw" on any pending invitation',
        hint: 'server-request?sduiid=...addaWithdrawInvitation (also check Payload tab)',
        copyTarget: 'Headers → Request URL',
      },
    },
    listSentInvitations: {
      name: 'List Sent Invitations',
      url: '/voyager/api/relationships/sentInvitationViewsV2?count=100&invitationType=CONNECTION&q=invitationType&start=0',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Open or refresh "Sent Invitations" tab',
        hint: 'sentInvitationViewsV2 or graphql / server-request',
        copyTarget: 'Headers → Request URL',
      },
    },
    connectionsSummary: {
      name: 'Connections Summary',
      url: '/voyager/api/relationships/connectionsSummary',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Open the "Connections" tab under My Network',
        hint: 'connectionsSummary (or Doc / Ctrl+Shift+F if SSR)',
        copyTarget: 'Headers → Request URL',
      },
    },
    messengerConversations: {
      name: 'Messenger Conversations',
      url: '/voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.9501074288a12f3ae9e3c7ea243bccbf',
      method: 'GET',
      queryId: 'messengerConversations.9501074288a12f3ae9e3c7ea243bccbf',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/messaging/',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Open Messaging inbox or click any conversation thread',
        hint: 'voyagerMessagingGraphQL/graphql?queryId=messengerConversations...',
        copyTarget: 'Headers → Request URL',
      },
    },
    profileView: {
      name: 'Profile View (Dash)',
      url: '/voyager/api/identity/dash/profiles',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/in/{profile}',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Navigate to any member profile page',
        hint: '/voyager/api/identity/dash/profiles',
        copyTarget: 'Headers → Request URL',
      },
    },
  },
};

const DEFAULT_VAULT = {
  apollo: [],
  hunter: [],
  apify: [],
  stats: {
    totalRequests: 0,
    successfulEnrichments: 0,
    failoversHandled: 0,
    startedAt: Date.now(),
  },
};

// In-memory fallback if KV binding is not provisioned
const memoryStore = new Map();

// =========================================================================
// 2. STORAGE LAYER (Workers KV with First-Read Seeding)
// =========================================================================

async function getKV(env, key, defaultValue) {
  if (env && env.VAULT_KV) {
    try {
      const val = await env.VAULT_KV.get(key, 'json');
      if (val !== null && val !== undefined) return val;
      if (defaultValue !== undefined) {
        await env.VAULT_KV.put(key, JSON.stringify(defaultValue));
      }
      return defaultValue;
    } catch (err) {
      console.error(`[KV Error] get ${key}:`, err.message);
    }
  }

  // Memory fallback
  if (!memoryStore.has(key)) {
    if (defaultValue !== undefined) {
      memoryStore.set(key, JSON.parse(JSON.stringify(defaultValue)));
    }
  }
  return memoryStore.get(key) ?? defaultValue;
}

async function putKV(env, key, value) {
  if (env && env.VAULT_KV) {
    try {
      await env.VAULT_KV.put(key, JSON.stringify(value));
      return;
    } catch (err) {
      console.error(`[KV Error] put ${key}:`, err.message);
    }
  }
  memoryStore.set(key, JSON.parse(JSON.stringify(value)));
}

async function getEndpointsRegistry(env) {
  const data = await getKV(env, 'endpoints', DEFAULT_ENDPOINTS_REGISTRY);
  if (!data || !data.endpoints) return DEFAULT_ENDPOINTS_REGISTRY;

  let needsSave = false;
  for (const [key, defaultVal] of Object.entries(DEFAULT_ENDPOINTS_REGISTRY.endpoints)) {
    if (!data.endpoints[key]) {
      data.endpoints[key] = { ...defaultVal };
      needsSave = true;
    } else {
      const ep = data.endpoints[key];
      if (!ep.captureGuide) {
        ep.captureGuide = { ...defaultVal.captureGuide };
        needsSave = true;
      } else {
        for (const [k, v] of Object.entries(defaultVal.captureGuide)) {
          if (ep.captureGuide[k] !== v) {
            ep.captureGuide[k] = v;
            needsSave = true;
          }
        }
      }
    }
  }
  if (needsSave) {
    await putKV(env, 'endpoints', data);
  }
  return data;
}

function getInitialBots(env) {
  const bots = [];
  const token = env.DEV_TELEGRAM_BOT_TOKEN;
  const chat = env.DEV_TELEGRAM_CHAT_ID;
  if (token && chat) {
    bots.push({
      id: 'bot_env_default',
      label: 'Primary Developer Bot (Env)',
      botToken: token.trim(),
      chatId: String(chat).trim(),
      enabled: true,
      createdAt: Date.now(),
    });
  }
  return bots;
}

async function getAlertBots(env, mask = false) {
  let bots = await getKV(env, 'alert_bots', getInitialBots(env));
  if (!Array.isArray(bots)) bots = [];
  if (mask) {
    return bots.map((b) => ({
      ...b,
      botToken: maskToken(b.botToken),
    }));
  }
  return bots;
}

async function getVault(env) {
  const data = await getKV(env, 'vault_keys', DEFAULT_VAULT);
  if (!data.stats) data.stats = { ...DEFAULT_VAULT.stats };
  if (!data.apollo) data.apollo = [];
  if (!data.hunter) data.hunter = [];
  if (!data.apify) data.apify = [];
  return data;
}

// =========================================================================
// 3. UTILITY & SECURITY HELPERS
// =========================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-admin-key',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function maskToken(token) {
  if (!token || typeof token !== 'string') return '';
  if (token.length <= 12) return '••••••••';
  const colonIdx = token.indexOf(':');
  if (colonIdx > 0 && colonIdx < token.length - 4) {
    return `${token.slice(0, colonIdx + 4)}••••••••${token.slice(-4)}`;
  }
  return `${token.slice(0, 6)}••••••••${token.slice(-4)}`;
}

function isAuthorized(request, expectedKey, headerName = 'x-api-key', query = {}) {
  if (!expectedKey) return true;
  const authHeader = (request.headers.get('authorization') || '').trim();
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const xApiKey = (request.headers.get('x-api-key') || '').trim();
  const xAdminKey = (request.headers.get('x-admin-key') || '').trim();
  const customHeader = (request.headers.get(headerName) || '').trim();
  const queryParam = (query[headerName] || query['key'] || query['admin_key'] || query['api_key'] || '').trim();

  return (
    customHeader === expectedKey ||
    xApiKey === expectedKey ||
    xAdminKey === expectedKey ||
    bearerToken === expectedKey ||
    queryParam === expectedKey
  );
}

// =========================================================================
// 4. TELEGRAM ALERT FORMATTER & BROADCASTER
// =========================================================================

function formatErrorForAlert(rawError) {
  if (!rawError) return 'Unexpected Failure';
  const errVal =
    typeof rawError === 'object' && rawError !== null
      ? rawError.errorMessage || rawError.error || rawError.message || JSON.stringify(rawError)
      : rawError;
  const str = typeof errVal === 'string' ? errVal : String(errVal);
  // Strip all HTML tags, sanitize backticks to protect markdown, and collapse whitespace
  const stripped = str
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return 'Unexpected Failure';
  if (stripped.length <= 180) return stripped;
  return `${stripped.slice(0, 177)}...`;
}

function generateCaptureSteps(key, guide = {}) {
  const isPost = guide.captureType === 'POST_ACTION' || guide.method === 'POST';
  const pageUrl = guide.pageUrl || 'https://www.linkedin.com/';
  const action = guide.action || (isPost ? 'Connect / Withdraw / Send' : 'view items');
  const hint = guide.hint || guide.networkFilter || key;

  if (isPost) {
    return [
      `1. Open ${pageUrl} -> F12 -> *Network* tab -> click *Fetch/XHR*`,
      `2. Click *Clear (🚫)*, then paste filter: \`status-code:200 method:POST\``,
      `3. Click *${action}*`,
      `4. Click the 1–2 captured POST requests (look for \`${hint}\`) -> copy *Headers → Request URL* (and check *Payload* tab if it is \`server-request?sduiid=...\`)`,
    ];
  }

  return [
    `1. Open ${pageUrl} -> F12 -> *Network* tab -> click *Fetch/XHR*`,
    `2. Paste filter: \`status-code:200 larger-than:3k\` (hides failed/noise requests)`,
    `3. Press *Ctrl+R* (Refresh) and perform ${action}`,
    `4. Look for \`${hint}\` -> copy *Headers → Request URL* (Note: if LinkedIn serves SSR HTML, switch filter to *Doc* or press *Ctrl+Shift+F* in Network and search a visible name/count from the page)`,
  ];
}

async function sendTelegramMessage(bot, messageText, options = {}) {
  const endpoint = `https://api.telegram.org/bot${bot.botToken}/sendMessage`;
  const parseMode =
    options.parse_mode !== undefined
      ? options.parse_mode
      : messageText.includes('<') && messageText.includes('>')
      ? 'HTML'
      : 'Markdown';

  const sendPayload = (body) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  try {
    const payload = {
      chat_id: bot.chatId,
      text: messageText,
      disable_web_page_preview: true,
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }

    let res = await sendPayload(payload);
    let json = await res.json().catch(() => ({}));

    // Auto-retry as plain text if Markdown parse error occurred
    if (!res.ok && parseMode) {
      console.warn(`[Alert Bot] Telegram sendMessage with parse_mode failed. Retrying plain text...`);
      const plainText = messageText.includes('<') && messageText.includes('>')
        ? messageText.replace(/<[^>]*>/g, '')
        : messageText;
      res = await sendPayload({
        chat_id: bot.chatId,
        text: plainText,
        disable_web_page_preview: true,
      });
      json = await res.json().catch(() => ({}));
    }

    return {
      id: bot.id,
      label: bot.label,
      ok: res.ok,
      status: res.status,
      telegramError: res.ok ? null : json.description || `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      id: bot.id,
      label: bot.label,
      ok: false,
      status: 0,
      telegramError: err.message,
    };
  }
}

async function broadcastAlert(env, messageText, options = {}) {
  const bots = await getAlertBots(env, false);
  const activeBots = bots.filter((b) => b.enabled);
  if (activeBots.length === 0) {
    return { total: 0, sent: 0, failed: 0, results: [] };
  }

  const results = await Promise.allSettled(
    activeBots.map((bot) => sendTelegramMessage(bot, messageText, options))
  );

  const formatted = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { id: activeBots[i].id, label: activeBots[i].label, ok: false, telegramError: r.reason?.message }
  );

  return {
    total: activeBots.length,
    sent: formatted.filter((f) => f.ok).length,
    failed: formatted.filter((f) => !f.ok).length,
    results: formatted,
  };
}

async function sendTelegramAlert(env, { key, status, url, error, captureGuide = {} }) {
  const preset = DEFAULT_ENDPOINTS_REGISTRY.endpoints[key]?.captureGuide || {};
  const guide = {
    ...preset,
    ...captureGuide,
  };
  if (!guide.captureType) {
    guide.captureType = guide.method === 'POST' ? 'POST_ACTION' : 'GET_LIST';
  }

  const cleanError = formatErrorForAlert(error);
  const steps = generateCaptureSteps(key, guide);

  const msg = [
    `🚨 *[Vault Alert] LinkedIn Endpoint Degraded!*`,
    ``,
    `*Endpoint Key:* \`${key}\``,
    `*HTTP Status:* \`${status || 'Error'}\``,
    `*Error:* \`${cleanError}\``,
    `*Current URL:*`,
    `\`${url || ''}\``,
    ``,
    `🛠️ *Developer F12 Capture Guide (${guide.captureType}):*`,
    ...steps,
    ``,
    `👉 *Hot-Fix in Vault Admin UI:*`,
    `https://vault.api.crafture.space/`,
  ].join('\n');

  return await broadcastAlert(env, msg, { parse_mode: 'Markdown' });
}

// =========================================================================
// 5. KEY POOL ORCHESTRATION & AUTO-FAILOVER
// =========================================================================

function getNextActiveKey(vault, provider) {
  const pool = vault[provider] || [];
  const now = Date.now();

  for (const item of pool) {
    if (item.status === 'cooldown' && now - (item.lastUsedAt || 0) > 600000) {
      item.status = 'active';
      item.error = null;
    }
  }

  const available = pool.filter((item) => item.status === 'active');
  if (available.length === 0) return null;

  const chosen = available[0];
  chosen.usageCount = (chosen.usageCount || 0) + 1;
  chosen.lastUsedAt = now;

  const idx = pool.indexOf(chosen);
  if (idx > -1) {
    pool.splice(idx, 1);
    pool.push(chosen);
  }

  return chosen;
}

function demoteKey(vault, provider, keyString, reason, status = 'cooldown') {
  const pool = vault[provider] || [];
  const item = pool.find((k) => k.key === keyString);
  if (item) {
    item.status = status;
    item.error = reason;
    item.lastUsedAt = Date.now();

    const idx = pool.indexOf(item);
    if (idx > -1) {
      pool.splice(idx, 1);
      pool.push(item);
    }
    vault.stats.failoversHandled = (vault.stats.failoversHandled || 0) + 1;
  }
}

async function executeWithRotation(env, provider, taskFn) {
  const vault = await getVault(env);
  const pool = vault[provider] || [];
  const maxAttempts = Math.min(pool.length || 1, 8);
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt++;
    const keyItem = getNextActiveKey(vault, provider);
    if (!keyItem) {
      throw new Error(`No active ${provider} keys available in vault pool.`);
    }

    try {
      vault.stats.totalRequests = (vault.stats.totalRequests || 0) + 1;
      const result = await taskFn(keyItem.key);

      if (result && result.email) {
        vault.stats.successfulEnrichments = (vault.stats.successfulEnrichments || 0) + 1;
      }
      await putKV(env, 'vault_keys', vault);
      return { ...result, keyUsed: keyItem.masked };
    } catch (err) {
      lastError = err;
      if (err.isRateLimit) {
        demoteKey(vault, provider, keyItem.key, 'Rate limit reached (429)', 'cooldown');
      } else if (err.isCreditExhausted) {
        demoteKey(vault, provider, keyItem.key, 'Monthly cap exhausted (402)', 'cooldown');
      } else if (err.isAuthError) {
        demoteKey(vault, provider, keyItem.key, 'Invalid API key (401)', 'dead');
      } else {
        demoteKey(vault, provider, keyItem.key, err.message, 'cooldown');
      }
      await putKV(env, 'vault_keys', vault);
    }
  }

  throw lastError || new Error(`All active ${provider} keys in pool exhausted.`);
}

function getVaultStatus(vault) {
  return {
    stats: vault.stats || { totalRequests: 0, successfulEnrichments: 0, failoversHandled: 0 },
    pools: {
      apollo: {
        total: (vault.apollo || []).length,
        active: (vault.apollo || []).filter((k) => k.status === 'active').length,
        keys: (vault.apollo || []).map((k) => ({ ...k, key: undefined })),
      },
      hunter: {
        total: (vault.hunter || []).length,
        active: (vault.hunter || []).filter((k) => k.status === 'active').length,
        keys: (vault.hunter || []).map((k) => ({ ...k, key: undefined })),
      },
      apify: {
        total: (vault.apify || []).length,
        active: (vault.apify || []).filter((k) => k.status === 'active').length,
        keys: (vault.apify || []).map((k) => ({ ...k, key: undefined })),
      },
    },
  };
}

// =========================================================================
// 6. MAIN WORKER ROUTER (fetch entrypoint)
// =========================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    const query = Object.fromEntries(url.searchParams.entries());

    // 1. CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 2. Health check
    if (pathname === '/health' && method === 'GET') {
      return jsonResponse({
        status: 'healthy',
        service: 'Vault',
        domain: url.hostname,
        timestamp: Date.now(),
      });
    }

    // Passkeys config
    const ADMIN_API_KEY = env.ADMIN_API_KEY || env.API_KEY || '007_haiSecret';
    const CLIENT_API_KEY = env.CLIENT_API_KEY || env.API_KEY || '007_haiSecret';

    // =====================================================================
    // 3. API ENDPOINTS (Protected by x-api-key: 007_haiSecret)
    // =====================================================================
    if (pathname.startsWith('/api/')) {
      const isAuthorizedRequest =
        isAuthorized(request, CLIENT_API_KEY, 'x-api-key', query) ||
        isAuthorized(request, ADMIN_API_KEY, 'x-admin-key', query) ||
        isAuthorized(request, ADMIN_API_KEY, 'x-api-key', query) ||
        isAuthorized(request, env.API_KEY, 'x-api-key', query) ||
        isAuthorized(request, '007_haiSecret', 'x-api-key', query) ||
        isAuthorized(request, '007_haiSecret', 'x-admin-key', query);

      if (!isAuthorizedRequest) {
        return jsonResponse(
          {
            ok: false,
            error: 'Unauthorized: Invalid or missing x-api-key header (passkey required: 007_haiSecret)',
          },
          401
        );
      }

      // --- A. LinkedIn Dynamic Endpoint Registry & Health ---
      if (pathname === '/api/endpoints' && method === 'GET') {
        const data = await getEndpointsRegistry(env);
        return jsonResponse({
          ok: true,
          updatedAt: data.updatedAt,
          auditRequestedAt: data.auditRequestedAt,
          endpoints: data.endpoints,
        });
      }

      if (pathname === '/api/endpoints/audit-request' && method === 'POST') {
        const data = await getEndpointsRegistry(env);
        data.auditRequestedAt = Date.now();
        await putKV(env, 'endpoints', data);
        return jsonResponse({ ok: true, auditRequestedAt: data.auditRequestedAt });
      }

      if (pathname === '/api/endpoints/health' && method === 'POST') {
        try {
          const payload = await parseJsonBody(request);
          const results = payload.results || payload || {};
          const data = await getEndpointsRegistry(env);
          let updatedCount = 0;

          for (const [k, res] of Object.entries(results)) {
            if (data.endpoints[k]) {
              const ep = data.endpoints[k];
              ep.status = res.ok ? 'healthy' : 'degraded';
              ep.lastStatus = res.status || (res.ok ? 200 : 500);
              ep.lastCheckedAt = Date.now();
              ep.lastLatencyMs = typeof res.latencyMs === 'number' ? res.latencyMs : null;
              ep.lastError = res.error || null;
              updatedCount++;
            }
          }

          data.updatedAt = Date.now();
          await putKV(env, 'endpoints', data);
          return jsonResponse({ ok: true, data: { updatedCount, updatedAt: data.updatedAt } });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 400);
        }
      }

      if (pathname === '/api/endpoints/report' && method === 'POST') {
        try {
          const { key, status, url, error } = await parseJsonBody(request);
          if (!key) return jsonResponse({ ok: false, error: 'key is required' }, 400);

          const data = await getEndpointsRegistry(env);
          if (!data.endpoints[key]) {
            const defaultGuide = DEFAULT_ENDPOINTS_REGISTRY.endpoints[key]?.captureGuide || {
              captureType: 'GET_LIST',
              method: 'GET',
              pageUrl: 'https://www.linkedin.com/',
              networkFilter: 'status-code:200 larger-than:3k',
              action: 'Refresh page',
              hint: key,
              copyTarget: 'Headers → Request URL',
            };
            data.endpoints[key] = {
              name: key,
              url: url || '',
              method: defaultGuide.method || 'GET',
              status: 'degraded',
              lastStatus: status || 500,
              lastCheckedAt: Date.now(),
              lastError: error || `HTTP ${status}`,
              lastAlertedAt: null,
              captureGuide: defaultGuide,
            };
          }

          const ep = data.endpoints[key];
          ep.status = 'degraded';
          ep.lastStatus = status || 500;
          ep.lastCheckedAt = Date.now();
          ep.lastError = error || `HTTP ${status || 'Error'}`;
          if (url) ep.lastFailedUrl = url;

          const now = Date.now();
          const TWELVE_HOURS = 12 * 60 * 60 * 1000;
          const shouldAlert = !ep.lastAlertedAt || now - ep.lastAlertedAt > TWELVE_HOURS;

          let broadcastResult = null;
          if (shouldAlert) {
            ep.lastAlertedAt = now;
            const alertPromise = sendTelegramAlert(env, {
              key,
              status: ep.lastStatus,
              url: url || ep.url,
              error: ep.lastError,
              captureGuide: ep.captureGuide,
            });

            if (ctx && typeof ctx.waitUntil === 'function') {
              ctx.waitUntil(alertPromise);
            } else {
              broadcastResult = await alertPromise;
            }
          }

          await putKV(env, 'endpoints', data);
          return jsonResponse({
            ok: true,
            key,
            status: 'degraded',
            alerted: shouldAlert,
            deduplicated: !shouldAlert,
            broadcast: broadcastResult || undefined,
          });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 500);
        }
      }

      if (
        (pathname.startsWith('/api/endpoints/') && method === 'PUT') ||
        (pathname === '/api/endpoints/update' && method === 'POST')
      ) {
        try {
          const payload = await parseJsonBody(request);
          const key = pathname.startsWith('/api/endpoints/') && pathname !== '/api/endpoints/update'
            ? pathname.slice('/api/endpoints/'.length).trim()
            : payload.key;

          if (!key) return jsonResponse({ ok: false, error: 'Endpoint key is required' }, 400);

          const data = await getEndpointsRegistry(env);
          if (!data.endpoints[key]) {
            const defaultGuide = DEFAULT_ENDPOINTS_REGISTRY.endpoints[key]?.captureGuide || {
              captureType: payload.method === 'POST' ? 'POST_ACTION' : 'GET_LIST',
              method: payload.method || 'POST',
              pageUrl: 'https://www.linkedin.com/',
              networkFilter: payload.method === 'POST' ? 'status-code:200 method:POST' : 'status-code:200 larger-than:3k',
              action: payload.method === 'POST' ? 'Perform action on LinkedIn' : 'Refresh page',
              hint: key,
              copyTarget: 'Headers → Request URL',
            };
            data.endpoints[key] = {
              name: payload.name || key,
              url: payload.url || '',
              method: payload.method || defaultGuide.method || 'POST',
              status: 'healthy',
              lastStatus: 200,
              lastCheckedAt: Date.now(),
              lastError: null,
              lastAlertedAt: null,
              captureGuide: payload.captureGuide || defaultGuide,
            };
          }

          const ep = data.endpoints[key];
          if (payload.url !== undefined) ep.url = payload.url.trim();
          if (payload.method !== undefined) ep.method = payload.method.toUpperCase().trim();
          if (payload.name !== undefined) ep.name = payload.name.trim();
          if (payload.sduiid !== undefined) ep.sduiid = payload.sduiid.trim();
          if (payload.queryId !== undefined) ep.queryId = payload.queryId.trim();

          ep.status = 'healthy';
          ep.lastStatus = 200;
          ep.lastError = null;
          ep.lastAlertedAt = 0; // Reset alert cooldown on manual edit
          ep.lastCheckedAt = Date.now();

          data.updatedAt = Date.now();
          await putKV(env, 'endpoints', data);
          return jsonResponse({ ok: true, key, endpoint: ep });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 500);
        }
      }

      // --- B. Dynamic Multi-Bot Telegram Alert Manager ---
      if (pathname === '/api/alert-bots' && method === 'GET') {
        const bots = await getAlertBots(env, true);
        return jsonResponse({ ok: true, bots });
      }

      if (pathname === '/api/alert-bots' && method === 'POST') {
        try {
          const payload = await parseJsonBody(request);
          if (!payload.botToken || !payload.chatId) {
            return jsonResponse({ ok: false, error: 'botToken and chatId are required' }, 400);
          }
          const bots = await getAlertBots(env, false);
          const newBot = {
            id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            label: (payload.label || 'Developer Alert Bot').trim(),
            botToken: payload.botToken.trim(),
            chatId: String(payload.chatId).trim(),
            enabled: payload.enabled !== false,
            createdAt: Date.now(),
          };
          bots.push(newBot);
          await putKV(env, 'alert_bots', bots);
          return jsonResponse({ ok: true, bot: { ...newBot, botToken: maskToken(newBot.botToken) } }, 201);
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 400);
        }
      }

      if (pathname === '/api/alert-bots/test' && method === 'POST') {
        try {
          const timestamp = new Date().toLocaleString('en-US', { timeZoneName: 'short' });
          const testMsg = [
            `🔔 <b>[Vault Test Alert] Multi-Bot Alert Manager Active!</b>`,
            ``,
            `<b>Status:</b> All systems operational`,
            `<b>Host:</b> <code>https://${url.hostname}/</code>`,
            `<b>Timestamp:</b> <code>${timestamp}</code>`,
            ``,
            `✅ <i>If you are reading this, this Telegram Bot is successfully connected to Vault on Cloudflare Workers and will receive real-time LinkedIn endpoint failure alerts & F12 capture guides.</i>`,
          ].join('\n');

          const report = await broadcastAlert(env, testMsg, { parse_mode: 'HTML' });
          return jsonResponse({ ok: true, report });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 500);
        }
      }

      if (
        (pathname.startsWith('/api/alert-bots/') && method === 'PATCH') ||
        (pathname === '/api/alert-bots/update' && method === 'POST')
      ) {
        try {
          const payload = await parseJsonBody(request);
          const id = pathname.startsWith('/api/alert-bots/') && pathname !== '/api/alert-bots/update'
            ? pathname.slice('/api/alert-bots/'.length).trim()
            : payload.id;

          if (!id) return jsonResponse({ ok: false, error: 'Bot ID required' }, 400);

          const bots = await getAlertBots(env, false);
          const bot = bots.find((b) => b.id === id);
          if (!bot) return jsonResponse({ ok: false, error: `Bot ${id} not found` }, 404);

          if (payload.label !== undefined) bot.label = payload.label.trim();
          if (payload.chatId !== undefined) bot.chatId = String(payload.chatId).trim();
          if (payload.botToken !== undefined && !payload.botToken.includes('••••')) {
            bot.botToken = payload.botToken.trim();
          }
          if (payload.enabled !== undefined) bot.enabled = Boolean(payload.enabled);

          await putKV(env, 'alert_bots', bots);
          return jsonResponse({ ok: true, bot: { ...bot, botToken: maskToken(bot.botToken) } });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 400);
        }
      }

      if ((pathname.startsWith('/api/alert-bots/') || pathname === '/api/alert-bots') && method === 'DELETE') {
        const id = pathname.startsWith('/api/alert-bots/')
          ? pathname.slice('/api/alert-bots/'.length).trim()
          : query.id;

        if (!id) return jsonResponse({ ok: false, error: 'Bot ID required' }, 400);

        const bots = await getAlertBots(env, false);
        const filtered = bots.filter((b) => b.id !== id);
        const deleted = filtered.length < bots.length;
        if (deleted) {
          await putKV(env, 'alert_bots', filtered);
        }
        return jsonResponse({ ok: deleted, id });
      }

      // --- C. Enrichment Proxy Pools ---
      if (pathname === '/api/enrich/waterfall' && method === 'POST') {
        try {
          const payload = await parseJsonBody(request);
          let match = null;

          const firstName = payload.firstName || (payload.fullName ? payload.fullName.split(' ')[0] : '');
          const lastName = payload.lastName || (payload.fullName ? payload.fullName.split(' ').slice(1).join(' ') : '');

          // 1. Try Hunter first if domain present
          if (payload.domain) {
            try {
              match = await executeWithRotation(env, 'hunter', async (key) => {
                return enrichHunter({
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
              match = await executeWithRotation(env, 'apollo', async (key) => {
                return enrichApollo({
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

          return jsonResponse({
            ok: true,
            data: match || { email: null, phone: null, provider: 'none', reason: 'No match found' },
          });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 500);
        }
      }

      if (pathname === '/api/enrich/apollo' && method === 'POST') {
        try {
          const payload = await parseJsonBody(request);
          const firstName = payload.firstName || (payload.fullName ? payload.fullName.split(' ')[0] : '');
          const lastName = payload.lastName || (payload.fullName ? payload.fullName.split(' ').slice(1).join(' ') : '');

          const result = await executeWithRotation(env, 'apollo', async (key) => {
            return enrichApollo({
              apiKey: key,
              firstName,
              lastName,
              domain: payload.domain,
              company: payload.company || payload.companyName,
              linkedinUrl: payload.linkedinUrl,
            });
          });
          return jsonResponse({ ok: true, data: result });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 500);
        }
      }

      if (pathname === '/api/enrich/hunter' && method === 'POST') {
        try {
          const payload = await parseJsonBody(request);
          const firstName = payload.firstName || (payload.fullName ? payload.fullName.split(' ')[0] : '');
          const lastName = payload.lastName || (payload.fullName ? payload.fullName.split(' ').slice(1).join(' ') : '');

          const result = await executeWithRotation(env, 'hunter', async (key) => {
            return enrichHunter({
              apiKey: key,
              domain: payload.domain,
              firstName,
              lastName,
            });
          });
          return jsonResponse({ ok: true, data: result });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 500);
        }
      }

      if (pathname === '/api/scrape/apify' && method === 'POST') {
        try {
          const payload = await parseJsonBody(request);
          const result = await executeWithRotation(env, 'apify', async (key) => {
            return runApifyActor({
              apiKey: key,
              actorId: payload.actorId,
              input: payload.input || {},
            });
          });
          return jsonResponse({ ok: true, data: result });
        } catch (err) {
          return jsonResponse({ ok: false, error: err.message }, 500);
        }
      }
    }

    // =====================================================================
    // 4. PRIVATE ADMIN VAULT ENDPOINTS (Protected by x-admin-key: 007_haiSecret)
    // =====================================================================
    if (pathname.startsWith('/admin/')) {
      const isAuthorizedRequest =
        isAuthorized(request, ADMIN_API_KEY, 'x-admin-key', query) ||
        isAuthorized(request, ADMIN_API_KEY, 'x-api-key', query) ||
        isAuthorized(request, CLIENT_API_KEY, 'x-admin-key', query) ||
        isAuthorized(request, CLIENT_API_KEY, 'x-api-key', query) ||
        isAuthorized(request, env.API_KEY, 'x-admin-key', query) ||
        isAuthorized(request, '007_haiSecret', 'x-admin-key', query) ||
        isAuthorized(request, '007_haiSecret', 'x-api-key', query);

      if (!isAuthorizedRequest) {
        return jsonResponse(
          {
            ok: false,
            error: 'Unauthorized: Invalid or missing x-admin-key (passkey required: 007_haiSecret)',
          },
          401
        );
      }

      if (pathname === '/admin/vault/status' && method === 'GET') {
        const vault = await getVault(env);
        return jsonResponse({
          ok: true,
          data: getVaultStatus(vault),
          authRequired: Boolean(ADMIN_API_KEY),
        });
      }

      if (pathname === '/admin/vault/add' && method === 'POST') {
        try {
          const { provider, keys } = await parseJsonBody(request);
          if (!provider || !keys) {
            return jsonResponse({ ok: false, error: 'provider and keys are required' }, 400);
          }

          const vault = await getVault(env);
          if (!vault[provider]) vault[provider] = [];

          const lines = String(keys)
            .split(/[\n,;]+/)
            .map((k) => k.trim())
            .filter(Boolean);

          const existingSet = new Set(vault[provider].map((item) => item.key));
          let addedCount = 0;

          for (const key of lines) {
            if (!existingSet.has(key)) {
              vault[provider].push({
                id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                key,
                masked: maskKey(key),
                status: 'active',
                error: null,
                usageCount: 0,
                creditsRemaining: null,
                lastUsedAt: 0,
                addedAt: Date.now(),
              });
              existingSet.add(key);
              addedCount++;
            }
          }

          await putKV(env, 'vault_keys', vault);
          return jsonResponse({ ok: true, data: { addedCount, totalInPool: vault[provider].length } });
        } catch (e) {
          return jsonResponse({ ok: false, error: e.message }, 500);
        }
      }

      if (pathname === '/admin/vault/test' && method === 'POST') {
        try {
          const { provider } = await parseJsonBody(request);
          if (!provider) return jsonResponse({ ok: false, error: 'provider is required' }, 400);

          const vault = await getVault(env);
          const pool = vault[provider] || [];
          const results = [];

          for (const item of pool) {
            let testResult = { ok: false, status: 'dead', error: 'Unknown' };
            if (provider === 'apollo') testResult = await testApolloKey(item.key);
            else if (provider === 'hunter') testResult = await testHunterKey(item.key);
            else if (provider === 'apify') testResult = await testApifyToken(item.key);

            item.status = testResult.status;
            item.error = testResult.error;
            if (testResult.credits !== undefined) item.creditsRemaining = testResult.credits;
            results.push({ id: item.id, masked: item.masked, ...testResult });
          }

          await putKV(env, 'vault_keys', vault);
          return jsonResponse({ ok: true, data: results });
        } catch (e) {
          return jsonResponse({ ok: false, error: e.message }, 500);
        }
      }

      if (pathname === '/admin/vault/clean' && method === 'POST') {
        try {
          const { provider } = await parseJsonBody(request);
          if (!provider) return jsonResponse({ ok: false, error: 'provider is required' }, 400);

          const vault = await getVault(env);
          if (!vault[provider]) return jsonResponse({ ok: true, data: { cleaned: 0, remaining: 0 } });

          const initialLen = vault[provider].length;
          vault[provider] = vault[provider].filter(
            (item) => item.status !== 'dead' && item.status !== 'exhausted'
          );
          const cleaned = initialLen - vault[provider].length;
          if (cleaned > 0) {
            await putKV(env, 'vault_keys', vault);
          }
          return jsonResponse({ ok: true, data: { cleaned, remaining: vault[provider].length } });
        } catch (e) {
          return jsonResponse({ ok: false, error: e.message }, 500);
        }
      }

      if (pathname === '/admin/vault/key' && method === 'DELETE') {
        const provider = query.provider;
        const id = query.id;
        if (!provider || !id) {
          return jsonResponse({ ok: false, error: 'provider and id query params required' }, 400);
        }

        const vault = await getVault(env);
        if (!vault[provider]) return jsonResponse({ ok: false });

        const initialLen = vault[provider].length;
        vault[provider] = vault[provider].filter((item) => item.id !== id);
        const removed = vault[provider].length < initialLen;
        if (removed) {
          await putKV(env, 'vault_keys', vault);
        }
        return jsonResponse({ ok: removed });
      }
    }

    // =====================================================================
    // 5. STATIC FILES (Admin Dashboard Web UI)
    // =====================================================================
    if (method === 'GET') {
      if (pathname === '/' || pathname === '/index.html') {
        return new Response(INDEX_HTML, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
            ...CORS_HEADERS,
          },
        });
      }
      if (pathname === '/style.css') {
        return new Response(STYLE_CSS, {
          headers: {
            'Content-Type': 'text/css; charset=utf-8',
            'Cache-Control': 'no-cache',
            ...CORS_HEADERS,
          },
        });
      }
      if (pathname === '/app.js') {
        return new Response(APP_JS, {
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache',
            ...CORS_HEADERS,
          },
        });
      }
      if (pathname === '/favicon.ico') {
        return new Response(null, { status: 204 });
      }
    }

    return jsonResponse({ ok: false, error: 'Endpoint not found' }, 404);
  },
};
