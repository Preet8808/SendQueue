const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const TemplateService = require('./template.service');
const ProviderManager = require('../providers/provider.manager');

const CampaignService = {
  createCampaign({
    name,
    template_id = null,
    subject,
    body_html,
    body_text = '',
    from_name,
    from_email,
    reply_to = '',
    group_ids = [],
    rate_limit_per_sec = 5,
    scheduled_at = null
  }) {
    if (!name || !name.trim()) throw new Error('Campaign name is required.');

    const defaultSender = ProviderManager.getDefaultSender();
    const finalFromName = (from_name || defaultSender.name).trim();
    const finalFromEmail = (from_email || defaultSender.email).trim();

    let finalSubject = subject ? subject.trim() : '';
    let finalHtml = body_html ? body_html.trim() : '';
    let finalText = body_text ? body_text.trim() : '';

    // If template_id provided, copy snapshots
    if (template_id) {
      const tpl = TemplateService.getTemplateById(template_id);
      if (tpl) {
        if (!finalSubject) finalSubject = tpl.subject;
        if (!finalHtml) finalHtml = tpl.body_html;
        if (!finalText) finalText = tpl.body_text || '';
      }
    }

    if (!finalSubject) throw new Error('Subject line is required.');
    if (!finalHtml) throw new Error('Email HTML body is required.');

    // 1. Audience Resolution
    let contactsToEnqueue = [];
    const validGroupIds = (Array.isArray(group_ids) ? group_ids : []).filter(Boolean);

    if (validGroupIds.length === 0 || validGroupIds.includes('all')) {
      // All active contacts
      contactsToEnqueue = db.prepare(`
        SELECT * FROM contacts 
        WHERE status = 'active'
        ORDER BY created_at ASC
      `).all();
    } else {
      // Contacts in selected groups
      const placeholders = validGroupIds.map(() => '?').join(',');
      contactsToEnqueue = db.prepare(`
        SELECT DISTINCT c.* 
        FROM contacts c
        INNER JOIN contact_groups cg ON c.id = cg.contact_id
        WHERE cg.group_id IN (${placeholders}) AND c.status = 'active'
        ORDER BY c.created_at ASC
      `).all(...validGroupIds);
    }

    // 2. Filter Against Suppression List & In-Campaign Deduplication
    const suppressedRows = db.prepare('SELECT email FROM suppression_list').all();
    const suppressedSet = new Set(suppressedRows.map(r => r.email.toLowerCase()));

    const seenEmails = new Set();
    const eligibleRecipients = [];

    for (const c of contactsToEnqueue) {
      const email = (c.email || '').trim().toLowerCase();
      if (!email || seenEmails.has(email) || suppressedSet.has(email)) continue;
      seenEmails.add(email);

      // Snapshot contact attributes for personalization
      const personalSnapshot = {
        first_name: c.first_name || '',
        last_name: c.last_name || '',
        email: c.email,
        company: c.company || '',
        category: c.category || '',
        custom_attributes: c.custom_attributes ? (typeof c.custom_attributes === 'string' ? JSON.parse(c.custom_attributes) : c.custom_attributes) : {}
      };

      eligibleRecipients.push({
        id: uuidv4(),
        contact_id: c.id,
        email: c.email,
        personalization_data: JSON.stringify(personalSnapshot)
      });
    }

    if (eligibleRecipients.length === 0) {
      throw new Error('No eligible active recipients found for this campaign audience (all selected contacts may be suppressed or empty).');
    }

    const campaignId = uuidv4();
    const initialStatus = scheduled_at && new Date(scheduled_at) > new Date() ? 'SCHEDULED' : 'QUEUED';
    const rateLimit = Math.max(1, parseInt(rate_limit_per_sec, 10) || 5);

    // 3. Atomic Database Ingestion
    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        INSERT INTO campaigns (
          id, name, template_id, subject, body_html, body_text,
          from_name, from_email, reply_to, status, rate_limit_per_sec,
          total_recipients, scheduled_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        campaignId,
        name.trim(),
        template_id || null,
        finalSubject,
        finalHtml,
        finalText,
        finalFromName,
        finalFromEmail,
        reply_to ? reply_to.trim() : null,
        initialStatus,
        rateLimit,
        eligibleRecipients.length,
        scheduled_at ? new Date(scheduled_at).toISOString() : null
      );

      const insertRecipient = db.prepare(`
        INSERT INTO campaign_recipients (
          id, campaign_id, contact_id, recipient_email, personalization_data,
          status, attempt_count, max_attempts, created_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 3, CURRENT_TIMESTAMP)
      `);

      for (const r of eligibleRecipients) {
        insertRecipient.run(r.id, campaignId, r.contact_id, r.email, r.personalization_data);
      }

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return this.getCampaignById(campaignId);
  },

  getCampaigns({ page = 1, limit = 20, status = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status.trim()) {
      conditions.push('c.status = ?');
      params.push(status.trim());
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM campaigns c ${whereClause}`;
    const total = db.prepare(countSql).get(...params)?.total || 0;

    const campaignsSql = `
      SELECT 
        c.*,
        t.name as template_name,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status IN ('SENT', 'DELIVERED')) as calculated_sent,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'DELIVERED') as calculated_delivered,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'BOUNCED') as calculated_bounced,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'COMPLAINED') as calculated_complained,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'UNSUBSCRIBED') as calculated_unsubscribed,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'FAILED') as calculated_failed,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status IN ('PENDING', 'QUEUED', 'SENDING', 'RETRY')) as calculated_pending
      FROM campaigns c
      LEFT JOIN templates t ON c.template_id = t.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(campaignsSql).all(...params, limitNum, offset);

    const formatted = rows.map(c => {
      const sent = c.calculated_sent || 0;
      const delivered = c.calculated_delivered || 0;
      const bounced = c.calculated_bounced || 0;
      const complained = c.calculated_complained || 0;
      const unsubscribed = c.calculated_unsubscribed || 0;
      const failed = c.calculated_failed || 0;
      const pending = c.calculated_pending || 0;
      const totalRec = c.total_recipients || 0;
      const processed = sent + failed + bounced;
      const progressPercent = totalRec > 0 ? Math.min(100, Math.round((processed / totalRec) * 100)) : 0;
      const deliveryRate = sent > 0 ? Math.min(100, Math.round((delivered / sent) * 100)) : 0;
      const bounceRate = sent > 0 ? (Math.round((bounced / sent) * 1000) / 10) : 0;

      return {
        ...c,
        sent_count: sent,
        delivered_count: delivered,
        bounced_count: bounced,
        complained_count: complained,
        unsubscribed_count: unsubscribed,
        failed_count: failed,
        pending_count: pending,
        progressPercent,
        deliveryRate,
        bounceRate
      };
    });

    return {
      campaigns: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  },

  getCampaignById(id) {
    const campaign = db.prepare(`
      SELECT 
        c.*,
        t.name as template_name,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status IN ('SENT', 'DELIVERED')) as calculated_sent,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'DELIVERED') as calculated_delivered,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'BOUNCED') as calculated_bounced,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'COMPLAINED') as calculated_complained,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'UNSUBSCRIBED') as calculated_unsubscribed,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'FAILED') as calculated_failed,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status IN ('PENDING', 'QUEUED', 'SENDING', 'RETRY')) as calculated_pending
      FROM campaigns c
      LEFT JOIN templates t ON c.template_id = t.id
      WHERE c.id = ?
    `).get(id);

    if (!campaign) return null;

    const sent = campaign.calculated_sent || 0;
    const delivered = campaign.calculated_delivered || 0;
    const bounced = campaign.calculated_bounced || 0;
    const complained = campaign.calculated_complained || 0;
    const unsubscribed = campaign.calculated_unsubscribed || 0;
    const failed = campaign.calculated_failed || 0;
    const pending = campaign.calculated_pending || 0;
    const totalRec = campaign.total_recipients || 0;
    const processed = sent + failed + bounced;
    const progressPercent = totalRec > 0 ? Math.min(100, Math.round((processed / totalRec) * 100)) : 0;
    const deliveryRate = sent > 0 ? Math.min(100, Math.round((delivered / sent) * 100)) : 0;
    const bounceRate = sent > 0 ? (Math.round((bounced / sent) * 1000) / 10) : 0;

    return {
      ...campaign,
      sent_count: sent,
      delivered_count: delivered,
      bounced_count: bounced,
      complained_count: complained,
      unsubscribed_count: unsubscribed,
      failed_count: failed,
      pending_count: pending,
      progressPercent,
      deliveryRate,
      bounceRate
    };
  },

  pauseCampaign(id) {
    const campaign = this.getCampaignById(id);
    if (!campaign) throw new Error('Campaign not found.');
    if (campaign.status === 'COMPLETED') throw new Error('Completed campaigns cannot be paused.');

    db.prepare("UPDATE campaigns SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return this.getCampaignById(id);
  },

  resumeCampaign(id) {
    const campaign = this.getCampaignById(id);
    if (!campaign) throw new Error('Campaign not found.');
    if (campaign.status !== 'PAUSED') throw new Error('Only paused campaigns can be resumed.');

    db.prepare("UPDATE campaigns SET status = 'SENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return this.getCampaignById(id);
  },

  cancelCampaign(id) {
    const campaign = this.getCampaignById(id);
    if (!campaign) throw new Error('Campaign not found.');

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = 'FAILED', error_message = 'Campaign cancelled by user'
        WHERE campaign_id = ? AND status IN ('PENDING', 'QUEUED')
      `).run(id);

      db.prepare(`
        UPDATE campaigns 
        SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return this.getCampaignById(id);
  },

  getCampaignRecipients(campaignId, { page = 1, limit = 25, status = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['cr.campaign_id = ?'];
    const params = [campaignId];

    if (status && status.trim()) {
      conditions.push('cr.status = ?');
      params.push(status.trim());
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const total = db.prepare(`SELECT COUNT(*) as total FROM campaign_recipients cr ${whereClause}`).get(...params)?.total || 0;

    const rows = db.prepare(`
      SELECT 
        cr.*,
        c.first_name,
        c.last_name,
        c.company
      FROM campaign_recipients cr
      LEFT JOIN contacts c ON cr.contact_id = c.id
      ${whereClause}
      ORDER BY cr.created_at ASC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    return {
      recipients: rows.map(r => ({
        ...r,
        personalization_data: r.personalization_data ? JSON.parse(r.personalization_data) : {}
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }
};

module.exports = CampaignService;
