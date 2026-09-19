const express = require('express');
const router = express.Router();
const ProviderManager = require('../providers/provider.manager');
const TemplateService = require('../services/template.service');
const ContactService = require('../services/contact.service');
const { authenticateToken } = require('../middleware/auth.middleware');

router.use(authenticateToken);

// GET /api/settings/providers
router.get('/providers', (req, res) => {
  try {
    const settings = ProviderManager.getSettings();
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve provider settings.' });
  }
});

// POST /api/settings/providers
router.post('/providers', (req, res) => {
  try {
    const updated = ProviderManager.saveSettings(req.body);
    return res.json({ message: 'Settings saved successfully', settings: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/settings/providers/verify
router.post('/providers/verify', async (req, res) => {
  const { providerName, credentials } = req.body;
  const name = providerName || ProviderManager.getActiveProviderName();

  try {
    const providerInstance = ProviderManager.createProviderInstance(name, credentials ? { [name]: credentials } : null);
    const result = await providerInstance.verifyCredentials();
    return res.json({ provider: name, ...result });
  } catch (err) {
    return res.status(400).json({ provider: name, valid: false, error: err.message });
  }
});

// POST /api/settings/test-send
router.post('/test-send', async (req, res) => {
  const { to, templateId, customSubject, customHtml, customText, fromName, fromEmail } = req.body;

  if (!to || !ContactService.isValidEmail(to)) {
    return res.status(400).json({ error: 'A valid destination email address is required.' });
  }

  try {
    const activeProvider = ProviderManager.getActiveProvider();
    const defaultSender = ProviderManager.getDefaultSender();

    let subject = customSubject || 'SendQueue Test Message';
    let html = customHtml || '<p>This is a test email sent from SendQueue.</p>';
    let text = customText || 'This is a test email sent from SendQueue.';

    if (templateId) {
      const tpl = TemplateService.getTemplateById(templateId);
      if (tpl) {
        // Resolve tokens with test sample data
        const sampleContact = {
          first_name: 'Test',
          last_name: 'Recipient',
          email: to,
          company: 'Acme Test Corp',
          category: 'QA Testing'
        };
        const rendered = TemplateService.renderTemplate(tpl, sampleContact, {
          unsubscribe_url: 'https://sendqueue.local/unsubscribe?test=true'
        });
        subject = rendered.subject;
        html = rendered.body_html;
        text = rendered.body_text;
      }
    }

    const senderDisplay = `${fromName || defaultSender.name} <${fromEmail || defaultSender.email}>`;

    const dispatchResult = await activeProvider.sendMail({
      to,
      from: senderDisplay,
      subject,
      html,
      text,
      headers: {
        'X-SendQueue-Test': 'true'
      }
    });

    return res.json({
      message: `Test email dispatched successfully via ${activeProvider.getName().toUpperCase()}!`,
      result: dispatchResult
    });
  } catch (err) {
    console.error('Test send error:', err);
    return res.status(500).json({ error: `Test send failed: ${err.message}` });
  }
});

// GET /api/settings/mock-inbox
router.get('/mock-inbox', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const messages = ProviderManager.mockInstance.getMessages(limit);
    return res.json({ messages });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve mock inbox messages.' });
  }
});

// DELETE /api/settings/mock-inbox
router.delete('/mock-inbox', (req, res) => {
  try {
    ProviderManager.mockInstance.clearMessages();
    return res.json({ message: 'Virtual inbox cleared.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to clear mock inbox.' });
  }
});

module.exports = router;
