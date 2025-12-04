require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
// const axios = require('axios');
const multer = require('multer');

// const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const util = require('util'); // Node.js utility for formatting arguments


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

// Middleware
// server.use(cors({
//   origin: process.env.FRONTEND_URL || '*',
//   credentials: true
// }));

// USE this CORS CONFIG Later

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5001',
      'https://key-ching.com',
      'https://microtrax.netlify.app',
      "https://servers4sqldb.uc.r.appspot.com",
      "https://orca-app-j32vd.ondigitalocean.app",
      "https://monkfish-app-mllt8.ondigitalocean.app/",
      "http://localhost:5173",
      "http://localhost:5174",
      "https://whale-app-trf6r.ondigitalocean.app",
      "http://142.93.82.161",
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
  optionsSuccessStatus: 200
};

server.use(cors(corsOptions));
// server.use(express.json());

const LOG_FILE = path.join(__dirname, 'universal.log');

// #################################################################################

// Ensure the log file is clear at startup for demonstration purposes (optional)
fs.writeFileSync(LOG_FILE, 'Server started at ' + new Date().toISOString() + '\n\n');

/**
 * Overrides standard console methods (log, warn, error) to capture output to a file.
 */
function overrideConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Helper function to format arguments and append to file
    const appendToFile = (level, ...args) => {
        // Use util.format to handle placeholders like %s, %d correctly
        const message = util.format(...args);
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} [${level.toUpperCase()}]: ${message}\n`;
        
        fs.appendFile(LOG_FILE, logEntry, (err) => {
            if (err) {
                // If file writing fails, use the original error console method
                originalError('Failed to write to log file:', err);
            }
        });
    };

    // Monkey-patch console.log
    console.log = function(...args) {
        appendToFile('info', ...args);
        originalLog.apply(console, args); // Also call the original console method to display in terminal
    };

    // Monkey-patch console.warn
    console.warn = function(...args) {
        appendToFile('warn', ...args);
        originalWarn.apply(console, args);
    };

    // Monkey-patch console.error
    console.error = function(...args) {
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


// Endpoint to fetch and display the raw logs
server.get('/logs', (req, res) => {
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


// ###########################################################

server.use(express.json({ limit: '10mb' }));
server.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Admin Dashboard Page
// // Data storage for admin page
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

// Request logging middleware
server.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Root route
server.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
server.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

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
      const token = Buffer.from(`${user.id}_${Date.now()}_${Math.random()}`).toString('base64');

      res.json({
        success: true,
        user: userData,
        token: token,
        message: 'Login successful'
      });
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
    let earnings = [];
    let unlocks = [];

    // if (user.accountType == 'seller') {
    //   const [earnings_db] = await pool.execute(
    //     'SELECT * FROM earnings WHERE username = ?',
    //     [username]
    //   );
    //   earnings = earnings_db;
    // } else {
    // const [unlocks_db] = await pool.execute(
    //   'SELECT * FROM unlocks WHERE email = ?',
    //   [email]
    // );
    // unlocks = unlocks_db;

    const [action_db] = await pool.execute(
      'SELECT * FROM actions WHERE email = ?',
      [email]
    );
    actions = action_db;
    // }


    // const unlock = unlocks[0];

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

      // await pool.execute(
      //   'UPDATE userData SET loginStatus = true, lastLogin = ? WHERE email = ?',
      //   [currentDateTime, email]
      // );

      // Generate a proper JWT-like token (in production, use actual JWT)
      // const token = Buffer.from(`${user.id}_${Date.now()}_${Math.random()}`).toString('base64');

      // if (user.accountType === 'seller') {
      //   res.json({
      //     success: true,
      //     user: userData,
      //     earnings: earnings,
      //     // token: token,
      //     message: 'Login successful'
      //   });
      // } else {
      res.json({
        success: true,
        user: userData,
        unlocks: actions,
        // token: token,
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

// Configure nodemailer with your SMTP settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'your-email@example.com',
    pass: process.env.SMTP_PASS || 'your-password'
  }
});

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
          <p>Your password has been reset by an administrator.</p>
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
server.post(PROXY + '/api/wallet/balance/:username', async (req, res) => {
  try {
    // const username = req.query.username || 'user_123'; // Default for demo
    const username = req.params.username;
    const password = req.body.password;
    const email = req.body.email;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // const [wallets] = await pool.execute(
    //   'SELECT * FROM wallet WHERE username = ?',
    //   [username]
    // );

    const [users] = await pool.execute(
      'SELECT credits FROM userData WHERE username = ?',
      [username]
    );



    const user = users[0];

    if (user) {
      res.json({
        balance: user.credits,
        credits: user.credits,
      });
    } else {
      res.json({ balance: 750, credits: 750 }); // Default demo values
    }
  } catch (error) {
    console.error('Wallet balance error:', error);
    res.status(500).json({ error: 'Database error - wallet balance retrieval failed' });
  }
});

//  const response = await fetch(`${API_URL}/api/earnings/${username}?password=${localStorage.getItem("passwordtxt")}`);
// server.get(PROXY+'/api/earnings/:username', async (req, res) => {
//   try {
//     const username = req.params.username;
//     const password = req.query.password;

//     if (!username) {
//       return res.status(400).json({ error: 'Username is required' });
//     }

//     const [users] = await pool.execute(
//       'SELECT * FROM userData WHERE username = ?',
//       [username]
//     );
//     const user = users[0];

//     if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
//       return res.status(401).json({ error: 'Invalid username or password' });
//     }

//     const [earnings] = await pool.execute(
//       'SELECT * FROM unlocks WHERE sellerUsername = ?',
//       [username]
//     );

//     console.log(`Earnings retrieved for user: ${username}`, earnings);

//     res.json({ earnings });
//   } catch (error) {
//     console.error('Earnings retrieval error:', error);
//     res.status(500).json({ error: 'Database error - earnings retrieval failed' });
//   }
// });

// Todo: Implement spend credits functionality, replace old and borrow function unlock with spend

// Custom unlock key route
// spend credits route
server.post(PROXY + '/api/spend-credits', async (req, res) => {
  try {
    
    const { username, action } = req.body;

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
      'INSERT INTO actions (id, transactionId, username, email, date, time, credits, action_type, action_cost, action_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
        action.description || ''
      ]
    );

    await CreateNotification(
      'key_purchased',
      'Key Unlocked: Key Purchase Successful',
      `User ${username} has spent ${cost} credits to: ${action.description || 'purchase'}.`,
      'unlock',
      username || 'anonymous'
    );

    res.json({
      success: true,
      transactionId: transactionId,
      credits: updatedCredits,
      message: 'Credits spent successfully'
    });

  } catch (error) {
    console.error('Unlock key error:', error);
    res.status(500).json({ success: false, message: 'Database error - unlock key failed' });
  }
});

// Custom route for seller listings
server.get(PROXY + '/api/seller/listings/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const [keys] = await pool.execute(
      'SELECT * FROM createdKeys WHERE id = ?',
      [parseInt(id)]
    );

    const key = keys[0];

    if (key) {
      res.json(key);
    } else {
      res.status(404).json({ error: 'Listing not found' });
    }
  } catch (error) {
    console.error('Seller listing error:', error);
    res.status(500).json({ error: 'Database error - seller listing retrieval failed' });
  }
});


// Custom route for user-specific listings
server.get(PROXY + '/api/listings/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const [listings] = await pool.execute(
      'SELECT * FROM createdKeys WHERE username = ? ORDER BY creationDate DESC',
      [username]
    );
    res.json(listings);
  } catch (error) {
    console.error('User listings error:', error);
    res.status(500).json({ error: 'Database error - user listings retrieval failed' });
  }
});

// Custom route for editing a key listing
server.put(PROXY + '/api/listings/:id', async (req, res) => {
  try {
    const listingId = req.params.id;
    const {
      keyTitle,
      description,
      price,
      tags,
      expirationDate,
      isActive
    } = req.body;

    // First, verify the listing exists and get current data
    const [currentListing] = await pool.execute(
      'SELECT * FROM createdKeys WHERE id = ?',
      [listingId]
    );

    if (currentListing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    const listing = currentListing[0];

    // Prepare update data (only update provided fields)
    const updateData = {};
    const updateFields = [];
    const updateValues = [];

    if (keyTitle !== undefined) {
      updateData.keyTitle = keyTitle;
      updateFields.push('keyTitle = ?');
      updateValues.push(keyTitle);
    }

    if (description !== undefined) {
      updateData.description = description;
      updateFields.push('description = ?');
      updateValues.push(description);
    }

    if (price !== undefined) {
      updateData.price = parseInt(price);
      updateFields.push('price = ?');
      updateValues.push(parseInt(price));
    }

    if (tags !== undefined) {
      const processedTags = Array.isArray(tags) ? tags :
        (typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : []);
      updateData.tags = JSON.stringify(processedTags);
      updateFields.push('tags = ?');
      updateValues.push(JSON.stringify(processedTags));
    }

    if (expirationDate !== undefined) {
      updateData.expirationDate = expirationDate;
      updateFields.push('expirationDate = ?');
      updateValues.push(expirationDate);
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
      updateFields.push('isActive = ?');
      updateValues.push(isActive);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
    }

    // Add updatedAt timestamp
    updateFields.push('updatedAt = ?');
    updateValues.push(Date.now());

    // Build and execute update query
    const updateQuery = `UPDATE createdKeys SET ${updateFields.join(', ')} WHERE id = ?`;
    updateValues.push(listingId);

    await pool.execute(updateQuery, updateValues);

    // Get updated listing
    const [updatedListing] = await pool.execute(
      'SELECT * FROM createdKeys WHERE id = ?',
      [listingId]
    );

    res.json({
      success: true,
      listing: updatedListing[0],
      message: 'Listing updated successfully'
    });

  } catch (error) {
    console.error('Update listing error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error occurred while updating listing'
    });
  }
});

// Custom route for deleting a key listing
server.delete(PROXY + '/api/listings/:id', async (req, res) => {
  try {
    const listingId = req.params.id;
    const { username } = req.body; // For security, verify ownership

    // First, verify the listing exists and check ownership
    const [listing] = await pool.execute(
      'SELECT * FROM createdKeys WHERE id = ?',
      [listingId]
    );

    if (listing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }

    // Verify ownership (optional security check)
    if (username && listing[0].username !== username) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own listings'
      });
    }

    // Check if any keys have been sold
    if (listing[0].sold > 0) {
      // If keys have been sold, just deactivate instead of deleting
      await pool.execute(
        'UPDATE createdKeys SET isActive = false WHERE id = ?',
        [listingId]
      );

      res.json({
        success: true,
        message: 'Listing deactivated successfully (some keys were already sold)'
      });
    } else {
      // If no keys sold, completely delete the listing
      await pool.execute(
        'DELETE FROM createdKeys WHERE id = ?',
        [listingId]
      );

      res.json({
        success: true,
        message: 'Listing deleted successfully'
      });
    }

  } catch (error) {
    console.error('Delete listing error:', error);
    res.status(500).json({
      success: false,
      message: 'Database error occurred while deleting key listing'
    });
  }
});



// const fd = new FormData();
//     fd.append('title', title);
//     fd.append('price_credits', price);
//     fd.append('username', userData?.username || 'user_123');
//     fd.append('email', userData?.email || '');
//     fd.append('keys_available', keysAvailable);
//     if (expirationDays) fd.append('expiration_days', expirationDays);
//     if (description) fd.append('description', description);

//     if (uploadMethod === 'text' && keyText.trim()) {
//       const blob = new Blob([keyText], { type: 'text/plain' });
//       const textFile = new File([blob], 'keys.txt', { type: 'text/plain' });
//       fd.append('file', textFile);
//     } else if (file) {
//       fd.append('file', file);
//     }
// const { data } = await api.post(PROXY+'/api/create-key', fd);


server.get(PROXY + '/api/createdKey/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [keys] = await pool.execute(
      'SELECT * FROM createdKeys WHERE id = ?',
      [id]
    );
    // obscure the key value for security

    // get profilepic of the seller from userData table
    const [userData] = await pool.execute(
      'SELECT profilePicture FROM userData WHERE username = ?',
      [keys[0].username]
    );

    let key = keys[0];
    // key.profilePic = userData.length > 0 ? userData[0].profilePicture : null;
    key.profilePic = userData[0].profilePicture;
    console.log("Seller profile pic:", key.profilePic);

    key.keyValue = JSON.stringify(["****-****-****-****"]);

    res.json({
      success: true,
      key
    });
  } catch (error) {
    console.error('Error fetching key:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching key'
    });
  }
});

// Custom route for create key
server.post(PROXY + '/api/create-key', async (req, res) => {
  try {
    const {
      title,
      price_credits,
      email,
      username,
      file,
      description,
      tags,
      encryptionKey,
      keys_available,
      expiration_days
    } = req.body;

    console.log('Creating key with data:', {
      title,
      price_credits,
      email,
      username,
      file,
      description,
      tags,
      encryptionKey,
      keys_available,
      expiration_days
    });

    // Validate required fields
    if (!title || !price_credits || !file) {
      return res.status(400).json({
        success: false,
        message: 'Title, price, and keys are required'
      });
    }

    // Process the keys from file content
    const keysArray = file.split('\n')
      .map(key => key.trim())
      .filter(key => key.length > 0);

    if (keysArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid keys found in the provided content'
      });
    }

    const quantity = keys_available || keysArray.length;

    // Calculate expiration date if provided
    let expirationDate = null;
    if (expiration_days && expiration_days > 0) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + Number(expiration_days));
      expirationDate = expDate.toISOString().slice(0, 19).replace('T', ' ');
    } else {
      expirationDate = null;
    }

    // Simulate file processing with a short delay
    // setTimeout(async () => {
    try {
      const keyId = `key_${Date.now()}`;
      // Generate a unique id for the primary key (VARCHAR(10))
      const id = Math.random().toString(36).substring(2, 12).toUpperCase();

      // Process tags
      let processedTags = [];
      if (Array.isArray(tags)) {
        processedTags = tags;
      } else if (typeof tags === 'string') {
        processedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      }
      await pool.execute(
        'INSERT INTO createdKeys (id, keyId, username, email, keyTitle, keyValue, description, price, quantity, sold, available, creationDate, expirationDate, isActive, isReported, reportCount, encryptionKey, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          keyId,
          username || 'demo_seller',
          email || 'seller@example.com',
          title || 'New Key Listing',
          JSON.stringify(keysArray), // Store all keys as JSON array
          description || 'No description provided.',
          parseInt(price_credits) || 100,
          quantity,
          0,
          quantity,
          Date.now(),
          expirationDate === null ? Date.now() + (24 * 60 * 60 * 1000 * expiration_days) : expirationDate,
          true,
          false,
          0,
          encryptionKey || `enc_key_${Date.now()}`,
          JSON.stringify(processedTags)

        ]
      );


      await CreateNotification(
        'info',
        'New Key Listing Created',
        `A new key listing titled "${title}" has been created.`,
        'seller',
        username || 'demo_seller'
      );

      res.json({
        success: true,
        uploadId: keyId,
        keysProcessed: keysArray.length,
        message: `Successfully uploaded ${keysArray.length} keys`
      });
    } catch (error) {
      console.error('Create key database error:', error);
      res.status(500).json({
        success: false,
        message: 'Database error occurred while creating key listing'
      });
    }
    // }, 1000);
  } catch (error) {
    console.error('Create key outer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error occurred while processing request'
    });
  }
});

// Custom route for user notifications
server.get(PROXY + '/api/notifications/:username', async (req, res) => {
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
server.get(PROXY + '/api/redemptions/:username', async (req, res) => {
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

server.post(PROXY + '/api/purchases/:username', async (req, res) => {
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
          'INSERT into buyCredits (username, id, name, email, walletAddress, transactionHash, blockExplorerLink, currency, amount, cryptoAmount, rate, date, time, session_id, orderLoggingEnabled, userAgent, ip, credits) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            username,
            Math.random().toString(36).substring(2, 10),
            name,
            email,
            walletAddress,
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
          'Credits Purchase Logged',
          `A new purchase has been logged for user ${username}.`,
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
server.post(PROXY + '/api/upload/transaction-screenshot/:username/:txHash', async (req, res) => {
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
server.post(PROXY + '/api/profile-picture/:username', async (req, res) => {
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

// // Custom route for user redemptions
// server.post(PROXY+'/api/redemptions/:username', async (req, res) => {
//   try {
//     const username = req.params.username;
//     [walletAddress, currency, credits] = req.body;

//     const [users] = await pool.execute(
//       'SELECT * FROM userData WHERE username = ?',
//       [username]
//     );

//     const user = users[0];

//     // const [wallets] = await pool.execute(
//     //   'SELECT * FROM wallet WHERE username = ?',
//     //   [username]
//     // );


//     // const wallet = wallets[0];

//     // Update availability
//     await pool.execute(
//       'UPDATE wallet SET available = available - ? WHERE username = ?',
//       [credits, username]
//     );

//     const [usersCredits] = await pool.execute(
//       'SELECT credits FROM userData WHERE username = ?',
//       [username]
//     );

//     const userCredits = usersCredits[0];

//     const [redemptions] = await pool.execute(
//       'SELECT * FROM redeemCredits WHERE username = ? ORDER BY date DESC',
//       [username]
//     );

//     const [redemption] = await pool.execute(
//       'INSERT INTO redemption (transactionId, username, email, date, time, credits, currency, walletAddress, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
//       [
//         transactionId,
//         user.username, // Demo user
//         user.email,
//         Date.now(),
//         new Date().toLocaleTimeString(),
//         credits,
//         currency,
//         walletAddress,
//         'Pending'
//       ]
//     );

//     await CreateNotification(
//       'redemption_status',
//       'Credits Redemption Requested',
//       `User ${username} has requested a redemption of ${credits} credits.`,
//       'redemption',
//       username || 'anonymous'
//     );

//     res.json(redemption);
//   } catch (error) {
//     console.error('Redemptions error:', error);
//     res.status(500).json({ error: 'Database error' });
//   }
// });



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

    // Call stored procedure to save or update fingerprint
    const [result] = await pool.execute(
      'CALL save_device_fingerprint(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

    // The stored procedure returns the saved/updated record
    const savedFingerprint = result[0][0];

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
server.get(PROXY + '/api/fingerprint/user/:userId', async (req, res) => {
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
server.get(PROXY + '/api/fingerprint/details/:hash', async (req, res) => {
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
server.post(PROXY + '/api/fingerprint/unscramble/:hash', async (req, res) => {
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
server.post(PROXY + '/api/fingerprint/leaked/:hash', async (req, res) => {
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
server.patch(PROXY + '/api/fingerprint/block/:id', async (req, res) => {
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
server.get(PROXY + '/api/fingerprint/stats', async (req, res) => {
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


// server.post(PROXY+'/api/flask-python/upload', (req, res) => {
//   // Proxy the request to the Flask app
//   const axios = require('axios');
//   const FormData = require('form-data');
//   const form = new FormData();

//   form.append('file', req.files.file.data, req.files.file.name);



//   // if the user has enough credits, proceed to upload
//   // 
//   // Use multer to save image locally first


//   const upload = multer({ dest: 'python/inputs' });



//   upload.single('file')(req, res, (err) => {
//     if (err) {
//       return res.status(500).json({ error: 'Failed to save file locally' });
//     }

//     // send the filename to the Flask app
//     const localFilePath = req.file.path;
//     const localFileName = req.file.filename;

//     form.append('file', fs.createReadStream(localFilePath), localFileName);

//     axios.post(`${FLASKAPP_LINK}/scramble-photo`, form, {
//       headers: form.getHeaders()
//     })
//       .then(response => {
//         res.json(response.data);
//       })
//       .catch(error => {
//         console.error('Error uploading to Flask app:', error);
//         res.status(500).json({ error: 'Failed to upload file to Python service' });
//       });
//   });

//     .then(response => {
//       res.json(response.data);
//     })

//     .catch(error => {
//       console.error('Error uploading to Flask app:', error);
//       res.status(500).json({ error: 'Failed to upload file to Python service' });
//     });
// });

// Below is the Python Flask app code (for reference, not part of server.cjs)

// from flask import Flask, request, send_from_directory, jsonify, current_app
// from werkzeug.utils import secure_filename
// import os
// import subprocess

// @app.route('/upload', methods=['POST'])
// def upload_file():
//     if 'file' not in request.files:
//         return jsonify({'error': 'No file part'}), 400

//     file = request.files['file']
//     if file.filename == '':
//         return jsonify({'error': 'No selected file'}), 400

//     if file and allowed_file(file.filename):
//         filename = secure_filename(file.filename)
//         file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
//         file.save(file_path)
//         return jsonify({
//             'message': 'File uploaded successfully',
//             'filename': filename,
//             'download_url': f'/download/{filename}'
//         }), 200
//     else:
//         return jsonify({'error': 'File type not allowed'}), 400


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


// @app.route('/download/<path:filename>')
// def download_file(filename):
//     # Construct the absolute path to the upload folder for security
//     # send_from_directory ensures the requested filename is within this directory
//     # protecting against directory traversal attacks.
//     directory = os.path.join(current_app.root_path, app.config['UPLOAD_FOLDER'])
//     return send_from_directory(
//         directory, 
//         filename, 
//         as_attachment=True # Forces the browser to download the file
//     )




// @app.route('/files')
// def list_files():
//     """List all available files for download"""
//     try:
//         files = os.listdir(app.config['UPLOAD_FOLDER'])
//         files = [f for f in files if os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], f))]
//         return jsonify({'files': files}), 200
//     except Exception as e:
//         return jsonify({'error': str(e)}), 500



// server.post(PROXY+'/api/scramble-photo', (req, res) => {


//   // Proxy the request to the Flask app
//   const axios = require('axios');


//   const FormData = require('form-data');
//   const form = new FormData();

//   // this may not work as req.files may be undefined
//   // form.append('file', req.files.file.data, req.files.file.name);

//   const parameters = req.body.params;
//   console.log("Parameters received for scrambling:", parameters);

//   const formData = req.body.formData;

//   // There is a image file stored in this formData under 'file' key
//   form.append('file', formData.file.data, formData.file.name);

//   for (const [key, value] of Object.entries(formData)) {
//     form.append(key, value);
//   }

//   // if the user has enough credits, proceed to upload
//   if (userHasEnoughCredits(req.user, formData)) {
//     // no nothing here for now
//   }

//   // Use multer to save image locally first
//   const upload = multer({ dest: 'python/inputs' });


//   // Store image in the 'python/inputs' folder
//   let localFilePath = '';
//   let localFileName = '';

//   upload.single('file')(req, res, (err) => {
//     if (err) {
//       return res.status(500).json({ error: 'Failed to save file locally' });
//     }

//     console.log("File saved locally:", req.file);

//     localFilePath = req.file.path;
//     localFileName = req.file.filename;

//     // form.append('file', fs.createReadStream(localFilePath), localFileName); 

//   });


//   // Proceed to scramble

//   axios.post(`${FLASKAPP_LINK}/scramble-photo`, {
//     localFileName: localFileName,
//     localFilePath: localFilePath,
//     params: parameters,
//   })

//   // it should return a successful response from Flask app with scrambled photos name and path'
//     .then(response => {
//       res.json(response.data);
//       console.log("Scramble photo response:", response.data);
//       // the scrambled image/photo link should be in response.data, it is publicly accessible so the front end can use it directly download the modified image
//     })
//     .catch(error => {
//       console.error('Error scrambling photo in Flask app:', error);
//       res.status(500).json({ error: 'Failed to scramble photo in Python service' });
//     });


// });


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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// =============================
// SCRAMBLE PHOTO ENDPOINT
// =============================
// server.post(PROXY+'/api/scramble-photo', upload.single('file'), async (req, res) => {
//   console.log('📸 Scramble photo request received');

//   try {
//     // Check if file was uploaded
//     if (!req.file) {
//       return res.status(400).json({ error: 'No image file provided' });
//     }

//     console.log('✅ File uploaded:', req.file.filename);
//     console.log('📁 File path:', req.file.path);

//     // Parse parameters from request body
//     let params;
//     try {
//       params = typeof req.body.params === 'string' 
//         ? JSON.parse(req.body.params) 
//         : req.body.params;
//     } catch (parseError) {
//       console.error('❌ Failed to parse parameters:', parseError);
//       return res.status(400).json({ error: 'Invalid parameters format' });
//     }

//     console.log('📋 Scrambling parameters:', params);

//     // Optional: Check user credits (if authentication is implemented)
//     // if (req.user) {
//     //   const [users] = await pool.execute(
//     //     'SELECT credits FROM userData WHERE id = ?',
//     //     [req.user.id]
//     //   );
//     //   if (users[0] && users[0].credits < 1) {
//     //     return res.status(403).json({ error: 'Insufficient credits' });
//     //   }
//     // }

//     // Prepare data to send to Flask
//     const flaskPayload = {
//       localFileName: req.file.filename,
//       localFilePath: req.file.path,
//       params: params
//     };

//     console.log('🔄 Sending to Flask service:', FLASKAPP_LINK + '/scramble-photo');

//     // Send request to Flask/Python service
//     const flaskResponse = await axios.post(
//       `${FLASKAPP_LINK}/scramble-photo`,
//       flaskPayload,
//       {
//         timeout: 30000, // 30 second timeout
//         headers: {
//           'Content-Type': 'application/json'
//         }
//       }
//     );

//     console.log('✅ Flask response received:', flaskResponse.data);

//     // Optional: Deduct credits after successful scrambling
//     // if (req.user) {
//     //   await pool.execute(
//     //     'UPDATE userData SET credits = credits - 1 WHERE id = ?',
//     //     [req.user.id]
//     //   );
//     // }

//     // Return Flask response to frontend
//     res.json({
//       success: true,
//       output_file: flaskResponse.data.output_file || flaskResponse.data.scrambledFileName,
//       scrambledImageUrl: flaskResponse.data.scrambledImageUrl,
//       message: 'Image scrambled successfully',
//       ...flaskResponse.data
//     });

//   } catch (error) {
//     console.error('❌ Error in scramble-photo endpoint:', error);

//     // Clean up uploaded file if processing failed
//     if (req.file && fs.existsSync(req.file.path)) {
//       try {
//         fs.unlinkSync(req.file.path);
//         console.log('🗑️  Cleaned up failed upload:', req.file.filename);
//       } catch (unlinkError) {
//         console.error('Failed to delete file:', unlinkError);
//       }
//     }

//     if (error.code === 'ECONNREFUSED') {
//       return res.status(503).json({ 
//         error: 'Python/Flask service is not running. Please start the Flask server on port 5000.' 
//       });
//     }

//     if (error.response) {
//       // Flask returned an error
//       return res.status(error.response.status || 500).json({ 
//         error: error.response.data?.error || 'Scrambling failed in Python service',
//         details: error.response.data
//       });
//     }

//     res.status(500).json({ 
//       error: 'Failed to scramble photo',
//       message: error.message 
//     });
//   }
// });

// =============================
// SCRAMBLE PHOTO ENDPOINT
// =============================

server.post(PROXY + '/api/scramble-photo', upload.single('file'), async (req, res) => {
  console.log('📸 Scramble photo request received');

  try {
    // 1) Make sure a file came in
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
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
      max_intensity_shift: params.max_intensity_shift
    };

    // Remove undefined keys so Flask doesn’t see them at all
    Object.keys(flaskPayload).forEach((key) => {
      if (flaskPayload[key] === undefined) delete flaskPayload[key];
    });

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
// UNSCRAMBLE PHOTO ENDPOINT
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

    console.log('📋 Unscrambling parameters:', params);

    // Prepare data to send to Flask
    const flaskPayload = {
      localFileName: req.file.filename,
      localFilePath: req.file.path,
      params: params
    };

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

    // Return Flask response to frontend
    res.json({
      success: true,
      output_file: flaskResponse.data.output_file || flaskResponse.data.unscrambledFileName,
      unscrambledImageUrl: flaskResponse.data.unscrambledImageUrl,
      message: 'Image unscrambled successfully',
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

// @app.route('/scramble-photo', methods=['POST'])
// def scramble_photo():
//     """
//     Scramble a photo using various algorithms
//     Expects JSON with: input, output, seed, mode, algorithm, and algorithm-specific params
//     """
//     try:
//         data = request.json
//         if not data:
//             return jsonify({'error': 'No JSON data provided'}), 400

//         # Extract common parameters
//         input_file = data.get('input')
//         output_file = data.get('output')
//         seed = data.get('seed', 123456)
//         mode = data.get('mode', 'scramble')
//         algorithm = data.get('algorithm', 'position')
//         percentage = data.get('percentage', 100)

//         if not input_file or not output_file:
//             return jsonify({'error': 'input and output filenames required'}), 400

//         # Build file paths
//         input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_file)
//         output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_file)

//         if not os.path.exists(input_path):
//             return jsonify({'error': f'Input file {input_file} not found'}), 404

//         # Build command based on algorithm
//         cmd = []

//         if algorithm == 'position':
//             # Position scrambling (default tile shuffling)
//             rows = data.get('rows', 6)
//             cols = data.get('cols', 6)
//             cmd = [
//                 'python3', 'scramble_photo.py',
//                 '--input', input_path,
//                 '--output', output_path,
//                 '--seed', str(seed),
//                 '--rows', str(rows),
//                 '--cols', str(cols),
//                 '--mode', mode,
//                 '--percentage', str(percentage)
//             ]

//         elif algorithm == 'color':
//             # Color scrambling (hue shifting)
//             max_hue_shift = data.get('max_hue_shift', 64)
//             cmd = [
//                 'python3', 'scramble_photo.py',
//                 '--input', input_path,
//                 '--output', output_path,
//                 '--algorithm', 'color',
//                 '--max-hue-shift', str(max_hue_shift),
//                 '--seed', str(seed),
//                 '--mode', mode,
//                 '--percentage', str(percentage)
//             ]

//         elif algorithm == 'rotation':
//             # Rotation scrambling
//             rows = data.get('rows', 6)
//             cols = data.get('cols', 6)
//             cmd = [
//                 'python3', 'scramble_photo_rotate.py',
//                 '--input', input_path,
//                 '--output', output_path,
//                 '--seed', str(seed),
//                 '--rows', str(rows),
//                 '--cols', str(cols),
//                 '--mode', mode,
//                 '--algorithm', 'rotation',
//                 '--percentage', str(percentage)
//             ]

//         elif algorithm == 'mirror':
//             # Mirror scrambling
//             rows = data.get('rows', 6)
//             cols = data.get('cols', 6)
//             cmd = [
//                 'python3', 'scramble_photo_mirror.py',
//                 '--input', input_path,
//                 '--output', output_path,
//                 '--seed', str(seed),
//                 '--rows', str(rows),
//                 '--cols', str(cols),
//                 '--mode', mode,
//                 '--algorithm', 'mirror',
//                 '--percentage', str(percentage)
//             ]

//         elif algorithm == 'intensity':
//             # Intensity scrambling
//             max_intensity_shift = data.get('max_intensity_shift', 128)
//             cmd = [
//                 'python3', 'scramble_photo_intensity.py',
//                 '--input', input_path,
//                 '--output', output_path,
//                 '--algorithm', 'intensity',
//                 '--max-intensity-shift', str(max_intensity_shift),
//                 '--seed', str(seed),
//                 '--mode', mode,
//                 '--percentage', str(percentage)
//             ]

//         else:
//             return jsonify({'error': f'Unknown algorithm: {algorithm}'}), 400

//         # Execute the scrambling command
//         result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

//         if result.returncode != 0:
//             return jsonify({
//                 'error': 'Scrambling failed',
//                 'details': result.stderr
//             }), 500

//         # Check if output file was created
//         if not os.path.exists(output_path):
//             return jsonify({'error': 'Output file was not created'}), 500

//         return jsonify({
//             'message': 'Photo scrambled successfully',
//             'output_file': output_file,
//             'algorithm': algorithm,
//             'seed': seed,
//             'download_url': f'/download/{output_file}'
//         }), 200

//     except subprocess.TimeoutExpired:
//         return jsonify({'error': 'Scrambling operation timed out'}), 500
//     except Exception as e:
//         return jsonify({'error': str(e)}), 500



server.post(PROXY + '/api/unscramble-photo', (req, res) => {
  // Proxy the request to the Flask app
  const axios = require('axios');
  const FormData = require('form-data');
  const form = new FormData();
  axios.post(`${FLASKAPP_LINK}/unscramble-photo`, req.body)
    .then(response => {
      res.json(response.data);
    })
    .catch(error => {
      console.error('Error unscrambling photo in Flask app:', error);
      res.status(500).json({ error: 'Failed to unscramble photo in Python service' });
    });
});

// @app.route('/unscramble-photo', methods=['POST'])
// def unscramble_photo():
//     """
//     Unscramble a photo using the same algorithms
//     Expects JSON with: input, output, seed, algorithm, and algorithm-specific params
//     """
//     try:
//         data = request.json
//         if not data:
//             return jsonify({'error': 'No JSON data provided'}), 400

//         # Set mode to unscramble
//         data['mode'] = 'unscramble'

//         # Reuse the scramble_photo logic
//         return scramble_photo()

//     except Exception as e:
//         return jsonify({'error': str(e)}), 500

// if __name__ == '__main__':
//     # Use the development server only for testing, not production on a VPS
//     app.run(host='0.0.0.0', port=5000)


// Photo leak detection endpoint
server.post(PROXY + '/api/check-photo-leak', async (req, res) => {
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

// Video leak detection endpoint
server.post(PROXY + '/api/check-video-leak', async (req, res) => {
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

// ========================================
// Stripe Subscription Endpoints
// ========================================

// const FRONTEND_URL = 'http://localhost:5174';
const FRONTEND_URL = process.env.FLASKAPP_LINK || 'http://localhost:5174';

// Initialize Stripe
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


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



// Webhook handler for asynchronous events.
server.post("/webhook", async (req, res) => {
  let data;
  let eventType;
  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers["stripe-signature"];

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    // Extract the object from the event.
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "checkout.session.completed") {
    console.log(`🔔  Payment received!`);
  }

  res.sendStatus(200);
});

// Stripe webhook handler
server.post(PROXY + '/api/subscription/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

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
      await pool.execute(
        `UPDATE subscriptions 
         SET status = ?, current_period_start = ?, current_period_end = ? 
         WHERE stripe_subscription_id = ?`,
        [
          updatedSubscription.status,
          new Date(updatedSubscription.current_period_start * 1000),
          new Date(updatedSubscription.current_period_end * 1000),
          updatedSubscription.id
        ]
      );
      console.log(`✅ Subscription updated: ${updatedSubscription.id}`);
      break;
    case 'customer.subscription.created':
      console.log('Subscription created event received.');
      const subscription = event.data.object;
      await pool.execute(
        `UPDATE subscriptions 
         SET status = ?, current_period_start = ?, current_period_end = ? 
         WHERE stripe_subscription_id = ?`,
        [
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
          subscription.id
        ]
      );

      let data = {
        "subscription_type": subtype,
        "subscription_cost": subcost,
        "username": username,
        "userId": userId,
        "name": name,
        "email": email,
        "transactionId": transactionId,
      };

      stripeBuycredits(data);
      console.log(`✅ Subscription created: ${subscription.id}`);
      break;

    case 'customer.subscription.deleted':
      console.log('Subscription deleted event received.');
      const deletedSub = event.data.object;
      await pool.execute(
        'UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?',
        ['canceled', deletedSub.id]
      );
      console.log(`✅ Subscription cancelled: ${deletedSub.id}`);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
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
      ip
    } = data;
    // = req.body.data;  // <-- Changed from req.body to req.body.data

    console.log('Logging purchase data:', req.body);

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
        return res.status(400).json({ error: 'Duplicate transaction ID' });
      }
    }


    // Basic validation
    try {

      const crypto = currency
      const txHash = transactionId;
      const senderAddress = walletAddress;


      // if (result.success) {
      const [purchases] = await pool.execute(
        'INSERT into buyCredits (username, id, name, email, walletAddress, transactionHash, blockExplorerLink, currency, amount, cryptoAmount, rate, date, time, session_id, orderLoggingEnabled, userAgent, ip, credits) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          username,
          Math.random().toString(36).substring(2, 10),
          name,
          email,
          walletAddress,
          transactionId,
          "Stripe",
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
        'Credits Purchase Logged',
        `A new purchase has been logged for user ${username}.`,
        'purchase',
        username || 'anonymous'
      );

      res.json(purchases);
      // } else {
      //   // invladid transaction
      //   return res.status(400).json({ error: 'Transaction verification failed: ' + result.error });
      // }
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


