const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { authenticateToken } = require('../middleware/auth.middleware');

// Public Health Check
router.get('/health', (req, res) => {
  try {
    const dbCheck = db.prepare('SELECT 1 as alive').get();
    return res.json({
      status: 'healthy',
      app: 'SendQueue',
      version: '1.0.0',
      database: dbCheck && dbCheck.alive === 1 ? 'connected' : 'unreachable',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});

// System Overview Stats (for dashboard top metrics)
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const contactCount = db.prepare('SELECT COUNT(*) as count FROM contacts').get().count;
    const groupCount = db.prepare('SELECT COUNT(*) as count FROM groups').get().count;
    const templateCount = db.prepare('SELECT COUNT(*) as count FROM templates').get().count;
    const campaignCount = db.prepare('SELECT COUNT(*) as count FROM campaigns').get().count;
    const queuedCount = db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status IN ('PENDING', 'QUEUED', 'SENDING')").get().count;
    const sentCount = db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status = 'SENT'").get().count;
    const failedCount = db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status IN ('FAILED', 'BOUNCED')").get().count;

    const activeProvider = db.prepare("SELECT value FROM system_settings WHERE key = 'active_provider'").get()?.value || 'mock';

    return res.json({
      stats: {
        contacts: contactCount,
        groups: groupCount,
        templates: templateCount,
        campaigns: campaignCount,
        queue: {
          pending: queuedCount,
          sent: sentCount,
          failed: failedCount
        },
        activeProvider
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Failed to retrieve system statistics.' });
  }
});

module.exports = router;
