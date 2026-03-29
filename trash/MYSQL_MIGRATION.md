# KeyChingDB MySQL Migration Guide

This guide explains how to migrate from JSON Server to MySQL database for the Key-Ching App.

## Prerequisites

1. **MySQL Server**: Install MySQL on your system
   - Ubuntu/Debian: `sudo apt install mysql-server`
   - macOS: `brew install mysql`
   - Windows: Download from [MySQL Official Site](https://dev.mysql.com/downloads/mysql/)

2. **Node.js Dependencies**: Already installed
   - mysql2
   - express
   - cors
   - dotenv

## Quick Setup

### Option 1: Automated Setup (Recommended)
```bash
# Run the setup script
./setup-mysql.sh
```

### Option 2: Manual Setup

1. **Create Database**:
   ```sql
   mysql -u root -p
   CREATE DATABASE KeyChingDB;
   USE KeyChingDB;
   SOURCE KeyChingDB.sql;
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your MySQL credentials
   ```

3. **Update .env file**:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=KeyChingDB
   DB_CONNECTION_LIMIT=10
   PORT=3001
   ```

## Starting the Server

```bash
# Start MySQL-based server
node server.cjs
```

The server will now use MySQL instead of JSON files.

## Key Changes

### Database Structure
- **10 MySQL Tables**: userData, buyCredits, redeemCredits, earnings, unlocks, createdKeys, notifications, wallet, reports, supportTickets
- **Proper Relationships**: Foreign key constraints between tables
- **Better Performance**: Indexed columns for faster queries
- **Data Integrity**: Type constraints and validation

### API Endpoints
All existing endpoints remain the same:
- `GET /api/userData` - Get all users
- `GET /api/userData/:id` - Get user by ID
- `PATCH /api/userData/:id` - Update user
- `POST /api/auth/login` - User authentication
- `GET /api/wallet/balance` - Get wallet balance
- `GET /api/listings` - Get all active key listings
- `POST /api/unlock/:keyId` - Purchase/unlock a key
- `GET /api/unlocks/:username` - Get user's purchases
- `GET /api/notifications/:username` - Get user notifications

### New RESTful Endpoints
- `GET /api/:table` - Get all records from any table
- `GET /api/:table/:id` - Get specific record
- `PATCH /api/:table/:id` - Update specific record

## Migration Benefits

1. **Better Performance**: MySQL handles concurrent requests better than file-based JSON
2. **Data Integrity**: Foreign key relationships prevent orphaned records
3. **Scalability**: Can handle thousands of users and transactions
4. **ACID Compliance**: Guaranteed data consistency
5. **Advanced Queries**: Complex JOIN operations and aggregations
6. **Backup & Recovery**: Professional database backup solutions

## Troubleshooting

### Connection Issues
```bash
# Check MySQL service status
sudo systemctl status mysql

# Start MySQL service
sudo systemctl start mysql

# Check if database exists
mysql -u root -p -e "SHOW DATABASES;"
```

### Permission Issues
```sql
-- Create dedicated user (optional)
CREATE USER 'keyching'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON KeyChingDB.* TO 'keyching'@'localhost';
FLUSH PRIVILEGES;
```

### Port Conflicts
If port 3001 is in use, update the PORT in your `.env` file:
```env
PORT=3002
```

## Data Verification

Test the API endpoints:
```bash
# Test user data
curl http://localhost:3001/api/userData

# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user_123","password":"demo123"}'

# Test wallet balance
curl http://localhost:3001/api/wallet/balance?username=user_123
```

## Frontend Compatibility

No changes needed in the React frontend - all API endpoints remain identical. The frontend will automatically work with the new MySQL backend.

## Performance Notes

- Connection pooling handles multiple simultaneous requests
- Prepared statements prevent SQL injection
- Indexed columns provide fast lookups
- Transaction support ensures data consistency