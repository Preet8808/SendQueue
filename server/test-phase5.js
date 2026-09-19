const TokenBucketRateLimiter = require('./queue/rate.limiter');
const { db } = require('./database/db');
const queueWorker = require('./queue/queue.worker');
const { v4: uuidv4 } = require('uuid');

async function runTests() {
  console.log('🧪 Starting Phase 5 Automated Verification Tests...\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Authenticate
  console.log('1. Authenticating as admin...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sendqueue.local', password: 'admin123' })
  });
  const loginData = await loginRes.json();
  if (!loginData.token) throw new Error('Authentication failed');
  const token = loginData.token;
  console.log('   ✔ Token received.\n');

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Unit Testing TokenBucketRateLimiter
  console.log('2. Unit testing TokenBucketRateLimiter timing accuracy...');
  const fastLimiter = new TokenBucketRateLimiter(20, 20);
  const startFast = Date.now();
  for (let i = 0; i < 5; i++) {
    await fastLimiter.acquireToken();
  }
  const elapsedFast = Date.now() - startFast;
  console.log(`   ✔ Consumed 5 burst tokens in ${elapsedFast}ms (immediate resolution).`);

  const throttledLimiter = new TokenBucketRateLimiter(2, 1);
  await throttledLimiter.acquireToken(); // consumes initial burst token
  const startThrottle = Date.now();
  await throttledLimiter.acquireToken(); // should wait ~500ms
  const elapsedThrottle = Date.now() - startThrottle;
  console.log(`   ✔ Throttled token acquisition required ${elapsedThrottle}ms (rate limit pacing confirmed).\n`);
  if (elapsedThrottle < 350) throw new Error('Rate limiter pacing was too fast!');

  // 3. Campaign Creation & Queue Ingestion
  console.log('3. Creating and enqueuing test campaign via POST /api/campaigns...');
  const createCampaignRes = await fetch(`${BASE_URL}/api/campaigns`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: `Automated Queue Run ${Date.now()}`,
      subject: 'Hello {{first_name | "there"}}, exclusive briefing for {{company}}',
      body_html: '<p>Dear {{first_name | "Partner"}}, here is your briefing for {{company}}.</p>',
      body_text: 'Dear {{first_name | "Partner"}}, briefing for {{company}}.',
      rate_limit_per_sec: 10
    })
  });
  const createCampaignData = await createCampaignRes.json();
  if (createCampaignRes.status !== 201) throw new Error(`Create campaign failed: ${createCampaignData.error}`);
  const campaignId = createCampaignData.campaign.id;
  console.log(`   ✔ Campaign created: "${createCampaignData.campaign.name}" (ID: ${campaignId})`);
  console.log(`   ✔ Total Recipients Enqueued: ${createCampaignData.campaign.total_recipients}\n`);

  // 4. Verify Personalization Snapshot
  console.log('4. Inspecting enqueued recipient records and personalization snapshots...');
  const recipientsRes = await fetch(`${BASE_URL}/api/campaigns/${campaignId}/recipients`, { headers: authHeaders });
  const recipientsData = await recipientsRes.json();
  if (recipientsData.recipients.length === 0) throw new Error('No recipients found in queue!');
  const firstRec = recipientsData.recipients[0];
  console.log(`   ✔ Sample Recipient: ${firstRec.recipient_email} | Snapshot:`, firstRec.personalization_data);
  console.log(`   ✔ Initial Queue Status: ${firstRec.status}\n`);

  // 5. Poll until Campaign reaches COMPLETED
  console.log('5. Monitoring queue execution until completion...');
  let isCompleted = false;
  let attempts = 0;
  while (!isCompleted && attempts < 25) {
    await new Promise(r => setTimeout(r, 600));
    attempts++;
    const statusRes = await fetch(`${BASE_URL}/api/campaigns/${campaignId}`, { headers: authHeaders });
    const statusData = await statusRes.json();
    const c = statusData.campaign;
    console.log(`   [Tick ${attempts}] Status: ${c.status} | Progress: ${c.sent_count} / ${c.total_recipients} sent (${c.progressPercent}%)`);
    if (c.status === 'COMPLETED' || (c.sent_count + c.failed_count >= c.total_recipients)) {
      isCompleted = true;
      console.log('   ✔ All campaign recipients successfully reached terminal state!\n');
    }
  }
  if (!isCompleted) throw new Error('Campaign timed out before completing!');

  // 6. Test Pause and Resume
  console.log('6. Testing Campaign Pause and Resume controls...');
  const slowCampaignRes = await fetch(`${BASE_URL}/api/campaigns`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: `Pause Test ${Date.now()}`,
      subject: 'Pause Test',
      body_html: '<p>Pause test body</p>',
      rate_limit_per_sec: 1
    })
  });
  const slowCampaignData = await slowCampaignRes.json();
  const slowId = slowCampaignData.campaign.id;

  // Pause
  const pauseRes = await fetch(`${BASE_URL}/api/campaigns/${slowId}/pause`, { method: 'POST', headers: authHeaders });
  const pauseData = await pauseRes.json();
  if (pauseData.campaign.status !== 'PAUSED') throw new Error('Pause failed');
  console.log(`   ✔ Campaign ${slowId} successfully PAUSED.`);

  // Resume
  const resumeRes = await fetch(`${BASE_URL}/api/campaigns/${slowId}/resume`, { method: 'POST', headers: authHeaders });
  const resumeData = await resumeRes.json();
  if (resumeData.campaign.status !== 'SENDING') throw new Error('Resume failed');
  console.log(`   ✔ Campaign ${slowId} successfully RESUMED.\n`);

  // 7. Crash Recovery Simulation
  console.log('7. Testing Crash Recovery of orphaned SENDING jobs...');
  const fakeRecipientId = uuidv4();
  db.prepare(`
    INSERT INTO campaign_recipients (id, campaign_id, recipient_email, status, attempt_count, max_attempts)
    VALUES (?, ?, 'orphan@crash.test', 'SENDING', 0, 3)
  `).run(fakeRecipientId, slowId);

  // Trigger crash recovery
  queueWorker.recoverStaleSendingJobs();
  const orphanCheck = db.prepare('SELECT status FROM campaign_recipients WHERE id = ?').get(fakeRecipientId);
  if (orphanCheck.status !== 'PENDING') throw new Error(`Orphan job status expected PENDING, got ${orphanCheck.status}`);
  console.log('   ✔ Crash recovery verified: Stale job in SENDING safely reverted back to PENDING.\n');

  // Clean up orphan test row
  db.prepare('DELETE FROM campaign_recipients WHERE id = ?').run(fakeRecipientId);

  // 8. Verify campaigns.html UI Page
  console.log('8. Verifying Campaigns UI page availability...');
  const pageRes = await fetch(`${BASE_URL}/campaigns.html`);
  if (pageRes.status !== 200) throw new Error(`campaigns.html returned status ${pageRes.status}`);
  console.log('   ✔ campaigns.html loads with HTTP 200 OK.\n');

  console.log('🎉 ALL PHASE 5 AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
