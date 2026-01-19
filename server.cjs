require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
// const axios = require('axios');
const multer = require('multer');
const jwt = require('jsonwebtoken');

// const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const util = require('util'); // Node.js utility for formatting arguments

// const authenticateToken = require('../middleware/auth');
const authenticateToken = require('./middleware/auth');

const server = express();

const PROXY = process.env.PROXY || '';

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'video-scrambler',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Analytics tracking
const analytics = {
  visitors: new Set(), // Unique IP addresses
  users: new Set(), // Unique user accounts
  totalRequests: 0,
  dataTx: 0, // Data transmitted (bytes)
  dataRx: 0, // Data received (bytes)
  endpointCalls: {}, // Tally of each endpoint
  startTime: Date.now()
};

// Logs storage
const logs = {
  maxLogs: 500, // Keep last 500 logs
  entries: []
};

// Override console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function (...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logs.entries.push({
    type: 'info',
    message: message,
    timestamp: new Date().toISOString(),
    time: Date.now()
  });
  if (logs.entries.length > logs.maxLogs) {
    logs.entries.shift();
  }
  originalConsoleLog.apply(console, args);
};

console.error = function (...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logs.entries.push({
    type: 'error',
    message: message,
    timestamp: new Date().toISOString(),
    time: Date.now()
  });
  if (logs.entries.length > logs.maxLogs) {
    logs.entries.shift();
  }
  originalConsoleError.apply(console, args);
};

console.warn = function (...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logs.entries.push({
    type: 'warn',
    message: message,
    timestamp: new Date().toISOString(),
    time: Date.now()
  });
  if (logs.entries.length > logs.maxLogs) {
    logs.entries.shift();
  }
  originalConsoleWarn.apply(console, args);
};

const FRONTEND_URL = process.env.FRONTEND_URL || "videoscrambler.com";

// USE this CORS CONFIG Later

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5001',
      'https://key-ching.com',
      'https://videoscrambler.com',
      'https://www.videoscrambler.com',
      'https://microtrax.netlify.app',
      "https://servers4sqldb.uc.r.appspot.com",
      "https://orca-app-j32vd.ondigitalocean.app",
      "https://monkfish-app-mllt8.ondigitalocean.app/",
      "http://localhost:5173",
      "http://localhost:5174",
      "https://whale-app-trf6r.ondigitalocean.app",
      "http://142.93.82.161",
      "https://server.videoscrambler.com",
      "https://www.videoscrambler.com",
      "*"
      // Add any other origins you want to allow
    ];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // Allow Authorization header and other custom headers
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  // Expose headers that the client can access
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200
};

server.use(cors(corsOptions));

// // #################################################################################


let LOG_FILE;
let lastRotationCheck = new Date().getUTCDate();

/**
 * Generates a new log filename with a 2026-compliant ISO timestamp.
 */
function getNewLogPath() {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  return path.join(__dirname, `universal_${timestamp}.log`);
}

/**
 * Checks if the current date has changed and rotates the log file if necessary.
 */
function rotateLogIfNecessary() {
  const currentDay = new Date().getUTCDate();
  if (currentDay !== lastRotationCheck) {
    LOG_FILE = getNewLogPath();
    lastRotationCheck = currentDay;
    // Optional: Log rotation event to the new file
    fs.appendFileSync(LOG_FILE, `--- Log rotated on ${new Date().toISOString()} ---\n`);
  }
}

function overrideConsole() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  LOG_FILE = getNewLogPath();

  const appendToFile = (level, ...args) => {
    rotateLogIfNecessary();

    const message = util.format(...args);
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${level.toUpperCase()}]: ${message}\n`;

    // Use asynchronous append to prevent blocking the event loop
    fs.appendFile(LOG_FILE, logEntry, (err) => {
      if (err) originalError('Failed to write to log file:', err);
    });
  };
  // Monkey-patch console.error
  console.log = (...args) => {
    appendToFile('info', ...args);
    originalLog.apply(console, args);// Also call the original console method to display in terminal
  };
  // Monkey-patch console.error
  console.warn = (...args) => {
    appendToFile('warn', ...args);
    originalWarn.apply(console, args);
  };
  // Monkey-patch console.error
  console.error = (...args) => {
    appendToFile('error', ...args);
    originalError.apply(console, args);
  };
}

// Activate the console override immediately
overrideConsole();


// --- Express Endpoints ---

// Log some test messages using the *now-overridden* console methods
console.log("Console logging is now being redirected to the webpage endpoint.");
console.warn("This is a sample warning message!");
console.error("This is a sample error message!");






// ###########################################################
//                    server routes
// ###########################################################

server.use(express.json({ limit: '250mb' }));
server.use(express.urlencoded({ extended: true, limit: '250mb' }));

// Admin Dashboard Page

// let pageVisits = [];
// let recentRequests = [];
// const startTime = Date.now();

// // Middleware to track page visits and requests
// server.use((req, res, next) => {
//   const ip = req.ip || req.connection.remoteAddress;
//   const geo = geoip.lookup(ip);
//   const visit = {
//     count: pageVisits.length + 1,
//     url: req.originalUrl,
//     time: new Date().toISOString(),
//     ip: ip,
//     location: geo ? `${geo.city}, ${geo.country}` : 'Unknown'
//   };
//   pageVisits.push(visit);

//   const request = {
//     method: req.method,
//     url: req.originalUrl,
//     time: new Date().toISOString(),
//     ip: ip
//   };
//   recentRequests.unshift(request);
//   if (recentRequests.length > 20) recentRequests.pop();

//   next();
// });

// // Request logging middleware
// server.use((req, res, next) => {
//   console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
//   next();
// });

// // Root route
// server.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// Serve static files from public directory
server.use(express.static('public'));

// Request logging middleware with analytics
server.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);

  // Track visitor IP
  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  if (ip) {
    analytics.visitors.add(ip);
  }

  // Track total requests
  analytics.totalRequests++;

  // Track data received (request size)
  const contentLength = parseInt(req.headers['content-length']) || 0;
  analytics.dataRx += contentLength;

  // Track endpoint calls
  const endpoint = `${req.method} ${req.path}`;
  analytics.endpointCalls[endpoint] = (analytics.endpointCalls[endpoint] || 0) + 1;

  // Track data transmitted (response size)
  const originalSend = res.send;
  res.send = function (data) {
    if (data) {
      const size = Buffer.byteLength(typeof data === 'string' ? data : JSON.stringify(data));
      analytics.dataTx += size;
    }
    originalSend.call(this, data);
  };

  next();
});

// Root route
server.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Endpoint to fetch and display the raw logs
server.get('/log-file', (req, res) => {
  fs.readFile(LOG_FILE, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading log file for endpoint:', err);
      return res.status(500).send('Error reading logs.');
    }
    res.setHeader('Content-Type', 'text/plain');
    res.send(data);
  });
});

// A sample endpoint to generate more log activity
server.get('/generate-activity', (req, res) => {
  console.log(`User accessed /generate-activity endpoint (IP: ${req.ip})`);
  res.send('Activity logged using console.log()! Check your main page.');
});

// Server landing page route
server.get('/server', async (req, res) => {
  try {
    const uptime = process.uptime();
    const uptimeFormatted = {
      days: Math.floor(uptime / 86400),
      hours: Math.floor((uptime % 86400) / 3600),
      minutes: Math.floor((uptime % 3600) / 60),
      seconds: Math.floor(uptime % 60)
    };

    const memoryUsage = process.memoryUsage();
    const memoryFormatted = {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
    };

    // Get database stats
    const [dbStats] = await pool.execute('SHOW STATUS LIKE "Threads_connected"');
    const dbConnections = dbStats[0]?.Value || 'N/A';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Key-Ching Server - Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    .header h1 {
      font-size: 3em;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .header p {
      font-size: 1.2em;
      opacity: 0.9;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      transition: transform 0.3s ease;
    }
    .stat-card:hover {
      transform: translateY(-5px);
    }
    .stat-card h3 {
      color: #667eea;
      margin-bottom: 15px;
      font-size: 1.1em;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #333;
      margin: 10px 0;
    }
    .stat-label {
      color: #666;
      font-size: 0.9em;
    }
    .console-box {
      background: #1e1e1e;
      border-radius: 12px;
      padding: 20px;
      color: #d4d4d4;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      max-height: 400px;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .console-box h3 {
      color: #4ec9b0;
      margin-bottom: 15px;
    }
    .log-entry {
      padding: 5px 0;
      border-bottom: 1px solid #333;
    }
    .log-time {
      color: #858585;
    }
    .log-error {
      color: #f48771;
    }
    .log-info {
      color: #4ec9b0;
    }
    .log-warn {
      color: #dcdcaa;
    }
    .status-indicator {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4caf50;
      animation: pulse 2s infinite;
      margin-right: 8px;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .endpoints {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-top: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .endpoints h3 {
      color: #667eea;
      margin-bottom: 15px;
    }
    .endpoint-item {
      padding: 10px;
      margin: 5px 0;
      background: #f5f5f5;
      border-radius: 6px;
      font-family: monospace;
    }
    .method {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: bold;
      margin-right: 10px;
      font-size: 0.85em;
    }
    .get { background: #61affe; color: white; }
    .post { background: #49cc90; color: white; }
    .patch { background: #fca130; color: white; }
    .delete { background: #f93e3e; color: white; }
    .request-count {
      float: right;
      background: #667eea;
      color: white;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔑 Key-Ching Server</h1>
      <p><span class="status-indicator"></span>Server is running</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <h3>⏱️ Uptime</h3>
        <div class="stat-value">${uptimeFormatted.days}d ${uptimeFormatted.hours}h ${uptimeFormatted.minutes}m</div>
        <div class="stat-label">${Math.floor(uptime)} seconds total</div>
      </div>

      <div class="stat-card">
        <h3>💾 Memory Usage</h3>
        <div class="stat-value">${memoryFormatted.heapUsed}</div>
        <div class="stat-label">Heap: ${memoryFormatted.heapTotal}</div>
      </div>

      <div class="stat-card">
        <h3>🔌 Database</h3>
        <div class="stat-value">${dbConnections}</div>
        <div class="stat-label">Active connections</div>
      </div>

      <div class="stat-card">
        <h3>🌐 Environment</h3>
        <div class="stat-value">${process.env.NODE_ENV || 'development'}</div>
        <div class="stat-label">Port: ${PORT}</div>
      </div>

      <div class="stat-card">
        <h3>👥 Visitors</h3>
        <div class="stat-value">${analytics.visitors.size}</div>
        <div class="stat-label">Unique IP addresses</div>
      </div>

      <div class="stat-card">
        <h3>👤 Users</h3>
        <div class="stat-value">${analytics.users.size}</div>
        <div class="stat-label">Registered accounts accessed</div>
      </div>

      <div class="stat-card">
        <h3>📊 Total Requests</h3>
        <div class="stat-value">${analytics.totalRequests.toLocaleString()}</div>
        <div class="stat-label">Since server start</div>
      </div>

      <div class="stat-card">
        <h3>📤 Data Transmitted</h3>
        <div class="stat-value">${(analytics.dataTx / 1024 / 1024).toFixed(2)} MB</div>
        <div class="stat-label">Total sent: ${(analytics.dataTx / 1024).toFixed(2)} KB</div>
      </div>

      <div class="stat-card">
        <h3>📥 Data Received</h3>
        <div class="stat-value">${(analytics.dataRx / 1024 / 1024).toFixed(2)} MB</div>
        <div class="stat-label">Total received: ${(analytics.dataRx / 1024).toFixed(2)} KB</div>
      </div>
    </div>

    <div class="console-box">
      <h3>📋 Server Console</h3>
      <div id="console-logs">
        <div class="log-entry">
          <span class="log-time">[${new Date().toISOString()}]</span>
          <span class="log-info">INFO:</span> Server started successfully
        </div>
        <div class="log-entry">
          <span class="log-time">[${new Date().toISOString()}]</span>
          <span class="log-info">INFO:</span> Database connection established
        </div>
        <div class="log-entry">
          <span class="log-time">[${new Date().toISOString()}]</span>
          <span class="log-info">INFO:</span> CORS configured for multiple origins
        </div>
      </div>
    </div>

    <div class="endpoints">
      <h3>🛣️ Active API Endpoints</h3>
      ${Object.entries(analytics.endpointCalls)
        .sort((a, b) => b[1] - a[1])
        .map(([endpoint, count]) => {
          const [method, ...pathParts] = endpoint.split(' ');
          const path = pathParts.join(' ');
          const methodClass = method.toLowerCase();
          return `<div class="endpoint-item">
            <span class="method ${methodClass}">${method}</span> ${path}
            <span class="request-count">${count}</span>
          </div>`;
        }).join('')}
    </div>

     <div class="endpoints">
      <h3>🛣️ Available API Endpoints</h3>
      <div class="endpoint-item"><span class="method get">GET</span> /health - Health check</div>
      <div class="endpoint-item"><span class="method post">POST</span> /api/auth/login - User login</div>
      <div class="endpoint-item"><span class="method post">POST</span> /api/auth/register - User registration</div>
      <div class="endpoint-item"><span class="method post">POST</span> /api/auth/logout - User logout</div>
      <div class="endpoint-item"><span class="method get">GET</span> /api/wallet/balance/:username - Get wallet balance</div>
      <div class="endpoint-item"><span class="method post">POST</span> /api/unlock/:keyId - Unlock a key</div>
      <div class="endpoint-item"><span class="method get">GET</span> /api/listings/:username - User listings</div>
      <div class="endpoint-item"><span class="method post">POST</span> /api/create-key - Create new key listing</div>
      <div class="endpoint-item"><span class="method get">GET</span> /api/notifications/:username - Get notifications</div>
      <div class="endpoint-item"><span class="method get">GET</span> /api/purchases/:username - Get purchase history</div>
      <div class="endpoint-item"><span class="method post">POST</span> /api/profile-picture/:username - Upload profile picture</div>
    </div>
  </div>

  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Landing page error:', error);
    res.status(500).send('<h1>Error loading dashboard</h1>');
  }
});

// Logs viewer route
server.get('/logs', (req, res) => {
  const type = req.query.type || 'all'; // Filter by type: all, info, error, warn
  const limit = parseInt(req.query.limit) || 100;

  let filteredLogs = logs.entries;
  if (type !== 'all') {
    filteredLogs = logs.entries.filter(log => log.type === type);
  }

  const displayLogs = filteredLogs.slice(-limit).reverse();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Server Logs - KeyChing</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, monospace;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    .header {
      background: #252526;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      border-left: 4px solid #007acc;
    }
    .header h1 {
      color: #4ec9b0;
      margin-bottom: 10px;
    }
    .stats {
      display: flex;
      gap: 20px;
      font-size: 14px;
    }
    .stat-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: bold;
      font-size: 12px;
    }
    .badge.info { background: #007acc; color: white; }
    .badge.error { background: #f48771; color: white; }
    .badge.warn { background: #dcdcaa; color: #1e1e1e; }
    .badge.all { background: #4ec9b0; color: #1e1e1e; }
    .controls {
      background: #252526;
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      gap: 15px;
      align-items: center;
      flex-wrap: wrap;
    }
    .controls label {
      color: #858585;
      font-size: 14px;
    }
    .controls select,
    .controls input {
      background: #3c3c3c;
      border: 1px solid #555;
      color: #d4d4d4;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
    }
    .controls button {
      background: #007acc;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.3s;
    }
    .controls button:hover {
      background: #005a9e;
    }
    .controls button.clear {
      background: #f48771;
    }
    .controls button.clear:hover {
      background: #d9534f;
    }
    .log-container {
      background: #252526;
      border-radius: 8px;
      padding: 15px;
      max-height: calc(100vh - 300px);
      overflow-y: auto;
    }
    .log-entry {
      padding: 10px 12px;
      border-left: 3px solid transparent;
      margin-bottom: 8px;
      border-radius: 4px;
      background: #1e1e1e;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
    }
    .log-entry.info {
      border-left-color: #4ec9b0;
    }
    .log-entry.error {
      border-left-color: #f48771;
      background: #2d1f1f;
    }
    .log-entry.warn {
      border-left-color: #dcdcaa;
      background: #2d2d1f;
    }
    .log-time {
      color: #858585;
      font-size: 11px;
      margin-right: 10px;
    }
    .log-type {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      margin-right: 10px;
      text-transform: uppercase;
    }
    .log-type.info { background: #007acc; color: white; }
    .log-type.error { background: #f48771; color: white; }
    .log-type.warn { background: #dcdcaa; color: #1e1e1e; }
    .log-message {
      color: #d4d4d4;
      word-wrap: break-word;
    }
    .no-logs {
      text-align: center;
      padding: 40px;
      color: #858585;
    }
    .auto-refresh {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .auto-refresh input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    .scroll-to-bottom {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: #007acc;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 50px;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 122, 204, 0.4);
      transition: all 0.3s;
    }
    .scroll-to-bottom:hover {
      background: #005a9e;
      transform: translateY(-2px);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Server Logs</h1>
      <div class="stats">
        <div class="stat-item">
          <span class="badge all">${logs.entries.length}</span>
          <span>Total Logs</span>
        </div>
        <div class="stat-item">
          <span class="badge info">${logs.entries.filter(l => l.type === 'info').length}</span>
          <span>Info</span>
        </div>
        <div class="stat-item">
          <span class="badge warn">${logs.entries.filter(l => l.type === 'warn').length}</span>
          <span>Warnings</span>
        </div>
        <div class="stat-item">
          <span class="badge error">${logs.entries.filter(l => l.type === 'error').length}</span>
          <span>Errors</span>
        </div>
      </div>
    </div>

    <div class="controls">
      <label>Filter:</label>
      <select id="typeFilter" onchange="filterLogs()">
        <option value="all" ${type === 'all' ? 'selected' : ''}>All Types</option>
        <option value="info" ${type === 'info' ? 'selected' : ''}>Info Only</option>
        <option value="warn" ${type === 'warn' ? 'selected' : ''}>Warnings Only</option>
        <option value="error" ${type === 'error' ? 'selected' : ''}>Errors Only</option>
      </select>
      
      <label>Limit:</label>
      <input type="number" id="limitInput" value="${limit}" min="10" max="500" step="10" onchange="filterLogs()">
      
      <div class="auto-refresh">
        <input type="checkbox" id="autoRefresh" onchange="toggleAutoRefresh()">
        <label for="autoRefresh">Auto-refresh (5s)</label>
      </div>
      
      <button onclick="location.reload()">🔄 Refresh</button>
      <button class="clear" onclick="clearLogs()">🗑️ Clear Logs</button>
      <button onclick="exportLogs()">📥 Export</button>
    </div>

    <div class="log-container" id="logContainer">
      ${displayLogs.length === 0 ? '<div class="no-logs">No logs to display</div>' : displayLogs.map(log => `
        <div class="log-entry ${log.type}">
          <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>
          <span class="log-type ${log.type}">${log.type}</span>
          <span class="log-message">${escapeHtml(log.message)}</span>
        </div>
      `).join('')}
    </div>

    <button class="scroll-to-bottom" onclick="scrollToBottom()">↓ Scroll to Bottom</button>
  </div>

  <script>
    let autoRefreshInterval = null;

    function filterLogs() {
      const type = document.getElementById('typeFilter').value;
      const limit = document.getElementById('limitInput').value;
      window.location.href = \`/logs?type=\${type}&limit=\${limit}\`;
    }

    function toggleAutoRefresh() {
      const checkbox = document.getElementById('autoRefresh');
      if (checkbox.checked) {
        autoRefreshInterval = setInterval(() => location.reload(), 5000);
      } else {
        if (autoRefreshInterval) {
          clearInterval(autoRefreshInterval);
          autoRefreshInterval = null;
        }
      }
    }

    function scrollToBottom() {
      const container = document.getElementById('logContainer');
      container.scrollTop = container.scrollHeight;
    }

    function clearLogs() {
      if (confirm('Are you sure you want to clear all logs?')) {
        fetch('/api/logs/clear', { method: 'POST' })
          .then(() => location.reload())
          .catch(err => alert('Error clearing logs: ' + err));
      }
    }

    function exportLogs() {
      fetch('/api/logs/export')
        .then(res => res.json())
        .then(data => {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = \`server-logs-\${new Date().toISOString()}.json\`;
          a.click();
          URL.revokeObjectURL(url);
        })
        .catch(err => alert('Error exporting logs: ' + err));
    }

    // Auto-scroll to bottom on load
    window.addEventListener('load', () => {
      scrollToBottom();
    });
  </script>
</body>
</html>
  `;

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  res.send(html);
});

// API endpoint to clear logs
server.post('/api/logs/clear', (req, res) => {
  logs.entries = [];
  res.json({ success: true, message: 'Logs cleared' });
});

// API endpoint to export logs
server.get('/api/logs/export', (req, res) => {
  res.json({
    exportDate: new Date().toISOString(),
    totalLogs: logs.entries.length,
    logs: logs.entries
  });
});

// API endpoint to get logs as JSON
server.get('/api/logs', (req, res) => {
  const type = req.query.type || 'all';
  const limit = parseInt(req.query.limit) || 100;

  let filteredLogs = logs.entries;
  if (type !== 'all') {
    filteredLogs = logs.entries.filter(log => log.type === type);
  }

  res.json({
    total: filteredLogs.length,
    logs: filteredLogs.slice(-limit).reverse()
  });
});

