// SendQueue Contacts & CSV Import UI Controller

let state = {
  contacts: [],
  pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
  groups: [],
  search: '',
  groupId: '',
  status: '',
  editingContactId: null,
  
  // CSV Import State
  csvFileId: null,
  csvHeaders: [],
  csvMapping: {},
  csvStats: {}
};

// --- Initialization ---
async function initContactsPage() {
  await loadCurrentUser();
  await loadGroups();
  await loadContacts();
  setupEventListeners();
}

async function loadCurrentUser() {
  try {
    const res = await API.getMe();
    if (res && res.user) {
      document.getElementById('userName').textContent = res.user.name;
      document.getElementById('userRole').textContent = res.user.role;
      document.getElementById('avatarLetter').textContent = (res.user.name || 'A')[0].toUpperCase();
    }
  } catch (e) {
    window.location.href = '/login.html';
  }
}

// --- Groups Handling ---
async function loadGroups() {
  try {
    const res = await API.getGroups();
    state.groups = res.groups || [];
    renderGroupFilters();
    renderGroupModalList();
  } catch (err) {
    console.error('Error loading groups:', err);
  }
}

function renderGroupFilters() {
  const select = document.getElementById('groupFilter');
  if (!select) return;
  const current = state.groupId;
  select.innerHTML = '<option value="">All Groups</option>' + 
    state.groups.map(g => `<option value="${g.id}" ${g.id === current ? 'selected' : ''}>${escapeHtml(g.name)} (${g.contact_count})</option>`).join('');
}

function renderGroupModalList() {
  const container = document.getElementById('contactGroupCheckboxes');
  const importGroupSelect = document.getElementById('importTargetGroup');
  
  if (container) {
    container.innerHTML = state.groups.map(g => `
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; background: rgba(255,255,255,0.04); padding: 5px 10px; border-radius: var(--radius-sm); cursor: pointer; border: 1px solid var(--border-color);">
        <input type="checkbox" name="contactGroups" value="${g.id}">
        <span>${escapeHtml(g.name)}</span>
      </label>
    `).join('');
  }

  if (importGroupSelect) {
    importGroupSelect.innerHTML = '<option value="">(None - Import without group)</option>' + 
      state.groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  }
}

// --- Contacts Handling ---
async function loadContacts() {
  const tableBody = document.getElementById('contactsTableBody');
  tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Loading contacts...</td></tr>';

  try {
    const res = await API.getContacts({
      page: state.pagination.page,
      limit: state.pagination.limit,
      search: state.search,
      groupId: state.groupId,
      status: state.status
    });

    state.contacts = res.contacts || [];
    state.pagination = res.pagination;

    renderContactsTable();
    renderPagination();
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #f87171;">Failed to load contacts: ${err.message}</td></tr>`;
  }
}

function renderContactsTable() {
  const tableBody = document.getElementById('contactsTableBody');
  if (state.contacts.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 60px 20px;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">👥</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: #fff;">No contacts found</div>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px;">Try modifying your search or import contacts via CSV.</p>
        </td>
      </tr>`;
    return;
  }

  tableBody.innerHTML = state.contacts.map(c => {
    const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—';
    const initials = (c.first_name ? c.first_name[0] : (c.email ? c.email[0] : '?')).toUpperCase();

    const groupBadges = c.groups && c.groups.length > 0 
      ? c.groups.map(g => `<span class="badge-group">${escapeHtml(g.name)}</span>`).join(' ')
      : '<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>';

    const statusBadge = c.status === 'active' 
      ? '<span class="status-pill" style="font-size: 0.7rem; padding: 2px 8px;"><span class="pulse-dot" style="width: 6px; height: 6px;"></span> Active</span>'
      : `<span class="status-pill" style="background: rgba(239, 68, 68, 0.15); border-color: rgba(239,68,68,0.3); color: #fca5a5; font-size: 0.7rem; padding: 2px 8px;">${c.status}</span>`;

    return `
      <tr>
        <td style="width: 40px;"><input type="checkbox" class="contact-select" value="${c.id}"></td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="user-avatar" style="width: 28px; height: 28px; font-size: 11px; background: #312e81; color: #c7d2fe;">${initials}</div>
            <strong style="font-size: 0.88rem; color: #fff;">${escapeHtml(fullName)}</strong>
          </div>
        </td>
        <td>
          <span style="font-family: monospace; font-size: 0.82rem; color: #93c5fd;">${escapeHtml(c.email)}</span>
        </td>
        <td>
          <span style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(c.company || '—')}</span>
        </td>
        <td>${groupBadges}</td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="openEditContactModal('${c.id}')">✏️ Edit</button>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: #fca5a5;" onclick="deleteContactPrompt('${c.id}', '${escapeHtml(c.email)}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPagination() {
  const p = state.pagination;
  const el = document.getElementById('paginationInfo');
  if (el) {
    const start = p.total === 0 ? 0 : (p.page - 1) * p.limit + 1;
    const end = Math.min(p.total, p.page * p.limit);
    el.textContent = `Showing ${start} to ${end} of ${p.total} contacts`;
  }

  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  if (prevBtn) prevBtn.disabled = p.page <= 1;
  if (nextBtn) nextBtn.disabled = p.page >= p.totalPages || p.totalPages === 0;
}

