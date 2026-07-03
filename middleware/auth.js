const jwt = require('jsonwebtoken');

/**
 * Requires a valid JWT in the request header.
 * Accepts either:
 *   Authorization: Bearer <token>
 * or:
 *   token: <token>
 *
 * Per the spec ("Pass any user token in Header"), any signed, valid
 * token is accepted -- it does not have to belong to a specific admin.
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
