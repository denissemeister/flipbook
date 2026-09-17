const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL || '';
console.log('DB connecting to host:', dbUrl ? new URL(dbUrl).hostname : 'NOT SET');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

module.exports = pool;
