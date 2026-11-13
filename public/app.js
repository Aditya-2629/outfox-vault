/**
 * Vault — Modern Admin Dashboard Controller
 * Pure white theme, interactive docs modal, zero-downtime multi-account diagnostics,
 * remote control plane for LinkedIn Voyager & SDUI endpoints, and dynamic Multi-Bot Telegram alert manager.
 */

let activeProvider = 'apollo';
let vaultState = null;
let endpointsData = null;
let alertBots = [];
let activeDocsLang = 'curl';
let isAuditing = false;

const PROVIDER_NAMES = {
  apollo: 'Apollo.io',
  hunter: 'Hunter.io',
  apify: 'Apify',
  linkedin: 'LinkedIn Endpoints',
};

const CODE_TEMPLATES = {
  curl: `curl -X POST "https://vault.api.crafture.space/api/enrich/waterfall" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: 007_haiSecret" \\
  -d '{
    "firstName": "Satya",
    "lastName": "Nadella",
    "domain": "microsoft.com",
    "company": "Microsoft",
    "linkedinUrl": "https://www.linkedin.com/in/satyanadella"
  }'`,

  js: `// Enrichment via Vault Waterfall Proxy (Browser & Node.js)
const response = await fetch('https://vault.api.crafture.space/api/enrich/waterfall', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '007_haiSecret'
  },
  body: JSON.stringify({
    firstName: 'Satya',
    lastName: 'Nadella',
    domain: 'microsoft.com',
    company: 'Microsoft',
    linkedinUrl: 'https://www.linkedin.com/in/satyanadella'
  })
});

const result = await response.json();
console.log('Enrichment Result:', result.data);`,

  python: `import requests

url = "https://vault.api.crafture.space/api/enrich/waterfall"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "007_haiSecret"
}
payload = {
    "firstName": "Satya",
    "lastName": "Nadella",
    "domain": "microsoft.com",
    "company": "Microsoft",
    "linkedinUrl": "https://www.linkedin.com/in/satyanadella"
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()
print("Enrichment Result:", data.get("data"))`,

  extension: `// OutFox Chrome Extension — Direct Vault Proxy Dispatcher
async function enrichLeadViaVault(lead) {
  const VAULT_ENDPOINT = 'https://vault.api.crafture.space/api/enrich/waterfall';
  const VAULT_KEY = '007_haiSecret';

  try {
    const res = await fetch(VAULT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': VAULT_KEY
      },
      body: JSON.stringify({
        firstName: lead.firstName,
        lastName: lead.lastName,
        fullName: lead.fullName,
        domain: lead.domain,
        company: lead.company,
        linkedinUrl: lead.linkedinUrl
      })
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Vault enrichment failed');
    return json.data; // { email, phone, provider, confidence }
  } catch (err) {
    console.error('[OutFox Vault] Failover error:', err);
    return null;
  }
}`,
};

const LANG_TITLES = {
  curl: 'cURL — Master Waterfall Request',
  js: 'JavaScript (Fetch API) — Master Waterfall',
  python: 'Python (Requests) — Master Waterfall',
  extension: 'OutFox Extension — Native Lead Dispatcher',
};

// =========================================================================
// 1. AUTH & PASSKEY MANAGEMENT
// =========================================================================
function getAdminPasskey() {
  const val = localStorage.getItem('vault_admin_passkey');
  if (val && typeof val === 'string' && val.trim()) {
    return val.trim();
  }
  return '007_haiSecret';
}

function setAdminPasskey(key) {
  localStorage.setItem('vault_admin_passkey', key);
}

function clearAdminPasskey() {
  localStorage.removeItem('vault_admin_passkey');
}

function showAuthOverlay(msg = '') {
  const overlay = document.getElementById('auth-lock-overlay');
  const errorBox = document.getElementById('auth-error-msg');
  const input = document.getElementById('auth-passkey-input');

  if (overlay) overlay.style.display = 'flex';
  if (errorBox) {
    if (msg) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    } else {
      errorBox.style.display = 'none';
    }
  }
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