// Health check endpoint
server.get('/health', (req, res) => {
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = {
    days: Math.floor(uptimeSeconds / 86400),
    hours: Math.floor((uptimeSeconds % 86400) / 3600),
    minutes: Math.floor((uptimeSeconds % 3600) / 60),
    seconds: Math.floor(uptimeSeconds % 60)
  };

  const memoryUsage = process.memoryUsage();
  const memoryFormatted = {
    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
  };

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Health Check - Key-Ching Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      background: #10b981;
      color: white;
      padding: 12px 24px;
      border-radius: 50px;
      font-weight: bold;
      font-size: 1.2em;
      margin-bottom: 30px;
    }
    .status-indicator {
      width: 12px;
      height: 12px;
      background: white;
      border-radius: 50%;
      margin-right: 10px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    h1 {
      color: #333;
      margin-bottom: 30px;
      font-size: 2em;
    }
    .info-grid {
      display: grid;
      gap: 20px;
    }
    .info-item {
      background: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      border-left: 4px solid #667eea;
    }
    .info-label {
      color: #64748b;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .info-value {
      color: #1e293b;
      font-size: 1.3em;
      font-weight: 600;
    }
    .timestamp {
      text-align: center;
      color: #64748b;
      font-size: 0.9em;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="status-badge">
      <span class="status-indicator"></span>
      System Healthy
    </div>
    
    <h1>🔑 Key-Ching Server</h1>
    
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Environment</div>
        <div class="info-value">${process.env.NODE_ENV || 'development'}</div>
      </div>
      
      <div class="info-item">
        <div class="info-label">Server Uptime</div>
        <div class="info-value">${uptimeFormatted.days}d ${uptimeFormatted.hours}h ${uptimeFormatted.minutes}m ${uptimeFormatted.seconds}s</div>
      </div>
      
      <div class="info-item">
        <div class="info-label">Memory Usage</div>
        <div class="info-value">${memoryFormatted.heapUsed} / ${memoryFormatted.heapTotal}</div>
      </div>
      
      <div class="info-item">
        <div class="info-label">Database</div>
        <div class="info-value">Configured (${dbConfig.database})</div>
      </div>
      
      <div class="info-item">
        <div class="info-label">Port</div>
        <div class="info-value">${PORT}</div>
      </div>
    </div>
    
    <div class="timestamp">
      Last checked: ${new Date().toISOString()}
    </div>
  </div>
  
  <script>
    (function() {
      const RELOAD_INTERVAL = 30000;

      function scheduleReload() {
        return setTimeout(() => {
          if (document.visibilityState === 'visible') {
            location.reload();
          }
        }, RELOAD_INTERVAL);
      }

      let reloadTimeoutId = scheduleReload();

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          clearTimeout(reloadTimeoutId);
          reloadTimeoutId = scheduleReload();
        } else {
          clearTimeout(reloadTimeoutId);
        }
      });
    })();
  </script>
</body>
</html>
  `;

  res.send(html);
});


// ============================================
// DATABASE MANAGEMENT ENDPOINTS
// ============================================

// Serve database manager HTML page
server.get('/db-manager', (req, res) => {
  res.sendFile(__dirname + '/public/db-manager.html');
});

// Get database statistics
server.get('/api/db-stats', async (req, res) => {
  try {
    // Get database size
    const [sizeResult] = await pool.execute(`
      SELECT 
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
      FROM information_schema.TABLES 
      WHERE table_schema = ?
    `, [dbConfig.database]);

    // Get total tables
    const [tablesResult] = await pool.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.TABLES 
      WHERE table_schema = ?
    `, [dbConfig.database]);

    // Get active connections
    const [connectionsResult] = await pool.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.PROCESSLIST 
      WHERE DB = ?
    `, [dbConfig.database]);

    // Get total records across all tables
    const [allTables] = await pool.execute(`
      SELECT table_name 
      FROM information_schema.TABLES 
      WHERE table_schema = ?
    `, [dbConfig.database]);

    let totalRecords = 0;
    for (const table of allTables) {
      const [countResult] = await pool.execute(`SELECT COUNT(*) as count FROM ${table.table_name}`);
      totalRecords += countResult[0].count;
    }

    // Get table details
    const [tableDetails] = await pool.execute(`
      SELECT 
        table_name,
        table_rows,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb,
        engine,
        table_collation
      FROM information_schema.TABLES 
      WHERE table_schema = ?
      ORDER BY table_name
    `, [dbConfig.database]);

    res.json({
      databaseSize: sizeResult[0].size_mb,
      totalTables: tablesResult[0].count,
      activeConnections: connectionsResult[0].count,
      totalRecords: totalRecords,
      tables: tableDetails,
      databaseName: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port
    });
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve database statistics', message: error.message });
  }
});

// Get list of tables with details
server.get('/api/db-tables', async (req, res) => {
  try {
    const [tables] = await pool.execute(`
      SELECT 
        table_name as name,
        table_rows as rows,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS size,
        engine,
        create_time,
        update_time
      FROM information_schema.TABLES 
      WHERE table_schema = ?
      ORDER BY table_name
    `, [dbConfig.database]);

    const formattedTables = tables.map(table => ({
      name: table.name,
      rows: table.rows,
      size: `${table.size} MB`,
      engine: table.engine,
      created: table.create_time,
      updated: table.update_time
    }));

    res.json({ tables: formattedTables });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ error: 'Failed to retrieve tables', message: error.message });
  }
});

// Get records from a specific table with pagination and search
server.get('/api/db-records/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';

    // Validate table name exists
    const [tableCheck] = await pool.execute(`
      SELECT table_name 
      FROM information_schema.TABLES 
      WHERE table_schema = ? AND table_name = ?
    `, [dbConfig.database, tableName]);

    if (tableCheck.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM ${tableName}`;
    let dataQuery = `SELECT * FROM ${tableName}`;
    const params = [];

    // Add search filter if provided
    if (search) {
      // Get column names
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = ? AND table_name = ?
      `, [dbConfig.database, tableName]);

      const searchConditions = columns.map(col => `${col.COLUMN_NAME} LIKE ?`).join(' OR ');
      const searchParams = columns.map(() => `%${search}%`);

      countQuery += ` WHERE ${searchConditions}`;
      dataQuery += ` WHERE ${searchConditions}`;
      params.push(...searchParams);
    }

    // Get total count
    const [countResult] = await pool.execute(countQuery, params);
    const total = countResult[0].total;

    // Get records with pagination
    dataQuery += ` LIMIT ? OFFSET ?`;
    const [records] = await pool.execute(dataQuery, [...params, limit, offset]);

    res.json({
      records,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({ error: 'Failed to retrieve records', message: error.message });
  }
});

// Execute raw SQL query (SELECT only for safety)
server.post('/api/db-query', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Only allow SELECT queries for safety
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT') && !trimmedQuery.startsWith('SHOW') && !trimmedQuery.startsWith('DESCRIBE')) {
      return res.status(403).json({ error: 'Only SELECT, SHOW, and DESCRIBE queries are allowed' });
    }

    const [results] = await pool.execute(query);

    res.json({
      success: true,
      results,
      rowCount: results.length
    });
  } catch (error) {
    console.error('Query execution error:', error);
    res.status(500).json({ error: 'Query execution failed', message: error.message });
  }
});



// ----------------------------------------------------
// Authentication Routes
// ----------------------------------------------------

// Custom authentication route
server.post(PROXY + '/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const [users] = await pool.execute(
      'SELECT * FROM userData WHERE email = ?',
      [email]
    );

    const user = users[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Account is banned',
        banReason: user.banReason
      });
    }

    // Compare password with hash
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (isValidPassword) {
      const userData = { ...user };
      delete userData.passwordHash; // Don't send password hash

      // Update last login with proper MySQL datetime format
      const currentDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

      await pool.execute(
        'UPDATE userData SET loginStatus = true, lastLogin = ? WHERE email = ?',
        [currentDateTime, email]
      );

      // Generate a proper JWT-like token (in production, use actual JWT)
      // const token = Buffer.from(`${user.id}_${Date.now()}_${Math.random()}`).toString('base64');

      // const token = jwt.sign({ id: user.id, user_id: user.user_id, accountId: user.account_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const token = jwt.sign({
        id: user.id,
        email: user.email,
        username: user.username,  // Add this line
        credits: user.credits
      }, process.env.JWT_SECRET, { expiresIn: '1h' });

      res.json({ token, user: { id: user.id, username: user.username, email: user.email, credits: user.credits } });

      // res.json({
      //   success: true,
      //   user: userData,
      //   token: token,
      //   message: 'Login successful'
      // });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during login'
    });
  }
});



// Custom fetch account details route
server.post(PROXY + '/api/user', async (req, res) => {
  console.log("Fetching user details...");
  try {
    const { email, username, password } = req.body;
    //  console.log("User found:", user.username);
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const [users] = await pool.execute(
      'SELECT * FROM userData WHERE email = ?',
      [email]
    );

    const user = users[0];

    const [action_db] = await pool.execute(
      'SELECT * FROM actions WHERE email = ?',
      [email]
    );

    actions = action_db;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Account is banned',
        banReason: user.banReason
      });
    }


    // Compare password with hash
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (isValidPassword) {
      const userData = { ...user };
      delete userData.passwordHash; // Don't send password hash

      // Update last login with proper MySQL datetime format
      // const currentDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // Generate a proper JWT-like token (in production, use actual JWT)
      const token = Buffer.from(`${user.id}_${Date.now()}_${Math.random()}`).toString('base64');


      res.json({
        success: true,
        user: userData,
        unlocks: actions,
        dayPassExpiry: user.dayPassExpiry,
        dayPassMode: user.dayPassMode,
        planExpiry: user.planExpiry,
        token: token,
        message: 'Login successful'
      });
      // }

    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during login'
    });
  }
});



// Custom registration route
server.post(PROXY + '/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, accountType, birthDate } = req.body;

    // Validate required fields
    if (!username || !email || !password || !firstName) {
      return res.status(400).json({
        success: false,
        message: 'Username, email, password, and first name are required'
      });
    }

    // Check if username already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM userData WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // Hash the password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Helper function to convert ISO datetime to MySQL format
    const formatDateTimeForMySQL = (dateTime) => {
      if (!dateTime) return null;
      if (typeof dateTime === 'string') {
        return new Date(dateTime).toISOString().slice(0, 19).replace('T', ' ');
      }
      if (typeof dateTime === 'number') {
        return new Date(dateTime).toISOString().slice(0, 19).replace('T', ' ');
      }
      return null;
    };

    // Generate a unique ID (since the schema uses VARCHAR(10))
    const generateId = () => {
      return Math.random().toString(36).substring(2, 12).toUpperCase();
    };

    const userId = generateId();
    const currentTime = Date.now();
    const currentDateTime = formatDateTimeForMySQL(new Date());

    console.log("Account type during registration:", accountType);

    const newUser = {
      id: userId,
      loginStatus: true,
      lastLogin: currentDateTime,
      accountType: accountType || 'free',
      username: username,
      email: email,
      firstName: firstName,
      lastName: lastName || '',
      phoneNumber: '',
      birthDate: birthDate || null,
      encryptionKey: `enc_key_${Date.now()}`,
      credits: 100, // Starting credits
      reportCount: 0,
      isBanned: false,
      banReason: '',
      banDate: null,
      banDuration: null,
      createdAt: currentTime,
      updatedAt: currentTime,
      passwordHash: passwordHash,
      twoFactorEnabled: false,
      twoFactorSecret: '',
      recoveryCodes: [],
      profilePicture: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70) + 1}`,
      bio: '',
      socialLinks: {}
    };

    const [result] = await pool.execute(
      'INSERT INTO userData (id, loginStatus, lastLogin, accountType, username, email, firstName, lastName, phoneNumber, birthDate, encryptionKey, credits, reportCount, isBanned, banReason, banDate, banDuration, createdAt, updatedAt, passwordHash, twoFactorEnabled, twoFactorSecret, recoveryCodes, profilePicture, bio, socialLinks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        newUser.id,
        newUser.loginStatus,
        newUser.lastLogin,
        newUser.accountType,
        newUser.username,
        newUser.email,
        newUser.firstName,
        newUser.lastName,
        newUser.phoneNumber,
        newUser.birthDate,
        newUser.encryptionKey,
        newUser.credits,
        newUser.reportCount,
        newUser.isBanned,
        newUser.banReason,
        formatDateTimeForMySQL(newUser.banDate),
        newUser.banDuration,
        newUser.createdAt,
        newUser.updatedAt,
        newUser.passwordHash,
        newUser.twoFactorEnabled,
        newUser.twoFactorSecret,
        JSON.stringify(newUser.recoveryCodes),
        newUser.profilePicture,
        newUser.bio,
        JSON.stringify(newUser.socialLinks)
      ]
    );



    // Generate token for automatic login
    const token = Buffer.from(`${userId}_${Date.now()}_${Math.random()}`).toString('base64');

    // Return user data without password hash
    const userData = { ...newUser };
    delete userData.passwordHash;

    res.status(201).json({
      success: true,
      user: userData,
      token: token,
      message: 'Account created successfully'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during registration'
    });
  }
});

// Email verification 
// email-service.js
const nodemailer = require('nodemailer');

// // Configure nodemailer with your SMTP settings
// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST || 'smtp.example.com',
//   port: process.env.SMTP_PORT || 587,
//   secure: process.env.SMTP_SECURE === 'true',
//   auth: {
//     user: process.env.SMTP_USER || 'your-email@example.com',
//     pass: process.env.SMTP_PASS || 'your-password'
//   }
// });

const transporter = nodemailer.createTransport({
  host: 'mail.videoscrambler.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'emailuser@videoscrambler.com',
    pass: 'Password!*'
  }
});

// async function sendPromoEmail(recipients) {
//   const mailOptions = {
//     from: '"Your Company" <noreply@yourdomain.com>',
//     to: recipients.join(', '),
//     subject: 'Monthly Promotion',
//     html: '<h1>Special Offer This Month!</h1><p>Your promo content here...</p>'
//   };

//   await transporter.sendMail(mailOptions);
// }

// const recipients = ['ikemuru@gmail.com', 'ikenuru@gmail.com'];
// sendPromoEmail(recipients)

// // Schedule promotional email every 30 days (only runs after the first interval)
// const sendScheduledPromoEmail = () => {
//   const recipients = ['ikemuru@gmail.com', 'ikenuru@gmail.com'];
//   sendPromoEmail(recipients)
//     .then(() => console.log('Promotional email sent successfully'))
//     .catch(err => console.error('Error sending promotional email:', err));
//   console.log('Scheduled promotional email sent to:', recipients);
// };

// // Set up the interval to run every 30 days
// setInterval(sendScheduledPromoEmail, 30 * 24 * 60 * 60 * 1000);
// console.log('Promotional email scheduler initialized. First email will be sent in 30 days.');

// Send password reset email
async function sendPasswordResetEmail(email, username, newPassword) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Admin System" <admin@example.com>',
      to: email,
      subject: 'Your Password Has Been Reset',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333;">Password Reset</h2>
          <p>Hello ${username},</p>
          <p>Your password ha s been reset by an administrator.</p>
          <p>Your new password is: <strong>${newPassword}</strong></p>
          <p>Please login with this password and change it immediately for security reasons.</p>
          <p style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

module.exports = {
  sendPasswordResetEmail
};


// Custom logout route
server.post(PROXY + '/api/auth/logout', async (req, res) => {
  try {
    const { username } = req.body;

    if (username) {
      // Update login status in database
      await pool.execute(
        'UPDATE userData SET loginStatus = false WHERE username = ?',
        [username]
      );
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during logout'
    });
  }
});

// Custom wallet balance route
server.post(PROXY + '/api/wallet/balance/:username', authenticateToken, async (req, res) => {
  try {
    // const username = req.query.username || 'user_123'; // Default for demo
    const username = req.params.username;
    // const password = req.body.password || '';
    const email = req.body.email;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // const [wallets] = await pool.execute(
    //   'SELECT * FROM wallet WHERE username = ?',
    //   [username]
    // );

    console.log("Fetching wallet balance for user:", username, " : ", email);

    const [users] = await pool.execute(
      'SELECT credits FROM userData WHERE username = ? and email = ?',
      [username, email]
    );

    const user = users[0];

    if (user) {
      res.json({
        balance: user.credits,
        credits: user.credits,
      });
      console.log(`User ${username} has ${user.credits} credits.`);
    } else {
      res.json({ balance: 750, credits: 750 }); // Default demo values
    }
  } catch (error) {
    console.error('Wallet balance error:', error);
    res.status(500).json({ error: 'Database error - wallet balance retrieval failed' });
  }
});



const handlePurchasePass = async () => {
  const cost = modeCredits[selectedMode];

  if (balance < cost) {
    error(`Insufficient credits. You need ${cost} credits but only have ${balance}.`);
    setShowModeModal(false);
    return;
  }

  try {
    // Placeholder API call - will be connected to backend later
    const response = await api.post('/api/purchase-mode-pass', {
      username: userData.username,
      mode: selectedMode,
      cost: cost,
      timestamp: new Date().toISOString()
    });

    if (response.data.success) {
      setBalance(balance - cost);
      setServiceMode(selectedMode);
      setShowModeModal(false);
      success(`🎉 ${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)} pass activated! ${cost} credits deducted.`);
    }
  } catch (err) {
    console.error('Mode pass purchase error:', err);
    error('Failed to purchase mode pass. Please try again.');
  }
};


// Custom route for purchasing mode pass 24 hours
server.post(PROXY + '/api/purchase-mode-pass', authenticateToken, async (req, res) => {

  try {
    const { username, mode, cost, timestamp } = req.body;
    console.log("Purchase mode pass request:", req.body);


    // Basic validation
    if (!username) {
      return res.status(400).json({ success: false, message: 'username and action (with cost) are required' });
    }

    // const cost = Number(cost);
    if (Number.isNaN(cost) || cost <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid action cost' });
    }

    const [users] = await pool.execute(
      'SELECT * FROM userData WHERE username = ?',
      [username]
    );

    const user = users[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`User ${username} is attempting to spend ${cost} credits.`);

    if (user.credits < cost) {
      return res.status(400).json({ success: false, message: 'Insufficient credits' });
    }

    // Deduct buyer credits
    await pool.execute(
      'UPDATE userData SET credits = credits - ? WHERE email = ?',
      [cost, user.email]
    );

    // set the value of the day pass expiry for the buyer to now + 24 hours
    await pool.execute(
      'UPDATE userData SET dayPassExpiry = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE email = ?',
      [user.email]
    );

    // set the value of the day pass expiry for the buyer to now + 24 hours
    await pool.execute(
      'UPDATE userData SET dayPassMode = ? WHERE email = ?',
      [mode, user.email]
    );

    // Get updated credits
    const [updatedRows] = await pool.execute(
      'SELECT credits FROM userData WHERE email = ?',
      [user.email]
    );

    // CREATE TABLE
    // `dayPasses` (
    //   `id` bigint NOT NULL AUTO_INCREMENT,
    //   `user_id` bigint NOT NULL,
    //   `pass_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    //   `pass_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    //   `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    //   `begins_at` timestamp NULL DEFAULT NULL,
    //   `expires_at` timestamp NULL DEFAULT NULL,
    //   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    //   `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    //   `email` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    //   `username` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    //   PRIMARY KEY (`id`),
    //   KEY `idx_user_id` (`user_id`),
    //   KEY `idx_status` (`status`),
    //   KEY `idx_user_status` (`user_id`, `status`)
    // ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci

    // Insert day pass record into database
    const passId = uuidv4();
    const beginsAt = new Date();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.execute(
      'INSERT INTO dayPasses (user_id, pass_id, pass_type, status, begins_at, expires_at, email, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        user.id,
        passId,
        mode,
        'active',
        beginsAt.toISOString().slice(0, 19).replace('T', ' '),
        expiresAt.toISOString().slice(0, 19).replace('T', ' '),
        user.email,
        user.username
      ]
    );


    const updatedCredits = updatedRows[0] ? updatedRows[0].credits : (user.credits - cost);

    // Create credit spend record
    const transactionId = uuidv4();

    await pool.execute(
      'INSERT INTO actions (id, transactionId, username, email, date, time, credits, action_type, action_cost, action_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        transactionId,
        user.username, // Demo user
        user.email,
        Date.now(),
        new Date().toLocaleTimeString(),
        updatedCredits,
        "purchase_mode_pass",
        cost,
        "Purchased " + mode + " mode pass"
      ]
    );

    await CreateNotification(
      'credits_spent',
      `Credits Spent: Purchased ${mode} mode pass`,
      `You have spent ${cost} credits to purchase a ${mode} mode pass (24 hours).`,
      "purchase_mode_pass",
      username || 'anonymous'
    );

    res.json({
      success: true,
      transactionId: transactionId,
      credits: updatedCredits,
      dayPassMode: mode,
      dayPassExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      message: 'Credits spent successfully'
    });

    console.log(`User ${username} successfully spent ${cost} credits to purchase a ${mode} mode pass (24 hours).`);


  } catch (error) {
    console.error('Purchase mode pass error:', error);
    res.status(500).json({ success: false, message: 'Database error - mode pass purchase failed' });
  }
});


