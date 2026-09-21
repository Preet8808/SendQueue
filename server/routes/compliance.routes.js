const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const WebhookService = require('../services/webhook.service');
const SuppressionService = require('../services/suppression.service');

function processUnsubscribe({ token, email }) {
  let recipient = null;
  if (token) {
    recipient = db.prepare('SELECT * FROM campaign_recipients WHERE id = ?').get(token);
  }

  let finalEmail = email ? email.trim().toLowerCase() : null;
  if (recipient && !finalEmail) {
    finalEmail = recipient.recipient_email.toLowerCase();
  }

  if (!finalEmail && !recipient) {
    throw new Error('Valid unsubscribe token or email address is required.');
  }

  const campaignId = recipient ? recipient.campaign_id : null;
  const recipientId = recipient ? recipient.id : null;

  return WebhookService.processEvent({
    event_type: 'UNSUBSCRIBE',
    recipient_id: recipientId,
    campaign_id: campaignId,
    email: finalEmail,
    reason: 'One-click unsubscribe (RFC 8058 / Web link)',
    raw_payload: { method: 'unsubscribe', token, email: finalEmail, timestamp: new Date().toISOString() }
  });
}

// GET /api/compliance/unsubscribe - Human user clicked link in email
router.get('/unsubscribe', (req, res) => {
  try {
    const { token, email } = req.query;
    const result = processUnsubscribe({ token, email });

    // If client requested JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ status: 'unsubscribed', email: result.email });
    }

    // Render clean, modern branded unsubscribe confirmation HTML
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unsubscribed — SendQueue</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #090d16;
            color: #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
          }
          .card {
            background: #111827;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            max-width: 460px;
            width: 100%;
            padding: 40px 32px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
          }
          .icon-badge {
            width: 56px;
            height: 56px;
            margin: 0 auto 20px auto;
            border-radius: 50%;
            background: rgba(16, 185, 129, 0.12);
            color: #10b981;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
          }
          h1 { font-size: 1.4rem; font-weight: 700; color: #fff; margin-bottom: 12px; }
          p { font-size: 0.92rem; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
          .email-tag {
            display: inline-block;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #60a5fa;
            padding: 4px 12px;
            border-radius: 9999px;
            font-weight: 600;
            margin-bottom: 24px;
            word-break: break-all;
          }
          .footer-note { font-size: 0.78rem; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h1>Unsubscribe Successful</h1>
          <p>You have been safely removed from our mailing list. You will no longer receive campaigns from this sender.</p>
          ${result.email ? `<div class="email-tag">${result.email}</div>` : ''}
          <div class="footer-note">Compliant with RFC 8058 One-Click Unsubscribe standard. Powered by SendQueue.</div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; background: #090d16; color: #f87171; display:flex; align-items:center; justify-content:center; min-height:100vh;">
        <div style="background:#111827; padding:30px; border-radius:12px; text-align:center;">
          <h2>Unsubscribe Error</h2>
          <p style="margin-top:10px; color:#94a3b8;">${err.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});

// POST /api/compliance/unsubscribe - RFC 8058 One-Click Unsubscribe endpoint (Email client automation)
router.post('/unsubscribe', (req, res) => {
  try {
    const token = req.query.token || req.body.token;
    const email = req.query.email || req.body.email;
    const result = processUnsubscribe({ token, email });
    return res.status(200).json({ status: 'unsubscribed', email: result.email });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
