// utils/dcCalculator.js

const DEFAULT_DC_RULES = {
  "Chittorgarh": { type: 'threshold', le: 200, gt: 250, threshold: 1500 },
  "Kota": { type: 'threshold', le: 200, gt: 250, threshold: 1500 },
  "Bikaner": { type: 'threshold', le: 250, gt: 270, threshold: 1500 },
  "Alwar": { type: 'flat', value: 200 },
  "Uttarakhand": {
    type: 'flat',
    value: 200,
    overrides: {
      "Play More": 170,
      "Fouji": 170,
      "Height Sutra": 170,
      "Eye Sutra": 170,
      "Alergy": 170
    }
  },
  "Udham Singh Nagar": {
    type: 'threshold',
    le: 200,
    gt: 250,
    threshold: 1500,
    overrides: {
      "Play More": 170,
      "Fouji": 170,
      "Height Sutra": 170,
      "Eye Sutra": 170,
      "Alergy": 170
    }
  },
  "Faridabad": { type: 'flat', value: 250 },
  "Rewari": { type: 'flat', value: 250 },
  "Gurgaon": { type: 'flat', value: 200 },
  "Jodhpur": { type: 'custom', value: 200 },
  "Muzaffarnagar": { type: 'custom', value: 200 },
  "Shamli": { type: 'custom', value: 200 }
};

const SPECIAL_PRODUCTS = [
  'PLAY MORE',
  'HEIGHT VEDA',
  'ALERGY SAFA',
  'EYE SUTRA',
  'HEIGHT SUTRA',
  'EYE SUTRA',
  'ALERGY',
  'FOUJI'
];

function isSpecialProduct(productName) {
  if (!productName) return false;
  const p = productName.toUpperCase();
  return SPECIAL_PRODUCTS.some(sp => p.includes(sp));
}

/**
 * Compute the DC amount for a given district, order price, and product name.
 * @param {Object} rule - The district DC rule configuration
 * @param {number} price - Order/delivery price
 * @param {string} [productName] - Specific product name
 * @param {string} [district] - District name
 * @returns {number} Calculated DC rate
 */
function calculateDC(rule, price, productName, district) {
  // 1. Check if special product: ₹170 in UK & Udham Singh Nagar, ₹150 in all other districts
  if (isSpecialProduct(productName)) {
    const distUpper = (district || '').toUpperCase();
    if (distUpper.includes('UTTARAKHAND') || distUpper.includes('UDHAM')) {
      return 170;
    }
    return 150;
  }

  // 2. Check rule overrides
  if (rule && rule.overrides && productName && rule.overrides[productName] !== undefined) {
    return Number(rule.overrides[productName]);
  }

  if (rule) {
    if (rule.type === 'flat' || rule.type === 'custom') {
      return Number(rule.value) || 200;
    }
    if (rule.type === 'threshold') {
      const thresh = Number(rule.threshold) || 1500;
      const numPrice = Number(price) || 0;
      return numPrice <= thresh ? Number(rule.le) : Number(rule.gt);
    }
  }

  const numPrice = Number(price) || 0;
  return numPrice <= 1500 ? 200 : 250;
}

/**
 * Human-readable description of a DC rule.
 */
function describeRule(rule) {
  if (!rule) return 'Special: ₹150 / ₹170 | Standard: ≤₹1500: ₹200, >₹1500: ₹250';
  let desc = '';
  if (rule.type === 'flat' || rule.type === 'custom') {
    desc = `Flat ₹${rule.value}`;
  } else if (rule.type === 'threshold') {
    const t = rule.threshold || 1500;
    desc = `≤₹${t}: ₹${rule.le} | >₹${t}: ₹${rule.gt}`;
  }
  desc += ' (Play More/Height Veda/Alergy/Eye Sutra: ₹150 / UK ₹170)';
  return desc;
}

module.exports = {
  DEFAULT_DC_RULES,
  calculateDC,
  describeRule,
  isSpecialProduct
};
