const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const SuppressionService = require('./suppression.service');

const WebhookService = {
  /**
   * Process a normalized delivery event and update queue/recipient/contact/audit state.
   */
  processEvent({
    event_type, // 'SENT', 'DELIVERED', 'BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'OPEN', 'CLICK'
    recipient_id = null,
    campaign_id = null,
    email = null,
    provider_message_id = null,
    reason = null,
    raw_payload = null
  }) {
    if (!event_type) throw new Error('event_type is required.');

    const normalizedEventType = event_type.toUpperCase();
    const eventId = uuidv4();

    // 1. Resolve recipient if recipient_id not explicitly provided
    let resolvedRecipient = null;
    if (recipient_id) {
      resolvedRecipient = db.prepare('SELECT * FROM campaign_recipients WHERE id = ?').get(recipient_id);
    } else if (provider_message_id) {
      resolvedRecipient = db.prepare('SELECT * FROM campaign_recipients WHERE provider_message_id = ?').get(provider_message_id);
    } else if (campaign_id && email) {
      resolvedRecipient = db.prepare('SELECT * FROM campaign_recipients WHERE campaign_id = ? AND recipient_email = ?').get(campaign_id, email.toLowerCase());
    } else if (email) {
      resolvedRecipient = db.prepare('SELECT * FROM campaign_recipients WHERE recipient_email = ? ORDER BY created_at DESC LIMIT 1').get(email.toLowerCase());
    }

    const finalRecipientId = resolvedRecipient ? resolvedRecipient.id : recipient_id;
    const finalCampaignId = resolvedRecipient ? resolvedRecipient.campaign_id : campaign_id;
    const finalEmail = (resolvedRecipient ? resolvedRecipient.recipient_email : email || '').toLowerCase();

    // 2. Record in audit_events
    const payloadStr = typeof raw_payload === 'string' ? raw_payload : JSON.stringify(raw_payload || {});
    db.prepare(`
      INSERT INTO audit_events (id, campaign_id, recipient_id, event_type, raw_payload, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(eventId, finalCampaignId, finalRecipientId, normalizedEventType, payloadStr);

    // 3. Update recipient status & delivery timestamp if found
    if (finalRecipientId) {
      if (normalizedEventType === 'DELIVERED') {
        db.prepare(`
          UPDATE campaign_recipients 
          SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP, error_message = NULL
          WHERE id = ?
        `).run(finalRecipientId);
      } else if (normalizedEventType === 'BOUNCE') {
        db.prepare(`
          UPDATE campaign_recipients 
          SET status = 'BOUNCED', error_message = ?
          WHERE id = ?
        `).run(reason || 'Message bounced by destination server', finalRecipientId);
      } else if (normalizedEventType === 'COMPLAINT') {
        db.prepare(`
          UPDATE campaign_recipients 
          SET status = 'COMPLAINED', error_message = ?
          WHERE id = ?
        `).run(reason || 'Spam complaint reported', finalRecipientId);
      } else if (normalizedEventType === 'UNSUBSCRIBE') {
        db.prepare(`
          UPDATE campaign_recipients 
          SET status = 'UNSUBSCRIBED'
          WHERE id = ?
        `).run(finalRecipientId);
      }
    }

    // 4. Update suppression & contacts table for deliverability compliance
    if (finalEmail) {
      if (normalizedEventType === 'BOUNCE') {
        SuppressionService.addSuppressed({
          email: finalEmail,
          reason: 'hard_bounce',
          source_campaign_id: finalCampaignId
        });
      } else if (normalizedEventType === 'COMPLAINT') {
        SuppressionService.addSuppressed({
          email: finalEmail,
          reason: 'complaint',
          source_campaign_id: finalCampaignId
        });
      } else if (normalizedEventType === 'UNSUBSCRIBE') {
        SuppressionService.addSuppressed({
          email: finalEmail,
          reason: 'unsubscribe',
          source_campaign_id: finalCampaignId
        });
      }
    }

    return {
      success: true,
      event_id: eventId,
      event_type: normalizedEventType,
      campaign_id: finalCampaignId,
      recipient_id: finalRecipientId,
      email: finalEmail
    };
  },

  /**
   * Parse Resend webhook payload.
   */
  handleResend(body) {
    if (!body || !body.type) return { processed: 0 };
    const type = body.type; // 'email.delivered', 'email.bounced', 'email.complained'
    const data = body.data || {};
    
    let eventType = null;
    if (type === 'email.delivered') eventType = 'DELIVERED';
    else if (type === 'email.bounced') eventType = 'BOUNCE';
    else if (type === 'email.complained') eventType = 'COMPLAINT';
    else if (type === 'email.sent') eventType = 'SENT';

    if (!eventType) return { ignored: type };

    const email = Array.isArray(data.to) ? data.to[0] : data.to;
    const headers = data.headers || {};
    const campaignId = headers['X-Campaign-Id'] || headers['x-campaign-id'] || null;
    const recipientId = headers['X-Recipient-Id'] || headers['x-recipient-id'] || null;

    const result = this.processEvent({
      event_type: eventType,
      recipient_id: recipientId,
      campaign_id: campaignId,
      email,
      provider_message_id: data.email_id || null,
      reason: data.bounce_reason || null,
      raw_payload: body
    });

    return { processed: 1, result };
  },

  /**
   * Parse SendGrid webhook payload (array of event items).
   */
  handleSendGrid(events) {
    if (!Array.isArray(events)) return { processed: 0 };
    const results = [];

    for (const item of events) {
      let eventType = null;
      if (item.event === 'delivered') eventType = 'DELIVERED';
      else if (item.event === 'bounce' || item.event === 'dropped') eventType = 'BOUNCE';
      else if (item.event === 'spamreport') eventType = 'COMPLAINT';
      else if (item.event === 'unsubscribe') eventType = 'UNSUBSCRIBE';
      else if (item.event === 'open') eventType = 'OPEN';
      else if (item.event === 'click') eventType = 'CLICK';

      if (!eventType) continue;

      const res = this.processEvent({
        event_type: eventType,
        recipient_id: item.recipient_id || item['x-recipient-id'] || null,
        campaign_id: item.campaign_id || item['x-campaign-id'] || null,
        email: item.email,
        provider_message_id: item.sg_message_id || null,
        reason: item.reason || null,
        raw_payload: item
      });
      results.push(res);
    }

    return { processed: results.length, results };
  },

  /**
   * Parse Amazon SES SNS notification payload.
   */
  handleSes(body) {
    let payload = body;
    if (typeof body === 'string') {
      try { payload = JSON.parse(body); } catch (e) {}
    }

    // Unpack SNS Message wrapper if present
    if (payload && payload.Type === 'Notification' && payload.Message) {
      try { payload = JSON.parse(payload.Message); } catch (e) {}
    }

    const eventTypeStr = payload.eventType || (payload.notificationType);
    let eventType = null;
    let reason = null;

    if (eventTypeStr === 'Delivery') eventType = 'DELIVERED';
    else if (eventTypeStr === 'Bounce') {
      eventType = 'BOUNCE';
      reason = payload.bounce ? `${payload.bounce.bounceType}: ${payload.bounce.bounceSubType}` : 'SES Bounce';
    } else if (eventTypeStr === 'Complaint') {
      eventType = 'COMPLAINT';
      reason = payload.complaint ? payload.complaint.complaintFeedbackType : 'SES Complaint';
    }

    if (!eventType) return { ignored: eventTypeStr };

    const mail = payload.mail || {};
    const email = Array.isArray(mail.destination) ? mail.destination[0] : null;
    const headers = mail.headers || [];

    let campaignId = null;
    let recipientId = null;
    for (const h of headers) {
      if (h.name && h.name.toLowerCase() === 'x-campaign-id') campaignId = h.value;
      if (h.name && h.name.toLowerCase() === 'x-recipient-id') recipientId = h.value;
    }

    const result = this.processEvent({
      event_type: eventType,
      recipient_id: recipientId,
      campaign_id: campaignId,
      email,
      provider_message_id: mail.messageId || null,
      reason,
      raw_payload: payload
    });

    return { processed: 1, result };
  },

  /**
   * Query recent audit events for a campaign or recipient.
   */
  getAuditEvents({ campaign_id, recipient_id, limit = 50 } = {}) {
    const conditions = [];
    const params = [];

    if (campaign_id) {
      conditions.push('campaign_id = ?');
      params.push(campaign_id);
    }
    if (recipient_id) {
      conditions.push('recipient_id = ?');
      params.push(recipient_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const rows = db.prepare(`
      SELECT * FROM audit_events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, limitNum);

    return rows.map(r => ({
      ...r,
      raw_payload: r.raw_payload ? JSON.parse(r.raw_payload) : {}
    }));
  }
};

module.exports = WebhookService;
