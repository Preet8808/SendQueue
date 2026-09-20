// SendQueue Campaign Orchestrator Controller

let state = {
  campaigns: [],
  templates: [],
  groups: [],
  activeCampaignId: null,
  pollTimer: null,
  wizardStep: 1,
  wizardData: {
    name: '',
    from_name: '',
    from_email: '',
    reply_to: '',
    audienceMode: 'all', // 'all' or 'groups'
    group_ids: [],
    template_id: '',
    subject: '',
    body_html: '',
    body_text: '',
    rate_limit_per_sec: 5,
    scheduled_at: null
  }
};

// --- Initialization ---
async function initCampaignsPage() {
  await loadCurrentUser();
  await loadGroups();
  await loadTemplates();
  await loadCampaigns();
  setupCampaignEvents();
  startLivePolling();
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

async function loadGroups() {
  try {
    const res = await API.getGroups();
    state.groups = res.groups || [];
  } catch (err) {
    console.error('Error loading groups:', err);
  }
}

async function loadTemplates() {
  try {
    const res = await API.getTemplates();
    state.templates = res.templates || [];
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

// --- Campaigns Fetching & Rendering ---
async function loadCampaigns() {
  try {
    const res = await API.getCampaigns();
    state.campaigns = res.campaigns || [];
    renderCampaignCards();
  } catch (err) {
    console.error('Failed to load campaigns:', err);
  }
}

function startLivePolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    // Check if any campaign is actively running
    const hasActive = state.campaigns.some(c => c.status === 'SENDING' || c.status === 'QUEUED');
    if (hasActive || document.getElementById('queueInspectorModal').style.display === 'flex') {
      await loadCampaigns();
      if (state.activeCampaignId && document.getElementById('queueInspectorModal').style.display === 'flex') {
        await loadRecipientLogs(state.activeCampaignId);
      }
    }
  }, 2500);
}

