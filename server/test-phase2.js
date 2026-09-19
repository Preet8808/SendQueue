const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('🧪 Starting Phase 2 Automated Verification Tests...\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Authenticate
  console.log('1. Authenticating with admin credentials...');
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

  // 2. Fetch Contacts
  console.log('2. Fetching existing contacts...');
  const contactsRes = await fetch(`${BASE_URL}/api/contacts`, { headers: authHeaders });
  const contactsData = await contactsRes.json();
  console.log(`   ✔ Retrieved ${contactsData.contacts.length} contacts. Total: ${contactsData.pagination.total}\n`);

  // 3. Create Contact
  console.log('3. Creating a single contact...');
  const newEmail = `test.user.${Date.now()}@domain.com`;
  const createRes = await fetch(`${BASE_URL}/api/contacts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email: newEmail,
      first_name: 'Test',
      last_name: 'Pilot',
      company: 'Antigravity Labs',
      category: 'Enterprise'
    })
  });
  const createData = await createRes.json();
  if (createRes.status !== 201) throw new Error(`Create contact failed: ${createData.error}`);
  console.log(`   ✔ Contact created: ${createData.contact.email} (ID: ${createData.contact.id})\n`);

  // 4. Duplicate Prevention
  console.log('4. Testing duplicate email prevention...');
  const dupRes = await fetch(`${BASE_URL}/api/contacts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email: newEmail, first_name: 'Duplicate' })
  });
  const dupData = await dupRes.json();
  if (dupRes.status === 400 && dupData.error.includes('already exists')) {
    console.log(`   ✔ Duplicate properly rejected with 400: "${dupData.error}"\n`);
  } else {
    throw new Error('Duplicate prevention failed!');
  }

  // 5. Create Group
  console.log('5. Creating a test group...');
  const groupName = `Q4 Retailers ${Date.now()}`;
  const groupRes = await fetch(`${BASE_URL}/api/groups`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: groupName, description: 'Test automated group' })
  });
  const groupData = await groupRes.json();
  if (groupRes.status !== 201) throw new Error(`Create group failed: ${groupData.error}`);
  const targetGroupId = groupData.group.id;
  console.log(`   ✔ Group created: "${groupData.group.name}" (ID: ${targetGroupId})\n`);

  // 6. Generate Synthetic CSV with varied column names and bad rows
  console.log('6. Generating synthetic CSV with varied headers, invalid syntax, and duplicates...');
  const csvContent = `Email Address,Full Name,Company Name,Category
valid1.${Date.now()}@retailer.com,John Doe,Doe Corp,Retail
valid2.${Date.now()}@retailer.com,Jane Smith,Smith LLC,Wholesale
valid3.${Date.now()}@retailer.com,Bob Stone,Stone Inc,Distributor
invalid-email-format,Bad Email,No Corp,None
valid1.${Date.now()}@retailer.com,Duplicate John,Doe Corp,Retail
${newEmail},Already In DB,Antigravity Labs,Enterprise
`;
  const tempCsvPath = path.join(__dirname, 'temp_test_contacts.csv');
  fs.writeFileSync(tempCsvPath, csvContent);
  console.log('   ✔ Synthetic CSV created at:', tempCsvPath);

  // 7. Test CSV Preview (Multipart upload)
  console.log('7. Testing CSV upload & validation preview...');
  const fileBuffer = fs.readFileSync(tempCsvPath);
  const blob = new Blob([fileBuffer], { type: 'text/csv' });
  const formData = new FormData();
  formData.append('file', blob, 'temp_test_contacts.csv');

  const previewRes = await fetch(`${BASE_URL}/api/contacts/import-preview`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const previewData = await previewRes.json();
  if (!previewData.success) throw new Error(`Preview failed: ${previewData.error}`);

  console.log('   ✔ Auto-detected Mapping:', previewData.mapping);
  console.log('   ✔ Validation Stats:', previewData.stats);
  if (previewData.stats.validCount !== 3) {
    throw new Error(`Expected 3 valid rows, but got ${previewData.stats.validCount}`);
  }
  if (previewData.stats.invalidCount !== 1) {
    throw new Error(`Expected 1 invalid row, but got ${previewData.stats.invalidCount}`);
  }
  if (previewData.stats.duplicateCount !== 2) { // 1 in-file duplicate + 1 DB duplicate
    throw new Error(`Expected 2 duplicate rows, but got ${previewData.stats.duplicateCount}`);
  }
  console.log('   ✔ CSV validation engine accurately classified valid, invalid, and duplicate rows!\n');

  // 8. Test CSV Commit
  console.log('8. Testing CSV import commit into database with group association...');
  const commitRes = await fetch(`${BASE_URL}/api/contacts/import-commit`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fileId: previewData.fileId,
      mapping: previewData.mapping,
      targetGroupId: targetGroupId
    })
  });
  const commitData = await commitRes.json();
  console.log(`   ✔ Import committed: ${commitData.message}`);

  // 9. Verify Group Membership
  console.log('9. Verifying group membership of imported contacts...');
  const groupVerifyRes = await fetch(`${BASE_URL}/api/contacts?groupId=${targetGroupId}`, { headers: authHeaders });
  const groupVerifyData = await groupVerifyRes.json();
  console.log(`   ✔ Contacts under group "${groupName}": ${groupVerifyData.contacts.length}`);
  if (groupVerifyData.contacts.length !== 3) {
    throw new Error(`Expected 3 contacts in group, got ${groupVerifyData.contacts.length}`);
  }

  // Cleanup temp CSV
  if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);

  console.log('\n🎉 ALL PHASE 2 AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
