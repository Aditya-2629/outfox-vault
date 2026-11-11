/**
 * OutFox Cloud Vault — Atomic Storage Layer
 * Thread-safe read/writes to persistent JSON storage.
 */

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'vault.json');

function readStorage() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      const initial = {
        apollo: [],
        hunter: [],
        apify: [],
        stats: { totalRequests: 0, successfulEnrichments: 0, failoversHandled: 0, startedAt: Date.now() },
      };
      writeStorage(initial);
      return initial;
    }
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Storage] Read error:', err.message);
    return { apollo: [], hunter: [], apify: [], stats: {} };
  }
}

function writeStorage(data) {
  try {
    const tmpFile = `${STORAGE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STORAGE_FILE);
  } catch (err) {
    console.error('[Storage] Atomic write error:', err.message);
  }
}

module.exports = {
  readStorage,
  writeStorage,
};