// Todo: Implement spend credits functionality, replace old and borrow function unlock with spend

// Custom unlock key route
// spend credits route
server.post(PROXY + '/api/spend-credits/:username', authenticateToken, async (req, res) => {
  try {

    const { action } = req.body;
    console.log("Spend credits action:", action);
    const username = req.params.username;

    // Basic validation
    if (!username || !action || typeof action.cost === 'undefined') {
      return res.status(400).json({ success: false, message: 'username and action (with cost) are required' });
    }

    const cost = Number(action.cost);
    if (Number.isNaN(cost) || cost <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid action cost' });
    }

    const [users] = await pool.execute(
      'SELECT * FROM userData WHERE username = ?',
      [username]
    );

    const user = users[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`User ${username} is attempting to spend ${cost} credits.`);

    if (user.credits < cost) {
      return res.status(400).json({ success: false, message: 'Insufficient credits' });
    }

    // Deduct buyer credits
    await pool.execute(
      'UPDATE userData SET credits = credits - ? WHERE email = ?',
      [cost, user.email]
    );

    // Get updated credits
    const [updatedRows] = await pool.execute(
      'SELECT credits FROM userData WHERE email = ?',
      [user.email]
    );
    const updatedCredits = updatedRows[0] ? updatedRows[0].credits : (user.credits - cost);

    // Create credit spend record
    const transactionId = uuidv4();

    await pool.execute(
      'INSERT INTO actions (id, transactionId, username, email, date, time, credits, action_type, action_cost, action_description, action_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        transactionId,
        user.username, // Demo user
        user.email,
        Date.now(),
        new Date().toLocaleTimeString(),
        updatedCredits,
        action.type || null,
        cost,
        action.description || '',
        action.details || ''
      ]
    );

    await CreateNotification(
      'credits_spent',
      `Credits Spent: ${action.description || 'Purchase Successful'}`,
      `You have spent ${cost} credits for: ${action.description || 'purchase'}.`,
      action.type,
      username || 'anonymous'
    );

    res.json({
      success: true,
      transactionId: transactionId,
      credits: updatedCredits,
      message: 'Credits spent successfully'
    });

    console.log(`User ${username} successfully spent ${cost} credits to do ${action.description || 'purchase'}.`);

  } catch (error) {
    console.error('Unlock key error:', error);
    res.status(500).json({ success: false, message: 'Database error - unlock key failed' });
  }
});


// Custom route for user notifications
server.get(PROXY + '/api/notifications/:username', authenticateToken, async (req, res) => {
  try {
    const username = req.params.username;

    const [notifications] = await pool.execute(
      'SELECT * FROM notifications WHERE username = ? ORDER BY createdAt DESC',
      [username]
    );

    res.json(notifications);
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Database error - notifications retrieval failed' });
  }

});


// Custom route for deleting user notifications
server.delete(PROXY + '/api/notifications/:username/delete/:id', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const username = req.params.id;

    await pool.execute(
      'DELETE FROM notifications WHERE id = ? AND username = ?',
      [notificationId, username]
    );

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Database error - notification deletion failed' });
  }
});

// Custom route for deleting user notifications
server.delete(PROXY + '/api/notifications/delete/:id', async (req, res) => {
  try {
    const notificationId = req.params.id;

    await pool.execute(
      'DELETE FROM notifications WHERE id = ?',
      [notificationId]
    );

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Database error - notification deletion failed' });
  }
});


// CREATE TABLE
//   `notifications` (
//     `id` varchar(10) NOT NULL,
//     `type` varchar(50) DEFAULT NULL,
//     `title` varchar(255) DEFAULT NULL,
//     `message` text,
//     `createdAt` datetime DEFAULT NULL,
//     `priority` enum('success', 'info', 'warning', 'error') DEFAULT 'info',
//     `category` enum('buyer', 'seller') NOT NULL,
//     `username` varchar(50) DEFAULT NULL,
//     `isRead` tinyint(1) DEFAULT '0',
//     PRIMARY KEY (`id`),
//     KEY `username` (`username`),
//     CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`username`) REFERENCES `userData` (`username`) ON DELETE CASCADE
//   ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci

async function CreateNotification(type, title, message, category, username, priority = 'info') {
  const [notifications] = await pool.execute(
    'INSERT INTO notifications (id, type, title, message, createdAt, priority, category, username, isRead) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      Math.random().toString(36).substring(2, 12).toUpperCase(),
      type,
      title,
      message,
      new Date().toISOString().slice(0, 19).replace('T', ' '),
      priority,
      category,
      username,
      0
    ]
  );

  return {
    id: Math.random().toString(36).substring(2, 12).toUpperCase(),
    type,
    title,
    message,
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    priority,
    category,
    username,
    isRead: 0
  };
}

// 

//  const newUser = {
//   loginStatus: true,
//   lastLogin: new Date().toISOString(),
//   accountType: accountType || 'buyer',
//   username: username,
//   email: email,
//   firstName: name.split(' ')[0] || name,
//   lastName: name.split(' ').slice(1).join(' ') || '',
//   phoneNumber: '',
//   birthDate: birthday,
//   encryptionKey: `enc_key_${Date.now()}`,
//   credits: 100, // Starting credits
//   reportCount: 0,
//   isBanned: false,
//   banReason: '',
//   banDate: null,
//   banDuration: null,
//   createdAt: Date.now(),
//   updatedAt: Date.now(),
//   passwordHash: '$2b$10$hashedpassword', // Demo hash
//   twoFactorEnabled: false,
//   twoFactorSecret: '',
//   recoveryCodes: [],
//   profilePicture: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70) + 1}`,
//   bio: '',
//   socialLinks: {
//     facebook: '',
//     twitter: '',
//     instagram: '',
//     linkedin: '',
//     website: ''
//   }
// };

// // Create user in server


server.post(PROXY + '/api/userData', async (req, res) => {
  try {
    const newUser = req.body;

    console.log('Creating new user:', newUser);

    // Helper function to convert ISO datetime to MySQL format
    const formatDateTimeForMySQL = (dateTime) => {
      if (!dateTime) return null;
      if (typeof dateTime === 'string') {
        // Convert ISO 8601 to MySQL datetime format (YYYY-MM-DD HH:mm:ss)
        return new Date(dateTime).toISOString().slice(0, 19).replace('T', ' ');
      }
      if (typeof dateTime === 'number') {
        // Convert timestamp to MySQL datetime format
        return new Date(dateTime).toISOString().slice(0, 19).replace('T', ' ');
      }
      return null;
    };

    // Generate a unique ID (since the schema uses VARCHAR(10))
    const generateId = () => {
      return Math.random().toString(36).substring(2, 8); // Generates a 6-character random string
    };

    const userId = newUser.id || generateId();

    const [result] = await pool.execute(
      'INSERT INTO userData (id, loginStatus, lastLogin, accountType, username, email, firstName, lastName, phoneNumber, birthDate, encryptionKey, credits, reportCount, isBanned, banReason, banDate, banDuration, createdAt, updatedAt, passwordHash, twoFactorEnabled, twoFactorSecret, recoveryCodes, profilePicture, bio, socialLinks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        userId,
        newUser.loginStatus,
        formatDateTimeForMySQL(newUser.lastLogin),
        newUser.accountType,
        newUser.username,
        newUser.email,
        newUser.firstName,
        newUser.lastName,
        newUser.phoneNumber,
        newUser.birthDate, // This should already be in YYYY-MM-DD format
        newUser.encryptionKey,
        newUser.credits,
        newUser.reportCount,
        newUser.isBanned,
        newUser.banReason,
        formatDateTimeForMySQL(newUser.banDate),
        newUser.banDuration,
        newUser.createdAt, // Keep as timestamp (BIGINT)
        newUser.updatedAt, // Keep as timestamp (BIGINT)
        newUser.passwordHash,
        newUser.twoFactorEnabled,
        newUser.twoFactorSecret,
        JSON.stringify(newUser.recoveryCodes || []),
        newUser.profilePicture,
        newUser.bio,
        JSON.stringify(newUser.socialLinks || {})
      ]
    );
    res.json({ success: true, id: userId });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Database error - user creation failed' });
  }
});

// Custom route for user purchases
server.get(PROXY + '/api/purchases/:username', async (req, res) => {
  try {
    const username = req.params.username;

    const [purchases] = await pool.execute(
      'SELECT * FROM buyCredits WHERE username = ? ORDER BY date DESC',
      [username]
    );

    res.json({ success: true, insertId: result.insertId });
  } catch (error) {
    console.error('Purchases error:', error);
    res.status(500).json({ error: 'Database error - purchase retrieval failed' });
  }
});

// Custom route for user redemptions
server.get(PROXY + '/api/redemptions/:username', authenticateToken, async (req, res) => {
  try {
    const username = req.params.username;

    const [redemptions] = await pool.execute(
      'SELECT * FROM redeemCredits WHERE username = ? ORDER BY date DESC',
      [username]
    );

    res.json(redemptions);
  } catch (error) {
    console.error('Redemptions error:', error);
    res.status(500).json({ error: 'Database error - redemption logging failed' });
  }
});

async function checkTransaction(crypto, txHash, walletAddress, amount) {
  // const receiverAddress = wallets[crypto];

  try {
    if (crypto === 'BTC') {

      const transactions = await mysqlConnection.query(`SELECT * FROM CryptoTransactions_BTC WHERE hash = ?`, [txHash]);
      if (transactions.error) {
        console.error('MySQL query error:', transactions.error);
        return { success: false, error: 'Database error - transaction check failed' };
      }

      if (transactions.length === 0) {
        console.log('Transaction not found in database');
        return { success: false, error: 'Transaction not found' };
      }

      const tx = transactions[0];
      console.log(`Time: ${tx.time}, Direction: ${tx.direction}, Amount: ${tx.amount}, From: ${tx.from}, To: ${tx.to}, Hash: ${tx.hash}`);

      // Check if transaction already exists
      const existingTx = await mysqlConnection.query(`SELECT * FROM CryptoTransactions_BTC WHERE hash = ?`, [txHash]);
      if (existingTx.length > 0) {
        console.log('Transaction already exists in database');
        return { success: false, error: 'Transaction already exists' };
      }

      // const txamount = await checkBitcoinTransaction(txHash, walletAddress);
      console.log("amount in checkTransaction:", amount, "vs. txamount:", transactions.amount);
      return transactions.amount;

    } else if (crypto === 'ETH') {

      const [transactions] = await pool.execute(
        `SELECT * FROM CryptoTransactions_ETH WHERE hash = ?`,
        [txHash]
      );

      // const txamount = await checkEthereumTransaction(txHash, walletAddress);
      console.log("amount in checkTransaction:", amount, "vs. txamount:", transactions.amount);
      return transactions.amount;

    } else if (crypto === 'LTC') {

      const transactions = await mysqlConnection.query(`SELECT * FROM CryptoTransactions_LTC WHERE hash = ?`, [txHash]);
      if (transactions.error) {
        console.error('MySQL query error:', transactions.error);
        return { success: false, error: 'Database error - transaction check failed' };
      }

      if (transactions.length === 0) {
        console.log('Transaction not found in database');
        return { success: false, error: 'Transaction not found' };
      }

      const tx = transactions[0];
      console.log(`Time: ${tx.time}, Direction: ${tx.direction}, Amount: ${tx.amount}, From: ${tx.from}, To: ${tx.to}, Hash: ${tx.hash}`);

      // Check if transaction already exists
      const existingTx = await mysqlConnection.query(`SELECT * FROM CryptoTransactions_LTC WHERE hash = ?`, [txHash]);
      if (existingTx.length > 0) {
        console.log('Transaction already exists in database');
        return { success: false, error: 'Transaction already exists' };
      }

      // const txamount = await checkBitcoinTransaction(txHash, walletAddress);
      console.log("amount in checkTransaction:", amount, "vs. txamount:", transactions.amount);
      return transactions.amount;

    } else if (crypto === 'SOL') {

      const transactions = await mysqlConnection.query(`SELECT * FROM CryptoTransactions_SOL WHERE hash = ?`, [txHash]);
      if (transactions.error) {
        console.error('MySQL query error:', transactions.error);
        return { success: false, error: 'Database error - transaction check failed' };
      }

      if (transactions.length === 0) {
        console.log('Transaction not found in database');
        return { success: false, error: 'Transaction not found' };
      }

      const tx = transactions[0];
      console.log(`Time: ${tx.time}, Direction: ${tx.direction}, Amount: ${tx.amount}, From: ${tx.from}, To: ${tx.to}, Hash: ${tx.hash}`);

      // Check if transaction already exists
      const existingTx = await mysqlConnection.query(`SELECT * FROM CryptoTransactions_SOL WHERE hash = ?`, [txHash]);
      if (existingTx.length > 0) {
        console.log('Transaction already exists in database');
        return { success: false, error: 'Transaction already exists' };
      }

      // const txamount = await checkBitcoinTransaction(txHash, walletAddress);
      console.log("amount in checkTransaction:", amount, "vs. txamount:", transactions.amount);
      return transactions.amount;

    } else if (crypto === "XRP") {

      // const txamount = await checkRippleTransaction(txHash, walletAddress);
      // console.log("amount in checkTransaction:", amount, "vs. txamount:", txamount);
      // return txamount;
      // return { success: false, error: 'Ripple transaction checking not implemented in this demo' };
      return 0;
    }

  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get actions for a specific user
server.get(PROXY + '/api/actions/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;

    const [actions] = await pool.execute(
      'SELECT * FROM actions WHERE username = ? ORDER BY date DESC',
      [username]
    );

    res.json(actions);
  } catch (error) {
    console.error('Get actions error:', error);
    res.status(500).json({ error: 'Database error - actions retrieval failed' });
  }
});

// Get all actions (admin/debug use)
server.get(PROXY + '/api/actions', authenticateToken, async (req, res) => {
  try {
    const [actions] = await pool.execute(
      'SELECT * FROM actions ORDER BY date DESC'
    );

    res.json(actions);
  } catch (error) {
    console.error('Get all actions error:', error);
    res.status(500).json({ error: 'Database error - actions retrieval failed' });
  }
});

// Get credit purchases for a specific user
server.get(PROXY + '/api/buyCredits/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;

    const [purchases] = await pool.execute(
      'SELECT * FROM buyCredits WHERE username = ? ORDER BY date DESC',
      [username]
    );

    res.json(purchases);
  } catch (error) {
    console.error('Get buyCredits error:', error);
    res.status(500).json({ error: 'Database error - credit purchases retrieval failed' });
  }
});

// Get all credit purchases (admin/debug use)
server.get(PROXY + '/api/buyCredits', authenticateToken, async (req, res) => {
  try {
    const [purchases] = await pool.execute(
      'SELECT * FROM buyCredits ORDER BY date DESC'
    );

    res.json(purchases);
  } catch (error) {
    console.error('Get all buyCredits error:', error);
    res.status(500).json({ error: 'Database error - credit purchases retrieval failed' });
  }
});



server.post(PROXY + '/api/purchases/:username', authenticateToken, async (req, res) => {
  try {
    const {
      username,
      userId,
      name,
      email,
      walletAddress,
      transactionId,
      blockExplorerLink,
      currency,
      amount,
      cryptoAmount,
      rate,
      session_id,
      orderLoggingEnabled,
      userAgent,
      ip
    } = req.body.data;  // <-- Changed from req.body to req.body.data

    console.log('Logging purchase data:', req.body);

    // check for duplicate transactionId
    if (transactionId) {
      const [existing] = await pool.execute(
        'SELECT * FROM buyCredits WHERE transactionHash = ?',
        [transactionId]
      );
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Duplicate transaction ID' });
      }
    }


    // Basic validation
    try {

      const crypto = currency
      const txHash = transactionId;
      const senderAddress = walletAddress;

      if (!crypto || !txHash || !senderAddress) {
        return res.status(400).json({ error: 'Missing required fields for transaction verification' });
      }
      // Verify the transaction using blockchain APIs
      const result = await checkTransaction(crypto, txHash, walletAddress, cryptoAmount);

      if (result === cryptoAmount) {
        console.log('Transaction verified successfully:', result);
      } else {
        return res.status(400).json({ error: 'Transaction amount does not match expected amount' });
      }

      if (result.success) {
        const [purchases] = await pool.execute(
          'INSERT into buyCredits (username, id, name, email, walletAddress, transactionHash, transactionId, blockExplorerLink, currency, amount, cryptoAmount, rate, date, time, session_id, orderLoggingEnabled, userAgent, ip, credits) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            username,
            Math.random().toString(36).substring(2, 10),
            name,
            email,
            walletAddress,
            transactionId,
            transactionId,
            blockExplorerLink,
            currency,
            amount,
            cryptoAmount,
            rate,
            Date.now(),
            new Date().toISOString(),
            session_id,
            orderLoggingEnabled,
            userAgent,
            ip,
            amount !== undefined && amount !== null ? Math.floor(amount) : 0
          ]
        );

        await CreateNotification(
          'credits_purchased',
          'Credits Purchased',
          `You have purchased ${amount} credits for $${dollars}.`,
          'purchase',
          username || 'anonymous'
        );

        res.json(purchases);
      } else {
        // invladid transaction
        return res.status(400).json({ error: 'Transaction verification failed: ' + result.error });
      }
    } catch (error) {
      console.error('Transaction verification error:', error);
      return res.status(400).json({ error: 'Transaction verification failed: ' + error.message });
    }

    // Insert credits into USERDATA records

    // Update user credits
    if (amount !== undefined && amount !== null && amount > 0) {
      await pool.execute(
        'UPDATE userData SET credits = credits + ? WHERE username = ?',
        [Math.floor(amount), username]
      );
    }




  } catch (error) {
    console.error('Purchases error:', error);
    res.status(500).json({ error: 'Database error - purchase logging failed' });
  }
});



// --- Configurable backends (Esplora-compatible) ---
const BTC_ESPLORA = process.env.BTC_ESPLORA || 'https://blockstream.info/api';
const LTC_ESPLORA = process.env.LTC_ESPLORA || 'https://litecoinspace.org/api';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

function ts(sec) {
  if (!sec) return '';
  return new Date(sec * 1000).toISOString().replace('T', ' ').replace('Z', ' UTC');
}
function fmt(amount, decimals) {
  const d = BigInt(10) ** BigInt(decimals);
  const n = BigInt(amount);
  const whole = (n / d).toString();
  const frac = (n % d).toString().padStart(decimals, '0');
  return `${whole}.${frac}`.replace(/\.?0+$/, '');
}

// -------- BTC/LTC via Esplora (Blockstream/mempool/litecoinspace) --------
// Docs: /api/address/:addr/txs (newest first, first page) and /txs/chain?last_seen=txid for paging.
// BTC docs (Esplora): blockstream.info explorer API / mempool.space REST. LTC: litecoinspace.org API.
async function fetchEsploraAddressTxs(baseUrl, address, limit = 100) {
  // First page (newest): /address/:addr/txs returns up to ~25 (varies with deployment)
  const rows = [];
  const seen = new Set();
  let url = `${baseUrl}/address/${address}/txs`;

  while (rows.length < limit && url) {
    const { data } = await axios.get(url, { timeout: 20000 });
    if (!Array.isArray(data) || data.length === 0) break;

    for (const tx of data) {
      if (seen.has(tx.txid)) continue;
      seen.add(tx.txid);

      // Compute net sats for this address from vin/vout
      let spent = 0n, recv = 0n;
      for (const vin of tx.vin || []) {
        const addrs = vin.prevout?.scriptpubkey_address ? [vin.prevout.scriptpubkey_address] : (vin.prevout?.address ? [vin.prevout.address] : []);
        if (addrs.some(a => a && a.toLowerCase() === address.toLowerCase())) {
          spent += BigInt(vin.prevout?.value ?? 0);
        }
      }
      for (const vout of tx.vout || []) {
        const addrs = vout.scriptpubkey_address ? [vout.scriptpubkey_address] : (vout.address ? [vout.address] : []);
        if (addrs.some(a => a && a.toLowerCase() === address.toLowerCase())) {
          recv += BigInt(vout.value ?? 0);
        }
      }
      const net = recv - spent; // sats
      const direction = net > 0n ? 'IN' : net < 0n ? 'OUT' : '—';

      // crude counterparty guess
      let fromAddr = null, toAddr = null;
      if (direction === 'IN') {
        const otherIn = tx.vin?.find(v => (v.prevout?.scriptpubkey_address || '').toLowerCase() !== address.toLowerCase());
        fromAddr = otherIn?.prevout?.scriptpubkey_address || null;
        toAddr = address;
      } else if (direction === 'OUT') {
        fromAddr = address;
        const otherOut = tx.vout?.find(v => (v.scriptpubkey_address || '').toLowerCase() !== address.toLowerCase());
        toAddr = otherOut?.scriptpubkey_address || null;
      }

      rows.push({
        time: ts(tx.status?.block_time),
        direction,
        amount: fmt((net < 0n ? -net : net).toString(), 8),
        from: fromAddr,
        to: toAddr,
        hash: tx.txid
      });
      if (rows.length >= limit) break;
    }

    if (rows.length >= limit || data.length === 0) break;
    // Next page: /address/:addr/txs/chain/:last_txid  (Esplora supports last_seen)
    const last = data[data.length - 1]?.txid;
    if (!last) break;
    url = `${baseUrl}/address/${address}/txs/chain/${last}`;
  }

  return rows.slice(0, limit);
}

