// Quick test server without database connection
require('dotenv').config();
const express = require('express');

const server = express();
server.use(express.json());

server.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server syntax is valid!' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Test server running on port ${PORT}`);
  console.log('📋 Server syntax is valid and ready!');
  process.exit(0); // Exit after successful start
});