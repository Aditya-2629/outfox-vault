/**
 * Vault — Dynamic LinkedIn Endpoint Registry & Developer Alert Engine
 * Remote control plane for Voyager/SDUI endpoints with 12-hour deduplicated Telegram alerts.
 */

const { readEndpoints, writeEndpoints } = require('../storage/endpoint-storage');

let registry = readEndpoints();

/**
 * Get full registry including endpoints and audit state
 */
function getEndpoints() {
  registry = readEndpoints();
  return {
    updatedAt: registry.updatedAt,
    auditRequestedAt: registry.auditRequestedAt,
    endpoints: registry.endpoints,
  };
}

/**
 * Hot-update an endpoint's URL, method, sduiid, or queryId, and reset to healthy
 */
function updateEndpoint(key, updates = {}) {
  registry = readEndpoints();

  if (!registry.endpoints[key]) {
    registry.endpoints[key] = {
      name: updates.name || key,
      url: updates.url || '',
      method: updates.method || 'POST',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: updates.captureGuide || {
        pageUrl: 'https://www.linkedin.com/',
        networkFilter: key,
        action: 'Capture in DevTools Network tab',
        copyTarget: 'Request URL',
      },
    };
  }

  const ep = registry.endpoints[key];
  if (updates.url !== undefined) ep.url = updates.url.trim();
  if (updates.method !== undefined) ep.method = updates.method.toUpperCase().trim();
  if (updates.name !== undefined) ep.name = updates.name.trim();
  if (updates.sduiid !== undefined) ep.sduiid = updates.sduiid.trim();
  if (updates.queryId !== undefined) ep.queryId = updates.queryId.trim();

  // Reset health status and clear previous alerts
  ep.status = 'healthy';
  ep.lastStatus = 200;
  ep.lastError = null;
  ep.lastAlertedAt = null;
  ep.lastCheckedAt = Date.now();

  registry.updatedAt = Date.now();
  writeEndpoints(registry);

  console.log(`[Endpoint Registry] Hot-updated ${key} -> ${ep.method} ${ep.url}`);
  return ep;
}

/**
 * Signal connected extensions to run a read-only health audit on next heartbeat
 */
function requestAudit() {
  registry = readEndpoints();
  registry.auditRequestedAt = Date.now();
  writeEndpoints(registry);
  console.log(`[Endpoint Registry] Audit requested at ${new Date(registry.auditRequestedAt).toISOString()}`);
  return registry.auditRequestedAt;
}

/**
 * Record live health probe results sent by the extension
 */
function recordHealth(results = {}) {
  registry = readEndpoints();
  let updatedCount = 0;

  for (const [key, res] of Object.entries(results)) {
    if (registry.endpoints[key]) {
      const ep = registry.endpoints[key];
      ep.status = res.ok ? 'healthy' : 'degraded';
      ep.lastStatus = res.status || (res.ok ? 200 : 500);
      ep.lastCheckedAt = Date.now();
      ep.lastLatencyMs = typeof res.latencyMs === 'number' ? res.latencyMs : null;
      ep.lastError = res.error || null;
      updatedCount++;
    }
  }

  writeEndpoints(registry);
  console.log(`[Endpoint Registry] Recorded health audit for ${updatedCount} endpoints`);
  return { updatedCount, updatedAt: registry.updatedAt };
}

/**
 * Report endpoint failure (400/404/410) and dispatch 12-hour deduplicated Telegram alert
 */
async function reportFailure({ key, status, url, error }) {
  registry = readEndpoints();

  if (!registry.endpoints[key]) {
    registry.endpoints[key] = {
      name: key,
      url: url || '',
      method: 'POST',
      status: 'degraded',
      lastStatus: status || 500,
      lastCheckedAt: Date.now(),
      lastError: error || `HTTP ${status}`,
      lastAlertedAt: null,
      captureGuide: {
        pageUrl: 'https://www.linkedin.com/',
        networkFilter: key,
        action: 'Inspect DevTools Network tab',
        copyTarget: 'Request URL',
      },
    };
  }

  const ep = registry.endpoints[key];
  ep.status = 'degraded';
  ep.lastStatus = status || 500;
  ep.lastCheckedAt = Date.now();
  ep.lastError = error || `HTTP ${status || 'Error'}`;
  if (url) ep.lastFailedUrl = url;

  // 12-hour alert deduplication
  const now = Date.now();
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  const shouldAlert = !ep.lastAlertedAt || now - ep.lastAlertedAt > TWELVE_HOURS;

  let alertSent = false;
  if (shouldAlert) {
    ep.lastAlertedAt = now; // Mark alerted timestamp for 12h cooldown
    alertSent = await sendTelegramAlert({
      key,
      status: ep.lastStatus,
      url: url || ep.url,
      error: ep.lastError,
      captureGuide: ep.captureGuide,
    });
  } else {
    console.log(`[Endpoint Registry] Alert suppressed for ${key}: already alerted within 12h`);
  }

  writeEndpoints(registry);
  return {
    ok: true,
    key,
    status: 'degraded',
    alerted: alertSent,
    deduplicated: !shouldAlert,
  };
}

/**
 * Send step-by-step Developer Capture Guide via Telegram Bot API
 */
async function sendTelegramAlert({ key, status, url, error, captureGuide = {} }) {
  const botToken = process.env.DEV_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.DEV_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.log('[Endpoints Alert] Telegram alert skipped: DEV_TELEGRAM_BOT_TOKEN or DEV_TELEGRAM_CHAT_ID not configured.');
    return false;
  }

  const escapeHtml = (str) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const msg = [
    `🚨 <b>[Vault Alert] LinkedIn Endpoint Degraded!</b>`,
    ``,
    `<b>Endpoint Key:</b> <code>${escapeHtml(key)}</code>`,
    `<b>HTTP Status:</b> <code>${escapeHtml(status || 'Error')}</code>`,
    `<b>Error:</b> <code>${escapeHtml(error || 'Unexpected Failure')}</code>`,
    `<b>Current URL:</b>`,
    `<code>${escapeHtml(url || '')}</code>`,
    ``,
    `🛠️ <b>Developer F12 Capture Guide:</b>`,
    `1. <b>Page URL:</b> ${escapeHtml(captureGuide.pageUrl || 'https://www.linkedin.com/')}`,
    `2. <b>Network Filter:</b> <code>${escapeHtml(captureGuide.networkFilter || key)}</code>`,
    `3. <b>Action:</b> ${escapeHtml(captureGuide.action || 'Perform action on LinkedIn')}`,
    `4. <b>Copy Target:</b> ${escapeHtml(captureGuide.copyTarget || 'Request URL')}`,
    ``,
    `👉 <b>Hot-Fix in Vault Admin UI:</b>`,
    `https://vault.api.crafture.space/`,
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Endpoints Alert] Telegram API error:', json.description || res.status);
      return false;
    }
    console.log(`[Endpoints Alert] Telegram alert dispatched successfully for ${key}`);
    return true;
  } catch (err) {
    console.error('[Endpoints Alert] Failed to dispatch Telegram alert:', err.message);
    return false;
  }
}

module.exports = {
  getEndpoints,
  updateEndpoint,
  requestAudit,
  recordHealth,
  reportFailure,
  sendTelegramAlert,
};
