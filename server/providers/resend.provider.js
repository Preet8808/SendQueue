const BaseProvider = require('./base.provider');

class ResendProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.RESEND_API_KEY || '';
  }

  getName() {
    return 'resend';
  }

  async verifyCredentials() {
    if (!this.apiKey) {
      return { valid: false, error: 'Resend API Key is missing.' };
    }

    try {
      const response = await fetch('https://api.resend.com/api-keys', {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      if (response.ok) {
        return { valid: true, message: 'Resend API credentials verified successfully.' };
      } else {
        const data = await response.json().catch(() => ({}));
        return { valid: false, error: data.message || `Resend validation failed with status ${response.status}` };
      }
    } catch (err) {
      return { valid: false, error: `Connection to Resend failed: ${err.message}` };
    }
  }

  async sendMail({ to, from, subject, html, text, headers = {}, replyTo }) {
    if (!this.apiKey) {
      throw new Error('Resend API key is not configured.');
    }

    const payload = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || undefined,
      reply_to: replyTo || undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Resend error (${response.status}): ${JSON.stringify(data)}`);
    }

    return {
      success: true,
      messageId: data.id,
      provider: 'resend',
      timestamp: new Date().toISOString(),
      raw: data
    };
  }
}

module.exports = ResendProvider;