// -------- ETH via Etherscan --------

/**
 * Fetch transactions for an address using Etherscan API V2.
 * @param {string} address        - The wallet address to look up.
 * @param {number} limit          - Max number of transactions to fetch.
 * @param {number} chainId        - Numeric chain ID (e.g., 1 = Ethereum mainnet).
 * @param {string} action         - E.g., "txlist", "getdeposittxs", etc.
 * @param {object} extraParams    - Any extra query params (e.g., from-address filter).
 */
async function fetchEth({
  address,
  limit = 100,
  chainId = 1,
  action = "txlist",
  extraParams = {}
}) {
  const url = `https://api.etherscan.io/v2/api`;
  const params = {
    apikey: ETHERSCAN_API_KEY,
    chainid: chainId,
    module: "account",            // adjust if other module
    action,
    address,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: Math.min(100, limit),
    sort: "desc",
    ...extraParams
  };
  console.log("Etherscan Address:", params.address, "Action:", action, "ChainID:", chainId);

  try {
    const { data } = await axios.get(url, { params, timeout: 20000 });

    if (data.status !== "1") {
      // handle “no results” vs error
      if (data.message && data.message.includes("No transactions found")) {
        return [];
      }
      throw new Error(`Etherscan V2 error: ${data.message} - ${JSON.stringify(data.result)}`);
    }

    // Ensure result is array
    if (!Array.isArray(data.result)) {
      throw new Error(`Unexpected result format: ${JSON.stringify(data.result)}`);
    }

    // Map over the results similarly to your previous logic
    const me = address.toLowerCase();
    return data.result.slice(0, limit).map(t => {
      const from = (t.from || "").toLowerCase();
      const to = (t.to || "").toLowerCase();
      const dir = (to === me && from !== me) ? "IN"
        : (from === me && to !== me) ? "OUT"
          : "—";

      //       // Example Response

      //       {
      //   "status": "1",
      //   "message": "OK",
      //   "result": [
      //     {
      //       "blockNumber": "23666665",
      //       "blockHash": "0xabf940d34137c7104c7b1f1c4f1049433417d4b4c3e360024062f5066ad92a9f",
      //       "timeStamp": "1761542519",
      //       "hash": "0xb838805293426888a8e44c7a42a3775bf7e2b8c5a779bcd59544dc9cc0bdeaae",
      //       "nonce": "1629552",
      //       "transactionIndex": "88",
      //       "from": "0x6081258689a75d253d87ce902a8de3887239fe80",
      //       "to": "0x9a61f30347258a3d03228f363b07692f3cbb7f27",
      //       "value": "1240860000000000",
      //       "gas": "21000",
      //       "gasPrice": "114277592",
      //       "input": "0x",
      //       "methodId": "0x",
      //       "functionName": "",
      //       "contractAddress": "",
      //       "cumulativeGasUsed": "5026825",
      //       "txreceipt_status": "1",
      //       "gasUsed": "21000",
      //       "confirmations": "20522",
      //       "isError": "0"
      //     }
      //   ]
      // }

      console.log("Etherscan V2 tx:", t);

      // Note: Ensure field names match what the V2 endpoint returns
      return {
        time: new Date(Number(t.timeStamp) * 1000).toISOString(),
        direction: dir,
        amount: t.value /* convert from t.value depending on decimals */,
        from: t.from || null,
        to: t.to || null,
        hash: t.hash
      };
    });

  } catch (error) {
    console.error("fetchEtherscanV2 error:", error.message);
    throw error;
  }
}

// -------- SOL via JSON-RPC --------
async function solRpc(method, params) {
  const { data } = await axios.post(SOLANA_RPC_URL, { jsonrpc: '2.0', id: 1, method, params }, { timeout: 30000 });
  if (data.error) throw new Error(data.error.message || String(data.error));
  return data.result;
}
async function fetchSol(address, limit = 100) {
  const sigs = await solRpc('getSignaturesForAddress', [address, { limit: Math.min(100, limit) }]) || [];
  const out = [];
  for (const s of sigs) {
    const sig = s.signature;
    const tx = await solRpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
    if (!tx) continue;

    const meta = tx.meta || {};
    const msg = tx.transaction?.message || {};
    const keys = (msg.accountKeys || []).map(k => (typeof k === 'string' ? k : k.pubkey));
    const idx = keys.findIndex(k => (k || '').toLowerCase() === address.toLowerCase());
    let net = 0n;
    if (idx >= 0) {
      const pre = BigInt(meta.preBalances?.[idx] ?? 0);
      const post = BigInt(meta.postBalances?.[idx] ?? 0);
      net = post - pre; // lamports, + is IN
    }
    const direction = net > 0n ? 'IN' : net < 0n ? 'OUT' : '—';
    // simple counterparty
    const cp = keys.find(k => (k || '').toLowerCase() !== address.toLowerCase()) || null;

    out.push({
      time: tx.blockTime ? ts(tx.blockTime) : '',
      direction,
      amount: fmt((net < 0n ? -net : net).toString(), 9),
      from: direction === 'IN' ? cp : (direction === 'OUT' ? address : null),
      to: direction === 'IN' ? address : (direction === 'OUT' ? cp : null),
      signature: sig
    });
    if (out.length >= limit) break;
  }
  return out;
}




// // -------- Unified endpoint --------
// server.get('/txs', async (req, res) => {
//   FetchRecentTransactionsCron()
// });



server.post(PROXY + '/api/lookup-transaction', async (req, res) => {

  FetchRecentTransactionsCron();

  // wait a few seconds to allow the cron job to possibly update the database
  // await new Promise((timeout) => setTimeout(timeout, 1000)); // wait 5 seconds for the cron to possibly update the DB


  // key value pairs: ETH, BTC, LTC, SOL, XRP
  const blockchainMap = {
    "ethereum": "ETH",
    "bitcoin": "BTC",
    "litecoin": "LTC",
    "solana": "SOL",
    "xrp": "XRP"
  };

  try {
    const { sendAddress, blockchain, transactionHash } = req.body;
    console.log('Lookup transaction body -request:', { sendAddress, blockchain, transactionHash });

    let tx = [];
    let result = null;

    if (blockchain === "bitcoin" || blockchain === "BTC") {
      [tx] = await pool.execute(
        `SELECT * FROM CryptoTransactions_BTC WHERE direction = 'IN' AND hash = ?`,
        [transactionHash]
      );
      console.log('Lookup transaction result for bitcoin:', tx.length > 0 ? tx[0] : 'No transaction found');

      if (tx.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      result = tx[0];
    }
    else if (blockchain === "ethereum" || blockchain === "ETH") {
      [tx] = await pool.execute(
        `SELECT * FROM CryptoTransactions_ETH WHERE direction = 'IN' AND hash = ?`,
        [transactionHash]
      );
      console.log('Lookup transaction result for ethereum:', tx.length > 0 ? tx[0] : 'No transaction found');

      if (tx.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      result = tx[0];
    }
    else if (blockchain === "litecoin" || blockchain === "LTC") {
      [tx] = await pool.execute(
        `SELECT * FROM CryptoTransactions_LTC WHERE direction = 'IN' AND hash = ?`,
        [transactionHash]
      );
      console.log('Lookup transaction result for litecoin:', tx.length > 0 ? tx[0] : 'No transaction found');

      if (tx.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      result = tx[0];
    }
    else if (blockchain === "solana" || blockchain === "SOL") {
      [tx] = await pool.execute(
        `SELECT * FROM CryptoTransactions_SOL WHERE direction = 'IN' AND hash = ?`,
        [transactionHash]
      );
      console.log('Lookup transaction result for solana:', tx.length > 0 ? tx[0] : 'No transaction found');

      if (tx.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      result = tx[0];
    }
    else {
      return res.status(400).json({ error: 'Unsupported blockchain. Use bitcoin, ethereum, litecoin, or solana' });
    }

    result.found = true;

    res.json(result);

  } catch (error) {
    console.error('Lookup transaction error:', error);
    res.status(500).json({ error: 'Database error - transaction lookup failed' });
  }

});




// ######################## POST TRANSACTION SCREENSHOT ###############################
// todo: change the route below to /transaction-screenshot

const db = require('./config/db');
// const path = require('path');
const Busboy = require('busboy'); // v1+ exports a function, not a class
const { Storage } = require('@google-cloud/storage');
const { setDefaultResultOrder } = require('dns');
const { waitForDebugger } = require('inspector');

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID || 'servers4sqldb',
  keyFilename: process.env.GCP_SA_KEYFILE || 'service-account.json',
});

const BUCKET_NAME = process.env.GCS_BUCKET || 'cloutcoinclub_bucket';
const DEST_PREFIX = process.env.GCS_PREFIX || 'storage_folder'; // "folder" inside bucket

function publicUrl(bucket, filepath) {
  return `https://storage.googleapis.com/${bucket}/${encodeURI(filepath)}`;
}

// Allowed file types (both ext and mime)
const ALLOWED = /^(jpeg|jpg|png|webp|gif|mp4|webm|mp3|wav)$/i;
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
};



// Endpoint to handle transaction screenshot upload
server.post(PROXY + '/api/upload/transaction-screenshot/:username/:txHash', authenticateToken, async (req, res) => {
  console.log("Transaction screenshot upload request received");

  const { username, txHash } = req.params;
  // let formdata = req.body;

  // const { username, userId } = req.body;

  console.log('Form data received:', req.body);

  let busboy;
  try {
    busboy = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB
  } catch (e) {
    console.error('Failed to init Busboy:', e);
    return res.status(400).json({ message: 'Invalid multipart/form-data request' });
  }

  let uploadDone = false;
  let writeStream;
  let gcsFilePath = '';
  let mimeTypeGlobal = '';
  // let username = '';
  // let userId = '';
  let hadFile = false;
  let aborted = false;

  busboy.on('field', (fieldname, val) => {
    // if (fieldname === 'username') username = val;
    if (fieldname === 'userId') userId = val;
  });

  busboy.on('file', (fieldname, file, info) => {
    hadFile = true;

    const { filename: rawFilename, mimeType } = info || {};
    const originalName =
      typeof rawFilename === 'string' && rawFilename.trim() ? rawFilename.trim() : 'profile';

    // Validate by ext and mime
    const extFromName = path.extname(originalName).toLowerCase().replace('.', '');
    const extOk = !!extFromName && ALLOWED.test(extFromName);
    const mimeOk = ALLOWED.test((mimeType || '').split('/').pop() || '');

    if (!extOk && !mimeOk) {
      file.resume();
      aborted = true;
      return res.status(400).json({ message: 'Error: Images Only!' });
    }

    const base = path
      .basename(originalName)
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9._-]/g, '');

    const resolvedExt =
      (extOk ? `.${extFromName}` : (MIME_TO_EXT[(mimeType || '').toLowerCase()] || '')) || '';

    let finalBase = base;
    if (!resolvedExt || !base.toLowerCase().endsWith(resolvedExt.toLowerCase())) {
      finalBase = `${base}${resolvedExt}`;
    }

    const finalName = `${uuidv4()}_${finalBase}`;
    gcsFilePath = `${DEST_PREFIX}/profile_pics/${finalName}`;
    mimeTypeGlobal = mimeType || 'application/octet-stream';

    const bucket = storage.bucket(BUCKET_NAME);
    const gcsFile = bucket.file(gcsFilePath);

    writeStream = gcsFile.createWriteStream({
      metadata: { contentType: mimeTypeGlobal },
      resumable: false,
      validation: 'md5',
    });

    file.pipe(writeStream);

    writeStream.on('error', (err) => {
      console.error('GCS write error:', err);
      if (!uploadDone) {
        uploadDone = true;
        return res.status(500).json({ message: 'Upload failed' });
      }
    });

    writeStream.on('finish', async () => {
      try {
        await bucket.file(gcsFilePath).makePublic().catch((err) => {
          if (err && err.code !== 400) throw err;
        });

        const imageUrl = publicUrl(BUCKET_NAME, gcsFilePath);
        // main DB connection
        const connection = await db.getConnection();

        // Optionally update user profilePic in DB
        await connection.query(
          'UPDATE buyCredits SET transactionScreenshot = ? WHERE transactionScreenshot IS NULL and username = ? and transactionHash = ? and created_at >= NOW() - INTERVAL 1 HOUR ORDER BY created_at DESC LIMIT 1',
          [imageUrl, username, txHash]
        );

        if (!uploadDone) {
          uploadDone = true;
          return res.status(200).json({
            message: 'File uploaded successfully',
            url: imageUrl
          });
        }
      } catch (err) {
        console.error('Post-upload error:', err);
        if (!uploadDone) {
          uploadDone = true;
          return res.status(500).json({ message: 'Server error' });
        }
      }
    });
  });

  busboy.on('error', (err) => {
    console.error('Busboy error:', err);
    if (!uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'Malformed upload' });
    }
  });

  busboy.on('partsLimit', () => {
    aborted = true;
    if (!uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'Too many parts in form data' });
    }
  });

  busboy.on('filesLimit', () => {
    aborted = true;
    if (!uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'Too many files' });
    }
  });

  busboy.on('fieldsLimit', () => {
    aborted = true;
    if (!uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'Too many fields' });
    }
  });

  busboy.on('finish', () => {
    if (aborted) return;
    if (!hadFile && !uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'No file uploaded' });
    }
  });

  req.pipe(busboy);
});



// // CREATE TABLE
//   `userData` (
//     `id` varchar(10) NOT NULL,
//     `username` varchar(50) DEFAULT NULL,
//     `email` varchar(100) DEFAULT NULL,
//     `credits` int DEFAULT NULL,
//     `passwordHash` varchar(255) DEFAULT NULL,
//     `accountType` enum('buyer', 'seller') DEFAULT NULL,
//     `lastLogin` datetime DEFAULT NULL,
//     `loginStatus` tinyint(1) DEFAULT NULL,
//     `firstName` varchar(50) DEFAULT NULL,
//     `lastName` varchar(50) DEFAULT NULL,
//     `phoneNumber` varchar(20) DEFAULT NULL,
//     `birthDate` date DEFAULT NULL,
//     `encryptionKey` varchar(100) DEFAULT NULL,
//     `reportCount` int DEFAULT NULL,
//     `isBanned` tinyint(1) DEFAULT NULL,
//     `banReason` text,
//     `banDate` datetime DEFAULT NULL,
//     `banDuration` int DEFAULT NULL,
//     `createdAt` bigint DEFAULT NULL,
//     `updatedAt` bigint DEFAULT NULL,
//     `twoFactorEnabled` tinyint(1) DEFAULT '0',
//     `twoFactorSecret` varchar(50) DEFAULT NULL,
//     `recoveryCodes` json DEFAULT NULL,
//     `profilePicture` varchar(255) DEFAULT NULL,
//     `bio` text,
//     `socialLinks` json DEFAULT NULL,
//     PRIMARY KEY (`id`),
//     UNIQUE KEY `username` (`username`),
//     UNIQUE KEY `email` (`email`)
//   ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci

/**
 * POST /api/profile-picture/:username
 * Accepts a multipart/form-data upload for a user's profile picture.
 * Stores the image in Google Cloud Storage and updates the user's profilePicture field.
 */
server.post(PROXY + '/api/profile-picture/:username', authenticateToken, async (req, res) => {
  const { username } = req.params;
  let busboy;
  try {
    busboy = Busboy({ headers: req.headers, limits: { fileSize: 2 * 1024 * 1024 } }); // 2 MB
  } catch (e) {
    console.error('Failed to init Busboy:', e);
    return res.status(400).json({ message: 'Invalid multipart/form-data request' });
  }

  let uploadDone = false;
  let writeStream;
  let gcsFilePath = '';
  let mimeTypeGlobal = '';
  let hadFile = false;
  let aborted = false;

  busboy.on('file', (fieldname, file, info) => {
    hadFile = true;
    const { filename: rawFilename, mimeType } = info || {};
    const originalName =
      typeof rawFilename === 'string' && rawFilename.trim() ? rawFilename.trim() : 'profile';

    // Validate by ext and mime
    const extFromName = path.extname(originalName).toLowerCase().replace('.', '');
    const extOk = !!extFromName && ALLOWED.test(extFromName);
    const mimeOk = ALLOWED.test((mimeType || '').split('/').pop() || '');

    if (!extOk && !mimeOk) {
      file.resume();
      aborted = true;
      return res.status(400).json({ message: 'Error: Images Only!' });
    }

    const base = path
      .basename(originalName)
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9._-]/g, '');

    const resolvedExt =
      (extOk ? `.${extFromName}` : (MIME_TO_EXT[(mimeType || '').toLowerCase()] || '')) || '';

    let finalBase = base;
    if (!resolvedExt || !base.toLowerCase().endsWith(resolvedExt.toLowerCase())) {
      finalBase = `${base}${resolvedExt}`;
    }

    const finalName = `${uuidv4()}_${finalBase}`;
    gcsFilePath = `${DEST_PREFIX}/profile_pics/${finalName}`;
    mimeTypeGlobal = mimeType || 'application/octet-stream';

    const bucket = storage.bucket(BUCKET_NAME);
    const gcsFile = bucket.file(gcsFilePath);

    writeStream = gcsFile.createWriteStream({
      metadata: { contentType: mimeTypeGlobal },
      resumable: false,
      validation: 'md5',
    });

    file.pipe(writeStream);

    writeStream.on('error', (err) => {
      console.error('GCS write error:', err);
      if (!uploadDone) {
        uploadDone = true;
        return res.status(500).json({ message: 'Upload failed' });
      }
    });

    writeStream.on('finish', async () => {
      try {
        await bucket.file(gcsFilePath).makePublic().catch((err) => {
          if (err && err.code !== 400) throw err;
        });

        const imageUrl = publicUrl(BUCKET_NAME, gcsFilePath);

        // Update user profilePicture in DB
        await pool.execute(
          'UPDATE userData SET profilePicture = ? WHERE username = ?',
          [imageUrl, username]
        );

        console.log(`Updated profile picture for user ${username} to: ${imageUrl}`);

        if (!uploadDone) {
          uploadDone = true;
          return res.status(200).json({
            success: true,
            message: 'Profile picture uploaded successfully',
            url: imageUrl
          });
        }
      } catch (err) {
        console.error('Post-upload error:', err);
        if (!uploadDone) {
          uploadDone = true;
          return res.status(500).json({ message: 'Server error' });
        }
      }
    });
  });

  busboy.on('error', (err) => {
    console.error('Busboy error:', err);
    if (!uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'Malformed upload' });
    }
  });

  busboy.on('partsLimit', () => {
    aborted = true;
    if (!uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'Too many parts in form data' });
    }
  });

  busboy.on('filesLimit', () => {
    aborted = true;
    if (!uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'Too many files' });
    }
  });

  busboy.on('fieldsLimit', () => {
    aborted = true;
    if (!uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'Too many fields' });
    }
  });

  busboy.on('finish', () => {
    if (aborted) return;
    if (!hadFile && !uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'No file uploaded' });
    }
  });

  req.pipe(busboy);
});


// Basic RESTful routes for all tables
server.get(PROXY + '/api/:table', async (req, res) => {
  try {
    const table = req.params.table;
    const allowedTables = ['userData', 'buyCredits', 'redeemCredits', 'earnings', 'actions', 'createdKeys', 'notifications', 'wallet', 'reports', 'supportTickets'];

    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const [rows] = await pool.execute(`SELECT * FROM ${table}`);
    res.json(rows);
  } catch (error) {
    console.error(`Get ${req.params.table} error:`, error);
    res.status(500).json({ error: 'Database error' });
  }
});

server.get(PROXY + '/api/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const allowedTables = ['userData', 'buyCredits', 'redeemCredits', 'earnings', 'actions', 'notifications', 'wallet', 'reports', 'supportTickets'];

    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const [rows] = await pool.execute(`SELECT * FROM ${table} WHERE id = ?`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(`Get ${req.params.table} by ID error:`, error);
    res.status(500).json({ error: 'Database error' });
  }
});