function hideAuthOverlay() {
  const overlay = document.getElementById('auth-lock-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function verifyAndUnlock(passkey) {
  try {
    const res = await fetch('/admin/vault/status', {
      headers: {
        'x-admin-key': passkey,
        'x-api-key': passkey,
      },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        setAdminPasskey(passkey);
        hideAuthOverlay();
        vaultState = json.data;
        renderUI();
        fetchEndpoints();
        fetchAlertBots();
        return true;
      }
    }
    showAuthOverlay('Invalid Admin Passkey. Please verify your credentials.');
    return false;
  } catch (err) {
    showAuthOverlay(`Connection error: ${err.message}`);
    return false;
  }
}

// =========================================================================
// 2. DATA FETCHING & UI RENDERING
// =========================================================================
async function fetchVaultStatus() {
  const passkey = getAdminPasskey();
  try {
    const res = await fetch('/admin/vault/status', {
      headers: {
        'x-admin-key': passkey,
        'x-api-key': passkey,
      },
    });

    if (res.status === 401) {
      showAuthOverlay('Session expired or passkey invalid. Please re-authenticate.');
      return;
    }

    const json = await res.json();
    if (json.ok) {
      hideAuthOverlay();
      vaultState = json.data;
      renderUI();
    }
  } catch (err) {
    console.error('Failed to fetch vault status:', err);
  }
}

async function fetchEndpoints() {
  const passkey = getAdminPasskey();
  try {
    const res = await fetch('/api/endpoints', {
      headers: {
        'x-api-key': passkey,
        'x-admin-key': passkey,
      },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        endpointsData = json;
        renderLinkedInWorkspace();
      }
    }
  } catch (err) {
    console.error('Failed to fetch endpoints registry:', err);
  }
}

async function fetchAlertBots() {
  const passkey = getAdminPasskey();
  try {
    const res = await fetch('/api/alert-bots', {
      headers: {
        'x-api-key': passkey,
        'x-admin-key': passkey,
      },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        alertBots = json.bots || [];
        renderBotsGrid();
      }
    }
  } catch (err) {
    console.error('Failed to fetch alert bots:', err);
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 10) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function renderUI() {
  if (!vaultState) return;

  const stats = vaultState.stats || {};
  const pools = vaultState.pools || {};

  // Global KPIs
  const totalKeys = (pools.apollo?.total || 0) + (pools.hunter?.total || 0) + (pools.apify?.total || 0);
  const activeKeys = (pools.apollo?.active || 0) + (pools.hunter?.active || 0) + (pools.apify?.active || 0);

  document.getElementById('stat-total-keys').textContent = totalKeys;
  document.getElementById('stat-active-keys').textContent = activeKeys;
  document.getElementById('stat-total-requests').textContent = stats.totalRequests || 0;
  document.getElementById('stat-failovers').textContent = stats.failoversHandled || 0;

  // Badges
  document.getElementById('badge-apollo').textContent = pools.apollo?.active || 0;
  document.getElementById('badge-hunter').textContent = pools.hunter?.active || 0;
  document.getElementById('badge-apify').textContent = pools.apify?.active || 0;

  const keyPoolWorkspace = document.getElementById('key-pool-workspace');
  const linkedinWorkspace = document.getElementById('linkedin-endpoints-workspace');

  if (activeProvider === 'linkedin') {
    if (keyPoolWorkspace) keyPoolWorkspace.style.display = 'none';
    if (linkedinWorkspace) linkedinWorkspace.style.display = 'flex';
    if (!endpointsData) {
      fetchEndpoints();
    } else {
      renderLinkedInWorkspace();
    }
    fetchAlertBots();
    return;
  }

  // Regular key pool mode
  if (keyPoolWorkspace) keyPoolWorkspace.style.display = 'grid';
  if (linkedinWorkspace) linkedinWorkspace.style.display = 'none';

  const currentPool = pools[activeProvider] || { total: 0, active: 0, keys: [] };
  const provName = PROVIDER_NAMES[activeProvider] || activeProvider;

  document.getElementById('ingest-title').textContent = `Add ${provName} Keys`;
  document.getElementById('pool-table-title').textContent = `${provName} Keys Pool`;
  document.getElementById('pool-active-summary').textContent = `${currentPool.active} Active · ${currentPool.total - currentPool.active} Inactive/Exhausted`;

  // Render Table Rows
  const tbody = document.getElementById('keys-table-body');
  const keys = currentPool.keys || [];

  if (keys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No keys loaded in the ${provName} pool yet. Paste accounts in the left box to begin load-balancing.</td></tr>`;
    return;
  }

  tbody.innerHTML = keys
    .map((k, idx) => {
      let statusClass = 'status-active';
      let statusLabel = '🟢 Active';

      if (k.status === 'cooldown') {
        statusClass = 'status-cooldown';
        statusLabel = '🟡 Cooldown (429)';
      } else if (k.status === 'exhausted') {
        statusClass = 'status-exhausted';
        statusLabel = '⚠️ Monthly Cap (402)';
      } else if (k.status === 'dead') {
        statusClass = 'status-dead';
        statusLabel = '🔴 Dead / Invalid';
      }

      const details = k.error
        ? `<span class="diag-error">${k.error}</span>`
        : `<span class="diag-ok">${k.creditsRemaining || 'Verified & Ready'}</span>`;

      return `
      <tr>
        <td>
          <div class="key-cell-wrap">
            <span class="key-code">${k.masked}</span>
            <span class="key-idx">#${idx + 1}</span>
          </div>
        </td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td>${details}</td>
        <td><span class="usage-count">${k.usageCount || 0}</span> reqs</td>
        <td style="text-align: right;">
          <div class="row-actions">
            <button type="button" class="action-btn-mini btn-test-single" data-key="${k.masked}" data-id="${k.id}">⚡ Test</button>
            <button type="button" class="action-btn-mini action-btn-del" data-id="${k.id}" title="Remove Key">🗑️</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');

  // Wire single delete buttons
  tbody.querySelectorAll('.action-btn-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Are you sure you want to remove this account key from the pool?')) {
        const passkey = getAdminPasskey();
        await fetch(`/admin/vault/key?provider=${activeProvider}&id=${id}`, {
          method: 'DELETE',
          headers: {
            'x-admin-key': passkey,
            'x-api-key': passkey,
          },
        });
        fetchVaultStatus();
      }
    });
  });

  // Wire single test buttons
  tbody.querySelectorAll('.btn-test-single').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.textContent = 'Testing...';
      btn.disabled = true;
      const passkey = getAdminPasskey();
      await fetch('/admin/vault/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': passkey,
          'x-api-key': passkey,
        },
        body: JSON.stringify({ provider: activeProvider }),
      });
      fetchVaultStatus();
    });
  });
}

