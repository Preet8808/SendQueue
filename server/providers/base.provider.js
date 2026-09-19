/**
 * Base abstract class for all SendQueue email provider adapters.
 * Guarantees a uniform interface so the queue engine never needs to know
 * the underlying delivery implementation.
 */
class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  getName() {
    throw new Error('getName() must be implemented by provider subclass');
  }

  /**
   * Dispatches a single email message.
   * @param {Object} options
   * @param {string} options.to - Recipient email address
   * @param {string} options.from - Sender email address (e.g. "Name <sender@domain.com>")
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} [options.text] - Plain-text fallback content
   * @param {string} [options.replyTo] - Optional reply-to address
   * @param {Object} [options.headers] - Custom RFC headers (e.g. List-Unsubscribe)
   * @returns {Promise<{ success: boolean, messageId: string, provider: string, raw?: any }>}
   */
  async sendMail(options) {
    throw new Error('sendMail() must be implemented by provider subclass');
  }

  /**
   * Verifies that the provider configuration / API credentials are valid.
   * @returns {Promise<{ valid: boolean, message?: string, error?: string }>}
   */
  async verifyCredentials() {
    throw new Error('verifyCredentials() must be implemented by provider subclass');
  }
}

module.exports = BaseProvider;
