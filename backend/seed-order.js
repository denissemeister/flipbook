require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('./src/db');

async function seed() {
  // Find the test customer
  const { rows: [customer] } = await db.query(
    `SELECT id FROM customers WHERE email = 'test@test.com'`
  );
  if (!customer) { console.error('No customer with email test@test.com found.'); process.exit(1); }

  // Find the first available book
  const { rows: [book] } = await db.query(`SELECT id, title FROM books LIMIT 1`);
  if (!book) { console.error('No books found — create a book in the editor first.'); process.exit(1); }

  // Create order
  const { rows: [order] } = await db.query(
    `INSERT INTO orders (customer_id, order_number, total, currency, status)
     VALUES ($1, $2, 29.99, 'USD', 'paid')
     RETURNING id`,
    [customer.id, 'ORD-TEST-001']
  );

  // Create order item (book_status = 'pending' = ready to personalize)
  await db.query(
    `INSERT INTO order_items (order_id, book_id, unit_price, book_status)
     VALUES ($1, $2, 29.99, 'pending')`,
    [order.id, book.id]
  );

  console.log(`✓ Order ORD-TEST-001 created for customer test@test.com`);
  console.log(`  Book: "${book.title}"`);
  process.exit(0);
}

seed().catch(err => { console.error(err.message); process.exit(1); });