// =========================================================================
// 3. LINKEDIN ENDPOINTS WORKSPACE & SCORECARD
// =========================================================================
function renderLinkedInWorkspace() {
  if (!endpointsData) return;

  const endpoints = endpointsData.endpoints || {};
  const keys = Object.keys(endpoints);

  let healthyCount = 0;
  let degradedCount = 0;

  keys.forEach((k) => {
    if (endpoints[k].status === 'healthy') healthyCount++;
    else degradedCount++;
  });

  // Badge on tab
  const badge = document.getElementById('badge-linkedin');
  if (badge) {
    if (degradedCount > 0) {
      badge.textContent = `${degradedCount} Degraded`;
      badge.className = 'tab-badge text-danger';
    } else {
      badge.textContent = `${healthyCount} Healthy`;
      badge.className = 'tab-badge text-green';
    }
  }

  // Summary header
  const summary = document.getElementById('linkedin-scorecard-summary');
  if (summary) {
    summary.textContent = `${keys.length} Endpoints · ${healthyCount} Healthy · ${degradedCount} Degraded · Updated ${formatRelativeTime(endpointsData.updatedAt)}`;
  }

  // Audit status indicator
  const auditTag = document.getElementById('audit-status-indicator');
  if (auditTag && !isAuditing) {
    if (endpointsData.auditRequestedAt) {
      auditTag.textContent = `Audited ${formatRelativeTime(endpointsData.auditRequestedAt)}`;
      auditTag.className = 'audit-status-tag';
    } else {
      auditTag.textContent = 'Audit Idle';
      auditTag.className = 'audit-status-tag';
    }
  }

  // Render cards grid
  const grid = document.getElementById('endpoints-grid');
  if (!grid) return;

  grid.innerHTML = keys
    .map((k) => {
      const ep = endpoints[k];
      const isHealthy = ep.status === 'healthy';
      const statusClass = isHealthy ? 'status-active' : 'status-dead';
      const statusLabel = isHealthy ? `🟢 Healthy (${ep.lastStatus || 200})` : `🔴 Degraded (${ep.lastStatus || 404})`;
      const methodBadgeClass = ep.method === 'POST' ? 'post' : ep.method === 'GET' ? 'get' : 'put';

      const sduiTag = ep.sduiid ? `<span class="tag-meta">SDUI: <code>${ep.sduiid}</code></span>` : '';
      const queryIdTag = ep.queryId ? `<span class="tag-meta">QueryID: <code>${ep.queryId}</code></span>` : '';
      const latencyTag = ep.lastLatencyMs ? `<span class="tag-meta">⏱️ ${ep.lastLatencyMs}ms</span>` : '';
      const errorTag = ep.lastError ? `<span class="diag-error">${ep.lastError}</span>` : `<span class="diag-ok">Healthy</span>`;

      return `
      <div class="endpoint-card" data-key="${k}">
        <div class="endpoint-card-head">
          <div class="ep-title-group">
            <span class="http-badge ${methodBadgeClass}">${ep.method}</span>
            <span class="ep-name">${ep.name || k}</span>
            <span class="key-code">${k}</span>
          </div>
          <div class="btn-group">
            <span class="status-pill ${statusClass}">${statusLabel}</span>
            <button type="button" class="btn-secondary btn-sm btn-edit-ep" data-key="${k}">
              ✏️ Edit & Hot-Swap
            </button>
          </div>
        </div>

        <div class="endpoint-url-box">
          <code>${ep.url}</code>
          <button type="button" class="btn-copy-mini btn-copy-ep-url" data-url="${ep.url}">
            📋 Copy URL
          </button>
        </div>

        <div class="ep-meta-row">
          <span>Checked: <b>${formatRelativeTime(ep.lastCheckedAt)}</b></span>
          <span>Status: ${errorTag}</span>
          ${latencyTag}
          ${sduiTag}
          ${queryIdTag}
        </div>

        <div class="capture-guide-box">
          <div class="guide-title">🛠️ Developer F12 Capture Guide</div>
          <div class="guide-grid">
            <div><b>Page:</b> <a href="${ep.captureGuide?.pageUrl || 'https://www.linkedin.com/'}" target="_blank" rel="noopener noreferrer">${ep.captureGuide?.pageUrl || 'LinkedIn Page'}</a></div>
            <div><b>Network Filter:</b> <code>${ep.captureGuide?.networkFilter || k}</code></div>
            <div><b>Action:</b> ${ep.captureGuide?.action || 'Perform action'}</div>
            <div><b>Copy Target:</b> ${ep.captureGuide?.copyTarget || 'Request URL'}</div>
          </div>
        </div>
      </div>
    `;
    })
    .join('');

  // Wire Copy URL buttons
  grid.querySelectorAll('.btn-copy-ep-url').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      navigator.clipboard.writeText(url);
      btn.textContent = '✓ Copied';
      setTimeout(() => (btn.textContent = '📋 Copy URL'), 1500);
    });
  });

  // Wire Edit buttons
  grid.querySelectorAll('.btn-edit-ep').forEach((btn) => {
    btn.addEventListener('click', () => {
      openEditModal(btn.dataset.key);
    });
  });
}

