/**
 * Reset admin password from the command line.
 * Usage: node reset-password.js <email> <newpassword>
 * Run from the backend folder.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db     = require('./src/db');

const [,, email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node reset-password.js <email> <newpassword>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(password, 12);
  const { rowCount } = await db.query(
    'UPDATE admins SET password_hash = $1 WHERE email = $2',
    [hash, email.toLowerCase()]
  );
  if (rowCount === 0) {
    console.error(`No admin found with email: ${email}`);
    process.exit(1);
  }
  console.log(`✓ Password reset for ${email}`);
  process.exit(0);
})().catch(err => { console.error(err.message); process.exit(1); });
