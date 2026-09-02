const jwt = require('jsonwebtoken');

/**
 * Verifies the Authorization: Bearer <token> header.
 * Attaches decoded payload to req.admin.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing access token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload;   // { id, email, iat, exp }
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Access token expired'
      : 'Invalid access token';
    return res.status(401).json({ error: msg });
  }
}

module.exports = { requireAuth };
