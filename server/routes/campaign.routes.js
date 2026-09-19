const express = require('express');
const router = express.Router();
const CampaignService = require('../services/campaign.service');
const queueWorker = require('../queue/queue.worker');
const { authenticateToken } = require('../middleware/auth.middleware');

router.use(authenticateToken);

// GET /api/campaigns
router.get('/', (req, res) => {
  try {
    const { page, limit, status } = req.query;
    const result = CampaignService.getCampaigns({ page, limit, status });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve campaigns.' });
  }
});

// POST /api/campaigns
router.post('/', (req, res) => {
  try {
    const campaign = CampaignService.createCampaign(req.body);
    // Wake worker immediately to begin processing
    queueWorker.scheduleNextTick(0);
    return res.status(201).json({ message: 'Campaign queued successfully', campaign });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/campaigns/:id
router.get('/:id', (req, res) => {
  try {
    const campaign = CampaignService.getCampaignById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    return res.json({ campaign });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve campaign.' });
  }
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', (req, res) => {
  try {
    const campaign = CampaignService.pauseCampaign(req.params.id);
    return res.json({ message: 'Campaign paused.', campaign });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/resume
router.post('/:id/resume', (req, res) => {
  try {
    const campaign = CampaignService.resumeCampaign(req.params.id);
    queueWorker.scheduleNextTick(0);
    return res.json({ message: 'Campaign resumed.', campaign });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/cancel
router.post('/:id/cancel', (req, res) => {
  try {
    const campaign = CampaignService.cancelCampaign(req.params.id);
    return res.json({ message: 'Campaign cancelled.', campaign });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/campaigns/:id/recipients
router.get('/:id/recipients', (req, res) => {
  try {
    const { page, limit, status } = req.query;
    const result = CampaignService.getCampaignRecipients(req.params.id, { page, limit, status });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve campaign recipients.' });
  }
});

module.exports = router;