server.patch(PROXY + '/api/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const allowedTables = ['userData', 'buyCredits', 'redeemCredits', 'earnings', 'actions', 'createdKeys', 'notifications', 'wallet', 'reports', 'supportTickets'];

    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const updateData = req.body;
    const columns = Object.keys(updateData);
    const values = Object.values(updateData);

    if (columns.length === 0) {
      return res.status(400).json({ error: 'No data to update' });
    }

    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;

    const [result] = await pool.execute(query, [...values, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Get updated record
    const [updated] = await pool.execute(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.json(updated[0]);
  } catch (error) {
    console.error(`Update ${req.params.table} error:`, error);
    res.status(500).json({ error: 'Database error - update failed (patch)' });
  }
});



const walletAddressMap = {
  BTC: 'bc1q4j9e7equq4xvlyu7tan4gdmkvze7wc0egvykr6',
  LTC: 'ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh',
  SOL: 'qaSpvAumg2L3LLZA8qznFtbrRKYMP1neTGqpNgtCPaU',
  ETH: '0x9a61f30347258A3D03228F363b07692F3CBb7f27',
};

// create cron job to fetch the most recent transactions for all wallet addresses every 15 minutes
const cron = require('node-cron');
const { time } = require('console');
const { Server } = require('http');
const { json } = require('stream/consumers');
const { emit } = require('process');

cron.schedule('*/30 * * * *', async () => {

  FetchRecentTransactionsCron();

});

async function FetchRecentTransactionsCron() {
  try {
    console.log('🔄 Fetching recent transactions for all wallet addresses...');
    // Iterate over walletAddressMap entries (key = chain, value = address) for the cron job
    for (const [chainKey, addr] of Object.entries(walletAddressMap)) {
      // const txs = await fetchRe,centTransactions(address);
      const chain = String(chainKey || '').toUpperCase();
      const address = String(addr || '').trim();
      // Use a fixed reasonable limit for cron runs
      const limit = 100;
      try {

        if (!address || !chain) {
          console.log('No address or chain provided');
          continue; // skip this entry
        }
        let rows = [];
        if (chain === 'BTC') rows = await fetchEsploraAddressTxs(BTC_ESPLORA, address, limit);
        else if (chain === 'LTC') rows = await fetchEsploraAddressTxs(LTC_ESPLORA, address, limit);
        else if (chain === 'ETH') rows = await fetchEth({ address, limit, chainId: 1, action: "txlist", extraParams: {} });
        else if (chain === 'SOL') rows = await fetchSol(address, limit);
        else {
          console.log('Unsupported chain. Use BTC, LTC, ETH, SOL');
          continue;
        }
        // return res.status(400).json({ error: 'Unsupported chain. Use BTC, LTC, ETH, SOL' });

        // res.json({ chain, address, count: rows.length, txs: rows });

        let txs = {
          chain,
          address,
          count: rows.length,
          txs: rows
        };
        // console.log(`✅ Fetched ${rows.length} transactions for ${chain} address ${address}`);


        for (const tx of txs.txs) {
          const transactionId = tx.hash;

          // console.log(`Time: ${tx.time}, Direction: ${tx.direction}, Amount: ${tx.amount}, From: ${tx.from}, To: ${tx.to}, Hash: ${tx.hash}`);

          const [existingTxs] = await pool.execute(
            `SELECT * FROM CryptoTransactions_${chain} WHERE hash = ?`,
            [transactionId]
          );

          // Check if transaction already exists
          if (existingTxs.length > 0) {
            // console.log(`Transaction ${transactionId} already exists in the database. Skipping.`);
            continue; // Skip to next transaction
          }

          // Insert new transaction
          await pool.execute(
            `INSERT INTO CryptoTransactions_${chain} (time, direction, amount, fromAddress, toAddress, hash) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              tx.time,
              tx.direction,
              tx.amount,
              tx.from,
              tx.to,
              tx.hash,
            ]
          );

          // console.log(`Inserted transaction ${transactionId} into CryptoTransactions_${chain}`);
        }


      } catch (e) {
        // res.status(500).json({ error: e.message || String(e) });
        console.error(`❌ Error processing transactions for ${chain} address ${address}:`, e);
        continue;
      }
      // console.log(`📈 Recent transactions for ${address}:`, txs);
    }
  } catch (error) {
    console.error('❌ Error fetching recent transactions:', error);
  }
}




// ========================================
// Device Fingerprint Endpoints
// ========================================

// Save or update device fingerprint
server.post(PROXY + '/api/fingerprint/save', async (req, res) => {
  try {
    const {
      userId,
      fingerprintHash,
      shortHash,
      deviceType,
      browser,
      os,
      screenResolution,
      timezone,
      language,
      ipAddress,
      fullFingerprint,
      compactFingerprint,
      userAgent
    } = req.body;

    // Validate required fields
    if (!userId || !fingerprintHash) {
      return res.status(400).json({
        success: false,
        message: 'userId and fingerprintHash are required'
      });
    }

    // Insert or update fingerprint using INSERT ... ON DUPLICATE KEY UPDATE
    await pool.execute(
      `INSERT INTO device_fingerprints 
        (user_id, fingerprint_hash, short_hash, device_type, browser, os, 
         screen_resolution, timezone, language, ip_address, full_fingerprint, 
         compact_fingerprint, user_agent, first_seen, last_seen, login_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
       ON DUPLICATE KEY UPDATE
         last_seen = CURRENT_TIMESTAMP,
         login_count = login_count + 1,
         ip_address = VALUES(ip_address),
         full_fingerprint = VALUES(full_fingerprint),
         compact_fingerprint = VALUES(compact_fingerprint),
         user_agent = VALUES(user_agent),
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        fingerprintHash,
        shortHash || fingerprintHash.substring(0, 16),
        deviceType || 'Unknown',
        browser || 'Unknown',
        os || 'Unknown',
        screenResolution || 'Unknown',
        timezone || 'UTC',
        language || 'en-US',
        ipAddress || req.ip || req.connection.remoteAddress,
        JSON.stringify(fullFingerprint),
        JSON.stringify(compactFingerprint),
        userAgent || req.headers['user-agent']
      ]
    );

    // Fetch the saved/updated record
    const [savedRows] = await pool.execute(
      'SELECT * FROM device_fingerprints WHERE user_id = ? AND fingerprint_hash = ?',
      [userId, fingerprintHash]
    );
    const savedFingerprint = savedRows[0];

    console.log(`✅ Fingerprint saved for user ${userId}: ${shortHash || fingerprintHash.substring(0, 16)}`);

    res.json({
      success: true,
      message: 'Fingerprint saved successfully',
      fingerprint: savedFingerprint
    });
  } catch (error) {
    console.error('Save fingerprint error:', error);

    // Check for duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
      // Try to update instead
      try {
        const { userId, fingerprintHash, ipAddress, fullFingerprint, compactFingerprint } = req.body;

        await pool.execute(
          `UPDATE device_fingerprints 
           SET last_seen = CURRENT_TIMESTAMP, 
               login_count = login_count + 1,
               ip_address = ?,
               full_fingerprint = ?,
               compact_fingerprint = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND fingerprint_hash = ?`,
          [
            ipAddress || req.ip,
            JSON.stringify(fullFingerprint),
            JSON.stringify(compactFingerprint),
            userId,
            fingerprintHash
          ]
        );

        res.json({
          success: true,
          message: 'Fingerprint updated successfully'
        });
      } catch (updateError) {
        console.error('Update fingerprint error:', updateError);
        res.status(500).json({
          success: false,
          message: 'Failed to save or update fingerprint'
        });
      }
    } else {
      res.status(500).json({
        success: false,
        message: 'Database error while saving fingerprint'
      });
    }
  }
});

// Get all fingerprints for a user
server.get(PROXY + '/api/fingerprint/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const [fingerprints] = await pool.execute(
      `SELECT 
        id,
        fingerprint_hash,
        short_hash,
        device_type,
        browser,
        os,
        screen_resolution,
        timezone,
        language,
        ip_address,
        first_seen,
        last_seen,
        login_count,
        unscramble_count,
        leaked_content_count,
        is_trusted,
        is_blocked,
        block_reason,
        created_at,
        CASE 
          WHEN last_seen > DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 'active'
          WHEN last_seen > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'recent'
          WHEN last_seen > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'inactive'
          ELSE 'dormant'
        END as device_status
       FROM device_fingerprints 
       WHERE user_id = ? 
       ORDER BY last_seen DESC`,
      [userId]
    );

    res.json({
      success: true,
      fingerprints
    });
  } catch (error) {
    console.error('Get user fingerprints error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
});

// Get full fingerprint details by hash
server.get(PROXY + '/api/fingerprint/details/:hash', authenticateToken, async (req, res) => {
  try {
    const { hash } = req.params;

    const [fingerprints] = await pool.execute(
      'SELECT * FROM device_fingerprints WHERE fingerprint_hash = ? OR short_hash = ?',
      [hash, hash]
    );

    if (fingerprints.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Fingerprint not found'
      });
    }

    res.json({
      success: true,
      fingerprint: fingerprints[0]
    });
  } catch (error) {
    console.error('Get fingerprint details error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
});

// Increment unscramble count when content is unscrambled
server.post(PROXY + '/api/fingerprint/unscramble/:hash', authenticateToken, async (req, res) => {
  try {
    const { hash } = req.params;

    await pool.execute(
      'CALL increment_unscramble_count(?)',
      [hash]
    );

    res.json({
      success: true,
      message: 'Unscramble count incremented'
    });
  } catch (error) {
    console.error('Increment unscramble count error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
});

// Mark device as leaked (when leaked content is detected)
server.post(PROXY + '/api/fingerprint/leaked/:hash', authenticateToken, async (req, res) => {
  try {
    const { hash } = req.params;
    const { reason } = req.body;

    await pool.execute(
      'CALL mark_device_leaked(?, ?)',
      [hash, reason || 'Leaked content detected']
    );

    res.json({
      success: true,
      message: 'Device marked as leaked and blocked'
    });
  } catch (error) {
    console.error('Mark device leaked error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
});

// Block/unblock a device
server.patch(PROXY + '/api/fingerprint/block/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked, blockReason } = req.body;

    await pool.execute(
      'UPDATE device_fingerprints SET is_blocked = ?, block_reason = ? WHERE id = ?',
      [isBlocked, blockReason || null, id]
    );

    res.json({
      success: true,
      message: `Device ${isBlocked ? 'blocked' : 'unblocked'} successfully`
    });
  } catch (error) {
    console.error('Block device error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
});

// Get device statistics for admin
server.get(PROXY + '/api/fingerprint/stats', authenticateToken, async (req, res) => {
  try {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_devices,
        COUNT(DISTINCT user_id) as total_users,
        SUM(CASE WHEN is_blocked = true THEN 1 ELSE 0 END) as blocked_devices,
        SUM(CASE WHEN leaked_content_count > 0 THEN 1 ELSE 0 END) as devices_with_leaks,
        SUM(login_count) as total_logins,
        SUM(unscramble_count) as total_unscrambles,
        AVG(login_count) as avg_logins_per_device
      FROM device_fingerprints
    `);

    res.json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Get fingerprint stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
});



// ========================================
// End of Device Fingerprint Endpoints
// ========================================


// Python Flask app Control

// const FLASKAPP_LINK = 'http://localhost:5000';
const FLASKAPP_LINK = process.env.FLASKAPP_LINK || 'http://localhost:5000';


server.get(PROXY + '/api/flask-python/download', (req, res) => {
  // Proxy the request to the Flask app
  const axios = require('axios');
  const FormData = require('form-data');
  const form = new FormData();

  form.append('file', req.files.file.data, req.files.file.name);

  axios.post(`${FLASKAPP_LINK}/upload`, form, {
    headers: form.getHeaders()
  })
    .then(response => {
      res.json(response.data);
    })
    .catch(error => {
      console.error('Error uploading to Flask app:', error);
      res.status(500).json({ error: 'Failed to upload file to Python service' });
    });
});

// Flask/Python service URL


// Configure multer for file uploads
const py_storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'python', 'inputs');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, basename + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: py_storage,
  dest: 'python/inputs',
  limits: { fileSize: 250 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    // Accept images, videos, and audio only
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/') && !file.mimetype.startsWith('audio/')) {
      return cb(new Error('Only image, video, and audio files are allowed!'), false);
    }
    cb(null, true);
  }
});



// =============================
// SCRAMBLE PHOTO ENDPOINT - UPDATED VERSION
// Handles both old flat format and new nested format with noise parameters
// =============================

server.post(PROXY + '/api/audio-stegano-embed', upload.single('file'), authenticateToken, async (req, res) => {
  console.log('🔊 Audio steganography request received');

  try {
    // 1) Ensure file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided'
      });
    }

    console.log('✅ File uploaded:', req.file.filename);
    console.log('📁 File path:', req.file.path);

    // 2) Parse steganography data (user info) from params field
    let steganoData;
    try {
      steganoData = typeof req.body.params === 'string'
        ? JSON.parse(req.body.params)
        : (req.body.params || {});
    } catch (parseError) {
      console.error('❌ Failed to parse steganography parameters:', parseError);
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters format'
      });
    }

    console.log('📋 Steganography data (user info):', steganoData);

    //  user info for watermarking
    const { username, time, userid } = steganoData;

    if (!username || !userid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required user information (username, userid)'
      });
    }

    // 3) Prepare Flask payload
    const inputFile = req.file.filename;
    const outputFile = `watermarked_${inputFile}`;

    // Create secret message from user info
    const secretMessage = JSON.stringify({
      username,
      userid,
      timestamp: time || new Date().toISOString()
    });

    const flaskPayload = {
      input: inputFile,
      output: outputFile,
      secret_message: secretMessage
    };

    console.log('🔄 Sending payload to Flask:', flaskPayload);
    console.log('📡 Flask URL:', `${FLASKAPP_LINK}/audio-stegano-embed`);

    // 4) Call Flask audio steganography endpoint
    const flaskResponse = await axios.post(
      `${FLASKAPP_LINK}/audio-stegano-embed`,
      flaskPayload,
      {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    console.log('✅ Flask response received:', flaskResponse.data);

    const data = flaskResponse.data;

    // 5) Send success response to frontend
    res.json({
      success: true,
      output_file: data.output_file,
      download_url: data.download_url,
      message: data.message || 'Audio watermarked successfully',
      watermark: {
        username,
        userid,
        timestamp: time || new Date().toISOString()
      },
      ...data
    });

  } catch (error) {
    console.error('❌ Error in /api/audio-stegano endpoint:', error.message);

    // Cleanup uploaded file if processing failed
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️  Cleaned up failed upload:', req.file.filename);
      } catch (unlinkError) {
        console.error('Failed to delete file:', unlinkError);
      }
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Python/Flask service is not running. Please start the Flask server on port 5000.'
      });
    }

    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.error || 'Audio steganography failed in Python service',
        details: error.response.data
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to apply audio steganography',
      message: error.message
    });
  }
});

// =============================
// SCRAMBLE PHOTO ENDPOINT - UPDATED VERSION
// Handles both old flat format and new nested format with noise parameters
// =============================

server.post(PROXY + '/api/scramble-photo', authenticateToken, upload.single('file'), async (req, res) => {
  console.log('📸 Scramble photo request received');

  try {
    // 1) Make sure a file came in
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('✅ File uploaded:', req.file.filename);
    console.log('📁 File path:', req.file.path);
    console.log('👤 User info:', req.user);

    // 2) Parse params from multipart/form-data
    let params;
    try {
      params = typeof req.body.params === 'string'
        ? JSON.parse(req.body.params)
        : (req.body.params || {});
    } catch (parseError) {
      console.error('❌ Failed to parse parameters:', parseError);
      return res.status(400).json({ error: 'Invalid parameters format' });
    }

    console.log('📋 Scrambling parameters (from frontend):', params);

    // 3) Normalize for Flask
    //
    // IMPORTANT:
    // - Ignore params.input from the client and instead use the actual stored filename.
    // - Optionally reuse params.output, but better to tie it to the stored filename.
    // - Handle both old flat format and new nested format (with scramble/noise objects)
    const inputFile = req.file.filename; // file as saved by multer
    const outputFile = `scrambled_${inputFile}`;

    // Check if params has nested structure (new format) or flat structure (old format)
    let scrambleParams = params;
    let noiseParams = null;
    let metadata = null;

    if (params.scramble) {
      // New nested format
      scrambleParams = params.scramble;
      noiseParams = params.noise;
      metadata = params.metadata;
      console.log('🆕 Detected new nested parameter format');
    } else {
      // Old flat format - for backwards compatibility
      console.log('📦 Using legacy flat parameter format');
    }

    // Build the payload in the exact shape Flask expects
    const flaskPayload = {
      input: inputFile,
      output: outputFile,
      seed: scrambleParams.seed ?? params.seed ?? 123456,
      mode: scrambleParams.mode || params.mode || 'scramble',
      algorithm: scrambleParams.algorithm || params.algorithm || 'position',
      percentage: scrambleParams.percentage ?? params.percentage ?? 100,
      // Algorithm-specific params (check both nested and flat structure)
      rows: scrambleParams.rows ?? params.rows,
      cols: scrambleParams.cols ?? params.cols,
      max_hue_shift: scrambleParams.max_hue_shift ?? scrambleParams.maxHueShift ?? params.max_hue_shift ?? params.maxHueShift,
      max_intensity_shift: scrambleParams.max_intensity_shift ?? scrambleParams.maxIntensityShift ?? params.max_intensity_shift ?? params.maxIntensityShift,
      // Noise parameters (if present)
      noise_seed: params.noise_seed ?? noiseParams?.seed,
      noise_intensity: params.noise_intensity ?? noiseParams?.intensity,
      noise_mode: params.noise_mode ?? noiseParams?.mode,
      noise_prng: params.noise_prng ?? noiseParams?.prng,
      noise_tile_size: params.noise_tile_size ?? noiseParams?.tile_size ?? noiseParams?.tileSize,
      creator: params.creator,
      // user_id: req.user?.id ?? params.user_id,
      // username: req.user?.username ?? params.username,
      metadata: metadata ? JSON.stringify(metadata) : undefined
    };

    // Remove undefined keys so Flask doesn't see them at all
    Object.keys(flaskPayload).forEach((key) => {
      if (flaskPayload[key] === undefined) delete flaskPayload[key];
    });

    // Log noise parameters if present
    if (noiseParams) {
      console.log('🔊 Noise parameters:', {
        seed: noiseParams.seed,
        intensity: noiseParams.intensity,
        mode: noiseParams.mode
      });
    }

    console.log('🔄 Sending normalized payload to Flask:', flaskPayload);
    console.log('📡 Flask URL:', `${FLASKAPP_LINK}/scramble-photo`);

    // 4) Call Flask /scramble-photo as JSON
    const flaskResponse = await axios.post(
      `${FLASKAPP_LINK}/scramble-photo`,
      flaskPayload,
      {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    console.log('✅ Flask response received:', flaskResponse.data);

    // Flask returns: { message, output_file, algorithm, seed, download_url, ... }
    const data = flaskResponse.data;

    // 5) Send a clean response back to the React frontend
    res.json({
      success: true,
      output_file: data.output_file,
      algorithm: data.algorithm,
      seed: data.seed,
      download_url: data.download_url,
      message: data.message || 'Image scrambled successfully',
      // Include noise parameters if they were used
      noise: noiseParams ? {
        seed: noiseParams.seed,
        intensity: noiseParams.intensity,
        mode: noiseParams.mode,
        prng: noiseParams.prng
      } : undefined,
      // Include metadata if present
      metadata: metadata,
      // Include everything else from Flask, just in case
      ...data
    });

  } catch (error) {
    console.error('❌ Error in /api/scramble-photo endpoint:', error.message);

    // Cleanup uploaded file if something failed
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️  Cleaned up failed upload:', req.file.filename);
      } catch (unlinkError) {
        console.error('Failed to delete file:', unlinkError);
      }
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Python/Flask service is not running. Please start the Flask server on port 5000.'
      });
    }

    if (error.response) {
      // Flask returned an HTTP error
      return res.status(error.response.status || 500).json({
        error: error.response.data?.error || 'Scrambling failed in Python service',
        details: error.response.data
      });
    }

    res.status(500).json({
      error: 'Failed to scramble photo',
      message: error.message
    });
  }
});

// =============================
// KEY CHANGES SUMMARY:
// =============================
// 1. Added detection for nested parameter format (params.scramble, params.noise, params.metadata)
// 2. Maintains backward compatibility with old flat format
// 3. Extracts noise parameters if present: seed, intensity, mode, prng
// 4. Passes noise parameters to Flask (as noise_seed, noise_intensity, etc.)
// 5. Includes noise parameters in response back to frontend
// 6. Handles both camelCase (maxHueShift) and snake_case (max_hue_shift) for flexibility
// 7. Logs noise parameters when present for debugging

// =============================
// UNSCRAMBLE PHOTO ENDPOINT - UPDATED VERSION
// Handles both old flat format and new nested format with noise parameters
// =============================

server.post(PROXY + '/api/unscramble-photo', upload.single('file'), async (req, res) => {
  console.log('🔓 Unscramble photo request received');

  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('✅ File uploaded:', req.file.filename);
    console.log('📁 File path:', req.file.path);

    // Parse parameters from request body
    let params;
    try {
      params = typeof req.body.params === 'string'
        ? JSON.parse(req.body.params)
        : req.body.params;
    } catch (parseError) {
      console.error('❌ Failed to parse parameters:', parseError);
      return res.status(400).json({ error: 'Invalid parameters format' });
    }

    console.log('📋 Unscrambling parameters (from frontend):', params);

    // Check if params has nested structure (new format) or flat structure (old format)
    let scrambleParams = params;
    let noiseParams = null;
    let metadata = null;

    if (params.scramble) {
      // New nested format
      scrambleParams = params.scramble;
      noiseParams = params.noise;
      metadata = params.metadata;
      console.log('🆕 Detected new nested parameter format');
    } else {
      // Old flat format - for backwards compatibility
      console.log('📦 Using legacy flat parameter format');
    }

    // Prepare data to send to Flask
    const flaskPayload = {
      input: req.file.filename,
      output: `unscrambled_${req.file.filename}`,
      seed: scrambleParams.seed ?? params.seed,
      mode: 'unscramble',
      algorithm: scrambleParams.algorithm ?? params.algorithm,
      percentage: scrambleParams.percentage ?? params.percentage ?? 100,
      // Algorithm-specific params (check both nested and flat structure)
      rows: scrambleParams.rows ?? params.rows,
      cols: scrambleParams.cols ?? params.cols,
      max_hue_shift: scrambleParams.max_hue_shift ?? scrambleParams.maxHueShift ?? params.max_hue_shift ?? params.maxHueShift,
      max_intensity_shift: scrambleParams.max_intensity_shift ?? scrambleParams.maxIntensityShift ?? params.max_intensity_shift ?? params.maxIntensityShift,
      // Noise parameters (if present)
      noise_seed: params.noise_seed ?? noiseParams?.seed,
      noise_intensity: params.noise_intensity ?? noiseParams?.intensity,
      noise_mode: params.noise_mode ?? noiseParams?.mode,
      noise_prng: params.noise_prng ?? noiseParams?.prng,
      noise_tile_size: params.noise_tile_size ?? noiseParams?.tile_size ?? noiseParams?.tileSize,

      creator: params.creator,
      user_id: req.user?.id ?? params.user_id,
      username: req.user?.username ?? params.username,
      metadata: metadata ? JSON.stringify(metadata) : undefined
    };

    // Remove undefined keys so Flask doesn't see them at all
    Object.keys(flaskPayload).forEach((key) => {
      if (flaskPayload[key] === undefined) delete flaskPayload[key];
    });

    // Log noise parameters if present
    if (noiseParams) {
      console.log('🔊 Noise parameters detected:', {
        seed: noiseParams.seed,
        intensity: noiseParams.intensity,
        mode: noiseParams.mode
      });
    }

    console.log('🔄 Sending normalized payload to Flask:', flaskPayload);
    console.log('🔄 Sending to Flask service:', FLASKAPP_LINK + '/unscramble-photo');

    // Send request to Flask/Python service
    const flaskResponse = await axios.post(
      `${FLASKAPP_LINK}/unscramble-photo`,
      flaskPayload,
      {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Flask response received:', flaskResponse.data);

    // Return Flask response to frontend with noise parameters included
    res.json({
      success: true,
      output_file: flaskResponse.data.output_file || flaskResponse.data.unscrambledFileName,
      unscrambledImageUrl: flaskResponse.data.unscrambledImageUrl,
      message: 'Image unscrambled successfully',
      // Include noise parameters so frontend knows to remove noise
      noise: noiseParams ? {
        seed: noiseParams.seed,
        intensity: noiseParams.intensity,
        mode: noiseParams.mode,
        prng: noiseParams.prng
      } : undefined,
      // Include metadata if present
      metadata: metadata,
      ...flaskResponse.data
    });

  } catch (error) {
    console.error('❌ Error in unscramble-photo endpoint:', error.message);

    // Clean up uploaded file if processing failed
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️  Cleaned up failed upload:', req.file.filename);
      } catch (unlinkError) {
        console.error('Failed to delete file:', unlinkError);
      }
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Python/Flask service is not running. Please start the Flask server on port 5000.'
      });
    }

    if (error.response) {
      // Flask returned an error
      return res.status(error.response.status || 500).json({
        error: error.response.data?.error || 'Unscrambling failed in Python service',
        details: error.response.data
      });
    }

    res.status(500).json({
      error: 'Failed to unscramble photo',
      message: error.message
    });
  }
});



server.post(PROXY + "/api/upload", authenticateToken, async (req, res) => {

});

// =============================
// SCRAMBLE VIDEO ENDPOINT
// =============================

server.post(PROXY + '/api/scramble-video', upload.single('file'), async (req, res) => {
  console.log('📸 Scramble video request received');

  try {
    // 1) Make sure a file came in
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    console.log('✅ File uploaded:', req.file.filename);
    console.log('📁 File path:', req.file.path);

    // 2) Parse params from multipart/form-data
    let params;
    try {
      params = typeof req.body.params === 'string'
        ? JSON.parse(req.body.params)
        : (req.body.params || {});
    } catch (parseError) {
      console.error('❌ Failed to parse parameters:', parseError);
      return res.status(400).json({ error: 'Invalid parameters format' });
    }

    console.log('📋 Scrambling parameters (from frontend):', params);

    // 3) Normalize for Flask
    //
    // IMPORTANT:
    // - Ignore params.input from the client and instead use the actual stored filename.
    // - Optionally reuse params.output, but better to tie it to the stored filename.
    const inputFile = req.file.filename; // file as saved by multer
    const outputFile = `scrambled_${inputFile}`;

    // Build the payload in the exact shape Flask expects
    const flaskPayload = {
      input: inputFile,
      output: outputFile,
      seed: params.seed ?? 123456,
      mode: params.mode || 'scramble',
      algorithm: params.algorithm || 'position',
      percentage: params.percentage ?? 100,
      // Algorithm-specific params
      rows: params.rows,
      cols: params.cols,
      max_hue_shift: params.max_hue_shift,
      max_intensity_shift: params.max_intensity_shift,

      creator: params.creator,
      // user_id: req.user?.id ?? params.user_id,
      // username: req.user?.username ?? params.username,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined
    };

    // Remove undefined keys so Flask doesn’t see them at all
    Object.keys(flaskPayload).forEach((key) => {
      if (flaskPayload[key] === undefined) delete flaskPayload[key];
    });

    console.log('🔄 Sending normalized payload to Flask:', flaskPayload);
    console.log('📡 Flask URL:', `${FLASKAPP_LINK}/scramble-video`);

    // 4) Call Flask /scramble-photo as JSON
    const flaskResponse = await axios.post(
      `${FLASKAPP_LINK}/scramble-video`,
      flaskPayload,
      {
        timeout: 180000, // 3 minutes for video processing + WebM conversion
        headers: { 'Content-Type': 'application/json' }
      }
    );

    console.log('✅ Flask response received:', flaskResponse.data);

    // Flask returns: { message, output_file, algorithm, seed, download_url, ... }
    const data = flaskResponse.data;

    // 5) Send a clean response back to the React frontend
    res.json({
      success: true,
      output_file: data.output_file,
      algorithm: data.algorithm,
      seed: data.seed,
      download_url: data.download_url,
      message: data.message || 'Image scrambled successfully',
      // Include everything else from Flask, just in case
      ...data
    });

  } catch (error) {
    console.error('❌ Error in /api/scramble-video endpoint:', error.message);

    // Cleanup uploaded file if something failed
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️  Cleaned up failed upload:', req.file.filename);
      } catch (unlinkError) {
        console.error('Failed to delete file:', unlinkError);
      }
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Python/Flask service is not running. Please start the Flask server on port 5000.'
      });
    }

    if (error.response) {
      // Flask returned an HTTP error
      return res.status(error.response.status || 500).json({
        error: error.response.data?.error || 'Scrambling failed in Python service',
        details: error.response.data
      });
    }

    res.status(500).json({
      error: 'Failed to scramble video',
      message: error.message
    });
  }
});


// =============================
// UNSCRAMBLE VIDEO ENDPOINT
// =============================
server.post(PROXY + '/api/unscramble-video', upload.single('file'), async (req, res) => {
  console.log('🔓 Unscramble video request received');

  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    console.log('✅ File uploaded:', req.file.filename);
    console.log('📁 File path:', req.file.path);

    // Parse parameters from request body
    let params;
    try {
      params = typeof req.body.params === 'string'
        ? JSON.parse(req.body.params)
        : req.body.params;
    } catch (parseError) {
      console.error('❌ Failed to parse parameters:', parseError);
      return res.status(400).json({ error: 'Invalid parameters format' });
    }

    console.log('📋 Unscrambling parameters:', params);

    // Prepare data to send to Flask
    const flaskPayload = {
      localFileName: req.file.filename,
      localFilePath: req.file.path,
      params: params,
      creator: params.creator,
      // the user_id and username can come from the unscrambling user not the creator. check req.user first and fallback to params
      user_id: req.user?.id ?? params.user_id,
      username: req.user?.username ?? params.username,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined
    };

    console.log('🔄 Sending normalized payload to Flask:', flaskPayload);
    console.log('🔄 Sending to Flask service:', FLASKAPP_LINK + '/unscramble-video');

    // 4) Call Flask /unscramble-video as JSON
    const flaskResponse = await axios.post(
      `${FLASKAPP_LINK}/unscramble-video`,
      flaskPayload,
      {
        timeout: 180000, // 3 minutes for video processing + WebM conversion
        headers: { 'Content-Type': 'application/json' }
      }
    );

    console.log('✅ Flask response received:', flaskResponse.data);


    // Return Flask response to frontend
    res.json({
      success: true,
      output_file: flaskResponse.data.output_file || flaskResponse.data.unscrambledFileName,
      unscrambledImageUrl: flaskResponse.data.unscrambledImageUrl,
      message: 'Image unscrambled successfully',
      ...flaskResponse.data
    });

  } catch (error) {
    console.error('❌ Error in /api/unscramble-video endpoint:', error.message);



    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Python/Flask service is not running. Please start the Flask server on port 5000.'
      });
    }

    if (error.response) {
      // Flask returned an error
      return res.status(error.response.status || 500).json({
        error: error.response.data?.error || 'Unscrambling failed in Python service',
        details: error.response.data
      });
    }

    res.status(500).json({
      error: 'Failed to unscramble video',
      message: error.message
    });
  }
});

// =============================
// DOWNLOAD SCRAMBLED IMAGE
// =============================
server.get(PROXY + '/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const outputDir = path.join(__dirname, 'python', 'outputs');
  const filePath = path.join(outputDir, filename);

  console.log('📥 Download request for:', filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error('❌ File not found:', filePath);
    return res.status(404).json({ error: 'File not found' });
  }

  // Send file
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('❌ Error sending file:', err);
      res.status(500).json({ error: 'Failed to send file' });
    } else {
      console.log('✅ File sent successfully:', filename);
    }
  });
});


// Photo leak detection endpoint
server.post(PROXY + '/api/check-photo-leak', authenticateToken, async (req, res) => {
  console.log('\\n' + '='.repeat(60));
  console.log('🔍 NODE: Photo leak check request received');
  console.log('='.repeat(60));

  // Setup multer for this endpoint if not already configured
  const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('❌ NODE ERROR: Multer error:', err);
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filename = req.file.filename;
      console.log(`📤 NODE: File saved as: ${filename}`);

      // Step 1: Send to Flask to extract steganographic code
      console.log('📡 NODE: Sending to Flask for code extraction...');

      const flaskResponse = await axios.post(
        `${FLASKAPP_LINK}/extract-photo-code`,
        {
          input: filename
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      const { extracted_code } = flaskResponse.data;

      console.log(`🔑 NODE: Extracted code: ${extracted_code || 'None'}`);

      if (!extracted_code) {
        return res.json({
          leakDetected: false,
          extractedCode: null,
          message: 'No steganographic code found in image'
        });
      }

      // Step 2: Search database for matching code
      console.log('🔍 NODE: Searching database for matching code...');

      const [rows] = await pool.query(
        `SELECT 
          wc.*,
          ud.username,
          ud.email,
          p.id as purchase_id,
          p.createdAt as purchase_date
        FROM watermark_codes wc
        LEFT JOIN userData ud ON wc.user_id = ud.id
        LEFT JOIN purchases p ON wc.purchase_id = p.id
        WHERE wc.code = ?`,
        [extracted_code]
      );

      if (rows.length === 0) {
        console.log('✅ NODE: No match found in database - image is clean');
        return res.json({
          leakDetected: false,
          extractedCode: extracted_code,
          message: 'Code extracted but not found in database'
        });
      }

      // Step 3: Leak detected! Return details
      const leakData = rows[0];
      console.log('🚨 NODE: LEAK DETECTED!');
      console.log(`   User: ${leakData.username} (${leakData.user_id})`);
      console.log(`   File: ${leakData.filename}`);

      // Cleanup: delete uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.warn('⚠️  Could not delete uploaded file:', cleanupErr);
      }

      console.log('='.repeat(60) + '\\n');

      return res.json({
        leakDetected: true,
        extractedCode: extracted_code,
        leakData: {
          id: leakData.id,
          code: leakData.code,
          user_id: leakData.user_id,
          username: leakData.username,
          email: leakData.email,
          filename: leakData.filename,
          media_type: leakData.media_type,
          created_at: leakData.created_at,
          purchase_id: leakData.purchase_id,
          purchase_date: leakData.purchase_date,
          device_fingerprint: leakData.device_fingerprint
        },
        message: 'Leak detected! Original owner identified.'
      });

    } catch (error) {
      console.error('❌ NODE ERROR:', error);
      console.log('='.repeat(60) + '\\n');

      // Cleanup on error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete uploaded file:', cleanupErr);
        }
      }

      return res.status(500).json({
        error: error.message,
        details: error.response?.data
      });
    }
  });
});

// Audio leak detection endpoint
server.post(PROXY + '/api/check-audio-leak', authenticateToken, async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 NODE: Audio leak check request received');
  console.log('='.repeat(60));

  // Setup multer to handle multiple files (originalAudio and leakedAudio)
  const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for audio files
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('audio/')) {
        cb(null, true);
      } else {
        cb(new Error('Only audio files are allowed'));
      }
    }
  });

  upload.fields([
    { name: 'originalAudio', maxCount: 1 },
    { name: 'leakedAudio', maxCount: 1 }
  ])(req, res, async (err) => {
    if (err) {
      console.error('❌ NODE ERROR: Multer error:', err);
      return res.status(400).json({ error: err.message });
    }

    const uploadedFiles = [];
    const LEAK_CHECK_COST = 5; // Credits cost for leak checking

    try {
      // Validate that both files were uploaded
      if (!req.files || !req.files.originalAudio || !req.files.leakedAudio) {
        return res.status(400).json({
          error: 'Both original and leaked audio files are required'
        });
      }

      const originalFile = req.files.originalAudio[0];
      const leakedFile = req.files.leakedAudio[0];
      uploadedFiles.push(originalFile.path, leakedFile.path);

      console.log(`📤 NODE: Original audio saved as: ${originalFile.filename}`);
      console.log(`📤 NODE: Leaked audio saved as: ${leakedFile.filename}`);

      // Parse optional keyData or keyCode
      let keyData = null;
      let keyCode = null;

      if (req.body.keyData) {
        try {
          keyData = typeof req.body.keyData === 'string'
            ? JSON.parse(req.body.keyData)
            : req.body.keyData;
          console.log('📋 NODE: Key data provided');
        } catch (e) {
          console.warn('⚠️  Failed to parse keyData:', e.message);
        }
      }

      if (req.body.keyCode) {
        keyCode = req.body.keyCode;
        console.log(`🔑 NODE: Key code provided: ${keyCode}`);
      }

      // Step 1: Extract steganographic code from the leaked audio
      console.log('📡 NODE: Sending leaked audio to Flask for code extraction...');

      const flaskResponse = await axios.post(
        `${FLASKAPP_LINK}/audio-stegano-extract`,
        {
          input: leakedFile.filename,
          original: originalFile.filename,
          keyData: keyData,
          keyCode: keyCode
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000 // 60 seconds for audio processing
        }
      );

      const { extracted_code, success } = flaskResponse.data;

      console.log(`🔑 NODE: Extracted code: ${extracted_code || 'None'}`);

      if (!extracted_code || !success) {
        // Cleanup uploaded files
        uploadedFiles.forEach(filePath => {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.warn('⚠️  Could not delete file:', filePath);
          }
        });

        return res.json({
          leakDetected: false,
          extractedCode: null,
          message: 'No steganographic watermark found in the leaked audio',
          creditsUsed: LEAK_CHECK_COST
        });
      }

      // Step 2: Parse the extracted code to get user info
      let extractedUserInfo = null;
      try {
        extractedUserInfo = JSON.parse(extracted_code);
        console.log('📋 NODE: Parsed user info:', extractedUserInfo);
      } catch (parseError) {
        console.log('⚠️  Could not parse extracted code as JSON, treating as plain text');
      }

      // Step 3: Search database for matching user
      console.log('🔍 NODE: Searching database for matching user...');

      let leakData = null;

      if (extractedUserInfo && extractedUserInfo.userid) {
        // Search by user ID from watermark
        const [rows] = await pool.query(
          `SELECT 
            ud.id,
            ud.username,
            ud.email,
            ud.firstName,
            ud.lastName,
            ud.createdAt
          FROM userData ud
          WHERE ud.id = ?`,
          [extractedUserInfo.userid]
        );

        if (rows.length > 0) {
          leakData = {
            ...rows[0],
            watermark_username: extractedUserInfo.username,
            watermark_timestamp: extractedUserInfo.timestamp,
            extraction_method: 'steganography'
          };
        }
      }

      // Cleanup uploaded files
      uploadedFiles.forEach(filePath => {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('⚠️  Could not delete file:', filePath);
        }
      });

      if (!leakData) {
        console.log('✅ NODE: User not found in database');
        return res.json({
          leakDetected: false,
          extractedCode: extracted_code,
          message: 'Watermark found but user not in database',
          creditsUsed: LEAK_CHECK_COST
        });
      }

      // Step 4: Leak detected! Return details
      console.log('🚨 NODE: LEAK DETECTED!');
      console.log(`   User: ${leakData.username} (ID: ${leakData.id})`);
      console.log(`   Watermark timestamp: ${leakData.watermark_timestamp}`);
      console.log('='.repeat(60) + '\n');

      return res.json({
        leakDetected: true,
        extractedCode: extracted_code,
        leakData: {
          user_id: leakData.id,
          username: leakData.username,
          email: leakData.email,
          firstName: leakData.firstName,
          lastName: leakData.lastName,
          watermark_username: leakData.watermark_username,
          watermark_timestamp: leakData.watermark_timestamp,
          account_created: leakData.createdAt,
          extraction_method: leakData.extraction_method
        },
        message: '🚨 Leak detected! Original owner identified.',
        creditsUsed: LEAK_CHECK_COST
      });

    } catch (error) {
      console.error('❌ NODE ERROR:', error);
      console.log('='.repeat(60) + '\n');

      // Cleanup uploaded files on error
      uploadedFiles.forEach(filePath => {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('⚠️  Could not delete file:', filePath);
        }
      });

      return res.status(500).json({
        error: error.message,
        details: error.response?.data
      });
    }
  });
});

// Video leak detection endpoint
server.post(PROXY + '/api/check-video-leak', authenticateToken, async (req, res) => {
  console.log('\\n' + '='.repeat(60));
  console.log('🎥 NODE: Video leak check request received');
  console.log('='.repeat(60));

  const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for videos
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed'));
      }
    }
  });

  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('❌ NODE ERROR: Multer error:', err);
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filename = req.file.filename;
      console.log(`📤 NODE: File saved as: ${filename}`);

      // PAUSE HERE FOR A MOMENT TO AVOID RATE LIMITS

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 1: Send to Flask to extract steganographic code
      console.log('📡 NODE: Sending to Flask for code extraction...');

      const flaskResponse = await axios.post(
        `${FLASKAPP_LINK}/extract-video-code`,
        {
          input: filename
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000 // 60 seconds for video processing
        }
      );

      const { extracted_code } = flaskResponse.data;

      console.log(`🔑 NODE: Extracted code: ${extracted_code || 'None'}`);

      if (!extracted_code) {
        return res.json({
          leakDetected: false,
          extractedCode: null,
          message: 'No steganographic code found in video'
        });
      }

      // Step 2: Search database
      console.log('🔍 NODE: Searching database for matching code...');

      const [rows] = await pool.query(
        `SELECT 
          wc.*,
          ud.username,
          ud.email,
          p.id as purchase_id,
          p.createdAt as purchase_date
        FROM watermark_codes wc
        LEFT JOIN userData ud ON wc.user_id = ud.id
        LEFT JOIN purchases p ON wc.purchase_id = p.id
        WHERE wc.code = ?`,
        [extracted_code]
      );

      if (rows.length === 0) {
        console.log('✅ NODE: No match found in database - video is clean');
        return res.json({
          leakDetected: false,
          extractedCode: extracted_code,
          message: 'Code extracted but not found in database'
        });
      }

      // Step 3: Leak detected!
      const leakData = rows[0];
      console.log('🚨 NODE: LEAK DETECTED!');
      console.log(`   User: ${leakData.username} (${leakData.user_id})`);

      // Cleanup
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.warn('⚠️  Could not delete uploaded file:', cleanupErr);
      }

      console.log('='.repeat(60) + '\\n');

      return res.json({
        leakDetected: true,
        extractedCode: extracted_code,
        leakData: {
          id: leakData.id,
          code: leakData.code,
          user_id: leakData.user_id,
          username: leakData.username,
          email: leakData.email,
          filename: leakData.filename,
          media_type: leakData.media_type,
          created_at: leakData.created_at,
          purchase_id: leakData.purchase_id,
          purchase_date: leakData.purchase_date,
          device_fingerprint: leakData.device_fingerprint
        },
        message: 'Leak detected! Original owner identified.'
      });

    } catch (error) {
      console.error('❌ NODE ERROR:', error.message);
      console.log('='.repeat(60) + '\\n');

      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupErr) { }
      }

      return res.status(500).json({
        error: error.message,
        details: error.response?.data
      });
    }
  });
});


// Code from FRONTEND_URL
// log succesful media unscramble event to analytics on back end
// api.post('/api/analytics/unscramble-event', {
//   username: userData.username,
//   userId: userData.id,
//   creator: decodedParams?.creator || 'unknown',
//   scrambleType: 'photo',
//   scrambleLevel: scrambleLevel,
//   timestamp: new Date().toISOString(),
//   actionCost: actionCost,
//   keyId: decodedParams?.keyId || 'unknown',
//   unscrambleKey: decodedParams ? JSON.stringify(decodedParams) : null,
//   mediaDetails: {
//     name: selectedFile?.name || 'unknown',
//     size: selectedFile?.size || 0,
//     width: scrambledImageRef.current?.naturalWidth || 0,
//     height: scrambledImageRef.current?.naturalHeight || 0
//   }
// }).catch(err => {
//   console.error('Failed to log analytics event:', err);

// });

server.post('/api/analytics/unscramble-event', async (req, res) => {
  try {
    const { username, userId, creator, actionCost, unscrambleKey, mediaDetails } = req.body;

    // CREATE TABLE
    // `unscrambles` (
    //   `id` int unsigned NOT NULL AUTO_INCREMENT,
    //   `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    //   `userId` varchar(255) DEFAULT NULL,
    //   `username` varchar(255) DEFAULT NULL,
    //   `action_cost` int DEFAULT NULL,
    //   `creatorId` varchar(255) DEFAULT NULL,
    //   `keyData` json DEFAULT NULL,
    //   `mediaDetails` json DEFAULT NULL,
    //   PRIMARY KEY (`id`)
    // ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci

    await pool.execute(
      'INSERT INTO unscrambles (userId, username, creatorId, action_cost, keyData, mediaDetails) VALUES (?, ?, ?, ?, ?, ?)',
      [
        userId || null,
        username || 'anonymous',
        creator || 'unknown',
        actionCost || 'unknown',
        unscrambleKey ? JSON.stringify(unscrambleKey) : null,
        mediaDetails ? JSON.stringify(mediaDetails) : null
      ]
    );

    res.json({ success: true, message: 'Unscramble event logged successfully' });
  } catch (error) {
    console.error('Log unscramble event error:', error);
    res.status(500).json({ success: false, message: 'Failed to log unscramble event' });
  }
});



// create a rout that will allow the clients to download video files from the server via file name
// server.get(PROXY+'/api/download/:filename', (req, res) => {
server.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  // const videoDir = path.join(__dirname, 'videos');
  const videoDir = path.join(__dirname, 'inputs');
  // const videoDir = path.join(__dirname, 'outputs');
  const filePath = path.join(videoDir, filename);

  console.log('📥 Download request for video:', filename);

  res.download(filePath, (err) => {
    if (err) {
      console.error('❌ Error downloading video:', err);
      res.status(500).send('Error downloading video');
    } else {
      console.log('✅ Video downloaded successfully:', filename);
    }
  });
});

// code from FRONTEND_URL

//  if (!response.ok) {

//         // TODO: Refund credits if applicable
//         const response = await fetch(`${API_URL}/api/refund-credits`, {
//           method: 'POST',
//           // headers: {
//           //   'Content-Type': 'application/json'
//           // },

//           body: {
//             username: userData.username,
//             email: userData.email,
//             password: localStorage.getItem('passwordtxt'),
//             cost: SCRAMBLE_COST,
//             params: params,
//           }

//         });
//         throw new Error(data.error || data.message || 'Scrambling failed');
//       }

// Handle refunding credits
server.post(PROXY + '/api/refund-credits', authenticateToken, async (req, res) => {
  const { userId, credits, username, email, currentCredits } = req.body;
  console.log('💸 Refund credits request received for user:', username, 'Credits to refund:', credits, "userId: ", userId);
  try {
    if (!userId || !credits) {
      return res.status(400).json({ success: false, message: 'Missing userId or credits' });
    }

    // Refund credits to user
    await pool.execute(
      'UPDATE userData SET credits = credits + ? WHERE id = ?',
      [credits, userId]
    );

    console.log(`✅ Refunded ${credits} credits to user ${username} (ID: ${userId})`);

    await CreateNotification(
      'credits_refunded',
      'Credits Refunded',
      `You have been refunded ${credits} credits.`,
      'refund',
      username || 'anonymous'
    );

    await pool.execute(
      'INSERT INTO actions (id, transactionId, username, email, date, time, credits, action_type, action_cost, action_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        uuidv4(),
        username || 'anonymous', // Demo user
        email || 'anonymous@example.com',
        Date.now(),
        new Date().toLocaleTimeString(),
        currentCredits || credits,
        "refunded_credits",
        credits || 15,
        "Credits refunded due to failed operation"
      ]
    );

    res.json({ success: true, message: 'Credits refunded successfully' });
  } catch (error) {
    console.error('❌ Refund credits error:', error);
    res.status(500).json({ success: false, message: 'Failed to refund credits' });
  }
});



// ========================================
// Stripe Subscription Endpoints
// ========================================

// const FRONTEND_URL = 'http://localhost:5174';


server.post('/create-checkout-session', async (req, res) => {
  const amount = req.body.amount
  const priceId = req.body.priceId; // Replace with your actual Price ID

  // console.log("req.body: ", req.body)

  console.log("amount: ", amount)
  console.log("priceId: ", priceId)

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      line_items: [
        {
          // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/return?session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
      cancel_url: `${FRONTEND_URL}/cancel`,

      // return_url: `${FRONTEND_URL}/return?session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
    });

    // Return a single response with the checkout URL (frontend should redirect user to this URL)
    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ error: "Checkout failed." });
  }
});


