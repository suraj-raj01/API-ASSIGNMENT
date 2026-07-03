const jwt = require('jsonwebtoken');

/**
 * Verify JWT token middleware. Checks for a valid token in the Authorization header or in the 'token' header.
 */
module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const rawToken = req.headers['token'];

    const token = authHeader
      ? authHeader.replace('Bearer ', '').trim()
      : rawToken;

    if (!token) {
      return res.status(401).json({
        status_code: '401',
        message: 'Token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({
      status_code: '401',
      message: 'Invalid or expired token'
    });
  }
};
