// utils/dcCalculator.js

const DC_OPTIONS = [
  {
    id: "opt_1",
    num: 1,
    name: "Option 1",
    label: "≤₹1500: ₹200 , >₹1500: ₹250 , SPECIAL PRODUCT = FLAT 170",
    shortLabel: "≤1500: ₹200 | >1500: ₹250 | Special: ₹170",
    type: "tiered",
    threshold: 1500,
    le: 200,
    gt: 250,
    specialDc: 170
  },
  {
    id: "opt_2",
    num: 2,
    name: "Option 2",
    label: "≤₹1500: ₹200 , >₹1500: ₹250 , SPECIAL PRODUCT = FLAT 150",
    shortLabel: "≤1500: ₹200 | >1500: ₹250 | Special: ₹150",
    type: "tiered",
    threshold: 1500,
    le: 200,
    gt: 250,
    specialDc: 150
  },
  {
    id: "opt_3",
    num: 3,
    name: "Option 3",
    label: "≤₹1500: ₹200 , >₹1500: ₹270 , SPECIAL PRODUCT = FLAT 150",
    shortLabel: "≤1500: ₹200 | >1500: ₹270 | Special: ₹150",
    type: "tiered",
    threshold: 1500,
    le: 200,
    gt: 270,
    specialDc: 150
  },
  {
    id: "opt_4",
    num: 4,
    name: "Option 4",
    label: "FLAT 200, SPECIAL PRODUCT = 170",
    shortLabel: "Flat ₹200 | Special: ₹170",
    type: "flat",
    value: 200,
    specialDc: 170
  },
  {
    id: "opt_5",
    num: 5,
    name: "Option 5",
    label: "FLAT 250",
    shortLabel: "Flat ₹250",
    type: "flat",
    value: 250,
    specialDc: 250
  },
  {
    id: "opt_6",
    num: 6,
    name: "Option 6",
    label: "FLAT 200",
    shortLabel: "Flat ₹200",
    type: "flat",
    value: 200,
    specialDc: 200
  },
  {
    id: "opt_7",
    num: 7,
    name: "Option 7",
    label: "FLAT 150",
    shortLabel: "Flat ₹150",
    type: "flat",
    value: 150,
    specialDc: 150
  },
  {
    id: "opt_8",
    num: 8,
    name: "Option 8",
    label: "≤₹1500: ₹200 , >₹1500: ₹250 , SPECIAL PRODUCT = FLAT 200",
    shortLabel: "≤1500: ₹200 | >1500: ₹250 | Special: ₹200",
    type: "tiered",
    threshold: 1500,
    le: 200,
    gt: 250,
    specialDc: 200
  }
];

const DEFAULT_DC_RULES = {
  "Chittorgarh": { optionId: "opt_1" },
  "Kota": { optionId: "opt_1" },
  "Bikaner": { optionId: "opt_3" },
  "Alwar": { optionId: "opt_6" },
  "Uttarakhand": { optionId: "opt_4" },
  "Udham Singh Nagar": { optionId: "opt_1" },
  "Faridabad": { optionId: "opt_5" },
  "Gurgaon": { optionId: "opt_6" },
  "Jodhpur": { optionId: "opt_6" },
  "Muzaffarnagar": { optionId: "opt_4" },
  "Saharanpur": { optionId: "opt_4" }
};

const SPECIAL_PRODUCTS = [
  'PLAY MORE',
  'FOUJI',
  'EYE SUTRA',
  'ALERGY',
  'HEIGHT VEDA',
  'ALERGY SAFA',
  'HEIGHT SUTRA'
];

/**
 * Checks whether a product object or product name string is a Special product.
 */
function isSpecialProduct(productOrName) {
  if (!productOrName) return false;
  if (typeof productOrName === 'object') {
    if (productOrName.isSpecial === true) return true;
    if (productOrName.name) {
      const pName = productOrName.name.toUpperCase();
      return SPECIAL_PRODUCTS.some(sp => pName.includes(sp));
    }
    return false;
  }
  const str = String(productOrName).toUpperCase();
  return SPECIAL_PRODUCTS.some(sp => str.includes(sp));
}

/**
 * Finds the DC option matching the rule
 */
function findDcOption(rule) {
  if (!rule) return DC_OPTIONS[0];

  if (rule.optionId) {
    const found = DC_OPTIONS.find(o => o.id === rule.optionId);
    if (found) return found;
  }

  // Fallback matching by type and values for legacy or custom objects
  if (rule.type === 'flat') {
    const val = Number(rule.value) || 200;
    if (val === 250) return DC_OPTIONS.find(o => o.id === 'opt_5');
    if (val === 150) return DC_OPTIONS.find(o => o.id === 'opt_7');
    if (val === 200 && (rule.specialDc === 170 || (rule.overrides && Object.values(rule.overrides).includes(170)))) {
      return DC_OPTIONS.find(o => o.id === 'opt_4');
    }
    return DC_OPTIONS.find(o => o.id === 'opt_6');
  }

  if (rule.type === 'threshold' || rule.type === 'tiered') {
    const le = Number(rule.le) || 200;
    const gt = Number(rule.gt) || 250;
    const sp = Number(rule.specialDc) || (rule.overrides && Object.values(rule.overrides)[0]) || 170;
    if (gt === 270) return DC_OPTIONS.find(o => o.id === 'opt_3');
    if (sp === 200) return DC_OPTIONS.find(o => o.id === 'opt_8');
    if (sp === 150) return DC_OPTIONS.find(o => o.id === 'opt_2');
    return DC_OPTIONS.find(o => o.id === 'opt_1');
  }

  return DC_OPTIONS[0];
}

/**
 * Compute the DC amount for a given district rule, order price, and product.
 * @param {Object} rule - The district DC rule configuration or { optionId }
 * @param {number} price - Order/scheme price
 * @param {string|Object} [productOrName] - Product object with isSpecial or product name
 * @param {string} [district] - District name
 * @returns {number} Calculated DC rate
 */
function calculateDC(rule, price, productOrName, district) {
  const opt = findDcOption(rule);
  const isSpecial = isSpecialProduct(productOrName);
  const numPrice = Number(price) || 0;

  if (isSpecial) {
    return opt.specialDc !== undefined ? opt.specialDc : (opt.value || 170);
  }

  if (opt.type === 'tiered') {
    return numPrice <= (opt.threshold || 1500) ? opt.le : opt.gt;
  }

  return opt.value || 200;
}

/**
 * Human-readable description of a DC rule.
 */
function describeRule(rule) {
  const opt = findDcOption(rule);
  return opt ? opt.label : '≤₹1500: ₹200 , >₹1500: ₹250 , SPECIAL PRODUCT = FLAT 170';
}

module.exports = {
  DC_OPTIONS,
  DEFAULT_DC_RULES,
  calculateDC,
  describeRule,
  isSpecialProduct,
  findDcOption
};
