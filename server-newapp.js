require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const knex = require('./config/knex');
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
// const emailService = require('./AmazonSESemailService.cjs');
const emailService = require('./email-service');

// const authenticateToken = require('../middleware/auth');
const authenticateToken = require('./middleware/auth');
const createAdminRouter = require('./server-admin');
const drauwperRoutes = require('./drauwper-routes');
// const pythonService = require('./python-service.cjs');

const server = express();

const PROXY = process.env.PROXY || '';
// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'drauwper',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Helper function to build INSERT queries from objects
function buildInsert(tableName, data) {
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const values = Object.values(data);

  const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
  return { sql, values };
}

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

const FRONTEND_URL = process.env.FRONTEND_URL || "drauwpr.com";

// USE this CORS CONFIG Later

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:4000',
      'http://localhost:5001',
      // 'http://localhost:5000',
      // 'https://key-ching.com',
      'https://drauwper.com',
      'https://www.drauwper.com',
      // 'https://microtrax.netlify.app',
      // "https://servers4sqldb.uc.r.appspot.com",
      // "https://orca-app-j32vd.ondigitalocean.app",
      // "https://monkfish-app-mllt8.ondigitalocean.app/",
      "https://editor-pavement-encircle.ngrok-free.dev",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://142.93.82.161",
      "https://server.drauwper.com",
      'https://js.stripe.com',
      // "*", // Allow all origins (for development, remove in production)
      // Add any other origins you want to allow
    ];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // Explicitly allow these HTTP methods
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // Allow Authorization header and other custom headers
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  // Expose headers that the client can access
  exposedHeaders: ['Authorization'],
  // Some legacy browsers choke on 204
  optionsSuccessStatus: 200,
  // Enable preflight caching (in seconds) - reduce preflight requests
  maxAge: 86400
};

server.use(cors(corsOptions));
// server.options('*', cors(corsOptions)); // handle preflight for all routes

// // #################################################################################


let LOG_FILE;
let lastRotationCheck = new Date().getUTCDate();

/**
 * Generates a new log filename with a 2026-compliant ISO timestamp.
 */