// --- Modals & Contact CRUD ---
function openAddContactModal() {
  state.editingContactId = null;
  document.getElementById('contactModalTitle').textContent = 'Add New Contact';
  document.getElementById('contactForm').reset();
  document.getElementById('contactModalAlert').style.display = 'none';

  // Uncheck all group checkboxes
  document.querySelectorAll('input[name="contactGroups"]').forEach(cb => cb.checked = false);

  openModal('contactModal');
}

function openEditContactModal(id) {
  const contact = state.contacts.find(c => c.id === id);
  if (!contact) return;

  state.editingContactId = id;
  document.getElementById('contactModalTitle').textContent = 'Edit Contact';
  document.getElementById('contactModalAlert').style.display = 'none';

  document.getElementById('contactEmail').value = contact.email;
  document.getElementById('contactFirstName').value = contact.first_name || '';
  document.getElementById('contactLastName').value = contact.last_name || '';
  document.getElementById('contactCompany').value = contact.company || '';
  document.getElementById('contactCategory').value = contact.category || '';
  document.getElementById('contactStatus').value = contact.status || 'active';

  const groupIds = new Set((contact.groups || []).map(g => g.id));
  document.querySelectorAll('input[name="contactGroups"]').forEach(cb => {
    cb.checked = groupIds.has(cb.value);
  });

  openModal('contactModal');
}

async function saveContact(e) {
  e.preventDefault();
  const alertEl = document.getElementById('contactModalAlert');
  alertEl.style.display = 'none';

  const email = document.getElementById('contactEmail').value.trim();
  const first_name = document.getElementById('contactFirstName').value.trim();
  const last_name = document.getElementById('contactLastName').value.trim();
  const company = document.getElementById('contactCompany').value.trim();
  const category = document.getElementById('contactCategory').value.trim();
  const status = document.getElementById('contactStatus').value;

  const group_ids = Array.from(document.querySelectorAll('input[name="contactGroups"]:checked')).map(cb => cb.value);

  const payload = { email, first_name, last_name, company, category, status, group_ids };

  try {
    if (state.editingContactId) {
      await API.updateContact(state.editingContactId, payload);
    } else {
      await API.createContact(payload);
    }
    closeModal('contactModal');
    showToast(state.editingContactId ? 'Contact updated successfully.' : 'Contact created successfully.');
    await loadContacts();
    await loadGroups(); // Refresh member counts
  } catch (err) {
    alertEl.className = 'alert-box alert-danger show';
    alertEl.textContent = err.message || 'Failed to save contact.';
  }
}

async function deleteContactPrompt(id, email) {
  if (!confirm(`Are you sure you want to delete contact "${email}"? This action cannot be undone.`)) {
    return;
  }

  try {
    await API.deleteContact(id);
    showToast('Contact deleted.');
    await loadContacts();
    await loadGroups();
  } catch (err) {
    alert('Failed to delete contact: ' + err.message);
  }
}

// --- Smart CSV Importer Wizard ---
function openImportModal() {
  document.getElementById('importStep1').style.display = 'block';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'none';
  document.getElementById('csvFileInput').value = '';
  document.getElementById('importAlert').style.display = 'none';
  openModal('importModal');
}

async function handleFileSelect(file) {
  if (!file) return;
  const alertEl = document.getElementById('importAlert');
  alertEl.style.display = 'none';

  const uploadBtn = document.getElementById('dropzoneText');
  uploadBtn.textContent = `Analyzing ${file.name}...`;

  try {
    const preview = await API.previewCsv(file);
    state.csvFileId = preview.fileId;
    state.csvHeaders = preview.headers;
    state.csvMapping = preview.mapping;
    state.csvStats = preview.stats;

    showImportMappingStep(preview);
  } catch (err) {
    uploadBtn.textContent = 'Drag & drop your CSV file here, or click to browse';
    alertEl.className = 'alert-box alert-danger show';
    alertEl.textContent = err.message || 'Failed to process CSV file.';
  }
}

