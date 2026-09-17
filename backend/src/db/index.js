const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL || '';
console.log('DATABASE_URL set:', !!dbUrl, '| starts with:', dbUrl.slice(0, 20));

const pool = new Pool({
  connectionString: dbUrl || undefined,
  ssl: dbUrl.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

module.exports = pool;
