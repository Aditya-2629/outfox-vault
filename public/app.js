/**
 * OutFox Cloud Vault — Admin Dashboard Interactive Controller
 */

let activeProvider = 'apollo';
let vaultState = null;

const PROVIDER_NAMES = {
  apollo: 'Apollo.io',
  hunter: 'Hunter.io',
  apify: 'Apify',
};

async function fetchVaultStatus() {
  try {
    const res = await fetch('/admin/vault/status');
    const json = await res.json();
    if (json.ok) {
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
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No keys loaded in the ${provName} pool yet. Paste your account keys on the left!</td></tr>`;
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

      const details = k.error ? `<span style="color:#ef4444; font-size:11.5px;">${k.error}</span>` : `<span style="color:#10b981; font-size:11.5px;">${k.creditsRemaining || 'Verified & Ready'}</span>`;

      return `
      <tr>
        <td>
          <span class="key-code">${k.masked}</span>
          <span style="font-size:11px; color:#64748b; margin-left:6px;">#${idx + 1}</span>
        </td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td>${details}</td>
        <td><span style="font-weight:700; color:#fff;">${k.usageCount || 0}</span> reqs</td>
        <td style="text-align: right;">
          <button type="button" class="action-btn-mini btn-test-single" data-key="${k.masked}" data-id="${k.id}">⚡ Test</button>
          <button type="button" class="action-btn-mini action-btn-del" data-id="${k.id}">🗑️</button>
        </td>
      </tr>
    `;
    })
    .join('');

  // Wire single delete buttons
  tbody.querySelectorAll('.action-btn-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Are you sure you want to remove this key?')) {
        await fetch(`/admin/vault/key?provider=${activeProvider}&id=${id}`, { method: 'DELETE' });
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: activeProvider }),
      });
      fetchVaultStatus();
    });
  });
}

// Tab Switching
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeProvider = btn.dataset.provider;
    renderUI();
  });
});

// Bulk Key Addition
document.getElementById('btn-add-keys').addEventListener('click', async () => {
  const textarea = document.getElementById('input-bulk-keys');
  const raw = textarea.value.trim();
  if (!raw) return alert('Please paste one or more keys.');

  const btn = document.getElementById('btn-add-keys');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const res = await fetch('/admin/vault/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: activeProvider, keys: raw }),
    });
    const json = await res.json();
    if (json.ok) {
      textarea.value = '';
      alert(`Success! Added ${json.data.addedCount} new keys to ${PROVIDER_NAMES[activeProvider]} pool.`);
      fetchVaultStatus();
    } else {
      alert(`Error: ${json.error}`);
    }
  } catch (e) {
    alert(`Request error: ${e.message}`);
  } finally {
    btn.textContent = '➕ Add Keys to Pool';
    btn.disabled = false;
  }
});

// Live Test All Keys
document.getElementById('btn-test-all').addEventListener('click', async () => {
  const btn = document.getElementById('btn-test-all');
  btn.textContent = '⚡ Running Live Tests...';
  btn.disabled = true;

  try {
    const res = await fetch('/admin/vault/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: activeProvider }),
    });
    const json = await res.json();
    if (json.ok) {
      fetchVaultStatus();
      alert(`Tested ${json.data.length} keys in ${PROVIDER_NAMES[activeProvider]} pool.`);
    }
  } catch (e) {
    alert(`Testing failed: ${e.message}`);
  } finally {
    btn.textContent = '⚡ Live Test All';
    btn.disabled = false;
  }
});

// Clean Dead / Exhausted Keys
document.getElementById('btn-clean-pool').addEventListener('click', async () => {
  if (confirm(`Remove all dead, invalid, and exhausted keys from ${PROVIDER_NAMES[activeProvider]} pool?`)) {
    const res = await fetch('/admin/vault/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: activeProvider }),
    });
    const json = await res.json();
    if (json.ok) {
      alert(`Cleaned ${json.data.cleaned} inactive keys.`);
      fetchVaultStatus();
    }
  }
});

// Copy Endpoint
document.getElementById('btn-copy-endpoint').addEventListener('click', () => {
  navigator.clipboard.writeText('http://localhost:4000/api/enrich/waterfall');
  const btn = document.getElementById('btn-copy-endpoint');
  btn.textContent = 'Copied!';
  setTimeout(() => (btn.textContent = 'Copy'), 1500);
});

// Poll status every 10 seconds
fetchVaultStatus();
setInterval(fetchVaultStatus, 10000);
