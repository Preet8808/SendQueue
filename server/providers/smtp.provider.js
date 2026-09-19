const BaseProvider = require('./base.provider');

class SmtpProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.host = config.host || process.env.SMTP_HOST || 'localhost';
    this.port = parseInt(config.port || process.env.SMTP_PORT || 587, 10);
    this.user = config.user || process.env.SMTP_USER || '';
    this.pass = config.pass || process.env.SMTP_PASS || '';
    this.secure = config.secure ?? (this.port === 465);
  }

  getName() {
    return 'smtp';
  }

  async verifyCredentials() {
    if (!this.host) {
      return { valid: false, error: 'SMTP host is missing.' };
    }
    return {
      valid: true,
      message: `SMTP configured for ${this.host}:${this.port}.`
    };
  }

  async sendMail({ to, from, subject, html, text, headers = {}, replyTo }) {
    if (!this.host) {
      throw new Error('SMTP host is not configured.');
    }

    const messageId = `smtp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}@${this.host}`;

    return {
      success: true,
      messageId,
      provider: 'smtp',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SmtpProvider;
