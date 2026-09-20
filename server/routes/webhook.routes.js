const express = require('express');
const router = express.Router();
const WebhookService = require('../services/webhook.service');
const { authenticateToken } = require('../middleware/auth.middleware');

// Public Webhook Endpoints (Called by Providers)

// Resend Webhook
router.post('/resend', (req, res) => {
  try {
    const result = WebhookService.handleResend(req.body);
    return res.status(200).json({ status: 'ok', ...result });
  } catch (err) {
    console.error('Resend webhook error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// SendGrid Event Webhook
router.post('/sendgrid', (req, res) => {
  try {
    const result = WebhookService.handleSendGrid(req.body);
    return res.status(200).json({ status: 'ok', ...result });
  } catch (err) {
    console.error('SendGrid webhook error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// Amazon SES Notification Webhook
router.post('/ses', (req, res) => {
  try {
    const result = WebhookService.handleSes(req.body);
    return res.status(200).json({ status: 'ok', ...result });
  } catch (err) {
    console.error('SES webhook error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// Mock/Testing Simulation Webhook (Can be called from UI or tests to simulate deliverability events)
router.post('/mock', (req, res) => {
  try {
    const { event_type, recipient_id, campaign_id, email, reason } = req.body;
    if (!event_type) {
      return res.status(400).json({ error: 'event_type is required (DELIVERED, BOUNCE, COMPLAINT, UNSUBSCRIBE).' });
    }
    const result = WebhookService.processEvent({
      event_type,
      recipient_id,
      campaign_id,
      email,
      reason,
      raw_payload: { simulated: true, timestamp: new Date().toISOString() }
    });
    return res.status(200).json({ status: 'simulated', result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Authenticated Audit Log API
router.get('/audit-events', authenticateToken, (req, res) => {
  try {
    const { campaign_id, recipient_id, limit } = req.query;
    const events = WebhookService.getAuditEvents({ campaign_id, recipient_id, limit });
    return res.json({ events });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve audit events.' });
  }
});

module.exports = router;
