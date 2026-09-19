const BaseProvider = require('./base.provider');
const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

// Ensure mock_inbox table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS mock_inbox (
    id TEXT PRIMARY KEY,
    recipient TEXT NOT NULL,
    sender TEXT NOT NULL,
    subject TEXT NOT NULL,
    html TEXT,
    text TEXT,
    headers TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_mock_inbox_created ON mock_inbox(created_at DESC);
`);

class MockProvider extends BaseProvider {
  getName() {
    return 'mock';
  }

  async verifyCredentials() {
    return {
      valid: true,
      message: 'Mock local adapter active. Emails are captured to the Virtual Inbox without external network calls.'
    };
  }

  async sendMail({ to, from, subject, html, text, headers = {}, replyTo }) {
    const id = `mock_${uuidv4()}`;
    const headerJson = JSON.stringify(headers || {});

    // Save to mock_inbox table
    db.prepare(`
      INSERT INTO mock_inbox (id, recipient, sender, subject, html, text, headers, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, to, from, subject, html || '', text || '', headerJson);

    return {
      success: true,
      messageId: id,
      provider: 'mock',
      timestamp: new Date().toISOString()
    };
  }

  getMessages(limit = 50) {
    const rows = db.prepare('SELECT * FROM mock_inbox ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map(r => ({
      ...r,
      headers: r.headers ? JSON.parse(r.headers) : {}
    }));
  }

  clearMessages() {
    db.prepare('DELETE FROM mock_inbox').run();
    return { success: true };
  }
}

module.exports = MockProvider;
