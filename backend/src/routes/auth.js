const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const nodemailer = require('nodemailer');
const db        = require('../db');

function makeTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

function makeTokens(admin) {
  const payload = { id: admin.id, email: admin.email };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
}

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { rows } = await db.query(
    'SELECT id, email, password_hash FROM admins WHERE email = $1', [email.toLowerCase()]
  );
  const admin = rows[0];

  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const { accessToken, refreshToken } = makeTokens(admin);
  res.cookie('refresh_token', refreshToken, COOKIE_OPTS);
  res.json({ accessToken, admin: { id: admin.id, email: admin.email } });
});

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const { rows } = await db.query(
    'SELECT id, email FROM admins WHERE id = $1', [payload.id]
  );
  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: 'Admin not found' });

  const { accessToken, refreshToken } = makeTokens(admin);
  res.cookie('refresh_token', refreshToken, COOKIE_OPTS);
  res.json({ accessToken });
});

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('refresh_token');
  res.json({ ok: true });
});

// ── POST /api/v1/auth/register ────────────────────────────────────────────────
// Useful for first-time setup; you can remove or protect this in production.
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    const { rows } = await db.query(
      'INSERT INTO admins (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), hash]
    );
    const admin = rows[0];
    const { accessToken, refreshToken } = makeTokens(admin);
    res.cookie('refresh_token', refreshToken, COOKIE_OPTS);
    res.status(201).json({ accessToken, admin });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

// ── POST /api/v1/auth/forgot-password ────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const { rows } = await db.query(
    'SELECT id FROM admins WHERE email = $1', [email.toLowerCase()]
  );
  // Always respond with success to avoid leaking whether the email exists
  if (!rows[0]) return res.json({ ok: true });

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query(
    'UPDATE admins SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
    [token, expires, rows[0].id]
  );

  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const resetUrl = `${clientOrigin}/reset-password?token=${token}`;

  try {
    const transporter = makeTransporter();
    await transporter.sendMail({
      from: `"Flipbook" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Reset your Flipbook password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="margin-top:0">Reset your password</h2>
          <p>Click the link below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">
            Reset password
          </a>
          <p style="margin-top:24px;color:#6b7280;font-size:13px">
            If you didn't request this, you can ignore this email.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Failed to send reset email:', err.message);
    return res.status(500).json({ error: 'Failed to send reset email. Check your Gmail credentials in .env.' });
  }

  res.json({ ok: true });
});

// ── POST /api/v1/auth/reset-password ─────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { rows } = await db.query(
    `SELECT id FROM admins
     WHERE reset_token = $1 AND reset_token_expires > NOW()`,
    [token]
  );
  if (!rows[0]) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

  const hash = await bcrypt.hash(password, 12);
  await db.query(
    'UPDATE admins SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
    [hash, rows[0].id]
  );

  res.json({ ok: true });
});

// ── PATCH /api/v1/auth/me — change email / password ──────────────────────────
const { requireAuth } = require('../middleware/auth');

router.patch('/me', requireAuth, async (req, res) => {
  const { currentPassword, newEmail, newPassword } = req.body;
  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required' });
  }

  const { rows } = await db.query(
    'SELECT id, email, password_hash FROM admins WHERE id = $1', [req.admin.id]
  );
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(currentPassword, admin.password_hash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  let updatedEmail = admin.email;
  let updatedHash  = admin.password_hash;

  if (newEmail && newEmail !== admin.email) {
    updatedEmail = newEmail.toLowerCase();
  }
  if (newPassword) {
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    updatedHash = await bcrypt.hash(newPassword, 12);
  }

  try {
    await db.query(
      'UPDATE admins SET email = $1, password_hash = $2 WHERE id = $3',
      [updatedEmail, updatedHash, admin.id]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    throw err;
  }

  res.json({ ok: true, email: updatedEmail });
});

module.exports = router;
