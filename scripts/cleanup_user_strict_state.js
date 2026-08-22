// scripts/cleanup_user_strict_state.js
const { initDb, db, saveDb } = require('../config/db');
const { pool } = require('../config/postgres');

async function main() {
  console.log('🚀 Executing strict cleanup and persistence...');

  await initDb();

  // 1. Permanently remove Rewari and Shamli
  const removedDistricts = ['Rewari', 'Shamli'];
  if (!db.deletedDistricts) db.deletedDistricts = [];
  removedDistricts.forEach(rd => {
    if (!db.deletedDistricts.includes(rd)) db.deletedDistricts.push(rd);
  });

  db.districts = (db.districts || []).filter(d => !removedDistricts.some(rd => rd.toLowerCase() === d.toLowerCase()));

  // 2. Remove Rewari and Shamli users from memory and PostgreSQL
  db.users = (db.users || []).filter(u => !u.district || !removedDistricts.some(rd => rd.toLowerCase() === u.district.toLowerCase()));

  for (const rd of removedDistricts) {
    try {
      await pool.query('DELETE FROM users WHERE LOWER(district) = $1', [rd.toLowerCase()]);
      await pool.query('DELETE FROM dc_rules WHERE LOWER(district) = $1', [rd.toLowerCase()]);
    } catch (e) {
      console.error(`Postgres cleanup error for ${rd}:`, e.message);
    }
  }

  // 3. Clean up district products map
  if (db.districtProducts) {
    removedDistricts.forEach(rd => {
      delete db.districtProducts[rd];
      delete db.districtProducts[rd.toLowerCase()];
      delete db.districtProducts[rd.toUpperCase()];
    });
  }

  // 4. Set strictly the 4 products for Saharanpur & Muzaffarnagar
  const FOUR_PRODUCTS = [
    {
      id: 'dp_sah_1',
      productId: 'prod_pm',
      name: 'PLAY MORE',
      schemePrice: 2500,
      stockAllocated: 50,
      currentStock: 50,
      schemes: [{ id: 'sch_pm_1', name: 'PLAY MORE 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_sah_2',
      productId: 'prod_fj',
      name: 'FOUJI',
      schemePrice: 2500,
      stockAllocated: 10,
      currentStock: 10,
      schemes: [{ id: 'sch_fj_1', name: 'FOUJI 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_sah_3',
      productId: 'prod_es',
      name: 'EYE SUTRA',
      schemePrice: 2500,
      stockAllocated: 15,
      currentStock: 15,
      schemes: [{ id: 'sch_es_1', name: 'EYE SUTRA 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_sah_4',
      productId: 'prod_alg',
      name: 'ALERGY',
      schemePrice: 2500,
      stockAllocated: 12,
      currentStock: 12,
      schemes: [{ id: 'sch_alg_1', name: 'ALERGY 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    }
  ];

  db.districtProducts['Saharanpur'] = JSON.parse(JSON.stringify(FOUR_PRODUCTS));
  db.districtProducts['SAHARANPUR'] = JSON.parse(JSON.stringify(FOUR_PRODUCTS));

  db.districtProducts['Muzaffarnagar'] = JSON.parse(JSON.stringify(FOUR_PRODUCTS));
  db.districtProducts['MUZAFFARNAGAR'] = JSON.parse(JSON.stringify(FOUR_PRODUCTS));

  // 5. Set strictly the 2 products for Gurgaon
  const TWO_PRODUCTS = [
    {
      id: 'dp_gur_1',
      productId: 'prod_an',
      name: 'AMAR NETRAN',
      schemePrice: 2500,
      stockAllocated: 11,
      currentStock: 11,
      schemes: [{ id: 'sch_an_1', name: 'AMAR NETRAN 1', qty: 1, price: 2500, dc: 250 }],
      isActive: true
    },
    {
      id: 'dp_gur_2',
      productId: 'prod_kd',
      name: 'KADWI DAWA',
      schemePrice: 2870,
      stockAllocated: 7.0,
      currentStock: 7.0,
      schemes: [
        { id: 'sch_kd_1', name: 'KD 1', qty: 1, price: 2870, dc: 250 },
        { id: 'sch_kd_2', name: 'KD 2', qty: 2, price: 5740, dc: 500 }
      ],
      isActive: true
    }
  ];

  db.districtProducts['Gurgaon'] = JSON.parse(JSON.stringify(TWO_PRODUCTS));
  db.districtProducts['GURGAON'] = JSON.parse(JSON.stringify(TWO_PRODUCTS));

  await saveDb();

  console.log('\n✅ Active Districts:', db.districts);
  console.log('✅ Deleted Districts Blacklist:', db.deletedDistricts);
  console.log('✅ Saharanpur Products Count:', db.districtProducts['Saharanpur'].length, db.districtProducts['Saharanpur'].map(p => p.name));
  console.log('✅ Muzaffarnagar Products Count:', db.districtProducts['Muzaffarnagar'].length, db.districtProducts['Muzaffarnagar'].map(p => p.name));
  console.log('✅ Gurgaon Products Count:', db.districtProducts['Gurgaon'].length, db.districtProducts['Gurgaon'].map(p => p.name));

  process.exit(0);
}

main().catch(err => {
  console.error('Cleanup script error:', err);
  process.exit(1);
});
