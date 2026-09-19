const express = require('express');
const router = express.Router();
const GroupService = require('../services/group.service');
const { authenticateToken } = require('../middleware/auth.middleware');

router.use(authenticateToken);

// GET /api/groups
router.get('/', (req, res) => {
  try {
    const groups = GroupService.getGroups();
    return res.json({ groups });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve groups.' });
  }
});

// POST /api/groups
router.post('/', (req, res) => {
  try {
    const group = GroupService.createGroup(req.body);
    return res.status(201).json({ message: 'Group created successfully', group });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/groups/:id
router.get('/:id', (req, res) => {
  try {
    const group = GroupService.getGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    return res.json({ group });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve group.' });
  }
});

// PUT /api/groups/:id
router.put('/:id', (req, res) => {
  try {
    const group = GroupService.updateGroup(req.params.id, req.body);
    return res.json({ message: 'Group updated successfully', group });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', (req, res) => {
  try {
    const result = GroupService.deleteGroup(req.params.id);
    return res.json({ message: 'Group deleted successfully', result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/groups/:id/contacts
router.post('/:id/contacts', (req, res) => {
  try {
    const { contactIds } = req.body;
    const result = GroupService.addContactsToGroup(req.params.id, contactIds);
    return res.json({ message: `Added ${result.addedCount} contacts to group.`, result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
