const express = require('express');
const router = express.Router();
const SuppressionService = require('../services/suppression.service');
const { authenticateToken } = require('../middleware/auth.middleware');

router.use(authenticateToken);

// GET /api/suppression - List suppressed emails
router.get('/', (req, res) => {
  try {
    const { page, limit, search, reason } = req.query;
    const result = SuppressionService.getSuppressed({ page, limit, search, reason });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve suppression list.' });
  }
});

// GET /api/suppression/stats - Suppression statistics breakdown
router.get('/stats', (req, res) => {
  try {
    const stats = SuppressionService.getSuppressionStats();
    return res.json({ stats });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve suppression stats.' });
  }
});

// POST /api/suppression - Manually add to suppression list
router.post('/', (req, res) => {
  try {
    const { email, reason } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    const result = SuppressionService.addSuppressed({ email, reason: reason || 'manual' });
    return res.status(201).json({ message: 'Email suppressed successfully.', result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/suppression/:id - Remove from suppression list (unblock)
router.delete('/:id', (req, res) => {
  try {
    const result = SuppressionService.removeSuppressed(req.params.id);
    return res.json({ message: 'Email removed from suppression list.', result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
