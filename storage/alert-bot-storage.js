/**
 * Vault — Persistent Multi-Bot Alert Storage Layer
 * Thread-safe atomic JSON storage for dynamic developer Telegram alert bots.
 */

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'alert-bots.json');

function maskToken(token) {
  if (!token || typeof token !== 'string') return '';
  if (token.length <= 12) return '••••••••';
  const colonIdx = token.indexOf(':');
  if (colonIdx > 0 && colonIdx < token.length - 4) {
    return `${token.slice(0, colonIdx + 4)}••••••••${token.slice(-4)}`;
  }
  return `${token.slice(0, 6)}••••••••${token.slice(-4)}`;
}

function getInitialBots() {
  const bots = [];
  const envToken = process.env.DEV_TELEGRAM_BOT_TOKEN;
  const envChatId = process.env.DEV_TELEGRAM_CHAT_ID;

  if (envToken && envChatId) {
    bots.push({
      id: 'bot_env_default',
      label: 'Primary Developer Bot (Env)',
      botToken: envToken.trim(),
      chatId: String(envChatId).trim(),
      enabled: true,
      createdAt: Date.now(),
    });
  }
  return bots;
}

function readBots() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      const initial = getInitialBots();
      writeBots(initial);
      return initial;
    }
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[Alert Bot Storage] Read error:', err.message);
    return [];
  }
}

function writeBots(bots) {
  try {
    const tmpFile = `${STORAGE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(bots, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STORAGE_FILE);
  } catch (err) {
    console.error('[Alert Bot Storage] Atomic write error:', err.message);
  }
}

module.exports = {
  readBots,
  writeBots,
  maskToken,
};
