const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sendqueue_super_secret_dev_key_2026_change_in_production';

function authenticateToken(req, res, next) {
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token.' });
  }
}

module.exports = {
  authenticateToken,
  JWT_SECRET
};
