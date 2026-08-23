// test/verify_all_final.js
const { execSync } = require('child_process');

const tests = [
  'test/verify_dc_option_8.js',
  'test/verify_district_stock_deduction.js',
  'test/verify_main_stock_management.js',
  'test/verify_independent_stock_edits.js',
  'test/verify_deduplication_and_zero_stock.js'
];

console.log('🔒 EXECUTING FINAL COMPREHENSIVE SYSTEM VERIFICATION...\n');

let allPassed = true;

for (const t of tests) {
  try {
    console.log(`▶ Running: ${t}...`);
    const out = execSync(`node ${t}`, { encoding: 'utf8' });
    console.log(`✔ Passed ${t}`);
  } catch (err) {
    console.error(`❌ Failed ${t}:`, err.stdout || err.message);
    allPassed = false;
  }
}

if (allPassed) {
  console.log('\n🎉 ALL FINAL TESTS PASSED 100%! SYSTEM IS LOCKED, VERIFIED, AND SECURE.');
  process.exit(0);
} else {
  console.error('\n❌ SOME TESTS FAILED.');
  process.exit(1);
}