server.get('/session-status', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    // The paymentIntent ID is usually stored in session.payment_intent
    const paymentIntentId = session.payment_intent;

    // Retrieve PaymentIntent for more details, including total amounts & breakdown
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    console.log("PyINT: ", paymentIntent)

    // Extract any relevant data, e.g. charges, amount received, etc.
    // const charge = paymentIntent.charges.data[0]; // If only 1 charge
    const amountReceived = paymentIntent.amount; // in cents
    const receiptUrl = paymentIntent.receipt_url;
    const createAt = paymentIntent.created;
    const clientSecret = paymentIntent.clientSecret;
    const paymentID = paymentIntent.id;
    const paymentStatus = paymentIntent.paymentStatus;

    res.json({
      session,
      paymentIntent,
      status: session.status,
      customer_email: session.customer_details.email,
      receipt_url: receiptUrl,
      amount_received_cents: amountReceived,
      created: createAt,
      clientSecret: clientSecret,
      paymentID: paymentID,
      paymentStatus: paymentStatus,
      // ...any other data you need
    });

  } catch (error) {
    console.log("Error retrieving session status:", error);
    res.status(500).send("Error retrieving session status");
  }
});


// Create subscription checkout session
server.post(PROXY + '/api/subscription/create-checkout', async (req, res) => {
  try {
    const {
      userId,
      username,
      email,
      priceId,
      planId,
      planName,
      successUrl,
      cancelUrl
    } = req.body;

    if (!userId || !email || !priceId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if user already has a subscription
    const [existingSubs] = await pool.execute(
      'SELECT * FROM subscriptions WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );

    if (existingSubs.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already has an active subscription'
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email,
      client_reference_id: userId.toString(),
      metadata: {
        userId: userId.toString(),
        username: username,
        planId: planId,
        planName: planName
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          userId: userId.toString(),
          username: username,
          planId: planId,
          planName: planName
        }
      }
    });

    console.log(`✅ Created checkout session for user ${userId}: ${session.id}`);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session'
    });
  }
});

