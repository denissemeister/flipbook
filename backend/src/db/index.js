const { Pool } = require('pg');

// PG_URL takes priority — use this in Railway to avoid auto-reference conversion
const dbUrl = process.env.PG_URL || process.env.DATABASE_URL || '';

const pool = new Pool({
  connectionString: dbUrl || undefined,
  ssl: dbUrl.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

module.exports = pool;
