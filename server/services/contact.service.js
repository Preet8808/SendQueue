const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

// Basic RFC 5322 email regex validator
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

const ContactService = {
  isValidEmail,

  getContacts({ page = 1, limit = 20, search = '', groupId = '', status = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push('(LOWER(c.email) LIKE ? OR LOWER(c.first_name) LIKE ? OR LOWER(c.last_name) LIKE ? OR LOWER(c.company) LIKE ?)');
      params.push(term, term, term, term);
    }

    if (status && status.trim()) {
      conditions.push('c.status = ?');
      params.push(status.trim());
    }

    if (groupId && groupId.trim()) {
      conditions.push('EXISTS (SELECT 1 FROM contact_groups cg WHERE cg.contact_id = c.id AND cg.group_id = ?)');
      params.push(groupId.trim());
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query total count
    const countSql = `SELECT COUNT(*) as total FROM contacts c ${whereClause}`;
    const totalRow = db.prepare(countSql).get(...params);
    const total = totalRow ? totalRow.total : 0;

    // Query contacts with their associated group names
    const querySql = `
      SELECT 
        c.*,
        GROUP_CONCAT(g.name, ', ') as group_names,
        GROUP_CONCAT(g.id, ',') as group_ids
      FROM contacts c
      LEFT JOIN contact_groups cg ON c.id = cg.contact_id
      LEFT JOIN groups g ON cg.group_id = g.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const contacts = db.prepare(querySql).all(...params, limitNum, offset);

    // Parse custom_attributes JSON
    const formatted = contacts.map(contact => ({
      ...contact,
      custom_attributes: contact.custom_attributes ? JSON.parse(contact.custom_attributes) : {},
      groups: contact.group_ids ? contact.group_ids.split(',').map((id, index) => ({
        id,
        name: contact.group_names.split(', ')[index]
      })) : []
    }));

    return {
      contacts: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  },

  getContactById(id) {
    const contact = db.prepare(`
      SELECT 
        c.*,
        GROUP_CONCAT(g.name, ', ') as group_names,
        GROUP_CONCAT(g.id, ',') as group_ids
      FROM contacts c
      LEFT JOIN contact_groups cg ON c.id = cg.contact_id
      LEFT JOIN groups g ON cg.group_id = g.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id);

    if (!contact) return null;

    return {
      ...contact,
      custom_attributes: contact.custom_attributes ? JSON.parse(contact.custom_attributes) : {},
      groups: contact.group_ids ? contact.group_ids.split(',').map((gid, index) => ({
        id: gid,
        name: contact.group_names.split(', ')[index]
      })) : []
    };
  },

  createContact({ email, first_name = '', last_name = '', company = '', category = '', custom_attributes = {}, group_ids = [] }) {
    if (!email || !isValidEmail(email)) {
      throw new Error('Valid email address is required.');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate
    const existing = db.prepare('SELECT id FROM contacts WHERE email = ?').get(normalizedEmail);
    if (existing) {
      throw new Error(`A contact with email "${normalizedEmail}" already exists.`);
    }

    const id = uuidv4();
    const customJson = JSON.stringify(custom_attributes || {});

    db.prepare(`
      INSERT INTO contacts (id, email, first_name, last_name, company, category, custom_attributes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(id, normalizedEmail, first_name.trim(), last_name.trim(), company.trim(), category.trim(), customJson);

    // Assign groups if provided
    if (Array.isArray(group_ids) && group_ids.length > 0) {
      const insertGroup = db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)');
      for (const gid of group_ids) {
        if (gid) insertGroup.run(id, gid);
      }
    }

    return this.getContactById(id);
  },

  updateContact(id, { email, first_name, last_name, company, category, status, custom_attributes, group_ids }) {
    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Contact not found.');
    }

    let normalizedEmail = existing.email;
    if (email && email !== existing.email) {
      if (!isValidEmail(email)) throw new Error('Invalid email address format.');
      normalizedEmail = email.trim().toLowerCase();
      const duplicate = db.prepare('SELECT id FROM contacts WHERE email = ? AND id != ?').get(normalizedEmail, id);
      if (duplicate) throw new Error(`Email "${normalizedEmail}" is already used by another contact.`);
    }

    const updatedFirstName = first_name !== undefined ? first_name.trim() : existing.first_name;
    const updatedLastName = last_name !== undefined ? last_name.trim() : existing.last_name;
    const updatedCompany = company !== undefined ? company.trim() : existing.company;
    const updatedCategory = category !== undefined ? category.trim() : existing.category;
    const updatedStatus = status !== undefined ? status : existing.status;
    const customJson = custom_attributes !== undefined ? JSON.stringify(custom_attributes) : existing.custom_attributes;

    db.prepare(`
      UPDATE contacts 
      SET email = ?, first_name = ?, last_name = ?, company = ?, category = ?, status = ?, custom_attributes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(normalizedEmail, updatedFirstName, updatedLastName, updatedCompany, updatedCategory, updatedStatus, customJson, id);

    // Sync groups if provided
    if (Array.isArray(group_ids)) {
      db.prepare('DELETE FROM contact_groups WHERE contact_id = ?').run(id);
      const insertGroup = db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)');
      for (const gid of group_ids) {
        if (gid) insertGroup.run(id, gid);
      }
    }

    return this.getContactById(id);
  },

  deleteContact(id) {
    const existing = db.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Contact not found.');
    }
    db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    return { success: true, id };
  }
};

module.exports = ContactService;
