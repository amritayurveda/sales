// config/postgres.js
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7xbIfQA4hgzv@ep-lucky-voice-axjbnu4p-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: isServerless ? 3 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

let tablesInitialized = false;

async function initPostgresTables() {
  if (tablesInitialized) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(128) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL,
        district VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 2. Master Products Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS master_products (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(128) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 3. District Products & Stock Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS district_products (
        id VARCHAR(64) PRIMARY KEY,
        district VARCHAR(64) NOT NULL,
        product_id VARCHAR(64) NOT NULL,
        product_name VARCHAR(128) NOT NULL,
        stock_allocated NUMERIC DEFAULT 0,
        current_stock NUMERIC DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        CONSTRAINT unique_dist_prod UNIQUE(district, product_id)
      );
    `);

    // 4. District DC Rules Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS dc_rules (
        district VARCHAR(64) PRIMARY KEY,
        rule_type VARCHAR(32) NOT NULL,
        rule_val NUMERIC,
        rule_le NUMERIC,
        rule_gt NUMERIC,
        threshold NUMERIC DEFAULT 1500,
        overrides JSONB DEFAULT '{}'::jsonb
      );
    `);

    // 5. Customer Sales Orders Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_orders (
        id VARCHAR(64) PRIMARY KEY,
        order_no VARCHAR(64) UNIQUE NOT NULL,
        district VARCHAR(64) NOT NULL,
        order_date DATE NOT NULL,
        order_time VARCHAR(32),
        product_id VARCHAR(64) NOT NULL,
        product_name VARCHAR(128) NOT NULL,
        qty NUMERIC DEFAULT 1,
        unit_price NUMERIC NOT NULL,
        dc_rate NUMERIC NOT NULL,
        net_amount NUMERIC NOT NULL,
        customer_mobile VARCHAR(32) NOT NULL,
        customer_name VARCHAR(128),
        note TEXT,
        dealer_username VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 6. Cash Settlements (Admin Collections) Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cash_settlements (
        id VARCHAR(64) PRIMARY KEY,
        receipt_no VARCHAR(64) UNIQUE NOT NULL,
        district VARCHAR(64) NOT NULL,
        payment_date DATE NOT NULL,
        amount NUMERIC NOT NULL,
        payment_mode VARCHAR(64) DEFAULT 'Cash Deposit',
        note TEXT,
        received_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 7. Mila (Inward Stock Transfers) Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS mila_inward (
        id SERIAL PRIMARY KEY,
        district VARCHAR(64) NOT NULL,
        inward_date DATE NOT NULL,
        product_id VARCHAR(64) NOT NULL,
        qty NUMERIC DEFAULT 0,
        inward_note TEXT,
        CONSTRAINT unique_mila_dist_date_prod UNIQUE(district, inward_date, product_id)
      );
    `);

    // 8. Inward Daily Notes Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS inward_notes (
        district VARCHAR(64) NOT NULL,
        note_date DATE NOT NULL,
        note TEXT NOT NULL,
        PRIMARY KEY (district, note_date)
      );
    `);

    // 9. Activity Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        username VARCHAR(64),
        role VARCHAR(32),
        district VARCHAR(64),
        action VARCHAR(64) NOT NULL,
        details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 10. Admin to District Stock Transfers & Dealer Receipt Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id VARCHAR(64) PRIMARY KEY,
        transfer_no VARCHAR(64) UNIQUE NOT NULL,
        district VARCHAR(64) NOT NULL,
        product_id VARCHAR(64),
        product_name VARCHAR(255),
        qty NUMERIC,
        items JSONB,
        total_units NUMERIC,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
        challan_no VARCHAR(64),
        note TEXT,
        dispatched_by VARCHAR(64) NOT NULL,
        dispatched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        received_by VARCHAR(64),
        received_at TIMESTAMP WITH TIME ZONE,
        received_date DATE,
        declined_by VARCHAR(64),
        declined_at TIMESTAMP WITH TIME ZONE,
        decline_reason TEXT
      );
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS items JSONB;
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS total_units NUMERIC;
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS declined_by VARCHAR(64);
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS decline_reason TEXT;
    `);

    // 10. Key-Value Settings & State Cache Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key VARCHAR(64) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('✅ PostgreSQL Schema Verified & Initialized on Neon Tech!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ PostgreSQL Schema Initialization Error:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  DATABASE_URL,
  initPostgresTables
};
