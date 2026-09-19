const { db } = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function seedDatabase() {
  console.log('🌱 Seeding SendQueue database...');

  // 1. Seed Admin User
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@sendqueue.local');
  if (!existingAdmin) {
    const adminId = uuidv4();
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(adminId, 'SendQueue Admin', 'admin@sendqueue.local', passwordHash, 'admin');
    console.log('  ✔ Created admin account: admin@sendqueue.local (password: admin123)');
  } else {
    console.log('  ℹ Admin account already exists.');
  }

  // 2. Seed Default Groups
  const defaultGroups = [
    { id: uuidv4(), name: 'VIP Clients', description: 'High-value enterprise clients' },
    { id: uuidv4(), name: 'Subscribers', description: 'General newsletter opt-ins' },
    { id: uuidv4(), name: 'Partners', description: 'Business vendors and distribution partners' }
  ];

  for (const group of defaultGroups) {
    const exists = db.prepare('SELECT id FROM groups WHERE name = ?').get(group.name);
    if (!exists) {
      db.prepare('INSERT INTO groups (id, name, description) VALUES (?, ?, ?)').run(group.id, group.name, group.description);
    }
  }
  console.log('  ✔ Default contact groups verified.');

  // 3. Seed Sample Contacts
  const sampleContacts = [
    { email: 'alex.rivera@example.com', first_name: 'Alex', last_name: 'Rivera', company: 'Acme Corp', category: 'Enterprise' },
    { email: 'sarah.connor@cyberdyne.org', first_name: 'Sarah', last_name: 'Connor', company: 'Cyberdyne', category: 'Technology' },
    { email: 'marcus.vance@innovate.io', first_name: 'Marcus', last_name: 'Vance', company: 'InnovateIO', category: 'Startup' }
  ];

  for (const contact of sampleContacts) {
    const exists = db.prepare('SELECT id FROM contacts WHERE email = ?').get(contact.email);
    if (!exists) {
      const contactId = uuidv4();
      db.prepare(`
        INSERT INTO contacts (id, email, first_name, last_name, company, category, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(contactId, contact.email, contact.first_name, contact.last_name, contact.company, contact.category);
    }
  }
  console.log('  ✔ Sample contacts seeded.');

  // 4. Seed Starter Templates
  const starterTemplates = [
    {
      id: uuidv4(),
      name: 'Product Launch Announcement',
      subject: 'Exciting news for {{company | "your business"}}, {{first_name}}!',
      body_html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
  <h2 style="color: #4f46e5;">Hello {{first_name | "there"}},</h2>
  <p>We are thrilled to unveil our latest capabilities tailored specifically for {{company | "forward-thinking teams"}}.</p>
  <p>SendQueue gives you reliable delivery without the headache of manual batching or spam penalties.</p>
  <div style="margin: 25px 0;">
    <a href="https://example.com/demo" style="background: #4f46e5; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Explore the Demo</a>
  </div>
  <p style="font-size: 13px; color: #888;">If you wish to unsubscribe, click <a href="{{unsubscribe_url}}">here</a>.</p>
</div>`,
      body_text: `Hello {{first_name | "there"}},\n\nWe are thrilled to unveil our latest capabilities tailored for {{company | "forward-thinking teams"}}.\n\nVisit: https://example.com/demo\n\nUnsubscribe: {{unsubscribe_url}}`
    }
  ];

  for (const tpl of starterTemplates) {
    const exists = db.prepare('SELECT id FROM templates WHERE name = ?').get(tpl.name);
    if (!exists) {
      db.prepare(`
        INSERT INTO templates (id, name, subject, body_html, body_text)
        VALUES (?, ?, ?, ?, ?)
      `).run(tpl.id, tpl.name, tpl.subject, tpl.body_html, tpl.body_text);
    }
  }
  console.log('  ✔ Starter email template created.');

  // 5. Seed System Settings
  const settings = [
    { key: 'active_provider', value: 'mock' },
    { key: 'default_from_name', value: 'SendQueue Dispatcher' },
    { key: 'default_from_email', value: 'dispatch@sendqueue.local' },
    { key: 'default_rate_limit', value: '5' }
  ];

  for (const s of settings) {
    const exists = db.prepare('SELECT key FROM system_settings WHERE key = ?').get(s.key);
    if (!exists) {
      db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)').run(s.key, s.value);
    }
  }
  console.log('  ✔ Default system settings initialized.');

  console.log('✨ Seeding complete!\n');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
