# MySQL to MongoDB Conversion Guide for server.cjs

## Overview
This guide provides patterns for converting all MySQL operations in server.cjs to MongoDB.

## 1. Setup Changes (DONE)

### Import Changes
```javascript
// OLD (MySQL)
const mysql = require('mysql2/promise');

// NEW (MongoDB)
const { MongoClient, ObjectId } = require('mongodb');
```

### Connection Setup
```javascript
// OLD (MySQL)
const pool = mysql.createPool(dbConfig);

// NEW (MongoDB)
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'video-scrambler';
let db, client;

async function connectToMongoDB() {
  client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);
  
  // Create indexes
  await db.collection('userData').createIndex({ email: 1 }, { unique: true });
  await db.collection('userData').createIndex({ username: 1 }, { unique: true });
  return db;
}
```

## 2. Query Conversion Patterns

### SELECT Queries

#### Single Record
```javascript
// OLD (MySQL)
const [users] = await pool.execute(
  'SELECT * FROM userData WHERE email = ?',
  [email]
);
const user = users[0];

// NEW (MongoDB)
const user = await db.collection('userData').findOne({ email });
```

#### Multiple Records
```javascript
// OLD (MySQL)
const [listings] = await pool.execute(
  'SELECT * FROM createdKeys WHERE username = ? ORDER BY creationDate DESC',
  [username]
);

// NEW (MongoDB)
const listings = await db.collection('createdKeys')
  .find({ username })
  .sort({ creationDate: -1 })
  .toArray();
```

#### With Conditions
```javascript
// OLD (MySQL)
const [keys] = await pool.execute(
  'SELECT * FROM createdKeys WHERE id = ?',
  [id]
);

// NEW (MongoDB)
const keys = await db.collection('createdKeys')
  .find({ id })
  .toArray();
```

### INSERT Operations

```javascript
// OLD (MySQL)
await pool.execute(
  'INSERT INTO userData (id, username, email, credits) VALUES (?, ?, ?, ?)',
  [id, username, email, credits]
);

// NEW (MongoDB)
await db.collection('userData').insertOne({
  id,
  username,
  email,
  credits
});
```

### UPDATE Operations

```javascript
// OLD (MySQL)
await pool.execute(
  'UPDATE userData SET credits = credits - ? WHERE email = ?',
  [cost, email]
);

// NEW (MongoDB)
await db.collection('userData').updateOne(
  { email },
  { $inc: { credits: -cost } }
);
```

```javascript
// OLD (MySQL)
await pool.execute(
  'UPDATE userData SET loginStatus = true, lastLogin = ? WHERE email = ?',
  [currentDateTime, email]
);

// NEW (MongoDB)
await db.collection('userData').updateOne(
  { email },
  { $set: { loginStatus: true, lastLogin: new Date() } }
);
```

### DELETE Operations

```javascript
// OLD (MySQL)
await pool.execute(
  'DELETE FROM createdKeys WHERE id = ?',
  [listingId]
);

// NEW (MongoDB)
await db.collection('createdKeys').deleteOne({ id: listingId });
```

## 3. Special Cases

### JSON Fields
MySQL stores JSON as strings, MongoDB handles natively:

```javascript
// OLD (MySQL)
tags: JSON.stringify(processedTags)

// NEW (MongoDB)
tags: processedTags  // Just use the array directly
```

### Date/Time Fields
```javascript
// OLD (MySQL)
const currentDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

// NEW (MongoDB)
const currentDateTime = new Date();  // MongoDB handles dates natively
```

### Auto-increment IDs
```javascript
// OLD (MySQL - AUTO_INCREMENT)
// MySQL handles this automatically

// NEW (MongoDB)
// Option 1: Use MongoDB ObjectId
_id: new ObjectId()

// Option 2: Keep your custom IDs
id: Math.random().toString(36).substring(2, 12).toUpperCase()
```

### LIKE Queries
```javascript
// OLD (MySQL)
WHERE username LIKE ?
[`%${searchTerm}%`]

// NEW (MongoDB)
{ username: { $regex: searchTerm, $options: 'i' } }
```

### OR Conditions
```javascript
// OLD (MySQL)
WHERE username = ? OR email = ?

// NEW (MongoDB)
{ $or: [{ username }, { email }] }
```

### Increment/Decrement
```javascript
// OLD (MySQL)
UPDATE table SET count = count + 1

// NEW (MongoDB)
{ $inc: { count: 1 } }
```

## 4. Route-by-Route Conversion Checklist

### ✅ Authentication Routes (Partially Done)
- [x] POST /api/auth/login
- [x] POST /api/user
- [x] POST /api/auth/register
- [x] POST /api/auth/logout

### ⏳ Wallet & Credits Routes
- [ ] POST /api/wallet/balance/:username
- [ ] POST /api/spend-credits

### ⏳ Listing Routes
- [ ] GET /api/seller/listings/:id
- [ ] GET /api/listings/:username
- [ ] PUT /api/listings/:id
- [ ] DELETE /api/listings/:id
- [ ] GET /api/createdKey/:id
- [ ] POST /api/create-key

