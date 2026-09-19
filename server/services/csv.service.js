const fs = require('fs');
const csv = require('csv-parser');
const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const ContactService = require('./contact.service');

// Fuzzy match header names to standard fields
function detectColumnMapping(headers) {
  const mapping = {
    email: null,
    first_name: null,
    last_name: null,
    company: null,
    category: null
  };

  const headerLower = headers.map(h => ({ raw: h, norm: h.trim().toLowerCase().replace(/[-_]/g, ' ') }));

  for (const h of headerLower) {
    // Email detection
    if (!mapping.email && (h.norm === 'email' || h.norm === 'e mail' || h.norm === 'email address' || h.norm === 'mail' || h.norm === 'recipient')) {
      mapping.email = h.raw;
      continue;
    }
    // First Name
    if (!mapping.first_name && (h.norm === 'first name' || h.norm === 'firstname' || h.norm === 'fname' || h.norm === 'name' || h.norm === 'full name')) {
      mapping.first_name = h.raw;
      continue;
    }
    // Last Name
    if (!mapping.last_name && (h.norm === 'last name' || h.norm === 'lastname' || h.norm === 'lname' || h.norm === 'surname')) {
      mapping.last_name = h.raw;
      continue;
    }
    // Company
    if (!mapping.company && (h.norm === 'company' || h.norm === 'company name' || h.norm === 'org' || h.norm === 'organization' || h.norm === 'business')) {
      mapping.company = h.raw;
      continue;
    }
    // Category
    if (!mapping.category && (h.norm === 'category' || h.norm === 'segment' || h.norm === 'type' || h.norm === 'tier')) {
      mapping.category = h.raw;
      continue;
    }
  }

  return mapping;
}

const CsvService = {
  detectColumnMapping,

  // Parse CSV and return validation preview without modifying database
  async previewCsv(filePath, customMapping = null) {
    return new Promise((resolve, reject) => {
      const rows = [];
      let headers = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('headers', (h) => {
          headers = h;
        })
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', () => {
          try {
            const mapping = customMapping || detectColumnMapping(headers);

            if (!mapping.email) {
              return resolve({
                success: false,
                error: 'Could not detect an Email column in CSV. Please specify column mapping.',
                headers,
                totalRows: rows.length
              });
            }

            // Retrieve existing emails from database for duplicate checking
            const dbEmailsRows = db.prepare('SELECT email FROM contacts').all();
            const dbEmailsSet = new Set(dbEmailsRows.map(r => r.email.toLowerCase()));

            // Retrieve suppression list
            const suppressedRows = db.prepare('SELECT email FROM suppression_list').all();
            const suppressedSet = new Set(suppressedRows.map(r => r.email.toLowerCase()));

            const fileEmailsSeen = new Set();
            const valid = [];
            const invalid = [];
            const duplicates = [];
            const suppressed = [];

            rows.forEach((row, index) => {
              const rawEmail = row[mapping.email];
              const normalizedEmail = (rawEmail || '').trim().toLowerCase();

              // Check syntax
              if (!normalizedEmail || !ContactService.isValidEmail(normalizedEmail)) {
                invalid.push({ row: index + 1, email: rawEmail || '(empty)', reason: 'Invalid email syntax' });
                return;
              }

              // Check in-file duplicate
              if (fileEmailsSeen.has(normalizedEmail)) {
                duplicates.push({ row: index + 1, email: normalizedEmail, reason: 'Duplicate in CSV file' });
                return;
              }
              fileEmailsSeen.add(normalizedEmail);

              // Check suppression list
              if (suppressedSet.has(normalizedEmail)) {
                suppressed.push({ row: index + 1, email: normalizedEmail, reason: 'Suppressed / Unsubscribed' });
                return;
              }

              // Check existing database duplicate
              if (dbEmailsSet.has(normalizedEmail)) {
                duplicates.push({ row: index + 1, email: normalizedEmail, reason: 'Already exists in database' });
                return;
              }

              // Map other attributes
              const contactData = {
                email: normalizedEmail,
                first_name: mapping.first_name ? (row[mapping.first_name] || '').trim() : '',
                last_name: mapping.last_name ? (row[mapping.last_name] || '').trim() : '',
                company: mapping.company ? (row[mapping.company] || '').trim() : '',
                category: mapping.category ? (row[mapping.category] || '').trim() : ''
              };

              valid.push(contactData);
            });

            resolve({
              success: true,
              headers,
              mapping,
              stats: {
                total: rows.length,
                validCount: valid.length,
                invalidCount: invalid.length,
                duplicateCount: duplicates.length,
                suppressedCount: suppressed.length
              },
              sampleValid: valid.slice(0, 5),
              sampleInvalid: invalid.slice(0, 5),
              sampleDuplicates: duplicates.slice(0, 5)
            });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => reject(err));
    });
  },

  // Perform transactional commit of valid contacts
  async commitImport(filePath, mapping, targetGroupId = null) {
    const preview = await this.previewCsv(filePath, mapping);
    if (!preview.success) {
      throw new Error(preview.error || 'Failed to validate CSV file');
    }

    return new Promise((resolve, reject) => {
      const rows = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', () => {
          try {
            // Retrieve existing DB emails
            const dbEmailsRows = db.prepare('SELECT email FROM contacts').all();
            const dbEmailsSet = new Set(dbEmailsRows.map(r => r.email.toLowerCase()));
            const suppressedRows = db.prepare('SELECT email FROM suppression_list').all();
            const suppressedSet = new Set(suppressedRows.map(r => r.email.toLowerCase()));

            const fileEmailsSeen = new Set();
            const contactsToInsert = [];

            for (const row of rows) {
              const rawEmail = row[mapping.email];
              const normalizedEmail = (rawEmail || '').trim().toLowerCase();
              if (!normalizedEmail || !ContactService.isValidEmail(normalizedEmail)) continue;
              if (fileEmailsSeen.has(normalizedEmail)) continue;
              fileEmailsSeen.add(normalizedEmail);
              if (suppressedSet.has(normalizedEmail) || dbEmailsSet.has(normalizedEmail)) continue;

              contactsToInsert.push({
                id: uuidv4(),
                email: normalizedEmail,
                first_name: mapping.first_name ? (row[mapping.first_name] || '').trim() : '',
                last_name: mapping.last_name ? (row[mapping.last_name] || '').trim() : '',
                company: mapping.company ? (row[mapping.company] || '').trim() : '',
                category: mapping.category ? (row[mapping.category] || '').trim() : ''
              });
            }

            // High-speed transaction insertion
            db.exec('BEGIN TRANSACTION;');
            try {
              const insertContact = db.prepare(`
                INSERT INTO contacts (id, email, first_name, last_name, company, category, status)
                VALUES (?, ?, ?, ?, ?, ?, 'active')
              `);

              const insertGroupRel = targetGroupId ? db.prepare(`
                INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)
              `) : null;

              for (const c of contactsToInsert) {
                insertContact.run(c.id, c.email, c.first_name, c.last_name, c.company, c.category);
                if (insertGroupRel) {
                  insertGroupRel.run(c.id, targetGroupId);
                }
              }

              db.exec('COMMIT;');
            } catch (txErr) {
              db.exec('ROLLBACK;');
              throw txErr;
            }

            // Cleanup temp file
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }

            resolve({
              success: true,
              importedCount: contactsToInsert.length,
              targetGroupId
            });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', reject);
    });
  }
};

module.exports = CsvService;
