const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  let token = null;

  if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  } else {
    const authHeader = req.header('Authorization');
    if (authHeader) {
      token = authHeader.replace('Bearer ', '');
    }
  }
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
