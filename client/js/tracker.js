// SendQueue Live Campaign Telemetry & Tracker

let state = {
  campaignId: null,
  campaign: null,
  eventSource: null,
  recipients: [],
  knownEventIds: new Set()
};

document.addEventListener('DOMContentLoaded', async () => {
  const user = API.getUser();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  // Populate avatar & name
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  const avatarEl = document.getElementById('avatarLetter');
  if (nameEl) nameEl.textContent = user.name || 'User';
  if (roleEl) {
    const role = user.role || 'member';
    roleEl.textContent = role === 'admin' ? 'Administrator' : 'Member';
  }
  if (avatarEl) avatarEl.textContent = (user.name || 'U')[0].toUpperCase();

  // Extract campaign ID
  const urlParams = new URLSearchParams(window.location.search);
  state.campaignId = urlParams.get('id');

  if (!state.campaignId) {
    alert('No campaign ID specified in URL.');
    window.location.href = '/campaigns.html';
    return;
  }

  await loadInitialCampaign();
  await loadRecipients();
  startEventStream();
});

// Load initial campaign details
async function loadInitialCampaign() {
  try {
    const res = await API.getCampaign(state.campaignId);
    state.campaign = res.campaign;
    renderCampaignHeader(state.campaign);
    renderMetrics(state.campaign);
  } catch (err) {
    showToast('Failed to load campaign: ' + err.message, 'error');
  }
}

// Start Server-Sent Events (SSE) Stream
function startEventStream() {
  if (state.eventSource) {
    state.eventSource.close();
  }

  const streamUrl = API.getCampaignStreamUrl(state.campaignId);
  const eventSource = new EventSource(streamUrl);
  state.eventSource = eventSource;

  const pill = document.getElementById('liveConnectionPill');
  const statusText = document.getElementById('liveStatusText');

  eventSource.onopen = () => {
    if (pill) {
      pill.style.borderColor = 'rgba(52, 211, 153, 0.4)';
      pill.style.color = '#34d399';
    }
    if (statusText) statusText.textContent = 'Live Updates Connected';
  };

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.campaign) {
        state.campaign = data.campaign;
        renderCampaignHeader(data.campaign);
        renderMetrics(data.campaign);
      }
      if (Array.isArray(data.recentEvents)) {
        renderEventFeed(data.recentEvents);
      }
    } catch (err) {
      console.error('Error parsing SSE stream message:', err);
    }
  };

  eventSource.onerror = (err) => {
    if (pill) {
      pill.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      pill.style.color = '#f87171';
    }
    if (statusText) statusText.textContent = 'Reconnecting...';
  };
}

// Render campaign details in header and banner
function renderCampaignHeader(c) {
  if (!c) return;

  const pageTitle = document.getElementById('pageCampaignName');
  const subjectEl = document.getElementById('campaignSubject');
  const senderEl = document.getElementById('campaignSender');
  const templateEl = document.getElementById('campaignTemplate');
  const rateEl = document.getElementById('campaignRate');
  const createdEl = document.getElementById('campaignCreated');
  const statusPill = document.getElementById('campaignStatusPill');

  if (pageTitle) pageTitle.textContent = `${c.name} — Live Progress`;
  if (subjectEl) subjectEl.textContent = c.subject;
  if (senderEl) senderEl.textContent = `${c.from_name} <${c.from_email}>`;
  if (templateEl) templateEl.textContent = c.template_name || '(Custom Message)';
  if (rateEl) rateEl.textContent = `${c.rate_limit_per_sec || 5} emails / sec`;
  if (createdEl) createdEl.textContent = new Date(c.created_at).toLocaleString();

  if (statusPill) {
    statusPill.textContent = c.status;
    let color = '#9ca3af';
    if (c.status === 'SENDING') color = '#38bdf8';
    if (c.status === 'COMPLETED') color = '#34d399';
    if (c.status === 'PAUSED') color = '#f59e0b';
    if (c.status === 'FAILED') color = '#f87171';
    statusPill.style.borderColor = color;
    statusPill.style.color = color;
  }

  // Update controls
  renderControls(c);
}