function showImportMappingStep(preview) {
  document.getElementById('importStep1').style.display = 'none';
  document.getElementById('importStep2').style.display = 'block';

  // Populate mapping selectors
  const fields = [
    { key: 'email', label: 'Email Address *', required: true },
    { key: 'first_name', label: 'First Name', required: false },
    { key: 'last_name', label: 'Last Name', required: false },
    { key: 'company', label: 'Company Name', required: false },
    { key: 'category', label: 'Category / Tier', required: false }
  ];

  const container = document.getElementById('mappingFieldsContainer');
  container.innerHTML = fields.map(f => {
    const currentMapped = preview.mapping[f.key] || '';
    const optionsHtml = '<option value="">(Ignore this field)</option>' + 
      preview.headers.map(h => `<option value="${escapeHtml(h)}" ${h === currentMapped ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
        <span style="font-size: 0.85rem; font-weight: 500; color: #fff;">${f.label}</span>
        <select class="form-control" style="max-width: 240px; padding: 6px 12px;" id="map_${f.key}">
          ${optionsHtml}
        </select>
      </div>
    `;
  }).join('');

  // Stats summary banner
  const s = preview.stats;
  document.getElementById('importStatsBanner').innerHTML = `
    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
      <span>Total Rows: <strong>${s.total}</strong></span>
      <span style="color: #34d399;">Valid to Import: <strong>${s.validCount}</strong></span>
      <span style="color: #fca5a5;">Duplicates: <strong>${s.duplicateCount}</strong></span>
      <span style="color: #f87171;">Invalid Syntax: <strong>${s.invalidCount}</strong></span>
    </div>
  `;
}

async function commitImport() {
  const commitBtn = document.getElementById('commitImportBtn');
  commitBtn.disabled = true;
  commitBtn.textContent = 'Importing contacts...';

  const mapping = {
    email: document.getElementById('map_email').value,
    first_name: document.getElementById('map_first_name').value,
    last_name: document.getElementById('map_last_name').value,
    company: document.getElementById('map_company').value,
    category: document.getElementById('map_category').value
  };

  if (!mapping.email) {
    alert('Please select an Email column mapping.');
    commitBtn.disabled = false;
    commitBtn.textContent = 'Confirm & Import Contacts';
    return;
  }

  const targetGroupId = document.getElementById('importTargetGroup').value || null;

  try {
    const res = await API.commitCsvImport({
      fileId: state.csvFileId,
      mapping,
      targetGroupId
    });

    closeModal('importModal');
    showToast(res.message || 'Import complete!');
    await loadContacts();
    await loadGroups();
  } catch (err) {
    alert('Import failed: ' + err.message);
  } finally {
    commitBtn.disabled = false;
    commitBtn.textContent = 'Confirm & Import Contacts';
  }
}

// --- Group Manager Modal ---
function openGroupManagerModal() {
  renderGroupManagerRows();
  document.getElementById('newGroupName').value = '';
  document.getElementById('newGroupDesc').value = '';
  openModal('groupManagerModal');
}

function renderGroupManagerRows() {
  const list = document.getElementById('groupManagerList');
  if (state.groups.length === 0) {
    list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 12px;">No groups created yet.</div>';
    return;
  }

  list.innerHTML = state.groups.map(g => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 8px;">
      <div>
        <strong style="color: #fff; font-size: 0.9rem;">${escapeHtml(g.name)}</strong>
        <span class="badge-group" style="margin-left: 8px;">${g.contact_count} contacts</span>
        ${g.description ? `<p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(g.description)}</p>` : ''}
      </div>
      <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: #fca5a5;" onclick="deleteGroupPrompt('${g.id}', '${escapeHtml(g.name)}')">Delete</button>
    </div>
  `).join('');
}

async function createNewGroup(e) {
  e.preventDefault();
  const name = document.getElementById('newGroupName').value.trim();
  const description = document.getElementById('newGroupDesc').value.trim();

  if (!name) return;

  try {
    await API.createGroup({ name, description });
    document.getElementById('newGroupName').value = '';
    document.getElementById('newGroupDesc').value = '';
    await loadGroups();
    renderGroupManagerRows();
    showToast(`Group "${name}" created.`);
  } catch (err) {
    alert('Failed to create group: ' + err.message);
  }
}

async function deleteGroupPrompt(id, name) {
  if (!confirm(`Are you sure you want to delete group "${name}"? Contacts in this group will not be deleted.`)) return;

  try {
    await API.deleteGroup(id);
    await loadGroups();
    renderGroupManagerRows();
    showToast(`Group "${name}" deleted.`);
    await loadContacts();
  } catch (err) {
    alert('Failed to delete group: ' + err.message);
  }
}

// --- Utilities & Listeners ---
function setupEventListeners() {
  // Search with debounce
  let debounceTimer;
  const searchInput = document.getElementById('contactSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.search = e.target.value;
        state.pagination.page = 1;
        loadContacts();
      }, 300);
    });
  }

  // Filter by group
  const groupFilter = document.getElementById('groupFilter');
  if (groupFilter) {
    groupFilter.addEventListener('change', (e) => {
      state.groupId = e.target.value;
      state.pagination.page = 1;
      loadContacts();
    });
  }

  // Pagination
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (state.pagination.page > 1) {
        state.pagination.page--;
        loadContacts();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (state.pagination.page < state.pagination.totalPages) {
        state.pagination.page++;
        loadContacts();
      }
    });
  }

  // Form submits
  const contactForm = document.getElementById('contactForm');
  if (contactForm) contactForm.addEventListener('submit', saveContact);

  const groupForm = document.getElementById('createGroupForm');
  if (groupForm) groupForm.addEventListener('submit', createNewGroup);

  // CSV Drag and drop
  const dropzone = document.getElementById('csvDropzone');
  const fileInput = document.getElementById('csvFileInput');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--primary)';
        dropzone.style.background = 'rgba(99, 102, 241, 0.08)';
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border-color)';
        dropzone.style.background = 'rgba(0, 0, 0, 0.2)';
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files.length) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
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

document.addEventListener('DOMContentLoaded', initContactsPage);
