const { db } = require('../database/db');
const TokenBucketRateLimiter = require('./rate.limiter');
const ProviderManager = require('../providers/provider.manager');
const TemplateService = require('../services/template.service');

class QueueWorker {
  constructor() {
    this.isRunning = false;
    this.isProcessing = false;
    this.timer = null;
    this.rateLimiters = new Map(); // campaignId -> TokenBucketRateLimiter
    this.pollIntervalMs = 300; // Fast polling when active jobs exist
    this.idleIntervalMs = 1500; // Slower polling when idle
  }

  getRateLimiter(campaignId, ratePerSecond) {
    if (!this.rateLimiters.has(campaignId)) {
      this.rateLimiters.set(campaignId, new TokenBucketRateLimiter(ratePerSecond, Math.max(5, ratePerSecond * 2)));
    }
    const limiter = this.rateLimiters.get(campaignId);
    limiter.setRate(ratePerSecond);
    return limiter;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('⚡ Queue Worker started.');

    // 1. Crash Recovery on startup: reclaim any jobs stuck in SENDING from previous crashes
    this.recoverStaleSendingJobs();

    // 2. Start loop
    this.scheduleNextTick(0);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('⏹ Queue Worker stopped.');
  }

  scheduleNextTick(delayMs) {
    if (!this.isRunning) return;
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  // Crash recovery: Reclaims jobs abandoned in 'SENDING' status during unexpected restarts
  recoverStaleSendingJobs() {
    try {
      const result = db.prepare(`
        UPDATE campaign_recipients
        SET status = 'PENDING'
        WHERE status = 'SENDING'
      `).run();

      if (result.changes > 0) {
        console.log(`🛡 Crash Recovery: Reclaimed ${result.changes} orphaned jobs back to PENDING.`);
      }
    } catch (err) {
      console.error('Crash recovery check failed:', err);
    }
  }

  async tick() {
    if (!this.isRunning || this.isProcessing) return;
    this.isProcessing = true;

    let hadWork = false;

    try {
      // 1. Check for scheduled campaigns that are ready to run
      this.activateScheduledCampaigns();

      // 2. Find active campaigns currently in 'SENDING' or 'QUEUED'
      const activeCampaigns = db.prepare(`
        SELECT * FROM campaigns 
        WHERE status IN ('SENDING', 'QUEUED')
        ORDER BY created_at ASC
      `).all();

      for (const campaign of activeCampaigns) {
        // Transition QUEUED to SENDING
        if (campaign.status === 'QUEUED') {
          db.prepare("UPDATE campaigns SET status = 'SENDING', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaign.id);
          campaign.status = 'SENDING';
        }

        // Process a batch for this campaign
        const processedBatch = await this.processCampaignBatch(campaign);
        if (processedBatch > 0) {
          hadWork = true;
        }

        // Check if campaign is now completed
        this.checkCampaignCompletion(campaign.id);
      }
    } catch (err) {
      console.error('Queue Worker tick error:', err);
    } finally {
      this.isProcessing = false;
      // Schedule next tick faster if there was work, slower if idle
      this.scheduleNextTick(hadWork ? this.pollIntervalMs : this.idleIntervalMs);
    }
  }

  activateScheduledCampaigns() {
    try {
      db.prepare(`
        UPDATE campaigns
        SET status = 'QUEUED', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'SCHEDULED' 
          AND scheduled_at IS NOT NULL 
          AND scheduled_at <= datetime('now')
      `).run();
    } catch (err) {
      console.error('Error activating scheduled campaigns:', err);
    }
  }

  async processCampaignBatch(campaign) {
    const rateLimiter = this.getRateLimiter(campaign.id, campaign.rate_limit_per_sec || 5);

    // Fetch batch of up to 10 pending or retry-ready recipients
    const recipients = db.prepare(`
      SELECT * FROM campaign_recipients
      WHERE campaign_id = ? 
        AND (
          status = 'PENDING' 
          OR (status = 'RETRY' AND next_attempt_at IS NOT NULL AND next_attempt_at <= datetime('now'))
        )
      ORDER BY created_at ASC
      LIMIT 10
    `).all(campaign.id);

    if (recipients.length === 0) {
      return 0;
    }

    const activeProvider = ProviderManager.getActiveProvider();
    const senderDisplay = `${campaign.from_name} <${campaign.from_email}>`;

    for (const recipient of recipients) {
      // Re-verify that campaign is still in 'SENDING' (user might have clicked Pause/Cancel)
      const freshCampaignState = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaign.id);
      if (!freshCampaignState || freshCampaignState.status !== 'SENDING') {
        break;
      }

      // 1. Wait for token bucket rate limiter
      await rateLimiter.acquireToken();

      // 2. Mark recipient as SENDING
      db.prepare("UPDATE campaign_recipients SET status = 'SENDING' WHERE id = ?").run(recipient.id);

      // 3. Resolve personalization snapshot
      const contactData = recipient.personalization_data ? JSON.parse(recipient.personalization_data) : {};
      const unsubscribeUrl = `https://sendqueue.local/unsubscribe?token=${recipient.id}&email=${encodeURIComponent(recipient.recipient_email)}`;

      const rendered = TemplateService.renderTemplate(
        {
          subject: campaign.subject,
          body_html: campaign.body_html,
          body_text: campaign.body_text
        },
        contactData,
        { unsubscribe_url: unsubscribeUrl }
      );

      // 4. Dispatch through active provider
      try {
        const dispatchResult = await activeProvider.sendMail({
          to: recipient.recipient_email,
          from: senderDisplay,
          replyTo: campaign.reply_to || undefined,
          subject: rendered.subject,
          html: rendered.body_html,
          text: rendered.body_text,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'X-Campaign-Id': campaign.id,
            'X-Recipient-Id': recipient.id
          }
        });

        // 5. Success: update recipient & increment campaign sent count
        db.prepare(`
          UPDATE campaign_recipients
          SET status = 'SENT',
              provider_message_id = ?,
              error_message = NULL,
              sent_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(dispatchResult.messageId || 'sent', recipient.id);

        db.prepare(`
          UPDATE campaigns
          SET sent_count = sent_count + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(campaign.id);

      } catch (sendErr) {
        console.error(`Dispatch failed for recipient ${recipient.recipient_email}:`, sendErr.message);

        const nextAttemptCount = (recipient.attempt_count || 0) + 1;
        const maxAttempts = recipient.max_attempts || 3;

        if (nextAttemptCount < maxAttempts) {
          // Schedule exponential backoff retry: 30s, 60s, 120s
          const backoffSec = Math.pow(2, nextAttemptCount) * 15;
          db.prepare(`
            UPDATE campaign_recipients
            SET status = 'RETRY',
                attempt_count = ?,
                error_message = ?,
                next_attempt_at = datetime('now', '+' || ? || ' seconds')
            WHERE id = ?
          `).run(nextAttemptCount, sendErr.message, backoffSec, recipient.id);
        } else {
          // Terminal failure
          db.prepare(`
            UPDATE campaign_recipients
            SET status = 'FAILED',
                attempt_count = ?,
                error_message = ?
            WHERE id = ?
          `).run(nextAttemptCount, sendErr.message, recipient.id);

          db.prepare(`
            UPDATE campaigns
            SET failed_count = failed_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(campaign.id);
        }
      }
    }

    return recipients.length;
  }

  checkCampaignCompletion(campaignId) {
    // Check if there are any remaining pending, sending, or retry recipients
    const remainingRow = db.prepare(`
      SELECT COUNT(*) as count FROM campaign_recipients
      WHERE campaign_id = ? 
        AND status IN ('PENDING', 'QUEUED', 'SENDING', 'RETRY')
    `).get(campaignId);

    if (remainingRow && remainingRow.count === 0) {
      db.prepare(`
        UPDATE campaigns
        SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status != 'COMPLETED'
      `).run(campaignId);
      console.log(`🏁 Campaign ${campaignId} completed! All recipients reached terminal state.`);
      this.rateLimiters.delete(campaignId);
    }
  }
}

module.exports = new QueueWorker();
