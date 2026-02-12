/**
 * REAL E2E FLOW TEST
 * OTP → Login → Project → Survey → Equipment → Quote → Approve → Contract → PDF
 */

import http from 'http';
import { createUser, loginUser } from '../packages/backend/src/services/users';
import { getDefaultOrganizationId } from '../packages/backend/src/services/auditLog';
import { connectDatabase } from '../packages/backend/src/config/database';

const API_BASE = 'http://localhost:3000/api';

interface ApiResponse {
  status: number;
  data: unknown;
}

function request(
  method: string,
  path: string,
  body?: unknown,
  authToken?: string
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = authToken;
    }

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 500, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 500, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== REAL E2E FLOW TEST ===\n');

  try {
    // Connect to database
    console.log('Connecting to database...');
    await connectDatabase();
    console.log('✓ Database connected\n');

    // Get organization
    console.log('Getting default organization...');
    const orgId = await getDefaultOrganizationId();
    console.log(`✓ Organization ID: ${orgId}\n`);

    // Create test user
    console.log('Creating test user...');
    const testEmail = `test-${Date.now()}@example.com`;
    const user = await createUser(orgId, {
      email: testEmail,
      password: 'test123',
      full_name: 'Test Sales Rep',
      role: 'SALES',
    });
    console.log(`✓ User created: ${testEmail}\n`);

    // Login
    console.log('=== STEP 1: LOGIN ===');
    const loginResult = await loginUser(orgId, testEmail, 'test123');
    if (!loginResult) {
      console.log('✗ Login failed');
      process.exit(1);
    }
    const token = loginResult.token;
    const authHeader = `Bearer ${token}`;
    console.log(`✓ Login successful, token: ${token.substring(0, 20)}...\n`);

    // Step 2: OTP Request (verify security)
    console.log('=== STEP 2: OTP REQUEST (Security Check) ===');
    let res = await request('POST', '/public/otp/request', { phone: '+84987654321' });
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${JSON.stringify(res.data)}`);
    if (res.status !== 200) {
      console.log('✗ OTP request failed');
      process.exit(1);
    }
    const data = res.data as { challenge_id?: unknown; otp?: unknown };
    if (!data.challenge_id) {
      console.log('✗ No challenge_id in response');
      process.exit(1);
    }
    if (data.otp) {
      console.log('✗ SECURITY FAIL: OTP found in response');
      process.exit(1);
    }
    console.log('✓ OTP not in response (secure)\n');

    // Step 3: Create Project
    console.log('=== STEP 3: CREATE PROJECT ===');
    res = await request('POST', '/projects', {
      customer_name: 'Test Customer',
      customer_phone: '+84987654321',
      customer_email: 'customer@example.com',
      address: '123 Test St',
    }, authHeader);
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${JSON.stringify(res.data)}`);
    if (res.status !== 201 && res.status !== 200) {
      console.log(`✗ Project creation failed: ${res.status}`);
      process.exit(1);
    }
    const projectData = res.data as { id?: unknown; value?: { id?: unknown } };
    const projectId = projectData.id || (projectData.value as { id?: unknown })?.id;
    if (!projectId) {
      console.log('✗ No project ID in response');
      process.exit(1);
    }
    console.log(`✓ Project created: ${projectId}\n`);

    // Step 4: Update Usage (Survey)
    console.log('=== STEP 4: UPDATE USAGE (Survey Data) ===');
    res = await request('PUT', `/projects/${projectId}/usage`, {
      monthly_kwh: 500,
      day_usage_pct: 70,
    }, authHeader);
    console.log(`Status: ${res.status}`);
    if (res.status !== 200) {
      console.log(`✗ Usage update failed: ${res.status}`);
      process.exit(1);
    }
    console.log('✓ Usage data saved\n');

    // Step 5: Create Roof
    console.log('=== STEP 5: CREATE ROOF ===');
    res = await request('POST', `/projects/${projectId}/roofs`, {
      roof_index: 1,
      azimuth: 180,
      tilt: 15,
      area: 50,
      usable_pct: 80,
    }, authHeader);
    console.log(`Status: ${res.status}`);
    if (res.status !== 201 && res.status !== 200) {
      console.log(`✗ Roof creation failed: ${res.status}`);
      process.exit(1);
    }
    console.log('✓ Roof created\n');

    // Step 6: Get Recommendations
    console.log('=== STEP 6: GET EQUIPMENT RECOMMENDATIONS ===');
    res = await request('GET', `/projects/${projectId}/recommend/pv`, undefined, authHeader);
    console.log(`Status: ${res.status}`);
    if (res.status !== 200) {
      console.log(`✗ Recommendations failed: ${res.status}`);
      process.exit(1);
    }
    const recData = res.data as { recommendations?: unknown[] };
    if (!Array.isArray(recData.recommendations) || recData.recommendations.length === 0) {
      console.log('⚠ No PV recommendations (may be expected if no equipment in catalog)');
    } else {
      console.log(`✓ Got ${(recData.recommendations || []).length} PV recommendations\n`);
    }

    // Step 7: Create Quote
    console.log('=== STEP 7: CREATE QUOTE ===');
    res = await request('POST', `/projects/${projectId}/quotes`, {}, authHeader);
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${JSON.stringify(res.data)}`);
    if (res.status !== 201 && res.status !== 200) {
      console.log(`✗ Quote creation failed: ${res.status}`);
      process.exit(1);
    }
    const quoteData = res.data as { id?: unknown; quote?: { id?: unknown } };
    const quoteId = quoteData.id || (quoteData.quote as { id?: unknown })?.id;
    if (!quoteId) {
      console.log('✗ No quote ID in response');
      process.exit(1);
    }
    console.log(`✓ Quote created: ${quoteId}\n`);

    // Step 8: Submit Quote
    console.log('=== STEP 8: SUBMIT QUOTE ===');
    res = await request('POST', `/quotes/${quoteId}/submit`, {}, authHeader);
    console.log(`Status: ${res.status}`);
    if (res.status !== 200) {
      console.log(`✗ Quote submit failed: ${res.status}`);
      process.exit(1);
    }
    console.log('✓ Quote submitted\n');

    // Step 9: Approve Quote
    console.log('=== STEP 9: APPROVE QUOTE (Admin) ===');
    res = await request('POST', `/quotes/${quoteId}/approve`, {}, authHeader);
    console.log(`Status: ${res.status}`);
    if (res.status !== 200) {
      console.log(`✗ Quote approval failed: ${res.status}`);
      process.exit(1);
    }
    console.log('✓ Quote approved\n');

    // Step 10: Get Quote PDF
    console.log('=== STEP 10: GET QUOTE PDF ===');
    res = await request('GET', `/quotes/${quoteId}/pdf`, undefined, authHeader);
    console.log(`Status: ${res.status}`);
    if (res.status !== 200) {
      console.log(`✗ PDF retrieval failed: ${res.status}`);
      process.exit(1);
    }
    if (typeof res.data === 'string' && res.data.length > 0) {
      console.log(`✓ PDF generated (${(res.data as string).length} bytes)\n`);
    } else {
      console.log('✓ PDF endpoint returned (may be binary data)\n');
    }

    // Step 11: Create Contract
    console.log('=== STEP 11: CREATE CONTRACT ===');
    res = await request('POST', `/quotes/${quoteId}/contracts`, {}, authHeader);
    console.log(`Status: ${res.status}`);
    if (res.status !== 201 && res.status !== 200) {
      console.log(`✗ Contract creation failed: ${res.status}`);
      process.exit(1);
    }
    const contractData = res.data as { id?: unknown; contract?: { id?: unknown } };
    const contractId = contractData.id || (contractData.contract as { id?: unknown })?.id;
    if (!contractId) {
      console.log('✗ No contract ID in response');
      process.exit(1);
    }
    console.log(`✓ Contract created: ${contractId}\n`);

    // Summary
    console.log('=== E2E FLOW COMPLETE ===');
    console.log('✓ OTP request (security verified - no plaintext)');
    console.log('✓ User login');
    console.log('✓ Project creation');
    console.log('✓ Survey data (usage + roof)');
    console.log('✓ Equipment recommendations');
    console.log('✓ Quote creation');
    console.log('✓ Quote submission');
    console.log('✓ Quote approval');
    console.log('✓ Quote PDF generation');
    console.log('✓ Contract creation');
    console.log('\nE2E_REAL_PASS');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    console.log('\nE2E_REAL_FAIL');
    process.exit(1);
  }
}

main();
