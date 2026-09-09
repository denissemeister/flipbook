// ── Checkout routes ────────────────────────────────────────────────────────────
// POST /api/v1/store/checkout        — create Stripe Checkout session (customer auth required)
// POST /api/v1/store/webhook         — Stripe webhook (raw body, no auth)

const express = require('express');
const jwt     = require('jsonwebtoken');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../db');

const router = express.Router();

// ── Auth helper ───────────────────────────────────────────────────────────────
function requireCustomer(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'customer') return res.status(403).json({ error: 'Forbidden' });
    req.customer = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── POST /api/v1/store/checkout ───────────────────────────────────────────────
// Creates a Stripe Checkout session from the customer's cart, then clears it
// on successful payment via webhook.
router.post('/checkout', requireCustomer, async (req, res) => {
  const customerId = req.customer.sub;

  // Load cart
  const { rows: cartItems } = await db.query(
    `SELECT
       ci.id, ci.quantity, ci.product_id, ci.bundle_id,
       CASE WHEN ci.product_id IS NOT NULL THEN p.title     ELSE b.title     END AS title,
       CASE WHEN ci.product_id IS NOT NULL THEN p.price     ELSE b.price     END AS unit_price,
       CASE WHEN ci.product_id IS NOT NULL THEN p.cover_image ELSE b.cover_image END AS image
     FROM cart_items ci
     LEFT JOIN products p ON p.id = ci.product_id
     LEFT JOIN bundles  b ON b.id = ci.bundle_id
     WHERE ci.customer_id = $1`,
    [customerId]
  );

  if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty' });

  // Find volume discount
  const totalQty = cartItems.reduce((s, i) => s + i.quantity, 0);
  const { rows: rules } = await db.query(
    `SELECT discount_percent FROM discount_rules
     WHERE active = true AND min_quantity <= $1
     ORDER BY min_quantity DESC LIMIT 1`,
    [totalQty]
  );
  const discountPct = rules[0] ? parseFloat(rules[0].discount_percent) : 0;

  // Build Stripe line_items
  const line_items = cartItems.map(item => {
    const unitCents = Math.round(parseFloat(item.unit_price) * 100);
    const discounted = Math.round(unitCents * (1 - discountPct / 100));
    return {
      price_data: {
        currency:      'usd',
        unit_amount:   discounted,
        product_data:  {
          name:   item.title,
          images: item.image ? [item.image] : [],
        },
      },
      quantity: item.quantity,
    };
  });

  // Look up customer email
  const { rows: [cust] } = await db.query('SELECT email FROM customers WHERE id = $1', [customerId]);

  const successUrl = `${process.env.CLIENT_ORIGIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${process.env.CLIENT_ORIGIN}/cart`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode:                 'payment',
    customer_email:       cust?.email,
    line_items,
    success_url:          successUrl,
    cancel_url:           cancelUrl,
    metadata: {
      customer_id: customerId,
      discount_pct: String(discountPct),
    },
  });

  res.json({ url: session.url, session_id: session.id });
});

// ── POST /api/v1/store/webhook ────────────────────────────────────────────────
// IMPORTANT: This route requires the raw request body (not parsed JSON).
// Mount it BEFORE express.json() in index.js, or use express.raw() here.
// The router receives raw body because index.js registers this with express.raw().
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig     = req.headers['stripe-signature'];
    const secret  = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error('Webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session    = event.data.object;
      const customerId = session.metadata?.customer_id;
      const sessionId  = session.id;
      const paymentId  = session.payment_intent;

      // Create order record
      const { rows: [order] } = await db.query(
        `INSERT INTO orders
           (customer_id, stripe_session_id, stripe_payment_intent, status, total_amount, currency)
         VALUES ($1, $2, $3, 'paid', $4, 'USD')
         ON CONFLICT (stripe_session_id) DO NOTHING
         RETURNING id`,
        [customerId, sessionId, paymentId, session.amount_total / 100]
      );

      if (order && customerId) {
        // Copy cart items → order_items
        const { rows: cartItems } = await db.query(
          `SELECT product_id, bundle_id, quantity,
                  CASE WHEN product_id IS NOT NULL THEN p.price ELSE b.price END AS unit_price
           FROM cart_items ci
           LEFT JOIN products p ON p.id = ci.product_id
           LEFT JOIN bundles  b ON b.id = ci.bundle_id
           WHERE ci.customer_id = $1`,
          [customerId]
        );

        for (const item of cartItems) {
          await db.query(
            `INSERT INTO order_items
               (order_id, product_id, bundle_id, quantity, unit_price)
             VALUES ($1, $2, $3, $4, $5)`,
            [order.id, item.product_id, item.bundle_id, item.quantity, item.unit_price]
          );
        }

        // Clear cart
        await db.query('DELETE FROM cart_items WHERE customer_id = $1', [customerId]);

        console.log(`✅  Order ${order.id} created for customer ${customerId}`);
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
