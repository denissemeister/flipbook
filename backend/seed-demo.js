/**
 * seed-demo.js
 * Creates a demo book + order assigned to the customer so they can
 * test the personalization / recording flow.
 *
 * Usage:
 *   node seed-demo.js <customer-email>
 * Example:
 *   node seed-demo.js denissemeister@gmail.com
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const customerEmail = process.argv[2];
if (!customerEmail) {
  console.error('Usage: node seed-demo.js <customer-email>');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get admin
    const { rows: admins } = await client.query('SELECT id FROM admins LIMIT 1');
    if (!admins.length) {
      console.error('No admin found. Create one first via POST /api/v1/auth/register');
      process.exit(1);
    }
    const adminId = admins[0].id;

    // 2. Get customer
    const { rows: customers } = await client.query(
      'SELECT id, first_name FROM customers WHERE email = $1', [customerEmail]
    );
    if (!customers.length) {
      console.error(`No customer found with email: ${customerEmail}`);
      process.exit(1);
    }
    const customerId = customers[0].id;
    const firstName = customers[0].first_name || 'Friend';

    // 3. Create book
    const slug = 'demo-book-' + Date.now();
    const { rows: [book] } = await client.query(
      `INSERT INTO books (admin_id, title, slug, status, orientation)
       VALUES ($1, $2, $3, 'published', 'horizontal')
       RETURNING id, slug`,
      [adminId, 'Demo Storybook', slug]
    );
    console.log(`✔ Book created: "${book.slug}" (id: ${book.id})`);

    // 4. Create 3 pages with read-aloud text
    const pageTexts = [
      'Once upon a time, in a land far away, there lived a curious little fox named Finn.',
      'Finn loved exploring the forest and discovering new things every single day.',
      'And so Finn learned that the greatest adventure is the one shared with friends.',
    ];
    for (let i = 0; i < pageTexts.length; i++) {
      const { rows: [page] } = await client.query(
        `INSERT INTO pages (book_id, page_number, read_aloud_text)
         VALUES ($1, $2, $3) RETURNING id`,
        [book.id, i + 1, pageTexts[i]]
      );
      // Add a simple text element as placeholder content
      await client.query(
        `INSERT INTO elements (page_id, layer, type, col_start, row_start, col_span, row_span, props)
         VALUES ($1, 3, 'text', 0.05, 0.3, 0.9, 0.4, $2)`,
        [page.id, JSON.stringify({
          text: pageTexts[i],
          fontSize: 28,
          color: '#222222',
          fontWeight: 'normal',
          textAlign: 'center',
        })]
      );
    }
    console.log(`✔ 3 pages created with read-aloud text`);

    // 5. Create order
    const orderNumber = 'ORD-DEMO-' + Date.now();
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (customer_id, order_number, total, status)
       VALUES ($1, $2, 0, 'paid') RETURNING id`,
      [customerId, orderNumber]
    );
    console.log(`✔ Order created: ${orderNumber}`);

    // 6. Create order item
    const { rows: [item] } = await client.query(
      `INSERT INTO order_items (order_id, book_id, unit_price, book_status)
       VALUES ($1, $2, 0, 'pending') RETURNING id`,
      [order.id, book.id]
    );
    console.log(`✔ Order item created (id: ${item.id})`);

    await client.query('COMMIT');

    console.log('\n✅ Done! Customer can now access:');
    console.log(`   http://localhost:5173/personalize/${item.id}/${book.slug}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