function getNewLogPath() {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  return path.join(__dirname + "/logs", `universal_${timestamp}.log`);
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
  const initialUptimeSeconds = Math.max(0, Math.floor((Date.now() - analytics.startTime) / 1000));
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Drauwper Server</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Arial, sans-serif;
      background: #f4f6f8;
      color: #1f2937;
    }
    .card {
      width: min(92vw, 560px);
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 28px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.08);
      text-align: center;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.6rem;
    }
    p {
      margin: 8px 0;
      line-height: 1.4;
    }
    .uptime {
      margin: 12px 0 20px;
      font-weight: 700;
      color: #111827;
    }
    .btn {
      display: inline-block;
      text-decoration: none;
      color: #ffffff;
      background: #2563eb;
      border-radius: 8px;
      padding: 10px 14px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Welcome to Drauwper Server</h1>
    <p>Backend service is running.</p>
    <p class="uptime">Uptime: <span id="uptime">0s</span></p>
    <a class="btn" href="/admin/login">Go to Admin Login</a>
  </main>
  <script>
    const startedAtSeconds = ${initialUptimeSeconds};
    const startNow = Date.now();

    function formatDuration(totalSeconds) {
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const parts = [];
      if (days) parts.push(days + 'd');
      if (hours || days) parts.push(hours + 'h');
      if (minutes || hours || days) parts.push(minutes + 'm');
      parts.push(seconds + 's');
      return parts.join(' ');
    }

    function renderUptime() {
      const elapsed = Math.floor((Date.now() - startNow) / 1000);
      const total = startedAtSeconds + elapsed;
      document.getElementById('uptime').textContent = formatDuration(total);
    }

    renderUptime();
    setInterval(renderUptime, 1000);
  </script>
</body>
</html>`);
});

// test hello world route
server.get('/hello', (req, res) => {
  console.log("Hello world endpoint was hit!");
  res.send('Hello, world!');
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


const currencyIdMap = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  LTC: 'litecoin',
  SOL: 'solana',
  // XMR: 'monero',
  // XRP: 'ripple'
};

// Fetch crypto rate from CoinGecko API
const fetchCryptoRate = async (cryptoCurrency) => {
  try {
    const coinId = currencyIdMap[cryptoCurrency];
    if (!coinId) {
      console.error('Currency not supported:', cryptoCurrency);
      return 0;
    }

    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
    const data = await response.json();
    return data[coinId]?.usd || 0;
  } catch (error) {
    console.error('Error fetching crypto rate:', error);
    // Fallback rates for demo
    const fallbackRates = { BTC: 45000, ETH: 3000, LTC: 100, SOL: 50, XMR: 150, XRP: 0.5 };
    return fallbackRates[cryptoCurrency] || 0;
  }
};

// In-memory cache: { [coinId]: { rate: number, fetchedAt: number } }
const rateCache = {};
const RATE_CACHE_TTL_MS = 60_000; // 60 seconds

// Proxy endpoint so the browser never hits CoinGecko directly (avoids CORS/rate-limit issues)
server.get(PROXY + '/api/crypto-rate', async (req, res) => {
  const { coin } = req.query;
  const allowed = Object.values(currencyIdMap);
  if (!coin || !allowed.includes(coin)) {
    return res.status(400).json({ error: 'Unsupported coin id' });
  }

  const now = Date.now();
  const cached = rateCache[coin];
  if (cached && now - cached.fetchedAt < RATE_CACHE_TTL_MS) {
    return res.json({ [coin]: { usd: cached.rate } });
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await response.json();
    const rate = data[coin]?.usd ?? null;
    if (rate !== null) {
      rateCache[coin] = { rate, fetchedAt: now };
    }
    res.json({ [coin]: { usd: rate } });
  } catch (error) {
    console.error('Crypto rate proxy error:', error);
    // Return cached stale data if available, otherwise fallback
    if (cached) return res.json({ [coin]: { usd: cached.rate } });
    const fallback = { bitcoin: 45000, ethereum: 3000, litecoin: 100, solana: 50 };
    res.json({ [coin]: { usd: fallback[coin] ?? 0 } });
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

    const users = await knex('userData')
      .where('email', email)
      .select('*');

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

      await knex('userData')
        .where('email', email)
        .update({ loginStatus: true, lastLogin: currentDateTime });

      // Generate a proper JWT-like token (in production, use actual JWT)
      // const token = Buffer.from(`${user.id}_${Date.now()}_${Math.random()}`).toString('base64');

      // const token = jwt.sign({ id: user.id, user_id: user.user_id, accountId: user.account_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const token = jwt.sign({
        id: user.id,
        email: user.email,
        username: user.username,
        credits: user.credits
      }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

      // conver random amounts to crypto amounts based on current rates 
      const btcRate = await fetchCryptoRate('BTC');
      const ethRate = await fetchCryptoRate('ETH');
      const ltcRate = await fetchCryptoRate('LTC');
      const solRate = await fetchCryptoRate('SOL');
      // const xmrRate = await fetchCryptoRate('XMR');
      // const xrpRate = await fetchCryptoRate('XRP');
      const amount1BTC = (user.amount1 / btcRate).toFixed(8);
      const amount2BTC = (user.amount2 / btcRate).toFixed(8);
      const amount1ETH = (user.amount1 / ethRate).toFixed(8);
      const amount2ETH = (user.amount2 / ethRate).toFixed(8);
      const amount1LTC = (user.amount1 / ltcRate).toFixed(8);
      const amount2LTC = (user.amount2 / ltcRate).toFixed(8);
      const amount1SOL = (user.amount1 / solRate).toFixed(8);
      const amount2SOL = (user.amount2 / solRate).toFixed(8);

      res.json({
        token,
        tokenExpiry: new Date(Date.now() + 7200 * 1000),
        user: { id: user.id, username: user.username, email: user.email, credits: user.credits },
        accountType: user.accountType,
        message: 'Login successful',
        // verification: { status: user.verification, amount1: user.amount1, amount2: user.amount2 },
        verification: {
          verified: false,
          amount1: user.amount1,
          amount2: user.amount2,
          cryptoAmounts: {
            BTC: { amount1: amount1BTC, amount2: amount2BTC },
            ETH: { amount1: amount1ETH, amount2: amount2ETH },
            LTC: { amount1: amount1LTC, amount2: amount2LTC },
            SOL: { amount1: amount1SOL, amount2: amount2SOL }
          },
          time: new Date().getTime(),
        }
      });

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
server.post(PROXY + '/api/user', authenticateToken, async (req, res) => {
  console.log("Fetching user details...");
  try {
    const { email, username } = req.body;
    //  console.log("User found:", user.username);
    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const users = await knex('userData')
      .where('email', email)
      .select('*');

    const user = users[0];

    const actions = await knex('actions')
      .where('email', email)
      .select('*');

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
    // const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    // if (isValidPassword) {
    const userData = { ...user };
    delete userData.passwordHash; // Don't send password hash

    // Update last login with proper MySQL datetime format
    // const currentDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Generate a proper JWT-like token (in production, use actual JWT)
    // const token = Buffer.from(`${user.id}_${Date.now()}_${Math.random()}`).toString('base64');
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      username: user.username,
      credits: user.credits
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });


    res.json({
      success: true,
      user: userData,
      unlocks: actions,
      dayPassExpiry: user.dayPassExpiry,
      dayPassMode: user.dayPassMode,
      planExpiry: user.planExpiry,
      token: token,
      tokenExpiry: new Date(Date.now() + 7200 * 1000),
      accountType: user.accountType,
      message: 'Login successful'
    });
    // }

    // } else {
    //   res.status(401).json({
    //     success: false,
    //     message: 'Invalid credentials'
    //   });
    // }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during login'
    });
  }
});


// Update profile fields (bio, banner, avatar, social links, intro video)
server.put(PROXY + '/api/users/profile', authenticateToken, async (req, res) => {
  console.log(`PUT /api/users/profile — user: ${req.user?.email}`);
  try {
    const { email } = req.user; // Get email from authenticated token
    const { bio, bioVideoUrl, bannerUrl, profilePicture, socialLinks } = req.body;

    // Validate input (you can add more validation as needed)
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Update user profile in the database
    await knex('userData')
      .where('email', email)
      .update({
        bio: bio || '',
        bioVideoUrl: bioVideoUrl || null,
        bannerUrl: bannerUrl || null,
        profilePicture: profilePicture || null,
        socialLinks: JSON.stringify(socialLinks || {})
      });

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during profile update'
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
    const existingUsers = await knex('userData')
      .where('username', username)
      .orWhere('email', email)
      .select('id');

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

    // gerate two small random amounts for verification above 10 cents USD, less than 20 cents.
    const amount1 = (0.1 * parseFloat(Math.random().toFixed(8)) + 0.1).toPrecision(4);
    const amount2 = (0.1 * parseFloat(Math.random().toFixed(8)) + 0.1).toPrecision(4);




    // conver random amounts to crypto amounts based on current rates 
    const btcRate = await fetchCryptoRate('BTC');
    const ethRate = await fetchCryptoRate('ETH');
    const ltcRate = await fetchCryptoRate('LTC');
    const solRate = await fetchCryptoRate('SOL');
    // const xmrRate = await fetchCryptoRate('XMR');
    // const xrpRate = await fetchCryptoRate('XRP');
    const amount1BTC = (amount1 / btcRate).toFixed(8);
    const amount2BTC = (amount2 / btcRate).toFixed(8);
    const amount1ETH = (amount1 / ethRate).toFixed(8);
    const amount2ETH = (amount2 / ethRate).toFixed(8);
    const amount1LTC = (amount1 / ltcRate).toFixed(8);
    const amount2LTC = (amount2 / ltcRate).toFixed(8);
    const amount1SOL = (amount1 / solRate).toFixed(8);
    const amount2SOL = (amount2 / solRate).toFixed(8);
    // const amount1XMR = (amount1 / xmrRate).toFixed(8);
    // const amount2XMR = (amount2 / xmrRate).toFixed(8);
    // const amount1XRP = (amount1 / xrpRate).toFixed(8);
    // const amount2X

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

    // await pool.execute(
    //   'INSERT INTO userData (id, loginStatus, lastLogin, accountType, username, email, firstName, lastName, phoneNumber, birthDate, encryptionKey, credits, reportCount, isBanned, banReason, banDate, banDuration, createdAt, updatedAt, passwordHash, twoFactorEnabled, twoFactorSecret, recoveryCodes, profilePicture, bio, socialLinks, verification, amount1, amount2, cryptoAmounts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    //   [
    //     newUser.id,
    //     newUser.loginStatus,
    //     newUser.lastLogin,
    //     newUser.accountType,
    //     newUser.username,
    //     newUser.email,
    //     newUser.firstName,
    //     newUser.lastName,
    //     newUser.phoneNumber,
    //     newUser.birthDate,
    //     newUser.encryptionKey,
    //     newUser.credits,
    //     newUser.reportCount,
    //     newUser.isBanned,
    //     newUser.banReason,
    //     formatDateTimeForMySQL(newUser.banDate),
    //     newUser.banDuration,
    //     newUser.createdAt,
    //     newUser.updatedAt,
    //     newUser.passwordHash,
    //     newUser.twoFactorEnabled,
    //     newUser.twoFactorSecret,
    //     JSON.stringify(newUser.recoveryCodes),
    //     newUser.profilePicture,
    //     newUser.bio,
    //     JSON.stringify(newUser.socialLinks),
    //     "false",
    //     amount1,
    //     amount2,
    //     cryptoAmounts = JSON.stringify({
    //       BTC: { amount1: amount1BTC, amount2: amount2BTC },
    //       ETH: { amount1: amount1ETH, amount2: amount2ETH },
    //       LTC: { amount1: amount1LTC, amount2: amount2LTC },
    //       SOL: { amount1: amount1SOL, amount2: amount2SOL }
    //     })
    //   ]
    // );

    const insertData = {
      id: newUser.id,
      loginStatus: newUser.loginStatus,
      lastLogin: newUser.lastLogin,
      accountType: newUser.accountType,
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      phoneNumber: newUser.phoneNumber,
      birthDate: newUser.birthDate,
      encryptionKey: newUser.encryptionKey,
      credits: newUser.credits,
      reportCount: newUser.reportCount,
      isBanned: newUser.isBanned,
      banReason: newUser.banReason,
      banDate: formatDateTimeForMySQL(newUser.banDate),
      banDuration: newUser.banDuration,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
      passwordHash: newUser.passwordHash,
      twoFactorEnabled: newUser.twoFactorEnabled,
      twoFactorSecret: newUser.twoFactorSecret,
      recoveryCodes: JSON.stringify(newUser.recoveryCodes),
      profilePicture: newUser.profilePicture,
      bio: newUser.bio,
      socialLinks: JSON.stringify(newUser.socialLinks),
      verification: "false",
      amount1: amount1,
      amount2: amount2,
      cryptoAmounts: JSON.stringify({
        BTC: { amount1: amount1BTC, amount2: amount2BTC },
        ETH: { amount1: amount1ETH, amount2: amount2ETH },
        LTC: { amount1: amount1LTC, amount2: amount2LTC },
        SOL: { amount1: amount1SOL, amount2: amount2SOL }
      })
    };

    const { sql, values } = buildInsert('userData', insertData);
    await knex.raw(sql, values);

    // Generate token for automatic login
    // TODO: implementation of JWT here
    const token = jwt.sign({
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      credits: newUser.credits
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    // const token = Buffer.from(`${userId}_${Date.now()}_${Math.random()}`).toString('base64');

    // Return user data without password hash
    const userData = { ...newUser };
    delete userData.passwordHash;

    res.status(201).json({
      success: true,
      user: userData,
      token: token,
      verification: {
        verified: false,
        amount1: amount1,
        amount2: amount2,
        cryptoAmounts: {
          BTC: { amount1: amount1BTC, amount2: amount2BTC },
          ETH: { amount1: amount1ETH, amount2: amount2ETH },
          LTC: { amount1: amount1LTC, amount2: amount2LTC },
          SOL: { amount1: amount1SOL, amount2: amount2SOL }
        },
        time: new Date().getTime(),
        // chain: null,
        // address: null
      },
      message: 'Account created successfully'
    });

    sendAccountVerificationEmail(newUser);


  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during registration'
    });
  }
});

const convertCryptoTXamountIntoUSD = (chain, txAmount) => {
  return new Promise(async (resolve, reject) => {
    try {
      const currencyIdMap = {
        BTC: 'bitcoin',
        ETH: 'ethereum',
        LTC: 'litecoin',
        SOL: 'solana',
      };

      const coinId = currencyIdMap[chain];
      if (!coinId) {
        console.error('Currency not supported for conversion:', chain);
        return resolve(0);
      }

      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
      const data = await response.json();
      const rate = data[coinId]?.usd || 0;
      const usdAmount = txAmount * rate;
      resolve(usdAmount);
    } catch (error) {
      console.error('Error converting crypto amount to USD:', error);
      resolve(0);
    }
  });
}


// Custom authentication route
server.post(PROXY + '/api/auth/verify-account', authenticateToken, async (req, res) => {
  try {
    const { email, username, chain, address, transactionId, transactionId2 } = req.body;

    if (!chain || !address || !email || !username || !transactionId || !transactionId2) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required for verification'
      });
    }

    // Anti-spoofing: reject if either hash was already used in a previous verification
    const existing = await knex('verificationTxLog')
      .whereIn('txHash', [transactionId, transactionId2])
      .select('txHash');

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'One or more transaction hashes have already been used for verification'
      });
    }

    const users = await knex('userData').where('email', email).select('*');
    const userData = users[0];

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'User not found for verification'
      });
    }

    const TX_TABLE = { BTC: 'BTC_TX', ETH: 'ETH_TX', LTC: 'LTC_TX', SOL: 'SOL_TX' };
    const txTable = TX_TABLE[chain];

    if (!txTable) {
      return res.status(400).json({ success: false, message: 'Unsupported chain' });
    }

    FetchRecentTransactionsCronByChain(chain); // trigger fresh TX fetch
    await new Promise(resolve => setTimeout(resolve, 5000)); // wait for fetch to complete

    // Look up each TX hash separately in the chain's transaction table
    const [rows1, rows2] = await Promise.all([
      knex(txTable).where('hash', transactionId).select('*'),
      knex(txTable).where('hash', transactionId2).select('*'),
    ]);

    console.log(`Verification TX lookup — hash1: ${rows1.length} row(s), hash2: ${rows2.length} row(s)`);

    if (!rows1.length) {
      await knex('userData').where('email', email).update({ verification: 'false' });
      return res.status(400).json({
        success: false,
        message: 'Transaction 1 not found on chain — verification failed'
      });
    }

    if (!rows2.length) {
      await knex('userData').where('email', email).update({ verification: 'false' });
      return res.status(400).json({
        success: false,
        message: 'Transaction 2 not found on chain — verification failed'
      });
    }

    const tx1Amount = parseFloat(rows1[0].amount || rows1[0].value);
    const tx2Amount = parseFloat(rows2[0].amount || rows2[0].value);

    const [usd1, usd2] = await Promise.all([
      convertCryptoTXamountIntoUSD(chain, tx1Amount),
      convertCryptoTXamountIntoUSD(chain, tx2Amount),
    ]);

    console.log(`TX1: $${usd1?.toFixed(4)} vs expected $${userData.amount1}`);
    console.log(`TX2: $${usd2?.toFixed(4)} vs expected $${userData.amount2}`);

    const diff1 = Math.abs(usd1 - userData.amount1);
    const diff2 = Math.abs(usd2 - userData.amount2);

    if (diff1 >= 0.025) {
      await knex('userData').where('email', email).update({ verification: 'false' });
      return res.status(400).json({
        success: false,
        message: 'Transaction 1 amount does not match — verification failed'
      });
    }

    if (diff2 >= 0.025) {
      await knex('userData').where('email', email).update({ verification: 'false' });
      return res.status(400).json({
        success: false,
        message: 'Transaction 2 amount does not match — verification failed'
      });
    }

    // Both TXs verified — mark account as verified and log hashes to prevent reuse
    await knex('userData').where('email', email).update({ verification: 'true' });
    await knex('verificationTxLog').insert([
      { txHash: transactionId, chain, usedBy: userData.id, usedForEmail: email },
      { txHash: transactionId2, chain, usedBy: userData.id, usedForEmail: email },
    ]);

    console.log('Account verified successfully for user:', email);

    res.json({ success: true, message: 'Account verified successfully' });

  } catch (error) {
    console.error('Account verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during account verification'
    });
  }
});


/**
 * POST /api/auth/verification-docs/:username
 * Upload face pic and ID photo for identity verification.
 * Files stored locally in server/uploads/verification/ — ephemeral, deleted after manual review.
 */
server.post(PROXY + '/api/auth/verification-docs/:username', authenticateToken, async (req, res) => {
  const { username } = req.params;
  let busboy;
  try {
    busboy = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, files: 2 } });
  } catch (e) {
    console.error('Failed to init Busboy:', e);
    return res.status(400).json({ message: 'Invalid multipart/form-data request' });
  }

  // Local ephemeral directory
  const uploadDir = path.join(__dirname, 'uploads', 'verification', username);
  fs.mkdirSync(uploadDir, { recursive: true });

  let uploadDone = false;
  const savedFiles = {};
  let pendingWrites = 0;
  let aborted = false;

  busboy.on('file', (fieldname, file, info) => {
    if (fieldname !== 'facePic' && fieldname !== 'idPhoto') {
      file.resume();
      return;
    }

    const { filename: rawFilename, mimeType } = info || {};
    const originalName =
      typeof rawFilename === 'string' && rawFilename.trim() ? rawFilename.trim() : 'doc';

    const extFromName = path.extname(originalName).toLowerCase().replace('.', '');
    const extOk = !!extFromName && ALLOWED.test(extFromName);
    const mimeOk = ALLOWED.test((mimeType || '').split('/').pop() || '');

    if (!extOk && !mimeOk) {
      file.resume();
      if (!aborted) {
        aborted = true;
        if (!uploadDone) {
          uploadDone = true;
          return res.status(400).json({ message: 'Error: Images Only!' });
        }
      }
      return;
    }

    pendingWrites++;

    const ext = extOk ? `.${extFromName}` : (MIME_TO_EXT[(mimeType || '').toLowerCase()] || '.jpg');
    const localFileName = `${fieldname}_${uuidv4()}${ext}`;
    const localPath = path.join(uploadDir, localFileName);

    const writeStream = fs.createWriteStream(localPath);
    file.pipe(writeStream);

    writeStream.on('error', (err) => {
      console.error('Local write error:', err);
      pendingWrites--;
      if (!uploadDone) {
        uploadDone = true;
        return res.status(500).json({ message: 'Upload failed' });
      }
    });

    writeStream.on('finish', async () => {
      savedFiles[fieldname] = '/' + path.relative(__dirname, localPath).replace(/\\/g, '/');
      pendingWrites--;

      if (pendingWrites === 0 && !uploadDone) {
        uploadDone = true;
        try {
          await ensureVerificationReviewColumns();
          await knex('userData')
            .where('username', username)
            .update({
              verification: 'pending',
              verificationFacePath: savedFiles.facePic || null,
              verificationIdPath: savedFiles.idPhoto || null,
              verificationDocsStatus: 'pending',
              verificationDocsNotes: null,
              verificationDocsReviewedAt: null,
              verificationDocsReviewedBy: null,
            });

          return res.status(200).json({
            success: true,
            message: 'Verification documents uploaded for review',
            files: Object.keys(savedFiles),
          });
        } catch (err) {
          console.error('DB update error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
      }
    });
  });

  busboy.on('error', (err) => {
    console.error('Busboy error:', err);
    if (!uploadDone) { uploadDone = true; return res.status(400).json({ message: 'Malformed upload' }); }
  });

  busboy.on('finish', () => {
    if (aborted) return;
    if (pendingWrites === 0 && Object.keys(savedFiles).length === 0 && !uploadDone) {
      uploadDone = true;
      return res.status(400).json({ message: 'No files uploaded' });
    }
  });

  req.pipe(busboy);
});

server.post(PROXY + '/api/promo-submissions', authenticateToken, async (req, res) => {
  await ensurePromoSubmissionsTable();

  let busboy;
  try {
    busboy = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  } catch (e) {
    console.error('Promo submission init error:', e);
    return res.status(400).json({ message: 'Invalid multipart/form-data request' });
  }

  const folderName = String(req.user?.username || req.user?.id || 'user').replace(/[^a-zA-Z0-9_-]/g, '_');
  const uploadDir = path.join(__dirname, 'uploads', 'promo-submissions', folderName);
  fs.mkdirSync(uploadDir, { recursive: true });

  const fields = {};
  let assetPath = null;
  let pendingWrites = 0;
  let uploadFinished = false;
  let responded = false;

  const finalize = async () => {
    if (!uploadFinished || pendingWrites > 0 || responded) return;
    responded = true;

    try {
      const submissionType = String(fields.submissionType || '').trim();
      const mediaType = String(fields.mediaType || '').trim();
      const title = String(fields.title || '').trim();
      const description = String(fields.description || '').trim();
      const targetDropId = String(fields.targetDropId || '').trim() || null;
      const mediaUrl = String(fields.mediaUrl || '').trim() || null;
      const ctaText = String(fields.ctaText || '').trim() || null;
      const contactEmail = String(fields.contactEmail || req.user?.email || '').trim();
      const budgetUsd = Number(fields.budgetUsd || 0) || 0;
      const tags = String(fields.tags || '').trim() || null;

      if (!['ad', 'drop_sponsorship'].includes(submissionType)) {
        return res.status(400).json({ message: 'Invalid submission type' });
      }
      if (!['image', 'video_link', 'audio'].includes(mediaType)) {
        return res.status(400).json({ message: 'Invalid media type' });
      }
      if (!title || !description || !contactEmail) {
        return res.status(400).json({ message: 'Please complete the required fields' });
      }
      if (mediaType === 'video_link' && !mediaUrl) {
        return res.status(400).json({ message: 'A video link is required for video submissions' });
      }
      if ((mediaType === 'image' || mediaType === 'audio') && !assetPath && !mediaUrl) {
        return res.status(400).json({ message: 'Please upload a file or provide a media link' });
      }

      const id = uuidv4();
      await knex('promoSubmissions').insert({
        id,
        userId: String(req.user?.id || ''),
        username: String(req.user?.username || ''),
        email: String(req.user?.email || ''),
        contactEmail,
        submissionType,
        mediaType,
        title,
        description,
        targetDropId,
        mediaUrl,
        ctaText,
        budgetUsd,
        assetPath,
        tags,
        status: 'pending',
      });

      return res.status(200).json({
        success: true,
        id,
        message: 'Promo submission received and queued for admin review',
      });
    } catch (err) {
      console.error('Promo submission error:', err);
      return res.status(500).json({ message: 'Failed to submit promo request' });
    }
  };

  busboy.on('field', (fieldname, value) => {
    fields[fieldname] = value;
  });

  busboy.on('file', (fieldname, file, info) => {
    if (fieldname !== 'asset') {
      file.resume();
      return;
    }

    pendingWrites++;
    const originalName = String(info?.filename || 'asset').trim() || 'asset';
    const ext = path.extname(originalName) || '.bin';
    const localFileName = `${Date.now()}_${uuidv4()}${ext}`;
    const localPath = path.join(uploadDir, localFileName);
    const writeStream = fs.createWriteStream(localPath);

    file.pipe(writeStream);

    writeStream.on('finish', () => {
      assetPath = '/' + path.relative(__dirname, localPath).replace(/\\/g, '/');
      pendingWrites--;
      void finalize();
    });

    writeStream.on('error', (err) => {
      console.error('Promo asset write error:', err);
      pendingWrites--;
      if (!responded) {
        responded = true;
        return res.status(500).json({ message: 'Failed to store uploaded asset' });
      }
    });
  });

  busboy.on('error', (err) => {
    console.error('Promo Busboy error:', err);
    if (!responded) {
      responded = true;
      return res.status(400).json({ message: 'Malformed upload' });
    }
  });

  busboy.on('finish', () => {
    uploadFinished = true;
    void finalize();
  });

  req.pipe(busboy);
});

server.get(PROXY + '/api/promo-submissions/me', authenticateToken, async (req, res) => {
  try {
    await ensurePromoSubmissionsTable();
    const userId = String(req.user?.id || '');

    const rows = await knex('promoSubmissions')
      .where('userId', userId)
      .orderBy('created_at', 'desc')
      .select('*');

    const toNum = (v) => Number(v || 0);
    const summary = rows.reduce((acc, r) => {
      const impressions = toNum(r.impressions);
      const clicks = toNum(r.clicks);
      const likes = toNum(r.likes);
      const neutrals = toNum(r.neutrals);
      const dislikes = toNum(r.dislikes);

      acc.total += 1;
      if (r.submissionType === 'ad') acc.ads += 1;
      if (r.submissionType === 'drop_sponsorship') acc.sponsorships += 1;
      acc.impressions += impressions;
      acc.clicks += clicks;
      acc.likes += likes;
      acc.neutrals += neutrals;
      acc.dislikes += dislikes;
      return acc;
    }, {
      total: 0,
      ads: 0,
      sponsorships: 0,
      impressions: 0,
      clicks: 0,
      likes: 0,
      neutrals: 0,
      dislikes: 0,
    });

    const ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;

    res.json({
      summary: {
        ...summary,
        ctrPct: Number(ctr.toFixed(2)),
      },
      items: rows.map((r) => {
        const impressions = toNum(r.impressions);
        const clicks = toNum(r.clicks);
        return {
          ...r,
          ctrPct: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/promo-submissions/me error:', err);
    res.status(500).json({ error: 'Failed to fetch promo performance' });
  }
});

server.delete(PROXY + '/api/promo-submissions/:id', authenticateToken, async (req, res) => {
  try {
    await ensurePromoSubmissionsTable();
    const id = String(req.params.id || '');
    const userId = String(req.user?.id || '');

    const row = await knex('promoSubmissions').where({ id, userId }).first();
    if (!row) return res.status(404).json({ error: 'Promo item not found' });

    await knex('promoSubmissions').where({ id, userId }).del();
    res.json({ success: true, id });
  } catch (err) {
    console.error('DELETE /api/promo-submissions/:id error:', err);
    res.status(500).json({ error: 'Failed to delete promo item' });
  }
});

server.get(PROXY + '/api/promo-submissions/me/export', authenticateToken, async (req, res) => {
  try {
    await ensurePromoSubmissionsTable();
    const userId = String(req.user?.id || '');
    const rows = await knex('promoSubmissions')
      .where('userId', userId)
      .orderBy('created_at', 'desc')
      .select('*');

    const headers = [
      'id', 'submissionType', 'status', 'title', 'targetDropId', 'budgetUsd',
      'impressions', 'clicks', 'likes', 'neutrals', 'dislikes', 'tags', 'created_at', 'updated_at',
    ];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.map(esc).join(','),
      ...rows.map((r) => headers.map((h) => esc(r[h])).join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="promo-performance.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('GET /api/promo-submissions/me/export error:', err);
    res.status(500).json({ error: 'Failed to export promo performance' });
  }
});


// Email verification (code + link)
const VERIFICATION_CODE_EXPIRY_MINUTES = parseInt(process.env.VERIFICATION_CODE_EXPIRY_MINUTES, 10) || 30;

const formatDateTimeForMySQLLocal = (dateTime) => {
  if (!dateTime) return null;
  return new Date(dateTime).toISOString().slice(0, 19).replace('T', ' ');
};

const buildVerificationLink = (email, code = '') => {
  const baseUrl = (process.env.FRONTEND_URL || FRONTEND_URL || "").replace(/\/$/, "");
  const params = new URLSearchParams({ email });
  if (code) params.set('code', code);
  return `${baseUrl}/verify?${params.toString()}`;
};

const generateVerificationCode = () => {
  const length = Math.floor(Math.random() * 3) + 6; // 6-8 digits
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
};

const ensureEmailVerificationTable = async () => {
  await knex.raw(
    `CREATE TABLE IF NOT EXISTS emailVerifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(100) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL,
      used TINYINT(1) DEFAULT 0,
      INDEX idx_email (email),
      INDEX idx_expires (expiresAt)
    )`
  );
};

const createEmailVerificationRecord = async (email, code) => {
  await ensureEmailVerificationTable();
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);
  const createdAt = new Date();

  await knex('emailVerifications').where('email', email).del();
  await knex('emailVerifications').insert({
    email,
    code,
    expiresAt: formatDateTimeForMySQLLocal(expiresAt),
    createdAt: formatDateTimeForMySQLLocal(createdAt),
    used: 0
  });

  return { expiresAt };
};

const ensurePasswordResetTable = async () => {
  await knex.raw(
    `CREATE TABLE IF NOT EXISTS passwordResets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(100) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL,
      used TINYINT(1) DEFAULT 0,
      INDEX idx_email (email),
      INDEX idx_expires (expiresAt)
    )`
  );
};

const ensurePromoSubmissionsTable = async () => {
  await knex.raw(
    `CREATE TABLE IF NOT EXISTS promoSubmissions (
      id VARCHAR(36) NOT NULL,
      userId VARCHAR(10) NOT NULL,
      username VARCHAR(50) DEFAULT NULL,
      email VARCHAR(100) DEFAULT NULL,
      contactEmail VARCHAR(100) DEFAULT NULL,
      submissionType VARCHAR(40) NOT NULL,
      mediaType VARCHAR(40) NOT NULL,
      title VARCHAR(150) NOT NULL,
      description TEXT,
      targetDropId VARCHAR(255) DEFAULT NULL,
      mediaUrl TEXT,
      ctaText VARCHAR(255) DEFAULT NULL,
      budgetUsd DECIMAL(10,2) DEFAULT 0,
      assetPath VARCHAR(255) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      adminNotes TEXT,
      clicks INT DEFAULT 0,
      dislikes INT DEFAULT 0,
      likes INT DEFAULT 0,
      neutrals INT DEFAULT 0,
      impressions INT DEFAULT 0,
      billedImpressions INT DEFAULT 0,
      billedClicks INT DEFAULT 0,
      tags TINYTEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_promo_status (status),
      KEY idx_promo_user (userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  const [cols] = await knex.raw(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'promoSubmissions'
       AND COLUMN_NAME IN ('clicks', 'dislikes', 'likes', 'neutrals', 'impressions', 'billedImpressions', 'billedClicks', 'tags')`
  );

  const existing = new Set((cols || []).map((col) => col.COLUMN_NAME));
  const alters = [];
  if (!existing.has('clicks')) alters.push('ADD COLUMN clicks INT DEFAULT 0');
  if (!existing.has('dislikes')) alters.push('ADD COLUMN dislikes INT DEFAULT 0');
  if (!existing.has('likes')) alters.push('ADD COLUMN likes INT DEFAULT 0');
  if (!existing.has('neutrals')) alters.push('ADD COLUMN neutrals INT DEFAULT 0');
  if (!existing.has('impressions')) alters.push('ADD COLUMN impressions INT DEFAULT 0');
  if (!existing.has('billedImpressions')) alters.push('ADD COLUMN billedImpressions INT DEFAULT 0');
  if (!existing.has('billedClicks')) alters.push('ADD COLUMN billedClicks INT DEFAULT 0');
  if (!existing.has('tags')) alters.push('ADD COLUMN tags TINYTEXT');

  if (alters.length > 0) {
    await knex.raw(`ALTER TABLE promoSubmissions ${alters.join(', ')}`);
  }
};

const PROMO_IMPRESSION_COST = parseInt(process.env.PROMO_IMPRESSION_COST || '1', 10);
const PROMO_CLICK_COST = parseInt(process.env.PROMO_CLICK_COST || '10', 10);

async function runPromoBillingCron() {
  try {
    await ensurePromoSubmissionsTable();

    const promos = await knex('promoSubmissions')
      .select('id', 'userId', 'title', 'targetDropId')
      .where('status', 'approved');

    let processed = 0;
    let charged = 0;

    for (const promo of promos) {
      await knex.transaction(async (trx) => {
        const livePromo = await trx('promoSubmissions')
          .where('id', promo.id)
          .first()
          .forUpdate();

        if (!livePromo || livePromo.status !== 'approved') return;

        const impressions = Math.max(0, Number(livePromo.impressions || 0));
        const clicks = Math.max(0, Number(livePromo.clicks || 0));
        const billedImpressions = Math.max(0, Number(livePromo.billedImpressions || 0));
        const billedClicks = Math.max(0, Number(livePromo.billedClicks || 0));

        const deltaImpressions = Math.max(0, impressions - billedImpressions);
        const deltaClicks = Math.max(0, clicks - billedClicks);
        const chargeAmount = (deltaImpressions * PROMO_IMPRESSION_COST) + (deltaClicks * PROMO_CLICK_COST);

        if (chargeAmount <= 0) return;

        const userRow = await trx('userData')
          .where('id', livePromo.userId)
          .select('credits')
          .first()
          .forUpdate();

        if (!userRow) return;

        const newBalance = Number(userRow.credits || 0) - chargeAmount;

        await trx('userData')
          .where('id', livePromo.userId)
          .update({ credits: newBalance });

        await safeInsertWalletTransaction({
          id: require('crypto').randomUUID(),
          userId: livePromo.userId,
          type: 'admin_adjustment',
          amount: -chargeAmount,
          balanceAfter: newBalance,
          relatedDropId: livePromo.targetDropId || null,
          description: `Promo charge: ${livePromo.title || 'Promotion'} | +${deltaImpressions} impressions, +${deltaClicks} clicks`,
          created_at: trx.fn.now(),
        });

        await trx('promoSubmissions')
          .where('id', livePromo.id)
          .update({
            billedImpressions: billedImpressions + deltaImpressions,
            billedClicks: billedClicks + deltaClicks,
          });

        processed += 1;
        charged += chargeAmount;
      });
    }

    if (processed > 0) {
      console.log(`📣 Promo billing cron: charged ${charged} credits across ${processed} promo items.`);
    }
  } catch (err) {
    console.error('Promo billing cron error:', err.message || err);
  }
}

const ensureVerificationReviewColumns = async () => {
  const [cols] = await knex.raw(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'userData'
       AND COLUMN_NAME IN (
         'verificationFacePath',
         'verificationIdPath',
         'verificationDocsStatus',
         'verificationDocsNotes',
         'verificationDocsReviewedAt',
         'verificationDocsReviewedBy'
       )`
  );

  const existing = new Set((cols || []).map((col) => col.COLUMN_NAME));
  const alters = [];

  if (!existing.has('verificationFacePath')) alters.push('ADD COLUMN verificationFacePath VARCHAR(255) DEFAULT NULL');
  if (!existing.has('verificationIdPath')) alters.push('ADD COLUMN verificationIdPath VARCHAR(255) DEFAULT NULL');
  if (!existing.has('verificationDocsStatus')) alters.push("ADD COLUMN verificationDocsStatus VARCHAR(32) DEFAULT NULL");
  if (!existing.has('verificationDocsNotes')) alters.push('ADD COLUMN verificationDocsNotes TEXT DEFAULT NULL');
  if (!existing.has('verificationDocsReviewedAt')) alters.push('ADD COLUMN verificationDocsReviewedAt DATETIME DEFAULT NULL');
  if (!existing.has('verificationDocsReviewedBy')) alters.push('ADD COLUMN verificationDocsReviewedBy VARCHAR(100) DEFAULT NULL');

  if (alters.length > 0) {
    await knex.raw(`ALTER TABLE userData ${alters.join(', ')}`);
  }
};

const createPasswordResetRecord = async (email, code) => {
  await ensurePasswordResetTable();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const createdAt = new Date();

  await knex('passwordResets').where('email', email).del();
  await knex('passwordResets').insert({
    email,
    code,
    expiresAt: formatDateTimeForMySQLLocal(expiresAt),
    createdAt: formatDateTimeForMySQLLocal(createdAt),
    used: 0
  });

  return { expiresAt };
};

async function sendAccountVerificationEmail(newUser) {
  const verificationCode = generateVerificationCode();
  const { expiresAt } = await createEmailVerificationRecord(newUser.email, verificationCode);
  const verificationLink = buildVerificationLink(newUser.email, verificationCode);

  try {
    await emailService.sendAccountVerificationEmail({
      to: newUser.email,
      username: newUser.firstName || newUser.username || "there",
      verificationLink,
      verificationCode,
      subject: 'Welcome to Drauwpr! 🎉'
    });

    console.log(`✅ Verification email sent to ${newUser.email} (expires ${expiresAt.toISOString()})`);
  } catch (emailError) {
    console.error('⚠️ Failed to send verification email:', emailError.message || emailError);
  }
}

const generateResetCode = () => {
  const length = Math.floor(Math.random() * 3) + 8; // 6-8 digits
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
};

async function sendPasswordResetEmail(newUser) {
  const resetCode = generateResetCode();
  const { expiresAt } = await createPasswordResetRecord(newUser.email, resetCode);

  try {
    await emailService.sendPasswordResetEmail({
      to: newUser.email,
      username: newUser.firstName || newUser.username || "there",
      resetCode,
      subject: 'Reset your Drauwpr password'
    });

    console.log(`✅ Password reset email sent to ${newUser.email} (expires ${expiresAt.toISOString()})`);
  } catch (emailError) {
    console.error('⚠️ Failed to send password reset email:', emailError.message || emailError);
  }
}

// Custom forgot password route
server.post(PROXY + '/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const users = await knex('userData')
      .where('email', email)
      .select('*');

    const user = users[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User with this email does not exist'
      });
    }

    await sendPasswordResetEmail(user);

    res.json({
      success: true,
      message: 'Password reset email sent if the account exists'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during password reset'
    });
  }
});

