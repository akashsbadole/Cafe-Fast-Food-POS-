const fs = require('fs');
const path = require('path');

// List of all test files
const testFiles = [
  './js/buzzer-manager.test.js',
  './js/cash-drawer-manager.test.js',
  './js/cash-reconciliation-manager.test.js',
  './js/cfd-driver.test.js',
  './js/combo-endpoints.test.js',
  './js/combo-manager.test.js',
  './js/database-manager.test.js',
  './js/digital-receipt-manager.test.js',
  './js/email-service.test.js',
  './js/error-handler.test.js',
  './js/escpos-driver.test.js',
  './js/hardware-endpoints.test.js',
  './js/kds-endpoints.test.js',
  './js/kds-manager.test.js',
  './js/loyalty-endpoints.test.js',
  './js/loyalty-manager.test.js',
  './js/modifier-endpoints.test.js',
  './js/modifier-manager.test.js',
  './js/offline-manager.test.js',
  './js/recipe-endpoints.test.js',
  './js/recipe-manager.test.js',
  './js/server-manager.test.js',
  './js/split-bill-endpoints.test.js',
  './js/split-bill-manager.test.js',
  './js/startup-manager.test.js',
  './js/sync-manager.test.js',
  './js/table-manager.test.js',
  './js/tax-engine.test.js',
  './js/void-refund-endpoints.test.js',
  './js/void-refund-manager.test.js',
  './js/weight-endpoints.test.js',
  './js/weight-manager.test.js',
  './js/whatsapp-service.test.js',
  './js/window-manager.test.js'
];

// Feature mapping
const featureMapping = {
  'Product Modifiers/Add-ons': [
    './js/modifier-manager.test.js',
    './js/modifier-endpoints.test.js'
  ],
  'Table/Buzzer Management': [
    './js/table-manager.test.js',
    './js/buzzer-manager.test.js'
  ],
  'Kitchen Display System (KDS)': [
    './js/kds-manager.test.js',
    './js/kds-endpoints.test.js'
  ],
  'Combo/Meal Deals': [
    './js/combo-manager.test.js',
    './js/combo-endpoints.test.js'
  ],
  'Weighted Items': [
    './js/weight-manager.test.js',
    './js/weight-endpoints.test.js'
  ],
  'Offline Mode Synchronization': [
    './js/offline-manager.test.js',
    './js/sync-manager.test.js'
  ],
  'Split Billing': [
    './js/split-bill-manager.test.js',
    './js/split-bill-endpoints.test.js'
  ],
  'Void/Refund Workflow': [
    './js/void-refund-manager.test.js',
    './js/void-refund-endpoints.test.js'
  ],
  'Cash Drawer Reconciliation': [
    './js/cash-reconciliation-manager.test.js',
    './js/cash-drawer-manager.test.js'
  ],
  'Recipe/BOM Tracking': [
    './js/recipe-manager.test.js',
    './js/recipe-endpoints.test.js'
  ],
  'Tax Engine Enhancement': [
    './js/tax-engine.test.js'
  ],
  'Customer Loyalty Points': [
    './js/loyalty-manager.test.js',
    './js/loyalty-endpoints.test.js'
  ],
  'Online Order Integration': [
    './js/online-order-manager.test.js'
  ],
  'Digital Receipts': [
    './js/digital-receipt-manager.test.js'
  ],
  'Hardware Drivers (ESC/POS, CFD)': [
    './js/escpos-driver.test.js',
    './js/cfd-driver.test.js',
    './js/hardware-endpoints.test.js'
  ],
  'Database & Core Services': [
    './js/database-manager.test.js',
    './js/server-manager.test.js',
    './js/error-handler.test.js',
    './js/window-manager.test.js',
    './js/startup-manager.test.js',
    './js/email-service.test.js',
    './js/whatsapp-service.test.js'
  ]
};

// Run a single test file
function runTestFile(testFile) {
  return new Promise((resolve) => {
    console.log(`\n📋 Running: ${testFile}`);
    const testModule = require(testFile);
    
    if (testModule.runTests && typeof testModule.runTests === 'function') {
      testModule.runTests((results) => {
        resolve({ testFile, results });
      });
    } else if (testModule.default && typeof testModule.default === 'function') {
      testModule.default((results) => {
        resolve({ testFile, results });
      });
    } else {
      console.log('⚠️  No test runner found in module');
      resolve({ testFile, results: { passed: 0, failed: 0, errors: ['No test runner found'] } });
    }
  });
}

