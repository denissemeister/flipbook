const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');

const router = express.Router();

const ACCESS_TTL  = '15m';
const REFRESH_TTL = '7d';
const COOKIE_OPTS = {
  httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function makeTokens(customer) {
  const payload = { sub: customer.id, email: customer.email, role: 'customer' };
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  return { accessToken, refreshToken };
}

// POST /api/v1/customer/auth/register
router.post('/register', async (req, res) => {
  const { email, password, first_name = '', last_name = '' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const existing = await db.query('SELECT id FROM customers WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 12);
  const { rows: [customer] } = await db.query(
    `INSERT INTO customers (email, password_hash, first_name, last_name)
     VALUES ($1,$2,$3,$4) RETURNING id, email, first_name, last_name`,
    [email.toLowerCase().trim(), password_hash, first_name, last_name]
  );

  const { accessToken, refreshToken } = makeTokens(customer);
  await db.query('UPDATE customers SET refresh_token = $1 WHERE id = $2', [refreshToken, customer.id]);

  res.cookie('customer_refresh', refreshToken, COOKIE_OPTS);
  res.status(201).json({ accessToken, customer });
});

// POST /api/v1/customer/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const { rows: [customer] } = await db.query(
    'SELECT * FROM customers WHERE email = $1', [email.toLowerCase().trim()]
  );
  if (!customer) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, customer.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const { accessToken, refreshToken } = makeTokens(customer);
  await db.query('UPDATE customers SET refresh_token = $1 WHERE id = $2', [refreshToken, customer.id]);

  res.cookie('customer_refresh', refreshToken, COOKIE_OPTS);
  res.json({
    accessToken,
    customer: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name },
  });
});

// POST /api/v1/customer/auth/refresh
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.customer_refresh;
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  let payload;
  try { payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid refresh token' }); }

  const { rows: [customer] } = await db.query(
    'SELECT * FROM customers WHERE id = $1 AND refresh_token = $2', [payload.sub, token]
  );
  if (!customer) return res.status(401).json({ error: 'Session expired' });

  const { accessToken, refreshToken } = makeTokens(customer);
  await db.query('UPDATE customers SET refresh_token = $1 WHERE id = $2', [refreshToken, customer.id]);

  res.cookie('customer_refresh', refreshToken, COOKIE_OPTS);
  res.json({
    accessToken,
    customer: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name },
  });
});

// POST /api/v1/customer/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.cookies?.customer_refresh;
  if (token) {
    try {
      const p = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      await db.query('UPDATE customers SET refresh_token = NULL WHERE id = $1', [p.sub]);
    } catch {}
  }
  res.clearCookie('customer_refresh');
  res.json({ ok: true });
});

// TEMP: DELETE /api/v1/customer/auth/reset-all — remove before production
router.delete('/reset-all', async (req, res) => {
  await db.query('DELETE FROM customers');
  console.log('[reset-all] all customers deleted');
  res.json({ ok: true });
});

module.exports = router;
