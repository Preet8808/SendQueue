const express = require('express');
const router = express.Router();
const TemplateService = require('../services/template.service');
const ContactService = require('../services/contact.service');
const { authenticateToken } = require('../middleware/auth.middleware');

router.use(authenticateToken);

// GET /api/templates
router.get('/', (req, res) => {
  try {
    const templates = TemplateService.getTemplates();
    return res.json({ templates });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve templates.' });
  }
});

// POST /api/templates
router.post('/', (req, res) => {
  try {
    const template = TemplateService.createTemplate(req.body);
    return res.status(201).json({ message: 'Template created successfully', template });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/templates/preview - dynamic live preview resolution
router.post('/preview', (req, res) => {
  try {
    const { subject = '', body_html = '', body_text = '', contactId, customContact } = req.body;

    let contact = customContact || {
      first_name: 'Alex',
      last_name: 'Rivera',
      company: 'Acme Corp',
      category: 'Enterprise',
      email: 'alex.rivera@example.com'
    };

    if (contactId) {
      const foundContact = ContactService.getContactById(contactId);
      if (foundContact) {
        contact = foundContact;
      }
    }

    const rendered = TemplateService.renderTemplate(
      { subject, body_html, body_text },
      contact,
      { unsubscribe_url: 'https://sendqueue.local/unsubscribe?token=sample_preview_token' }
    );

    const tokensFound = TemplateService.extractTokens(`${subject} ${body_html} ${body_text}`);

    return res.json({
      rendered,
      contactUsed: {
        id: contact.id || 'sample',
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Sample Recipient',
        email: contact.email || 'sample@example.com',
        company: contact.company || ''
      },
      tokensFound
    });
  } catch (err) {
    return res.status(400).json({ error: `Preview rendering error: ${err.message}` });
  }
});

// GET /api/templates/:id
router.get('/:id', (req, res) => {
  try {
    const template = TemplateService.getTemplateById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    return res.json({ template });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve template.' });
  }
});

// PUT /api/templates/:id
router.put('/:id', (req, res) => {
  try {
    const updated = TemplateService.updateTemplate(req.params.id, req.body);
    return res.json({ message: 'Template updated successfully', template: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/templates/:id
router.delete('/:id', (req, res) => {
  try {
    const result = TemplateService.deleteTemplate(req.params.id);
    return res.json({ message: 'Template deleted successfully', result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/templates/:id/clone
router.post('/:id/clone', (req, res) => {
  try {
    const cloned = TemplateService.cloneTemplate(req.params.id);
    return res.status(201).json({ message: 'Template cloned successfully', template: cloned });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