// =========================================================================
// 4. DYNAMIC MULTI-BOT TELEGRAM MANAGER
// =========================================================================
function renderBotsGrid() {
  const container = document.getElementById('bots-grid');
  const countSummary = document.getElementById('bots-count-summary');
  if (!container) return;

  const activeCount = alertBots.filter((b) => b.enabled !== false).length;
  if (countSummary) {
    countSummary.textContent = `${activeCount} of ${alertBots.length} Active · Simultaneous broadcast on failure`;
  }

  if (alertBots.length === 0) {
    container.innerHTML = `
      <div class="empty-bots-note">
        No alert bots registered yet. Click <b>"➕ Add Telegram Bot"</b> above to connect your bot token and chat ID.
      </div>
    `;
    return;
  }

  container.innerHTML = alertBots
    .map((bot) => {
      const isEnabled = bot.enabled !== false;
      const statusPill = isEnabled
        ? `<span class="status-pill status-active">🟢 Active</span>`
        : `<span class="status-pill status-dead">⚪ Disabled</span>`;
      const toggleLabel = isEnabled ? '⏸️ Disable' : '▶️ Enable';

      return `
      <div class="bot-card ${isEnabled ? '' : 'disabled'}" data-id="${bot.id}">
        <div class="bot-card-head">
          <span class="bot-name">${bot.label || 'Telegram Bot'}</span>
          ${statusPill}
        </div>
        <div class="bot-details">
          <span>Token: <code>${bot.botToken}</code></span>
          <span>Chat ID: <code>${bot.chatId}</code></span>
          <span style="color: var(--text-muted); font-size: 11px;">Added ${formatRelativeTime(bot.createdAt)}</span>
        </div>
        <div class="bot-actions-row">
          <button type="button" class="action-btn-mini btn-toggle-bot" data-id="${bot.id}" data-enabled="${!isEnabled}">
            ${toggleLabel}
          </button>
          <button type="button" class="action-btn-mini action-btn-del btn-delete-bot" data-id="${bot.id}" title="Remove Bot">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  // Wire Toggle Buttons
  container.querySelectorAll('.btn-toggle-bot').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const shouldEnable = btn.dataset.enabled === 'true';
      btn.disabled = true;
      const passkey = getAdminPasskey();
      try {
        const res = await fetch(`/api/alert-bots/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': passkey,
            'x-admin-key': passkey,
          },
          body: JSON.stringify({ enabled: shouldEnable }),
        });
        const json = await res.json();
        if (json.ok) {
          fetchAlertBots();
        } else {
          alert(`Error toggling bot: ${json.error}`);
        }
      } catch (err) {
        alert(`Request failed: ${err.message}`);
      }
    });
  });

  // Wire Delete Buttons
  container.querySelectorAll('.btn-delete-bot').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Are you sure you want to remove this Telegram Alert Bot?')) {
        const passkey = getAdminPasskey();
        try {
          const res = await fetch(`/api/alert-bots/${id}`, {
            method: 'DELETE',
            headers: {
              'x-api-key': passkey,
              'x-admin-key': passkey,
            },
          });
          const json = await res.json();
          if (json.ok) {
            fetchAlertBots();
          } else {
            alert(`Error deleting bot: ${json.error}`);
          }
        } catch (err) {
          alert(`Request failed: ${err.message}`);
        }
      }
    });
  });
}

