async function runTests() {
  console.log('🧪 Starting Phase 4 Automated Verification Tests...\n');

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

  // 2. Fetch Provider Settings
  console.log('2. Fetching provider configuration via GET /api/settings/providers...');
  const settingsRes = await fetch(`${BASE_URL}/api/settings/providers`, { headers: authHeaders });
  const settingsData = await settingsRes.json();
  console.log(`   ✔ Active Provider: "${settingsData.activeProvider}"`);
  console.log(`   ✔ Available Providers (${settingsData.availableProviders.length}): ${settingsData.availableProviders.map(p => p.name).join(', ')}\n`);

  if (!settingsData.availableProviders.some(p => p.id === 'mock')) throw new Error('Mock provider missing');
  if (!settingsData.availableProviders.some(p => p.id === 'resend')) throw new Error('Resend provider missing');
  if (!settingsData.availableProviders.some(p => p.id === 'sendgrid')) throw new Error('SendGrid provider missing');

  // 3. Verify Mock Provider Connection
  console.log('3. Verifying Mock Provider credentials via POST /api/settings/providers/verify...');
  const verifyRes = await fetch(`${BASE_URL}/api/settings/providers/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ providerName: 'mock' })
  });
  const verifyData = await verifyRes.json();
  if (!verifyData.valid) throw new Error(`Mock verification failed: ${verifyData.error}`);
  console.log(`   ✔ Provider verified: ${verifyData.message}\n`);

  // 4. Send Custom Test Email via Active (Mock) Provider
  console.log('4. Dispatching a custom test email via POST /api/settings/test-send...');
  const testRecipient = `test.pilot.${Date.now()}@acme.org`;
  const sendRes = await fetch(`${BASE_URL}/api/settings/test-send`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      to: testRecipient,
      customSubject: 'Delivery Pipeline Test',
      customHtml: '<div style="font-family: sans-serif;"><h2>Delivery Test</h2><p>Multi-provider routing operational.</p></div>'
    })
  });
  const sendData = await sendRes.json();
  if (!sendData.result || !sendData.result.success) throw new Error(`Test send failed: ${sendData.error}`);
  console.log(`   ✔ Test email dispatched: ${sendData.message}`);
  console.log(`   ✔ Message ID: ${sendData.result.messageId} | Provider: ${sendData.result.provider}\n`);

  // 5. Verify Virtual Inbox Capture
  console.log('5. Verifying message capture in Virtual Test Inbox...');
  const inboxRes = await fetch(`${BASE_URL}/api/settings/mock-inbox`, { headers: authHeaders });
  const inboxData = await inboxRes.json();
  const capturedMsg = inboxData.messages.find(m => m.recipient === testRecipient);
  if (!capturedMsg) throw new Error(`Message for ${testRecipient} was not captured in mock inbox!`);
  console.log(`   ✔ Message successfully captured in Virtual Inbox!`);
  console.log(`   ✔ Subject: "${capturedMsg.subject}" | To: ${capturedMsg.recipient} | At: ${capturedMsg.created_at}\n`);

  // 6. Test Sending with Template Token Interpolation
  console.log('6. Testing test-send with an existing template...');
  const templatesRes = await fetch(`${BASE_URL}/api/templates`, { headers: authHeaders });
  const templatesData = await templatesRes.json();
  if (templatesData.templates.length > 0) {
    const tpl = templatesData.templates[0];
    const tplSendRes = await fetch(`${BASE_URL}/api/settings/test-send`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        to: 'vip.partner@domain.com',
        templateId: tpl.id
      })
    });
    const tplSendData = await tplSendRes.json();
    if (!tplSendData.result || !tplSendData.result.success) throw new Error(`Template test send failed: ${tplSendData.error}`);
    console.log(`   ✔ Template test send succeeded with ID: ${tplSendData.result.messageId}\n`);
  }

  // 7. Test Updating Delivery Settings
  console.log('7. Testing updating default sender settings...');
  const updateSettingsRes = await fetch(`${BASE_URL}/api/settings/providers`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      active_provider: 'mock',
      default_from_name: 'SendQueue QA Dispatcher',
      default_from_email: 'qa@sendqueue.local'
    })
  });
  const updateSettingsData = await updateSettingsRes.json();
  if (updateSettingsData.settings.defaultSender.name !== 'SendQueue QA Dispatcher') {
    throw new Error('Sender name update failed to persist');
  }
  console.log(`   ✔ Sender updated to: "${updateSettingsData.settings.defaultSender.name} <${updateSettingsData.settings.defaultSender.email}>"\n`);

  // 8. Verify settings.html Page
  console.log('8. Verifying Settings UI page availability...');
  const pageRes = await fetch(`${BASE_URL}/settings.html`);
  if (pageRes.status !== 200) throw new Error(`settings.html returned status ${pageRes.status}`);
  console.log('   ✔ settings.html loads with HTTP 200 OK.\n');

  console.log('🎉 ALL PHASE 4 AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
