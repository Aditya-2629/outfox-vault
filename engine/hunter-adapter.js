/**
 * OutFox Cloud Vault — Hunter.io Adapter
 * Email Finder API & Account Credits Diagnostics.
 */

const HUNTER_BASE = 'https://api.hunter.io/v2';

async function enrichHunter({ apiKey, domain, firstName, lastName }) {
  if (!domain) throw new Error('domain parameter is required for Hunter.io');

  const params = new URLSearchParams({
    domain,
    api_key: apiKey,
  });
  if (firstName) params.set('first_name', firstName);
  if (lastName) params.set('last_name', lastName);

  const res = await fetch(`${HUNTER_BASE}/email-finder?${params.toString()}`);
  const rawText = await res.text();
  let json = {};
  try {
    json = JSON.parse(rawText);
  } catch {}

  if (!res.ok) {
    const errorDetails = json.errors?.[0]?.details || rawText.slice(0, 140) || `HTTP ${res.status}`;
    const err = new Error(`Hunter error (${res.status}): ${errorDetails}`);
    err.status = res.status;
    err.isRateLimit = res.status === 429;
    err.isCreditExhausted = res.status === 402 || res.status === 422 || errorDetails.toLowerCase().includes('credit');
    err.isAuthError = res.status === 401 || res.status === 403;
    throw err;
  }

  const data = json.data || {};
  return {
    provider: 'hunter',
    email: data.email || null,
    phone: data.phone_number || null,
    confidence: typeof data.score === 'number' ? data.score / 100 : 0.8,
    verificationStatus: data.verification?.status || 'unknown',
  };
}

async function testHunterKey(apiKey) {
  try {
    const res = await fetch(`${HUNTER_BASE}/account?api_key=${encodeURIComponent(apiKey)}`);
    const json = await res.json().catch(() => ({}));

    if (res.ok && json.data) {
      const calls = json.data.calls || {};
      const remaining = (calls.available || 0) - (calls.used || 0);
      const isExhausted = remaining <= 0;
      return {
        ok: !isExhausted,
        status: isExhausted ? 'exhausted' : 'active',
        credits: `${remaining} searches left`,
        error: isExhausted ? 'Monthly search credits reached' : null,
      };
    }

    const errorDetails = json.errors?.[0]?.details || `HTTP ${res.status}`;
    return { ok: false, status: 'dead', error: errorDetails };
  } catch (err) {
    return { ok: false, status: 'dead', error: err.message };
  }
}

module.exports = {
  enrichHunter,
  testHunterKey,
};
