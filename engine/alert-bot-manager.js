/**
 * Vault — Dynamic Multi-Bot Telegram Alert Manager
 * Manages persistent alert bot accounts and broadcasts simultaneous alerts via Promise.allSettled.
 */

const { readBots, writeBots, maskToken } = require('../storage/alert-bot-storage');

/**
 * Get all configured alert bots (optionally masked for UI)
 */
function getBots(mask = true) {
  const bots = readBots();
  if (!mask) return bots;

  return bots.map((b) => ({
    id: b.id,
    label: b.label,
    botToken: maskToken(b.botToken),
    chatId: b.chatId,
    enabled: b.enabled !== false,
    createdAt: b.createdAt || Date.now(),
  }));
}

/**
 * Register a new Telegram Alert Bot
 */
function addBot({ label, botToken, chatId }) {
  if (!botToken || !chatId) {
    throw new Error('Both botToken and chatId are required');
  }

  const bots = readBots();
  const cleanToken = botToken.trim();
  const cleanChatId = String(chatId).trim();
  const cleanLabel = (label || 'Telegram Alert Bot').trim();

  // Prevent duplicate botToken + chatId
  const exists = bots.some((b) => b.botToken === cleanToken && b.chatId === cleanChatId);
  if (exists) {
    throw new Error('This Telegram Bot Token and Chat ID pair is already registered.');
  }

  const newBot = {
    id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: cleanLabel,
    botToken: cleanToken,
    chatId: cleanChatId,
    enabled: true,
    createdAt: Date.now(),
  };

  bots.push(newBot);
  writeBots(bots);

  console.log(`[Alert Bot Manager] Added new bot: "${cleanLabel}" (Chat: ${cleanChatId})`);
  return {
    id: newBot.id,
    label: newBot.label,
    botToken: maskToken(newBot.botToken),
    chatId: newBot.chatId,
    enabled: newBot.enabled,
    createdAt: newBot.createdAt,
  };
}

/**
 * Update an existing alert bot (label, chatId, enabled, or botToken)
 */
function updateBot(id, updates = {}) {
  const bots = readBots();
  const bot = bots.find((b) => b.id === id);
  if (!bot) {
    throw new Error(`Bot with ID "${id}" not found`);
  }

  if (updates.label !== undefined) bot.label = String(updates.label).trim();
  if (updates.chatId !== undefined) bot.chatId = String(updates.chatId).trim();
  if (updates.botToken !== undefined && updates.botToken.trim()) {
    bot.botToken = updates.botToken.trim();
  }
  if (updates.enabled !== undefined) {
    bot.enabled = Boolean(updates.enabled);
  }

  writeBots(bots);
  console.log(`[Alert Bot Manager] Updated bot ${id}: enabled=${bot.enabled}`);

  return {
    id: bot.id,
    label: bot.label,
    botToken: maskToken(bot.botToken),
    chatId: bot.chatId,
    enabled: bot.enabled,
    createdAt: bot.createdAt,
  };
}

/**
 * Remove an alert bot by ID
 */
function deleteBot(id) {
  const bots = readBots();
  const initialLen = bots.length;
  const filtered = bots.filter((b) => b.id !== id);
  if (filtered.length < initialLen) {
    writeBots(filtered);
    console.log(`[Alert Bot Manager] Deleted bot ${id}`);
    return true;
  }
  return false;
}

/**
 * Dispatch a message to a single Telegram Bot with automatic plain-text fallback
 */
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

    // If initial sendMessage with parse_mode fails (e.g. Markdown underscores error in URLs),
    // automatically retry as plain text (without parse_mode) so alerts are never dropped.
    if (!res.ok && parseMode) {
      console.warn(
        `[Alert Bot Manager] Telegram sendMessage with parse_mode="${parseMode}" failed for bot ${bot.id} (${json.description || res.status}). Retrying as plain text without parse_mode...`
      );

      const plainText =
        messageText.includes('<') && messageText.includes('>')
          ? messageText.replace(/<[^>]*>/g, '')
          : messageText;

      const retryPayload = {
        chat_id: bot.chatId,
        text: plainText,
        disable_web_page_preview: true,
      };

      res = await sendPayload(retryPayload);
      json = await res.json().catch(() => ({}));
    }

    if (!res.ok) {
      const errMsg = json.description || `HTTP ${res.status}`;
      return { ok: false, botId: bot.id, label: bot.label, chatId: bot.chatId, error: errMsg };
    }
    return { ok: true, botId: bot.id, label: bot.label, chatId: bot.chatId, messageId: json.result?.message_id };
  } catch (err) {
    return { ok: false, botId: bot.id, label: bot.label, chatId: bot.chatId, error: err.message };
  }
}

/**
 * Broadcast an identical alert message to ALL enabled bots simultaneously
 */
async function broadcastAlert(messageText, options = {}) {
  const bots = readBots();
  const activeBots = bots.filter((b) => b.enabled !== false);

  if (activeBots.length === 0) {
    console.log('[Alert Bot Manager] Broadcast skipped: no enabled alert bots configured');
    return { total: 0, sent: 0, failed: 0, results: [] };
  }

  console.log(`[Alert Bot Manager] Broadcasting alert to ${activeBots.length} active bot(s)...`);

  const deliveryPromises = activeBots.map((bot) => sendTelegramMessage(bot, messageText, options));
  const settled = await Promise.allSettled(deliveryPromises);

  const results = settled.map((item, idx) => {
    if (item.status === 'fulfilled') {
      return item.value;
    }
    return {
      ok: false,
      botId: activeBots[idx].id,
      label: activeBots[idx].label,
      chatId: activeBots[idx].chatId,
      error: item.reason?.message || 'Unknown promise failure',
    };
  });

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log(`[Alert Bot Manager] Broadcast complete: ${sent}/${activeBots.length} delivered, ${failed} failed`);
  return {
    total: activeBots.length,
    sent,
    failed,
    results,
  };
}

/**
 * Send a standardized test alert to all enabled bots
 */
async function sendTestAlert() {
  const timestamp = new Date().toLocaleString('en-US', { timeZoneName: 'short' });
  const testMsg = [
    `🔔 <b>[Vault Test Alert] Multi-Bot Alert Manager Active!</b>`,
    ``,
    `<b>Status:</b> All systems operational`,
    `<b>Host:</b> <code>https://vault.api.crafture.space/</code>`,
    `<b>Timestamp:</b> <code>${timestamp}</code>`,
    ``,
    `✅ <i>If you are reading this, this Telegram Bot is successfully connected and will receive real-time LinkedIn endpoint failure alerts & F12 capture guides.</i>`,
  ].join('\n');

  return await broadcastAlert(testMsg, { parse_mode: 'HTML' });
}

module.exports = {
  getBots,
  addBot,
  updateBot,
  deleteBot,
  sendTelegramMessage,
  broadcastAlert,
  sendTestAlert,
};
