const { db } = require('../database/db');
const MockProvider = require('./mock.provider');
const ResendProvider = require('./resend.provider');
const SendGridProvider = require('./sendgrid.provider');
const SesProvider = require('./ses.provider');
const SmtpProvider = require('./smtp.provider');

class ProviderManager {
  constructor() {
    this.mockInstance = new MockProvider();
  }

  // Get active provider key from database
  getActiveProviderName() {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'active_provider'").get();
    return row ? row.value : 'mock';
  }

  // Get saved provider credentials
  getStoredCredentials() {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'provider_credentials'").get();
    if (!row || !row.value) return {};
    try {
      return JSON.parse(row.value);
    } catch {
      return {};
    }
  }

  // Instantiate provider by name with given or stored credentials
  createProviderInstance(name, overrideCredentials = null) {
    const allCredentials = overrideCredentials || this.getStoredCredentials();
    const config = allCredentials[name] || {};

    switch (name.toLowerCase()) {
      case 'mock':
        return this.mockInstance;
      case 'resend':
        return new ResendProvider(config);
      case 'sendgrid':
        return new SendGridProvider(config);
      case 'ses':
        return new SesProvider(config);
      case 'smtp':
        return new SmtpProvider(config);
      default:
        return this.mockInstance;
    }
  }

  getActiveProvider() {
    const activeName = this.getActiveProviderName();
    return this.createProviderInstance(activeName);
  }

  getAvailableProviders() {
    return [
      { id: 'mock', name: 'Mock / Local Virtual Inbox', description: 'Zero external network calls, inspect all sent emails directly in the UI.' },
      { id: 'resend', name: 'Resend', description: 'Modern developer-first email infrastructure (requires API Key).' },
      { id: 'sendgrid', name: 'SendGrid', description: 'Industry standard enterprise transactional email.' },
      { id: 'ses', name: 'Amazon SES', description: 'High-throughput cost-effective cloud delivery.' },
      { id: 'smtp', name: 'Standard SMTP', description: 'Connect directly to your private mail server or Mailpit.' }
    ];
  }

  getDefaultSender() {
    const fromNameRow = db.prepare("SELECT value FROM system_settings WHERE key = 'default_from_name'").get();
    const fromEmailRow = db.prepare("SELECT value FROM system_settings WHERE key = 'default_from_email'").get();
    return {
      name: fromNameRow ? fromNameRow.value : 'SendQueue Dispatcher',
      email: fromEmailRow ? fromEmailRow.value : 'dispatch@sendqueue.local'
    };
  }

  getSettings() {
    const activeProvider = this.getActiveProviderName();
    const sender = this.getDefaultSender();
    const credentials = this.getStoredCredentials();

    // Mask secrets for display
    const maskedCredentials = {};
    for (const [key, conf] of Object.entries(credentials)) {
      maskedCredentials[key] = { ...conf };
      if (maskedCredentials[key].apiKey) {
        const k = maskedCredentials[key].apiKey;
        maskedCredentials[key].apiKey = k.length > 8 ? `${k.substring(0, 4)}...${k.substring(k.length - 4)}` : '••••••••';
      }
      if (maskedCredentials[key].secretAccessKey) {
        maskedCredentials[key].secretAccessKey = '••••••••';
      }
      if (maskedCredentials[key].pass) {
        maskedCredentials[key].pass = '••••••••';
      }
    }

    return {
      activeProvider,
      availableProviders: this.getAvailableProviders(),
      defaultSender: sender,
      credentials: maskedCredentials
    };
  }

  saveSettings({ active_provider, default_from_name, default_from_email, credentials }) {
    if (active_provider) {
      db.prepare(`
        INSERT INTO system_settings (key, value, updated_at) VALUES ('active_provider', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(active_provider);
    }

    if (default_from_name !== undefined) {
      db.prepare(`
        INSERT INTO system_settings (key, value, updated_at) VALUES ('default_from_name', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(default_from_name.trim());
    }

    if (default_from_email !== undefined) {
      db.prepare(`
        INSERT INTO system_settings (key, value, updated_at) VALUES ('default_from_email', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(default_from_email.trim());
    }

    if (credentials && typeof credentials === 'object') {
      const current = this.getStoredCredentials();
      const merged = { ...current };

      for (const [prov, conf] of Object.entries(credentials)) {
        merged[prov] = { ...(merged[prov] || {}), ...conf };
        // If password/key wasn't changed (re-submitted as bullets), preserve original
        if (conf.apiKey && conf.apiKey.includes('••••')) merged[prov].apiKey = current[prov]?.apiKey || '';
        if (conf.secretAccessKey && conf.secretAccessKey.includes('••••')) merged[prov].secretAccessKey = current[prov]?.secretAccessKey || '';
        if (conf.pass && conf.pass.includes('••••')) merged[prov].pass = current[prov]?.pass || '';
      }

      db.prepare(`
        INSERT INTO system_settings (key, value, updated_at) VALUES ('provider_credentials', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(JSON.stringify(merged));
    }

    return this.getSettings();
  }
}

module.exports = new ProviderManager();