// Verify subscription session
server.get(PROXY + '/api/subscription/verify-session', async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription', 'customer']
    });

    if (session.payment_status === 'paid' && session.subscription) {
      const subscription = session.subscription;
      const userId = session.metadata.userId || session.client_reference_id;

      // Save subscription to database
      await pool.execute(
        `INSERT INTO subscriptions 
         (user_id, stripe_subscription_id, stripe_customer_id, plan_id, plan_name, 
          status, current_period_start, current_period_end, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         stripe_subscription_id = VALUES(stripe_subscription_id),
         status = VALUES(status),
         current_period_start = VALUES(current_period_start),
         current_period_end = VALUES(current_period_end)`,
        [
          userId,
          subscription.id,
          session.customer.id || session.customer,
          session.metadata.planId,
          session.metadata.planName,
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
          new Date()
        ]
      );

      console.log(`✅ Subscription activated for user ${userId}`);

      res.json({
        success: true,
        session: {
          amount_total: session.amount_total,
          customer_email: session.customer_details?.email || session.customer_email,
          subscription: {
            id: subscription.id,
            planId: session.metadata.planId,
            planName: session.metadata.planName,
            interval: subscription.items.data[0]?.plan.interval,
            current_period_end: subscription.current_period_end,
            status: subscription.status
          }
        }
      });
    } else {
      res.json({
        success: false,
        message: 'Payment not completed'
      });
    }
  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify session'
    });
  }
});

// Get current subscription
server.get(PROXY + '/api/subscription/current/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [subscriptions] = await pool.execute(
      `SELECT * FROM subscriptions 
       WHERE user_id = ? AND status IN ('active', 'trialing') 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (subscriptions.length > 0) {
      res.json({
        success: true,
        subscription: subscriptions[0]
      });
    } else {
      res.json({
        success: true,
        subscription: null
      });
    }
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
});

// Create customer portal session
server.post(PROXY + '/api/subscription/portal', async (req, res) => {
  try {
    const { userId, returnUrl } = req.body;

    // Get user's subscription
    const [subscriptions] = await pool.execute(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );

    if (subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const customerId = subscriptions[0].stripe_customer_id;

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    res.json({
      success: true,
      url: session.url
    });
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create portal session'
    });
  }
});

// Cancel subscription
server.post(PROXY + '/api/subscription/cancel', async (req, res) => {
  try {
    const { userId } = req.body;

    // Get user's subscription
    const [subscriptions] = await pool.execute(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );

    if (subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const subscriptionId = subscriptions[0].stripe_subscription_id;

    // Cancel at period end (don't cancel immediately)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    // Update database
    await pool.execute(
      'UPDATE subscriptions SET status = ? WHERE user_id = ?',
      ['canceling', userId]
    );

    console.log(`✅ Subscription cancelled for user ${userId}`);

    res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the billing period'
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});



// // Webhook handler for asynchronous events.
// server.post("/webhook", async (req, res) => {
//   let data;
//   let eventType;
//   // Check if webhook signing is configured.
//   if (process.env.STRIPE_WEBHOOK_SECRET) {
//     // Retrieve the event by verifying the signature using the raw body and secret.
//     let event;
//     let signature = req.headers["stripe-signature"];

//     try {
//       event = stripe.webhooks.constructEvent(
//         req.rawBody,
//         signature,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       console.log(`⚠️  Webhook signature verification failed.`);
//       return res.sendStatus(400);
//     }
//     // Extract the object from the event.
//     data = event.data;
//     eventType = event.type;
//   } else {
//     // Webhook signing is recommended, but if the secret is not configured in `config.js`,
//     // retrieve the event data directly from the request body.
//     data = req.body.data;
//     eventType = req.body.type;
//   }

//   if (eventType === "checkout.session.completed") {
//     console.log(`🔔  Payment received!`);
//   }

//   res.sendStatus(200);
// });

// // Stripe webhook handler
// server.post(PROXY + '/api/subscription/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
//   const sig = req.headers['stripe-signature'];
//   const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
//   } catch (err) {
//     console.error('Webhook signature verification failed:', err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   // Handle the event
//   switch (event.type) {
//     case 'customer.subscription.updated':
//       console.log('Subscription updated event received.');
//       const updatedSubscription = event.data.object;
//       await pool.execute(
//         `UPDATE subscriptions 
//          SET status = ?, current_period_start = ?, current_period_end = ? 
//          WHERE stripe_subscription_id = ?`,
//         [
//           updatedSubscription.status,
//           new Date(updatedSubscription.current_period_start * 1000),
//           new Date(updatedSubscription.current_period_end * 1000),
//           updatedSubscription.id
//         ]
//       );
//       console.log(`✅ Subscription updated: ${updatedSubscription.id}`);
//       break;
//     case 'customer.subscription.created':
//       console.log('Subscription created event received.');
//       const subscription = event.data.object;
//       await pool.execute(
//         `UPDATE subscriptions 
//          SET status = ?, current_period_start = ?, current_period_end = ? 
//          WHERE stripe_subscription_id = ?`,
//         [
//           subscription.status,
//           new Date(subscription.current_period_start * 1000),
//           new Date(subscription.current_period_end * 1000),
//           subscription.id
//         ]
//       );

//       let data = {
//         "subscription_type": subtype,
//         "subscription_cost": subcost,
//         "username": username,
//         "userId": userId,
//         "name": name,
//         "email": email,
//         "transactionId": transactionId,
//       };

//       stripeBuycredits(data);
//       console.log(`✅ Subscription created: ${subscription.id}`);
//       break;

//     case 'customer.subscription.deleted':
//       console.log('Subscription deleted event received.');
//       const deletedSub = event.data.object;
//       await pool.execute(
//         'UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?',
//         ['canceled', deletedSub.id]
//       );
//       console.log(`✅ Subscription cancelled: ${deletedSub.id}`);
//       break;

//     default:
//       console.log(`Unhandled event type ${event.type}`);
//   }

//   res.json({ received: true });
// });



// GET /stripe/success?session_id=...
server.get('/stripe/success', async (req, res) => {
  const sessionId = req.query.session_id;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    });

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // 1) Your own “who is this” identifier (if you used client_reference_id)
    const myUserOrOrderId = session.client_reference_id;

    // 2) “Username” custom field from the Payment Link
    let username = null;
    if (Array.isArray(session.custom_fields)) {
      const usernameField = session.custom_fields.find(
        f => f.key === 'username' // or whatever key Stripe uses
      );
      username = usernameField?.text?.value ?? null;
    }

    // 3) PaymentIntent details
    const paymentIntent = session.payment_intent;
    const paymentData = {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      description: paymentIntent.description,
      created: paymentIntent.created,
      customer_id: paymentIntent.customer,
    };

    const PACKAGES = [
      { credits: 2500, dollars: 2.5, label: "$2.50", color: '#4caf50', priceId: 'price_1SR9nNEViYxfJNd2pijdhiBM' },
      { credits: 5250, dollars: 5, label: "$5.00", color: '#2196f3', priceId: 'price_1SR9lZEViYxfJNd20x2uwukQ' },
      { credits: 11200, dollars: 10, label: "$10.00", color: '#9c27b0', popular: true, priceId: 'price_1SR9kzEViYxfJNd27aLA7kFW' },
      { credits: 26000, dollars: 20, label: "$20.00", color: '#f57c00', priceId: 'price_1SR9mrEViYxfJNd2dD5NHFoL' },
    ];

    const packageData = PACKAGES.find(pkg => pkg.dollars === potentialVerifiedPayment.amount / 100);

    // TODO: update your DB: mark sale as paid for `myUserOrOrderId` or `username`
    // e.g. await Orders.markPaid({ userId: myUserOrOrderId, stripePaymentIntentId: paymentIntent.id });

    const data = {
      username: user.username,
      userId: user.id,
      name: user.name,
      email: user.email,
      walletAddress: "Stripe",
      transactionId: paymentIntent.id,
      blockExplorerLink: 'Stripe Payment',
      currency: 'USD',
      amount: paymentIntent.amount,
      cryptoAmount: packageData.dollars,
      rate: null,
      session_id: user.id, // this is a useless metric here but i am keep it for reference and to maintain similar data structure
      orderLoggingEnabled: false,
      userAgent: user.userAgent,
      ip: user.ip,
      dollars: packageData.dollars,
      credits: packageData.credits

    }

    await stripeBuycredits(data);

    // For now just show something
    res.json({
      success: true,
      userOrOrderId: myUserOrOrderId,
      username,
      payment: paymentData,
    });
  } catch (err) {
    console.error('Error retrieving session', err);
    res.status(500).json({ error: 'Failed to validate payment' });
  }
});


// ----------------------------
// HELPER FUNCTIONS
// ----------------------------

/**
 * Retrieve the latest details of a PaymentIntent from Stripe
 */
async function getPaymentDetails(paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      description: paymentIntent.description,
    };
  } catch (error) {
    const errorMessage = error.message || String(error);
    console.error('[ERROR] Stripe API error:', errorMessage);
    return { error: errorMessage, status: 'api_error' };
  }
}

/**
 * Retrieve customer details from Stripe
 */
async function getCustomerDetails(customerId) {
  if (!customerId) {
    return null;
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      metadata: customer.metadata
    };
  } catch (error) {
    console.warn(`[WARN] Could not fetch customer ${customerId}:`, error.message);
    return null;
  }
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Retrieve the most recent PaymentIntents from Stripe with optional customer details
 */
async function getRecentPayments(limit = 10, includeCustomerDetails = true) {
  try {
    const paymentIntents = await stripe.paymentIntents.list({ limit });
    const results = [];

    for (const pi of paymentIntents.data) {
      const paymentData = {
        id: pi.id,
        status: pi.status,
        amount: pi.amount,
        currency: pi.currency,
        description: pi.description,
        created: pi.created,
        customer_id: pi.customer,
        metadata: pi.metadata  // Payment metadata (custom fields from checkout)
      };

      // Fetch customer details if requested and customer ID exists
      if (includeCustomerDetails && pi.customer) {
        const customerDetails = await getCustomerDetails(pi.customer);
        if (customerDetails) {
          paymentData.customer = customerDetails;
        } else {
          paymentData.customer = null;
        }
      }

      results.push(paymentData);
    }

    console.log(`[DEBUG] Fetched ${results.length} payment intents`);
    // console.log(results);
    // console.log('='.repeat(60));
    return { success: true, count: results.length, payments: results };
  } catch (error) {
    const errorMessage = error.message || String(error);
    console.error('[ERROR] Stripe API error:', errorMessage);
    return { error: errorMessage, status: 'api_error' };
  }
}

