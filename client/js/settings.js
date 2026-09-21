// SendQueue Settings & Test Email Dispatcher Controller

let state = {
  settings: {},
  templates: [],
  mockMessages: [],
  selectedMessage: null
};

// --- Initialization ---
async function initSettingsPage() {
  await loadCurrentUser();
  await loadSettings();
  await loadTemplatesForTest();
  await loadMockInbox();
  setupSettingsEvents();
}

async function loadCurrentUser() {
  try {
    const res = await API.getMe();
    if (res && res.user) {
      document.getElementById('userName').textContent = res.user.name;
      const role = res.user.role || 'member';
      document.getElementById('userRole').textContent = role === 'admin' ? 'Administrator' : 'Member';
      document.getElementById('avatarLetter').textContent = (res.user.name || 'A')[0].toUpperCase();
    }
  } catch (e) {
    window.location.href = '/login.html';
  }
}

async function loadTemplatesForTest() {
  try {
    const res = await API.getTemplates();
    state.templates = res.templates || [];
    const select = document.getElementById('testTemplateSelect');
    if (select) {
      select.innerHTML = '<option value="">(None - Use Custom Message Below)</option>' + 
        state.templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${escapeHtml(t.subject)})</option>`).join('');
    }
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

// --- Provider Settings Handling ---
async function loadSettings() {
  try {
    const res = await API.getProviderSettings();
    state.settings = res;
    renderProviderCards(res);
    populateSenderInputs(res);
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function renderProviderCards(settings) {
  const container = document.getElementById('providerCardsContainer');
  if (!container) return;

  const active = settings.activeProvider;

  container.innerHTML = settings.availableProviders.map(p => {
    const isActive = p.id === active;
    return `
      <div class="metric-card ${isActive ? 'active-provider-card' : ''}" style="cursor: pointer; position: relative; border-color: ${isActive ? 'var(--primary)' : 'var(--border-color)'}; background: ${isActive ? 'var(--primary-subtle)' : 'var(--bg-card)'};" onclick="selectProvider('${p.id}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <h4 style="color: var(--text-primary); font-size: 1rem; font-weight: 700;">${escapeHtml(p.name)}</h4>
          ${isActive ? '<span class="phase-badge badge-completed">Active Provider</span>' : '<span class="phase-badge badge-pending">Inactive</span>'}
        </div>
        <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 12px;">${escapeHtml(p.description)}</p>
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem; width: 100%;" onclick="event.stopPropagation(); verifyProviderCredentials('${p.id}')">
          ⚡ Test Connection
        </button>
      </div>
    `;
  }).join('');

  showConfigFields(active);
}

function selectProvider(id) {
  state.settings.activeProvider = id;
  renderProviderCards(state.settings);
  showConfigFields(id);
}

function showConfigFields(providerId) {
  // Hide all credential groups
  ['mock', 'resend', 'sendgrid', 'ses', 'smtp'].forEach(p => {
    const el = document.getElementById(`config_${p}`);
    if (el) el.style.display = p === providerId ? 'block' : 'none';
  });

  // Prefill existing saved credentials
  const creds = state.settings.credentials || {};
  if (providerId === 'resend' && creds.resend) {
    const inp = document.getElementById('resendApiKey');
    if (inp && !inp.value) inp.value = creds.resend.apiKey || '';
  }
  if (providerId === 'sendgrid' && creds.sendgrid) {
    const inp = document.getElementById('sendgridApiKey');
    if (inp && !inp.value) inp.value = creds.sendgrid.apiKey || '';
  }
  if (providerId === 'ses' && creds.ses) {
    if (document.getElementById('sesRegion')) document.getElementById('sesRegion').value = creds.ses.region || 'us-east-1';
    if (document.getElementById('sesAccessKey')) document.getElementById('sesAccessKey').value = creds.ses.accessKeyId || '';
    if (document.getElementById('sesSecretKey')) document.getElementById('sesSecretKey').value = creds.ses.secretAccessKey || '';
  }
  if (providerId === 'smtp' && creds.smtp) {
    if (document.getElementById('smtpHost')) document.getElementById('smtpHost').value = creds.smtp.host || '';
    if (document.getElementById('smtpPort')) document.getElementById('smtpPort').value = creds.smtp.port || '587';
    if (document.getElementById('smtpUser')) document.getElementById('smtpUser').value = creds.smtp.user || '';
    if (document.getElementById('smtpPass')) document.getElementById('smtpPass').value = creds.smtp.pass || '';
  }
}

function populateSenderInputs(settings) {
  if (settings.defaultSender) {
    document.getElementById('defaultFromName').value = settings.defaultSender.name || '';
    document.getElementById('defaultFromEmail').value = settings.defaultSender.email || '';
  }
}

async function verifyProviderCredentials(providerName) {
  try {
    const res = await API.verifyProvider({ providerName });
    if (res.valid) {
      alert(`✔ Connected successfully to ${providerName.toUpperCase()}: ${res.message}`);
    } else {
      alert(`✖ Connection failed for ${providerName.toUpperCase()}: ${res.error}`);
    }
  } catch (err) {
    alert(`Connection Error: ${err.message}`);
  }
}

async function saveAllSettings(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('saveSettingsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  const activeProvider = state.settings.activeProvider || 'mock';
  const fromName = document.getElementById('defaultFromName').value.trim();
  const fromEmail = document.getElementById('defaultFromEmail').value.trim();

  const credentials = {
    resend: { apiKey: document.getElementById('resendApiKey')?.value || '' },
    sendgrid: { apiKey: document.getElementById('sendgridApiKey')?.value || '' },
    ses: {
      region: document.getElementById('sesRegion')?.value || 'us-east-1',
      accessKeyId: document.getElementById('sesAccessKey')?.value || '',
      secretAccessKey: document.getElementById('sesSecretKey')?.value || ''
    },
    smtp: {
      host: document.getElementById('smtpHost')?.value || '',
      port: document.getElementById('smtpPort')?.value || '587',
      user: document.getElementById('smtpUser')?.value || '',
      pass: document.getElementById('smtpPass')?.value || ''
    }
  };

  try {
    const res = await API.saveProviderSettings({
      active_provider: activeProvider,
      default_from_name: fromName,
      default_from_email: fromEmail,
      credentials
    });
    showToast('Delivery settings saved successfully.');
    state.settings = res.settings;
    renderProviderCards(res.settings);
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save All Settings';
  }
}

// --- Test Sending Handling ---
async function handleSendTestEmail(e) {
  e.preventDefault();
  const sendBtn = document.getElementById('sendTestBtn');
  const alertEl = document.getElementById('testSendAlert');
  alertEl.style.display = 'none';

  sendBtn.disabled = true;
  sendBtn.textContent = 'Dispatching test...';

  const to = document.getElementById('testRecipientEmail').value.trim();
  const templateId = document.getElementById('testTemplateSelect').value || null;
  const customSubject = document.getElementById('testCustomSubject').value.trim();
  const customHtml = document.getElementById('testCustomHtml').value.trim();

  try {
    const res = await API.sendTestEmail({
      to,
      templateId,
      customSubject,
      customHtml
    });

    alertEl.className = 'alert-box alert-success show';
    alertEl.textContent = res.message;
    showToast(res.message);

    // If Mock provider is active, refresh Virtual Inbox
    if (state.settings.activeProvider === 'mock') {
      await loadMockInbox();
    }
  } catch (err) {
    alertEl.className = 'alert-box alert-danger show';
    alertEl.textContent = err.message || 'Test send failed.';
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '🚀 Send Test Email';
  }
}

// --- Virtual Mock Inbox Handling ---
async function loadMockInbox() {
  const tableBody = document.getElementById('mockInboxTableBody');
  if (!tableBody) return;

  try {
    const res = await API.getMockInbox(50);
    state.mockMessages = res.messages || [];
    renderMockInboxTable();
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" style="color: #f87171; padding: 20px; text-align: center;">Failed to load inbox: ${err.message}</td></tr>`;
  }
}

