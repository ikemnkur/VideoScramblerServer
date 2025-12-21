#!/usr/bin/env node

/**
 * MySQL to MongoDB Conversion Script
 * This script contains all the conversions needed for server.cjs
 * 
 * Usage: Review each section and apply the changes to your server.cjs file
 */

console.log('='.repeat(80));
console.log('MySQL to MongoDB Conversion Reference');
console.log('='.repeat(80));
console.log('\n1. PACKAGE INSTALLATION\n');

console.log(`
# Remove MySQL
npm uninstall mysql2

# Install MongoDB
npm install mongodb

# Your package.json should include:
"mongodb": "^6.0.0"
`);

console.log('\n2. IMPORT CHANGES\n');

console.log(`
// OLD
const mysql = require('mysql2/promise');

// NEW
const { MongoClient, ObjectId } = require('mongodb');
`);

console.log('\n3. CONNECTION SETUP\n');

console.log(`
// OLD MySQL Connection
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'video-scrambler'
});

// NEW MongoDB Connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'video-scrambler';
let db, client;

async function connectToMongoDB() {
  try {
    client = new MongoClient(mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db(dbName);
    console.log('✅ Connected to MongoDB');
    
    // Create indexes
    await db.collection('userData').createIndex({ email: 1 }, { unique: true });
    await db.collection('userData').createIndex({ username: 1 }, { unique: true });
    
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

connectToMongoDB().catch(console.error);
`);

console.log('\n4. ALL ROUTE CONVERSIONS\n');
console.log('='.repeat(80));

