const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { authenticateToken } = require('../middleware/auth.middleware');
const ProviderManager = require('../providers/provider.manager');
const queueWorker = require('../queue/queue.worker');

// Public Health Check with Telemetry
router.get('/health', (req, res) => {
  try {
    const dbCheck = db.prepare('SELECT 1 as alive').get();
    const mem = process.memoryUsage();
    const activeProvider = ProviderManager.getActiveProvider();

    // Quick queue stats
    const queueStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN status IN ('PENDING', 'QUEUED', 'SENDING', 'RETRY') THEN 1 ELSE 0 END) as in_flight,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'BOUNCED' THEN 1 ELSE 0 END) as bounced
      FROM campaign_recipients
    `).get();

    return res.json({
      status: 'healthy',
      app: 'SendQueue',
      version: '1.0.0',
      database: dbCheck && dbCheck.alive === 1 ? 'connected' : 'unreachable',
      worker: {
        running: queueWorker.isRunning,
        processing: queueWorker.isProcessing
      },
      provider: {
        active: activeProvider ? activeProvider.getName() : 'unknown'
      },
      queue: {
        in_flight: queueStats.in_flight || 0,
        sent: queueStats.sent || 0,
        delivered: queueStats.delivered || 0,
        bounced: queueStats.bounced || 0
      },
      system: {
        uptimeSec: Math.round(process.uptime()),
        memory: {
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          rssMb: Math.round(mem.rss / 1024 / 1024)
        },
        nodeVersion: process.version
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});

// System Overview Stats (Enriched for Dashboard KPIs and Telemetry)
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const contactCount = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'active'").get().count;
    const totalContacts = db.prepare("SELECT COUNT(*) as count FROM contacts").get().count;
    const groupCount = db.prepare('SELECT COUNT(*) as count FROM groups').get().count;
    const templateCount = db.prepare('SELECT COUNT(*) as count FROM templates').get().count;
    const campaignCount = db.prepare('SELECT COUNT(*) as count FROM campaigns').get().count;
    const suppressedCount = db.prepare('SELECT COUNT(*) as count FROM suppression_list').get().count;

    // Delivery & Queue Totals
    const recipientTotals = db.prepare(`
      SELECT 
        SUM(CASE WHEN status IN ('PENDING', 'QUEUED', 'SENDING', 'RETRY') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status IN ('SENT', 'DELIVERED') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'BOUNCED' THEN 1 ELSE 0 END) as bounced,
        SUM(CASE WHEN status = 'UNSUBSCRIBED' THEN 1 ELSE 0 END) as unsubscribed,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM campaign_recipients
    `).get();

    const pending = recipientTotals.pending || 0;
    const sent = recipientTotals.sent || 0;
    const delivered = recipientTotals.delivered || 0;
    const bounced = recipientTotals.bounced || 0;
    const unsubscribed = recipientTotals.unsubscribed || 0;
    const failed = recipientTotals.failed || 0;

    const deliveryRate = sent > 0 ? Math.min(100, Math.round((delivered / sent) * 100)) : 0;
    const bounceRate = sent > 0 ? (Math.round((bounced / sent) * 1000) / 10) : 0;

    const activeProvider = db.prepare("SELECT value FROM system_settings WHERE key = 'active_provider'").get()?.value || 'mock';

    // Recent / Active Campaigns for the dashboard telemetry widget
    const recentCampaigns = db.prepare(`
      SELECT 
        c.id, c.name, c.status, c.total_recipients, c.rate_limit_per_sec, c.created_at,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status IN ('SENT', 'DELIVERED')) as sent_count,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'DELIVERED') as delivered_count,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'BOUNCED') as bounced_count
      FROM campaigns c
      ORDER BY c.created_at DESC
      LIMIT 5
    `).all().map(c => {
      const tot = c.total_recipients || 0;
      const progress = tot > 0 ? Math.min(100, Math.round(((c.sent_count || 0) / tot) * 100)) : 0;
      return {
        ...c,
        progressPercent: progress
      };
    });

    return res.json({
      stats: {
        contacts: contactCount,
        totalContacts,
        groups: groupCount,
        templates: templateCount,
        campaigns: campaignCount,
        suppressed: suppressedCount,
        queue: {
          pending,
          sent,
          delivered,
          bounced,
          unsubscribed,
          failed,
          deliveryRate,
          bounceRate
        },
        activeProvider,
        recentCampaigns
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Failed to retrieve system statistics.' });
  }
});

module.exports = router;
