const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const ContactService = require('../services/contact.service');
const CsvService = require('../services/csv.service');
const { authenticateToken } = require('../middleware/auth.middleware');

// Multer storage for CSV uploads
const uploadDir = path.resolve(__dirname, '../../storage/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `import_${Date.now()}_${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || ext === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are supported.'));
    }
  }
});

// All contact endpoints require authentication
router.use(authenticateToken);

// GET /api/contacts
router.get('/', (req, res) => {
  try {
    const { page, limit, search, groupId, status } = req.query;
    const result = ContactService.getContacts({ page, limit, search, groupId, status });
    return res.json(result);
  } catch (err) {
    console.error('Fetch contacts error:', err);
    return res.status(500).json({ error: 'Failed to retrieve contacts.' });
  }
});

// POST /api/contacts
router.post('/', (req, res) => {
  try {
    const contact = ContactService.createContact(req.body);
    return res.status(201).json({ message: 'Contact created successfully', contact });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/contacts/:id
router.get('/:id', (req, res) => {
  try {
    const contact = ContactService.getContactById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found.' });
    return res.json({ contact });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve contact details.' });
  }
});

// PUT /api/contacts/:id
router.put('/:id', (req, res) => {
  try {
    const updated = ContactService.updateContact(req.params.id, req.body);
    return res.json({ message: 'Contact updated successfully', contact: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', (req, res) => {
  try {
    const result = ContactService.deleteContact(req.params.id);
    return res.json({ message: 'Contact deleted successfully', result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/contacts/import-preview
router.post('/import-preview', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded.' });
  }

  try {
    const preview = await CsvService.previewCsv(req.file.path);
    return res.json({
      fileId: req.file.filename,
      fileName: req.file.originalname,
      ...preview
    });
  } catch (err) {
    // Delete file if parsing failed
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `CSV Parsing error: ${err.message}` });
  }
});

// POST /api/contacts/import-commit
router.post('/import-commit', async (req, res) => {
  const { fileId, mapping, targetGroupId } = req.body;

  if (!fileId || !mapping || !mapping.email) {
    return res.status(400).json({ error: 'Missing fileId or valid column mapping.' });
  }

  const filePath = path.join(uploadDir, path.basename(fileId));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Uploaded file has expired or was not found. Please upload again.' });
  }

  try {
    const result = await CsvService.commitImport(filePath, mapping, targetGroupId);
    return res.json({
      message: `Successfully imported ${result.importedCount} contacts.`,
      result
    });
  } catch (err) {
    console.error('Import commit error:', err);
    return res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

module.exports = router;
