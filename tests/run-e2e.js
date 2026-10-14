#!/usr/bin/env node
/**
 * Unified E2E Test Runner for Multimedia Drive
 * Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)
 *
 * Usage:
 *   node tests/run-e2e.js [options]
 *
 * Options:
 *   --mock               Run against built-in mock server oracle (default)
 *   --live               Run against live backend server (specified via --url or E2E_BASE_URL)
 *   --url=<baseUrl>      Base URL of live server (defaults to http://localhost:3000)
 *   --tier=<1|2|3|4>     Run only tests in the specified tier
 *   --feature=<F1..F18>  Run only tests for the specified feature
 *   --verbose            Print detailed output for every test
 */

const fs = require('fs');
const path = require('path');
const { TestClient } = require('./harness/test-client');
const { MockServer } = require('./harness/mock-server');

// Parse CLI flags
const args = process.argv.slice(2);
const isLive = args.includes('--live') || Boolean(process.env.E2E_BASE_URL);
const urlArg = args.find(a => a.startsWith('--url='));
const targetBaseUrl = urlArg
  ? urlArg.split('=')[1]
  : (process.env.E2E_BASE_URL || (isLive ? 'http://localhost:3000' : 'http://localhost:3099'));

const tierArg = args.find(a => a.startsWith('--tier='));
const targetTier = tierArg ? parseInt(tierArg.split('=')[1], 10) : null;

const featureArg = args.find(a => a.startsWith('--feature='));
const targetFeature = featureArg ? featureArg.split('=')[1].toUpperCase() : null;

const isVerbose = args.includes('--verbose');

async function discoverTestSuites() {
  const suites = [];
  const e2eDir = path.join(__dirname, 'e2e');

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        try {
          const suite = require(fullPath);
          suites.push({
            filePath: fullPath,
            fileName: entry.name,
            ...suite
          });
        } catch (err) {
          console.error(`Failed to load test suite ${fullPath}:`, err.message);
        }
      }
    }
  }

  scanDir(e2eDir);
  return suites;
}

async function run() {
  console.log('================================================================');
  console.log('   MULTIMEDIA DRIVE - END-TO-END (E2E) TEST SUITE RUNNER');
  console.log('   Target: Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)');
  console.log('================================================================');
  console.log(` Mode:        ${isLive ? 'LIVE BACKEND' : 'MOCK HARNESS (ORACLE)'}`);
  console.log(` Target URL:  ${targetBaseUrl}`);
  if (targetTier) console.log(` Filter:      Tier ${targetTier} only`);
  if (targetFeature) console.log(` Filter:      Feature ${targetFeature} only`);
  console.log('----------------------------------------------------------------\n');

  let mockServer = null;
  if (!isLive) {
    mockServer = new MockServer(3099);
    try {
      await mockServer.start();
      console.log('Mock Reference Server started on port 3099.\n');
    } catch (err) {
      console.error('Failed to start mock server:', err);
      process.exit(1);
    }
  }

  const client = new TestClient(targetBaseUrl);
  const suites = await discoverTestSuites();

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failures = [];

  const tierStats = {
    1: { name: 'Tier 1: Feature Coverage', total: 0, passed: 0, failed: 0 },
    2: { name: 'Tier 2: Boundary & Corner Cases', total: 0, passed: 0, failed: 0 },
    3: { name: 'Tier 3: Cross-Feature Combinations', total: 0, passed: 0, failed: 0 },
    4: { name: 'Tier 4: Real-World Scenarios', total: 0, passed: 0, failed: 0 }
  };

  const featureStats = {};

  const startTime = Date.now();

  for (const suite of suites) {
    const tier = suite.tier || 1;
    if (targetTier && tier !== targetTier) continue;

    const featureId = suite.featureId || 'CROSS';
    if (targetFeature && featureId !== targetFeature) continue;

    if (!featureStats[featureId]) {
      featureStats[featureId] = { total: 0, passed: 0, failed: 0 };
    }

    const testList = suite.tests || [];
    for (const testCase of testList) {
      totalTests++;
      tierStats[tier].total++;
      featureStats[featureId].total++;

      const testStart = Date.now();
      try {
        await testCase.run(client, { mockServer, baseUrl: targetBaseUrl });
        const duration = Date.now() - testStart;
        passedTests++;
        tierStats[tier].passed++;
        featureStats[featureId].passed++;

        if (isVerbose) {
          console.log(`  ✓ [T${tier}][${testCase.id}] ${testCase.name} (${duration}ms)`);
        }
      } catch (err) {
        const duration = Date.now() - testStart;
        failedTests++;
        tierStats[tier].failed++;
        featureStats[featureId].failed++;

        console.error(`  ✗ [T${tier}][${testCase.id}] ${testCase.name} (${duration}ms)`);
        console.error(`    Error: ${err.message}`);
        failures.push({
          id: testCase.id,
          name: testCase.name,
          tier,
          featureId,
          error: err.message,
          stack: err.stack
        });
      }
    }
  }

  const totalDuration = Date.now() - startTime;

  if (mockServer) {
    await mockServer.stop();
  }

  console.log('\n================================================================');
  console.log('                    E2E TEST RUN SUMMARY');
  console.log('================================================================');
  console.log(` Total Duration: ${totalDuration} ms\n`);

  console.log(' --- TIER BREAKDOWN ---');
  for (let t = 1; t <= 4; t++) {
    const st = tierStats[t];
    const status = st.failed === 0 && st.total > 0 ? 'PASS' : (st.failed > 0 ? 'FAIL' : 'SKIP');
    console.log(`   ${st.name.padEnd(38)} : ${st.passed}/${st.total} [${status}]`);
  }

  console.log('\n --- FEATURE BREAKDOWN ---');
  const sortedFeatures = Object.keys(featureStats).sort();
  for (const feat of sortedFeatures) {
    const st = featureStats[feat];
    const status = st.failed === 0 ? 'PASS' : 'FAIL';
    console.log(`   Feature ${feat.padEnd(10)} : ${st.passed}/${st.total} [${status}]`);
  }

  console.log('----------------------------------------------------------------');
  console.log(` TOTAL TESTS : ${totalTests}`);
  console.log(` PASSED      : ${passedTests}`);
  console.log(` FAILED      : ${failedTests}`);
  console.log('================================================================');

  if (failedTests > 0) {
    console.error('\nFAILURES SUMMARY:');
    for (const f of failures) {
      console.error(`\n[${f.id}] (Tier ${f.tier}) ${f.name}`);
      console.error(`  ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\n>>> ALL END-TO-END TESTS PASSED SUCCESSFULLY! <<<\n');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