function openAddBotModal() {
  const modal = document.getElementById('modal-add-bot');
  const errorBox = document.getElementById('add-bot-error');
  if (errorBox) errorBox.style.display = 'none';

  document.getElementById('add-bot-label').value = '';
  document.getElementById('add-bot-token').value = '';
  document.getElementById('add-bot-chatid').value = '';

  if (modal) modal.style.display = 'flex';
}

function closeAddBotModal() {
  const modal = document.getElementById('modal-add-bot');
  if (modal) modal.style.display = 'none';
}

// Edit Endpoint Modal Functions
function openEditModal(key) {
  if (!endpointsData?.endpoints?.[key]) return;
  const ep = endpointsData.endpoints[key];

  document.getElementById('edit-endpoint-key').value = key;
  document.getElementById('edit-endpoint-name').value = ep.name || key;
  document.getElementById('edit-endpoint-method').value = ep.method || 'POST';
  document.getElementById('edit-endpoint-url').value = ep.url || '';
  document.getElementById('edit-endpoint-sduiid').value = ep.sduiid || '';
  document.getElementById('edit-endpoint-queryid').value = ep.queryId || '';
  document.getElementById('edit-reset-healthy').checked = true;

  const modal = document.getElementById('modal-edit-endpoint');
  if (modal) modal.style.display = 'flex';
}

function closeEditModal() {
  const modal = document.getElementById('modal-edit-endpoint');
  if (modal) modal.style.display = 'none';
}

