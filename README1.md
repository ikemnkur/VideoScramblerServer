# KeyChing Server - Standalone Deployment

A standalone MySQL-based API server for the KeyChing application.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MySQL 8.0+

### Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MySQL credentials
   ```

3. **Create Database**
   ```bash
   # Import the database schema
   mysql -u root -p < KeyChingDB.sql
   ```

4. **Start Server**
   ```bash
   # Production
   npm start
   
   # Development (with auto-restart)
   npm run dev
   ```

## 📋 Environment Configuration

Update your `.env` file with the following:

```env
# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=KeyChingDB

# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# Optional
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your_jwt_secret_key
```

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/login` - User login

### Wallet & Credits  
- `GET /api/wallet/balance` - Get wallet balance
- `GET /api/purchases/:username` - Get credit purchases
- `GET /api/redemptions/:username` - Get credit redemptions

### Key Management
- `GET /api/listings` - Get all active key listings
- `POST /api/create-key` - Create new key listing
- `POST /api/unlock/:keyId` - Purchase/unlock a key
- `GET /api/unlocks/:username` - Get user's key purchases

### User Data
- `GET /api/userData` - Get all users
- `GET /api/notifications/:username` - Get user notifications

### RESTful API (All Tables)
- `GET /api/:table` - Get all records from table
- `GET /api/:table/:id` - Get specific record by ID
- `PATCH /api/:table/:id` - Update specific record

### Health Check
- `GET /health` - Server health status

## 🗄️ Database Tables

The server manages these MySQL tables:
- `userData` - User accounts and profiles
- `buyCredits` - Credit purchase transactions
- `redeemCredits` - Credit redemption requests
- `earnings` - Seller earnings records
- `unlocks` - Key purchase transactions
- `createdKeys` - Software keys created by sellers
- `notifications` - User notifications
- `wallet` - User wallet balances
- `reports` - User reports on keys
- `supportTickets` - Customer support tickets

## 🐳 Docker Deployment (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t keyching-server .
docker run -p 3001:3001 --env-file .env keyching-server
```

## 🛠️ Production Deployment

### PM2 Process Manager
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.cjs --name "keyching-api"

# Monitor
pm2 status
pm2 logs keyching-api
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔧 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check MySQL service: `sudo systemctl status mysql`
   - Verify credentials in `.env`
   - Ensure database exists: `mysql -u root -p -e "SHOW DATABASES;"`

2. **Port Already in Use**
   - Change PORT in `.env`
   - Kill existing process: `lsof -ti:3001 | xargs kill -9`

3. **Permission Issues**
   - Create MySQL user: `CREATE USER 'keyching'@'localhost' IDENTIFIED BY 'password';`
   - Grant privileges: `GRANT ALL ON KeyChingDB.* TO 'keyching'@'localhost';`

### Testing API

```bash
# Health check
curl http://localhost:3001/health

# Test login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user_123","password":"demo123"}'

# Get user data
curl http://localhost:3001/api/userData
```

## 📊 Monitoring

The server includes:
- Request logging middleware
- Database connection pooling
- Graceful shutdown handling
- Error handling with stack traces (dev mode)
- Health check endpoint

## 🔐 Security Notes

For production deployment:
- Use strong MySQL passwords
- Enable SSL/TLS for database connections
- Implement rate limiting
- Add JWT authentication
- Use HTTPS with SSL certificates
- Configure firewall rules

## 📝 Logs

Server logs include:
- Request timestamps and methods
- Database connection status
- Error messages with stack traces
- Startup information

## 🚀 Scaling

For high-traffic environments:
- Use MySQL read replicas
- Implement Redis caching
- Add load balancers
- Use container orchestration (Kubernetes)
- Monitor with tools like New Relic or DataDog# Key-Ching-App2
