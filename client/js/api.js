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

  async getStats() {
    return this.request('/api/stats');
  }
};

window.API = API;
