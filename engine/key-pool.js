/**
 * OutFox Cloud Vault — Key Pool Orchestration & Auto-Failover Engine
 * High-performance array-queue load balancer with zero external dependencies.
 */

const { readStorage, writeStorage } = require('../storage/vault-storage');
const apollo = require('./apollo-adapter');
const hunter = require('./hunter-adapter');
const apify = require('./apify-adapter');

let vault = readStorage();

function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function addKeys(provider, rawKeysString) {
  if (!vault[provider]) vault[provider] = [];
  const lines = String(rawKeysString || '')
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
        status: 'active', // 'active' | 'cooldown' | 'dead' | 'exhausted'
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

  writeStorage(vault);
  return { addedCount, totalInPool: vault[provider].length };
}

function removeKey(provider, keyId) {
  if (!vault[provider]) return false;
  const initialLen = vault[provider].length;
  vault[provider] = vault[provider].filter((item) => item.id !== keyId);
  const removed = vault[provider].length < initialLen;
  if (removed) writeStorage(vault);
  return removed;
}

function cleanPool(provider) {
  if (!vault[provider]) return { cleaned: 0 };
  const initialLen = vault[provider].length;
  vault[provider] = vault[provider].filter(
    (item) => item.status !== 'dead' && item.status !== 'exhausted'
  );
  const cleaned = initialLen - vault[provider].length;
  if (cleaned > 0) writeStorage(vault);
  return { cleaned, remaining: vault[provider].length };
}

/**
 * Sequential Round-Robin Load Balancing:
 * Returns the head active key and rotates it to the end of the queue.
 */
function getNextActiveKey(provider) {
  const pool = vault[provider] || [];
  const now = Date.now();

  // Auto-revive cooldown keys after 15 minutes
  for (const item of pool) {
    if (item.status === 'cooldown' && now - (item.lastUsedAt || 0) > 900000) {
      item.status = 'active';
      item.error = null;
    }
  }

  const available = pool.filter((item) => item.status === 'active');
  if (available.length === 0) return null;

  // Head of the queue
  const chosen = available[0];
  chosen.usageCount = (chosen.usageCount || 0) + 1;
  chosen.lastUsedAt = now;

  // Rotate to back for even load distribution across concurrent users
  const idx = pool.indexOf(chosen);
  if (idx > -1) {
    pool.splice(idx, 1);
    pool.push(chosen);
  }

  writeStorage(vault);
  return chosen;
}

/**
 * Demote a key on error (429 or 402/401)
 */
function demoteKey(provider, keyString, reason, status = 'cooldown') {
  const pool = vault[provider] || [];
  const item = pool.find((k) => k.key === keyString);
  if (item) {
    item.status = status;
    item.error = reason;
    item.lastUsedAt = Date.now();

    // Push failing key to very end of pool
    const idx = pool.indexOf(item);
    if (idx > -1) {
      pool.splice(idx, 1);
      pool.push(item);
    }
    vault.stats.failoversHandled = (vault.stats.failoversHandled || 0) + 1;
    writeStorage(vault);
    console.log(`[Vault Failover] Demoted ${provider} key ${item.masked} (${status}): ${reason}`);
  }
}

/**
 * Live test all keys in pool against real APIs
 */
async function testAllKeys(provider) {
  const pool = vault[provider] || [];
  const results = [];

  for (const item of pool) {
    let testResult = { ok: false, status: 'dead', error: 'Unknown' };
    if (provider === 'apollo') testResult = await apollo.testApolloKey(item.key);
    else if (provider === 'hunter') testResult = await hunter.testHunterKey(item.key);
    else if (provider === 'apify') testResult = await apify.testApifyToken(item.key);

    item.status = testResult.status;
    item.error = testResult.error;
    if (testResult.credits !== undefined) item.creditsRemaining = testResult.credits;
    results.push({ id: item.id, masked: item.masked, ...testResult });
  }

  writeStorage(vault);
  return results;
}

/**
 * Execute an enrichment task with automatic multi-key failover rotation.
 */
async function executeWithRotation(provider, taskFn) {
  const pool = vault[provider] || [];
  const maxAttempts = Math.min(pool.length || 1, 6); // Try up to 6 keys in pool
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt++;
    const keyItem = getNextActiveKey(provider);
    if (!keyItem) {
      throw new Error(`No active ${provider} keys available in vault pool.`);
    }

    try {
      vault.stats.totalRequests = (vault.stats.totalRequests || 0) + 1;
      const result = await taskFn(keyItem.key);

      if (result && result.email) {
        vault.stats.successfulEnrichments = (vault.stats.successfulEnrichments || 0) + 1;
      }
      writeStorage(vault);
      return { ...result, keyUsed: keyItem.masked };
    } catch (err) {
      lastError = err;
      if (err.isRateLimit) {
        demoteKey(provider, keyItem.key, 'Rate limit reached (429)', 'cooldown');
      } else if (err.isCreditExhausted) {
        demoteKey(provider, keyItem.key, 'Monthly credits exhausted (402)', 'exhausted');
      } else if (err.isAuthError) {
        demoteKey(provider, keyItem.key, 'Invalid API key (401)', 'dead');
      } else {
        demoteKey(provider, keyItem.key, err.message, 'cooldown');
      }
      // Loop automatically tries next key in pool
    }
  }

  throw lastError || new Error(`All active ${provider} keys exhausted.`);
}

function getVaultStatus() {
  return {
    stats: vault.stats,
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

module.exports = {
  addKeys,
  removeKey,
  cleanPool,
  getNextActiveKey,
  demoteKey,
  testAllKeys,
  executeWithRotation,
  getVaultStatus,
};
