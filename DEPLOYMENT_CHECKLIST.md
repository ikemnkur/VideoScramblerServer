# 🚀 KeyChing Server Deployment Checklist

## ✅ Pre-Deployment Requirements

- [ ] Node.js 18+ installed
- [ ] MySQL 8.0+ installed and running
- [ ] Server has network access to MySQL database
- [ ] Required ports are open (3001 or custom PORT)

## ✅ Setup Steps

1. **📁 File Structure**
   - [ ] `server.cjs` - Main server file
   - [ ] `package.json` - Dependencies and scripts
   - [ ] `KeyChingDB.sql` - Database schema
   - [ ] `.env.example` - Environment template
   - [ ] `README.md` - Documentation

2. **🗄️ Database Setup**
   - [ ] MySQL service running: `sudo systemctl status mysql`
   - [ ] Import database: `mysql -u root -p < KeyChingDB.sql`
   - [ ] Verify tables: `mysql -u root -p -e "USE KeyChingDB; SHOW TABLES;"`

3. **⚙️ Environment Configuration**
   - [ ] Copy environment template: `cp .env.example .env`
   - [ ] Update database credentials in `.env`
   - [ ] Set correct HOST and PORT in `.env`

4. **📦 Dependencies**
   - [ ] Install packages: `npm install`
   - [ ] Verify installation: `npm list --depth=0`

## ✅ Testing & Validation

5. **🧪 Syntax & Connection Tests**
   - [ ] Syntax check: `node -c server.cjs`
   - [ ] Database connectivity test (start server temporarily)

6. **🌐 API Testing**
   - [ ] Health check: `curl http://localhost:3001/health`
   - [ ] Login test: `curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"user_123","password":"demo123"}'`
   - [ ] Data retrieval: `curl http://localhost:3001/api/userData`

## ✅ Production Deployment

7. **🚀 Start Server**
   - [ ] Development: `npm run dev`
   - [ ] Production: `npm start`
   - [ ] Or use startup script: `./start.sh`

8. **🔧 Process Management (Optional)**
   - [ ] Install PM2: `npm install -g pm2`
   - [ ] Start with PM2: `pm2 start server.cjs --name keyching-api`
   - [ ] Setup auto-restart: `pm2 startup`

9. **🛡️ Security & Performance**
   - [ ] Configure firewall rules
   - [ ] Setup reverse proxy (Nginx)
   - [ ] Enable SSL/HTTPS
   - [ ] Set up monitoring and logging

## ✅ Verification Commands

```bash
# Check server status
curl http://localhost:3001/health

# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user_123","password":"demo123"}'

# Verify database tables
mysql -u root -p -e "USE KeyChingDB; SELECT COUNT(*) FROM userData;"

# Check server logs
tail -f logs/server.log  # if using PM2
# or check console output
```

## 🚨 Common Issues & Solutions

- **Database Connection Failed**: Check credentials in `.env`, MySQL service status
- **Port Already in Use**: Change PORT in `.env` or kill existing process
- **Permission Denied**: Check file permissions, MySQL user privileges
- **Module Not Found**: Run `npm install` to install dependencies

## 📞 Support

If issues persist:
1. Check the README.md for detailed troubleshooting
2. Verify all environment variables are set correctly
3. Test database connection independently
4. Check server logs for specific error messages

---
**📅 Last Updated**: $(date)
**🏗️ Ready for Deployment!**