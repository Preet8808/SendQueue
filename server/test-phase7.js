// Automated Test Suite for Phase 7: Frontend Polish, Live Telemetry & Production Hardening
const assert = require('assert');
const { createRateLimiter } = require('./middleware/rate-limiter.middleware');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Starting Phase 7 Test Suite: Polish, Telemetry & Hardening...\n');

  // 1. Verify Public System Health Telemetry Endpoint
  console.log('--- 1. Testing GET /api/health Telemetry ---');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Health check should return 200 OK');
  const healthData = await healthRes.json();

  assert.strictEqual(healthData.status, 'healthy');
  assert.strictEqual(healthData.database, 'connected');
  assert.strictEqual(typeof healthData.worker.running, 'boolean');
  assert.strictEqual(typeof healthData.system.memory.heapUsedMb, 'number');
  assert.ok(healthData.system.memory.heapUsedMb > 0);
  assert.strictEqual(typeof healthData.system.uptimeSec, 'number');
  assert.ok(healthData.provider.active, 'Active provider should be reported');

  console.log(`✅ /api/health verified:
    - Status: ${healthData.status}
    - Database: ${healthData.database}
    - Active Provider: ${healthData.provider.active}
    - Heap Memory: ${healthData.system.memory.heapUsedMb} MB
    - Worker Running: ${healthData.worker.running}
  `);

  // 2. Authenticate and Test System Stats API
  console.log('--- 2. Testing Enriched GET /api/stats ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sendqueue.local', password: 'admin123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert.ok(token, 'Admin should receive valid JWT');

  const statsRes = await fetch(`${BASE_URL}/api/stats`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(statsRes.status, 200);
  const statsData = await statsRes.json();
  const s = statsData.stats;

  assert.strictEqual(typeof s.contacts, 'number');
  assert.strictEqual(typeof s.totalContacts, 'number');
  assert.strictEqual(typeof s.groups, 'number');
  assert.strictEqual(typeof s.templates, 'number');
  assert.strictEqual(typeof s.campaigns, 'number');
  assert.strictEqual(typeof s.suppressed, 'number');
  assert.ok(s.queue, 'Queue stats object should exist');
  assert.strictEqual(typeof s.queue.deliveryRate, 'number');
  assert.strictEqual(typeof s.queue.bounceRate, 'number');
  assert.ok(Array.isArray(s.recentCampaigns), 'Recent campaigns array should exist');

  console.log(`✅ /api/stats verified:
    - Active Contacts: ${s.contacts} (Total: ${s.totalContacts})
    - Groups: ${s.groups} | Templates: ${s.templates} | Campaigns: ${s.campaigns}
    - Suppressed Addresses: ${s.suppressed}
    - Overall Delivery Rate: ${s.queue.deliveryRate}% | Bounce Rate: ${s.queue.bounceRate}%
    - Recent Campaigns Tracked: ${s.recentCampaigns.length}
  `);

  // 3. Testing Sliding Window Rate Limiting Logic
  console.log('--- 3. Testing Sliding-Window Rate Limiting Middleware ---');
  const testLimiter = createRateLimiter({
    windowMs: 5000,
    max: 3,
    message: 'Test rate limit exceeded'
  });

  const fakeReq = {
    headers: {},
    socket: { remoteAddress: '192.168.1.99' },
    baseUrl: '/test-route'
  };

  let hitCount = 0;
  let blockedCount = 0;

  for (let i = 0; i < 5; i++) {
    const fakeRes = {
      headers: {},
      statusCode: 200,
      setHeader(name, val) { this.headers[name] = val; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; }
    };

    let nextCalled = false;
    testLimiter(fakeReq, fakeRes, () => { nextCalled = true; });

    if (nextCalled) {
      hitCount++;
    } else if (fakeRes.statusCode === 429) {
      blockedCount++;
      assert.ok(fakeRes.headers['Retry-After']);
      assert.strictEqual(fakeRes.body.error, 'Test rate limit exceeded');
    }
  }

  assert.strictEqual(hitCount, 3, 'Expected exactly 3 allowed hits');
  assert.strictEqual(blockedCount, 2, 'Expected exactly 2 throttled requests (HTTP 429)');
  console.log(`✅ Rate Limiter properly allowed 3 requests and blocked ${blockedCount} requests with HTTP 429 & Retry-After header.\n`);

  // 4. Testing Static Assets & Theme Script Delivery
  console.log('--- 4. Testing Static Theme & Webpage Assets ---');
  const themeRes = await fetch(`${BASE_URL}/js/theme.js`);
  assert.strictEqual(themeRes.status, 200, 'theme.js should be served');
  const themeText = await themeRes.text();
  assert.ok(themeText.includes('sendqueue_theme'));

  const indexRes = await fetch(`${BASE_URL}/index.html`);
  assert.strictEqual(indexRes.status, 200, 'index.html should be served');
  const indexText = await indexRes.text();
  assert.ok(indexText.includes('theme-toggle-btn'), 'index.html should have theme toggle button');
  assert.ok(indexText.includes('All 7 Phases Complete'), 'index.html should show all 7 phases complete');

  console.log('✅ Theme script and updated index.html successfully served.\n');

  console.log('🎉 ALL PHASE 7 AUTOMATED TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Phase 7 Test Failed:', err);
  process.exit(1);
});