// const response = await api.post('/api/auth/reset-password', {
//   email,
//   resetCode,
//   newPassword
// });

// if (response.data.success) {
//   setSuccess(true);
//   // Redirect to login after 2 seconds
//   setTimeout(() => {
//     navigate('/login');
//   }, 2000);
// } else {
//   setError(response.data.message || 'Failed to reset password.');
// }

// reset password route submission
server.post(PROXY + '/api/auth/reset-password', async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;
    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, reset code, and new password are required'
      });
    }

    const usersReset = await knex('userData')
      .where('email', email)
      .select('*');

    const userReset = usersReset[0];

    if (!userReset) {
      return res.status(404).json({
        success: false,
        message: 'User with this email does not exist'
      });
    }

    await ensurePasswordResetTable();

    const rows = await knex('passwordResets')
      .where({ email, code: resetCode })
      .select('id', 'expiresAt', 'used')
      .orderBy('createdAt', 'desc')
      .limit(1);

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset code'
      });
    }

    const record = rows[0];
    if (record.used) {
      return res.status(400).json({
        success: false,
        message: 'This reset code has already been used'
      });
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired'
      });
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await knex('userData')
      .where('email', email)
      .update({ passwordHash });

    await knex('passwordResets').where('id', record.id).update({ used: 1 });

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during password reset'
    });
  }
});


server.post(PROXY + '/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const users = await knex('userData')
      .where('email', email)
      .select('*');

    const user = users[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User with this email does not exist'
      });
    }

    await sendAccountVerificationEmail(user);

    return res.json({
      success: true,
      message: 'A new verification code has been sent'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error occurred while resending the verification code'
    });
  }
});

// Custom email verification route
server.post(PROXY + '/api/auth/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    await ensureEmailVerificationTable();

    const rows = await knex('emailVerifications')
      .where({ email, code })
      .select('id', 'expiresAt', 'used')
      .orderBy('createdAt', 'desc')
      .limit(1);

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    const record = rows[0];
    if (record.used) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has already been used'
      });
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired'
      });
    }

    await knex('emailVerifications').where('id', record.id).update({ used: 1 });
    await knex('userData').where('email', email).update({ verification: 'true' });

    return res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error occurred during email verification'
    });
  }
});

// Custom logout route
server.post(PROXY + '/api/auth/logout', async (req, res) => {
  try {
    const { username } = req.body;

    if (username) {
      // Update login status in database
      await knex('userData')
        .where('username', username)
        .update({ loginStatus: false });
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

    const users = await knex('userData')
      .where({ username, email })
      .select('credits');

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

    const users = await knex('userData')
      .where('username', username)
      .select('*');

    const user = users[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`User ${username} is attempting to spend ${cost} credits.`);

    if (user.credits < cost) {
      return res.status(400).json({ success: false, message: 'Insufficient credits' });
    }

    // Deduct buyer credits
    await knex('userData')
      .where('email', user.email)
      .decrement('credits', cost);

    // set the value of the day pass expiry for the buyer to now + 24 hours
    await knex('userData')
      .where('email', user.email)
      .update({ dayPassExpiry: knex.raw('DATE_ADD(NOW(), INTERVAL 1 DAY)') });

    // set the value of the day pass expiry for the buyer to now + 24 hours
    await knex('userData')
      .where('email', user.email)
      .update({ dayPassMode: mode });

    // Get updated credits
    const updatedRows = await knex('userData')
      .where('email', user.email)
      .select('credits');

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

    await knex('dayPasses').insert({
      user_id: user.id,
      pass_id: passId,
      pass_type: mode,
      status: 'active',
      begins_at: beginsAt.toISOString().slice(0, 19).replace('T', ' '),
      expires_at: expiresAt.toISOString().slice(0, 19).replace('T', ' '),
      email: user.email,
      username: user.username
    });


    const updatedCredits = updatedRows[0] ? updatedRows[0].credits : (user.credits - cost);

    // Create credit spend record
    const transactionId = uuidv4();

    await knex('actions').insert({
      id: uuidv4(),
      transactionId,
      username: user.username,
      email: user.email,
      date: Date.now(),
      time: new Date().toLocaleTimeString(),
      credits: updatedCredits,
      action_type: 'purchase_mode_pass',
      action_cost: cost,
      action_description: 'Purchased ' + mode + ' mode pass'
    });

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

    const users = await knex('userData')
      .where('username', username)
      .select('*');

    const user = users[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`User ${username} is attempting to spend ${cost} credits.`);

    if (user.credits < cost) {
      return res.status(400).json({ success: false, message: 'Insufficient credits' });
    }

    // Deduct buyer credits
    await knex('userData')
      .where('email', user.email)
      .decrement('credits', cost);

    // Get updated credits
    const updatedRows = await knex('userData')
      .where('email', user.email)
      .select('credits');
    const updatedCredits = updatedRows[0] ? updatedRows[0].credits : (user.credits - cost);

    // Create credit spend record
    const transactionId = uuidv4();

    await knex('actions').insert({
      id: uuidv4(),
      transactionId,
      username: user.username,
      email: user.email,
      date: Date.now(),
      time: new Date().toLocaleTimeString(),
      credits: updatedCredits,
      action_type: action.type || null,
      action_cost: cost,
      action_description: action.description || '',
      action_details: action.details || ''
    });

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


// CREATE TABLE
//   `feedback` (
//     `id` int unsigned NOT NULL AUTO_INCREMENT,
//     `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     `title` varchar(255) DEFAULT NULL,
//     `message` text,
//     `contactInfo` varchar(255) DEFAULT NULL,
//     `username` varchar(255) DEFAULT NULL,
//     `feedbackType` varchar(255) DEFAULT NULL,
//     PRIMARY KEY (`id`)
//   ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci

// Custom logout route
server.post(PROXY + '/api/site-dev-feedback', async (req, res) => {
  try {
    const {
      supportProblemType,
      supportTitle,
      supportMessage,
      supportContactInfo,
      supportUsername,
      supportUserId,
      supportTargetType,
      supportTargetId,
      supportTargetUsername,
    } = req.body;



    // console.log("Received feedback:", { supportUsername, supportMessage, supportTitle, supportContactInfo, supportProblemType });

    if (supportUsername) {
      // Update login status in database
      await knex('feedback').insert({
        username: supportUsername,
        message: supportMessage,
        title: supportTitle,
        contactInfo: supportContactInfo,
        feedbackType: supportProblemType
      });

      if (
        String(supportProblemType || '').trim() === 'report-scammer' &&
        String(supportUserId || '').trim() &&
        String(supportTargetType || '').trim() === 'user' &&
        String(supportTargetId || '').trim()
      ) {
        await knex.raw(`
          CREATE TABLE IF NOT EXISTS reports (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            reporterId VARCHAR(10) NOT NULL,
            targetType ENUM('user','drop','review','comment') NOT NULL,
            targetId VARCHAR(36) NOT NULL,
            type ENUM('spam','abuse','copyright','fraud','inappropriate','other') NOT NULL,
            description TEXT,
            status ENUM('pending','reviewed','resolved','dismissed') DEFAULT 'pending',
            moderatorNote TEXT,
            resolvedAt DATETIME DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_reporterId (reporterId),
            KEY idx_targetType_targetId (targetType, targetId),
            KEY idx_status (status)
          ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
        `);

        const reportDescription = [
          supportTitle ? `Title: ${supportTitle}` : '',
          supportTargetUsername ? `Target Username: ${supportTargetUsername}` : '',
          supportMessage ? `Report Details:\n${supportMessage}` : '',
          supportContactInfo ? `Contact: ${supportContactInfo}` : '',
        ].filter(Boolean).join('\n\n');

        const existingReport = await knex('reports')
          .where({
            reporterId: String(supportUserId).trim(),
            targetType: 'user',
            targetId: String(supportTargetId).trim(),
            status: 'pending',
          })
          .first();

        if (!existingReport) {
          await knex('reports').insert({
            reporterId: String(supportUserId).trim(),
            targetType: 'user',
            targetId: String(supportTargetId).trim(),
            type: 'fraud',
            description: reportDescription,
            status: 'pending',
          });

          await knex('userData')
            .where('id', String(supportTargetId).trim())
            .increment('reportCount', 1)
            .catch(() => {});
        }
      }
    }

    res.json({
      success: true,
      message: 'Feedback submitted successfully'
    });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred during feedback submission'
    });
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
  const id = Math.random().toString(36).substring(2, 12).toUpperCase();
  const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const rawCategory = String(category || '').toLowerCase().trim();
  const sellerCategoryHints = new Set(['seller', 'creator', 'payout', 'earnings']);
  const safeCategory = sellerCategoryHints.has(rawCategory) ? 'seller' : 'buyer';

  const rawPriority = String(priority || '').toLowerCase().trim();
  const allowedPriorities = new Set(['success', 'info', 'warning', 'error']);
  const safePriority = allowedPriorities.has(rawPriority) ? rawPriority : 'info';

  await knex('notifications').insert({
    userId,
    type,
    title,
    message,
    createdAt,
    priority: safePriority,
    category: safeCategory,
    username,
    isRead: 0
  });

  return { id, type, title, message, createdAt, priority: safePriority, category: safeCategory, username, isRead: 0 };
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

    const result = await knex('userData').insert({
      id: userId,
      loginStatus: newUser.loginStatus,
      lastLogin: formatDateTimeForMySQL(newUser.lastLogin),
      accountType: newUser.accountType,
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      phoneNumber: newUser.phoneNumber,
      birthDate: newUser.birthDate,
      encryptionKey: newUser.encryptionKey,
      credits: newUser.credits,
      reportCount: newUser.reportCount,
      isBanned: newUser.isBanned,
      banReason: newUser.banReason,
      banDate: formatDateTimeForMySQL(newUser.banDate),
      banDuration: newUser.banDuration,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
      passwordHash: newUser.passwordHash,
      twoFactorEnabled: newUser.twoFactorEnabled,
      twoFactorSecret: newUser.twoFactorSecret,
      recoveryCodes: JSON.stringify(newUser.recoveryCodes || []),
      profilePicture: newUser.profilePicture,
      bio: newUser.bio,
      socialLinks: JSON.stringify(newUser.socialLinks || {})
    });
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

    const purchases = await knex('CreditPurchases')
      .where('username', username)
      .orderBy('date', 'desc');

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

    const redemptions = await knex('redeemCredits')
      .where('username', username)
      .orderBy('date', 'desc');

    res.json(redemptions);
  } catch (error) {
    console.error('Redemptions error:', error);
    res.status(500).json({ error: 'Database error - redemption logging failed' });
  }
});

// Submit a credit redemption (cash-out to crypto)
server.post(PROXY + '/api/redeem', authenticateToken, async (req, res) => {
  try {
    const { username, userId, credits, chain, walletAddress } = req.body;

    if (!username || !userId || !credits || !chain || !walletAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const creditsNum = parseInt(credits, 10);
    if (isNaN(creditsNum) || creditsNum < 5000) {
      return res.status(400).json({ error: 'Minimum redemption is 5,000 credits' });
    }

    // Fetch user and check balance + verification
    const user = await knex('userData').where('username', username).first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.verification !== 'true' && user.verification !== true && user.verification !== 1) {
      return res.status(403).json({ error: 'Account verification required before redeeming' });
    }
    if ((user.credits ?? 0) < creditsNum) {
      return res.status(400).json({ error: 'Insufficient credits' });
    }

    const usdAmount = creditsNum / 1000;

    // Deduct credits
    await knex('userData').where('username', username).update({
      credits: knex.raw('credits - ?', [creditsNum]),
    });

    // Log the redemption
    await knex('redeemCredits').insert({
      id: Math.random().toString(36).substring(2, 12),
      username,
      userId,
      credits: creditsNum,
      amountUSD: usdAmount,
      chain,
      walletAddress,
      status: 'pending',
      date: Date.now(),
      time: new Date().toISOString(),
    });

    await CreateNotification(
      'credits_redeemed',
      'Redemption Submitted',
      `Your redemption of ${creditsNum.toLocaleString()} credits ($${usdAmount.toFixed(2)}) to ${chain} has been submitted.`,
      'redeem',
      username
    );

    res.json({ success: true, credits: creditsNum, amountUSD: usdAmount });
  } catch (error) {
    console.error('Redeem error:', error);
    res.status(500).json({ error: 'Failed to process redemption' });
  }
});


async function checkTransaction(crypto, txHash, walletAddress, amount) {
  // const receiverAddress = wallets[crypto];

  try {
    if (crypto === 'BTC') {

      const transactions = await mysqlConnection.query(`SELECT * FROM BTC_TX WHERE hash = ?`, [txHash]);
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
      const existingTx = await mysqlConnection.query(`SELECT * FROM BTC_TX WHERE hash = ?`, [txHash]);
      if (existingTx.length > 0) {
        console.log('Transaction already exists in database');
        return { success: false, error: 'Transaction already exists' };
      }

      // const txamount = await checkBitcoinTransaction(txHash, walletAddress);
      console.log("amount in checkTransaction:", amount, "vs. txamount:", transactions.amount);
      return transactions.amount;

    } else if (crypto === 'ETH') {

      const transactions = await knex('ETH_TX')
        .where('hash', txHash)
        .select('*');

      // const txamount = await checkEthereumTransaction(txHash, walletAddress);
      console.log("amount in checkTransaction:", amount, "vs. txamount:", transactions.amount);
      return transactions.amount;

    } else if (crypto === 'LTC') {

      const transactions = await mysqlConnection.query(`SELECT * FROM LTC_TX WHERE hash = ?`, [txHash]);
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
      const existingTx = await mysqlConnection.query(`SELECT * FROM LTC_TX WHERE hash = ?`, [txHash]);
      if (existingTx.length > 0) {
        console.log('Transaction already exists in database');
        return { success: false, error: 'Transaction already exists' };
      }

      // const txamount = await checkBitcoinTransaction(txHash, walletAddress);
      console.log("amount in checkTransaction:", amount, "vs. txamount:", transactions.amount);
      return transactions.amount;

    } else if (crypto === 'SOL') {

      const transactions = await mysqlConnection.query(`SELECT * FROM SOL_TX WHERE hash = ?`, [txHash]);
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
      const existingTx = await mysqlConnection.query(`SELECT * FROM SOL_TX WHERE hash = ?`, [txHash]);
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

    const { since } = req.query; // Extract the 'since' parameter

    // let query = 'SELECT * FROM actions WHERE username = ?';
    // const params = [username];

    // if (since) {
    //   query += ' AND created_at > ?';
    //   params.push(since);
    // }

    const actions = await knex('actions')
      .where('username', username)
      .andWhere('created_at', '>', since || 0)
      .orderBy('date', 'desc');

    res.json(actions);
  } catch (error) {
    console.error('Get actions error:', error);
    res.status(500).json({ error: 'Database error - actions retrieval failed' });
  }
});

// Get all actions (admin/debug use)
server.get(PROXY + '/api/actions', authenticateToken, async (req, res) => {
  try {
    const actions = await knex('actions')
      .orderBy('date', 'desc');

    res.json(actions);
  } catch (error) {
    console.error('Get all actions error:', error);
    res.status(500).json({ error: 'Database error - actions retrieval failed' });
  }
});


// Get credit purchases for a specific user
server.get(PROXY + '/api/CreditPurchases/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const { since } = req.query;

    const purchases = await knex('CreditPurchases')
      .where('username', username)
      .andWhere('time', '>', since || 0)
      .orderBy('date', 'desc');

    console.log(`Retrieved ${purchases.length} purchases for user ${username} since ${since || 'the beginning'}.`);

    res.json(purchases);
  } catch (error) {
    console.error('Get CreditPurchases error:', error);
    res.status(500).json({ error: 'Database error - credit purchases retrieval failed' });
  }
});

