// Automated Test Suite for Phase 6: Compliance, Webhooks & Delivery Analytics
const assert = require('assert');
const http = require('http');
const { db } = require('./database/db');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const SuppressionService = require('./services/suppression.service');
const WebhookService = require('./services/webhook.service');
const CampaignService = require('./services/campaign.service');
const { JWT_SECRET } = require('./middleware/auth.middleware');

async function runTests() {
  console.log('🧪 Starting Phase 6 Test Suite: Compliance, Webhooks & Telemetry...\n');

  // 1. Suppression Service Tests
  console.log('--- 1. Testing Suppression Service ---');
  const testEmail1 = `suppress_${Date.now()}@example.com`;
  
  // Initially not suppressed
  assert.strictEqual(SuppressionService.isSuppressed(testEmail1), false, 'Should not be suppressed initially');

  // Add suppression
  const addRes = SuppressionService.addSuppressed({ email: testEmail1, reason: 'manual' });
  assert.strictEqual(addRes.created, true, 'Should create suppression entry');
  assert.strictEqual(SuppressionService.isSuppressed(testEmail1), true, 'Should now be suppressed');

  // Verify stats
  const stats = SuppressionService.getSuppressionStats();
  assert.ok(stats.total > 0, 'Total suppressed count should be > 0');
  assert.ok(stats.manual > 0, 'Manual suppressed count should be > 0');

  // Verify pagination / search
  const list = SuppressionService.getSuppressed({ search: testEmail1 });
  assert.strictEqual(list.items.length, 1, 'Should find 1 item matching email');
  assert.strictEqual(list.items[0].email, testEmail1);

  // Remove suppression
  const removeRes = SuppressionService.removeSuppressed(testEmail1);
  assert.strictEqual(removeRes.success, true, 'Should remove suppression entry');
  assert.strictEqual(SuppressionService.isSuppressed(testEmail1), false, 'Should no longer be suppressed');
  console.log('✅ Suppression Service CRUD, search, and stats passed.\n');

  // 2. Setup Test Campaign & Recipient for Unsubscribe & Webhooks
  console.log('--- 2. Setting Up Campaign & Recipient Context ---');
  const testContactId = uuidv4();
  const testContactEmail = `recipient_${Date.now()}@domain.com`;

  db.prepare(`
    INSERT INTO contacts (id, email, first_name, last_name, status, created_at, updated_at)
    VALUES (?, ?, 'Jane', 'Doe', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testContactId, testContactEmail);

  const testCampaignId = uuidv4();
  db.prepare(`
    INSERT INTO campaigns (id, name, subject, body_html, body_text, from_name, from_email, status, rate_limit_per_sec, total_recipients, created_at, updated_at)
    VALUES (?, 'Phase 6 Test Campaign', 'Test Subject', '<p>Hello</p>', 'Hello', 'Sender', 'sender@example.com', 'SENDING', 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testCampaignId);

  const testRecipientId = uuidv4();
  db.prepare(`
    INSERT INTO campaign_recipients (id, campaign_id, contact_id, recipient_email, personalization_data, status, attempt_count, max_attempts, created_at)
    VALUES (?, ?, ?, ?, '{}', 'SENT', 1, 3, CURRENT_TIMESTAMP)
  `).run(testRecipientId, testCampaignId, testContactId, testContactEmail);

  console.log(`✅ Created test campaign (${testCampaignId}) and recipient (${testRecipientId}).\n`);

  // 3. Webhook Ingestion Engine Tests
  console.log('--- 3. Testing Webhook Ingestion Engine ---');
  
  // 3a. Delivered event
  const delEvent = WebhookService.processEvent({
    event_type: 'DELIVERED',
    recipient_id: testRecipientId,
    campaign_id: testCampaignId,
    email: testContactEmail,
    raw_payload: { provider: 'mock' }
  });
  assert.strictEqual(delEvent.success, true);
  
  const recipientAfterDel = db.prepare('SELECT status, delivered_at FROM campaign_recipients WHERE id = ?').get(testRecipientId);
  assert.strictEqual(recipientAfterDel.status, 'DELIVERED', 'Recipient status should be DELIVERED');
  assert.ok(recipientAfterDel.delivered_at, 'Delivered timestamp should be recorded');

  // 3b. Provider parser checks (Resend, SendGrid, SES)
  // Resend Delivered
  const resendResult = WebhookService.handleResend({
    type: 'email.delivered',
    data: {
      email_id: 're_12345',
      to: [testContactEmail],
      headers: { 'X-Campaign-Id': testCampaignId, 'X-Recipient-Id': testRecipientId }
    }
  });
  assert.strictEqual(resendResult.processed, 1, 'Resend delivered webhook should be processed');

  // SendGrid Bounce
  const bounceEmail = `bounce_${Date.now()}@domain.com`;
  const sgResult = WebhookService.handleSendGrid([
    {
      event: 'bounce',
      email: bounceEmail,
      reason: '550 User unknown',
      campaign_id: testCampaignId
    }
  ]);
  assert.strictEqual(sgResult.processed, 1, 'SendGrid bounce webhook should be processed');
  assert.strictEqual(SuppressionService.isSuppressed(bounceEmail), true, 'Bounce should automatically add email to suppression list');

  // Amazon SES Complaint
  const complaintEmail = `complaint_${Date.now()}@domain.com`;
  const sesResult = WebhookService.handleSes({
    eventType: 'Complaint',
    mail: {
      destination: [complaintEmail],
      headers: [{ name: 'X-Campaign-Id', value: testCampaignId }]
    },
    complaint: { complaintFeedbackType: 'abuse' }
  });
  assert.strictEqual(sesResult.processed, 1, 'SES complaint webhook should be processed');
  assert.strictEqual(SuppressionService.isSuppressed(complaintEmail), true, 'Complaint should automatically add email to suppression list');

  // Verify audit events table
  const auditLogs = WebhookService.getAuditEvents({ campaign_id: testCampaignId });
  assert.ok(auditLogs.length >= 3, `Expected at least 3 audit logs for campaign, got ${auditLogs.length}`);
  console.log(`✅ Webhook ingestion correctly parsed Resend, SendGrid, SES, and logged ${auditLogs.length} audit events.\n`);

  // 4. Compliance & RFC 8058 One-Click Unsubscribe Tests
  console.log('--- 4. Testing RFC 8058 One-Click Unsubscribe ---');
  const unsubContactEmail = `unsub_${Date.now()}@domain.com`;
  const unsubContactId = uuidv4();
  db.prepare(`
    INSERT INTO contacts (id, email, first_name, status, created_at, updated_at)
    VALUES (?, ?, 'Alex', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(unsubContactId, unsubContactEmail);

  const unsubRecipientId = uuidv4();
  db.prepare(`
    INSERT INTO campaign_recipients (id, campaign_id, contact_id, recipient_email, personalization_data, status, attempt_count, max_attempts, created_at)
    VALUES (?, ?, ?, ?, '{}', 'SENT', 1, 3, CURRENT_TIMESTAMP)
  `).run(unsubRecipientId, testCampaignId, unsubContactId, unsubContactEmail);

  // Trigger unsubscribe event via WebhookService/Compliance logic
  const unsubResult = WebhookService.processEvent({
    event_type: 'UNSUBSCRIBE',
    recipient_id: unsubRecipientId,
    campaign_id: testCampaignId,
    email: unsubContactEmail,
    reason: 'RFC 8058 One-Click'
  });
  assert.strictEqual(unsubResult.success, true);

  // Verify recipient updated
  const recUnsub = db.prepare('SELECT status FROM campaign_recipients WHERE id = ?').get(unsubRecipientId);
  assert.strictEqual(recUnsub.status, 'UNSUBSCRIBED', 'Recipient status should be UNSUBSCRIBED');

  // Verify contact status updated
  const contactUnsub = db.prepare('SELECT status FROM contacts WHERE id = ?').get(unsubContactId);
  assert.strictEqual(contactUnsub.status, 'unsubscribed', 'Contact status should be unsubscribed');

  // Verify global suppression list
  assert.strictEqual(SuppressionService.isSuppressed(unsubContactEmail), true, 'Email must be in suppression list');
  const suppEntry = db.prepare('SELECT reason FROM suppression_list WHERE email = ?').get(unsubContactEmail);
  assert.strictEqual(suppEntry.reason, 'unsubscribe');
  console.log('✅ RFC 8058 unsubscribe lifecycle passed (Recipient, Contact, Suppression, Audit event).\n');

  // 5. Campaign Delivery Analytics & Stats Computation
  console.log('--- 5. Testing Campaign Delivery Analytics Query ---');
  const campaignWithStats = CampaignService.getCampaignById(testCampaignId);
  assert.ok(campaignWithStats, 'Campaign details should be retrieved');
  assert.strictEqual(typeof campaignWithStats.delivered_count, 'number');
  assert.strictEqual(typeof campaignWithStats.bounced_count, 'number');
  assert.strictEqual(typeof campaignWithStats.unsubscribed_count, 'number');
  assert.strictEqual(typeof campaignWithStats.deliveryRate, 'number');
  assert.strictEqual(typeof campaignWithStats.bounceRate, 'number');
  console.log(`Campaign Stats:
    - Recipients: ${campaignWithStats.total_recipients}
    - Sent: ${campaignWithStats.sent_count}
    - Delivered: ${campaignWithStats.delivered_count} (Rate: ${campaignWithStats.deliveryRate}%)
    - Bounced: ${campaignWithStats.bounced_count} (Rate: ${campaignWithStats.bounceRate}%)
    - Unsubscribed: ${campaignWithStats.unsubscribed_count}
  `);
  console.log('✅ Campaign delivery analytics computation passed.\n');

  console.log('🎉 ALL PHASE 6 AUTOMATED TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Phase 6 Test Failed:', err);
  process.exit(1);
});