### ⏳ Notification Routes
- [ ] GET /api/notifications/:username
- [ ] CreateNotification() function

### ⏳ Purchase & Transaction Routes
- [ ] GET /api/purchases/:username
- [ ] POST /api/purchases/:username
- [ ] GET /api/redemptions/:username
- [ ] POST /api/lookup-transaction

### ⏳ Device Fingerprint Routes
- [ ] POST /api/fingerprint/save
- [ ] GET /api/fingerprint/user/:userId
- [ ] GET /api/fingerprint/details/:hash
- [ ] POST /api/fingerprint/unscramble/:hash
- [ ] POST /api/fingerprint/leaked/:hash
- [ ] PATCH /api/fingerprint/block/:id
- [ ] GET /api/fingerprint/stats

### ⏳ Subscription Routes (Stripe)
- [ ] POST /api/subscription/create-checkout
- [ ] GET /api/subscription/verify-session
- [ ] GET /api/subscription/current/:userId
- [ ] POST /api/subscription/portal
- [ ] POST /api/subscription/cancel
- [ ] POST /api/subscription/webhook

### ⏳ Crypto Transaction Routes
- [ ] Crypto transaction checking functions
- [ ] Transaction cron job (FetchRecentTransactionsCron)

### ⏳ Generic CRUD Routes
- [ ] GET /api/:table
- [ ] GET /api/:table/:id
- [ ] PATCH /api/:table/:id

## 5. MongoDB-Specific Optimizations

### Indexes for Performance
```javascript
// Create indexes on frequently queried fields
await db.collection('userData').createIndex({ email: 1 }, { unique: true });
await db.collection('userData').createIndex({ username: 1 }, { unique: true });
await db.collection('createdKeys').createIndex({ username: 1 });
await db.collection('actions').createIndex({ email: 1 });
await db.collection('notifications').createIndex({ username: 1 });
await db.collection('device_fingerprints').createIndex({ user_id: 1 });
await db.collection('device_fingerprints').createIndex({ fingerprint_hash: 1 });
```

### Aggregation Pipelines
For complex queries that used JOINs in MySQL:

```javascript
// Example: Get user with their purchases
const userWithPurchases = await db.collection('userData').aggregate([
  { $match: { email: userEmail } },
  {
    $lookup: {
      from: 'buyCredits',
      localField: 'username',
      foreignField: 'username',
      as: 'purchases'
    }
  }
]).toArray();
```

## 6. Installation

```bash
npm uninstall mysql2
npm install mongodb
```

## 7. Environment Variables

Update your `.env` file:

```env
# OLD (MySQL)
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=root
# DB_PASSWORD=your_password
# DB_NAME=video-scrambler

# NEW (MongoDB)
MONGODB_URI=mongodb://localhost:27017
# For MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=video-scrambler
```

## 8. Testing Strategy

1. **Start Small**: Convert and test one route at a time
2. **Compare Results**: Verify MongoDB returns same data as MySQL
3. **Check Indexes**: Ensure queries are fast with proper indexes
4. **Error Handling**: MongoDB errors are different from MySQL errors
5. **Transactions**: If you need multi-document transactions, use MongoDB sessions

## 9. Common Pitfalls

### ❌ Don't do this:
```javascript
// This doesn't work in MongoDB
const users = await db.collection('userData').find({ email }).toArray();
const user = users[0];  // Unnecessary array operation
```

### ✅ Do this instead:
```javascript
const user = await db.collection('userData').findOne({ email });
```

### ❌ Don't do this:
```javascript
// Forgetting to convert JSON strings
tags: JSON.stringify(tagsArray)  // MongoDB doesn't need this!
```

### ✅ Do this instead:
```javascript
tags: tagsArray  // MongoDB handles arrays natively
```

## 10. Graceful Shutdown

```javascript
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
```

## 11. Migration Script

Consider creating a migration script to move existing MySQL data to MongoDB:

```javascript
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');

async function migrateMySQLtoMongoDB() {
  // Connect to both databases
  const mysqlPool = mysql.createPool(mysqlConfig);
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const mongodb = mongoClient.db(dbName);

  // Migrate userData
  const [users] = await mysqlPool.execute('SELECT * FROM userData');
  if (users.length > 0) {
    await mongodb.collection('userData').insertMany(users);
  }

  // Migrate other tables...
  // ...

  await mysqlPool.end();
  await mongoClient.close();
  console.log('Migration complete!');
}
```

## 12. Next Steps

1. Review this guide
2. Convert routes one section at a time
3. Test each section thoroughly
4. Update any client code that depends on response format
5. Create database backups before going live
6. Monitor MongoDB performance and add indexes as needed

## 13. Resources

- [MongoDB Node.js Driver Docs](https://mongodb.github.io/node-mongodb-native/)
- [MongoDB Query Operators](https://www.mongodb.com/docs/manual/reference/operator/query/)
- [MongoDB Update Operators](https://www.mongodb.com/docs/manual/reference/operator/update/)
- [Mongoose (ODM alternative)](https://mongoosejs.com/)
