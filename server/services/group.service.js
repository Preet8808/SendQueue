const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

const GroupService = {
  getGroups() {
    const groups = db.prepare(`
      SELECT 
        g.*,
        COUNT(cg.contact_id) as contact_count
      FROM groups g
      LEFT JOIN contact_groups cg ON g.id = cg.group_id
      GROUP BY g.id
      ORDER BY g.name ASC
    `).all();

    return groups;
  },

  getGroupById(id) {
    const group = db.prepare(`
      SELECT 
        g.*,
        COUNT(cg.contact_id) as contact_count
      FROM groups g
      LEFT JOIN contact_groups cg ON g.id = cg.group_id
      WHERE g.id = ?
      GROUP BY g.id
    `).get(id);

    return group || null;
  },

  createGroup({ name, description = '' }) {
    if (!name || !name.trim()) {
      throw new Error('Group name is required.');
    }

    const trimmedName = name.trim();
    const existing = db.prepare('SELECT id FROM groups WHERE LOWER(name) = ?').get(trimmedName.toLowerCase());
    if (existing) {
      throw new Error(`A group with name "${trimmedName}" already exists.`);
    }

    const id = uuidv4();
    db.prepare('INSERT INTO groups (id, name, description) VALUES (?, ?, ?)').run(id, trimmedName, (description || '').trim());
    return this.getGroupById(id);
  },

  updateGroup(id, { name, description }) {
    const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Group not found.');
    }

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedDesc = description !== undefined ? description.trim() : existing.description;

    if (!updatedName) {
      throw new Error('Group name cannot be empty.');
    }

    const duplicate = db.prepare('SELECT id FROM groups WHERE LOWER(name) = ? AND id != ?').get(updatedName.toLowerCase(), id);
    if (duplicate) {
      throw new Error(`A group with name "${updatedName}" already exists.`);
    }

    db.prepare('UPDATE groups SET name = ?, description = ? WHERE id = ?').run(updatedName, updatedDesc, id);
    return this.getGroupById(id);
  },

  deleteGroup(id) {
    const existing = db.prepare('SELECT id FROM groups WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Group not found.');
    }

    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    return { success: true, id };
  },

  addContactsToGroup(groupId, contactIds = []) {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found.');

    const insertStmt = db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)');
    let added = 0;

    for (const cid of contactIds) {
      if (cid) {
        insertStmt.run(cid, groupId);
        added++;
      }
    }

    return { success: true, addedCount: added };
  }
};

module.exports = GroupService;