// Get all credit purchases (admin/debug use)
server.get(PROXY + '/api/CreditPurchases', authenticateToken, async (req, res) => {
  try {
    const purchases = await knex('CreditPurchases')
      .orderBy('date', 'desc');

    res.json(purchases);
  } catch (error) {
    console.error('Get all CreditPurchases error:', error);
    res.status(500).json({ error: 'Database error - credit purchases retrieval failed' });
  }
});



// ── Receiving wallet addresses (one per supported chain) ─────────────────────
const RECEIVING_WALLETS = {
  BTC: process.env.WALLET_BTC || 'bc1q4j9e7equq4xvlyu7tan4gdmkvze7wc0egvykr6',
  ETH: process.env.WALLET_ETH || '0x9a61f30347258A3D03228F363b07692F3CBb7f27',
  LTC: process.env.WALLET_LTC || 'ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh',
  SOL: process.env.WALLET_SOL || 'qaSpvAumg2L3LLZA8qznFtbrRKYMP1neTGqpNgtCPaU',
};

/**
 * verifyTxOnChain(currency, txHash)
 *
 * Attempts to find `txHash` as an inbound transaction to the platform wallet.
 * Strategy:
 *   1. Check local TX cache table (fast).
 *   2. Refresh from chain via live API, then re-check.
 *   Returns { found: bool, tx: row|null, error: string|null }
 */
// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFY TRANSACTION ON BLOCKCHAIN
// ═══════════════════════════════════════════════════════════════════════════════
//  Architecture:
//  - Primary: TATUM API (fast, reliable, multi-chain)
//  - Fallback: Legacy APIs (Esplora, Etherscan, Solana RPC)
//  Steps:
//  1. Check database cache first (fast path)
//  2. If not found, fetch from TATUM API
//  3. If TATUM fails, fall back to legacy chain-specific APIs
//  4. Store results in cache and verify presence
// ═══════════════════════════════════════════════════════════════════════════════
async function verifyTxOnChain(currency, txHash) {
  const sym      = currency.toUpperCase();
  const receiver = RECEIVING_WALLETS[sym];
  if (!receiver) return { found: false, tx: null, error: `Unsupported currency: ${sym}` };

  const TABLE_MAP = { BTC: 'BTC_TX', ETH: 'ETH_TX', LTC: 'LTC_TX', SOL: 'SOL_TX' };
  const table = TABLE_MAP[sym];
  if (!table) return { found: false, tx: null, error: `No TX table for ${sym}` };

  // ═══════════════════════════════════════════════════════════════
  //  STEP 1: Check database cache (fast path)
  // ═══════════════════════════════════════════════════════════════
  try {
    const [cached] = await knex(table).where('txHash', txHash).select('*').limit(1);
    if (cached && cached.direction === 'inbound') {
      console.log(`✅ Transaction found in cache: ${txHash.slice(0, 10)}... (${sym})`);
      return { found: true, tx: cached, error: null };
    }
  } catch (e) {
    console.error(`verifyTxOnChain: DB check error (${sym}):`, e.message);
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 2: Fetch fresh transactions from blockchain
  // ═══════════════════════════════════════════════════════════════
  let liveTxs = [];
  let source = 'unknown';

  // ─────────────────────────────────────────────────────────────
  //  PRIMARY: Try TATUM API first
  // ─────────────────────────────────────────────────────────────
  if (TATUM_API_KEY) {
    try {
      liveTxs = await fetchTatumTransactions(sym, receiver, 50);
      source = 'TATUM';
      console.log(`✅ TATUM: Fetched ${liveTxs.length} ${sym} transactions for verification`);
    } catch (tatumError) {
      console.warn(`⚠️ TATUM failed for ${sym} verification, using fallback:`, tatumError.message);
      liveTxs = []; // Reset for fallback
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  FALLBACK: Use legacy APIs if TATUM fails or not configured
  // ─────────────────────────────────────────────────────────────
  if (liveTxs.length === 0) {
    try {
      if (sym === 'BTC') {
        liveTxs = await fetchEsploraAddressTxs(BTC_ESPLORA, receiver, 50);
        source = 'Blockstream Esplora';
      } else if (sym === 'LTC') {
        liveTxs = await fetchEsploraAddressTxs(LTC_ESPLORA, receiver, 50);
        source = 'Litecoin Esplora';
      } else if (sym === 'ETH') {
        liveTxs = await fetchEth({ address: receiver, limit: 50 });
        source = 'Etherscan';
      } else if (sym === 'SOL') {
        liveTxs = await fetchSol(receiver, 50);
        source = 'Solana RPC';
      }
      console.log(`✅ ${source}: Fetched ${liveTxs.length} ${sym} transactions (fallback)`);
    } catch (fallbackErr) {
      console.error(`❌ Both TATUM and ${source} failed for ${sym}:`, fallbackErr.message);
      return { found: false, tx: null, error: `Failed to fetch ${sym} transactions from blockchain` };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 3: Store fresh transactions in cache
  // ═══════════════════════════════════════════════════════════════
  try {
    for (const row of liveTxs) {
      const hash = row.hash || row.signature;
      if (!hash) continue;
      
      try {
        // Check if exists first
        const [existing] = await knex(table).where('txHash', hash).select('txHash').limit(1);
        if (existing) continue; // Skip if already in DB
        
        // Insert new transaction
        await knex(table).insert({
          created_at: row.time,
          direction: row.direction,
          amount: row.amount,
          fromAddress: row.from,
          toAddress: row.to,
          txHash: hash
        });
      } catch (insertErr) {
        // Ignore duplicate errors, log others
        if (!insertErr.message.includes('Duplicate')) {
          console.warn(`⚠️ Failed to cache ${sym} transaction:`, insertErr.message);
        }
      }
    }
  } catch (cacheErr) {
    console.error(`verifyTxOnChain: cache storage error (${sym}):`, cacheErr.message);
    // Continue anyway - we have the data in memory
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 4: Verify transaction from fresh data or re-check cache
  // ═══════════════════════════════════════════════════════════════
  try {
    // First check in-memory results
    const matchedTx = liveTxs.find(tx => 
      (tx.hash === txHash || tx.signature === txHash) && 
      tx.direction === 'inbound'
    );
    
    if (matchedTx) {
      console.log(`✅ Transaction verified on-chain: ${txHash.slice(0, 10)}... (${sym}, source: ${source})`);
      return { found: true, tx: matchedTx, error: null };
    }

    // Double-check cache in case insert was delayed
    const [fresh] = await knex(table).where('txHash', txHash).select('*').limit(1);
    if (fresh && fresh.direction === 'inbound') {
      console.log(`✅ Transaction verified in cache: ${txHash.slice(0, 10)}... (${sym})`);
      return { found: true, tx: fresh, error: null };
    }
  } catch (verifyErr) {
    console.error(`verifyTxOnChain: verification error (${sym}):`, verifyErr.message);
  }

  console.log(`⚠️ Transaction not found or not inbound: ${txHash.slice(0, 10)}... (${sym})`);
  return { found: false, tx: null, error: null };
}

server.post(PROXY + '/api/purchases/:username', authenticateToken, async (req, res) => {
  try {
    const {
      username,
      currency,       // crypto symbol: 'BTC', 'ETH', 'LTC', 'SOL'
      amount,         // cents (Math.round(dollars * 100) from frontend)
      credits,        // credits to award, computed by creditsForDollars() on frontend
      transactionId,  // tx hash submitted by user
      walletAddress,
      ip,
      userAgent,
      session_id,
    } = req.body;

    const dollars        = amount  != null ? amount / 100  : 0;
    const creditsToAward = credits != null ? Math.floor(credits) : 0;
    const sym            = (currency || '').toUpperCase();

    if (!username || !transactionId || !sym || creditsToAward < 1) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ── Look up userId ──────────────────────────────────────────────────────
    const [userRow] = await knex('userData').where('username', username).select('id').limit(1);
    if (!userRow) return res.status(404).json({ error: 'User not found' });
    const userId = userRow.id;

    // ── Duplicate guard ─────────────────────────────────────────────────────
    const [existingTx] = await knex('CreditPurchases').where('txHash', transactionId).select('id', 'status').limit(1);
    if (existingTx) {
      const msg = existingTx.status === 'processing'
        ? 'This transaction is already pending manual review.'
        : 'This transaction has already been processed.';
      return res.status(400).json({ error: msg });
    }

    // ── On-chain verification ───────────────────────────────────────────────
    const verification = await verifyTxOnChain(sym, transactionId);
    const verified     = verification.found;
    const status       = verified ? 'completed' : 'processing';
    const paymentMethod = sym.toLowerCase();
    const purchaseId    = Math.random().toString(36).substring(2, 12);

    // ── Record purchase (always, regardless of verification result) ──────────
    await knex('CreditPurchases').insert({
      id:            purchaseId,
      userId,
      username,
      amount:         amount, // in cents
      credits:       creditsToAward,
      amountPaid:    Math.floor(amount/100) > dollars ? Math.ceil(amount/100) : dollars, // Handle potential rounding issues (in dollars)
      currency:      'USD',
      paymentMethod,
      status,
      walletAddress: walletAddress || null,
      txHash:        transactionId,
      ip:            ip            || null,
      userAgent:     userAgent     || null,
      session_id:    session_id    || null,
    });

    // ── If verified: award credits immediately ───────────────────────────────
    if (verified) {
      await knex('userData').where('id', userId).increment('credits', creditsToAward);

      // Wallet ledger
      try {
        const [updated] = await knex('userData').where('id', userId).select('credits').limit(1);
        await safeInsertWalletTransaction({
          id: require('crypto').randomUUID(),
          userId,
          type: 'credit_purchase',
          amount: creditsToAward,
          balanceAfter: updated.credits,
          description: `Crypto purchase (${sym}) — ${creditsToAward.toLocaleString()} credits`,
        });
      } catch (ledgerErr) {
        console.error('Wallet ledger error (non-fatal):', ledgerErr.message);
      }

      // Success notification
      try {
        await knex('notifications').insert({
          id:       Math.random().toString(36).substring(2, 12).toUpperCase(),
          userId,
          type:     'credit_purchase',
          title:    '🪙 Credits added!',
          message:  `${creditsToAward.toLocaleString()} credits were added to your account (${sym} purchase — $${dollars.toFixed(2)}).`,
          priority: 'success',
          category: 'credit_purchase',
          isRead:   0,
        });
      } catch (notifErr) {
        console.error('Purchase notif error (non-fatal):', notifErr.message);
      }

      console.log(`✅ Purchase verified: ${username} → ${creditsToAward} credits via ${sym} (${transactionId})`);
      return res.json({ success: true, verified: true, credits: creditsToAward, purchaseId });
    }

    // ── If NOT verified: queue for manual review ─────────────────────────────
    try {
      await knex('notifications').insert({
        id:       Math.random().toString(36).substring(2, 12).toUpperCase(),
        userId,
        type:     'credit_purchase_pending',
        title:    '⏳ Transaction pending review',
        message:  `Your ${sym} transaction (${transactionId.slice(0, 16)}…) could not be automatically verified. `
                + `Your purchase of ${creditsToAward.toLocaleString()} credits ($${dollars.toFixed(2)}) has been submitted for manual review. `
                + `Credits will be applied within 24 hours once confirmed.`,
        priority: 'warning',
        category: 'credit_purchase',
        isRead:   0,
      });
    } catch (notifErr) {
      console.error('Pending notif error (non-fatal):', notifErr.message);
    }

    console.log(`⏳ Purchase queued for review: ${username} → ${creditsToAward} credits via ${sym} (${transactionId})`);
    return res.status(202).json({
      success:  true,
      verified: false,
      pending:  true,
      purchaseId,
      message:  'Your transaction could not be automatically verified on-chain. It has been submitted for manual review and your credits will be applied within 24 hours once confirmed.',
    });

  } catch (error) {
    console.error('Purchases error:', error);
    res.status(500).json({ error: 'Database error - purchase logging failed' });
  }
});

const CURRENCIES = [
  { symbol: 'BTC', name: 'Bitcoin',   coinId: 'bitcoin',  address: 'bc1q4j9e7equq4xvlyu7tan4gdmkvze7wc0egvykr6' },
  { symbol: 'ETH', name: 'Ethereum',  coinId: 'ethereum', address: '0x9a61f30347258A3D03228F363b07692F3CBb7f27' },
  { symbol: 'LTC', name: 'Litecoin',  coinId: 'litecoin', address: 'ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh' },
  { symbol: 'SOL', name: 'Solana',    coinId: 'solana',   address: 'qaSpvAumg2L3LLZA8qznFtbrRKYMP1neTGqpNgtCPaU' },
];

// ═══════════════════════════════════════════════════════════════
//  TATUM API INTEGRATION (Primary method for crypto transactions)
// ═══════════════════════════════════════════════════════════════

const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
if (!TATUM_API_KEY) {
  console.warn('⚠️ Warning: TATUM_API_KEY not set. Falling back to legacy APIs only.');
}

// Tatum API base URL
const TATUM_BASE_URL = 'https://api.tatum.io/v3';

/**
 * Fetch transaction history for an address using TATUM API (Primary Method)
 * @param {string} chain - Chain symbol: BTC, LTC, ETH, SOL
 * @param {string} address - Wallet address
 * @param {number} limit - Max transactions to fetch
 * @returns {Promise<Array>} Normalized transaction array
 */
async function fetchTatumTransactions(chain, address, limit = 100) {
  if (!TATUM_API_KEY) {
    throw new Error('TATUM_API_KEY not configured');
  }

  const chainMap = {
    BTC: 'bitcoin',
    LTC: 'litecoin',
    ETH: 'ethereum',
    SOL: 'solana'
  };

  const tatumChain = chainMap[chain];
  if (!tatumChain) {
    throw new Error(`Unsupported chain for TATUM: ${chain}`);
  }

  try {
    // Tatum API endpoints vary by chain
    let url;
    let params = { pageSize: Math.min(50, limit) };

    switch (chain) {
      case 'BTC':
      case 'LTC':
        url = `${TATUM_BASE_URL}/${tatumChain}/transaction/address/${address}`;
        params.pageSize = Math.min(50, limit);
        break;
      case 'ETH':
        url = `${TATUM_BASE_URL}/ethereum/account/transaction/${address}`;
        params.pageSize = Math.min(50, limit);
        break;
      case 'SOL':
        url = `${TATUM_BASE_URL}/solana/account/transaction/${address}`;
        params.limit = Math.min(50, limit);
        break;
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    console.log(`🔄 TATUM: Fetching ${chain} transactions for ${address.slice(0, 10)}...`);

    const { data } = await axios.get(url, {
      headers: { 'x-api-key': TATUM_API_KEY },
      params,
      timeout: 15000
    });

    // Normalize Tatum response to our standard format
    return normalizeTatumResponse(chain, address, data);

  } catch (error) {
    if (error.response?.status === 429) {
      console.warn(`⚠️ TATUM rate limit exceeded for ${chain}`);
    } else if (error.response?.status === 403) {
      console.warn(`⚠️ TATUM API key invalid or expired for ${chain}`);
    } else {
      console.warn(`⚠️ TATUM API error for ${chain}:`, error.message);
    }
    throw error;
  }
}

/**
 * Safely convert various timestamp formats to MySQL datetime string
 * Handles: Unix seconds, Unix milliseconds, ISO strings, Date objects
 */
function safeTimestampToDateTime(timestamp) {
  if (!timestamp) return null;
  
  try {
    let date;
    
    // If it's already a Date object
    if (timestamp instanceof Date) {
      date = timestamp;
    }
    // If it's an ISO string
    else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    }
    // If it's a number, check if it's seconds or milliseconds
    else if (typeof timestamp === 'number') {
      // Timestamps before year 2000 (946684800) or after year 2100 (4102444800) are likely wrong
      // If timestamp is > 10 billion, it's likely milliseconds
      if (timestamp > 10000000000) {
        date = new Date(timestamp); // Already in milliseconds
      } else {
        date = new Date(timestamp * 1000); // Convert seconds to milliseconds
      }
    }
    else {
      return null;
    }
    
    // Validate the date is reasonable (between 2009-01-01 and 2050-01-01)
    const year = date.getFullYear();
    if (year < 2009 || year > 2050 || isNaN(year)) {
      console.warn(`⚠️ Invalid timestamp year: ${year} from value: ${timestamp}`);
      return null;
    }
    
    // Convert to MySQL datetime format: YYYY-MM-DD HH:MM:SS
    return date.toISOString().replace('T', ' ').slice(0, 19);
    
  } catch (error) {
    console.warn(`⚠️ Failed to convert timestamp ${timestamp}:`, error.message);
    return null;
  }
}

/**
 * Normalize TATUM API responses to our standard format
 */
function normalizeTatumResponse(chain, myAddress, data) {
  const results = [];
  const txList = Array.isArray(data) ? data : (data?.data || data?.result || []);

  for (const tx of txList) {
    try {
      let normalized;

      switch (chain) {
        case 'BTC':
        case 'LTC':
          normalized = normalizeTatumBtcLtc(tx, myAddress);
          break;
        case 'ETH':
          normalized = normalizeTatumEth(tx, myAddress);
          break;
        case 'SOL':
          normalized = normalizeTatumSol(tx, myAddress);
          break;
        default:
          continue;
      }

      // ⚠️ CRITICAL: Only include transactions that involve our wallet
      // (direction must be 'inbound' or 'outbound', not null)
      if (normalized && normalized.direction) {
        results.push(normalized);
      } else if (normalized && !normalized.direction) {
        console.log(`⚠️ Skipping ${chain} tx ${(normalized.hash || '??').slice(0, 10)}... - doesn't involve our wallet`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to normalize ${chain} tx:`, err.message);
    }
  }

  return results;
}

function normalizeTatumBtcLtc(tx, myAddress) {
  const inputs = tx.inputs || [];
  const outputs = tx.outputs || [];
  
  let spent = 0n, received = 0n;
  
  for (const input of inputs) {
    if (input.coin?.address === myAddress) {
      spent += BigInt(Math.floor((input.coin?.value || 0) * 1e8));
    }
  }
  
  for (const output of outputs) {
    if (output.address === myAddress) {
      received += BigInt(Math.floor((output.value || 0) * 1e8));
    }
  }
  
  const net = received - spent;
  const direction = net > 0n ? 'inbound' : net < 0n ? 'outbound' : null;
  
  return {
    time: safeTimestampToDateTime(tx.time),
    direction,
    amount: fmt((net < 0n ? -net : net).toString(), 8),
    from: direction === 'inbound' ? (inputs[0]?.coin?.address || null) : myAddress,
    to: direction === 'inbound' ? myAddress : (outputs[0]?.address || null),
    hash: tx.hash
  };
}

function normalizeTatumEth(tx, myAddress) {
  const from = (tx.from || '').toLowerCase();
  const to = (tx.to || '').toLowerCase();
  const me = myAddress.toLowerCase();
  
  const direction = (to === me && from !== me) ? 'inbound'
    : (from === me && to !== me) ? 'outbound'
    : null;
  
  return {
    time: safeTimestampToDateTime(tx.timestamp),
    direction,
    amount: fmt(tx.value || '0', 18),
    from: tx.from || null,
    to: tx.to || null,
    hash: tx.hash
  };
}

function normalizeTatumSol(tx, myAddress) {
  const meta = tx.meta || {};
  const message = tx.transaction?.message || {};
  const accounts = message.accountKeys || [];
  
  const idx = accounts.findIndex(a => a === myAddress);
  let net = 0n;
  
  if (idx >= 0) {
    const pre = BigInt(meta.preBalances?.[idx] || 0);
    const post = BigInt(meta.postBalances?.[idx] || 0);
    net = post - pre;
  }
  
  const direction = net > 0n ? 'inbound' : net < 0n ? 'outbound' : null;
  const counterparty = accounts.find(a => a !== myAddress) || null;
  
  return {
    time: safeTimestampToDateTime(tx.blockTime),
    direction,
    amount: fmt((net < 0n ? -net : net).toString(), 9),
    from: direction === 'inbound' ? counterparty : myAddress,
    to: direction === 'inbound' ? myAddress : counterparty,
    signature: tx.signature || tx.hash
  };
}

// ────────────────────────────────────────────────────────────────
//  TATUM WEBHOOK HANDLER (Real-time transaction notifications)
// ────────────────────────────────────────────────────────────────

server.post('/webhooks/crypto-payments', async (req, res) => {
  try {
    const data = req.body;

    console.log('🔔 TATUM Webhook received:', JSON.stringify(data, null, 2));

    const { address, amount, asset, txId, type, currency } = data;

    // Validate it's an incoming transaction
    if (type !== 'incoming-tx' && type !== 'native_transfer' && type !== 'NATIVE') {
      console.log(`⚠️ Ignoring non-incoming transaction type: ${type}`);
      return res.status(200).send('OK');
    }

    const chain = (asset || currency || '').toUpperCase();
    console.log(`✅ Incoming ${chain} transaction: ${amount} to ${address}`);
    console.log(`🔗 Transaction ID: ${txId}`);

    // Trigger immediate fetch for this chain to update DB
    if (['BTC', 'LTC', 'ETH', 'SOL'].includes(chain)) {
      setTimeout(() => {
        FetchRecentTransactionsCronByChain(chain).catch(err => {
          console.error(`Failed to fetch ${chain} transactions after webhook:`, err.message);
        });
      }, 2000); // Small delay to allow blockchain confirmation
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ TATUM webhook error:', error);
    res.status(200).send('OK'); // Still return 200 to prevent retries
  }
});

// ETHERSCAN AND BTC/LTC EXPLORA API KEYS/URLS

// --- Configurable backends (Esplora-compatible) ---
const BTC_ESPLORA = process.env.BTC_ESPLORA || 'https://blockstream.info/api';
const LTC_ESPLORA = process.env.LTC_ESPLORA || 'https://litecoinspace.org/api';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

function ts(sec) {
  if (!sec) return null;
  // MySQL-compatible datetime: 'YYYY-MM-DD HH:MM:SS' (no UTC suffix, no milliseconds)
  return new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19);
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
      const direction = net > 0n ? 'inbound' : net < 0n ? 'outbound' : null;
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
      const dir = (to === me && from !== me) ? "inbound"
        : (from === me && to !== me) ? "outbound"
          : null;

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

      // console.log("Etherscan V2 tx:", t);

      // Note: Ensure field names match what the V2 endpoint returns
      return {
        time: new Date(Number(t.timeStamp) * 1000).toISOString().replace('T', ' ').slice(0, 19),
        direction: dir,
        amount: fmt(t.value || '0', 18), // convert Wei → ETH (18 decimals)
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
    const direction = net > 0n ? 'inbound' : net < 0n ? 'outbound' : null;
    // simple counterparty
    const cp = keys.find(k => (k || '').toLowerCase() !== address.toLowerCase()) || null;

    out.push({
      time: tx.blockTime ? ts(tx.blockTime) : null,
      direction,
      amount: fmt((net < 0n ? -net : net).toString(), 9),
      from: direction === 'inbound' ? cp : (direction === 'outbound' ? address : null),
      to: direction === 'inbound' ? address : (direction === 'outbound' ? cp : null),
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
      tx = await knex('BTC_TX')
        .where({ direction: 'IN', hash: transactionHash })
        .select('*');
      console.log('Lookup transaction result for bitcoin:', tx.length > 0 ? tx[0] : 'No transaction found');

      if (tx.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      result = tx[0];
    }
    else if (blockchain === "ethereum" || blockchain === "ETH") {
      tx = await knex('ETH_TX')
        .where({ direction: 'IN', hash: transactionHash })
        .select('*');
      console.log('Lookup transaction result for ethereum:', tx.length > 0 ? tx[0] : 'No transaction found');

      if (tx.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      result = tx[0];
    }
    else if (blockchain === "litecoin" || blockchain === "LTC") {
      tx = await knex('LTC_TX')
        .where({ direction: 'IN', hash: transactionHash })
        .select('*');
      console.log('Lookup transaction result for litecoin:', tx.length > 0 ? tx[0] : 'No transaction found');

      if (tx.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      result = tx[0];
    }
    else if (blockchain === "solana" || blockchain === "SOL") {
      tx = await knex('SOL_TX')
        .where({ direction: 'IN', hash: transactionHash })
        .select('*');
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


FetchRecentTransactionsCronByChain('BTC');
FetchRecentTransactionsCronByChain('ETH');
FetchRecentTransactionsCronByChain('LTC');
FetchRecentTransactionsCronByChain('SOL');
// FetchRecentTransactionsCronByChain('XRP'); // Not implemented in this demo




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

// Configure GCS bucket CORS once at startup so browsers can PUT uploads and GET
// signed URLs (video streaming, downloads) without cross-origin blocks.
// Origins: explicit app domain in prod, or '*' for local dev.
(async () => {
  try {
    const allowedOrigins = process.env.APP_ORIGIN
      ? [process.env.APP_ORIGIN, 'http://localhost:5173', 'http://localhost:3000']
      : ['*'];

    await storage.bucket(BUCKET_NAME).setMetadata({
      cors: [
        {
          origin: allowedOrigins,
          method: ['GET', 'PUT', 'POST', 'HEAD', 'OPTIONS', 'DELETE'],
          responseHeader: [
            'Content-Type',
            'Authorization',
            'X-Goog-Resumable',
            'X-Goog-Date',
            'X-Goog-Algorithm',
            'X-Goog-Credential',
            'X-Goog-Signed-Headers',
            'X-Goog-Signature',
            'Range',
            'Accept-Ranges',
            'Content-Range',
          ],
          maxAgeSeconds: 3600,
        },
      ],
    });
    console.log('✅ GCS bucket CORS configured');
  } catch (err) {
    console.error('⚠️  Failed to set GCS bucket CORS (uploads/downloads may fail in browser):', err.message);
  }
})();

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
          'UPDATE CreditPurchases SET transactionScreenshot = ? WHERE transactionScreenshot IS NULL and username = ? and transactionHash = ? and created_at >= NOW() - INTERVAL 1 HOUR ORDER BY created_at DESC LIMIT 1',
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
        await knex('userData')
          .where('username', username)
          .update({ profilePicture: imageUrl });

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


// // Basic RESTful routes for all tables
// server.get(PROXY + '/api/table/:table', async (req, res) => {
//   try {
//     const table = req.params.table;
//     const allowedTables = ['userData', 'CreditPurchases', 'redeemCredits', 'earnings', 'actions', 'createdKeys', 'notifications', 'wallet', 'reports', 'supportTickets'];

//     if (!allowedTables.includes(table)) {
//       return res.status(400).json({ error: 'Invalid table name' });
//     }

//     const rows = await knex(table).select('*');
//     res.json(rows);
//   } catch (error) {
//     console.error(`Get ${req.params.table} error:`, error);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// server.get(PROXY + '/api/table/:table/:id', async (req, res) => {
//   try {
//     const { table, id } = req.params;
//     const allowedTables = ['userData', 'CreditPurchases', 'redeemCredits', 'earnings', 'actions', 'notifications', 'wallet', 'reports', 'supportTickets'];

//     if (!allowedTables.includes(table)) {
//       return res.status(400).json({ error: 'Invalid table name' });
//     }

//     const rows = await knex(table).where('id', id).select('*');

//     if (rows.length === 0) {
//       return res.status(404).json({ error: 'Record not found' });
//     }

//     res.json(rows[0]);
//   } catch (error) {
//     console.error(`Get ${req.params.table} by ID error:`, error);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// server.patch(PROXY + '/api/table/:table/:id', async (req, res) => {
//   try {
//     const { table, id } = req.params;
//     const allowedTables = ['userData', 'CreditPurchases', 'redeemCredits', 'earnings', 'actions', 'createdKeys', 'notifications', 'wallet', 'reports', 'supportTickets'];

//     if (!allowedTables.includes(table)) {
//       return res.status(400).json({ error: 'Invalid table name' });
//     }

//     const updateData = req.body;
//     const columns = Object.keys(updateData);
//     const values = Object.values(updateData);

//     if (columns.length === 0) {
//       return res.status(400).json({ error: 'No data to update' });
//     }

//     const setClause = columns.map(col => `${col} = ?`).join(', ');
//     const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;

//     const result = await knex.raw(query, [...values, id]);

//     if (result[0].affectedRows === 0) {
//       return res.status(404).json({ error: 'Record not found' });
//     }

//     // Get updated record
//     const updated = await knex(table).where('id', id).select('*');
//     res.json(updated[0]);
//   } catch (error) {
//     console.error(`Update ${req.params.table} error:`, error);
//     res.status(500).json({ error: 'Database error - update failed (patch)' });
//   }
// });



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

// Drauwper burn-rate decay — every ENGINE_K minutes (default 5)
const BURN_K = parseInt(process.env.BURN_K || '5', 10);
cron.schedule(`*/${BURN_K} * * * *`, async () => {
  try {
    const res = await axios.post(`http://localhost:${process.env.PORT || 3001}${PROXY}/api/engine/decay-tick`);
    if (res.data.updated) console.log(`⏱  Burn decay tick: ${res.data.updated} drops updated`);
  } catch (err) {
    console.error('Decay tick cron error:', err.message);
  }
});

// Top contributor rewards — runs hourly, pays out 3-day-old drops
cron.schedule('0 * * * *', async () => {
  try {
    const res = await axios.post(`http://localhost:${process.env.PORT || 3001}${PROXY}/api/engine/contributor-rewards`);
    if (res.data.rewardedDrops) console.log(`💰 Contributor rewards: ${res.data.rewardedDrops} drops paid out`);
  } catch (err) {
    console.error('Contributor rewards cron error:', err.message);
  }
});

// Promo billing — every 12 hours (1 credit per impression, 10 credits per click since last billing run)
cron.schedule('0 */12 * * *', async () => {
  await runPromoBillingCron();
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CRYPTO TRANSACTION SYNC - PRIMARY CRON JOB
// ═══════════════════════════════════════════════════════════════════════════════
//  Architecture:
//  - Primary Method: TATUM API (unified multi-chain blockchain API)
//  - Fallback APIs: Chain-specific APIs (Esplora, Etherscan, Solana RPC)
//  - This function iterates all chains and delegates to FetchRecentTransactionsCronByChain
//  - Each chain automatically tries TATUM first, then falls back to legacy APIs
// ═══════════════════════════════════════════════════════════════════════════════
async function FetchRecentTransactionsCron() {
  const supportedChains = ['BTC', 'LTC', 'ETH', 'SOL'];

  try {
    console.log('🔄 Starting transaction sync for all chains...');
    
    for (const chain of supportedChains) {
      try {
        await FetchRecentTransactionsCronByChain(chain);
        console.log(`✅ Completed sync for ${chain}`);
      } catch (chainError) {
        console.error(`❌ Failed to sync ${chain}:`, chainError.message);
        // Continue with other chains even if one fails
      }
    }
    
    console.log('🎉 Transaction sync complete for all chains');
  } catch (error) {
    console.error('❌ Error in transaction sync cron job:', error);
  }
}


async function FetchRecentTransactionsCronByChain(cryptoChain) {

  
const walletAddressMap = {
  BTC: 'bc1q4j9e7equq4xvlyu7tan4gdmkvze7wc0egvykr6',
  LTC: 'ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh',
  SOL: 'qaSpvAumg2L3LLZA8qznFtbrRKYMP1neTGqpNgtCPaU',
  ETH: '0x9a61f30347258A3D03228F363b07692F3CBb7f27',
};

  try {
    console.log(`🔄 Fetching recent transactions for ${cryptoChain} wallet...`);

    const addr = walletAddressMap[cryptoChain];
    const chain = String(cryptoChain || '').toUpperCase();
    const address = String(addr || '').trim();
    const limit = 100;

    if (!address || !chain) {
      console.log('❌ No address or chain provided');
      return;
    }

    let rows = [];
    let source = 'unknown';

    // ═══════════════════════════════════════════════════════════════
    //  PRIMARY: Try TATUM API first
    // ═══════════════════════════════════════════════════════════════
    if (TATUM_API_KEY) {
      try {
        rows = await fetchTatumTransactions(chain, address, limit);
        source = 'TATUM';
        console.log(`✅ TATUM: Fetched ${rows.length} ${chain} transactions`);
      } catch (tatumError) {
        console.warn(`⚠️ TATUM failed for ${chain}, falling back to legacy APIs:`, tatumError.message);
        rows = []; // Reset for fallback
      }
    } else {
      console.log(`⚠️ TATUM_API_KEY not set, using legacy APIs for ${chain}`);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FALLBACK: Use legacy APIs if TATUM fails or is not configured
    // ═══════════════════════════════════════════════════════════════
    if (rows.length === 0) {
      try {
        if (chain === 'BTC') {
          rows = await fetchEsploraAddressTxs(BTC_ESPLORA, address, limit);
          source = 'Blockstream Esplora';
        } else if (chain === 'LTC') {
          rows = await fetchEsploraAddressTxs(LTC_ESPLORA, address, limit);
          source = 'Litecoin Esplora';
        } else if (chain === 'ETH') {
          rows = await fetchEth({ address, limit, chainId: 1, action: "txlist", extraParams: {} });
          source = 'Etherscan';
        } else if (chain === 'SOL') {
          rows = await fetchSol(address, limit);
          source = 'Solana RPC';
        } else {
          console.log(`❌ Unsupported chain: ${chain}`);
          return;
        }
        console.log(`✅ ${source}: Fetched ${rows.length} ${chain} transactions (fallback)`);
      } catch (fallbackError) {
        console.error(`❌ Both TATUM and ${source} failed for ${chain}:`, fallbackError.message);
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Store transactions in database
    // ═══════════════════════════════════════════════════════════════
    let inserted = 0;
    let skipped = 0;

    for (const tx of rows) {
      try {
        const transactionId = tx?.hash ?? tx?.signature ?? null;

        if (!transactionId) {
          console.log(`⚠️ Skipping ${chain} transaction with missing hash`);
          skipped++;
          continue;
        }

        // Check if transaction already exists
        const existingTxs = await knex(`${chain}_TX`)
          .where('txHash', transactionId)
          .select('txHash')
          .limit(1);

        if (existingTxs.length > 0) {
          skipped++;
          continue;
        }

        // Insert new transaction
        await knex(`${chain}_TX`).insert({
          created_at: tx.time,
          direction: tx.direction,
          amount: tx.amount,
          fromAddress: tx.from,
          toAddress: tx.to,
          txHash: transactionId
        });

        inserted++;
      } catch (insertError) {
        console.error(`❌ Failed to insert ${chain} transaction:`, insertError.message);
      }
    }

    console.log(`📊 ${chain} Summary: ${inserted} inserted, ${skipped} skipped (source: ${source})`);

  } catch (error) {
    console.error(`❌ Error processing ${cryptoChain} transactions:`, error.message);
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
    await knex.raw(
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
    const savedRows = await knex('device_fingerprints')
      .where({ user_id: userId, fingerprint_hash: fingerprintHash })
      .select('*');
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

        await knex('device_fingerprints')
          .where({ user_id: userId, fingerprint_hash: fingerprintHash })
          .update({
            last_seen: knex.fn.now(),
            login_count: knex.raw('login_count + 1'),
            ip_address: ipAddress || req.ip,
            full_fingerprint: JSON.stringify(fullFingerprint),
            compact_fingerprint: JSON.stringify(compactFingerprint),
            updated_at: knex.fn.now()
          });

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

    const fingerprints = await knex('device_fingerprints')
      .where('user_id', userId)
      .select(
        'id',
        'fingerprint_hash',
        'short_hash',
        'device_type',
        'browser',
        'os',
        'screen_resolution',
        'timezone',
        'language',
        'ip_address',
        'first_seen',
        'last_seen',
        'login_count',
        'unscramble_count',
        'leaked_content_count',
        'is_trusted',
        'is_blocked',
        'block_reason',
        'created_at',
        knex.raw(`CASE 
          WHEN last_seen > DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 'active'
          WHEN last_seen > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'recent'
          WHEN last_seen > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'inactive'
          ELSE 'dormant'
        END as device_status`)
      )
      .orderBy('last_seen', 'desc');

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

    const fingerprints = await knex('device_fingerprints')
      .where('fingerprint_hash', hash)
      .orWhere('short_hash', hash)
      .select('*');

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

    await knex.raw('CALL increment_unscramble_count(?)', [hash]);

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

    await knex.raw('CALL mark_device_leaked(?, ?)', [hash, reason || 'Leaked content detected']);

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

    await knex('device_fingerprints')
      .where('id', id)
      .update({ is_blocked: isBlocked, block_reason: blockReason || null });

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
    const stats = await knex('device_fingerprints')
      .select(
        knex.raw('COUNT(*) as total_devices'),
        knex.raw('COUNT(DISTINCT user_id) as total_users'),
        knex.raw('SUM(CASE WHEN is_blocked = true THEN 1 ELSE 0 END) as blocked_devices'),
        knex.raw('SUM(CASE WHEN leaked_content_count > 0 THEN 1 ELSE 0 END) as devices_with_leaks'),
        knex.raw('SUM(login_count) as total_logins'),
        knex.raw('SUM(unscramble_count) as total_unscrambles'),
        knex.raw('AVG(login_count) as avg_logins_per_device')
      );

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



server.get(PROXY + '/api/download', (req, res) => {
  // Serve file directly from python inputs/outputs
  const filename = req.query.filename || req.query.file;
  if (!filename) return res.status(400).json({ error: 'No filename provided' });
  const filePath = pythonService.getDownloadPath(filename);
  if (!filePath) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// Configure multer for file uploads (using paths from python-service)
const py_storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fs.mkdirSync(pythonService.INPUTS_DIR, { recursive: true });
    cb(null, pythonService.INPUTS_DIR);
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
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB limit
  fileFilter: function (req, file, cb) {
    // Accept images, videos, and audio only
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/') && !file.mimetype.startsWith('audio/')) {
      return cb(new Error('Only image, video, and audio files are allowed!'), false);
    }
    cb(null, true);
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



// Rewrite this to handle generic file uploads
server.post(PROXY + '/api/upload-drop-media', authenticateToken, async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🎥 NODE: uploading drop media request received');
  console.log('='.repeat(60));

  // Setup multer to handle multiple files
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'drop-files', 'videos', req.user?.username);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const originalName = file.originalname || 'upload';
        const safeBase = path
          .basename(originalName)
          .replace(/\s+/g, '_')
          .replace(/[^A-Za-z0-9._-]/g, '');
        const ext = path.extname(safeBase);
        const mimeExt = file.mimetype ? `.${file.mimetype.split('/').pop()}` : '';
        const finalName = ext ? safeBase : `${safeBase}${mimeExt}`;
        cb(null, finalName);
      }
    }),
    limits: { fileSize: 250 * 1024 * 1024 }, // 250MB limit for video files
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed'));
      }
    }
  });

  // Accept both originalVideo and leakedVideo files
  upload.fields([
    { name: 'originalVideo', maxCount: 1 },
    { name: 'leakedVideo', maxCount: 1 }
  ])(req, res, async (err) => {
    if (err) {
      console.error('❌ NODE ERROR: Multer error:', err);
      return res.status(400).json({ error: err.message });
    }

    const uploadedFiles = [];
    const LEAK_CHECK_COST = 10; // Credits cost for leak checking

    try {
      // Validate that both files were uploaded
      if (!req.files || !req.files.originalVideo || !req.files.leakedVideo) {
        return res.status(400).json({
          error: 'Both originalVideo and leakedVideo files are required'
        });
      }

      const originalVideoFile = req.files.originalVideo[0];
      const leakedVideoFile = req.files.leakedVideo[0];
      uploadedFiles.push(originalVideoFile.path, leakedVideoFile.path);

      console.log(`📤 NODE: Original video saved as: ${originalVideoFile.filename}`);
      console.log(`📤 NODE: Leaked video saved as: ${leakedVideoFile.filename}`);

      // Parse optional keyData or keyCode
      let keyData = null;
      let keyCode = null;

      if (req.body.keyData) {
        try {
          keyData = typeof req.body.keyData === 'string'
            ? JSON.parse(req.body.keyData)
            : req.body.keyData;
          console.log('🔑 NODE: Key data provided');
        } catch (parseError) {
          console.warn('⚠️  Failed to parse keyData:', parseError);
        }
      }

      if (req.body.keyCode) {
        keyCode = req.body.keyCode;
        console.log('🔑 NODE: Key code provided:', keyCode);
      }

      // PAUSE TO AVOID RATE LIMITS
      await new Promise(resolve => setTimeout(resolve, 3000));



      await knex('leaks_reports').insert({
        username: req.user?.username,
        creatorId: req.user?.id,
        keyData: keyData ? JSON.stringify(keyData) : null,
        decodeData: null,
        originalMedia: originalVideoFile.filename,
        leakedMedia: leakedVideoFile.filename
      });

      res.json({
        leakDetected: false,
        extractedCode: null,
        message: 'Leak detection is currently manual. Please contact support with the original and leaked videos for analysis.'
      });

    } catch (error) {
      console.error('❌ NODE ERROR:', error.message);
      console.log('='.repeat(60) + '\n');

      // Cleanup on error
      uploadedFiles.forEach(filePath => {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete uploaded file:', cleanupErr);
        }
      });

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
    const { username, userId, actionCost, unscrambleKey, mediaDetails, watermarkParams, scrambleType } = req.body;

    console.log('📊 Log unscramble event:', {
      "username": username,
      "userId": userId,
      // "creator": creator,
      "actionCost": actionCost,
      "unscrambleKey": unscrambleKey,
      "mediaDetails": mediaDetails,
      "watermarkParams": watermarkParams,
      "scrambleType": scrambleType
    });

    let creator = JSON.parse(unscrambleKey)?.creator || 'unknown';
    console.log('👤 Creator identified as:', creator);

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
    //   `watermark_params` json DEFAULT NULL,
    //   PRIMARY KEY (`id`)
    // ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
    if (scrambleType === 'audio') {
      await knex('audio_unscrambles').insert({
        userId: userId || null,
        username: username || 'anonymous',
        creator: JSON.stringify(creator) || '{"unknown"}',
        action_cost: actionCost || 'unknown',
        keyData: unscrambleKey ? JSON.stringify(unscrambleKey) : null,
        mediaDetails: mediaDetails ? JSON.stringify(mediaDetails) : null,
        watermark_params: watermarkParams ? JSON.stringify(watermarkParams) : null
      });
    } else if (scrambleType === 'video') {

      await knex('video_unscrambles').insert({
        userId: userId || null,
        username: username || 'anonymous',
        creator: JSON.stringify(creator) || '{"unknown"}',
        action_cost: actionCost || 'unknown',
        keyData: unscrambleKey ? JSON.stringify(unscrambleKey) : null,
        mediaDetails: mediaDetails ? JSON.stringify(mediaDetails) : null,
        watermark_params: watermarkParams ? JSON.stringify(watermarkParams) : null
      });

    } else {

      await knex('photo_unscrambles').insert({
        userId: userId || null,
        username: username || 'anonymous',
        creator: JSON.stringify(creator) || '{"unknown"}',
        action_cost: actionCost || 'unknown',
        keyData: unscrambleKey ? JSON.stringify(unscrambleKey) : null,
        mediaDetails: mediaDetails ? JSON.stringify(mediaDetails) : null,
        watermark_params: watermarkParams ? JSON.stringify(watermarkParams) : null
      });
    }
    res.json({ success: true, message: 'Unscramble event logged successfully' });
  } catch (error) {
    console.error('Log unscramble event error:', error);
    res.status(500).json({ success: false, message: 'Failed to log unscramble event' });
  }
});

// server.post('/api/analytics/audio-unscramble-event', async (req, res) => {
//   try {
//     const { username, userId, creator, actionCost, unscrambleKey, mediaDetails, watermarkParams } = req.body;

//     // CREATE TABLE
//     // `unscrambles` (
//     //   `id` int unsigned NOT NULL AUTO_INCREMENT,
//     //   `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     //   `userId` varchar(255) DEFAULT NULL,
//     //   `username` varchar(255) DEFAULT NULL,
//     //   `action_cost` int DEFAULT NULL,
//     //   `creatorId` varchar(255) DEFAULT NULL,
//     //   `keyData` json DEFAULT NULL,
//     //   `mediaDetails` json DEFAULT NULL,
//     //   `watermark_params` json DEFAULT NULL,
//     //   PRIMARY KEY (`id`)
//     // ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci

//     await pool.execute(
//       'INSERT INTO unscrambles (userId, username, creatorId, action_cost, keyData, mediaDetails, watermark_params) VALUES (?, ?, ?, ?, ?, ?, ?)',
//       [
//         userId || null,
//         username || 'anonymous',
//         creator || 'unknown',
//         actionCost || 'unknown',
//         unscrambleKey ? JSON.stringify(unscrambleKey) : null,
//         mediaDetails ? JSON.stringify(mediaDetails) : null,
//         watermarkParams ? JSON.stringify(watermarkParams) : null
//       ]
//     );

//     res.json({ success: true, message: 'Unscramble event logged successfully' });
//   } catch (error) {
//     console.error('Log unscramble event error:', error);
//     res.status(500).json({ success: false, message: 'Failed to log unscramble event' });
//   }
// });

// create a rout that will allow the clients to download video files from the server via file name
// server.get(PROXY+'/api/download/:filename', (req, res) => {
server.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  // const videoDir = path.join(__dirname, 'videos');
  // const videoDir = path.join(__dirname, 'inputs');
  const videoDir = path.join(__dirname, 'python/outputs');
  const filePath = path.join(videoDir, filename);

  console.log('📥 Download request for media:', filename);

  res.download(filePath, (err) => {
    if (err) {
      console.error('❌ Error downloading media:', err);
      res.status(500).send('Error downloading media');
    } else {
      console.log('✅ Media downloaded successfully:', filename);
    }
  });
});

// Handle refunding credits
server.post(PROXY + '/api/refund-credits', authenticateToken, async (req, res) => {
  const { userId, credits, username, email, currentCredits } = req.body;
  // console.log('💸 Refund credits request received for user:', username, 'Credits to refund:', credits, "userId: ", userId);
  try {
    if (!userId || !credits) {
      return res.status(400).json({ success: false, message: 'Missing userId or credits' });
    }

    // check the last transaction for the user 
    const lastTransaction = await knex('actions')
      .where('username', username)
      .orderBy('date', 'desc')
      .first();

    if (!lastTransaction) {
      return res.status(400).json({ success: false, message: 'No transactions found for user' });
    }

    // if (credits < (lastTransaction.action_cost || 0)) {
    refundAmount = lastTransaction.action_cost || 0;
    // console.warn(`⚠️ Attempting to refund less credits (${credits}) than the last transaction (${lastTransaction.action_cost}). Refunding only ${refundAmount} credits.`);
    // } else {
    // refundAmount = credits;
    // }

    // Refund credits to user
    await knex('userData')
      .where('id', userId)
      .increment('credits', refundAmount);

    console.log(`✅ Refunded ${refundAmount} credits to user ${username} (ID: ${userId})`);

    await CreateNotification(
      'credits_refunded',
      'Credits Refunded',
      `You have been refunded ${refundAmount} credits.`,
      'refund',
      username || 'anonymous'
    );

    await knex('actions').insert({
      id: uuidv4(),
      transactionId: uuidv4(),
      username: username || 'anonymous',
      email: email || 'anonymous@example.com',
      date: Date.now(),
      time: new Date().toLocaleTimeString(),
      credits: currentCredits,
      action_type: 'refunded-credits',
      action_cost: refundAmount,
      action_description: 'Credits refunded due to failed operation'
    });

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
    const existingSubs = await knex('subscriptions')
      .where({ user_id: userId, status: 'active' })
      .select('*');

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
      await knex.raw(
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

    const subscriptions = await knex('subscriptions')
      .where('user_id', userId)
      .whereIn('status', ['active', 'trialing'])
      .orderBy('created_at', 'desc')
      .limit(1);

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
    const subscriptions = await knex('subscriptions')
      .where({ user_id: userId, status: 'active' })
      .select('stripe_customer_id');

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
    const subscriptions = await knex('subscriptions')
      .where({ user_id: userId, status: 'active' })
      .select('stripe_subscription_id');

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
    await knex('subscriptions')
      .where('user_id', userId)
      .update({ status: 'canceling' });

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


// Stripe webhook handler
server.post(PROXY + '/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_PAYMENT_WEBHOOK_SECRET;

  let event;

  // use delineate between payments and subscriptions

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'customer.subscription.updated':
      console.log('Subscription updated event received.');
      const updatedSubscription = event.data.object;
      await knex('subscriptions')
        .where('stripe_subscription_id', updatedSubscription.id)
        .update({
          status: updatedSubscription.status,
          current_period_start: new Date(updatedSubscription.current_period_start * 1000),
          current_period_end: new Date(updatedSubscription.current_period_end * 1000)
        });
      console.log(`✅ Subscription updated: ${updatedSubscription.id}`);
      break;
    case 'customer.subscription.created':
      console.log('Subscription created event received.');
      const subscription = event.data.object;
      await knex('subscriptions')
        .where('stripe_subscription_id', subscription.id)
        .update({
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000),
          current_period_end: new Date(subscription.current_period_end * 1000)
        });

      let data = {
        "subscription_type": subtype,
        "subscription_cost": subcost,
        "username": username,
        "userId": userId,
        "name": name,
        "email": email,
        "transactionId": transactionId,
      };

      stripeCreditPurchases(data);
      console.log(`✅ Subscription created: ${subscription.id}`);
      break;

    case 'customer.subscription.deleted':
      console.log('Subscription deleted event received.');
      const deletedSub = event.data.object;
      await knex('subscriptions')
        .where('stripe_subscription_id', deletedSub.id)
        .update({ status: 'canceled' });
      console.log(`✅ Subscription cancelled: ${deletedSub.id}`);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Stripe webhook handler
server.post(PROXY + '/api/subscription/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;

  let event;

  // use delineate between payments and subscriptions

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'customer.subscription.updated':
      console.log('Subscription updated event received.');
      const updatedSubscription = event.data.object;
      await knex('subscriptions')
        .where('stripe_subscription_id', updatedSubscription.id)
        .update({
          status: updatedSubscription.status,
          current_period_start: new Date(updatedSubscription.current_period_start * 1000),
          current_period_end: new Date(updatedSubscription.current_period_end * 1000)
        });
      console.log(`✅ Subscription updated: ${updatedSubscription.id}`);
      break;
    case 'customer.subscription.created':
      console.log('Subscription created event received.');
      const subscription = event.data.object;
      await knex('subscriptions')
        .where('stripe_subscription_id', subscription.id)
        .update({
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000),
          current_period_end: new Date(subscription.current_period_end * 1000)
        });

      let data = {
        "subscription_type": subtype,
        "subscription_cost": subcost,
        "username": username,
        "userId": userId,
        "name": name,
        "email": email,
        "transactionId": transactionId,
      };

      stripeCreditPurchases(data);
      console.log(`✅ Subscription created: ${subscription.id}`);
      break;

    case 'customer.subscription.deleted':
      console.log('Subscription deleted event received.');
      const deletedSub = event.data.object;
      await knex('subscriptions')
        .where('stripe_subscription_id', deletedSub.id)
        .update({ status: 'canceled' });
      console.log(`✅ Subscription cancelled: ${deletedSub.id}`);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});



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

      { credits: 5000, dollars: 5, label: "$5.25", color: '#2196f3', priceId: 'price_1SR9lZEViYxfJNd20x2uwukQ' },
      { credits: 10000, dollars: 10, label: "$9.85", color: '#9c27b0', popular: true, priceId: 'price_1SR9kzEViYxfJNd27aLA7kFW' },
      { credits: 25000, dollars: 25, label: "$24.50", color: '#e91e63' },
      { credits: 50000, dollars: 50, label: "$48.50", color: '#ff5722' },
      { credits: 100000, dollars: 100, label: "$95.00", color: '#795548' },
    ];

    const packageData = PACKAGES.find(pkg => pkg.dollars === potentialVerifiedPayment.amount / 100);

    // TODO: update your DB: mark sale as paid for `myUserOrOrderId` or `username`
    // e.g. await Orders.markPaid({ userId: myUserOrOrderId, stripePaymentIntentId: paymentIntent.id });

    if (!packageData) {
      console.error(`[ERROR] No package found for amount: $${potentialVerifiedPayment.amount / 100}`);
      return res.status(400).json({ error: 'Unrecognized payment amount — package not found' });
    }

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

    await stripeCreditPurchases(data);

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

async function safeInsertWalletTransaction(tx) {
  const fallbackTypes = {
    credit_purchase: 'purchase',
    contribution_refund: 'bonus',
    contributor_reward: 'bonus',
    download_payment: 'contribution',
    creator_earning: 'bonus',
    creator_payout: 'admin_adjustment',
  };

  try {
    await knex('walletTransactions').insert(tx);
  } catch (error) {
    const isTypeError = error?.code === 'WARN_DATA_TRUNCATED'
      && /column 'type'/i.test(error?.sqlMessage || error?.message || '');
    const fallbackType = fallbackTypes[tx?.type];

    if (!isTypeError || !fallbackType) throw error;

    console.warn(`⚠️ walletTransactions.type "${tx.type}" is not supported by the current DB schema. Falling back to "${fallbackType}".`);
    await knex('walletTransactions').insert({ ...tx, type: fallbackType });
  }
}

function toMySQLDateTime(value) {
  if (!value) return null;
  const date = typeof value === 'number' && value < 1e12
    ? new Date(value * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
}

async function ensureStripeTransactionsTable() {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS stripeTransactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      stripeObjectType VARCHAR(50) DEFAULT 'payment_intent',
      stripeBalanceTransactionId VARCHAR(255) DEFAULT NULL,
      stripePaymentIntentId VARCHAR(255) DEFAULT NULL,
      stripeChargeId VARCHAR(255) DEFAULT NULL,
      stripeCheckoutSessionId VARCHAR(255) DEFAULT NULL,
      stripeCustomerId VARCHAR(255) DEFAULT NULL,
      stripeInvoiceId VARCHAR(255) DEFAULT NULL,
      stripeSubscriptionId VARCHAR(255) DEFAULT NULL,
      stripeSourceId VARCHAR(255) DEFAULT NULL,
      stripeSourceType VARCHAR(50) DEFAULT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'unknown',
      amount INT NOT NULL DEFAULT 0,
      amountReceived INT NOT NULL DEFAULT 0,
      fee INT NOT NULL DEFAULT 0,
      net INT NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      paymentMethodTypes JSON DEFAULT NULL,
      description TEXT,
      receiptEmail VARCHAR(255) DEFAULT NULL,
      customerEmail VARCHAR(255) DEFAULT NULL,
      customerName VARCHAR(255) DEFAULT NULL,
      livemode TINYINT(1) NOT NULL DEFAULT 0,
      metadata JSON DEFAULT NULL,
      rawPayload JSON DEFAULT NULL,
      stripeCreatedAt DATETIME DEFAULT NULL,
      availableOn DATETIME DEFAULT NULL,
      syncedAt DATETIME DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_stripe_payment_intent (stripePaymentIntentId),
      UNIQUE KEY uq_stripe_charge (stripeChargeId),
      UNIQUE KEY uq_stripe_balance_txn (stripeBalanceTransactionId),
      KEY idx_stripe_customer (stripeCustomerId),
      KEY idx_stripe_status (status),
      KEY idx_stripe_created_at (stripeCreatedAt),
      KEY idx_stripe_source_id (stripeSourceId),
      KEY idx_stripe_object_type (stripeObjectType)
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  `);

  const alterStatements = [
    "ALTER TABLE stripeTransactions MODIFY COLUMN stripePaymentIntentId VARCHAR(255) NULL",
    "ALTER TABLE stripeTransactions MODIFY COLUMN stripeChargeId VARCHAR(255) NULL",
    "ALTER TABLE stripeTransactions ADD COLUMN stripeObjectType VARCHAR(50) DEFAULT 'payment_intent'",
    "ALTER TABLE stripeTransactions ADD COLUMN stripeBalanceTransactionId VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE stripeTransactions ADD COLUMN stripeSourceId VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE stripeTransactions ADD COLUMN stripeSourceType VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE stripeTransactions ADD COLUMN fee INT NOT NULL DEFAULT 0",
    "ALTER TABLE stripeTransactions ADD COLUMN net INT NOT NULL DEFAULT 0",
    "ALTER TABLE stripeTransactions ADD COLUMN availableOn DATETIME DEFAULT NULL",
    "ALTER TABLE stripeTransactions ADD UNIQUE KEY uq_stripe_balance_txn (stripeBalanceTransactionId)",
    "ALTER TABLE stripeTransactions ADD KEY idx_stripe_source_id (stripeSourceId)",
    "ALTER TABLE stripeTransactions ADD KEY idx_stripe_object_type (stripeObjectType)"
  ];

  for (const sql of alterStatements) {
    try {
      await knex.raw(sql);
    } catch (error) {
      const message = error?.message || String(error);
      if (/Duplicate column name|Duplicate key name/i.test(message)) continue;
      console.warn('Stripe table alter skipped:', message);
    }
  }

  await knex('stripeTransactions')
    .where('stripeObjectType', 'payment_intent')
    .update({ stripeChargeId: null })
    .catch(() => {});
}

function normalizeStripeTransaction(paymentIntent) {
  const customer = paymentIntent?.customer && typeof paymentIntent.customer === 'object'
    ? paymentIntent.customer
    : null;
  const charge = paymentIntent?.latest_charge && typeof paymentIntent.latest_charge === 'object'
    ? paymentIntent.latest_charge
    : null;
  const billing = charge?.billing_details || {};
  const metadata = paymentIntent?.metadata || {};

  return {
    stripeObjectType: 'payment_intent',
    stripeBalanceTransactionId: null,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: null,
    stripeCheckoutSessionId: metadata.checkout_session_id || metadata.checkoutSessionId || metadata.session_id || null,
    stripeCustomerId: customer?.id || (typeof paymentIntent.customer === 'string' ? paymentIntent.customer : null),
    stripeInvoiceId: typeof paymentIntent.invoice === 'string' ? paymentIntent.invoice : paymentIntent.invoice?.id || null,
    stripeSubscriptionId: metadata.subscription_id || metadata.stripe_subscription_id || metadata.subscriptionId || null,
    stripeSourceId: paymentIntent.id,
    stripeSourceType: 'payment_intent',
    status: paymentIntent.status || 'unknown',
    amount: Number(paymentIntent.amount || 0),
    amountReceived: Number(paymentIntent.amount_received || 0),
    fee: 0,
    net: Number(paymentIntent.amount_received || paymentIntent.amount || 0),
    currency: String(paymentIntent.currency || 'USD').toUpperCase(),
    paymentMethodTypes: JSON.stringify(paymentIntent.payment_method_types || []),
    description: paymentIntent.description || null,
    receiptEmail: paymentIntent.receipt_email || null,
    customerEmail: customer?.email || billing.email || null,
    customerName: customer?.name || billing.name || null,
    livemode: paymentIntent.livemode ? 1 : 0,
    metadata: JSON.stringify(metadata),
    rawPayload: JSON.stringify(paymentIntent),
    stripeCreatedAt: toMySQLDateTime(paymentIntent.created),
    availableOn: null,
    syncedAt: toMySQLDateTime(Date.now()),
  };
}

function normalizeStripeBalanceTransaction(balanceTx) {
  const source = balanceTx?.source && typeof balanceTx.source === 'object'
    ? balanceTx.source
    : null;
  const billing = source?.billing_details || {};
  const sourceMetadata = source?.metadata || {};

  return {
    stripeObjectType: 'balance_transaction',
    stripeBalanceTransactionId: balanceTx.id,
    stripePaymentIntentId: null,
    stripeChargeId: source?.object === 'charge' ? source.id : null,
    stripeCheckoutSessionId: sourceMetadata.checkout_session_id || sourceMetadata.checkoutSessionId || sourceMetadata.session_id || null,
    stripeCustomerId: source?.customer || null,
    stripeInvoiceId: source?.invoice || null,
    stripeSubscriptionId: sourceMetadata.subscription_id || sourceMetadata.stripe_subscription_id || sourceMetadata.subscriptionId || source?.subscription || null,
    stripeSourceId: typeof balanceTx.source === 'string' ? balanceTx.source : source?.id || null,
    stripeSourceType: source?.object || balanceTx.type || null,
    status: source?.status || balanceTx.type || 'unknown',
    amount: Number(balanceTx.amount || 0),
    amountReceived: Number(balanceTx.amount || 0),
    fee: Number(balanceTx.fee || 0),
    net: Number(balanceTx.net || 0),
    currency: String(balanceTx.currency || 'USD').toUpperCase(),
    paymentMethodTypes: JSON.stringify(source?.payment_method_details?.type ? [source.payment_method_details.type] : []),
    description: source?.description || balanceTx.description || null,
    receiptEmail: source?.receipt_email || null,
    customerEmail: billing.email || source?.customer_details?.email || null,
    customerName: billing.name || source?.customer_details?.name || null,
    livemode: balanceTx.livemode ? 1 : 0,
    metadata: JSON.stringify(sourceMetadata),
    rawPayload: JSON.stringify(balanceTx),
    stripeCreatedAt: toMySQLDateTime(balanceTx.created),
    availableOn: toMySQLDateTime(balanceTx.available_on),
    syncedAt: toMySQLDateTime(Date.now()),
  };
}

async function upsertStripeTransactionRecord(record) {
  await knex.raw(
    `INSERT INTO stripeTransactions (
      stripeObjectType, stripeBalanceTransactionId, stripePaymentIntentId, stripeChargeId,
      stripeCheckoutSessionId, stripeCustomerId, stripeInvoiceId, stripeSubscriptionId,
      stripeSourceId, stripeSourceType, status, amount, amountReceived, fee, net, currency,
      paymentMethodTypes, description, receiptEmail, customerEmail, customerName,
      livemode, metadata, rawPayload, stripeCreatedAt, availableOn, syncedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      stripeObjectType = VALUES(stripeObjectType),
      stripeChargeId = VALUES(stripeChargeId),
      stripeCheckoutSessionId = VALUES(stripeCheckoutSessionId),
      stripeCustomerId = VALUES(stripeCustomerId),
      stripeInvoiceId = VALUES(stripeInvoiceId),
      stripeSubscriptionId = VALUES(stripeSubscriptionId),
      stripeSourceId = VALUES(stripeSourceId),
      stripeSourceType = VALUES(stripeSourceType),
      status = CASE
        WHEN stripeTransactions.status IN ('pending', 'processing', 'canceled') THEN stripeTransactions.status
        ELSE VALUES(status)
      END,
      amount = VALUES(amount),
      amountReceived = VALUES(amountReceived),
      fee = VALUES(fee),
      net = VALUES(net),
      currency = VALUES(currency),
      paymentMethodTypes = VALUES(paymentMethodTypes),
      description = VALUES(description),
      receiptEmail = VALUES(receiptEmail),
      customerEmail = VALUES(customerEmail),
      customerName = VALUES(customerName),
      livemode = VALUES(livemode),
      metadata = VALUES(metadata),
      rawPayload = VALUES(rawPayload),
      stripeCreatedAt = VALUES(stripeCreatedAt),
      availableOn = VALUES(availableOn),
      syncedAt = VALUES(syncedAt),
      updated_at = CURRENT_TIMESTAMP`,
    [
      record.stripeObjectType,
      record.stripeBalanceTransactionId,
      record.stripePaymentIntentId,
      record.stripeChargeId,
      record.stripeCheckoutSessionId,
      record.stripeCustomerId,
      record.stripeInvoiceId,
      record.stripeSubscriptionId,
      record.stripeSourceId,
      record.stripeSourceType,
      record.status,
      record.amount,
      record.amountReceived,
      record.fee,
      record.net,
      record.currency,
      record.paymentMethodTypes,
      record.description,
      record.receiptEmail,
      record.customerEmail,
      record.customerName,
      record.livemode,
      record.metadata,
      record.rawPayload,
      record.stripeCreatedAt,
      record.availableOn,
      record.syncedAt,
    ]
  );
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Retrieve the most recent PaymentIntents from Stripe with optional customer details
 */
async function getRecentPayments(limit = 10, includeCustomerDetails = true) {
  try {
    const paymentIntents = await stripe.paymentIntents.list({
      limit,
      expand: ['data.customer', 'data.latest_charge']
    });
    const results = [];

    for (const pi of paymentIntents.data) {
      const paymentData = {
        id: pi.id,
        status: pi.status,
        amount: pi.amount,
        currency: pi.currency,
        description: pi.description,
        created: pi.created,
        customer_id: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id || null,
        metadata: pi.metadata
      };

      if (includeCustomerDetails && pi.customer) {
        if (typeof pi.customer === 'object') {
          paymentData.customer = {
            id: pi.customer.id,
            email: pi.customer.email,
            name: pi.customer.name,
            phone: pi.customer.phone,
            metadata: pi.customer.metadata || {}
          };
        } else {
          const customerDetails = await getCustomerDetails(pi.customer);
          paymentData.customer = customerDetails || null;
        }
      }

      results.push(paymentData);
    }

    console.log(`[DEBUG] Fetched ${results.length} payment intents`);
    return { success: true, count: results.length, payments: results };
  } catch (error) {
    const errorMessage = error.message || String(error);
    console.error('[ERROR] Stripe API error:', errorMessage);
    return { error: errorMessage, status: 'api_error' };
  }
}

async function getRecentCheckoutSessions({ limit = 50, timeRangeStart, timeRangeEnd } = {}) {
  const params = {
    limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
    expand: ['data.payment_intent', 'data.payment_intent.latest_charge']
  };

  const created = {};
  if (Number.isFinite(timeRangeStart)) created.gte = Math.floor(timeRangeStart / 1000);
  if (Number.isFinite(timeRangeEnd)) created.lte = Math.floor(timeRangeEnd / 1000);
  if (Object.keys(created).length > 0) params.created = created;

  return stripe.checkout.sessions.list(params);
}

async function syncStripeTransactionsCron(limit = 100) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️ STRIPE_SECRET_KEY is missing. Stripe transaction sync skipped.');
    return { success: false, skipped: true, reason: 'missing_secret_key' };
  }

  await ensureStripeTransactionsTable();

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
  const lookbackHours = parseInt(process.env.STRIPE_SYNC_HOURS || '8760', 10); // default: 1 year
  const baseParams = {
    limit: safeLimit,
    expand: ['data.customer', 'data.latest_charge']
  };

  if (Number.isFinite(lookbackHours) && lookbackHours > 0) {
    const createdSinceUnix = Math.floor(Date.now() / 1000) - (lookbackHours * 60 * 60);
    baseParams.created = { gte: createdSinceUnix };
  }

  let paymentIntents = await stripe.paymentIntents.list(baseParams);

  if ((!paymentIntents?.data || paymentIntents.data.length === 0) && baseParams.created) {
    console.warn(`⚠️ Stripe sync found no payment intents in the last ${lookbackHours} hours. Falling back to the latest ${safeLimit} payment intents.`);
    const fallbackParams = { ...baseParams };
    delete fallbackParams.created;
    paymentIntents = await stripe.paymentIntents.list(fallbackParams);
  }

  const balanceTransactions = await stripe.balanceTransactions.list({
    limit: safeLimit,
    expand: ['data.source']
  });

  let inserted = 0;
  let updated = 0;

  for (const pi of paymentIntents.data || []) {
    const [existing] = await knex('stripeTransactions')
      .where('stripePaymentIntentId', pi.id)
      .select('id')
      .limit(1);

    const record = normalizeStripeTransaction(pi);
    await upsertStripeTransactionRecord(record);

    if (existing) updated += 1;
    else inserted += 1;
  }

  for (const tx of balanceTransactions.data || []) {
    const [existing] = await knex('stripeTransactions')
      .where('stripeBalanceTransactionId', tx.id)
      .select('id')
      .limit(1);

    const record = normalizeStripeBalanceTransaction(tx);
    await upsertStripeTransactionRecord(record);

    if (existing) updated += 1;
    else inserted += 1;
  }

  console.log(`💳 Stripe sync complete: ${inserted} inserted, ${updated} updated, ${(paymentIntents.data || []).length} payment intents scanned, ${(balanceTransactions.data || []).length} balance transactions scanned.`);
  return {
    success: true,
    inserted,
    updated,
    paymentIntentsScanned: (paymentIntents.data || []).length,
    balanceTransactionsScanned: (balanceTransactions.data || []).length,
    scanned: (paymentIntents.data || []).length + (balanceTransactions.data || []).length,
  };
}

cron.schedule('*/30 * * * *', async () => {
  try {
    await syncStripeTransactionsCron(100);
  } catch (err) {
    console.error('Stripe transaction cron error:', err.message || err);
  }
});

const STRIPE_AUTO_APPROVE_MIN_MATCH_SCORE = parseInt(process.env.STRIPE_AUTO_APPROVE_MIN_MATCH_SCORE || '2', 10);
const STRIPE_MANUAL_REVIEW_MAX_PER_DAY = parseInt(process.env.STRIPE_MANUAL_REVIEW_MAX_PER_DAY || '3', 10);
const STRIPE_MANUAL_REVIEW_MAX_PER_HOUR = parseInt(process.env.STRIPE_MANUAL_REVIEW_MAX_PER_HOUR || '1', 10);

function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function enforceStripeManualReviewRateLimit(userId) {
  if (!userId) return;

  const base = knex('CreditPurchases')
    .where('userId', userId)
    .where('paymentMethod', 'stripe')
    .whereIn('status', ['processing', 'pending']);

  const [hourlyRow] = await base.clone()
    .where('created_at', '>=', knex.raw('DATE_SUB(NOW(), INTERVAL 1 HOUR)'))
    .count({ count: 'id' });

  const [dailyRow] = await base.clone()
    .where('created_at', '>=', knex.raw('DATE_SUB(NOW(), INTERVAL 1 DAY)'))
    .count({ count: 'id' });

  const hourlyCount = toCount(hourlyRow?.count);
  const dailyCount = toCount(dailyRow?.count);

  if (hourlyCount >= STRIPE_MANUAL_REVIEW_MAX_PER_HOUR) {
    const err = new Error('Manual review request limit reached. You can submit only 1 manual-review Stripe request per hour.');
    err.httpStatus = 429;
    throw err;
  }

  if (dailyCount >= STRIPE_MANUAL_REVIEW_MAX_PER_DAY) {
    const err = new Error('Manual review request limit reached. You can submit up to 3 manual-review Stripe requests per day.');
    err.httpStatus = 429;
    throw err;
  }
}

// Sent from the client: timeRange, user, packageData from buy Credits page
server.post(PROXY + '/api/verify-stripe-payment', async (req, res) => {

  const { timeRange, user, packageData, checkoutSessionId } = req.body;

  if (!user || (!checkoutSessionId && (!packageData || !timeRange))) {
    return res.status(400).json({
      error: 'Missing required fields: user is required, and either checkoutSessionId or packageData + timeRange must be provided',
      status: 'invalid_input'
    });
  }

  // fetchRecentStripePayments(20, true).then(result => {

  let pkg = null;
  if (packageData) {
    const parsedAmount = Math.round(Number(packageData.amount || 0));
    const parsedDollars = Number(packageData.dollars || 0);
    const parsedCredits = Math.floor(Number(packageData.credits || 0));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !Number.isFinite(parsedDollars) || parsedDollars <= 0 || !Number.isFinite(parsedCredits) || parsedCredits <= 0) {
      return res.status(400).json({
        error: 'Invalid packageData payload. amount, dollars, and credits are required.',
        status: 'invalid_input'
      });
    }

    pkg = {
      amount: parsedAmount,
      dollars: parsedDollars,
      credits: parsedCredits,
    };
  }
  const timeOffsetMs = 3 * 60 * 1000; // 3 minutes buffer on either side
  const timeRangeStart = timeRange?.start ? (timeRange.start - timeOffsetMs) : null;   // unix ms
  const timeRangeEnd   = timeRange?.end ? (timeRange.end + timeOffsetMs) : null;     // unix ms
  const userReferenceId = String(user.id || '').trim();

  if (!userReferenceId) {
    return res.status(400).json({
      error: 'User id is required for Stripe client_reference_id verification.',
      status: 'invalid_input'
    });
  }

  console.log(`[INFO] verify-stripe-payment: pkg=${JSON.stringify(pkg)}, timeRange=${JSON.stringify(timeRange)}, userRef=${userReferenceId}`);

  try {
    // ── Step 1: Verify through Checkout Session (client_reference_id) ──
    let matchedCheckoutSession = null;

    if (checkoutSessionId) {
      const directSession = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
        expand: ['payment_intent', 'payment_intent.latest_charge']
      });

      const directRef = String(directSession.client_reference_id || directSession.metadata?.userId || '').trim();
      if (directRef !== userReferenceId) {
        return res.status(403).json({
          error: 'Checkout session does not belong to the authenticated account.',
          status: 'forbidden'
        });
      }

      if (!pkg && Number.isFinite(Number(directSession.amount_total))) {
        pkg = {
          amount: Number(directSession.amount_total),
          dollars: Number(directSession.amount_total || 0) / 100,
          credits: Math.floor((Number(directSession.amount_total || 0) / 100) * 1000),
        };
      }

      matchedCheckoutSession = directSession;
    }

    if (!matchedCheckoutSession) {
      const recentSessions = await getRecentCheckoutSessions({
        limit: 100,
        timeRangeStart,
        timeRangeEnd,
      });

      let bestSession = null;
      let bestSessionScore = -1;

      for (const session of recentSessions.data || []) {
        const refId = String(session.client_reference_id || session.metadata?.userId || '').trim();
        if (!refId || refId !== userReferenceId) continue;
        if (session.mode !== 'payment') continue;

        const amountMatches = pkg ? Number(session.amount_total || 0) === Number(pkg.amount || 0) : true;
        if (!amountMatches) continue;

        const score =
          (session.payment_status === 'paid' ? 4 : 0) +
          (session.status === 'complete' ? 2 : 0) +
          (session.payment_intent ? 2 : 0);

        if (score > bestSessionScore) {
          bestSessionScore = score;
          bestSession = session;
        }
      }

      matchedCheckoutSession = bestSession;
    }

    let potentialVerifiedPayment = null;
    let matchSource = 'checkout_session_client_reference_id';

    if (matchedCheckoutSession) {
      const paymentIntentObj = matchedCheckoutSession.payment_intent && typeof matchedCheckoutSession.payment_intent === 'object'
        ? matchedCheckoutSession.payment_intent
        : null;
      const paymentIntentId = paymentIntentObj?.id || (typeof matchedCheckoutSession.payment_intent === 'string' ? matchedCheckoutSession.payment_intent : null);
      const resolvedPi = paymentIntentObj || (paymentIntentId ? await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] }) : null);

      if (!resolvedPi) {
        return res.status(404).json({
          error: 'Checkout session found but no linked payment intent was available yet.',
          status: 'not_found',
        });
      }

      const resolvedCharge = resolvedPi.latest_charge && typeof resolvedPi.latest_charge === 'object' ? resolvedPi.latest_charge : null;

      potentialVerifiedPayment = {
        id: resolvedPi.id,
        stripeChargeId: resolvedCharge?.id || null,
        status: resolvedPi.status || (matchedCheckoutSession.payment_status === 'paid' ? 'succeeded' : 'processing'),
        amount: Number(resolvedPi.amount || matchedCheckoutSession.amount_total || 0),
        currency: String(resolvedPi.currency || matchedCheckoutSession.currency || 'USD').toUpperCase(),
        created: resolvedPi.created,
        customer: {
          email: matchedCheckoutSession.customer_details?.email || matchedCheckoutSession.customer_email || '',
          name: matchedCheckoutSession.customer_details?.name || '',
          phone: matchedCheckoutSession.customer_details?.phone || '',
        },
        _matchScore: 5,
        _matchSource: matchSource,
        stripeCheckoutSessionId: matchedCheckoutSession.id,
      };

      if (!pkg && Number.isFinite(Number(potentialVerifiedPayment.amount))) {
        pkg = {
          amount: Number(potentialVerifiedPayment.amount),
          dollars: Number(potentialVerifiedPayment.amount || 0) / 100,
          credits: Math.floor((Number(potentialVerifiedPayment.amount || 0) / 100) * 1000),
        };
      }
    }

    // No Checkout Session match means no auto-verifiable payment candidate.
    if (!potentialVerifiedPayment) {
      matchSource = 'checkout_session_client_reference_id';
    }

    if (!potentialVerifiedPayment) {
      if (!pkg) {
        return res.status(400).json({
          error: 'Unable to determine purchase package for manual review.',
          status: 'invalid_input'
        });
      }

      await enforceStripeManualReviewRateLimit(user.id);

      const pendingResult = await stripeCreditPurchases({
        username: user.username,
        userId: user.id,
        name: user.name,
        email: user.email,
        walletAddress: 'Stripe',
        transactionId: null,
        stripePaymentIntentId: null,
        stripeChargeId: null,
        blockExplorerLink: 'Stripe Payment',
        currency: 'USD',
        amount: pkg.amount,
        cryptoAmount: pkg.dollars,
        rate: null,
        session_id: user.id,
        orderLoggingEnabled: false,
        userAgent: user.userAgent,
        ip: user.ip,
        dollars: pkg.dollars,
        credits: pkg.credits,
        status: 'processing',
        shouldCredit: false,
        manualReviewReason: 'no_auto_match',
      });

      console.log('[INFO] No payment matched time window + amount. Queued for manual review.');
      return res.status(202).json({
        success: true,
        status: 'pending',
        pending: true,
        autoApproved: false,
        purchaseId: pendingResult?.purchaseId || null,
        matchSource,
        message: 'This payment could not be auto-verified and has been submitted for manual review. Credits will be applied once approved.',
      });
    }

    // ── Step 3: Package lookup ─────────────────────────────────────────────
    const PACKAGES = [
      { credits: 5000,   dollars: 5.25,   label: '$5.00',   color: '#2196f3', priceId: 'price_1SR9lZEViYxfJNd20x2uwukQ' },
      { credits: 10000,  dollars: 9.85,  label: '$10.00',  color: '#9c27b0', popular: true, priceId: 'price_1SR9kzEViYxfJNd27aLA7kFW' },
      // { credits: 20000,  dollars: 20,  label: '$20.00',  color: '#f57c00', priceId: 'price_1SR9mrEViYxfJNd2dD5NHFoL' },
      { credits: 25000,  dollars: 24.50,  label: '$25.00',  color: '#e91e63' },
      { credits: 50000,  dollars: 48.50,  label: '$50.00',  color: '#ff5722' },
      { credits: 100000, dollars: 95, label: '$100.00', color: '#795548' },
    ];

    const matchedPackage = PACKAGES.find(p => Math.round(p.dollars) === Math.round(potentialVerifiedPayment.amount / 100)); //round to nearest dollar to avoid minor discrepancies (e.g. $9.85 stored as 985 but package = 1000).

    if (!matchedPackage) {
      console.error(`[ERROR] No package for amount $${Math.round(potentialVerifiedPayment.amount / 100)}`);
      return res.status(400).json({ error: 'Unrecognized payment amount — package not found', status: 'invalid_amount' });
    }

    const autoApproved = potentialVerifiedPayment.status === 'succeeded'
      && Number(potentialVerifiedPayment._matchScore || 0) >= STRIPE_AUTO_APPROVE_MIN_MATCH_SCORE;

    const purchaseData = {
      username:          user.username,
      userId:            user.id,
      name:              user.name,
      email:             user.email,
      walletAddress:     'Stripe',
      transactionId:     potentialVerifiedPayment.id,
      stripePaymentIntentId: potentialVerifiedPayment.id,
      stripeChargeId: potentialVerifiedPayment.stripeChargeId || null,
      stripeCheckoutSessionId: potentialVerifiedPayment.stripeCheckoutSessionId || null,
      blockExplorerLink: 'Stripe Payment',
      currency:          'USD',
      amount:            potentialVerifiedPayment.amount,
      cryptoAmount:      matchedPackage.dollars,
      rate:              null,
      session_id:        user.id,
      orderLoggingEnabled: false,
      userAgent:         user.userAgent,
      ip:                user.ip,
      dollars:           matchedPackage.dollars,
      credits:           matchedPackage.credits,
      status: autoApproved ? 'completed' : 'processing',
      shouldCredit: autoApproved,
      manualReviewReason: autoApproved ? null : `score_${Number(potentialVerifiedPayment._matchScore || 0)}_status_${potentialVerifiedPayment.status}`,
    };

    if (!autoApproved) {
      const [existingPending] = await knex('CreditPurchases')
        .where('paymentMethod', 'stripe')
        .where('stripePaymentIntentId', potentialVerifiedPayment.id)
        .whereIn('status', ['processing', 'pending'])
        .select('id')
        .limit(1);

      if (existingPending) {
        return res.status(202).json({
          success: true,
          status: 'pending',
          pending: true,
          autoApproved: false,
          purchaseId: existingPending.id,
          paymentIntentId: potentialVerifiedPayment.id,
          message: 'This payment could not be auto-verified and is already pending manual review.',
        });
      }

      await enforceStripeManualReviewRateLimit(user.id);

      await knex('stripeTransactions')
        .where('stripePaymentIntentId', potentialVerifiedPayment.id)
        .update({ status: 'pending', syncedAt: knex.fn.now() })
        .catch(() => {});

      await stripeCreditPurchases(purchaseData);

      console.log(`[INFO] Stripe payment queued for manual review. pi=${potentialVerifiedPayment.id}, score=${potentialVerifiedPayment._matchScore}`);
      return res.status(202).json({
        success: true,
        status: 'pending',
        pending: true,
        autoApproved: false,
        paymentIntentId: potentialVerifiedPayment.id,
        matchSource: potentialVerifiedPayment._matchSource,
        matchScore: potentialVerifiedPayment._matchScore,
        message: 'This payment could not be auto-verified and has been submitted for manual review. Credits will be applied once approved.',
      });
    }

    await stripeCreditPurchases(purchaseData);

    console.log(`[INFO] Payment verification complete. status=${potentialVerifiedPayment.status}, source=${potentialVerifiedPayment._matchSource}, score=${potentialVerifiedPayment._matchScore}`);
    return res.json(potentialVerifiedPayment);

  } catch (error) {
    console.error('Payment verification error:', error.message);
    const statusCode = Number(error?.httpStatus) || 500;
    res.status(statusCode).json({ error: error.message || 'Payment verification failed', status: statusCode === 429 ? 'rate_limited' : 'server_error' });
  }
});

// async function fetchEth({
async function stripeCreditPurchases(data) {

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
      // amount,
      cryptoAmount,
      rate,
      session_id,
      orderLoggingEnabled,
      userAgent,
      ip,
      dollars,
      credits,
      stripePaymentIntentId,
      stripeChargeId,
      stripeCheckoutSessionId,
      status = 'completed',
      shouldCredit = true,
      manualReviewReason = null,
    } = data;

    const amount = Math.round((data.amount || 0)/ 100)*100; // Store amount in cents to avoid floating point issues. round to nearest 100 cents to tolerate small promotional discounts (e.g. $9.85 stored as 985 but package = 1000).

    console.log('💰 Logging Stripe purchase for user:', username);


    // console.log("data: ", data)


    // check for duplicate transaction / payment intent
    if (transactionId || stripePaymentIntentId) {
      let existingQuery = knex('CreditPurchases').select('id', 'status').where('paymentMethod', 'stripe');

      if (stripePaymentIntentId) {
        existingQuery = existingQuery.where('stripePaymentIntentId', stripePaymentIntentId);
      } else if (transactionId) {
        existingQuery = existingQuery.where('transactionHash', transactionId);
      }

      const existing = await existingQuery.first();
      if (existing) {
        console.log('⚠️ Duplicate Stripe purchase detected:', stripePaymentIntentId || transactionId);
        return ({ success: true, duplicate: true, purchaseId: existing.id, status: existing.status });
      }
    }


    // Basic validation
    try {

      console.log('✅ Logging purchase for user:', username);

      const PACKAGES = [
        // { credits: 2500, dollars: 2.5, label: "$2.50 Package", color: '#4caf50', priceId: 'price_1SR9nNEViYxfJNd2pijdhiBM' },
        { credits: 5000, dollars: 5.25, label: "$5.00 Package", color: '#2196f3', priceId: 'price_1SR9lZEViYxfJNd20x2uwukQ' },
        { credits: 10000, dollars: 9.85, label: "$10.00 Package", color: '#9c27b0', popular: true, priceId: 'price_1SR9kzEViYxfJNd27aLA7kFW' },
        // { credits: 20000, dollars: 20, label: "$20.00 Package", color: '#f57c00', priceId: 'price_1SR9mrEViYxfJNd2dD5NHFoL' },
        { credits: 25000, dollars: 24.50, label: "$25.00 Package", color: '#e91e63' },
        { credits: 50000, dollars: 48.50, label: "$50.00 Package", color: '#ff5722' },
        { credits: 100000, dollars: 95, label: "$100.00 Package", color: '#795548' },
      ];

      const packageData = PACKAGES.find(pkg => Math.round(pkg.dollars) === Math.round(amount / 100)); //round to nearest dollar to avoid minor discrepancies (e.g. $9.85 stored as 985 but package = 1000).

      if (!packageData) {
        console.error(`[ERROR] stripeCreditPurchases: No package matched amount $${amount / 100}`);
        return { error: 'Unrecognized payment amount — package not found' };
      }

      const validPackageEnums = new Set(['5000', '10000', '25000', '50000', '100000']);
      const packageEnumValue = String(packageData.credits);
      const packageColumnValue = validPackageEnums.has(packageEnumValue) ? packageEnumValue : 'custom';

      const [purchaseId] = await knex('CreditPurchases').insert({
        username,
        userId,
        id: Math.random().toString(36).substring(2, 10),
        name,
        email,
        walletAddress,
        transactionHash: transactionId,
        stripePaymentIntentId: stripePaymentIntentId || transactionId,
        stripeChargeId: stripeChargeId || null,
        stripeCheckoutSessionId: stripeCheckoutSessionId || null,
        blockExplorerLink: "www.stripe.com",
        currency,
        amount,
        cryptoAmount,
        package: packageColumnValue,
        status,
        rate,
        date: Date.now(),
        time: new Date().toISOString(),
        session_id,
        // orderLoggingEnabled,
        userAgent,
        ip,
        credits: packageData.credits,
        paymentMethod: 'stripe'
      });
      const purchases = { insertId: purchaseId };

      // Update user credits
      if (shouldCredit && amount !== undefined && amount !== null && amount > 0) {
        // Get purchase ID for wallet transaction reference
        const purchaseRecordId = await knex('CreditPurchases')
          .where('stripePaymentIntentId', stripePaymentIntentId || transactionId)
          .orWhere('transactionHash', transactionId)
          .select('id')
          .first()
          .then(row => row?.id);

        // Increment user credits using userId (more reliable than username)
        await knex('userData')
          .where('id', userId)
          .increment('credits', Math.floor(credits));

        // Get updated balance
        const userRow = await knex('userData')
          .select('credits')
          .where('id', userId)
          .first();

        // Create wallet transaction record
        await safeInsertWalletTransaction({
          id: require('crypto').randomUUID(),
          userId: userId,
          type: 'credit_purchase',
          amount: Math.floor(credits),
          balanceAfter: Number(userRow?.credits || 0),
          relatedPurchaseId: purchaseRecordId,
          description: 'Stripe payment completed',
          created_at: knex.fn.now(),
        });

        await CreateNotification(
          'credits_purchased',
          'Credits Purchased',
          `You have purchased ${Math.floor(credits).toLocaleString()} credits for $${dollars}.`,
          'purchase',
          username || 'anonymous'
        );
      } else {
        await CreateNotification(
          'credit_purchase_pending',
          'Payment Pending Manual Review',
          `Your Stripe purchase is pending manual review${manualReviewReason ? ` (${manualReviewReason})` : ''}. Credits will be applied once approved.`,
          'purchase',
          username || 'anonymous'
        );
      }

      return ({ success: true, purchases, purchaseId, pending: !shouldCredit, status });
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
      //   'SELECT * FROM CreditPurchases WHERE transactionHash = ?',
      //   [transactionId]
      // );
      const existing = await knex('CreditPurchases')
        .where('transactionId', transactionId);
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

      const [subscriptionInsertId] = await knex('subscriptions').insert({
        username,
        user_id: userId,
        stripe_subscription_id,
        stripe_customer_id,
        plan_id: priceId,
        plan_name: label,
        status: 'active',
        current_period_start: toMySQLDateTime(currentTime),
        current_period_end: toMySQLDateTime(periodEndTime),
        cancel_at_period_end: 0,
        canceled_at: null,
        trial_start: null,
        trial_end: null,
        created_at: toMySQLDateTime(currentTime),
        updated_at: toMySQLDateTime(currentTime)
      });
      const subscription = { insertId: subscriptionInsertId };

      function convertUTCtoMySQLDatetime(utcSeconds) {
        const date = new Date(utcSeconds * 1000);
        return date.toISOString().slice(0, 19).replace('T', ' ');
      }


      const [purchaseInsertId] = await knex('CreditPurchases').insert({
        username,
        id: Math.random().toString(36).substring(2, 10),
        name,
        email,
        walletAddress: " Bonus credits",
        transactionHash: transactionId,
        blockExplorerLink: "www.stripe.com/subscriptions",
        currency,
        amount: Math.floor(credits) / 2,
        cryptoAmount,
        rate,
        date: Date.now(),
        time: new Date().toISOString(),
        session_id,
        orderLoggingEnabled,
        userAgent,
        ip,
        credits: credits !== undefined && credits !== null ? Math.floor(credits) / 2 : 0,
        created_at: convertUTCtoMySQLDatetime(stripe_subscription_id),
        paymentMethod: "stripe_subscription",
        package: dollars + "$ " + planType + '_subscription'
      });
      const purchases = { insertId: purchaseInsertId };

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
        const bonusCredits = Math.floor(credits) / 2;

        // Update credits using userId (more reliable than username)
        await knex('userData')
          .where('id', userId)
          .update({
            credits: knex.raw('credits + ?', [bonusCredits]),
            accountType: planType
          });

        // Get updated balance
        const userRow = await knex('userData')
          .select('credits')
          .where('id', userId)
          .first();

        // Create wallet transaction record for subscription bonus credits
        await safeInsertWalletTransaction({
          id: require('crypto').randomUUID(),
          userId: userId,
          type: 'credit_purchase',
          amount: bonusCredits,
          balanceAfter: Number(userRow?.credits || 0),
          relatedPurchaseId: purchaseInsertId || null,
          description: `Subscription bonus credits - ${plan} plan`,
          created_at: knex.fn.now(),
        });
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

// ─── Drauwper routes (drops, contributions, reviews, etc.) ───
drauwperRoutes(server, pool, authenticateToken, PROXY, { storage, BUCKET_NAME, DEST_PREFIX });

// Serve banner uploads locally (dev fallback when GCS not configured)
server.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Admin panel (mounted before 404 catch-all) ───
const adminRouter = createAdminRouter({
  pool,
  analytics,
  logs,
  dbConfig,
  getLogFilePath: () => LOG_FILE,
});

server.use('/admin', adminRouter);

// 404 handler for undefined routes (MUST BE LAST!)
server.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  try {
    // Test database connection
    await knex.raw('SELECT 1');
    console.log('🚀 Express Server with MySQL is running on port', PORT);
    console.log('�️  Database: KeyChingDB (MySQL)');
    console.log('🌐 API Base URL: http://localhost:' + PORT + PROXY + '/api');
    // console.log('🐍 Python Service: python-service.cjs (direct child_process)');
    console.log('📋 Available endpoints:');
    console.log('   - GET /api/userData');
    // console.log('   - GET /api/createdKeys');
    // console.log('   - GET /api/unlocks/:username');
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

    syncStripeTransactionsCron(100).catch((err) => {
      console.error('Initial Stripe transaction sync error:', err.message || err);
    });
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
  await knex.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await knex.destroy();
  process.exit(0);
});


