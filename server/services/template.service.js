const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

// Regex to capture: {{ variable }} or {{ variable | "default value" }} or {{ variable | 'default value' }}
const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_]+)(?:\s*\|\s*["']([^"']*)["'])?\s*\}\}/g;

function extractTokens(text) {
  if (!text || typeof text !== 'string') return [];
  const tokens = new Set();
  let match;
  const regex = new RegExp(TOKEN_REGEX);
  while ((match = regex.exec(text)) !== null) {
    tokens.add(match[1]);
  }
  return Array.from(tokens);
}

function interpolate(text, contact = {}, systemData = {}) {
  if (!text || typeof text !== 'string') return '';

  return text.replace(TOKEN_REGEX, (fullMatch, key, fallback) => {
    // 1. Check system properties
    if (key === 'unsubscribe_url') {
      return systemData.unsubscribe_url || 'https://sendqueue.local/unsubscribe?preview=true';
    }
    if (key === 'current_year') {
      return String(new Date().getFullYear());
    }

    // 2. Check standard contact properties
    if (contact[key] !== undefined && contact[key] !== null && String(contact[key]).trim() !== '') {
      return String(contact[key]).trim();
    }

    // 3. Check custom attributes
    if (contact.custom_attributes && typeof contact.custom_attributes === 'object') {
      if (contact.custom_attributes[key] !== undefined && contact.custom_attributes[key] !== null && String(contact.custom_attributes[key]).trim() !== '') {
        return String(contact.custom_attributes[key]).trim();
      }
    }

    // 4. Return fallback if provided, otherwise empty string
    return fallback !== undefined ? fallback : '';
  });
}

function renderTemplate({ subject = '', body_html = '', body_text = '' }, contact = {}, systemData = {}) {
  return {
    subject: interpolate(subject, contact, systemData),
    body_html: interpolate(body_html, contact, systemData),
    body_text: interpolate(body_text, contact, systemData)
  };
}

const TemplateService = {
  extractTokens,
  interpolate,
  renderTemplate,

  getTemplates() {
    const templates = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all();
    return templates.map(t => ({
      ...t,
      tokens: extractTokens(`${t.subject} ${t.body_html} ${t.body_text || ''}`)
    }));
  },

  getTemplateById(id) {
    const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!t) return null;
    return {
      ...t,
      tokens: extractTokens(`${t.subject} ${t.body_html} ${t.body_text || ''}`)
    };
  },

  createTemplate({ name, subject, body_html, body_text = '' }) {
    if (!name || !name.trim()) throw new Error('Template name is required.');
    if (!subject || !subject.trim()) throw new Error('Subject line is required.');
    if (!body_html || !body_html.trim()) throw new Error('HTML body is required.');

    const id = uuidv4();
    const cleanName = name.trim();
    const cleanSubject = subject.trim();
    const cleanHtml = body_html.trim();
    const cleanText = body_text ? body_text.trim() : '';

    db.prepare(`
      INSERT INTO templates (id, name, subject, body_html, body_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(id, cleanName, cleanSubject, cleanHtml, cleanText);

    return this.getTemplateById(id);
  },

  updateTemplate(id, { name, subject, body_html, body_text }) {
    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!existing) throw new Error('Template not found.');

    const cleanName = name !== undefined ? name.trim() : existing.name;
    const cleanSubject = subject !== undefined ? subject.trim() : existing.subject;
    const cleanHtml = body_html !== undefined ? body_html.trim() : existing.body_html;
    const cleanText = body_text !== undefined ? body_text.trim() : existing.body_text;

    if (!cleanName) throw new Error('Template name is required.');
    if (!cleanSubject) throw new Error('Subject line is required.');
    if (!cleanHtml) throw new Error('HTML body is required.');

    db.prepare(`
      UPDATE templates
      SET name = ?, subject = ?, body_html = ?, body_text = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cleanName, cleanSubject, cleanHtml, cleanText, id);

    return this.getTemplateById(id);
  },

  deleteTemplate(id) {
    const existing = db.prepare('SELECT id FROM templates WHERE id = ?').get(id);
    if (!existing) throw new Error('Template not found.');

    db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return { success: true, id };
  },

  cloneTemplate(id) {
    const original = this.getTemplateById(id);
    if (!original) throw new Error('Template not found.');

    const cloneName = `${original.name} (Copy)`;
    return this.createTemplate({
      name: cloneName,
      subject: original.subject,
      body_html: original.body_html,
      body_text: original.body_text
    });
  }
};

module.exports = TemplateService;
