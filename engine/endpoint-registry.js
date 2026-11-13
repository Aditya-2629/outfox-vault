/**
 * Vault — Dynamic LinkedIn Endpoint Registry & Developer Alert Engine
 * Remote control plane for Voyager/SDUI endpoints with 12-hour deduplicated Telegram alerts.
 */

const { readEndpoints, writeEndpoints } = require('../storage/endpoint-storage');
const alertBotManager = require('./alert-bot-manager');

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
    const defaultGuide = CAPTURE_GUIDE_MAP[key] || {
      captureType: updates.method === 'POST' ? 'POST_ACTION' : 'GET_LIST',
      method: updates.method || 'POST',
      pageUrl: 'https://www.linkedin.com/',
      networkFilter: updates.method === 'POST' ? 'status-code:200 method:POST' : 'status-code:200 larger-than:3k',
      action: updates.method === 'POST' ? 'Perform action on LinkedIn' : 'Refresh page',
      hint: key,
      copyTarget: 'Headers → Request URL',
    };
    registry.endpoints[key] = {
      name: updates.name || key,
      url: updates.url || '',
      method: updates.method || (defaultGuide.method || 'POST'),
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: updates.captureGuide || defaultGuide,
    };
  }

  const ep = registry.endpoints[key];
  if (updates.url !== undefined) ep.url = updates.url.trim();
  if (updates.method !== undefined) ep.method = updates.method.toUpperCase().trim();
  if (updates.name !== undefined) ep.name = updates.name.trim();
  if (updates.sduiid !== undefined) ep.sduiid = updates.sduiid.trim();
  if (updates.queryId !== undefined) ep.queryId = updates.queryId.trim();

  // Reset health status and reset 12h alert cooldown whenever edited
  ep.status = 'healthy';
  ep.lastStatus = 200;
  ep.lastError = null;
  ep.lastAlertedAt = 0; // Reset 12h alert cooldown so newly reported failures alert immediately
  ep.lastCheckedAt = Date.now();

  registry.updatedAt = Date.now();
  writeEndpoints(registry);

  console.log(`[Endpoint Registry] Hot-updated ${key} -> ${ep.method} ${ep.url} (cooldown reset: lastAlertedAt=0)`);
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
    const defaultGuide = CAPTURE_GUIDE_MAP[key] || {
      captureType: 'GET_LIST',
      method: 'GET',
      pageUrl: 'https://www.linkedin.com/',
      networkFilter: 'status-code:200 larger-than:3k',
      action: 'Refresh page',
      hint: key,
      copyTarget: 'Headers → Request URL',
    };
    registry.endpoints[key] = {
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

  let broadcastResult = null;
  if (shouldAlert) {
    ep.lastAlertedAt = now; // Mark alerted timestamp for 12h cooldown
    broadcastResult = await sendTelegramAlert({
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
    alerted: Boolean(broadcastResult && broadcastResult.sent > 0),
    deduplicated: !shouldAlert,
    broadcast: broadcastResult || undefined,
  };
}

const CAPTURE_GUIDE_MAP = {
  me: {
    captureType: 'GET_LIST',
    method: 'GET',
    pageUrl: 'https://www.linkedin.com/feed/',
    networkFilter: 'status-code:200 larger-than:3k',
    action: 'Press Ctrl+R (Refresh)',
    hint: '/voyager/api/me',
    copyTarget: 'Headers → Request URL',
  },
  listSentInvitations: {
    captureType: 'GET_LIST',
    method: 'GET',
    pageUrl: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
    networkFilter: 'status-code:200 larger-than:3k',
    action: 'Open or refresh "Sent Invitations" tab',
    hint: 'sentInvitationViewsV2 or graphql / server-request',
    copyTarget: 'Headers → Request URL',
  },
  connectionsSummary: {
    captureType: 'GET_LIST',
    method: 'GET',
    pageUrl: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
    networkFilter: 'status-code:200 larger-than:3k',
    action: 'Open the "Connections" tab under My Network',
    hint: 'connectionsSummary (or Doc / Ctrl+Shift+F if SSR)',
    copyTarget: 'Headers → Request URL',
  },
  messengerConversations: {
    captureType: 'GET_LIST',
    method: 'GET',
    pageUrl: 'https://www.linkedin.com/messaging/',
    networkFilter: 'status-code:200 larger-than:3k',
    action: 'Open Messaging inbox or click any conversation thread',
    hint: 'voyagerMessagingGraphQL/graphql?queryId=messengerConversations...',
    copyTarget: 'Headers → Request URL',
  },
  profileView: {
    captureType: 'GET_LIST',
    method: 'GET',
    pageUrl: 'https://www.linkedin.com/in/{profile}',
    networkFilter: 'status-code:200 larger-than:3k',
    action: 'Navigate to any member profile page',
    hint: '/voyager/api/identity/dash/profiles',
    copyTarget: 'Headers → Request URL',
  },
  sendInvite: {
    captureType: 'POST_ACTION',
    method: 'POST',
    pageUrl: 'https://www.linkedin.com/in/{profile}',
    networkFilter: 'status-code:200 method:POST',
    action: 'Click "Connect" -> "Send" (without note)',
    hint: 'verifyQuotaAndCreateV2',
    copyTarget: 'Headers → Request URL',
  },
  withdrawInvitation: {
    captureType: 'POST_ACTION',
    method: 'POST',
    pageUrl: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
    networkFilter: 'status-code:200 method:POST',
    action: 'Click "Withdraw" on any pending invitation',
    hint: 'server-request?sduiid=...addaWithdrawInvitation (also check Payload tab)',
    copyTarget: 'Headers → Request URL',
  },
};

function formatErrorForAlert(rawError) {
  if (!rawError) return 'Unexpected Failure';
  const errVal =
    typeof rawError === 'object' && rawError !== null
      ? rawError.errorMessage || rawError.error || rawError.message || JSON.stringify(rawError)
      : rawError;
  const str = typeof errVal === 'string' ? errVal : String(errVal);
  // Strip all HTML tags, sanitize backticks to avoid broken Markdown blocks, and collapse whitespace
  const stripped = str
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return 'Unexpected Failure';
  if (stripped.length <= 180) return stripped;
  return `${stripped.slice(0, 177)}...`;
}

/**
 * Generate step-by-step F12 DevTools capture instructions based on captureType
 */
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

/**
 * Broadcast step-by-step Developer Capture Guide via dynamic Multi-Bot Manager
 */
async function sendTelegramAlert({ key, status, url, error, captureGuide = {} }) {
  const preset = CAPTURE_GUIDE_MAP[key] || {};
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

  return await alertBotManager.broadcastAlert(msg, { parse_mode: 'Markdown' });
}

module.exports = {
  getEndpoints,
  updateEndpoint,
  requestAudit,
  recordHealth,
  reportFailure,
  sendTelegramAlert,
};
