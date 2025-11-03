const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // console.log('Auth header:', authHeader);
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) console.log('JWT verify error: ');
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    // console.log('Authenticated user:', req.user);
    next();
  });
}

module.exports = authenticateToken;


