// SendQueue Central API Client

const API = {
  token: localStorage.getItem('sendqueue_token') || '',

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('sendqueue_token', token);
    } else {
      localStorage.removeItem('sendqueue_token');
    }
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401 && !endpoint.includes('/login')) {
        // Token expired or invalid
        this.setToken('');
        if (!window.location.pathname.endsWith('login.html')) {
          window.location.href = '/login.html';
        }
      }

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Auth endpoints
  async login(email, password) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.setToken('');
      window.location.href = '/login.html';
    }
  },

  async getMe() {
    return this.request('/api/auth/me');
  },

  // System endpoints
  async getHealth() {
    return this.request('/api/health');
  },

  // Contact endpoints
  async getContacts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/contacts${query ? '?' + query : ''}`);
  },

  async getContact(id) {
    return this.request(`/api/contacts/${id}`);
  },

  async createContact(data) {
    return this.request('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateContact(id, data) {
    return this.request(`/api/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteContact(id) {
    return this.request(`/api/contacts/${id}`, {
      method: 'DELETE'
    });
  },

  // CSV Import endpoints
  async previewCsv(file) {
    const formData = new FormData();
    formData.append('file', file);

    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch('/api/contacts/import-preview', {
      method: 'POST',
      headers,
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to parse CSV file.');
    }
    return data;
  },

  async commitCsvImport({ fileId, mapping, targetGroupId }) {
    return this.request('/api/contacts/import-commit', {
      method: 'POST',
      body: JSON.stringify({ fileId, mapping, targetGroupId })
    });
  },

  // Group endpoints
  async getGroups() {
    return this.request('/api/groups');
  },

  async createGroup(data) {
    return this.request('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateGroup(id, data) {
    return this.request(`/api/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteGroup(id) {
    return this.request(`/api/groups/${id}`, {
      method: 'DELETE'
    });
  },

  // Template endpoints
  async getTemplates() {
    return this.request('/api/templates');
  },

  async getTemplate(id) {
    return this.request(`/api/templates/${id}`);
  },

  async createTemplate(data) {
    return this.request('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateTemplate(id, data) {
    return this.request(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteTemplate(id) {
    return this.request(`/api/templates/${id}`, {
      method: 'DELETE'
    });
  },

  async cloneTemplate(id) {
    return this.request(`/api/templates/${id}/clone`, {
      method: 'POST'
    });
  },

  async previewTemplate(data) {
    return this.request('/api/templates/preview', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Settings & Provider endpoints
  async getProviderSettings() {
    return this.request('/api/settings/providers');
  },

  async saveProviderSettings(data) {
    return this.request('/api/settings/providers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async verifyProvider(data) {
    return this.request('/api/settings/providers/verify', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async sendTestEmail(data) {
    return this.request('/api/settings/test-send', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getMockInbox(limit = 50) {
    return this.request(`/api/settings/mock-inbox?limit=${limit}`);
  },

  async clearMockInbox() {
    return this.request('/api/settings/mock-inbox', {
      method: 'DELETE'
    });
  },

  // Campaign endpoints
  async getCampaigns(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/campaigns${query ? '?' + query : ''}`);
  },

  async getCampaign(id) {
    return this.request(`/api/campaigns/${id}`);
  },

  async createCampaign(data) {
    return this.request('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async pauseCampaign(id) {
    return this.request(`/api/campaigns/${id}/pause`, {
      method: 'POST'
    });
  },

  async resumeCampaign(id) {
    return this.request(`/api/campaigns/${id}/resume`, {
      method: 'POST'
    });
  },

  async cancelCampaign(id) {
    return this.request(`/api/campaigns/${id}/cancel`, {
      method: 'POST'
    });
  },

  async getCampaignRecipients(id, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/campaigns/${id}/recipients${query ? '?' + query : ''}`);
  }
};

window.API = API;
