// Load .env only in local dev — Railway injects env vars directly, so we use
// `override: false` to prevent .env from overwriting Railway's variables.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env'), override: false });

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');

const authRoutes        = require('./routes/auth');
const booksRoutes       = require('./routes/books');
const pagesRoutes       = require('./routes/pages');
const elementsRoutes    = require('./routes/elements');
const mediaRoutes       = require('./routes/media');
const fontsRoutes       = require('./routes/fonts');
const publicRoutes      = require('./routes/public');
const customerAuthRoutes = require('./routes/customerAuth');
const ordersRoutes       = require('./routes/orders');
const recordingsRoutes   = require('./routes/recordings');
const storeRoutes        = require('./routes/store');
const cartRoutes         = require('./routes/cart');
const checkoutRoutes     = require('./routes/checkout');
const adminProductRoutes = require('./routes/adminProducts');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Stripe webhook must receive the raw body — register BEFORE express.json()
app.use('/api/v1/store/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cookieParser());

// Serve uploaded files (dev mode)
const STORAGE_PATH = process.env.STORAGE_PATH || './uploads';
app.use('/uploads', express.static(path.resolve(STORAGE_PATH)));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',              authRoutes);
app.use('/api/v1/public',            publicRoutes);
app.use('/api/v1/customer/auth',     customerAuthRoutes);  // before /api/v1 catch-alls
app.use('/api/v1/customer/orders',      ordersRoutes);
app.use('/api/v1/customer/recordings',  recordingsRoutes);
app.use('/api/v1/books',             booksRoutes);
app.use('/api/v1',                   pagesRoutes);
app.use('/api/v1',                   elementsRoutes);
app.use('/api/v1/media',             mediaRoutes);
app.use('/api/v1/fonts',             fontsRoutes);
app.use('/api/v1/store',             storeRoutes);
app.use('/api/v1/store',             checkoutRoutes);
app.use('/api/v1/store/cart',        cartRoutes);
app.use('/api/v1/admin',             adminProductRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Flipbook API running on http://localhost:${PORT}`);
});
