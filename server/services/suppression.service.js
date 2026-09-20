const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

const SuppressionService = {
  /**
   * Check if a given email is suppressed.
   */
  isSuppressed(email) {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    const row = db.prepare('SELECT id FROM suppression_list WHERE email = ?').get(normalized);
    return !!row;
  },

  /**
   * Add an email to the global suppression list.
   * Reasons: 'unsubscribe', 'hard_bounce', 'complaint', 'manual'
   */
  addSuppressed({ email, reason = 'manual', source_campaign_id = null }) {
    if (!email || !email.includes('@')) {
      throw new Error('Valid email address is required.');
    }
    const normalized = email.trim().toLowerCase();
    const validReasons = ['unsubscribe', 'hard_bounce', 'complaint', 'manual'];
    const finalReason = validReasons.includes(reason) ? reason : 'manual';

    const existing = db.prepare('SELECT id, reason FROM suppression_list WHERE email = ?').get(normalized);
    if (existing) {
      // Update reason and campaign if needed
      db.prepare(`
        UPDATE suppression_list 
        SET reason = ?, source_campaign_id = COALESCE(?, source_campaign_id), created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalReason, source_campaign_id, existing.id);
      return { id: existing.id, email: normalized, reason: finalReason, updated: true };
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO suppression_list (id, email, reason, source_campaign_id, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, normalized, finalReason, source_campaign_id);

    // Also mark any matching contact as suppressed/unsubscribed
    if (finalReason === 'unsubscribe') {
      db.prepare("UPDATE contacts SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP WHERE email = ?").run(normalized);
    } else if (finalReason === 'hard_bounce') {
      db.prepare("UPDATE contacts SET status = 'bounced', updated_at = CURRENT_TIMESTAMP WHERE email = ?").run(normalized);
    } else if (finalReason === 'complaint') {
      db.prepare("UPDATE contacts SET status = 'complained', updated_at = CURRENT_TIMESTAMP WHERE email = ?").run(normalized);
    }

    return { id, email: normalized, reason: finalReason, created: true };
  },

  /**
   * Remove an email from the suppression list (reactivate/unblock).
   */
  removeSuppressed(idOrEmail) {
    if (!idOrEmail) throw new Error('Suppression ID or email is required.');
    
    let result;
    if (idOrEmail.includes('@')) {
      result = db.prepare('DELETE FROM suppression_list WHERE email = ?').run(idOrEmail.trim().toLowerCase());
    } else {
      result = db.prepare('DELETE FROM suppression_list WHERE id = ?').run(idOrEmail);
    }

    if (result.changes === 0) {
      throw new Error('Suppression entry not found.');
    }

    return { success: true, removed: idOrEmail };
  },

  /**
   * Get paginated suppression records with optional search and filter.
   */
  getSuppressed({ page = 1, limit = 20, search = '', reason = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      conditions.push('s.email LIKE ?');
      params.push(`%${search.trim().toLowerCase()}%`);
    }

    if (reason && reason.trim() && reason !== 'all') {
      conditions.push('s.reason = ?');
      params.push(reason.trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM suppression_list s ${whereClause}`).get(...params);
    const total = countRow ? countRow.count : 0;

    const sql = `
      SELECT 
        s.*,
        c.name as source_campaign_name
      FROM suppression_list s
      LEFT JOIN campaigns c ON s.source_campaign_id = c.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const items = db.prepare(sql).all(...params, limitNum, offset);

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  },

  /**
   * Aggregate breakdown statistics by suppression reason.
   */
  getSuppressionStats() {
    const rows = db.prepare(`
      SELECT reason, COUNT(*) as count
      FROM suppression_list
      GROUP BY reason
    `).all();

    const stats = {
      total: 0,
      unsubscribe: 0,
      hard_bounce: 0,
      complaint: 0,
      manual: 0
    };

    for (const r of rows) {
      if (stats.hasOwnProperty(r.reason)) {
        stats[r.reason] = r.count;
      }
      stats.total += r.count;
    }

    return stats;
  }
};

module.exports = SuppressionService;
