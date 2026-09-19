const TemplateService = require('./services/template.service');

async function runTests() {
  console.log('🧪 Starting Phase 3 Automated Verification Tests...\n');

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

  // 2. Unit Testing: Dynamic Token & Fallback Engine
  console.log('2. Unit testing token parsing and smart fallbacks...');
  const testInput = "Hello {{first_name | 'valued friend'}}, your license for {{company | 'your business'}} is active for {{current_year}}!";
  
  // Case A: Full contact data
  const contactFull = { first_name: 'Sarah', last_name: 'Connor', company: 'Cyberdyne', email: 'sarah@cyberdyne.org' };
  const renderedFull = TemplateService.interpolate(testInput, contactFull, {});
  const expectedYear = new Date().getFullYear();
  if (renderedFull !== `Hello Sarah, your license for Cyberdyne is active for ${expectedYear}!`) {
    throw new Error(`Token interpolation with data failed: got "${renderedFull}"`);
  }
  console.log('   ✔ Case A passed: Tokens properly replaced with contact attributes.');

  // Case B: Blank/missing attributes triggering fallbacks
  const contactEmpty = { first_name: '', company: null };
  const renderedFallback = TemplateService.interpolate(testInput, contactEmpty, {});
  if (renderedFallback !== `Hello valued friend, your license for your business is active for ${expectedYear}!`) {
    throw new Error(`Fallback interpolation failed: got "${renderedFallback}"`);
  }
  console.log('   ✔ Case B passed: Missing attributes gracefully substituted by fallback defaults.\n');

  // 3. Fetch Templates API
  console.log('3. Fetching templates via API...');
  const listRes = await fetch(`${BASE_URL}/api/templates`, { headers: authHeaders });
  const listData = await listRes.json();
  console.log(`   ✔ Retrieved ${listData.templates.length} templates.\n`);

  // 4. Create Template API
  console.log('4. Creating a new template via POST /api/templates...');
  const createRes = await fetch(`${BASE_URL}/api/templates`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: `Automated Test Template ${Date.now()}`,
      subject: 'Exclusive update for {{company | "your firm"}}, {{first_name}}',
      body_html: '<div><h1>Hello {{first_name | "there"}}</h1><p>Check: <a href="{{unsubscribe_url}}">Unsubscribe</a></p></div>',
      body_text: 'Hello {{first_name | "there"}}\nUnsubscribe: {{unsubscribe_url}}'
    })
  });
  const createData = await createRes.json();
  if (createRes.status !== 201) throw new Error(`Create template failed: ${createData.error}`);
  const templateId = createData.template.id;
  console.log(`   ✔ Template created: "${createData.template.name}" (ID: ${templateId})`);
  console.log(`   ✔ Detected Tokens: ${JSON.stringify(createData.template.tokens)}\n`);

  // 5. Test Live Preview Endpoint (POST /api/templates/preview)
  console.log('5. Testing live preview resolution API...');
  const previewRes = await fetch(`${BASE_URL}/api/templates/preview`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      subject: 'Special proposal for {{company | "your team"}}, {{first_name}}',
      body_html: '<p>Dear {{first_name | "partner"}}, we see you work with {{company | "leading brands"}}.</p>',
      body_text: 'Dear {{first_name | "partner"}}, we see you work with {{company | "leading brands"}}.',
      customContact: { first_name: 'Marcus', company: 'InnovateIO' }
    })
  });
  const previewData = await previewRes.json();
  if (previewRes.status !== 200) throw new Error(`Preview failed: ${previewData.error}`);
  if (previewData.rendered.subject !== 'Special proposal for InnovateIO, Marcus') {
    throw new Error(`Preview subject mismatch: got "${previewData.rendered.subject}"`);
  }
  if (!previewData.rendered.body_html.includes('Dear Marcus, we see you work with InnovateIO.')) {
    throw new Error(`Preview body mismatch: got "${previewData.rendered.body_html}"`);
  }
  console.log('   ✔ Live preview rendered accurately in real-time with sample contact data.\n');

  // 6. Test Template Clone API
  console.log('6. Testing template duplication (clone)...');
  const cloneRes = await fetch(`${BASE_URL}/api/templates/${templateId}/clone`, {
    method: 'POST',
    headers: authHeaders
  });
  const cloneData = await cloneRes.json();
  if (cloneRes.status !== 201) throw new Error(`Clone failed: ${cloneData.error}`);
  console.log(`   ✔ Cloned template created: "${cloneData.template.name}" (ID: ${cloneData.template.id})\n`);

  // 7. Cleanup test templates
  console.log('7. Cleaning up test templates...');
  await fetch(`${BASE_URL}/api/templates/${templateId}`, { method: 'DELETE', headers: authHeaders });
  await fetch(`${BASE_URL}/api/templates/${cloneData.template.id}`, { method: 'DELETE', headers: authHeaders });
  console.log('   ✔ Test templates removed cleanly.\n');

  // 8. Verify templates.html page
  console.log('8. Verifying Template Studio UI availability...');
  const pageRes = await fetch(`${BASE_URL}/templates.html`);
  if (pageRes.status !== 200) throw new Error(`templates.html returned status ${pageRes.status}`);
  console.log('   ✔ templates.html loads with HTTP 200 OK.\n');

  console.log('🎉 ALL PHASE 3 AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
