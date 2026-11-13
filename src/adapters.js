/**
 * Vault — Cloudflare Worker Adapters (Apollo.io, Hunter.io, Apify)
 * Zero-dependency Web Standard fetch API adapters.
 */

const APOLLO_BASE = 'https://api.apollo.io/v1';
const HUNTER_BASE = 'https://api.hunter.io/v2';
const APIFY_BASE = 'https://api.apify.com/v2';

export async function enrichApollo({ apiKey, firstName, lastName, domain, company, linkedinUrl }) {
  const payload = {
    api_key: apiKey,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    domain: domain || undefined,
    organization_name: company || undefined,
    linkedin_url: linkedinUrl || undefined,
  };

  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let json = {};
  try {
    json = JSON.parse(rawText);
  } catch {}

  if (!res.ok) {
    const errorMsg = json.message || rawText.slice(0, 140) || `HTTP ${res.status}`;
    const err = new Error(`Apollo error (${res.status}): ${errorMsg}`);
    err.status = res.status;
    err.isRateLimit = res.status === 429;
    err.isCreditExhausted = res.status === 402 || errorMsg.toLowerCase().includes('credit');
    err.isAuthError = res.status === 401 || res.status === 403;
    throw err;
  }

  const person = json.person || {};
  const phone = Array.isArray(person.phone_numbers) && person.phone_numbers[0]
    ? person.phone_numbers[0].sanitized_number || person.phone_numbers[0].raw_number
    : null;

  return {
    provider: 'apollo',
    email: person.email || null,
    phone,
    name: person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || null,
    title: person.title || null,
    organization: person.organization?.name || null,
    confidence: person.email_status === 'verified' ? 0.95 : 0.75,
    emailStatus: person.email_status || 'guessed',
  };
}

export async function testApolloKey(apiKey) {
  try {
    const res = await fetch(`${APOLLO_BASE}/people/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        first_name: 'Satya',
        last_name: 'Nadella',
        domain: 'microsoft.com',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, status: 'active', credits: 'Verified Account', error: null };
    }
    if (res.status === 402 || (data.message && data.message.toLowerCase().includes('credit'))) {
      return { ok: false, status: 'exhausted', error: 'Monthly credits exhausted (402)' };
    }
    if (res.status === 429) {
      return { ok: false, status: 'cooldown', error: 'Rate limited (429)' };
    }
    return { ok: false, status: 'dead', error: data.message || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 'dead', error: err.message };
  }
}

export async function enrichHunter({ apiKey, domain, firstName, lastName }) {
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

export async function testHunterKey(apiKey) {
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

export async function runApifyActor({ apiKey, actorId, input = {} }) {
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

export async function testApifyToken(apiKey) {
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