// =========================================================================
// 5. INTERACTIVE DOCUMENTATION MODAL
// =========================================================================
function updateDocsCode(lang) {
  activeDocsLang = lang;
  const codeElem = document.getElementById('docs-code-content');
  const labelElem = document.getElementById('docs-code-lang-label');

  if (codeElem) codeElem.textContent = CODE_TEMPLATES[lang] || '';
  if (labelElem) labelElem.textContent = LANG_TITLES[lang] || lang;

  document.querySelectorAll('.docs-tab-btn').forEach((btn) => {
    if (btn.dataset.lang === lang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function openDocsModal() {
  const modal = document.getElementById('modal-docs-overlay');
  if (modal) {
    updateDocsCode(activeDocsLang);
    modal.style.display = 'flex';
  }
}

function closeDocsModal() {
  const modal = document.getElementById('modal-docs-overlay');
  if (modal) modal.style.display = 'none';
}

// =========================================================================
// 6. EVENT LISTENERS & INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Passkey Unlock Form
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('auth-passkey-input');
      const passkey = (input ? input.value : '').trim();
      if (!passkey) return;

      const btn = document.getElementById('btn-auth-unlock');
      if (btn) {
        btn.textContent = 'Verifying...';
        btn.disabled = true;
      }
      await verifyAndUnlock(passkey);
      if (btn) {
        btn.textContent = 'Unlock Vault';
        btn.disabled = false;
      }
    });
  }

  // Lock Vault Button
  const btnLock = document.getElementById('btn-lock-vault');
  if (btnLock) {
    btnLock.addEventListener('click', () => {
      clearAdminPasskey();
      showAuthOverlay();
    });
  }

  // Docs Modal Open/Close
  const btnOpenDocs = document.getElementById('btn-open-docs');
  if (btnOpenDocs) btnOpenDocs.addEventListener('click', openDocsModal);

  const btnCloseDocs = document.getElementById('btn-close-docs');
  if (btnCloseDocs) btnCloseDocs.addEventListener('click', closeDocsModal);

  const backdropDocs = document.getElementById('modal-docs-backdrop');
  if (backdropDocs) backdropDocs.addEventListener('click', closeDocsModal);

  // Edit Modal Close Listeners
  const btnCloseEdit = document.getElementById('btn-close-edit');
  if (btnCloseEdit) btnCloseEdit.addEventListener('click', closeEditModal);

  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeEditModal);

  const backdropEdit = document.getElementById('modal-edit-backdrop');
  if (backdropEdit) backdropEdit.addEventListener('click', closeEditModal);

  // Add Bot Modal Listeners
  const btnOpenAddBot = document.getElementById('btn-open-add-bot');
  if (btnOpenAddBot) btnOpenAddBot.addEventListener('click', openAddBotModal);

  const btnCloseAddBot = document.getElementById('btn-close-add-bot');
  if (btnCloseAddBot) btnCloseAddBot.addEventListener('click', closeAddBotModal);

  const btnCancelAddBot = document.getElementById('btn-cancel-add-bot');
  if (btnCancelAddBot) btnCancelAddBot.addEventListener('click', closeAddBotModal);

  const backdropAddBot = document.getElementById('modal-add-bot-backdrop');
  if (backdropAddBot) backdropAddBot.addEventListener('click', closeAddBotModal);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDocsModal();
      closeEditModal();
      closeAddBotModal();
    }
  });

  // Add Bot Form Submit
  const formAddBot = document.getElementById('form-add-bot');
  if (formAddBot) {
    formAddBot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = document.getElementById('add-bot-label').value.trim();
      const botToken = document.getElementById('add-bot-token').value.trim();
      const chatId = document.getElementById('add-bot-chatid').value.trim();
      const errorBox = document.getElementById('add-bot-error');

      if (!botToken || !chatId) {
        if (errorBox) {
          errorBox.textContent = 'Bot Token and Chat ID are both required.';
          errorBox.style.display = 'block';
        }
        return;
      }

      const saveBtn = document.getElementById('btn-save-bot');
      saveBtn.textContent = 'Registering...';
      saveBtn.disabled = true;
      const passkey = getAdminPasskey();

      try {
        const res = await fetch('/api/alert-bots', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': passkey,
            'x-admin-key': passkey,
          },
          body: JSON.stringify({ label, botToken, chatId }),
        });

        const json = await res.json();
        if (json.ok) {
          closeAddBotModal();
          fetchAlertBots();
          alert(`Successfully registered alert bot: "${json.bot.label}"!`);
        } else {
          if (errorBox) {
            errorBox.textContent = json.error || 'Failed to add bot';
            errorBox.style.display = 'block';
          }
        }
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = `Network error: ${err.message}`;
          errorBox.style.display = 'block';
        }
      } finally {
        saveBtn.textContent = '➕ Add Bot';
        saveBtn.disabled = false;
      }
    });
  }

  // Send Test Alert Button ("🔔 Send Test Alert")
  const btnTestAlerts = document.getElementById('btn-test-alert-bots');
  if (btnTestAlerts) {
    btnTestAlerts.addEventListener('click', async () => {
      btnTestAlerts.textContent = '🔔 Broadcasting...';
      btnTestAlerts.disabled = true;
      const passkey = getAdminPasskey();

      try {
        const res = await fetch('/api/alert-bots/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': passkey,
            'x-admin-key': passkey,
          },
        });

        const json = await res.json();
        if (json.ok && json.report) {
          const report = json.report;
          if (report.total === 0) {
            alert('No enabled Telegram bots registered in Vault yet! Please click "➕ Add Telegram Bot" first.');
          } else {
            const summaryLines = (report.results || []).map(
              (r) => `${r.ok ? '✅' : '❌'} ${r.label} (Chat: ${r.chatId}): ${r.ok ? 'Delivered' : r.error}`
            );
            alert(
              `Simultaneous Broadcast Report:\n${report.sent}/${report.total} Bots Delivered Successfully!\n\n${summaryLines.join('\n')}`
            );
          }
        } else {
          alert(`Test broadcast error: ${json.error || 'Unknown error'}`);
        }
      } catch (err) {
        alert(`Failed to send test alert: ${err.message}`);
      } finally {
        btnTestAlerts.textContent = '🔔 Send Test Alert';
        btnTestAlerts.disabled = false;
      }
    });
  }

  // Edit Endpoint Form Submit
  const formEdit = document.getElementById('form-edit-endpoint');
  if (formEdit) {
    formEdit.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = document.getElementById('edit-endpoint-key').value;
      const name = document.getElementById('edit-endpoint-name').value;
      const method = document.getElementById('edit-endpoint-method').value;
      const url = document.getElementById('edit-endpoint-url').value;
      const sduiid = document.getElementById('edit-endpoint-sduiid').value;
      const queryId = document.getElementById('edit-endpoint-queryid').value;

      const saveBtn = document.getElementById('btn-save-endpoint');
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;
      const passkey = getAdminPasskey();

      try {
        const res = await fetch(`/api/endpoints/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': passkey,
            'x-admin-key': passkey,
          },
          body: JSON.stringify({ name, method, url, sduiid, queryId }),
        });

        const json = await res.json();
        if (json.ok) {
          closeEditModal();
          await fetchEndpoints();
          alert(`Successfully updated and reset ${key} to Healthy!`);
        } else {
          alert(`Error saving endpoint: ${json.error}`);
        }
      } catch (err) {
        alert(`Update request failed: ${err.message}`);
      } finally {
        saveBtn.textContent = '💾 Save & Hot-Update';
        saveBtn.disabled = false;
      }
    });
  }

  // Audit Request Trigger Button ("🩺 Test All Endpoints")
  const btnAudit = document.getElementById('btn-audit-request');
  if (btnAudit) {
    btnAudit.addEventListener('click', async () => {
      btnAudit.textContent = '🩺 Triggering Audit...';
      btnAudit.disabled = true;
      isAuditing = true;
      const passkey = getAdminPasskey();

      const auditTag = document.getElementById('audit-status-indicator');
      if (auditTag) {
        auditTag.textContent = 'Auditing Live...';
        auditTag.className = 'audit-status-tag active';
      }

      try {
        const res = await fetch('/api/endpoints/audit-request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': passkey,
            'x-admin-key': passkey,
          },
        });
        const json = await res.json();
        if (json.ok) {
          btnAudit.textContent = '🩺 Waiting for Extension...';

          // Poll /api/endpoints every 2 seconds for 16 seconds to capture results pushed by extension
          let pollCount = 0;
          const pollInterval = setInterval(async () => {
            pollCount++;
            await fetchEndpoints();
            if (pollCount >= 8) {
              clearInterval(pollInterval);
              isAuditing = false;
              btnAudit.textContent = '🩺 Test All Endpoints';
              btnAudit.disabled = false;
              if (auditTag) {
                auditTag.textContent = `Audited Just now`;
                auditTag.className = 'audit-status-tag';
              }
            }
          }, 2000);
        } else {
          alert(`Audit request error: ${json.error}`);
          btnAudit.textContent = '🩺 Test All Endpoints';
          btnAudit.disabled = false;
          isAuditing = false;
        }
      } catch (err) {
        alert(`Failed to trigger audit: ${err.message}`);
        btnAudit.textContent = '🩺 Test All Endpoints';
        btnAudit.disabled = false;
        isAuditing = false;
      }
    });
  }

  // Refresh Endpoints Button
  const btnRefresh = document.getElementById('btn-refresh-endpoints');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.textContent = '🔄...';
      await fetchEndpoints();
      await fetchAlertBots();
      btnRefresh.textContent = '🔄 Refresh';
    });
  }

  // Docs Language Tabs Switcher
  document.querySelectorAll('.docs-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      updateDocsCode(btn.dataset.lang);
    });
  });

  // Copy Docs Code Button
  const btnCopyCode = document.getElementById('btn-copy-code');
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      const code = CODE_TEMPLATES[activeDocsLang] || '';
      navigator.clipboard.writeText(code);

      const icon = document.getElementById('copy-btn-icon');
      const text = document.getElementById('copy-btn-text');
      if (icon) icon.textContent = '✓';
      if (text) text.textContent = 'Copied!';

      setTimeout(() => {
        if (icon) icon.textContent = '📋';
        if (text) text.textContent = 'Copy Code';
      }, 2000);
    });
  }

  // Copy Endpoint Button on Bottom Card
  const btnCopyEndpoint = document.getElementById('btn-copy-endpoint');
  if (btnCopyEndpoint) {
    btnCopyEndpoint.addEventListener('click', () => {
      navigator.clipboard.writeText('https://vault.api.crafture.space/api/enrich/waterfall');
      btnCopyEndpoint.textContent = '✓ Copied!';
      setTimeout(() => {
        btnCopyEndpoint.textContent = 'Copy Endpoint';
      }, 2000);
    });
  }

  // Provider Tab Switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeProvider = btn.dataset.provider;
      renderUI();
    });
  });

  // Bulk Key Addition
  const btnAddKeys = document.getElementById('btn-add-keys');
  if (btnAddKeys) {
    btnAddKeys.addEventListener('click', async () => {
      const textarea = document.getElementById('input-bulk-keys');
      const raw = (textarea ? textarea.value : '').trim();
      if (!raw) return alert('Please paste one or more keys.');

      btnAddKeys.textContent = 'Adding to Pool...';
      btnAddKeys.disabled = true;
      const passkey = getAdminPasskey();

      try {
        const res = await fetch('/admin/vault/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': passkey,
            'x-api-key': passkey,
          },
          body: JSON.stringify({ provider: activeProvider, keys: raw }),
        });
        const json = await res.json();
        if (json.ok) {
          if (textarea) textarea.value = '';
          alert(`Success! Added ${json.data.addedCount} account keys to ${PROVIDER_NAMES[activeProvider]} pool.`);
          fetchVaultStatus();
        } else {
          alert(`Error: ${json.error}`);
        }
      } catch (e) {
        alert(`Request error: ${e.message}`);
      } finally {
        btnAddKeys.textContent = '➕ Add Keys to Pool';
        btnAddKeys.disabled = false;
      }
    });
  }

  // Live Test All Keys
  const btnTestAll = document.getElementById('btn-test-all');
  if (btnTestAll) {
    btnTestAll.addEventListener('click', async () => {
      btnTestAll.textContent = '⚡ Running Live Tests...';
      btnTestAll.disabled = true;
      const passkey = getAdminPasskey();

      try {
        const res = await fetch('/admin/vault/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': passkey,
            'x-api-key': passkey,
          },
          body: JSON.stringify({ provider: activeProvider }),
        });
        const json = await res.json();
        if (json.ok) {
          fetchVaultStatus();
          alert(`Diagnostic complete: Tested ${json.data.length} keys in ${PROVIDER_NAMES[activeProvider]} pool.`);
        }
      } catch (e) {
        alert(`Testing failed: ${e.message}`);
      } finally {
        btnTestAll.textContent = '⚡ Live Test All';
        btnTestAll.disabled = false;
      }
    });
  }

  // Clean Dead / Exhausted Keys
  const btnCleanPool = document.getElementById('btn-clean-pool');
  if (btnCleanPool) {
    btnCleanPool.addEventListener('click', async () => {
      if (confirm(`Remove all dead, invalid, and exhausted accounts from ${PROVIDER_NAMES[activeProvider]} pool?`)) {
        const passkey = getAdminPasskey();
        const res = await fetch('/admin/vault/clean', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': passkey,
            'x-api-key': passkey,
          },
          body: JSON.stringify({ provider: activeProvider }),
        });
        const json = await res.json();
        if (json.ok) {
          alert(`Cleaned ${json.data.cleaned} inactive keys.`);
          fetchVaultStatus();
        }
      }
    });
  }

  // Initial Fetch & Periodic Sync
  fetchVaultStatus();
  fetchEndpoints();
  fetchAlertBots();
  setInterval(() => {
    fetchVaultStatus();
    if (activeProvider === 'linkedin') {
      fetchEndpoints();
      fetchAlertBots();
    }
  }, 10000);
});
