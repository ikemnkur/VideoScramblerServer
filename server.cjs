require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const server = express();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'KeyChingDB',
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
server.post('/api/auth/login', async (req, res) => {
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
server.post('/api/user', async (req, res) => {
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

    if (user.accountType == 'seller') {
      const [earnings_db] = await pool.execute(
        'SELECT * FROM earnings WHERE username = ?',
        [username]
      );
      earnings = earnings_db;
    } else {
      const [unlocks_db] = await pool.execute(
        'SELECT * FROM unlocks WHERE email = ?',
        [email]
      );
      unlocks = unlocks_db;
    }


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

      if (user.accountType === 'seller') {
        res.json({
          success: true,
          user: userData,
          earnings: earnings,
          // token: token,
          message: 'Login successful'
        });
      } else {
        res.json({
          success: true,
          user: userData,
          unlocks: unlocks,
          // token: token,
          message: 'Login successful'
        });
      }

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
server.post('/api/auth/register', async (req, res) => {
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

    const newUser = {
      id: userId,
      loginStatus: true,
      lastLogin: currentDateTime,
      accountType: accountType || 'buyer',
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
server.post('/api/auth/logout', async (req, res) => {
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
server.get('/api/wallet/balance/:username', async (req, res) => {
  try {
    // const username = req.query.username || 'user_123'; // Default for demo
    const username = req.params.username;

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
server.get('/api/earnings/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const password = req.query.password;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const [users] = await pool.execute(
      'SELECT * FROM userData WHERE username = ?',
      [username]
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const [earnings] = await pool.execute(
      'SELECT * FROM unlocks WHERE sellerUsername = ?',
      [username]
    );

    console.log(`Earnings retrieved for user: ${username}`, earnings);

    res.json({ earnings });
  } catch (error) {
    console.error('Earnings retrieval error:', error);
    res.status(500).json({ error: 'Database error - earnings retrieval failed' });
  }
});

// Custom unlock key route
server.post('/api/unlock/:keyId', async (req, res) => {
  try {
    const keyId = req.params.keyId;

    const { username } = req.body;

    const [keys] = await pool.execute(
      'SELECT * FROM createdKeys WHERE id = ?',
      [keyId]
    );

    const key = keys[0];

    const [users] = await pool.execute(
      'SELECT * FROM userData WHERE username = ?',
      [username]
    );

    const user = users[0];


    if (key && key.available > 0) {
      // Simulate random key from available pool
      const keyVariations = [
        `${key.keyValue}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        `${key.keyValue.replace('ABCD', Math.random().toString(36).substring(2, 6).toUpperCase())}`,
        key.keyValue
      ];

      // const randomKey = keyVariations[Math.floor(Math.random() * keyVariations.length)];

      console.log(`Unlocking key ${keyId} for user:`, username);

      // Update availability
      await pool.execute(
        'UPDATE createdKeys SET available = available - 1, sold = sold + 1 WHERE id = ?',
        [keyId]
      );

      if (user.credits >= key.price) {
        // Update buyer credits
        await pool.execute(
          'UPDATE userData SET credits = credits - ? WHERE email = ?',
          [key.price, user.email]
        );
        // Update seller credits
        await pool.execute(
          'UPDATE userData SET credits = credits + ? WHERE email = ?',
          [key.price, key.email]
        );
      }

      // Create unlock record
      const transactionId = uuidv4();

      await pool.execute(
        'INSERT INTO unlocks (id, transactionId, username, email, date, time, credits, keyId, keyTitle, keyValue, sellerUsername, sellerEmail, price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          uuidv4(),
          transactionId,
          user.username, // Demo user
          user.email,
          Date.now(),
          new Date().toLocaleTimeString(),
          user.credits,
          key.keyId,
          key.keyTitle,
          // randomKey,
          key.keyValue,
          key.username,
          key.email,
          key.price,
          'Completed'
        ]
      );

      await CreateNotification(
        'key_purchased',
        'Key Unlocked: Key Purchase Successful',
        `User ${username} has unlocked a key: ${key.keyTitle}.`,
        'unlock',
        username || 'anonymous'
      );

      res.json({
        success: true,
        key: key.keyValue,
        transactionId: transactionId
      });
    } else {
      res.status(404).json({ success: false, message: 'Key not available or not found' });
    }
  } catch (error) {
    console.error('Unlock key error:', error);
    res.status(500).json({ success: false, message: 'Database error - unlock key failed' });
  }
});

// Custom route for seller listings
server.get('/api/seller/listings/:id', async (req, res) => {
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
server.get('/api/listings/:username', async (req, res) => {
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
server.put('/api/listings/:id', async (req, res) => {
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
server.delete('/api/listings/:id', async (req, res) => {
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
// const { data } = await api.post('/api/create-key', fd);


server.get('/api/createdKey/:id', async (req, res) => {
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
server.post('/api/create-key', async (req, res) => {
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
server.get('/api/notifications/:username', async (req, res) => {
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


server.post('/api/userData', async (req, res) => {
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
server.get('/api/purchases/:username', async (req, res) => {
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
server.get('/api/redemptions/:username', async (req, res) => {
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

server.post('/api/purchases/:username', async (req, res) => {
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



server.post('/api/lookup-transaction', async (req, res) => {

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
        [ transactionHash]
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




// example API startpoint usage in React:
// export const uploadTransactionScreenshot = async (formData) => {
//   try {
//     const res = await api.post('/upload/transaction-screenshot', formData, {
//       // Let Axios/browser set the multipart boundary automatically:
//       // headers: { 'Content-Type': undefined },  // <- clears any JSON default
//       //  headers: { 'Content-Type': 'multipart/form-data' },
//       headers: { 'Content-Type': 'application/json' },
//       transformRequest: [(data, headers) => {
//         // Remove any JSON defaults your instance might add
//         delete headers.common?.['Content-Type'];
//         delete headers.post?.['Content-Type'];
//         return data; // keep FormData as-is
//       }],
//     });
//     return res.data;
//   } catch (error) {
//     console.error('API - Error uploading transaction screenshot:', error);
//     throw error;
//   }
// };

// ######################## POST TRANSACTION SCREENSHOT ###############################
// todo: change the route below to /transaction-screenshot

const db = require('./config/db');
const path = require('path');
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
server.post('/api/upload/transaction-screenshot/:username/:txHash', async (req, res) => {
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
server.post('/api/profile-picture/:username', async (req, res) => {
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

// Custom route for user redemptions
server.post('/api/redemptions/:username', async (req, res) => {
  try {
    const username = req.params.username;
    [walletAddress, currency, credits] = req.body;

    const [users] = await pool.execute(
      'SELECT * FROM userData WHERE username = ?',
      [username]
    );

    const user = users[0];

    // const [wallets] = await pool.execute(
    //   'SELECT * FROM wallet WHERE username = ?',
    //   [username]
    // );


    // const wallet = wallets[0];

    // Update availability
    await pool.execute(
      'UPDATE wallet SET available = available - ? WHERE username = ?',
      [credits, username]
    );

    const [usersCredits] = await pool.execute(
      'SELECT credits FROM userData WHERE username = ?',
      [username]
    );

    const userCredits = usersCredits[0];

    const [redemptions] = await pool.execute(
      'SELECT * FROM redeemCredits WHERE username = ? ORDER BY date DESC',
      [username]
    );

    const [redemption] = await pool.execute(
      'INSERT INTO redemption (transactionId, username, email, date, time, credits, currency, walletAddress, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        transactionId,
        user.username, // Demo user
        user.email,
        Date.now(),
        new Date().toLocaleTimeString(),
        credits,
        currency,
        walletAddress,
        'Pending'
      ]
    );

    await CreateNotification(
      'redemption_status',
      'Credits Redemption Requested',
      `User ${username} has requested a redemption of ${credits} credits.`,
      'redemption',
      username || 'anonymous'
    );

    res.json(redemption);
  } catch (error) {
    console.error('Redemptions error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});



// Basic RESTful routes for all tables
server.get('/api/:table', async (req, res) => {
  try {
    const table = req.params.table;
    const allowedTables = ['userData', 'buyCredits', 'redeemCredits', 'earnings', 'unlocks', 'createdKeys', 'notifications', 'wallet', 'reports', 'supportTickets'];

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

server.get('/api/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const allowedTables = ['userData', 'buyCredits', 'redeemCredits', 'earnings', 'unlocks', 'notifications', 'wallet', 'reports', 'supportTickets'];

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

server.patch('/api/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const allowedTables = ['userData', 'buyCredits', 'redeemCredits', 'earnings', 'unlocks', 'createdKeys', 'notifications', 'wallet', 'reports', 'supportTickets'];

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



// Global error handler
server.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler for undefined routes
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
    console.log('🌐 API Base URL: http://localhost:' + PORT + '/api');
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