// Main test execution
async function runAllTests() {
  console.log('========================================');
  console.log('🧪 COMPREHENSIVE POS SYSTEM TEST SUITE');
  console.log('========================================\n');
  
  const results = {
    totalTests: 0,
    totalPassed: 0,
    totalFailed: 0,
    features: {},
    allTests: []
  };
  
  // Initialize feature results
  for (const [featureName, files] of Object.entries(featureMapping)) {
    results.features[featureName] = {
      files: files.length,
      passed: 0,
      failed: 0,
      details: []
    };
  }
  
  // Run all tests
  for (const testFile of testFiles) {
    try {
      const result = await runTestFile(testFile);
      results.allTests.push(result);
      results.totalTests += result.results.passed + result.results.failed;
      results.totalPassed += result.results.passed;
      results.totalFailed += result.results.failed;
      
      // Map to features
      for (const [featureName, files] of Object.entries(featureMapping)) {
        if (files.includes(testFile)) {
          results.features[featureName].passed += result.results.passed;
          results.features[featureName].failed += result.results.failed;
          results.features[featureName].details.push({
            file: testFile,
            passed: result.results.passed,
            failed: result.results.failed,
            errors: result.results.errors || []
          });
          break;
        }
      }
      
      console.log(`✅ Passed: ${result.results.passed}, ❌ Failed: ${result.results.failed}`);
      if (result.results.errors && result.results.errors.length > 0) {
        console.log('   Errors:', result.results.errors);
      }
    } catch (error) {
      console.log(`❌ Error running ${testFile}:`, error.message);
      results.totalFailed++;
      results.allTests.push({ testFile, results: { passed: 0, failed: 1, errors: [error.message] } });
    }
  }
  
  // Generate report
  console.log('\n========================================');
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('========================================');
  console.log(`Total Tests: ${results.totalTests}`);
  console.log(`Passed: ${results.totalPassed}`);
  console.log(`Failed: ${results.totalFailed}`);
  console.log(`Success Rate: ${((results.totalPassed / results.totalTests) * 100).toFixed(2)}%`);
  
  // Feature-by-feature breakdown
  console.log('\n📋 FEATURE-BY-FEATURE BREAKDOWN:');
  console.log('========================================');
  
  for (const [featureName, featureResult] of Object.entries(results.features)) {
    const total = featureResult.passed + featureResult.failed;
    const successRate = total > 0 ? ((featureResult.passed / total) * 100).toFixed(2) : '100.00';
    console.log(`\n${featureName}:`);
    console.log(`  Files: ${featureResult.files}`);
    console.log(`  Tests: ${total}`);
    console.log(`  Passed: ${featureResult.passed}`);
    console.log(`  Failed: ${featureResult.failed}`);
    console.log(`  Success Rate: ${successRate}%`);
    
    if (featureResult.failed > 0) {
      console.log('  ❌ Failed tests:');
      featureResult.details.forEach(detail => {
        if (detail.failed > 0) {
          console.log(`    - ${detail.file}: ${detail.failed} failed`);
          if (detail.errors.length > 0) {
            detail.errors.forEach(err => console.log(`      ${err}`));
          }
        }
      });
    }
  }
  
  // Write detailed report to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: results.totalTests,
      totalPassed: results.totalPassed,
      totalFailed: results.totalFailed,
      successRate: ((results.totalPassed / results.totalTests) * 100).toFixed(2)
    },
    features: results.features,
    allTests: results.allTests
  };
  
  fs.writeFileSync('TEST-REPORT.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Detailed report saved to TEST-REPORT.json');
  
  // Final status
  if (results.totalFailed === 0) {
    console.log('\n✅ ALL TESTS PASSED!');
  } else {
    console.log(`\n⚠️  ${results.totalFailed} test(s) failed. Please review the report.`);
  }
  
  process.exit(results.totalFailed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});