function renderMockInboxTable() {
  const tableBody = document.getElementById('mockInboxTableBody');
  const countBadge = document.getElementById('mockInboxCount');
  if (countBadge) countBadge.textContent = `${state.mockMessages.length} saved`;

  if (state.mockMessages.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 50px 20px;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">📬</div>
          <div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">Test Inbox is Empty</div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">When Test Mode is active, any emails you send will appear here.</p>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = state.mockMessages.map(m => {
    return `
      <tr>
        <td><strong style="color: var(--text-primary); font-size: 0.86rem;">${escapeHtml(m.recipient)}</strong></td>
        <td><span style="font-size: 0.82rem; color: var(--primary); font-weight: 500;">${escapeHtml(m.subject)}</span></td>
        <td><span style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHtml(m.sender)}</span></td>
        <td><span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(m.created_at).toLocaleTimeString()}</span></td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="openMessageDetailModal('${m.id}')">
            🔍 View Email
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openMessageDetailModal(id) {
  const msg = state.mockMessages.find(m => m.id === id);
  if (!msg) return;

  document.getElementById('msgDetailRecipient').textContent = msg.recipient;
  document.getElementById('msgDetailSender').textContent = msg.sender;
  document.getElementById('msgDetailSubject').textContent = msg.subject;
  document.getElementById('msgDetailDate').textContent = new Date(msg.created_at).toLocaleString();

  const iframe = document.getElementById('msgDetailIframe');
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(msg.html || `<pre style="font-family: monospace;">${escapeHtml(msg.text || '')}</pre>`);
  doc.close();

  openModal('messageDetailModal');
}

async function clearInbox() {
  if (!confirm('Delete all saved test emails?')) return;
  try {
    await API.clearMockInbox();
    showToast('Test inbox cleared.');
    await loadMockInbox();
  } catch (err) {
    alert('Failed to clear inbox: ' + err.message);
  }
}

// --- Tab Switching ---
function switchSettingsTab(tabName) {
  ['delivery', 'testsend', 'inbox'].forEach(t => {
    const btn = document.getElementById(`tabBtn_${t}`);
    const pane = document.getElementById(`tabPane_${t}`);
    if (btn && pane) {
      if (t === tabName) {
        btn.className = 'btn btn-primary';
        pane.style.display = 'block';
      } else {
        btn.className = 'btn btn-secondary';
        pane.style.display = 'none';
      }
    }
  });
}

function setupSettingsEvents() {
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) settingsForm.addEventListener('submit', saveAllSettings);

  const testForm = document.getElementById('testSendForm');
  if (testForm) testForm.addEventListener('submit', handleSendTestEmail);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'status-pill';
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.padding = '10px 18px';
  toast.style.fontSize = '0.88rem';
  toast.style.zIndex = '9999';
  toast.style.background = '#10b981';
  toast.style.color = '#fff';
  toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
  toast.innerHTML = `<span>✓</span> <span>${escapeHtml(msg)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', initSettingsPage);
