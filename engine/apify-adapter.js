/**
 * OutFox Cloud Vault — Apify Adapter
 * Web Scraping Actor Trigger & Token Diagnostics.
 */

const APIFY_BASE = 'https://api.apify.com/v2';

async function runApifyActor({ apiKey, actorId, input = {} }) {
  if (!actorId) throw new Error('actorId is required for Apify run');

  const res = await fetch(`${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg = json.error?.message || `HTTP ${res.status}`;
    const err = new Error(`Apify error (${res.status}): ${errorMsg}`);
    err.status = res.status;
    err.isRateLimit = res.status === 429;
    err.isCreditExhausted = res.status === 402;
    err.isAuthError = res.status === 401 || res.status === 403;
    throw err;
  }

  return {
    provider: 'apify',
    runId: json.data?.id,
    status: json.data?.status,
    startedAt: json.data?.startedAt,
    datasetId: json.data?.defaultDatasetId,
  };
}

async function testApifyToken(apiKey) {
  try {
    const res = await fetch(`${APIFY_BASE}/user/me?token=${encodeURIComponent(apiKey)}`);
    const json = await res.json().catch(() => ({}));

    if (res.ok && json.data) {
      const username = json.data.username || 'Apify User';
      const plan = json.data.plan?.id || 'Free Plan';
      return {
        ok: true,
        status: 'active',
        credits: `${username} (${plan})`,
        error: null,
      };
    }

    const msg = json.error?.message || `HTTP ${res.status}`;
    return { ok: false, status: 'dead', error: msg };
  } catch (err) {
    return { ok: false, status: 'dead', error: err.message };
  }
}

module.exports = {
  runApifyActor,
  testApifyToken,
};
