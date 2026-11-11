/**
 * OutFox Cloud Vault — Apollo.io Adapter
 * People Match API & Credit Health Probing.
 */

const APOLLO_BASE = 'https://api.apollo.io/v1';

async function enrichApollo({ apiKey, firstName, lastName, domain, company, linkedinUrl }) {
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

async function testApolloKey(apiKey) {
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

module.exports = {
  enrichApollo,
  testApolloKey,
};
