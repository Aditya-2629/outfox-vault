/**
 * Vault — Modern Admin Dashboard Controller
 * Pure white theme, interactive docs modal, zero-downtime multi-account diagnostics.
 */

let activeProvider = 'apollo';
let vaultState = null;
let activeDocsLang = 'curl';

const PROVIDER_NAMES = {
  apollo: 'Apollo.io',
  hunter: 'Hunter.io',
  apify: 'Apify',
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
  return localStorage.getItem('vault_admin_passkey') || '007_haiSecret';
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
      headers: { 'x-admin-key': passkey },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        setAdminPasskey(passkey);
        hideAuthOverlay();
        vaultState = json.data;
        renderUI();
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
  const key = getAdminPasskey();
  try {
    const res = await fetch('/admin/vault/status', {
      headers: { 'x-admin-key': key },
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

  // Current Provider Panel
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
        await fetch(`/admin/vault/key?provider=${activeProvider}&id=${id}`, {
          method: 'DELETE',
          headers: { 'x-admin-key': getAdminPasskey() },
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
      await fetch('/admin/vault/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': getAdminPasskey(),
        },
        body: JSON.stringify({ provider: activeProvider }),
      });
      fetchVaultStatus();
    });
  });
}

// =========================================================================
// 3. INTERACTIVE DOCUMENTATION MODAL
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
// 4. EVENT LISTENERS & INITIALIZATION
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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDocsModal();
  });

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

      try {
        const res = await fetch('/admin/vault/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': getAdminPasskey(),
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

      try {
        const res = await fetch('/admin/vault/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': getAdminPasskey(),
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
        const res = await fetch('/admin/vault/clean', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': getAdminPasskey(),
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
  setInterval(fetchVaultStatus, 10000);
});