function renderCampaignCards() {
  const container = document.getElementById('campaignsListContainer');
  if (!container) return;

  if (state.campaigns.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 70px 20px;">
        <div style="font-size: 3rem; margin-bottom: 12px;">🚀</div>
        <h3 style="color: #fff; font-size: 1.2rem; margin-bottom: 6px;">No campaigns created yet</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">
          Launch your first rate-controlled bulk email dispatch in seconds.
        </p>
        <button class="btn btn-primary" onclick="openWizardModal()">+ Create First Campaign</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.campaigns.map(c => {
    let statusClass = 'badge-pending';
    if (c.status === 'SENDING') statusClass = 'badge-active';
    if (c.status === 'COMPLETED') statusClass = 'badge-completed';
    if (c.status === 'PAUSED') statusClass = 'badge-pending';

    const percent = c.progressPercent || 0;

    let actionButtons = '';
    if (c.status === 'SENDING') {
      actionButtons = `
        <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.78rem;" onclick="pauseCampaign('${c.id}')">⏸️ Pause</button>
        <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.78rem; color: #fca5a5;" onclick="cancelCampaign('${c.id}')">❌ Cancel</button>
      `;
    } else if (c.status === 'PAUSED') {
      actionButtons = `
        <button class="btn btn-primary" style="padding: 5px 10px; font-size: 0.78rem;" onclick="resumeCampaign('${c.id}')">▶️ Resume</button>
        <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.78rem; color: #fca5a5;" onclick="cancelCampaign('${c.id}')">❌ Cancel</button>
      `;
    }

    return `
      <div class="card" style="margin-bottom: 18px; border-left: 4px solid ${c.status === 'SENDING' ? 'var(--primary)' : (c.status === 'COMPLETED' ? 'var(--success)' : 'var(--border-color)')};">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h3 style="color: #fff; font-size: 1.1rem; font-weight: 700;">${escapeHtml(c.name)}</h3>
              <span class="phase-badge ${statusClass}">${c.status}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
              Subject: <strong style="color: #93c5fd;">${escapeHtml(c.subject)}</strong> &bull; From: ${escapeHtml(c.from_name)} &lt;${escapeHtml(c.from_email)}&gt;
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="/campaign-detail.html?id=${c.id}" class="btn btn-primary" style="padding: 5px 12px; font-size: 0.78rem; text-decoration: none; display: flex; align-items: center; gap: 4px;">
              📡 Live Telemetry
            </a>
            ${actionButtons}
            <button class="btn btn-secondary" style="padding: 5px 12px; font-size: 0.78rem;" onclick="openQueueInspector('${c.id}')">
              🔍 Inspect Queue
            </button>
          </div>
        </div>

        <!-- Animated Progress Bar -->
        <div style="margin: 16px 0 12px 0;">
          <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 6px;">
            <span style="color: var(--text-muted);">Queue Dispatch Progress</span>
            <span style="color: #fff; font-weight: 600;">${percent}% (${c.sent_count} / ${c.total_recipients} sent)</span>
          </div>
          <div style="height: 8px; background: rgba(255, 255, 255, 0.08); border-radius: var(--radius-full); overflow: hidden;">
            <div style="width: ${percent}%; height: 100%; background: ${percent === 100 ? 'var(--success)' : 'linear-gradient(90deg, var(--primary), #a855f7)'}; border-radius: var(--radius-full); transition: width 0.4s ease;"></div>
          </div>
        </div>

        <!-- Metrics Strip -->
        <div style="display: flex; gap: 20px; font-size: 0.8rem; border-top: 1px solid var(--border-color); padding-top: 12px; flex-wrap: wrap;">
          <div><span style="color: var(--text-muted);">Recipients:</span> <strong style="color: #fff;">${c.total_recipients}</strong></div>
          <div><span style="color: var(--text-muted);">Sent:</span> <strong style="color: #38bdf8;">${c.sent_count}</strong></div>
          <div><span style="color: var(--text-muted);">Delivered:</span> <strong style="color: #34d399;">${c.delivered_count || 0}</strong></div>
          <div><span style="color: var(--text-muted);">Bounced:</span> <strong style="color: #f87171;">${c.bounced_count || 0}</strong></div>
          <div><span style="color: var(--text-muted);">Pending:</span> <strong style="color: #a5b4fc;">${c.pending_count}</strong></div>
          <div><span style="color: var(--text-muted);">Rate:</span> <strong style="color: #fff;">${c.rate_limit_per_sec} msg/sec</strong></div>
          <div style="margin-left: auto; color: var(--text-muted); font-size: 0.75rem;">Created: ${new Date(c.created_at).toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join('');
}

// --- Campaign Controls ---
async function pauseCampaign(id) {
  try {
    await API.pauseCampaign(id);
    showToast('Campaign paused.');
    await loadCampaigns();
  } catch (err) {
    alert('Failed to pause campaign: ' + err.message);
  }
}

async function resumeCampaign(id) {
  try {
    await API.resumeCampaign(id);
    showToast('Campaign resumed.');
    await loadCampaigns();
  } catch (err) {
    alert('Failed to resume campaign: ' + err.message);
  }
}

async function cancelCampaign(id) {
  if (!confirm('Are you sure you want to cancel remaining unsent emails in this campaign?')) return;
  try {
    await API.cancelCampaign(id);
    showToast('Campaign cancelled.');
    await loadCampaigns();
  } catch (err) {
    alert('Failed to cancel campaign: ' + err.message);
  }
}

// --- Queue Inspector Modal ---
async function openQueueInspector(id) {
  state.activeCampaignId = id;
  const campaign = state.campaigns.find(c => c.id === id);
  if (campaign) {
    document.getElementById('inspectorCampaignName').textContent = campaign.name;
  }
  openModal('queueInspectorModal');
  await loadRecipientLogs(id);
}

async function loadRecipientLogs(campaignId) {
  const tableBody = document.getElementById('inspectorTableBody');
  try {
    const res = await API.getCampaignRecipients(campaignId, { limit: 50 });
    const recipients = res.recipients || [];

    if (recipients.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-muted);">No recipients found.</td></tr>';
      return;
    }

    tableBody.innerHTML = recipients.map(r => {
      let statusColor = '#9ca3af';
      if (r.status === 'SENT') statusColor = '#34d399';
      if (r.status === 'SENDING') statusColor = '#a5b4fc';
      if (r.status === 'FAILED') statusColor = '#f87171';
      if (r.status === 'RETRY') statusColor = '#f59e0b';

      return `
        <tr>
          <td><strong style="color: #fff; font-size: 0.84rem;">${escapeHtml(r.recipient_email)}</strong></td>
          <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(r.company || '—')}</span></td>
          <td><span class="status-pill" style="font-size: 0.7rem; padding: 2px 8px; color: ${statusColor}; border-color: ${statusColor};">${r.status}</span></td>
          <td><span style="font-size: 0.78rem; color: var(--text-muted);">${r.attempt_count} / ${r.max_attempts}</span></td>
          <td><span style="font-size: 0.75rem; color: ${r.error_message ? '#fca5a5' : 'var(--text-muted)'};">${escapeHtml(r.error_message || r.sent_at || 'Queued')}</span></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" style="color: #f87171; padding: 20px;">Failed to load logs: ${err.message}</td></tr>`;
  }
}

// --- 4-Step Campaign Creator Wizard ---
function openWizardModal() {
  state.wizardStep = 1;
  document.getElementById('wizardStep1').style.display = 'block';
  document.getElementById('wizardStep2').style.display = 'none';
  document.getElementById('wizardStep3').style.display = 'none';
  document.getElementById('wizardStep4').style.display = 'none';

  // Prefill default sender
  document.getElementById('wizCampaignName').value = '';
  document.getElementById('wizFromName').value = 'SendQueue Dispatcher';
  document.getElementById('wizFromEmail').value = 'dispatch@sendqueue.local';
  document.getElementById('wizReplyTo').value = '';
  document.getElementById('wizSubject').value = '';
  document.getElementById('wizHtml').value = '';

  renderWizardAudienceGroups();
  renderWizardTemplatesDropdown();

  updateWizardNav();
  openModal('campaignWizardModal');
}

function renderWizardAudienceGroups() {
  const container = document.getElementById('wizardGroupsContainer');
  if (!container) return;

  if (state.groups.length === 0) {
    container.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">No groups created yet. All contacts will be targeted.</span>';
    return;
  }

  container.innerHTML = state.groups.map(g => `
    <label style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 6px; cursor: pointer;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" name="wizGroupSelection" value="${g.id}">
        <span style="font-size: 0.85rem; color: #fff;">${escapeHtml(g.name)}</span>
      </div>
      <span class="badge-group">${g.contact_count} contacts</span>
    </label>
  `).join('');
}

function renderWizardTemplatesDropdown() {
  const select = document.getElementById('wizTemplateSelect');
  if (!select) return;

  select.innerHTML = '<option value="">(Custom Email Body / No Template)</option>' +
    state.templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');

  select.addEventListener('change', (e) => {
    const tpl = state.templates.find(item => item.id === e.target.value);
    if (tpl) {
      document.getElementById('wizSubject').value = tpl.subject;
      document.getElementById('wizHtml').value = tpl.body_html;
    }
  });
}

function setWizardStep(step) {
  // Validate current step before advancing
  if (step > state.wizardStep) {
    if (state.wizardStep === 1) {
      const name = document.getElementById('wizCampaignName').value.trim();
      if (!name) {
        alert('Please provide a Campaign Name.');
        return;
      }
    }
  }

  state.wizardStep = step;
  [1, 2, 3, 4].forEach(s => {
    const el = document.getElementById(`wizardStep${s}`);
    if (el) el.style.display = s === step ? 'block' : 'none';
  });

  if (step === 4) {
    buildLaunchSummary();
  }

  updateWizardNav();
}

function updateWizardNav() {
  const backBtn = document.getElementById('wizBackBtn');
  const nextBtn = document.getElementById('wizNextBtn');
  const launchBtn = document.getElementById('wizLaunchBtn');

  backBtn.style.display = state.wizardStep > 1 ? 'inline-flex' : 'none';
  nextBtn.style.display = state.wizardStep < 4 ? 'inline-flex' : 'none';
  launchBtn.style.display = state.wizardStep === 4 ? 'inline-flex' : 'none';

  // Update step indicators
  [1, 2, 3, 4].forEach(s => {
    const dot = document.getElementById(`wizIndicator${s}`);
    if (dot) {
      if (s === state.wizardStep) {
        dot.className = 'phase-badge badge-active';
      } else if (s < state.wizardStep) {
        dot.className = 'phase-badge badge-completed';
      } else {
        dot.className = 'phase-badge badge-pending';
      }
    }
  });
}

function buildLaunchSummary() {
  const name = document.getElementById('wizCampaignName').value.trim();
  const subject = document.getElementById('wizSubject').value.trim();
  const speed = document.getElementById('wizSpeedSlider').value;

  const selectedGroups = Array.from(document.querySelectorAll('input[name="wizGroupSelection"]:checked')).map(cb => cb.value);
  let audienceLabel = 'Entire Active Contact List';
  if (selectedGroups.length > 0) {
    const names = state.groups.filter(g => selectedGroups.includes(g.id)).map(g => g.name);
    audienceLabel = `Groups: ${names.join(', ')}`;
  }

  document.getElementById('summaryCampaignName').textContent = name;
  document.getElementById('summarySubject').textContent = subject || '(From selected template)';
  document.getElementById('summaryAudience').textContent = audienceLabel;
  document.getElementById('summarySpeed').textContent = `${speed} emails / second`;
}

async function launchCampaign() {
  const launchBtn = document.getElementById('wizLaunchBtn');
  launchBtn.disabled = true;
  launchBtn.textContent = 'Enqueuing & Launching...';

  const name = document.getElementById('wizCampaignName').value.trim();
  const from_name = document.getElementById('wizFromName').value.trim();
  const from_email = document.getElementById('wizFromEmail').value.trim();
  const reply_to = document.getElementById('wizReplyTo').value.trim();
  const template_id = document.getElementById('wizTemplateSelect').value || null;
  const subject = document.getElementById('wizSubject').value.trim();
  const body_html = document.getElementById('wizHtml').value.trim();
  const rate_limit_per_sec = parseInt(document.getElementById('wizSpeedSlider').value, 10) || 5;

  const group_ids = Array.from(document.querySelectorAll('input[name="wizGroupSelection"]:checked')).map(cb => cb.value);

  const payload = {
    name,
    from_name,
    from_email,
    reply_to,
    template_id,
    subject,
    body_html,
    rate_limit_per_sec,
    group_ids
  };

  try {
    const res = await API.createCampaign(payload);
    closeModal('campaignWizardModal');
    showToast(`Campaign "${name}" queued! ${res.campaign.total_recipients} recipients enrolled.`);
    await loadCampaigns();
  } catch (err) {
    alert('Failed to launch campaign: ' + err.message);
  } finally {
    launchBtn.disabled = false;
    launchBtn.textContent = '🚀 Launch Campaign Now';
  }
}

function setupCampaignEvents() {
  const slider = document.getElementById('wizSpeedSlider');
  const label = document.getElementById('wizSpeedLabel');
  if (slider && label) {
    slider.addEventListener('input', (e) => {
      label.textContent = `${e.target.value} emails / sec`;
    });
  }
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

document.addEventListener('DOMContentLoaded', initCampaignsPage);