// Sent from the client: timeRange, user, packageData from buy Credits page
server.post(PROXY + '/api/verify-stripe-payment', async (req, res) => {

  const { timeRange, user, packageData } = req.body;

  const paymentData = {
    timeRange,
    package: packageData,
    user
  };

  try {
    // post to a local flask server for verification
    // const flaskResponse = await axios.post('http://0.0.0.0:5005/verify-payment-data', paymentData, async (req, res) => {
    //   return paymentData;
    // }, {
    //   headers: { 'Content-Type': 'application/json' },
    //   timeout: 30000
    // });

    const { package: pkg, timeRange, user } = paymentData;

    if (!pkg || !timeRange || !user) {
      return res.status(400).json({
        error: 'Missing required fields: package, timeRange, and user are required',
        status: 'invalid_input'
      });
    }

    console.log(`[INFO] Verifying payment data for package: ${JSON.stringify(pkg)}, timeRange: ${JSON.stringify(timeRange)}, user: ${JSON.stringify(user)}`);

    const timeRangeStart = timeRange.start;
    const timeRangeEnd = timeRange.end;



    // Fetch recent payments to search through
    const details = await getRecentPayments(20, true);

    // console.log("Recent payments fetched:", details.payments);

    if (details.error) {
      console.error('[ERROR] Could not fetch recent payments:', details.error);
      const statusCode = details.status === 'server_error' ? 500 : 404;
      return res.status(statusCode).json(details);
    }



    let possiblePaymentFound = false;
    const possibleMatchingPayments = [];

    console.log(`[INFO] Searching through ${details.payments.length} recent payments for matches.`);

    // Verify creation time and amount
    for (const payment of details.payments || []) {
      const created = payment.created * 1000; // convert to ms

      console.log(`[DEBUG] Checking payment ${payment.id}: created=${created}, amount=${payment.amount}`);

      // Check time range
      if (timeRangeStart && created < timeRangeStart) {
        continue;
      }
      if (timeRangeEnd && created > timeRangeEnd) {
        continue;
      }

      // Check payment amount
      if (payment.amount !== pkg.amount) {
        continue;
      }

      console.log(`[DEBUG] Possible matching payment found: ${payment.id}`);

      possiblePaymentFound = true;
      possibleMatchingPayments.push(payment);
    }


    console.log(' Is there a possibleMatchingPayment?: ', possiblePaymentFound);
    if (!possiblePaymentFound) {
      console.log('[INFO] No possible matching payments found in the specified time range.');
      return res.status(404).json({
        error: 'No PaymentIntent found in the specified time range',
        status: 'not_found'
      });
    }

    let potentialVerifiedPayment = null;

    // If multiple possible payments found, verify customer details
    if (possibleMatchingPayments.length > 1) {
      for (const payment of possibleMatchingPayments) {
        const customerData = payment.customer || {};
        const email = customerData.email || '';
        const name = customerData.name || '';
        const phone = customerData.phone || '';

        if (email !== user.email) {
          continue;
        }
        if (name !== user.name) {
          continue;
        }
        if (phone !== user.phone) {
          continue;
        }

        potentialVerifiedPayment = payment;
        break;
      }
    } else {
      potentialVerifiedPayment = possibleMatchingPayments[0];
    }

    if (!potentialVerifiedPayment) {
      return res.status(404).json({
        error: 'No matching PaymentIntent found after verification',
        status: 'not_found'
      });
    }

    console.log(`[INFO] Verified PaymentIntent: ${potentialVerifiedPayment.id}`);

    const PACKAGES = [
      { credits: 2500, dollars: 2.5, label: "$2.50", color: '#4caf50', priceId: 'price_1SR9nNEViYxfJNd2pijdhiBM' },
      { credits: 5250, dollars: 5, label: "$5.00", color: '#2196f3', priceId: 'price_1SR9lZEViYxfJNd20x2uwukQ' },
      { credits: 11200, dollars: 10, label: "$10.00", color: '#9c27b0', popular: true, priceId: 'price_1SR9kzEViYxfJNd27aLA7kFW' },
      { credits: 26000, dollars: 20, label: "$20.00", color: '#f57c00', priceId: 'price_1SR9mrEViYxfJNd2dD5NHFoL' },
    ];

    const packageData = PACKAGES.find(pkg => pkg.dollars === potentialVerifiedPayment.amount / 100);


    if (potentialVerifiedPayment.status == 'succeeded') {
      // Log the purchase in the database
      const data = {
        username: user.username,
        userId: user.id,
        name: user.name,
        email: user.email,
        walletAddress: "Stripe",
        transactionId: potentialVerifiedPayment.id,
        blockExplorerLink: 'Stripe Payment',
        currency: 'USD',
        amount: potentialVerifiedPayment.amount,
        cryptoAmount: packageData.dollars,
        rate: null,
        session_id: user.id, // this is a useless metric here but i am keep it for reference and to maintain similar data structure
        orderLoggingEnabled: false,
        userAgent: user.userAgent,
        ip: user.ip,
        dollars: packageData.dollars,
        credits: packageData.credits

      }

      await stripeBuycredits(data);
    }

    console.log('Payment verification completed successfully.');

    return res.json(potentialVerifiedPayment);

  } catch (error) {
    console.error('Payment verification error:', error.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// async function fetchEth({
async function stripeBuycredits(data) {

  try {
    const {
      username,
      userId,
      name,
      email,
      walletAddress,
      transactionId,
      blockExplorerLink,
      currency,
      amount,
      cryptoAmount,
      rate,
      session_id,
      orderLoggingEnabled,
      userAgent,
      ip,
      dollars,
      credits
    } = data;

    console.log('💰 Logging Stripe purchase for user:', username);


    // console.log("data: ", data)


    // check for duplicate transactionId
    if (transactionId) {
      const [existing] = await pool.execute(
        'SELECT * FROM buyCredits WHERE transactionId = ?',
        [transactionId]
      );
      if (existing.length > 0) {
        console.log('⚠️  Duplicate transaction ID detected:', transactionId);
        return ({ error: 'Duplicate transaction ID' });
      }
    }


    // Basic validation
    try {

      console.log('✅ Logging purchase for user:', username);

      const PACKAGES = [
        { credits: 2500, dollars: 2.5, label: "$2.50 Package", color: '#4caf50', priceId: 'price_1SR9nNEViYxfJNd2pijdhiBM' },
        { credits: 5250, dollars: 5, label: "$5.00 Package", color: '#2196f3', priceId: 'price_1SR9lZEViYxfJNd20x2uwukQ' },
        { credits: 11200, dollars: 10, label: "$10.00 Package", color: '#9c27b0', popular: true, priceId: 'price_1SR9kzEViYxfJNd27aLA7kFW' },
        { credits: 26000, dollars: 20, label: "$20.00 Package", color: '#f57c00', priceId: 'price_1SR9mrEViYxfJNd2dD5NHFoL' },
      ];

      const packageData = PACKAGES.find(pkg => pkg.dollars === amount / 100);

      const [purchases] = await pool.execute(
        'INSERT into buyCredits (username, id, name, email, walletAddress, transactionHash, blockExplorerLink, currency, amount, cryptoAmount, package, rate, date, time, session_id, orderLoggingEnabled, userAgent, ip, credits, paymentMethod) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          username,
          Math.random().toString(36).substring(2, 10),
          name,
          email,
          walletAddress,
          transactionId,
          "www.stripe.com",
          currency,
          amount,
          cryptoAmount,
          packageData.label,
          rate,
          Date.now(),
          new Date().toISOString(),
          session_id,
          orderLoggingEnabled,
          userAgent,
          ip,
          packageData.credits,
          'stripe'
        ]
      );

      await CreateNotification(
        'credits_purchased',
        'Credits Purchased',
        `You have purchased ${amount} credits for $${dollars}.`,
        'purchase',
        username || 'anonymous'
      );

      // Update user credits
      if (amount !== undefined && amount !== null && amount > 0) {
        await pool.execute(
          'UPDATE userData SET credits = credits + ? WHERE username = ?',
          [Math.floor(credits), username]
        );
      }

      return ({ success: true, purchases });
      // } else {
      //   // invladid transaction
      //   return res.status(400).json({ error: 'Transaction verification failed: ' + result.error });
      // }
    } catch (error) {
      console.error('Transaction verification error:', error);
      return ({ error: 'Transaction verification failed: ' + error.message });
    }

    // Insert credits into USERDATA records

  } catch (error) {
    console.error('Purchases error:', error);
    return ({ error: 'Database error - purchase logging failed' });
  }

}


/////////////////////////////////////////////////////////
//  Subscription Purchase Logging
/////////////////////////////////////////////////////////


// Get subscription data from Stripe by subscription ID or customer ID
server.get(PROXY + '/api/get-stripe-subscription', async (req, res) => {
  const { subscriptionId, customerId, email } = req.query;

  try {
    let subscription = null;

    // If subscription ID is provided, fetch that specific subscription
    if (subscriptionId) {
      console.log(`[INFO] Fetching subscription by ID: ${subscriptionId}`);

      subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product', 'customer', 'latest_invoice']
      });

      return res.json({
        success: true,
        subscription: subscription
      });
    }

    // If customer ID is provided, fetch all subscriptions for that customer
    else if (customerId) {
      console.log(`[INFO] Fetching subscriptions for customer ID: ${customerId}`);

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 100,
        expand: ['data.items.data.price.product', 'data.customer', 'data.latest_invoice']
      });

      return res.json({
        success: true,
        subscriptions: subscriptions.data,
        count: subscriptions.data.length
      });
    }

    // If email is provided, find customer by email first, then get subscriptions
    else if (email) {
      console.log(`[INFO] Fetching subscriptions for customer email: ${email}`);

      // Search for customer by email
      const customers = await stripe.customers.list({
        email: email,
        limit: 1
      });

      if (customers.data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No customer found with that email',
          status: 'not_found'
        });
      }

      const customer = customers.data[0];
      console.log(`[INFO] Found customer: ${customer.id}`);

      // Fetch subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 100,
        expand: ['data.items.data.price.product', 'data.customer', 'data.latest_invoice']
      });

      return res.json({
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name
        },
        subscriptions: subscriptions.data,
        count: subscriptions.data.length
      });
    }

    // No valid identifier provided
    else {
      return res.status(400).json({
        success: false,
        error: 'Must provide subscriptionId, customerId, or email as query parameter',
        status: 'invalid_input',
        examples: {
          bySubscriptionId: '/api/get-stripe-subscription?subscriptionId=sub_xxxxx',
          byCustomerId: '/api/get-stripe-subscription?customerId=cus_xxxxx',
          byEmail: '/api/get-stripe-subscription?email=user@example.com'
        }
      });
    }

  } catch (error) {
    console.error('[ERROR] Failed to fetch subscription:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch subscription data',
      status: 'server_error',
      code: error.code
    });
  }
});


// Get all active subscriptions (for admin/monitoring)
server.get(PROXY + '/api/get-stripe-subscriptions-all', async (req, res) => {
  const { status, limit = 10, starting_after, created_since, created_hours_ago } = req.query;

  try {
    console.log(`[INFO] Fetching all subscriptions with status: ${status || 'all'}, limit: ${limit}`);

    const params = {
      limit: Math.min(parseInt(limit), 100), // Cap at 100
      expand: ['data.items.data.price.product', 'data.customer', 'data.latest_invoice']
    };

    // Filter by status if provided (active, canceled, incomplete, etc.)
    if (status) {
      params.status = status;
    }

    // Filter by creation time - Unix timestamp
    if (created_since) {
      params.created = {
        gte: parseInt(created_since)
      };
      console.log(`[INFO] Filtering subscriptions created since: ${new Date(parseInt(created_since) * 1000).toISOString()}`);
    }
    // Helper: filter by hours ago (e.g., created_hours_ago=24 for last 24 hours)
    else if (created_hours_ago) {
      const hoursAgo = parseInt(created_hours_ago);
      const timestamp = Math.floor(Date.now() / 1000) - (hoursAgo * 3600);
      params.created = {
        gte: timestamp
      };
      console.log(`[INFO] Filtering subscriptions created in last ${hoursAgo} hours (since: ${new Date(timestamp * 1000).toISOString()})`);
    }

    // Pagination support
    if (starting_after) {
      params.starting_after = starting_after;
    }

    const subscriptions = await stripe.subscriptions.list(params);

    return res.json({
      success: true,
      subscriptions: subscriptions.data,
      count: subscriptions.data.length,
      has_more: subscriptions.has_more,
      // Provide next page cursor if there are more results
      next_cursor: subscriptions.has_more ? subscriptions.data[subscriptions.data.length - 1].id : null
    });

  } catch (error) {
    console.error('[ERROR] Failed to fetch subscriptions:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch subscriptions',
      status: 'server_error'
    });
  }
});


// Sent from the client: timeRange, user, packageData from buy Credits page
server.post(PROXY + '/api/verify-stripe-subscription', async (req, res) => {

  const { timeRange, user, subscriptionData } = req.body;

  // example
  // { "timeRange": { "start": null, "end": 1767385448125 }, "subscriptionData": { "amount": 1000, "dollars": 10, "plan": "Premium", "planType": "premium" }, "user": { "id": "LCBGL8EJ7L", "email": "testman@gmail.com", "username": "testman", "phone": "", "name": " ", "ip": "108.214.170.129", "userAgent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0" } }

  const paymentData = {
    timeRange,
    package: subscriptionData,
    // plan: subscriptionData,
    user
  };

  try {


    const { package: pkg, timeRange, user } = paymentData;

    if (!pkg || !timeRange || !user) {
      return res.status(400).json({
        error: 'Missing required fields: package, timeRange, and user are required',
        status: 'invalid_input'
      });
    }

    console.log(`[INFO] Verifying subscription data for package: ${JSON.stringify(pkg)}, timeRange: ${JSON.stringify(timeRange)}, user: ${JSON.stringify(user)}`);

    const timeRangeStart = timeRange.start;
    const timeRangeEnd = timeRange.end;

    // Fetch recent payments to search through
    const details = await getRecentPayments(20, true);

    // console.log("Recent payments fetched:", details.payments);

    if (details.error) {
      console.error('[ERROR] Could not fetch recent payments:', details.error);
      const statusCode = details.status === 'server_error' ? 500 : 404;
      return res.status(statusCode).json(details);
    }

    let possiblePaymentFound = false;
    const possibleMatchingPayments = [];

    console.log(`[INFO] Searching through ${details.payments.length} recent payments for matches.`);

    // Verify creation time and amount
    for (const payment of details.payments || []) {
      const created = payment.created * 1000; // convert to ms

      // console.log(`[DEBUG] Checking payment ${payment.id}: created=${created}, amount=${payment.amount}`);

      // Check time range
      if (timeRangeStart && created < timeRangeStart) {
        continue;
      }
      if (timeRangeEnd && created > timeRangeEnd) {
        continue;
      }

      // Check payment amount
      if (payment.amount !== pkg.amount) {
        continue;
      }

      console.log(`[DEBUG] Possible matching payment found: ${payment.id}`);

      possiblePaymentFound = true;
      possibleMatchingPayments.push(payment);
    }


    console.log(' Is there a possibleMatchingPayment?: ', possiblePaymentFound);

    if (!possiblePaymentFound) {
      console.log('[INFO] No possible matching payments found in the specified time range.');
      return res.status(404).json({
        error: 'No PaymentIntent found in the specified time range',
        status: 'not_found'
      });
    }

    let potentialVerifiedPayment = null;

    // If multiple possible payments found, verify customer details
    if (possibleMatchingPayments.length > 1) {
      for (const payment of possibleMatchingPayments) {
        const customerData = payment.customer || {};
        const email = customerData.email || '';
        const name = customerData.name || '';
        const phone = customerData.phone || '';

        if (email !== user.email) {
          continue;
        }
        if (name !== user.name) {
          continue;
        }
        if (phone !== user.phone) {
          continue;
        }

        potentialVerifiedPayment = payment;
        break;
      }
    } else {
      potentialVerifiedPayment = possibleMatchingPayments[0];
    }

    if (!potentialVerifiedPayment) {
      return res.status(404).json({
        error: 'No matching PaymentIntent found after verification',
        status: 'not_found'
      });
    }

    console.log(`[INFO] Verified PaymentIntent Subscription: ${JSON.stringify(potentialVerifiedPayment)}`);

    const PACKAGES = [
      { credits: 2500, dollars: 2.50, label: "Basic", color: '#4caf50', priceId: 'price_1SR08eEViYxfJNd2ihaRH9Fk' },
      { credits: 5250, dollars: 5, label: "Standard", color: '#2196f3', priceId: 'price_1SR09uEViYxfJNd2jL3JklFl' },
      { credits: 11200, dollars: 10, label: "Premium", color: '#9c27b0', priceId: 'price_1SR0A9EViYxfJNd258I14txA' },

    ];

    const packageData = PACKAGES.find(pkg => pkg.dollars === potentialVerifiedPayment.amount / 100);

    if (potentialVerifiedPayment.status == 'succeeded') {
      // Log the purchase in the database
      const data = {
        username: user.username,
        userId: user.id,
        name: user.name,
        email: user.email,
        walletAddress: "Stripe",
        transactionId: potentialVerifiedPayment.id,
        stripe_customer_id: potentialVerifiedPayment.customer,
        stripe_subscription_id: potentialVerifiedPayment.created, // using created time as a placeholder
        priceId: packageData.priceId,
        label: packageData.label,
        blockExplorerLink: 'Stripe Payment',
        currency: 'USD',
        amount: potentialVerifiedPayment.amount,
        cryptoAmount: packageData.dollars,
        rate: null,
        session_id: user.id, // this is a useless metric here but i am keep it for reference and to maintain similar data structure
        orderLoggingEnabled: false,
        userAgent: user.userAgent,
        ip: user.ip,
        dollars: packageData.dollars,
        credits: packageData.credits,
        planType: packageData.label.toLowerCase(),
        plan: packageData.label

      }

      await stripeBuySubscription(data);
    }

    console.log('Payment verification completed successfully.');

    return res.json(potentialVerifiedPayment);

  } catch (error) {
    console.error('Payment verification error:', error.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// async function fetchEth({
async function stripeBuySubscription(data) {

  try {
    const {
      username,
      userId,
      name,
      email,
      walletAddress,
      transactionId,
      stripe_subscription_id,
      stripe_customer_id,
      priceId,
      label,
      blockExplorerLink,
      currency,
      amount,
      cryptoAmount,
      rate,
      session_id,
      orderLoggingEnabled,
      userAgent,
      ip,
      dollars,
      planType,
      plan,
      credits
    } = data;

    console.log('💰 Logging Stripe purchase for user:', username);


    console.log("data: ", data)


    // check for duplicate transactionId
    if (transactionId) {
      // const [existing] = await pool.execute(
      //   'SELECT * FROM buyCredits WHERE transactionHash = ?',
      //   [transactionId]
      // );
      const [existing] = await pool.execute(
        'SELECT * FROM buyCredits WHERE transactionId = ?',
        [transactionId]
      );
      if (existing.length > 0) {
        console.log('⚠️  Duplicate transaction ID detected:', transactionId);
        return ({ error: 'Duplicate transaction ID' });
      }
    }

    // Basic validation
    try {
      // upload payment details to sql backend

      // if (result.success) {

      console.log('✅ Logging purchase for user:', username);

      // CREATE TABLE
      // `subscriptions` (
      //   `id` bigint NOT NULL AUTO_INCREMENT,
      //   `user_id` bigint NOT NULL,
      //   `stripe_subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      //   `stripe_customer_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      //   `plan_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      //   `plan_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      //   `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      //   `current_period_start` timestamp NULL DEFAULT NULL,
      //   `current_period_end` timestamp NULL DEFAULT NULL,
      //   `cancel_at_period_end` tinyint(1) DEFAULT '0',
      //   `canceled_at` timestamp NULL DEFAULT NULL,
      //   `trial_start` timestamp NULL DEFAULT NULL,
      //   `trial_end` timestamp NULL DEFAULT NULL,
      //   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      //   `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      //   PRIMARY KEY (`id`),
      //   UNIQUE KEY `stripe_subscription_id` (`stripe_subscription_id`),
      //   UNIQUE KEY `unique_user_subscription` (`user_id`, `status`),

      // Helper function to convert timestamp to MySQL datetime format
      const toMySQLDateTime = (timestamp) => {
        return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
      };

      const currentTime = Date.now();
      const periodEndTime = currentTime + 30 * 24 * 60 * 60 * 1000;

      const [subscription] = await pool.execute(
        'INSERT into subscriptions (username, user_id, stripe_subscription_id, stripe_customer_id, plan_id, plan_name, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_start, trial_end, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          username,
          userId,
          stripe_subscription_id,  // Fixed: was using transactionId
          stripe_customer_id,
          priceId,
          label,
          'active',
          toMySQLDateTime(currentTime),
          toMySQLDateTime(periodEndTime),
          0,
          null,
          null,
          null,
          toMySQLDateTime(currentTime),
          toMySQLDateTime(currentTime)
        ]
      );

      function convertUTCtoMySQLDatetime(utcSeconds) {
        const date = new Date(utcSeconds * 1000);
        return date.toISOString().slice(0, 19).replace('T', ' ');
      }


      const [purchases] = await pool.execute(
        'INSERT into buyCredits (username, id, name, email, walletAddress, transactionHash, blockExplorerLink, currency, amount, cryptoAmount, rate, date, time, session_id, orderLoggingEnabled, userAgent, ip, credits, created_at, paymentMethod, package) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          username,
          Math.random().toString(36).substring(2, 10),
          name,
          email,
          " Bonus credits", //walletAddress,
          transactionId,
          "www.stripe.com/subscriptions",
          currency,
          Math.floor(credits) / 2, // log half the amount as credits, the other half will be bonus credits
          cryptoAmount, // keep the same cryptoAmount for reference
          rate,  // keep the same rate for reference 1 usd = 1000 credits
          Date.now(),
          new Date().toISOString(),
          session_id,
          orderLoggingEnabled,
          userAgent,
          ip,
          credits !== undefined && credits !== null ? Math.floor(credits) / 2 : 0,
          convertUTCtoMySQLDatetime(stripe_subscription_id),
          "stripe_subscription",
          dollars + "$ " + planType + '_subscription',
        ]
      );

      await CreateNotification(
        'credits_purchased',
        'Credits Purchased',
        `You have purchased a $${plan} plan for $${dollars}, and you also have received ${Math.floor(credits) / 2} bonus credits!!!`,
        'purchase',
        username || 'anonymous'
      );

      // Insert credits into USERDATA records

      // Update user credits
      if (credits !== undefined && credits !== null && credits > 0) {
        await pool.execute(
          'UPDATE userData SET credits = credits + ?, accountType = ? WHERE username = ?',
          [Math.floor(credits) / 2, planType, username]
        );
      }

      return ({ success: true, purchases, subscription });

    } catch (error) {
      console.error('Transaction verification error:', error);
      return ({ error: 'Transaction verification failed: ' + error.message });
    }

  } catch (error) {
    console.error('Purchases error:', error);
    return ({ error: 'Database error - purchase logging failed' });
  }

}


// Global error handler
server.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler for undefined routes (MUST BE LAST!)
server.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  try {
    // Test database connection
    await pool.execute('SELECT 1');
    console.log('🚀 Express Server with MySQL is running on port', PORT);
    console.log('�️  Database: KeyChingDB (MySQL)');
    console.log('🌐 API Base URL: http://localhost:' + PORT + PROXY + '/api');
    console.log('� Flask Service: ' + FLASKAPP_LINK);
    console.log('📋 Available endpoints:');
    console.log('   - GET /api/userData');
    console.log('   - GET /api/createdKeys');
    console.log('   - GET /api/unlocks/:username');
    console.log('   - GET /api/purchases/:username');
    console.log('   - GET /api/redemptions/:username');
    console.log('   - GET /api/notifications/:username');
    console.log('   - POST /api/auth/login');
    console.log('   - GET /api/wallet/balance');
    console.log('   - POST /api/unlock/:keyId');
    console.log('   - GET /api/listings');
    console.log('   - POST /api/create-key');
    console.log('   - GET /api/:table');
    console.log('   - GET /api/:table/:id');
    console.log('   - PATCH /api/:table/:id');
  } catch (error) {
    console.error('❌ Failed to connect to MySQL database:', error.message);
    console.log('📝 Please ensure:');
    console.log('   1. MySQL server is running');
    console.log('   2. KeyChingDB database exists');
    console.log('   3. Database credentials are correct in server.cjs');
    process.exit(1);
  }
});
// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});


