const BaseProvider = require('./base.provider');

class SendGridProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.SENDGRID_API_KEY || '';
  }

  getName() {
    return 'sendgrid';
  }

  async verifyCredentials() {
    if (!this.apiKey) {
      return { valid: false, error: 'SendGrid API Key is missing.' };
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/scopes', {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      if (response.ok) {
        return { valid: true, message: 'SendGrid API credentials verified successfully.' };
      } else {
        return { valid: false, error: `SendGrid validation failed with HTTP status ${response.status}` };
      }
    } catch (err) {
      return { valid: false, error: `Connection to SendGrid failed: ${err.message}` };
    }
  }

  async sendMail({ to, from, subject, html, text, headers = {}, replyTo }) {
    if (!this.apiKey) {
      throw new Error('SendGrid API key is not configured.');
    }

    // Parse "Sender Name <sender@domain.com>" or "sender@domain.com"
    let fromEmail = from;
    let fromName = '';
    const fromMatch = from.match(/^(.*)<(.*)>$/);
    if (fromMatch) {
      fromName = fromMatch[1].trim();
      fromEmail = fromMatch[2].trim();
    }

    const content = [];
    if (text) content.push({ type: 'text/plain', value: text });
    if (html) content.push({ type: 'text/html', value: html });

    const payload = {
      personalizations: [
        {
          to: [{ email: to }]
        }
      ],
      from: {
        email: fromEmail,
        name: fromName || undefined
      },
      subject,
      content,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      reply_to: replyTo ? { email: replyTo } : undefined
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200 && response.status !== 202) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`SendGrid error (${response.status}): ${JSON.stringify(data)}`);
    }

    const messageId = response.headers.get('x-message-id') || `sg_${Date.now()}`;

    return {
      success: true,
      messageId,
      provider: 'sendgrid',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SendGridProvider;