// Render dynamic action buttons (Pause / Resume / Cancel)
function renderControls(c) {
  const container = document.getElementById('campaignControls');
  if (!container) return;

  let html = '';
  if (c.status === 'SENDING' || c.status === 'QUEUED') {
    html += `<button class="btn btn-secondary" onclick="pauseCurrent()" style="font-size: 0.8rem; color: #fbbf24;">⏸ Pause</button>`;
    html += `<button class="btn btn-secondary" onclick="cancelCurrent()" style="font-size: 0.8rem; color: #f87171;">⏹ Cancel</button>`;
  } else if (c.status === 'PAUSED') {
    html += `<button class="btn btn-primary" onclick="resumeCurrent()" style="font-size: 0.8rem;">▶ Resume</button>`;
    html += `<button class="btn btn-secondary" onclick="cancelCurrent()" style="font-size: 0.8rem; color: #f87171;">⏹ Cancel</button>`;
  } else if (c.status === 'COMPLETED') {
    html += `<span style="font-size: 0.8rem; color: var(--success); display: flex; align-items: center; gap: 4px;">✓ All Emails Sent</span>`;
  }

  container.innerHTML = html;
}

// Render 6 Metric Cards & Progress Bar
function renderMetrics(c) {
  if (!c) return;

  const total = c.total_recipients || 0;
  const sent = c.sent_count || 0;
  const delivered = c.delivered_count || 0;
  const bounced = c.bounced_count || 0;
  const unsubscribed = c.unsubscribed_count || 0;
  const complained = c.complained_count || 0;
  const pending = c.pending_count || 0;
  const percent = c.progressPercent || 0;

  setText('metricTotal', total);
  setText('metricSent', sent);
  setText('metricDelivered', delivered);
  setText('metricDeliveryRate', `${c.deliveryRate || 0}%`);
  setText('metricBounced', bounced);
  setText('metricBounceRate', `${c.bounceRate || 0}%`);
  setText('metricUnsub', unsubscribed);
  setText('metricComplaints', `${complained} reports`);
  setText('metricPending', pending);

  // Progress Bar
  setText('progressPercentText', `${percent}%`);
  const fill = document.getElementById('progressBarFill');
  if (fill) {
    fill.style.width = `${percent}%`;
    if (percent === 100) {
      fill.style.background = 'var(--success)';
    }
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Render Live Stream Activity Feed
function renderEventFeed(events) {
  const container = document.getElementById('liveStreamFeed');
  if (!container) return;

  if (!events || events.length === 0) {
    return;
  }

  container.innerHTML = events.map(evt => {
    const time = new Date(evt.created_at).toLocaleTimeString();
    const eventType = evt.event_type || 'INFO';
    const payload = evt.raw_payload || {};
    const detail = payload.reason || payload.messageId || payload.email || '';

    return `
      <div class="stream-item">
        <span style="color: var(--text-muted);">${time}</span>
        <span class="badge-event badge-${eventType}">${eventType}</span>
        <span style="color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(payload.email || detail || 'Event logged')}
        </span>
        ${payload.simulated ? '<span style="font-size: 0.65rem; color: #a855f7; border: 1px solid rgba(168,85,247,0.3); padding: 1px 4px; border-radius: 3px;">SIM</span>' : ''}
      </div>
    `;
  }).join('');
}

// Load Paginated Recipient Queue
async function loadRecipients() {
  const tableBody = document.getElementById('recipientsTableBody');
  const statusFilter = document.getElementById('recipientStatusFilter')?.value || '';

  try {
    const res = await API.getCampaignRecipients(state.campaignId, { status: statusFilter, limit: 100 });
    state.recipients = res.recipients || [];

    if (state.recipients.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted);">No contacts found with this status.</td></tr>';
      return;
    }

    tableBody.innerHTML = state.recipients.map(r => {
      let statusColor = '#9ca3af';
      if (r.status === 'DELIVERED') statusColor = '#34d399';
      else if (r.status === 'SENT') statusColor = '#38bdf8';
      else if (r.status === 'SENDING') statusColor = '#a855f7';
      else if (r.status === 'BOUNCED') statusColor = '#f87171';
      else if (r.status === 'UNSUBSCRIBED') statusColor = '#c084fc';
      else if (r.status === 'COMPLAINED') statusColor = '#fbbf24';
      else if (r.status === 'FAILED') statusColor = '#f87171';
      else if (r.status === 'RETRY') statusColor = '#f59e0b';

      const activityText = r.error_message || (r.delivered_at ? `Delivered at ${new Date(r.delivered_at).toLocaleTimeString()}` : (r.sent_at ? `Sent at ${new Date(r.sent_at).toLocaleTimeString()}` : 'Waiting to send'));

      return `
        <tr>
          <td>
            <a href="javascript:void(0)" onclick="selectRecipientForSim('${escapeHtml(r.recipient_email)}')" style="color: var(--text-primary); font-weight: 600; text-decoration: none;" title="Click to test webhook simulation">
              ${escapeHtml(r.recipient_email)}
            </a>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(r.company || '')}</div>
          </td>
          <td>
            <span class="status-pill" style="font-size: 0.68rem; padding: 2px 8px; color: ${statusColor}; border-color: ${statusColor};">
              ${r.status}
            </span>
          </td>
          <td><span style="color: var(--text-muted);">${r.attempt_count} / ${r.max_attempts}</span></td>
          <td><span style="color: ${r.error_message ? '#f87171' : 'var(--text-secondary)'}; font-size: 0.75rem;">${escapeHtml(activityText)}</span></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="4" style="color: #f87171; padding: 16px;">Failed to load recipients: ${err.message}</td></tr>`;
  }
}

// Controls
async function pauseCurrent() {
  try {
    await API.pauseCampaign(state.campaignId);
    showToast('Campaign paused.');
  } catch (err) {
    alert(err.message);
  }
}

async function resumeCurrent() {
  try {
    await API.resumeCampaign(state.campaignId);
    showToast('Campaign resumed.');
  } catch (err) {
    alert(err.message);
  }
}

async function cancelCurrent() {
  if (!confirm('Are you sure you want to cancel the remaining unsent emails in this queue?')) return;
  try {
    await API.cancelCampaign(state.campaignId);
    showToast('Campaign cancelled.');
  } catch (err) {
    alert(err.message);
  }
}

// Webhook Simulation Modal
function openSimulateModal() {
  const modal = document.getElementById('simulateModal');
  if (modal) modal.classList.add('active');

  // Pre-fill with first recipient if empty
  const emailInput = document.getElementById('simEmail');
  if (emailInput && !emailInput.value && state.recipients.length > 0) {
    emailInput.value = state.recipients[0].recipient_email;
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function selectRecipientForSim(email) {
  document.getElementById('simEmail').value = email;
  openSimulateModal();
}

async function submitSimulation() {
  const eventType = document.getElementById('simEventType').value;
  const email = document.getElementById('simEmail').value.trim();
  const reason = document.getElementById('simReason').value.trim();

  if (!email) {
    alert('Please enter or select a recipient email.');
    return;
  }

  try {
    await API.simulateWebhookEvent({
      event_type: eventType,
      campaign_id: state.campaignId,
      email,
      reason: reason || undefined
    });

    closeModal('simulateModal');
    showToast(`Simulated ${eventType} event successfully!`);
    await loadRecipients();
  } catch (err) {
    alert('Simulation error: ' + err.message);
  }
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.borderColor = type === 'error' ? 'var(--danger)' : 'var(--primary)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
