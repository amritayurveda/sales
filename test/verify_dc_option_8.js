// test/verify_dc_option_8.js
const assert = require('assert');
const { calculateDC, describeRule, findDcOption, DC_OPTIONS } = require('../utils/dcCalculator');

console.log('🧪 Verifying DC Rule Option 8 (≤1500: ₹200, >1500: ₹250, Special: Flat ₹200)...');

const opt8 = DC_OPTIONS.find(o => o.id === 'opt_8');
assert.ok(opt8, 'Option 8 must exist in DC_OPTIONS');
assert.strictEqual(opt8.num, 8);
assert.strictEqual(opt8.label, '≤₹1500: ₹200 , >₹1500: ₹250 , SPECIAL PRODUCT = FLAT 200');

// Test 1: Standard product ≤ 1500 (e.g. ₹1200) -> should be 200
const dcLow = calculateDC({ optionId: 'opt_8' }, 1200, 'DAMADAR');
assert.strictEqual(dcLow, 200, 'Price <= 1500 standard product must have DC = 200');
console.log(`✔ DC for DAMADAR at ₹1200 (<= 1500) = ₹${dcLow}`);

// Test 2: Standard product > 1500 (e.g. ₹2500) -> should be 250
const dcHigh = calculateDC({ optionId: 'opt_8' }, 2500, 'DAMADAR');
assert.strictEqual(dcHigh, 250, 'Price > 1500 standard product must have DC = 250');
console.log(`✔ DC for DAMADAR at ₹2500 (> 1500) = ₹${dcHigh}`);

// Test 3: Special product (e.g. PLAY MORE or isSpecial: true) -> should be Flat 200
const dcSpecial = calculateDC({ optionId: 'opt_8' }, 2500, 'PLAY MORE');
assert.strictEqual(dcSpecial, 200, 'Special product PLAY MORE must have DC = 200');
console.log(`✔ DC for Special product PLAY MORE at ₹2500 = ₹${dcSpecial}`);

const dcSpecialObj = calculateDC({ optionId: 'opt_8' }, 3000, { name: 'CUSTOM PROD', isSpecial: true });
assert.strictEqual(dcSpecialObj, 200, 'Special product object must have DC = 200');
console.log(`✔ DC for custom product object (isSpecial: true) = ₹${dcSpecialObj}`);

// Test 4: Describe rule
const desc = describeRule({ optionId: 'opt_8' });
assert.strictEqual(desc, '≤₹1500: ₹200 , >₹1500: ₹250 , SPECIAL PRODUCT = FLAT 200');
console.log(`✔ Describe rule matches: "${desc}"`);

console.log('\n🎉 ALL DC OPTION 8 TESTS PASSED SUCCESSFULLY!');
process.exit(0);
