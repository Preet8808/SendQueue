// SendQueue Template Studio Controller

let state = {
  templates: [],
  contacts: [],
  activeTemplateId: null,
  activeTab: 'html', // 'html' or 'text'
  previewContactId: '',
  debounceTimer: null,
  viewportMode: 'desktop'
};

// Starter Presets for Quick Inspiration
const PRESETS = [
  {
    name: 'Announcement or Product Update',
    subject: 'Important update for {{company | "your team"}}, {{first_name}}!',
    body_html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6; background: #ffffff; padding: 30px; border-radius: 8px;">
  <h1 style="color: #4f46e5; font-size: 24px; margin-bottom: 16px;">Hello {{first_name | "there"}},</h1>
  <p>We are excited to share our latest updates built specifically for <strong>{{company | "your organization"}}</strong>.</p>
  <p>With fast and reliable delivery, you can send critical emails with complete confidence.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://example.com/start" style="background: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Get Started Free &rarr;</a>
  </div>
  <p style="font-size: 14px; color: #6b7280;">Best regards,<br>The Team</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
  <p style="font-size: 12px; color: #9ca3af; text-align: center;">You received this email because you subscribed. If you wish to unsubscribe, <a href="{{unsubscribe_url}}" style="color: #6b7280;">click here</a>.</p>
</div>`,
    body_text: `Hello {{first_name | "there"}},\n\nWe are excited to share our latest updates built for {{company | "your organization"}}.\n\nExplore now: https://example.com/start\n\nUnsubscribe: {{unsubscribe_url}}`
  },
  {
    name: 'Personal Follow-up',
    subject: 'Quick question regarding {{company | "your team"}}, {{first_name}}',
    body_html: `<div style="font-family: Georgia, serif; max-width: 580px; margin: 0 auto; color: #111827; line-height: 1.7; padding: 24px;">
  <p>Hi {{first_name | "there"}},</p>
  <p>I hope your week is going great at {{company | "your company"}}.</p>
  <p>I wanted to check in and see if you had 5 minutes this week for a brief chat?</p>
  <p>Looking forward to hearing from you.</p>
  <p>Warmly,<br><strong>Preet</strong></p>
  <p style="font-size: 11px; color: #9ca3af; margin-top: 40px;">To unsubscribe, click <a href="{{unsubscribe_url}}">here</a>.</p>
</div>`,
    body_text: `Hi {{first_name | "there"}},\n\nI hope your week is going great at {{company | "your company"}}.\n\nWanted to check in and see if you had 5 minutes this week to chat?\n\nWarmly,\nPreet\n\nUnsubscribe: {{unsubscribe_url}}`
  },
  {
    name: 'Special Discount or Promotion',
    subject: 'Special 20% off for {{company | "our valued partners"}}',
    body_html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111; line-height: 1.6; background: #fafafa; border: 1px solid #eaeaea; padding: 32px; border-radius: 12px;">
  <div style="background: #10b981; color: #fff; display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-bottom: 16px;">SPECIAL BENEFIT</div>
  <h2 style="font-size: 22px; margin-bottom: 12px;">Special 20% savings for {{first_name | "friend"}},</h2>
  <p>As a valued partner, we are offering a discount code for your entire team at <strong>{{company | "your company"}}</strong>.</p>
  <div style="background: #ffffff; border: 2px dashed #10b981; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
    <span style="font-size: 14px; color: #666;">YOUR COUPON CODE:</span>
    <div style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #10b981; margin-top: 4px;">SENDQUEUE-VIP</div>
  </div>
  <p style="font-size: 13px; color: #777;">Offer valid until the end of the month.</p>
  <p style="font-size: 11px; color: #aaa; margin-top: 30px;">Sent to {{email}}. <a href="{{unsubscribe_url}}" style="color: #888;">Unsubscribe</a></p>
</div>`,
    body_text: `Special 20% off for {{company | "our valued partners"}}!\n\nHello {{first_name | "friend"}},\n\nUse coupon code: SENDQUEUE-VIP\n\nSent to: {{email}}\nUnsubscribe: {{unsubscribe_url}}`
  }
];

// --- Initialization ---
async function initTemplatesPage() {
  await loadCurrentUser();
  await loadContactsForSwitcher();
  await loadTemplates();
  setupStudioEvents();
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

async function loadContactsForSwitcher() {
  try {
    const res = await API.getContacts({ limit: 50 });
    state.contacts = res.contacts || [];
    const select = document.getElementById('previewContactSelect');
    if (select) {
      select.innerHTML = '<option value="">(Default Sample: Alex Rivera, Acme Corp)</option>' + 
        state.contacts.map(c => {
          const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email;
          const comp = c.company ? ` - ${c.company}` : '';
          return `<option value="${c.id}">${escapeHtml(name)}${escapeHtml(comp)}</option>`;
        }).join('');
    }
  } catch (err) {
    console.error('Error loading contacts for preview:', err);
  }
}

async function loadTemplates() {
  const container = document.getElementById('templatesGrid');
  container.innerHTML = '<div style="color: var(--text-muted); padding: 40px; text-align: center;">Loading templates...</div>';

  try {
    const res = await API.getTemplates();
    state.templates = res.templates || [];
    renderTemplatesGrid();
  } catch (err) {
    container.innerHTML = `<div style="color: #f87171; padding: 20px;">Failed to load templates: ${err.message}</div>`;
  }
}

function renderTemplatesGrid() {
  const container = document.getElementById('templatesGrid');
  if (state.templates.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 80px 20px;">
        <div style="margin-bottom: 16px; color: var(--text-muted); opacity: 0.7;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
        </div>
        <h3 style="color: var(--text-primary); font-size: 1.2rem; margin-bottom: 6px;">No email templates found</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">Create your first template or start from an example.</p>
        <button class="btn btn-primary" onclick="openStudioModal()">+ Create Template</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.templates.map(t => {
    const tokenPills = (t.tokens || []).map(tok => `<span class="badge-group" style="font-size: 0.68rem;">{{${escapeHtml(tok)}}}</span>`).join(' ') || '<span style="font-size: 0.72rem; color: var(--text-muted);">No tags used</span>';

    return `
      <div class="metric-card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px;">
            <h3 style="color: var(--text-primary); font-size: 1.05rem; font-weight: 700;">${escapeHtml(t.name)}</h3>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${new Date(t.updated_at).toLocaleDateString()}</span>
          </div>
          <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 12px;">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Subject Line</div>
            <div style="font-size: 0.84rem; color: var(--teal-accent); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.subject)}</div>
          </div>
          <div style="margin-bottom: 16px;">
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 6px;">Personal Tags Used:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">${tokenPills}</div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 14px; margin-top: 10px;">
          <button class="btn btn-primary" style="flex: 1; padding: 6px 12px; font-size: 0.82rem; display: inline-flex; align-items: center; justify-content: center; gap: 6px;" onclick="openEditStudioModal('${t.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Edit Template
          </button>
          <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 0.82rem; display: inline-flex; align-items: center; justify-content: center;" onclick="cloneTemplate('${t.id}')" title="Duplicate template">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="13" x="9" y="9" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 0.82rem; color: #ef4444; display: inline-flex; align-items: center; justify-content: center;" onclick="deleteTemplate('${t.id}', '${escapeHtml(t.name)}')" title="Delete template">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// --- Studio Modal & Dual-Pane Editor ---
function openStudioModal(preset = null) {
  state.activeTemplateId = null;
  document.getElementById('studioModalTitle').textContent = 'Create New Email Template';
  document.getElementById('templateName').value = preset ? preset.name : 'Untitled Template';
  document.getElementById('templateSubject').value = preset ? preset.subject : 'Hello {{first_name | "there"}}, important update for {{company}}';
  document.getElementById('templateHtml').value = preset ? preset.body_html : `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">\n  <h2>Hi {{first_name | "there"}},</h2>\n  <p>We are reaching out to {{company | "your business"}} regarding...</p>\n  <p>Unsubscribe: <a href="{{unsubscribe_url}}">Click here</a></p>\n</div>`;
  document.getElementById('templateText').value = preset ? preset.body_text : `Hi {{first_name | "there"}},\n\nWe are reaching out to {{company | "your business"}} regarding...\n\nUnsubscribe: {{unsubscribe_url}}`;

  switchTab('html');
  openModal('studioModal');
  triggerLivePreview();
}

function openEditStudioModal(id) {
  const t = state.templates.find(item => item.id === id);
  if (!t) return;

  state.activeTemplateId = id;
  document.getElementById('studioModalTitle').textContent = `Edit Template — ${t.name}`;
  document.getElementById('templateName').value = t.name;
  document.getElementById('templateSubject').value = t.subject;
  document.getElementById('templateHtml').value = t.body_html;
  document.getElementById('templateText').value = t.body_text || '';

  switchTab('html');
  openModal('studioModal');
  triggerLivePreview();
}

function loadPreset(index) {
  const preset = PRESETS[index];
  if (!preset) return;
  if (confirm(`Load "${preset.name}" example into the editor? Any unsaved changes will be replaced.`)) {
    document.getElementById('templateName').value = preset.name;
    document.getElementById('templateSubject').value = preset.subject;
    document.getElementById('templateHtml').value = preset.body_html;
    document.getElementById('templateText').value = preset.body_text;
    triggerLivePreview();
  }
}

function switchTab(tab) {
  state.activeTab = tab;
  const tabHtmlBtn = document.getElementById('tabHtmlBtn');
  const tabTextBtn = document.getElementById('tabTextBtn');
  const htmlWrap = document.getElementById('htmlEditorWrap');
  const textWrap = document.getElementById('textEditorWrap');

  if (tab === 'html') {
    tabHtmlBtn.className = 'btn btn-primary';
    tabTextBtn.className = 'btn btn-secondary';
    htmlWrap.style.display = 'block';
    textWrap.style.display = 'none';
  } else {
    tabHtmlBtn.className = 'btn btn-secondary';
    tabTextBtn.className = 'btn btn-primary';
    htmlWrap.style.display = 'none';
    textWrap.style.display = 'block';
  }
}

function setViewport(mode) {
  state.viewportMode = mode;
  const desktopBtn = document.getElementById('btnViewportDesktop');
  const mobileBtn = document.getElementById('btnViewportMobile');
  const frameContainer = document.getElementById('previewFrameContainer');

  if (mode === 'desktop') {
    desktopBtn.className = 'btn btn-primary';
    mobileBtn.className = 'btn btn-secondary';
    frameContainer.style.maxWidth = '100%';
  } else {
    desktopBtn.className = 'btn btn-secondary';
    mobileBtn.className = 'btn btn-primary';
    frameContainer.style.maxWidth = '375px';
  }
}

// Live Preview Trigger (debounced)
function triggerLivePreview() {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(async () => {
    const subject = document.getElementById('templateSubject').value;
    const body_html = document.getElementById('templateHtml').value;
    const body_text = document.getElementById('templateText').value;
    const contactId = document.getElementById('previewContactSelect').value;

    try {
      const res = await API.previewTemplate({ subject, body_html, body_text, contactId });

      // Update Subject Bar
      document.getElementById('previewResolvedSubject').textContent = res.rendered.subject || '(No subject)';
      document.getElementById('previewRecipientLabel').textContent = `${res.contactUsed.name} (${res.contactUsed.email})`;

      // Update Iframe Preview
      const iframe = document.getElementById('previewIframe');
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(res.rendered.body_html || '<p style="color: #999; font-family: sans-serif; text-align: center; padding: 40px;">No HTML content to display</p>');
      doc.close();

      // Render Detected Tokens Chips
      const tokensBar = document.getElementById('detectedTokensBar');
      if (tokensBar) {
        tokensBar.innerHTML = (res.tokensFound || []).map(tok => `
          <span class="badge-group" style="font-size: 0.7rem;">{{${escapeHtml(tok)}}}</span>
        `).join(' ');
      }
    } catch (err) {
      console.error('Preview error:', err);
    }
  }, 250);
}

// Quick Insert Token at Cursor
function insertToken(token) {
  const targetTextarea = state.activeTab === 'html' ? document.getElementById('templateHtml') : document.getElementById('templateText');
  const activeElement = document.activeElement;

  const target = (activeElement && activeElement.id === 'templateSubject') ? activeElement : targetTextarea;

  const start = target.selectionStart || 0;
  const end = target.selectionEnd || 0;
  const text = target.value;

  target.value = text.substring(0, start) + token + text.substring(end);
  target.selectionStart = target.selectionEnd = start + token.length;
  target.focus();

  triggerLivePreview();
}

async function saveStudioTemplate() {
  const saveBtn = document.getElementById('saveTemplateBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  const name = document.getElementById('templateName').value.trim();
  const subject = document.getElementById('templateSubject').value.trim();
  const body_html = document.getElementById('templateHtml').value.trim();
  const body_text = document.getElementById('templateText').value.trim();

  if (!name || !subject || !body_html) {
    alert('Please fill out Template Name, Subject, and HTML body.');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Template';
    return;
  }

  const payload = { name, subject, body_html, body_text };

  try {
    if (state.activeTemplateId) {
      await API.updateTemplate(state.activeTemplateId, payload);
    } else {
      await API.createTemplate(payload);
    }

    closeModal('studioModal');
    showToast(state.activeTemplateId ? 'Template updated.' : 'Template created.');
    await loadTemplates();
  } catch (err) {
    alert('Failed to save template: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Template';
  }
}

async function cloneTemplate(id) {
  try {
    await API.cloneTemplate(id);
    showToast('Template cloned successfully.');
    await loadTemplates();
  } catch (err) {
    alert('Failed to clone template: ' + err.message);
  }
}

async function deleteTemplate(id, name) {
  if (!confirm(`Are you sure you want to delete template "${name}"?`)) return;

  try {
    await API.deleteTemplate(id);
    showToast('Template deleted.');
    await loadTemplates();
  } catch (err) {
    alert('Failed to delete template: ' + err.message);
  }
}

// --- Listeners & Event Setup ---
function setupStudioEvents() {
  ['templateSubject', 'templateHtml', 'templateText'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', triggerLivePreview);
  });

  const switcher = document.getElementById('previewContactSelect');
  if (switcher) switcher.addEventListener('change', triggerLivePreview);

  // Token chip buttons click
  document.querySelectorAll('.token-chip[data-token]').forEach(btn => {
    btn.addEventListener('click', () => {
      const token = btn.getAttribute('data-token');
      if (token) insertToken(token);
    });
  });

  // Tab indentation in textareas
  ['templateHtml', 'templateText'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = this.selectionStart;
          const end = this.selectionEnd;
          this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
          this.selectionStart = this.selectionEnd = start + 2;
          triggerLivePreview();
        }
      });
    }
  });
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
  toast.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>${escapeHtml(msg)}</span>`;
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

document.addEventListener('DOMContentLoaded', initTemplatesPage);