console.log(`
// ============================================================================
// LOGIN ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  const [users] = await pool.execute(
    'SELECT * FROM userData WHERE email = ?',
    [email]
  );
  const user = users[0];
  
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  
  const isValid = await bcrypt.compare(password, user.passwordHash);
  
  if (isValid) {
    await pool.execute(
      'UPDATE userData SET loginStatus = true, lastLogin = ? WHERE email = ?',
      [new Date().toISOString().slice(0, 19).replace('T', ' '), email]
    );
    
    res.json({ success: true, user, token: 'generated-token' });
  }
});

// NEW (MongoDB)
server.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  const user = await db.collection('userData').findOne({ email });
  
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  
  const isValid = await bcrypt.compare(password, user.passwordHash);
  
  if (isValid) {
    await db.collection('userData').updateOne(
      { email },
      { $set: { loginStatus: true, lastLogin: new Date() } }
    );
    
    res.json({ success: true, user, token: 'generated-token' });
  }
});

// ============================================================================
// REGISTER ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  const [existing] = await pool.execute(
    'SELECT id FROM userData WHERE username = ? OR email = ?',
    [username, email]
  );
  
  if (existing.length > 0) {
    return res.status(409).json({ message: 'User exists' });
  }
  
  const hash = await bcrypt.hash(password, 12);
  const id = Math.random().toString(36).substring(2, 12);
  
  await pool.execute(
    'INSERT INTO userData (id, username, email, passwordHash, credits, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, username, email, hash, 100, Date.now()]
  );
  
  res.status(201).json({ success: true });
});

// NEW (MongoDB)
server.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  const existing = await db.collection('userData').findOne({
    $or: [{ username }, { email }]
  });
  
  if (existing) {
    return res.status(409).json({ message: 'User exists' });
  }
  
  const hash = await bcrypt.hash(password, 12);
  const id = Math.random().toString(36).substring(2, 12);
  
  await db.collection('userData').insertOne({
    id,
    username,
    email,
    passwordHash: hash,
    credits: 100,
    createdAt: Date.now()
  });
  
  res.status(201).json({ success: true });
});

// ============================================================================
// SPEND CREDITS ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.post('/api/spend-credits', async (req, res) => {
  const { username, action } = req.body;
  const cost = Number(action.cost);
  
  const [users] = await pool.execute(
    'SELECT * FROM userData WHERE username = ?',
    [username]
  );
  const user = users[0];
  
  if (user.credits < cost) {
    return res.status(400).json({ message: 'Insufficient credits' });
  }
  
  await pool.execute(
    'UPDATE userData SET credits = credits - ? WHERE email = ?',
    [cost, user.email]
  );
  
  const transactionId = uuidv4();
  
  await pool.execute(
    'INSERT INTO actions (id, transactionId, username, email, date, credits, action_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuidv4(), transactionId, username, user.email, Date.now(), user.credits - cost, cost]
  );
  
  res.json({ success: true, transactionId });
});

// NEW (MongoDB)
server.post('/api/spend-credits', async (req, res) => {
  const { username, action } = req.body;
  const cost = Number(action.cost);
  
  const user = await db.collection('userData').findOne({ username });
  
  if (user.credits < cost) {
    return res.status(400).json({ message: 'Insufficient credits' });
  }
  
  await db.collection('userData').updateOne(
    { email: user.email },
    { $inc: { credits: -cost } }
  );
  
  const transactionId = uuidv4();
  
  await db.collection('actions').insertOne({
    id: uuidv4(),
    transactionId,
    username,
    email: user.email,
    date: Date.now(),
    credits: user.credits - cost,
    action_cost: cost
  });
  
  res.json({ success: true, transactionId });
});

// ============================================================================
// GET LISTINGS ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.get('/api/listings/:username', async (req, res) => {
  const { username } = req.params;
  
  const [listings] = await pool.execute(
    'SELECT * FROM createdKeys WHERE username = ? ORDER BY creationDate DESC',
    [username]
  );
  
  res.json(listings);
});

// NEW (MongoDB)
server.get('/api/listings/:username', async (req, res) => {
  const { username } = req.params;
  
  const listings = await db.collection('createdKeys')
    .find({ username })
    .sort({ creationDate: -1 })
    .toArray();
  
  res.json(listings);
});

// ============================================================================
// CREATE KEY ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.post('/api/create-key', async (req, res) => {
  const { title, price_credits, username, file } = req.body;
  
  const keysArray = file.split('\\n').map(k => k.trim()).filter(k => k);
  const keyId = 'key_' + Date.now();
  const id = Math.random().toString(36).substring(2, 12);
  
  await pool.execute(
    'INSERT INTO createdKeys (id, keyId, username, keyTitle, keyValue, price, quantity, sold, available, creationDate, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, keyId, username, title, JSON.stringify(keysArray), price_credits, keysArray.length, 0, keysArray.length, Date.now(), true]
  );
  
  res.json({ success: true, uploadId: keyId });
});

// NEW (MongoDB)
server.post('/api/create-key', async (req, res) => {
  const { title, price_credits, username, file } = req.body;
  
  const keysArray = file.split('\\n').map(k => k.trim()).filter(k => k);
  const keyId = 'key_' + Date.now();
  const id = Math.random().toString(36).substring(2, 12);
  
  await db.collection('createdKeys').insertOne({
    id,
    keyId,
    username,
    keyTitle: title,
    keyValue: keysArray,  // MongoDB handles arrays natively
    price: price_credits,
    quantity: keysArray.length,
    sold: 0,
    available: keysArray.length,
    creationDate: Date.now(),
    isActive: true
  });
  
  res.json({ success: true, uploadId: keyId });
});

// ============================================================================
// UPDATE LISTING ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.put('/api/listings/:id', async (req, res) => {
  const { id } = req.params;
  const { keyTitle, price, isActive } = req.body;
  
  const updateFields = [];
  const updateValues = [];
  
  if (keyTitle !== undefined) {
    updateFields.push('keyTitle = ?');
    updateValues.push(keyTitle);
  }
  if (price !== undefined) {
    updateFields.push('price = ?');
    updateValues.push(price);
  }
  
  updateValues.push(id);
  const query = 'UPDATE createdKeys SET ' + updateFields.join(', ') + ' WHERE id = ?';
  
  await pool.execute(query, updateValues);
  
  const [updated] = await pool.execute('SELECT * FROM createdKeys WHERE id = ?', [id]);
  res.json({ success: true, listing: updated[0] });
});

// NEW (MongoDB)
server.put('/api/listings/:id', async (req, res) => {
  const { id } = req.params;
  const { keyTitle, price, isActive } = req.body;
  
  const updateData = {};
  if (keyTitle !== undefined) updateData.keyTitle = keyTitle;
  if (price !== undefined) updateData.price = price;
  if (isActive !== undefined) updateData.isActive = isActive;
  
  await db.collection('createdKeys').updateOne(
    { id },
    { $set: updateData }
  );
  
  const updated = await db.collection('createdKeys').findOne({ id });
  res.json({ success: true, listing: updated });
});

// ============================================================================
// DELETE LISTING ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.delete('/api/listings/:id', async (req, res) => {
  const { id } = req.params;
  
  const [listing] = await pool.execute('SELECT * FROM createdKeys WHERE id = ?', [id]);
  
  if (listing.length === 0) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  if (listing[0].sold > 0) {
    await pool.execute('UPDATE createdKeys SET isActive = false WHERE id = ?', [id]);
  } else {
    await pool.execute('DELETE FROM createdKeys WHERE id = ?', [id]);
  }
  
  res.json({ success: true });
});

// NEW (MongoDB)
server.delete('/api/listings/:id', async (req, res) => {
  const { id } = req.params;
  
  const listing = await db.collection('createdKeys').findOne({ id });
  
  if (!listing) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  if (listing.sold > 0) {
    await db.collection('createdKeys').updateOne(
      { id },
      { $set: { isActive: false } }
    );
  } else {
    await db.collection('createdKeys').deleteOne({ id });
  }
  
  res.json({ success: true });
});

// ============================================================================
// NOTIFICATIONS ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.get('/api/notifications/:username', async (req, res) => {
  const { username } = req.params;
  
  const [notifications] = await pool.execute(
    'SELECT * FROM notifications WHERE username = ? ORDER BY createdAt DESC',
    [username]
  );
  
  res.json(notifications);
});

// NEW (MongoDB)
server.get('/api/notifications/:username', async (req, res) => {
  const { username } = req.params;
  
  const notifications = await db.collection('notifications')
    .find({ username })
    .sort({ createdAt: -1 })
    .toArray();
  
  res.json(notifications);
});

// ============================================================================
// CREATE NOTIFICATION FUNCTION CONVERSION
// ============================================================================

// OLD (MySQL)
async function CreateNotification(type, title, message, category, username, priority = 'info') {
  await pool.execute(
    'INSERT INTO notifications (id, type, title, message, createdAt, priority, category, username, isRead) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [Math.random().toString(36).substring(2, 12), type, title, message, new Date().toISOString().slice(0, 19).replace('T', ' '), priority, category, username, 0]
  );
}

// NEW (MongoDB)
async function CreateNotification(type, title, message, category, username, priority = 'info') {
  await db.collection('notifications').insertOne({
    id: Math.random().toString(36).substring(2, 12),
    type,
    title,
    message,
    createdAt: new Date(),
    priority,
    category,
    username,
    isRead: false
  });
}

// ============================================================================
// DEVICE FINGERPRINT ROUTES CONVERSION
// ============================================================================

// OLD (MySQL)
server.post('/api/fingerprint/save', async (req, res) => {
  const { userId, fingerprintHash, deviceType } = req.body;
  
  const [existing] = await pool.execute(
    'SELECT * FROM device_fingerprints WHERE user_id = ? AND fingerprint_hash = ?',
    [userId, fingerprintHash]
  );
  
  if (existing.length > 0) {
    await pool.execute(
      'UPDATE device_fingerprints SET last_seen = CURRENT_TIMESTAMP, login_count = login_count + 1 WHERE id = ?',
      [existing[0].id]
    );
  } else {
    await pool.execute(
      'INSERT INTO device_fingerprints (user_id, fingerprint_hash, device_type, first_seen, last_seen) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [userId, fingerprintHash, deviceType]
    );
  }
  
  res.json({ success: true });
});

// NEW (MongoDB)
server.post('/api/fingerprint/save', async (req, res) => {
  const { userId, fingerprintHash, deviceType } = req.body;
  
  const existing = await db.collection('device_fingerprints').findOne({
    user_id: userId,
    fingerprint_hash: fingerprintHash
  });
  
  if (existing) {
    await db.collection('device_fingerprints').updateOne(
      { _id: existing._id },
      { 
        $set: { last_seen: new Date() },
        $inc: { login_count: 1 }
      }
    );
  } else {
    await db.collection('device_fingerprints').insertOne({
      user_id: userId,
      fingerprint_hash: fingerprintHash,
      device_type: deviceType,
      first_seen: new Date(),
      last_seen: new Date(),
      login_count: 1
    });
  }
  
  res.json({ success: true });
});

// ============================================================================
// SUBSCRIPTION ROUTES CONVERSION
// ============================================================================

// OLD (MySQL)
server.get('/api/subscription/current/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const [subs] = await pool.execute(
    "SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  
  res.json({ subscription: subs[0] || null });
});

// NEW (MongoDB)
server.get('/api/subscription/current/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const subscription = await db.collection('subscriptions')
    .find({ 
      user_id: userId, 
      status: { $in: ['active', 'trialing'] }
    })
    .sort({ created_at: -1 })
    .limit(1)
    .toArray();
  
  res.json({ subscription: subscription[0] || null });
});

// ============================================================================
// CRYPTO TRANSACTIONS ROUTE CONVERSION
// ============================================================================

// OLD (MySQL)
server.post('/api/lookup-transaction', async (req, res) => {
  const { blockchain, transactionHash } = req.body;
  
  const [tx] = await pool.execute(
    'SELECT * FROM CryptoTransactions_' + blockchain + ' WHERE direction = "IN" AND hash = ?',
    [transactionHash]
  );
  
  if (tx.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  res.json(tx[0]);
});

// NEW (MongoDB)
server.post('/api/lookup-transaction', async (req, res) => {
  const { blockchain, transactionHash } = req.body;
  
  const tx = await db.collection('CryptoTransactions_' + blockchain).findOne({
    direction: 'IN',
    hash: transactionHash
  });
  
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  res.json(tx);
});

// ============================================================================
// GENERIC CRUD ROUTES CONVERSION
// ============================================================================

// OLD (MySQL)
server.get('/api/:table', async (req, res) => {
  const { table } = req.params;
  const [rows] = await pool.execute('SELECT * FROM ' + table);
  res.json(rows);
});

server.get('/api/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  const [rows] = await pool.execute('SELECT * FROM ' + table + ' WHERE id = ?', [id]);
  res.json(rows[0]);
});

server.patch('/api/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  const updateData = req.body;
  
  const columns = Object.keys(updateData);
  const values = Object.values(updateData);
  const setClause = columns.map(col => col + ' = ?').join(', ');
  
  await pool.execute('UPDATE ' + table + ' SET ' + setClause + ' WHERE id = ?', [...values, id]);
  
  const [updated] = await pool.execute('SELECT * FROM ' + table + ' WHERE id = ?', [id]);
  res.json(updated[0]);
});

// NEW (MongoDB)
server.get('/api/:table', async (req, res) => {
  const { table } = req.params;
  const rows = await db.collection(table).find({}).toArray();
  res.json(rows);
});

server.get('/api/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  const row = await db.collection(table).findOne({ id });
  res.json(row);
});

server.patch('/api/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  const updateData = req.body;
  
  await db.collection(table).updateOne(
    { id },
    { $set: updateData }
  );
  
  const updated = await db.collection(table).findOne({ id });
  res.json(updated);
});
`);

console.log('\n5. GRACEFUL SHUTDOWN\n');
console.log(`
// OLD (MySQL)
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

// NEW (MongoDB)
process.on('SIGTERM', async () => {
  await client.close();
  process.exit(0);
});
`);

console.log('\n6. ENVIRONMENT VARIABLES\n');
console.log(`
Update your .env file:

# Remove these (MySQL):
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=root
# DB_PASSWORD=your_password

# Add this (MongoDB):
MONGODB_URI=mongodb://localhost:27017
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/

DB_NAME=video-scrambler
`);

console.log('\n7. SUMMARY OF CHANGES\n');
console.log('Total conversions needed: ~100+ database operations');
console.log('Files to update:');
console.log('  - server.cjs (main file)');
console.log('  - .env (environment variables)');
console.log('  - package.json (dependencies)');
console.log('\nNext steps:');
console.log('  1. Install MongoDB: npm install mongodb');
console.log('  2. Uninstall MySQL: npm uninstall mysql2');
console.log('  3. Apply all conversions to server.cjs');
console.log('  4. Update .env with MONGODB_URI');
console.log('  5. Test each route thoroughly');
console.log('  6. Consider creating indexes for performance');
console.log('\n' + '='.repeat(80));
