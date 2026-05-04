/**
 * server-admin.js — System Admin Panel (Express Router)
 *
 * Usage in server.cjs:
 *   const createAdminRouter = require('./server-admin');
 *   const adminRouter = createAdminRouter({ analytics, logs, dbConfig });
 *   server.use('/admin', adminRouter);
 *
 * All routes below are relative to the mount point (e.g. /admin).
 *
 * Public routes:
 *   GET  /login            Admin login page
 *   POST /api/login        Authenticate
 *
 * Protected routes (require admin cookie):
 *   GET  /                 Dashboard (uptime, memory, analytics)
 *   GET  /logs             Log viewer with filters
 *   GET  /health           Health check
 *   GET  /db               Database manager
 *   GET  /db/table/:name   Browse table records
 *   POST /api/logout       Clear admin session
 *   POST /api/logs/clear   Clear in-memory logs
 *   GET  /api/logs/export  Export logs as JSON
 *   GET  /api/logs         Logs as JSON
 *   GET  /api/db/stats     DB statistics JSON
 *   GET  /api/db/tables    Table list JSON
 *   GET  /api/db/table/:n  Table records JSON
 *   POST /api/db/query     Execute read-only SQL
 */

const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');
const knex    = require('./config/knex');
require('dotenv').config();
const stripeClient = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY.trim()) : null;

// ─────────────────────────────────────────────────────────
//  Factory — call with shared dependencies from main server
// ─────────────────────────────────────────────────────────
module.exports = function createAdminRouter(deps = {}) {
  const {
    pool      = null,
    analytics = null,       // { visitors, users, totalRequests, dataTx, dataRx, endpointCalls, startTime }
    logs      = null,       // { entries: [], maxLogs: 500 }
    dbConfig  = {},         // { host, port, database, ... }
    getLogFilePath = null,  // function → current log file path on disk
  } = deps;

  const router  = express.Router();
  const SECRET  = process.env.ADMIN_SECRET || 'linked-admin-default-secret';
  const TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 h
  const COOKIE  = '__admin_tok';

  // ───────────── Token helpers (HMAC-SHA256, no JWT dep) ─────────────

  function createToken(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig  = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    return `${data}.${sig}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
      if (Date.now() - payload.iat > TOKEN_TTL) return null;
      return payload;
    } catch { return null; }
  }

  function parseCookies(header) {
    const map = {};
    if (!header) return map;
    header.split(';').forEach(c => {
      const [k, ...v] = c.split('=');
      if (k) map[k.trim()] = v.join('=').trim();
    });
    return map;
  }

  // ───────────── Auth middleware ──────────────────────────

  function requireAdmin(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyToken(cookies[COOKIE]);
    if (payload && payload.role === 'admin') {
      req.adminUser = payload;
      return next();
    }
    // API routes get 401 JSON; page routes redirect to login
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized — admin login required' });
    }
    return res.redirect(req.baseUrl + '/login');
  }

  // ───────────── Shared HTML layout ─────────────────────

  function escapeHtml(text) {
    if (typeof text !== 'string') text = String(text);
    return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
  }

  function adminLayout(title, activeNav, bodyContent) {
    const navItems = [
      { href: '', icon: '📊', label: 'Dashboard' },
      { href: '/moderation', icon: '🛡️', label: 'Moderation' },
      { href: '/logs', icon: '📋', label: 'Logs' },
      { href: '/health', icon: '💚', label: 'Health' },
      { href: '/review/verifications', icon: '🪪', label: 'ID Review' },
      { href: '/review/promos', icon: '📣', label: 'Ads' },
      { href: '/review/drops', icon: '🔥', label: 'Drops' },
      { href: '/review/purchases', icon: '💰', label: 'Purchases' },
      { href: '/review/stripe', icon: '💳', label: 'Stripe' },
      { href: '/review/crypto', icon: '🪙', label: 'Crypto' },
      { href: '/review/redeems', icon: '💸', label: 'Redeems' },
    ];
    navItems.push({ href: '/db', icon: '🗄️', label: 'Database' });

    const navHtml = navItems.map(n => {
      const active = activeNav === n.href ? 'active' : '';
      return `<a class="nav-item ${active}" href="${'BASE_URL' + n.href}">${n.icon} ${n.label}</a>`;
    }).join('\n        ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Admin</title>
  <style>
    :root {
      --bg:       #0f1117;
      --surface:  #1a1d27;
      --surface2: #242837;
      --border:   #2e3348;
      --accent:   #6c63ff;
      --accent2:  #4ecdc4;
      --text:     #e1e4ed;
      --text2:    #8b90a5;
      --red:      #ff6b6b;
      --orange:   #ffa34d;
      --green:    #4ecdc4;
      --blue:     #6c63ff;
      --radius:   10px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    /* ─── Top nav ─── */
    .admin-topbar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      padding: 0 24px;
      height: 56px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .admin-topbar .brand {
      font-weight: 700;
      font-size: 1.1em;
      color: var(--accent);
      margin-right: 32px;
      text-decoration: none;
    }
    .admin-topbar .nav-item {
      color: var(--text2);
      text-decoration: none;
      padding: 16px 14px;
      font-size: 0.9em;
      transition: color .2s, border-bottom .2s;
      border-bottom: 2px solid transparent;
    }
    .admin-topbar .nav-item:hover { color: var(--text); }
    .admin-topbar .nav-item.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    .admin-topbar .spacer { flex: 1; }
    .admin-topbar .logout-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--text2);
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85em;
      transition: all .2s;
    }
    .admin-topbar .logout-btn:hover {
      border-color: var(--red);
      color: var(--red);
    }
    /* ─── Main content ─── */
    .admin-main {
      max-width: 1400px;
      margin: 0 auto;
      padding: 28px 24px;
    }
    .page-title {
      font-size: 1.6em;
      font-weight: 700;
      margin-bottom: 24px;
    }
    /* ─── Cards ─── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 22px;
      margin-bottom: 20px;
    }
    .card h3 {
      color: var(--accent2);
      font-size: 0.8em;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .card .big-value {
      font-size: 2em;
      font-weight: 700;
    }
    .card .sub-label {
      color: var(--text2);
      font-size: 0.85em;
      margin-top: 4px;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    @media (max-width: 900px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    }
    /* ─── Tables ─── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
    }
    th, td {
      text-align: left;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--text2);
      font-size: 0.8em;
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    tr:hover td { background: var(--surface2); }
    /* ─── Buttons / inputs ─── */
    .btn {
      display: inline-block;
      padding: 8px 18px;
      border: none;
      border-radius: 6px;
      font-size: 0.9em;
      cursor: pointer;
      transition: opacity .2s;
      font-weight: 600;
      text-decoration: none;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-danger  { background: var(--red); color: #fff; }
    .btn-outline { background: none; border: 1px solid var(--border); color: var(--text); }
    input[type="text"], input[type="password"], input[type="number"],
    select, textarea {
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.9em;
      outline: none;
      transition: border-color .2s;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--accent); }
    /* ─── Log entries ─── */
    .log-entry {
      padding: 8px 12px;
      border-left: 3px solid transparent;
      margin-bottom: 4px;
      border-radius: 4px;
      background: var(--surface2);
      font-family: 'Courier New', monospace;
      font-size: 0.82em;
      line-height: 1.6;
    }
    .log-entry.info  { border-left-color: var(--green); }
    .log-entry.error { border-left-color: var(--red); }
    .log-entry.warn  { border-left-color: var(--orange); }
    .log-time  { color: var(--text2); font-size: 0.85em; margin-right: 8px; }
    .log-badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 3px;
      font-size: 0.75em;
      font-weight: 700;
      text-transform: uppercase;
      margin-right: 8px;
    }
    .log-badge.info  { background: var(--blue); color: #fff; }
    .log-badge.error { background: var(--red); color: #fff; }
    .log-badge.warn  { background: var(--orange); color: #1e1e1e; }
    .controls-bar {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .controls-bar label { color: var(--text2); font-size: 0.85em; }
    /* ─── Status dot ─── */
    .dot {
      display: inline-block;
      width: 10px; height: 10px;
      border-radius: 50%;
      margin-right: 6px;
    }
    .dot-green  { background: var(--green); }
    .dot-red    { background: var(--red); }
    .dot-orange { background: var(--orange); }
  </style>
</head>
<body>
  <div class="admin-topbar">
    <a class="brand" href="BASE_URL">🔧 Admin</a>
    ${navHtml}
    <span class="spacer"></span>
    <button class="logout-btn" onclick="fetch('BASE_URL/api/logout',{method:'POST'}).then(()=>location.href='BASE_URL/login')">Logout</button>
  </div>
  <div class="admin-main">
    ${bodyContent}
  </div>
</body>
</html>`.replace(/BASE_URL/g, '{{BASE}}');
  }

  // The actual base URL gets injected per-request
  function render(req, res, title, activeNav, bodyContent) {
    const html = adminLayout(title, activeNav, bodyContent)
      .replace(/\{\{BASE\}\}/g, req.baseUrl);
    res.type('html').send(html);
  }

  async function createNotif(poolRef, {
    userId,
    type,
    title,
    message = '',
    priority = 'info',
    category = 'system',
    relatedDropId = null,
    actionUrl = null,
  }) {
    if (!userId || !title) return;

    const safePriority = ['success', 'info', 'warning', 'error'].includes(String(priority || '').toLowerCase())
      ? String(priority).toLowerCase()
      : 'info';

    const allowedCategories = new Set([
      'drop_released',
      'goal_reached',
      'contribution_received',
      'contribution_refunded',
      'credit_purchase',
      'download_available',
      'review_received',
      'account',
      'moderation',
      'system',
    ]);

    const rawCategory = String(category || '').trim().toLowerCase();
    const safeCategory = allowedCategories.has(rawCategory)
      ? rawCategory
      : rawCategory.includes('account')
        ? 'account'
        : rawCategory.includes('moderation') || rawCategory.includes('redeem') || rawCategory.includes('subscription')
          ? 'moderation'
          : rawCategory.includes('credit') || rawCategory.includes('purchase')
            ? 'credit_purchase'
            : 'system';

    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (poolRef?.query) {
      await poolRef.query(
        `INSERT IGNORE INTO notifications (id, userId, type, title, message, priority, category, relatedDropId, actionUrl, isRead, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [id, userId, type || 'admin_message', title, message, safePriority, safeCategory, relatedDropId, actionUrl, createdAt]
      );
      return;
    }

    await knex('notifications').insert({
      id,
      userId,
      type: type || 'admin_message',
      title,
      message,
      priority: safePriority,
      category: safeCategory,
      relatedDropId,
      actionUrl,
      isRead: 0,
      createdAt,
    });
  }

  async function ensureFeedbackTable() {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        title VARCHAR(255) DEFAULT NULL,
        message TEXT,
        contactInfo VARCHAR(255) DEFAULT NULL,
        username VARCHAR(255) DEFAULT NULL,
        feedbackType VARCHAR(255) DEFAULT NULL,
        PRIMARY KEY (id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
    `);
  }

  async function ensureReportsTable() {
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
  }

  async function ensureSubscriptionsTable() {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id VARCHAR(10) NOT NULL,
        username VARCHAR(50) DEFAULT NULL,
        stripe_subscription_id VARCHAR(255) NOT NULL,
        stripe_customer_id VARCHAR(255) DEFAULT NULL,
        plan_id VARCHAR(50) DEFAULT NULL,
        plan_name VARCHAR(100) DEFAULT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        current_period_start TIMESTAMP NULL DEFAULT NULL,
        current_period_end TIMESTAMP NULL DEFAULT NULL,
        cancel_at_period_end TINYINT(1) DEFAULT 0,
        canceled_at TIMESTAMP NULL DEFAULT NULL,
        trial_start TIMESTAMP NULL DEFAULT NULL,
        trial_end TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_stripe_subscription_id (stripe_subscription_id),
        KEY idx_sub_user_id (user_id),
        KEY idx_sub_status (status)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
    `);
  }

  async function ensureRedeemCreditsTable() {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS redeemCredits (
        id VARCHAR(36) NOT NULL,
        username VARCHAR(50) DEFAULT NULL,
        userId VARCHAR(10) DEFAULT NULL,
        credits INT NOT NULL DEFAULT 0,
        amountUSD DECIMAL(10,2) NOT NULL DEFAULT 0,
        chain VARCHAR(10) NOT NULL,
        walletAddress VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        date BIGINT DEFAULT NULL,
        time VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_redeem_status (status),
        KEY idx_redeem_user (userId),
        KEY idx_redeem_username (username)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
    `);
  }

  async function ensurePromoSubmissionsTable() {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS promoSubmissions (
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
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
    `);

    const cols = await knex('information_schema.COLUMNS')
      .select('COLUMN_NAME')
      .whereRaw('TABLE_SCHEMA = DATABASE()')
      .andWhere('TABLE_NAME', 'promoSubmissions')
      .whereIn('COLUMN_NAME', ['clicks', 'dislikes', 'likes', 'neutrals', 'impressions', 'billedImpressions', 'billedClicks', 'tags']);

    const existing = new Set((cols || []).map((c) => c.COLUMN_NAME));
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
  }

  async function ensureAdminReviewTables() {
    try {
      await Promise.all([
        ensureSubscriptionsTable(),
        ensureRedeemCreditsTable(),
        ensureVerificationReviewColumns(),
        ensurePromoSubmissionsTable(),
        ensureFeedbackTable(),
        ensureReportsTable(),
      ]);
    } catch (err) {
      console.error('Admin review table bootstrap error:', err.message || err);
    }
  }

  async function runStripeSyncNow(limit = 100) {
    if (!stripeClient) throw new Error('Stripe secret key is not configured');

    await knex('stripeTransactions')
      .where('stripeObjectType', 'payment_intent')
      .update({ stripeChargeId: null })
      .catch(() => {});

    const paymentIntents = await stripeClient.paymentIntents.list({
      limit: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100),
      expand: ['data.customer', 'data.latest_charge']
    });

    const balanceTransactions = await stripeClient.balanceTransactions.list({
      limit: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100),
      expand: ['data.source']
    });

    let inserted = 0;
    let updated = 0;

    for (const pi of paymentIntents.data || []) {
      const customer = pi?.customer && typeof pi.customer === 'object' ? pi.customer : null;
      const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
      const billing = charge?.billing_details || {};
      const metadata = pi?.metadata || {};
      const record = {
        stripeObjectType: 'payment_intent',
        stripeBalanceTransactionId: null,
        stripePaymentIntentId: pi.id,
        stripeChargeId: null,
        stripeCheckoutSessionId: metadata.checkout_session_id || metadata.checkoutSessionId || metadata.session_id || null,
        stripeCustomerId: customer?.id || (typeof pi.customer === 'string' ? pi.customer : null),
        stripeInvoiceId: typeof pi.invoice === 'string' ? pi.invoice : pi.invoice?.id || null,
        stripeSubscriptionId: metadata.subscription_id || metadata.stripe_subscription_id || metadata.subscriptionId || null,
        stripeSourceId: pi.id,
        stripeSourceType: 'payment_intent',
        status: pi.status || 'unknown',
        amount: Number(pi.amount || 0),
        amountReceived: Number(pi.amount_received || 0),
        fee: 0,
        net: Number(pi.amount_received || pi.amount || 0),
        currency: String(pi.currency || 'USD').toUpperCase(),
        paymentMethodTypes: JSON.stringify(pi.payment_method_types || []),
        description: pi.description || null,
        receiptEmail: pi.receipt_email || null,
        customerEmail: customer?.email || billing.email || null,
        customerName: customer?.name || billing.name || null,
        livemode: pi.livemode ? 1 : 0,
        metadata: JSON.stringify(metadata),
        rawPayload: JSON.stringify(pi),
        stripeCreatedAt: pi.created ? new Date(pi.created * 1000).toISOString().slice(0, 19).replace('T', ' ') : null,
        availableOn: null,
        syncedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };

      const existing = await knex('stripeTransactions').where('stripePaymentIntentId', pi.id).first();
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
          status = VALUES(status),
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
        [record.stripeObjectType, record.stripeBalanceTransactionId, record.stripePaymentIntentId, record.stripeChargeId, record.stripeCheckoutSessionId, record.stripeCustomerId, record.stripeInvoiceId, record.stripeSubscriptionId, record.stripeSourceId, record.stripeSourceType, record.status, record.amount, record.amountReceived, record.fee, record.net, record.currency, record.paymentMethodTypes, record.description, record.receiptEmail, record.customerEmail, record.customerName, record.livemode, record.metadata, record.rawPayload, record.stripeCreatedAt, record.availableOn, record.syncedAt]
      );
      if (existing) updated += 1; else inserted += 1;
    }

    for (const tx of balanceTransactions.data || []) {
      const source = tx?.source && typeof tx.source === 'object' ? tx.source : null;
      const billing = source?.billing_details || {};
      const sourceMetadata = source?.metadata || {};
      const record = {
        stripeObjectType: 'balance_transaction',
        stripeBalanceTransactionId: tx.id,
        stripePaymentIntentId: null,
        stripeChargeId: source?.object === 'charge' ? source.id : null,
        stripeCheckoutSessionId: sourceMetadata.checkout_session_id || sourceMetadata.checkoutSessionId || sourceMetadata.session_id || null,
        stripeCustomerId: source?.customer || null,
        stripeInvoiceId: source?.invoice || null,
        stripeSubscriptionId: sourceMetadata.subscription_id || sourceMetadata.stripe_subscription_id || sourceMetadata.subscriptionId || source?.subscription || null,
        stripeSourceId: typeof tx.source === 'string' ? tx.source : source?.id || null,
        stripeSourceType: source?.object || tx.type || null,
        status: source?.status || tx.type || 'unknown',
        amount: Number(tx.amount || 0),
        amountReceived: Number(tx.amount || 0),
        fee: Number(tx.fee || 0),
        net: Number(tx.net || 0),
        currency: String(tx.currency || 'USD').toUpperCase(),
        paymentMethodTypes: JSON.stringify(source?.payment_method_details?.type ? [source.payment_method_details.type] : []),
        description: source?.description || tx.description || null,
        receiptEmail: source?.receipt_email || null,
        customerEmail: billing.email || source?.customer_details?.email || null,
        customerName: billing.name || source?.customer_details?.name || null,
        livemode: tx.livemode ? 1 : 0,
        metadata: JSON.stringify(sourceMetadata),
        rawPayload: JSON.stringify(tx),
        stripeCreatedAt: tx.created ? new Date(tx.created * 1000).toISOString().slice(0, 19).replace('T', ' ') : null,
        availableOn: tx.available_on ? new Date(tx.available_on * 1000).toISOString().slice(0, 19).replace('T', ' ') : null,
        syncedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };

      const existing = await knex('stripeTransactions').where('stripeBalanceTransactionId', tx.id).first();
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
          status = VALUES(status),
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
        [record.stripeObjectType, record.stripeBalanceTransactionId, record.stripePaymentIntentId, record.stripeChargeId, record.stripeCheckoutSessionId, record.stripeCustomerId, record.stripeInvoiceId, record.stripeSubscriptionId, record.stripeSourceId, record.stripeSourceType, record.status, record.amount, record.amountReceived, record.fee, record.net, record.currency, record.paymentMethodTypes, record.description, record.receiptEmail, record.customerEmail, record.customerName, record.livemode, record.metadata, record.rawPayload, record.stripeCreatedAt, record.availableOn, record.syncedAt]
      );
      if (existing) updated += 1; else inserted += 1;
    }

    return {
      inserted,
      updated,
      paymentIntentsScanned: (paymentIntents.data || []).length,
      balanceTransactionsScanned: (balanceTransactions.data || []).length,
      scanned: (paymentIntents.data || []).length + (balanceTransactions.data || []).length,
    };
  }

  async function safeInsertWalletTransaction(db, tx) {
    const fallbackTypes = {
      credit_purchase: 'purchase',
      contributor_reward: 'bonus',
      contribution_refund: 'bonus',
      download_payment: 'contribution',
      creator_earning: 'bonus',
      creator_payout: 'admin_adjustment',
    };

    try {
      await db('walletTransactions').insert(tx);
    } catch (error) {
      const isTypeError = error?.code === 'WARN_DATA_TRUNCATED'
        && /column 'type'/i.test(error?.sqlMessage || error?.message || '');
      const fallbackType = fallbackTypes[tx?.type];

      if (!isTypeError || !fallbackType) {
        console.error('walletTransactions insert error:', error.message || error);
        return;
      }

      await db('walletTransactions').insert({ ...tx, type: fallbackType });
    }
  }

  const fmtDate = (value) => {
    if (!value) return '—';
    try { return new Date(value).toLocaleString(); } catch { return String(value); }
  };
  const fmtMoney = (amount, currency = 'USD') => {
    const num = Number(amount || 0);
    return `${currency} ${num.toLocaleString()}`;
  };
  const statusChip = (status) => {
    const val = String(status || 'unknown');
    const color = ['completed', 'active', 'succeeded', 'paid', 'approved'].includes(val) ? 'var(--green)'
      : ['failed', 'canceled', 'rejected', 'refunded'].includes(val) ? 'var(--red)'
      : ['processing', 'pending', 'incomplete', 'trialing', 'canceling', 'resubmission_requested'].includes(val) ? 'var(--orange)'
      : 'var(--text2)';
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface2);color:${color};font-size:0.8em;font-weight:700;">${escapeHtml(val)}</span>`;
  };

  const extractFeedbackTarget = (message) => {
    const text = String(message || '');
    const idMatch = text.match(/ID:\s*([A-Za-z0-9_-]+)/i);
    const userMatch = text.match(/Target user:\s*([^\n(]+)/i);
    return {
      targetId: idMatch ? String(idMatch[1]).trim() : '',
      targetUsername: userMatch ? String(userMatch[1]).trim() : '',
    };
  };

  const getVerificationAssets = (row = {}) => {
    const username = String(row.username || '').trim();
    const assets = {
      facePath: row.verificationFacePath ? String(row.verificationFacePath) : '',
      idPath: row.verificationIdPath ? String(row.verificationIdPath) : '',
    };

    if ((!assets.facePath || !assets.idPath) && username) {
      try {
        const dir = path.join(__dirname, 'uploads', 'verification', username);
        const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
        for (const fileName of files) {
          const publicUrl = `/uploads/verification/${encodeURIComponent(username)}/${encodeURIComponent(fileName)}`;
          if (!assets.facePath && /^facePic_/i.test(fileName)) assets.facePath = publicUrl;
          if (!assets.idPath && /^idPhoto_/i.test(fileName)) assets.idPath = publicUrl;
        }
      } catch {
        // ignore missing directories
      }
    }

    return assets;
  };

  async function ensureVerificationReviewColumns() {
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
  }

  ensureAdminReviewTables();

  // ═══════════════════════════════════════════════════════
  //  PUBLIC ROUTES (no auth required)
  // ═══════════════════════════════════════════════════════

  // ── Login page ──
  router.get('/login', (req, res) => {
    // If already authenticated, redirect to dashboard
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyToken(cookies[COOKIE]);
    if (payload && payload.role === 'admin') {
      return res.redirect(req.baseUrl + '/');
    }

    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login</title>
  <style>
    :root { --bg: #0f1117; --surface: #1a1d27; --border: #2e3348; --accent: #6c63ff; --text: #e1e4ed; --text2: #8b90a5; --red: #ff6b6b; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 40px 36px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    .login-card h1 { font-size: 1.8em; margin-bottom: 6px; }
    .login-card .sub { color: var(--text2); font-size: 0.9em; margin-bottom: 28px; }
    .login-card input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      border-radius: 8px;
      font-size: 1em;
      margin-bottom: 16px;
      outline: none;
      transition: border-color .2s;
    }
    .login-card input:focus { border-color: var(--accent); }
    .login-card button {
      width: 100%;
      padding: 12px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 1em;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .2s;
    }
    .login-card button:hover { opacity: 0.88; }
    .error-msg { color: var(--red); font-size: 0.85em; margin-bottom: 12px; display: none; }
  </style>
</head>
<body>
  <div class="login-card">
    <h1>🔧 Admin</h1>
    <p class="sub">System administration panel</p>
    <div class="error-msg" id="err"></div>
    <input type="password" id="pwd" placeholder="Admin password" autofocus
           onkeydown="if(event.key==='Enter') doLogin()">
    <button onclick="doLogin()">Sign In</button>
  </div>
  <script>
    async function doLogin() {
      const pwd = document.getElementById('pwd').value;
      const err = document.getElementById('err');
      err.style.display = 'none';
      try {
        const r = await fetch('${req.baseUrl}/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const data = await r.json();
        if (r.ok) {
          location.href = '${req.baseUrl}/';
        } else {
          err.textContent = data.error || 'Invalid password';
          err.style.display = 'block';
        }
      } catch(e) {
        err.textContent = 'Network error';
        err.style.display = 'block';
      }
    }
  </script>
</body>
</html>`);
  });

  // ── Login API ──
  router.post('/api/login', express.json(), (req, res) => {
    const { password } = req.body || {};
    if (!password || password !== SECRET) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    const token = createToken({ role: 'admin', iat: Date.now() });
    res.setHeader('Set-Cookie',
      `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL / 1000}; SameSite=Lax`);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  PROTECTED ROUTES (all require admin auth)
  // ═══════════════════════════════════════════════════════
  router.use(requireAdmin);

  // ── Logout API ──
  router.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie',
      `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    res.json({ ok: true });
  });

  // ══════════════════════════════════════════════
  //  PAGE: Dashboard
  // ══════════════════════════════════════════════
  router.get('/', (req, res) => {
    const uptime = process.uptime();
    const up = {
      d: Math.floor(uptime / 86400),
      h: Math.floor((uptime % 86400) / 3600),
      m: Math.floor((uptime % 3600) / 60),
      s: Math.floor(uptime % 60),
    };
    const mem = process.memoryUsage();
    const fmt = (b) => `${Math.round(b / 1024 / 1024)} MB`;

    const a = analytics || { visitors: new Set(), users: new Set(), totalRequests: 0, dataTx: 0, dataRx: 0, endpointCalls: {} };

    const topEndpoints = Object.entries(a.endpointCalls)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 20)
      .map(([ep, count]) => {
        const [method, ...p] = ep.split(' ');
        const cls = method.toLowerCase();
        return `<tr><td><span class="log-badge ${cls === 'get' ? 'info' : cls === 'post' ? '' : cls === 'delete' ? 'error' : 'warn'}" style="background:${
          cls === 'get' ? '#61affe' : cls === 'post' ? '#49cc90' : cls === 'delete' ? '#f93e3e' : '#fca130'
        }">${escapeHtml(method)}</span> ${escapeHtml(p.join(' '))}</td><td>${count}</td></tr>`;
      }).join('');

    render(req, res, 'Dashboard', '', `
      <h1 class="page-title">📊 Dashboard</h1>
      <div class="grid-4">
        <div class="card">
          <h3>⏱️ Uptime</h3>
          <div class="big-value">${up.d}d ${up.h}h ${up.m}m</div>
          <div class="sub-label">${Math.floor(uptime).toLocaleString()} seconds</div>
        </div>
        <div class="card">
          <h3>💾 Heap Used</h3>
          <div class="big-value">${fmt(mem.heapUsed)}</div>
          <div class="sub-label">of ${fmt(mem.heapTotal)} heap</div>
        </div>
        <div class="card">
          <h3>📊 Requests</h3>
          <div class="big-value">${a.totalRequests.toLocaleString()}</div>
          <div class="sub-label">since start</div>
        </div>
        <div class="card">
          <h3>👥 Visitors</h3>
          <div class="big-value">${a.visitors.size}</div>
          <div class="sub-label">unique IPs</div>
        </div>
      </div>

      <div class="grid-3">
        <div class="card">
          <h3>👤 Users</h3>
          <div class="big-value">${a.users.size}</div>
          <div class="sub-label">accounts touched</div>
        </div>
        <div class="card">
          <h3>📤 TX</h3>
          <div class="big-value">${(a.dataTx / 1024 / 1024).toFixed(2)} MB</div>
          <div class="sub-label">data transmitted</div>
        </div>
        <div class="card">
          <h3>📥 RX</h3>
          <div class="big-value">${(a.dataRx / 1024 / 1024).toFixed(2)} MB</div>
          <div class="sub-label">data received</div>
        </div>
      </div>

      <div class="card">
        <h3>🌐 Environment</h3>
        <table>
          <tr><td>Node</td><td>${process.version}</td></tr>
          <tr><td>Env</td><td>${process.env.NODE_ENV || 'development'}</td></tr>
          <tr><td>RSS</td><td>${fmt(mem.rss)}</td></tr>
          <tr><td>External</td><td>${fmt(mem.external)}</td></tr>
          <tr><td>Platform</td><td>${process.platform} ${process.arch}</td></tr>
          <tr><td>PID</td><td>${process.pid}</td></tr>
        </table>
      </div>

      ${topEndpoints ? `
      <div class="card">
        <h3>🛣️ Top Endpoints</h3>
        <table>
          <thead><tr><th>Endpoint</th><th>Calls</th></tr></thead>
          <tbody>${topEndpoints}</tbody>
        </table>
      </div>` : ''}

      <script>setTimeout(()=>location.reload(), 30000);</script>
    `);
  });

  // ══════════════════════════════════════════════
  //  PAGE: Logs
  // ══════════════════════════════════════════════
  router.get('/logs', (req, res) => {
    const logStore = logs || { entries: [] };
    const type  = req.query.type || 'all';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    let filtered = logStore.entries;
    if (type !== 'all') filtered = filtered.filter(l => l.type === type);
    const display = filtered.slice(-limit).reverse();

    const counts = {
      all:   logStore.entries.length,
      info:  logStore.entries.filter(l => l.type === 'info').length,
      warn:  logStore.entries.filter(l => l.type === 'warn').length,
      error: logStore.entries.filter(l => l.type === 'error').length,
    };

    const logRows = display.length === 0
      ? '<div style="text-align:center;padding:40px;color:var(--text2)">No logs to display</div>'
      : display.map(l => `
        <div class="log-entry ${l.type}">
          <span class="log-time">${new Date(l.timestamp).toLocaleString()}</span>
          <span class="log-badge ${l.type}">${l.type}</span>
          <span>${escapeHtml(l.message)}</span>
        </div>`).join('');

    render(req, res, 'Logs', '/logs', `
      <h1 class="page-title">📋 Server Logs</h1>

      <div class="grid-4" style="margin-bottom:20px">
        <div class="card"><h3>Total</h3><div class="big-value">${counts.all}</div></div>
        <div class="card"><h3>Info</h3><div class="big-value" style="color:var(--green)">${counts.info}</div></div>
        <div class="card"><h3>Warnings</h3><div class="big-value" style="color:var(--orange)">${counts.warn}</div></div>
        <div class="card"><h3>Errors</h3><div class="big-value" style="color:var(--red)">${counts.error}</div></div>
      </div>

      <div class="controls-bar">
        <label>Filter:</label>
        <select id="typeFilter" onchange="applyFilter()">
          <option value="all" ${type === 'all' ? 'selected' : ''}>All</option>
          <option value="info" ${type === 'info' ? 'selected' : ''}>Info</option>
          <option value="warn" ${type === 'warn' ? 'selected' : ''}>Warnings</option>
          <option value="error" ${type === 'error' ? 'selected' : ''}>Errors</option>
        </select>
        <label>Limit:</label>
        <input type="number" id="limitInput" value="${limit}" min="10" max="500" step="10" style="width:80px" onchange="applyFilter()">
        <label><input type="checkbox" id="autoRef" onchange="toggleAuto()"> Auto-refresh 5 s</label>
        <button class="btn btn-outline" onclick="location.reload()">🔄 Refresh</button>
        <button class="btn btn-danger" onclick="clearLogs()">🗑️ Clear</button>
        <button class="btn btn-outline" onclick="exportLogs()">📥 Export</button>
      </div>

      <div class="card" style="max-height:60vh;overflow-y:auto;padding:12px" id="logBox">
        ${logRows}
      </div>

      <script>
        let _auto;
        function applyFilter(){
          const t=document.getElementById('typeFilter').value;
          const l=document.getElementById('limitInput').value;
          location.href='${req.baseUrl}/logs?type='+t+'&limit='+l;
        }
        function toggleAuto(){
          const c=document.getElementById('autoRef');
          if(c.checked) _auto=setInterval(()=>location.reload(),5000);
          else clearInterval(_auto);
        }
        function clearLogs(){
          if(!confirm('Clear all logs?')) return;
          fetch('${req.baseUrl}/api/logs/clear',{method:'POST'}).then(()=>location.reload());
        }
        function exportLogs(){
          fetch('${req.baseUrl}/api/logs/export').then(r=>r.json()).then(d=>{
            const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
            const a=document.createElement('a');
            a.href=URL.createObjectURL(b);
            a.download='logs-'+new Date().toISOString()+'.json';
            a.click();
          });
        }
        document.getElementById('logBox').scrollTop=document.getElementById('logBox').scrollHeight;
      </script>
    `);
  });

  // ── Log APIs ──
  router.post('/api/logs/clear', (req, res) => {
    if (logs) logs.entries = [];
    res.json({ ok: true, message: 'Logs cleared' });
  });

  router.get('/api/logs/export', (req, res) => {
    const logStore = logs || { entries: [] };
    res.json({ exportDate: new Date().toISOString(), total: logStore.entries.length, logs: logStore.entries });
  });

  router.get('/api/logs', (req, res) => {
    const logStore = logs || { entries: [] };
    const type  = req.query.type || 'all';
    const limit = parseInt(req.query.limit) || 100;
    let filtered = logStore.entries;
    if (type !== 'all') filtered = filtered.filter(l => l.type === type);
    res.json({ total: filtered.length, logs: filtered.slice(-limit).reverse() });
  });

  // ── Log file endpoint (raw on-disk log) ──
  router.get('/api/logs/file', (req, res) => {
    const filePath = typeof getLogFilePath === 'function' ? getLogFilePath() : null;
    if (!filePath) return res.status(404).json({ error: 'Log file path not configured' });
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: 'Failed to read log file' });
      res.type('text/plain').send(data);
    });
  });

  // ══════════════════════════════════════════════
  //  PAGE: Health
  // ══════════════════════════════════════════════
  router.get('/health', async (req, res) => {
    const uptime = process.uptime();
    const up = {
      d: Math.floor(uptime / 86400),
      h: Math.floor((uptime % 86400) / 3600),
      m: Math.floor((uptime % 3600) / 60),
      s: Math.floor(uptime % 60),
    };
    const mem = process.memoryUsage();
    const fmt = (b) => `${Math.round(b / 1024 / 1024)} MB`;

    let dbStatus = 'Not configured';
    let dbClass  = 'dot-orange';
    try {
      await knex.raw('SELECT 1');
      dbStatus = 'Connected';
      dbClass  = 'dot-green';
    } catch (e) {
      dbStatus = 'Error: ' + e.message;
      dbClass  = 'dot-red';
    }

    render(req, res, 'Health', '/health', `
      <h1 class="page-title">💚 Health Check</h1>
      <div class="grid-2">
        <div class="card">
          <h3>Server Status</h3>
          <div style="display:flex;align-items:center;gap:8px;margin:12px 0">
            <span class="dot dot-green"></span>
            <span class="big-value" style="font-size:1.4em">Healthy</span>
          </div>
          <table>
            <tr><td>Uptime</td><td>${up.d}d ${up.h}h ${up.m}m ${up.s}s</td></tr>
            <tr><td>Environment</td><td>${process.env.NODE_ENV || 'development'}</td></tr>
            <tr><td>Node</td><td>${process.version}</td></tr>
            <tr><td>Platform</td><td>${process.platform} ${process.arch}</td></tr>
            <tr><td>PID</td><td>${process.pid}</td></tr>
          </table>
        </div>
        <div class="card">
          <h3>Resources</h3>
          <table>
            <tr><td>Heap Used</td><td>${fmt(mem.heapUsed)}</td></tr>
            <tr><td>Heap Total</td><td>${fmt(mem.heapTotal)}</td></tr>
            <tr><td>RSS</td><td>${fmt(mem.rss)}</td></tr>
            <tr><td>External</td><td>${fmt(mem.external)}</td></tr>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Database</h3>
        <div style="display:flex;align-items:center;gap:8px;margin:12px 0">
          <span class="dot ${dbClass}"></span>
          <span style="font-size:1.1em;font-weight:600">${escapeHtml(dbStatus)}</span>
        </div>
        <table>
          <tr><td>Host</td><td>${escapeHtml(dbConfig.host || 'localhost')}</td></tr>
          <tr><td>Port</td><td>${dbConfig.port || 3306}</td></tr>
          <tr><td>Database</td><td>${escapeHtml(dbConfig.database || '—')}</td></tr>
        </table>
      </div>
      <div style="text-align:center;color:var(--text2);margin-top:24px;font-size:0.85em">
        Last checked: ${new Date().toISOString()}
      </div>
      <script>setTimeout(()=>location.reload(), 30000);</script>
    `);
  });

  // ══════════════════════════════════════════════
  //  PAGE: Database Manager
  // ══════════════════════════════════════════════
  router.get('/db', async (req, res) => {
    try {
      const [sizeRes]  = await knex.raw(`SELECT ROUND(SUM(data_length + index_length)/1024/1024, 2) AS size_mb FROM information_schema.TABLES WHERE table_schema = ?`, [dbConfig.database]);
      const [tableRes] = await knex.raw(`SELECT COUNT(*) as count FROM information_schema.TABLES WHERE table_schema = ?`, [dbConfig.database]);
      const [connRes]  = await knex.raw(`SELECT COUNT(*) as count FROM information_schema.PROCESSLIST WHERE DB = ?`, [dbConfig.database]);

      const [tables] = await knex.raw(`
          SELECT TABLE_NAME AS tbl_name, TABLE_ROWS AS tbl_rows, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024/1024, 2) AS size_mb, ENGINE AS tbl_engine
          FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [dbConfig.database]);

        const tableRows = tables.map(t => `
          <tr>
            <td><a href="${req.baseUrl}/db/table/${encodeURIComponent(t.tbl_name)}" style="color:var(--accent);text-decoration:none">${escapeHtml(t.tbl_name)}</a></td>
            <td>${t.tbl_rows}</td>
            <td>${t.size_mb} MB</td>
            <td>${escapeHtml(t.tbl_engine || '—')}</td>
          </tr>`).join('');

        render(req, res, 'Database', '/db', `
          <h1 class="page-title">🗄️ Database Manager</h1>
          <div class="grid-3" style="margin-bottom:20px">
            <div class="card"><h3>Size</h3><div class="big-value">${(sizeRes[0] || {}).size_mb || 0} MB</div></div>
            <div class="card"><h3>Tables</h3><div class="big-value">${(tableRes[0] || {}).count || 0}</div></div>
            <div class="card"><h3>Connections</h3><div class="big-value">${(connRes[0] || {}).count || 0}</div></div>
          </div>
          <div class="card">
            <h3>Tables in ${escapeHtml(dbConfig.database)}</h3>
            <table>
              <thead><tr><th>Name</th><th>Rows</th><th>Size</th><th>Engine</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
          <div class="card">
            <h3>🔍 Run Query (read-only)</h3>
            <textarea id="sql" rows="3" style="width:100%;resize:vertical;font-family:monospace" placeholder="SELECT * FROM users LIMIT 10"></textarea>
            <button class="btn btn-primary" style="margin-top:8px" onclick="runQuery()">Execute</button>
            <div id="queryResult" style="margin-top:12px;overflow-x:auto"></div>
          </div>
          <script>
            async function runQuery(){
              const sql=document.getElementById('sql').value.trim();
              if(!sql) return;
              const r=await fetch('${req.baseUrl}/api/db/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:sql})});
              const d=await r.json();
              const el=document.getElementById('queryResult');
              if(!r.ok){ el.innerHTML='<div style="color:var(--red)">'+d.error+': '+(d.message||'')+'</div>'; return; }
              if(!d.results||!d.results.length){ el.innerHTML='<div style="color:var(--text2)">No results</div>'; return; }
              const cols=Object.keys(d.results[0]);
              let html='<div style="font-size:0.8em;color:var(--text2);margin-bottom:6px">'+d.rowCount+' row(s)</div>';
              html+='<table><thead><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>';
              d.results.forEach(row=>{html+='<tr>'+cols.map(c=>'<td>'+(row[c]===null?'<span style=color:var(--text2)>NULL</span>':row[c])+'</td>').join('')+'</tr>';});
              html+='</tbody></table>';
              el.innerHTML=html;
            }
          </script>
        `);
      } catch (err) {
        render(req, res, 'Database Error', '/db', `<div class="card"><h3>Error</h3><p style="color:var(--red)">${escapeHtml(err.message)}</p></div>`);
      }
  });

  // ── Table browser ──
  router.get('/db/table/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const limit  = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';

    try {
      // Validate table exists in the target schema
      const [chk] = await knex.raw(
        `SELECT table_name FROM information_schema.TABLES WHERE table_schema = ? AND table_name = ?`,
        [dbConfig.database, tableName]);
      if (chk.length === 0) {
        return render(req, res, 'Not Found', '/db', `<div class="card"><h3>Table not found</h3></div>`);
      }

      // Count + fetch (table name validated above; backtick-quoted for safety)
      let countQ = `SELECT COUNT(*) as total FROM \`${tableName}\``;
      let dataQ  = `SELECT * FROM \`${tableName}\``;
      const params = [];

      if (search) {
        const [cols] = await knex.raw(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE table_schema = ? AND table_name = ?`,
          [dbConfig.database, tableName]);
        const cond = cols.map(c => `\`${c.COLUMN_NAME}\` LIKE ?`).join(' OR ');
        const sp   = cols.map(() => `%${search}%`);
        countQ += ` WHERE ${cond}`;
        dataQ  += ` WHERE ${cond}`;
        params.push(...sp);
      }

      const [countRes] = await knex.raw(countQ, params);
      const total = countRes[0].total;
      dataQ += ` LIMIT ? OFFSET ?`;
      const [records] = await knex.raw(dataQ, [...params, limit, offset]);

        const cols = records.length ? Object.keys(records[0]) : [];
        const headerCells = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
        const bodyRows = records.map(row =>
          '<tr>' + cols.map(c => `<td>${row[c] === null ? '<span style="color:var(--text2)">NULL</span>' : escapeHtml(String(row[c]).substring(0, 200))}</td>`).join('') + '</tr>'
        ).join('');

        const prevOffset = Math.max(0, offset - limit);
        const nextOffset = offset + limit;
        const hasPrev = offset > 0;
        const hasNext = nextOffset < total;

        render(req, res, tableName, '/db', `
          <h1 class="page-title"><a href="${req.baseUrl}/db" style="color:var(--text2);text-decoration:none">Database</a> / ${escapeHtml(tableName)}</h1>

          <div class="controls-bar">
            <label>Search:</label>
            <input type="text" id="searchInput" value="${escapeHtml(search)}" placeholder="Search all columns…" style="width:240px"
                   onkeydown="if(event.key==='Enter') applySearch()">
            <button class="btn btn-outline" onclick="applySearch()">Search</button>
            <span style="color:var(--text2);font-size:0.85em">${total} record(s) total · showing ${offset + 1}–${Math.min(offset + limit, total)}</span>
          </div>

          <div class="card" style="overflow-x:auto">
            <table>
              <thead><tr>${headerCells}</tr></thead>
              <tbody>${bodyRows || '<tr><td colspan="99" style="text-align:center;color:var(--text2)">No records</td></tr>'}</tbody>
            </table>
          </div>

          <div style="display:flex;gap:12px;justify-content:center;margin-top:12px">
            ${hasPrev ? `<a class="btn btn-outline" href="${req.baseUrl}/db/table/${encodeURIComponent(tableName)}?limit=${limit}&offset=${prevOffset}&search=${encodeURIComponent(search)}">← Prev</a>` : ''}
            ${hasNext ? `<a class="btn btn-outline" href="${req.baseUrl}/db/table/${encodeURIComponent(tableName)}?limit=${limit}&offset=${nextOffset}&search=${encodeURIComponent(search)}">Next →</a>` : ''}
          </div>

          <script>
            function applySearch(){
              const s=document.getElementById('searchInput').value;
              location.href='${req.baseUrl}/db/table/${encodeURIComponent(tableName)}?search='+encodeURIComponent(s)+'&limit=${limit}';
            }
          </script>
        `);
      } catch (err) {
        render(req, res, 'Error', '/db', `<div class="card"><h3>Error</h3><p style="color:var(--red)">${escapeHtml(err.message)}</p></div>`);
      }
  });

  // ── DB API endpoints ──
  router.get('/api/db/stats', async (req, res) => {
    try {
      const [sizeRes]  = await knex.raw(`SELECT ROUND(SUM(data_length+index_length)/1024/1024, 2) AS size_mb FROM information_schema.TABLES WHERE table_schema = ?`, [dbConfig.database]);
      const [tableRes] = await knex.raw(`SELECT COUNT(*) as count FROM information_schema.TABLES WHERE table_schema = ?`, [dbConfig.database]);
      const [connRes]  = await knex.raw(`SELECT COUNT(*) as count FROM information_schema.PROCESSLIST WHERE DB = ?`, [dbConfig.database]);
      const [tables]   = await knex.raw(`SELECT table_name, table_rows, ROUND((data_length+index_length)/1024/1024,2) AS size_mb, engine, table_collation FROM information_schema.TABLES WHERE table_schema = ? ORDER BY table_name`, [dbConfig.database]);

      res.json({
        databaseSize: (sizeRes[0] || {}).size_mb,
        totalTables: (tableRes[0] || {}).count,
        activeConnections: (connRes[0] || {}).count,
        tables,
        databaseName: dbConfig.database,
        host: dbConfig.host,
        port: dbConfig.port,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve database statistics', message: err.message });
    }
  });

  router.get('/api/db/tables', async (req, res) => {
    try {
      const [tables] = await knex.raw(`
          SELECT table_name as name, table_rows as \`rows\`, ROUND((data_length+index_length)/1024/1024,2) AS size, engine, create_time, update_time
          FROM information_schema.TABLES WHERE table_schema = ? ORDER BY table_name`, [dbConfig.database]);
      res.json({ tables: tables.map(t => ({ ...t, size: `${t.size} MB` })) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve tables', message: err.message });
    }
  });

  router.get('/api/db/table/:tableName', async (req, res) => {
    try {
      const { tableName } = req.params;
      const limit  = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const search = req.query.search || '';

      const [chk] = await knex.raw(
        `SELECT table_name FROM information_schema.TABLES WHERE table_schema = ? AND table_name = ?`,
        [dbConfig.database, tableName]);
      if (chk.length === 0) return res.status(404).json({ error: 'Table not found' });

      let countQ = `SELECT COUNT(*) as total FROM \`${tableName}\``;
      let dataQ  = `SELECT * FROM \`${tableName}\``;
      const params = [];

      if (search) {
        const [cols] = await knex.raw(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE table_schema = ? AND table_name = ?`,
          [dbConfig.database, tableName]);
        const cond = cols.map(c => `\`${c.COLUMN_NAME}\` LIKE ?`).join(' OR ');
        const sp   = cols.map(() => `%${search}%`);
        countQ += ` WHERE ${cond}`;
        dataQ  += ` WHERE ${cond}`;
        params.push(...sp);
      }

      const [countRes] = await knex.raw(countQ, params);
      dataQ += ` LIMIT ? OFFSET ?`;
      const [records] = await knex.raw(dataQ, [...params, limit, offset]);

      res.json({ records, total: countRes[0].total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve records', message: err.message });
    }
  });

  router.post('/api/db/query', express.json(), async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: 'Query is required' });

      const trimmed = query.trim().toUpperCase();
      if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('SHOW') && !trimmed.startsWith('DESCRIBE')) {
        return res.status(403).json({ error: 'Only SELECT, SHOW, and DESCRIBE queries are allowed' });
      }

      const [results] = await knex.raw(query);
      res.json({ success: true, results, rowCount: results.length });
    } catch (err) {
      res.status(500).json({ error: 'Query execution failed', message: err.message });
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE/API: Moderation
  // ══════════════════════════════════════════════
  router.get('/moderation', async (req, res) => {
    try {
      await Promise.all([ensureFeedbackTable(), ensureReportsTable()]);

      const [reportRowsRaw, feedbackRows, bannedUsers] = await Promise.all([
        knex.raw(`
          SELECT
            r.id,
            r.reporterId,
            reporter.username AS reporterUsername,
            r.targetType,
            r.targetId,
            target.username AS targetUsername,
            target.email AS targetEmail,
            target.isBanned AS targetIsBanned,
            target.banReason AS targetBanReason,
            r.type,
            r.description,
            r.status,
            r.moderatorNote,
            r.created_at
          FROM reports r
          LEFT JOIN userData reporter ON reporter.id = r.reporterId
          LEFT JOIN userData target ON r.targetType = 'user' AND target.id = r.targetId
          ORDER BY FIELD(r.status, 'pending', 'reviewed', 'resolved', 'dismissed'), r.created_at DESC
          LIMIT 100
        `),
        knex('feedback').select('*').orderBy('created_at', 'desc').limit(100),
        knex('userData')
          .select('id', 'username', 'email', 'banReason', 'banDate', 'banDuration')
          .where('isBanned', 1)
          .orderBy('banDate', 'desc')
          .limit(50),
      ]);

      const reportRows = Array.isArray(reportRowsRaw?.[0]) ? reportRowsRaw[0] : reportRowsRaw?.rows || [];
      const unresolvedReports = reportRows.filter((row) => ['pending', 'reviewed'].includes(String(row.status))).length;

      const reportsHtml = reportRows.length
        ? reportRows.map((row) => {
            const noteId = `report-note-${row.id}`;
            const canBan = row.targetType === 'user' && row.targetId;
            const targetLabel = row.targetType === 'user'
              ? `${row.targetUsername || 'Unknown'} (${row.targetId})`
              : `${row.targetType}:${row.targetId}`;

            return `<tr>
              <td>#${row.id}</td>
              <td>${escapeHtml(row.reporterUsername || row.reporterId || 'Unknown')}</td>
              <td>
                <div>${escapeHtml(targetLabel)}</div>
                ${row.targetType === 'user' && row.targetId ? `<a href="/user/${encodeURIComponent(row.targetId)}" target="_blank" rel="noopener noreferrer" style="font-size:.8em;color:var(--accent2);text-decoration:none;">Open profile</a>` : ''}
              </td>
              <td>${statusChip(row.type)}</td>
              <td>${statusChip(row.status)}</td>
              <td style="max-width:320px;white-space:pre-wrap;">${escapeHtml(row.description || '—')}</td>
              <td>
                <textarea id="${noteId}" rows="3" style="width:100%;min-width:220px;resize:vertical;">${escapeHtml(String(row.moderatorNote || ''))}</textarea>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                  <button class="btn btn-outline" onclick="updateReport(${row.id}, 'reviewed')">Review</button>
                  <button class="btn btn-primary" onclick="updateReport(${row.id}, 'resolved')">Resolve</button>
                  <button class="btn btn-outline" onclick="updateReport(${row.id}, 'dismissed')">Dismiss</button>
                  ${canBan ? `<button class="btn btn-danger" onclick='banUser(${JSON.stringify(String(row.targetId))}, ${row.id})'>Ban user</button>` : ''}
                </div>
                ${row.targetIsBanned ? `<div style="margin-top:8px;color:var(--red);font-size:.82em;">Banned${row.targetBanReason ? `: ${escapeHtml(String(row.targetBanReason))}` : ''}</div>` : ''}
              </td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="7" style="color:var(--text2);text-align:center;padding:18px;">No reports found.</td></tr>';

      const feedbackHtml = feedbackRows.length
        ? feedbackRows.map((row) => {
            const extracted = extractFeedbackTarget(row.message);
            return `<tr>
              <td>#${row.id}</td>
              <td>${escapeHtml(row.username || 'Anonymous')}</td>
              <td>${escapeHtml(row.title || 'Untitled')}</td>
              <td>${statusChip(row.feedbackType || 'other')}</td>
              <td style="max-width:340px;white-space:pre-wrap;">${escapeHtml(row.message || '—')}</td>
              <td>
                <div>${escapeHtml(row.contactInfo || '—')}</div>
                ${(extracted.targetId || extracted.targetUsername)
                  ? `<div style="margin-top:6px;font-size:.8em;color:var(--text2);">Target: ${escapeHtml(extracted.targetUsername || 'Unknown')}${extracted.targetId ? ` (${escapeHtml(extracted.targetId)})` : ''}</div>`
                  : ''}
                <div style="margin-top:8px;"><button class="btn btn-outline" onclick="archiveFeedback(${row.id})">Archive</button></div>
              </td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="6" style="color:var(--text2);text-align:center;padding:18px;">No feedback found.</td></tr>';

      const bannedHtml = bannedUsers.length
        ? bannedUsers.map((row) => `<tr>
            <td>${escapeHtml(row.username || row.id)}</td>
            <td>${escapeHtml(row.email || '—')}</td>
            <td>${escapeHtml(row.banReason || '—')}</td>
            <td>${fmtDate(row.banDate)}</td>
            <td>${row.banDuration ? `${escapeHtml(String(row.banDuration))} days` : 'Permanent'}</td>
            <td><button class="btn btn-outline" onclick='unbanUser(${JSON.stringify(String(row.id))})'>Unban</button></td>
          </tr>`).join('')
        : '<tr><td colspan="6" style="color:var(--text2);text-align:center;padding:18px;">No banned users.</td></tr>';

      render(req, res, 'Moderation', '/moderation', `
        <h1 class="page-title">🛡️ Moderation</h1>
        <div id="moderation-status" class="card" style="display:none;padding:12px 16px;"></div>

        <div class="grid-4">
          <div class="card"><h3>Open Reports</h3><div class="big-value">${unresolvedReports}</div></div>
          <div class="card"><h3>Feedback</h3><div class="big-value">${feedbackRows.length}</div></div>
          <div class="card"><h3>Banned Users</h3><div class="big-value">${bannedUsers.length}</div></div>
          <div class="card"><h3>Admin Notice</h3><div class="big-value">Ready</div></div>
        </div>

        <div class="grid-2">
          <div class="card">
            <h3>Send Admin Notification</h3>
            <form id="admin-notify-form" style="display:grid;gap:10px;">
              <input type="text" id="notify-target" placeholder="User ID or username" required>
              <input type="text" id="notify-title" placeholder="Title" required>
              <textarea id="notify-message" rows="4" placeholder="Message" required></textarea>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <select id="notify-priority"><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Error</option></select>
                <select id="notify-category"><option value="moderation">Moderation</option><option value="account">Account</option><option value="system">System</option></select>
              </div>
              <input type="text" id="notify-action-url" placeholder="Optional action URL">
              <button type="submit" class="btn btn-primary">Send</button>
            </form>
          </div>

          <div class="card">
            <h3>Banned Users</h3>
            <div style="overflow-x:auto;"><table><thead><tr><th>User</th><th>Email</th><th>Reason</th><th>Banned At</th><th>Duration</th><th>Action</th></tr></thead><tbody>${bannedHtml}</tbody></table></div>
          </div>
        </div>

        <div class="card">
          <h3>Formal Reports</h3>
          <div style="overflow-x:auto;"><table><thead><tr><th>ID</th><th>Reporter</th><th>Target</th><th>Type</th><th>Status</th><th>Description</th><th>Actions</th></tr></thead><tbody>${reportsHtml}</tbody></table></div>
        </div>

        <div class="card">
          <h3>Feedback & Abuse Tips</h3>
          <div style="overflow-x:auto;"><table><thead><tr><th>ID</th><th>From</th><th>Title</th><th>Type</th><th>Message</th><th>Contact / Action</th></tr></thead><tbody>${feedbackHtml}</tbody></table></div>
        </div>

        <script>
          function showModerationStatus(kind, message) {
            const el = document.getElementById('moderation-status');
            el.style.display = 'block';
            el.style.border = kind === 'error' ? '1px solid rgba(255,107,107,.4)' : '1px solid rgba(78,205,196,.35)';
            el.style.background = kind === 'error' ? 'rgba(255,107,107,.08)' : 'rgba(78,205,196,.08)';
            el.style.color = kind === 'error' ? 'var(--red)' : 'var(--accent2)';
            el.textContent = message;
          }
          async function postJson(url, body) {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed');
            return data;
          }
          async function updateReport(id, status) {
            try {
              const moderatorNote = document.getElementById('report-note-' + id)?.value || '';
              await postJson('{{BASE}}/api/moderation/report/' + encodeURIComponent(id) + '/status', { status, moderatorNote });
              showModerationStatus('success', 'Report updated.');
              location.reload();
            } catch (error) { showModerationStatus('error', error.message || 'Failed.'); }
          }
          async function banUser(userId, sourceReportId) {
            const reason = window.prompt('Ban reason');
            if (reason === null) return;
            const durationDays = window.prompt('Ban duration in days (blank = permanent)', '');
            try {
              await postJson('{{BASE}}/api/moderation/user/' + encodeURIComponent(userId) + '/ban', { reason, durationDays, sourceReportId });
              showModerationStatus('success', 'User banned.');
              location.reload();
            } catch (error) { showModerationStatus('error', error.message || 'Failed.'); }
          }
          async function unbanUser(userId) {
            try {
              await postJson('{{BASE}}/api/moderation/user/' + encodeURIComponent(userId) + '/unban', {});
              showModerationStatus('success', 'User unbanned.');
              location.reload();
            } catch (error) { showModerationStatus('error', error.message || 'Failed.'); }
          }
          async function archiveFeedback(id) {
            if (!window.confirm('Archive this feedback entry?')) return;
            try {
              await postJson('{{BASE}}/api/moderation/feedback/' + encodeURIComponent(id) + '/archive', {});
              showModerationStatus('success', 'Feedback archived.');
              location.reload();
            } catch (error) { showModerationStatus('error', error.message || 'Failed.'); }
          }
          document.getElementById('admin-notify-form')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
              await postJson('{{BASE}}/api/moderation/notifications', {
                target: document.getElementById('notify-target').value,
                title: document.getElementById('notify-title').value,
                message: document.getElementById('notify-message').value,
                priority: document.getElementById('notify-priority').value,
                category: document.getElementById('notify-category').value,
                actionUrl: document.getElementById('notify-action-url').value,
              });
              event.target.reset();
              showModerationStatus('success', 'Notification sent.');
            } catch (error) { showModerationStatus('error', error.message || 'Failed.'); }
          });
        </script>
      `);
    } catch (err) {
      render(req, res, 'Moderation', '/moderation', `<div class="card"><h3 style="color:var(--red);">Error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`);
    }
  });

  router.post('/api/moderation/report/:id/status', express.json(), async (req, res) => {
    const reportId = Number(req.params.id);
    const status = String(req.body?.status || '').trim().toLowerCase();
    const moderatorNote = String(req.body?.moderatorNote || '').trim();

    if (!Number.isFinite(reportId)) return res.status(400).json({ ok: false, error: 'Invalid report id' });
    if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Invalid report status' });
    }

    try {
      await ensureReportsTable();
      const existing = await knex('reports').where('id', reportId).first();
      if (!existing) return res.status(404).json({ ok: false, error: 'Report not found' });
      await knex('reports').where('id', reportId).update({
        status,
        moderatorNote,
        resolvedAt: ['resolved', 'dismissed'].includes(status) ? knex.fn.now() : null,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.post('/api/moderation/user/:id/ban', express.json(), async (req, res) => {
    const userId = String(req.params.id || '').trim();
    const reason = String(req.body?.reason || '').trim() || 'Banned by admin moderation review';
    const sourceReportId = Number(req.body?.sourceReportId || 0);
    const parsedDuration = parseInt(String(req.body?.durationDays || '').trim(), 10);
    const durationDays = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;
    if (!userId) return res.status(400).json({ ok: false, error: 'Invalid user id' });

    const trx = await knex.transaction();
    try {
      await ensureReportsTable();
      const user = await trx('userData').where('id', userId).first();
      if (!user) {
        await trx.rollback();
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      await trx('userData').where('id', userId).update({ isBanned: 1, banReason: reason, banDate: trx.fn.now(), banDuration: durationDays });

      if (Number.isFinite(sourceReportId) && sourceReportId > 0) {
        const report = await trx('reports').where('id', sourceReportId).first();
        if (report) {
          const mergedNote = [String(report.moderatorNote || '').trim(), `Ban action: ${reason}`].filter(Boolean).join('\n');
          await trx('reports').where('id', sourceReportId).update({ status: 'resolved', moderatorNote: mergedNote, resolvedAt: trx.fn.now() });
        }
      }

      await trx.commit();
      await createNotif(pool, {
        userId,
        type: 'account_banned',
        title: 'Account restricted',
        message: durationDays ? `Your account has been suspended for ${durationDays} day(s). Reason: ${reason}` : `Your account has been suspended. Reason: ${reason}`,
        priority: 'error',
        category: 'moderation',
        actionUrl: '/help',
      }).catch((error) => console.warn('Failed to send ban notification:', error.message || error));

      res.json({ ok: true });
    } catch (err) {
      await trx.rollback();
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.post('/api/moderation/user/:id/unban', express.json(), async (req, res) => {
    const userId = String(req.params.id || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'Invalid user id' });

    try {
      const user = await knex('userData').where('id', userId).first();
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
      await knex('userData').where('id', userId).update({ isBanned: 0, banReason: null, banDate: null, banDuration: null });

      await createNotif(pool, {
        userId,
        type: 'account_restored',
        title: 'Account access restored',
        message: 'An admin removed the restriction on your account.',
        priority: 'success',
        category: 'account',
        actionUrl: '/account',
      }).catch((error) => console.warn('Failed to send unban notification:', error.message || error));

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.post('/api/moderation/notifications', express.json(), async (req, res) => {
    const target = String(req.body?.target || '').trim();
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    const priority = String(req.body?.priority || 'info').trim().toLowerCase();
    const category = String(req.body?.category || 'moderation').trim().toLowerCase();
    const actionUrl = String(req.body?.actionUrl || '').trim() || null;

    if (!target || !title || !message) return res.status(400).json({ ok: false, error: 'Target, title, and message are required' });

    try {
      const user = await knex('userData').where('id', target).orWhere('username', target).first();
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

      await createNotif(pool, { userId: user.id, type: 'admin_message', title, message, priority, category, actionUrl });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.post('/api/moderation/feedback/:id/archive', express.json(), async (req, res) => {
    const feedbackId = Number(req.params.id);
    if (!Number.isFinite(feedbackId)) return res.status(400).json({ ok: false, error: 'Invalid feedback id' });

    try {
      await ensureFeedbackTable();
      await knex('feedback').where('id', feedbackId).del();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE: Verification Document Review
  // ══════════════════════════════════════════════
  router.get('/review/verifications', async (req, res) => {
    try {
      await ensureVerificationReviewColumns();
      const statusFilter = String(req.query.status || 'pending');

      const rows = await knex('userData')
        .select(
          'id',
          'username',
          'email',
          'firstName',
          'lastName',
          'phoneNumber',
          'birthDate',
          'credits',
          'accountType',
          'createdAt',
          'updatedAt',
          'verification',
          'verificationFacePath',
          'verificationIdPath',
          'verificationDocsStatus',
          'verificationDocsNotes',
          'verificationDocsReviewedAt',
          'verificationDocsReviewedBy'
        )
        .where((builder) => {
          builder
            .whereNotNull('verificationFacePath')
            .orWhereNotNull('verificationIdPath')
            .orWhere('verification', 'pending')
            .orWhereNotNull('verificationDocsStatus');
        })
        .orderBy('updatedAt', 'desc')
        .orderBy('createdAt', 'desc');

      const submissions = rows
        .map((row) => ({
          ...row,
          verificationDocsStatus: row.verificationDocsStatus || (row.verification === 'pending' ? 'pending' : 'submitted'),
        }))
        .filter((row) => statusFilter === 'all' ? true : row.verificationDocsStatus === statusFilter)
        .map((row, index) => {
          const domId = String(row.id || `user_${index}`).replace(/[^a-zA-Z0-9_-]/g, '_');
          const assets = getVerificationAssets(row);
          const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || '—';
          const faceViewer = assets.facePath
            ? `<div class="zoom-wrap" id="viewer-${domId}-face" data-zoom="1">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                  <strong>Face Photo</strong>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn btn-outline" style="padding:6px 10px;" onclick="zoomImage('viewer-${domId}-face', 0.2)">＋</button>
                    <button class="btn btn-outline" style="padding:6px 10px;" onclick="zoomImage('viewer-${domId}-face', -0.2)">－</button>
                    <button class="btn btn-outline" style="padding:6px 10px;" onclick="resetZoom('viewer-${domId}-face')">Reset</button>
                    <a class="btn btn-outline" style="padding:6px 10px;text-decoration:none;" href="${escapeHtml(assets.facePath)}" target="_blank" rel="noopener noreferrer">Open full</a>
                  </div>
                </div>
                <div class="zoom-stage">
                  <img src="${escapeHtml(assets.facePath)}" alt="Face photo for ${escapeHtml(String(row.username || row.email || 'user'))}">
                </div>
                <div class="sub-label" style="margin-top:8px;">Scroll to zoom and drag to pan.</div>
              </div>`
            : `<div class="card" style="margin:0;"><h3>Face Photo</h3><p style="color:var(--text2)">No face photo found for this submission.</p></div>`;


          const idViewer = assets.idPath
            ? `<div class="zoom-wrap" id="viewer-${domId}-id" data-zoom="1">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                  <strong>ID Photo</strong>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn btn-outline" style="padding:6px 10px;" onclick="zoomImage('viewer-${domId}-id', 0.2)">＋</button>
                    <button class="btn btn-outline" style="padding:6px 10px;" onclick="zoomImage('viewer-${domId}-id', -0.2)">－</button>
                    <button class="btn btn-outline" style="padding:6px 10px;" onclick="resetZoom('viewer-${domId}-id')">Reset</button>
                    <a class="btn btn-outline" style="padding:6px 10px;text-decoration:none;" href="${escapeHtml(assets.idPath)}" target="_blank" rel="noopener noreferrer">Open full</a>
                  </div>
                </div>
                <div class="zoom-stage">
                  <img src="${escapeHtml(assets.idPath)}" alt="ID photo for ${escapeHtml(String(row.username || row.email || 'user'))}">
                </div>
                <div class="sub-label" style="margin-top:8px;">Scroll to zoom and drag to pan.</div>
              </div>`
            : `<div class="card" style="margin:0;"><h3>ID Photo</h3><p style="color:var(--text2)">No ID photo found for this submission.</p></div>`;

          return `
            <div class="card">
              <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:16px;">
                <div>
                  <h3>Submission ${index + 1}</h3>
                  <div class="big-value" style="font-size:1.3em;">${escapeHtml(String(row.username || 'Unknown user'))}</div>
                  <div class="sub-label">${escapeHtml(String(row.email || '—'))}</div>
                </div>
                <div style="text-align:right;">
                  <div style="margin-bottom:6px;">${statusChip(row.verificationDocsStatus)}</div>
                  <div class="sub-label">Overall verification: ${escapeHtml(String(row.verification || '—'))}</div>
                </div>
              </div>

              <div class="grid-3">
                <div class="card" style="margin:0;">
                  <h3>Profile Data</h3>
                  <table>
                    <tr><td>Username</td><td>${escapeHtml(String(row.username || '—'))}</td></tr>
                    <tr><td>Name</td><td>${escapeHtml(fullName)}</td></tr>
                    <tr><td>Email</td><td>${escapeHtml(String(row.email || '—'))}</td></tr>
                    <tr><td>Phone</td><td>${escapeHtml(String(row.phoneNumber || '—'))}</td></tr>
                    <tr><td>Birth Date</td><td>${escapeHtml(String(row.birthDate || '—'))}</td></tr>
                  </table>
                </div>
                <div class="card" style="margin:0;">
                  <h3>Account</h3>
                  <table>
                    <tr><td>User ID</td><td>${escapeHtml(String(row.id || '—'))}</td></tr>
                    <tr><td>Plan</td><td>${escapeHtml(String(row.accountType || 'free'))}</td></tr>
                    <tr><td>Credits</td><td>${Number(row.credits || 0).toLocaleString()}</td></tr>
                    <tr><td>Joined</td><td>${escapeHtml(fmtDate(row.createdAt))}</td></tr>
                    <tr><td>Updated</td><td>${escapeHtml(fmtDate(row.updatedAt))}</td></tr>
                  </table>
                </div>
                <div class="card" style="margin:0;">
                  <h3>Review State</h3>
                  <table>
                    <tr><td>Docs Status</td><td>${escapeHtml(String(row.verificationDocsStatus || 'pending'))}</td></tr>
                    <tr><td>Reviewed By</td><td>${escapeHtml(String(row.verificationDocsReviewedBy || '—'))}</td></tr>
                    <tr><td>Reviewed At</td><td>${escapeHtml(fmtDate(row.verificationDocsReviewedAt))}</td></tr>
                  </table>
                </div>
              </div>

              <div class="grid-2" style="margin-top:16px;">
                ${faceViewer}
                ${idViewer}
              </div>

              <div class="card" style="margin:16px 0 0 0;">
                <h3>Moderator Actions</h3>
                <textarea id="notes-${domId}" rows="4" style="width:100%;resize:vertical;font-family:inherit;" placeholder="Leave review notes for this submission…">${escapeHtml(String(row.verificationDocsNotes || ''))}</textarea>
                <div class="controls-bar" style="margin-top:12px;">
                  <button class="btn btn-primary" onclick='reviewDoc(${JSON.stringify(String(row.id || ''))}, ${JSON.stringify(domId)}, "approve")'>✅ Approve Docs</button>
                  <button class="btn btn-outline" onclick='reviewDoc(${JSON.stringify(String(row.id || ''))}, ${JSON.stringify(domId)}, "resubmit")'>🔄 Request Re-upload</button>
                  <button class="btn btn-danger" onclick='reviewDoc(${JSON.stringify(String(row.id || ''))}, ${JSON.stringify(domId)}, "reject")'>⛔ Reject</button>
                  <span id="result-${domId}" style="color:var(--text2);font-size:0.9em;"></span>
                </div>
              </div>
            </div>`;
        })
        .join('');

      const filterButton = (value, label) => {
        const active = statusFilter === value;
        return `<a href="{{BASE}}/review/verifications?status=${encodeURIComponent(value)}" class="btn ${active ? 'btn-primary' : 'btn-outline'}" style="font-size:0.78em;padding:5px 10px;text-decoration:none;">${escapeHtml(label)}</a>`;
      };

      render(req, res, 'ID Review', '/review/verifications', `
        <style>
          .zoom-wrap {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 14px;
          }
          .zoom-stage {
            height: 420px;
            overflow: auto;
            background: #0b0d12;
            border: 1px solid var(--border);
            border-radius: 10px;
            cursor: grab;
          }
          .zoom-stage.dragging { cursor: grabbing; }
          .zoom-stage img {
            display: block;
            width: 100%;
            max-width: none;
            transform-origin: top left;
            user-select: none;
            -webkit-user-drag: none;
          }
        </style>
        <h1 class="page-title">🪪 ID & Photo Review</h1>
        <div class="controls-bar" style="margin-bottom:16px;">
          <span style="color:var(--text2);font-size:0.9em;">Filter:</span>
          ${filterButton('pending', 'Pending')}
          ${filterButton('approved', 'Approved')}
          ${filterButton('resubmission_requested', 'Needs Re-upload')}
          ${filterButton('rejected', 'Rejected')}
          ${filterButton('all', 'All')}
        </div>
        ${submissions || '<div class="card"><h3>No submissions</h3><p style="color:var(--text2)">No ID or face-photo uploads are waiting for review.</p></div>'}
        <script>
          function applyZoom(root, nextZoom) {
            if (!root) return;
            const clamped = Math.max(1, Math.min(nextZoom, 4));
            root.dataset.zoom = String(clamped);
            const img = root.querySelector('img');
            if (img) img.style.width = (clamped * 100) + '%';
          }
          function zoomImage(rootId, delta) {
            const root = document.getElementById(rootId);
            const current = parseFloat(root?.dataset?.zoom || '1');
            applyZoom(root, current + delta);
          }
          function resetZoom(rootId) {
            const root = document.getElementById(rootId);
            applyZoom(root, 1);
            const stage = root?.querySelector('.zoom-stage');
            if (stage) {
              stage.scrollLeft = 0;
              stage.scrollTop = 0;
            }
          }
          document.querySelectorAll('.zoom-stage').forEach((stage) => {
            let dragging = false;
            let startX = 0;
            let startY = 0;
            let left = 0;
            let top = 0;
            stage.addEventListener('mousedown', (event) => {
              dragging = true;
              startX = event.clientX;
              startY = event.clientY;
              left = stage.scrollLeft;
              top = stage.scrollTop;
              stage.classList.add('dragging');
            });
            window.addEventListener('mouseup', () => {
              dragging = false;
              stage.classList.remove('dragging');
            });
            stage.addEventListener('mousemove', (event) => {
              if (!dragging) return;
              stage.scrollLeft = left - (event.clientX - startX);
              stage.scrollTop = top - (event.clientY - startY);
            });
            stage.addEventListener('wheel', (event) => {
              event.preventDefault();
              const root = stage.closest('.zoom-wrap');
              if (!root) return;
              zoomImage(root.id, event.deltaY < 0 ? 0.15 : -0.15);
            }, { passive: false });
          });
          async function reviewDoc(userId, domId, action) {
            const result = document.getElementById('result-' + domId);
            const notes = document.getElementById('notes-' + domId)?.value || '';
            if (result) result.textContent = 'Saving…';
            try {
              const response = await fetch('{{BASE}}/api/review/verification/' + encodeURIComponent(userId) + '/' + encodeURIComponent(action), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes })
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || 'Unable to save review action');
              if (result) result.textContent = data.message || 'Saved';
              setTimeout(() => location.reload(), 500);
            } catch (error) {
              if (result) result.textContent = error.message || 'Action failed';
            }
          }
        </script>
      `);
    } catch (err) {
      render(req, res, 'ID Review', '/review/verifications', `<div class="card"><h3 style="color:var(--red);">Error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`);
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE: Ads / Promo Review
  // ══════════════════════════════════════════════

  router.get('/review/promos', async (req, res) => {
    try {
      await ensurePromoSubmissionsTable();
      const status = String(req.query.status || 'pending');
      let q = knex('promoSubmissions').select('*');
      if (status !== 'all') q = q.where('status', status);
      const rows = await q.orderBy('created_at', 'desc').limit(100);
      const all = await knex('promoSubmissions').select('status');

      const counts = {
        total: all.length,
        pending: all.filter((r) => String(r.status || '') === 'pending').length,
        approved: all.filter((r) => String(r.status || '') === 'approved').length,
        rejected: all.filter((r) => String(r.status || '') === 'rejected').length,
      };

      const filterBtn = (label, value) => {
        const active = value === status;
        const query = value ? `?status=${encodeURIComponent(value)}` : '';
        return `<a href="{{BASE}}/review/promos${query}" class="btn ${active ? 'btn-primary' : 'btn-outline'}" style="font-size:0.78em;padding:5px 10px;">${escapeHtml(label)}</a>`;
      };

      const previewCell = (row) => {
        const src = row.assetPath || row.mediaUrl || '';
        if (!src) return '<span style="color:var(--text2)">No media</span>';
        if (String(row.mediaType) === 'image') {
          return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(src)}" alt="promo preview" style="width:84px;height:84px;object-fit:cover;border-radius:10px;border:1px solid var(--border);"></a>`;
        }
        if (String(row.mediaType) === 'audio') {
          return `<audio controls style="max-width:220px;"><source src="${escapeHtml(src)}"></audio>`;
        }
        return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none;">Open link</a>`;
      };

      const bodyRows = rows.map((row) => `<tr>
        <td>${escapeHtml(String(row.title || '—'))}<div style="color:var(--text2);font-size:0.8em;margin-top:4px;">${escapeHtml(String(row.description || '')).slice(0, 140)}</div></td>
        <td>${escapeHtml(String(row.username || row.email || '—'))}<div style="color:var(--text2);font-size:0.8em;">${escapeHtml(String(row.contactEmail || '—'))}</div></td>
        <td>${escapeHtml(String(row.submissionType || '—'))}</td>
        <td>${escapeHtml(String(row.mediaType || '—'))}</td>
        <td>${previewCell(row)}</td>
        <td>${escapeHtml(String(row.targetDropId || '—'))}</td>
        <td>$${Number(row.budgetUsd || 0).toFixed(2)}</td>
        <td>${statusChip(row.status)}</td>
        <td style="font-size:0.82em;color:var(--text2);">${fmtDate(row.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-primary" style="font-size:0.75em;padding:5px 9px;" onclick="promoAction('${escapeHtml(String(row.id || ''))}', 'approve')">Approve</button>
            <button class="btn btn-outline" style="font-size:0.75em;padding:5px 9px;" onclick="promoAction('${escapeHtml(String(row.id || ''))}', 'hold')">Hold</button>
            <button class="btn btn-danger" style="font-size:0.75em;padding:5px 9px;" onclick="promoAction('${escapeHtml(String(row.id || ''))}', 'reject')">Reject</button>
          </div>
        </td>
      </tr>`).join('');

      const body = `
        <h1 class="page-title">📣 Ads & Promo Review</h1>
        <div class="grid-4">
          <div class="card"><h3>Total</h3><div class="big-value">${counts.total}</div><div class="sub-label">All submissions</div></div>
          <div class="card"><h3>Pending</h3><div class="big-value">${counts.pending}</div><div class="sub-label">Awaiting review</div></div>
          <div class="card"><h3>Approved</h3><div class="big-value">${counts.approved}</div><div class="sub-label">Ready to run</div></div>
          <div class="card"><h3>Rejected</h3><div class="big-value">${counts.rejected}</div><div class="sub-label">Declined items</div></div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">
            <h3 style="margin-bottom:0;">Promo queue</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${filterBtn('Pending', 'pending')}
              ${filterBtn('Approved', 'approved')}
              ${filterBtn('Hold', 'hold')}
              ${filterBtn('Rejected', 'rejected')}
              ${filterBtn('All', 'all')}
            </div>
          </div>
          <div style="overflow-x:auto;margin-top:14px;">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Media</th>
                  <th>Preview</th>
                  <th>Target Drop</th>
                  <th>Budget</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>${bodyRows || '<tr><td colspan="10" style="text-align:center;color:var(--text2);padding:28px;">No promo submissions found.</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <script>
          async function promoAction(id, action) {
            const notes = prompt('Optional admin note:') || '';
            const res = await fetch('{{BASE}}/api/review/promos/' + encodeURIComponent(id) + '/' + encodeURIComponent(action), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ adminNotes: notes })
            });
            const data = await res.json();
            if (!res.ok) {
              alert(data.error || 'Action failed');
              return;
            }
            location.reload();
          }
        </script>`;

      render(req, res, 'Ads Review', '/review/promos', body);
    } catch (err) {
      render(req, res, 'Ads Review', '/review/promos', `<div class="card"><h3 style="color:var(--red);">Error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`);
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE: Drop Review — Listing
  // ══════════════════════════════════════════════

  router.get('/review/drops', async (req, res) => {
    try {
      const statusFilter = req.query.status  || '';
      const typeFilter   = req.query.type    || '';
      const search       = (req.query.search || '').trim();
      const sortBy       = ['created_at','title','currentContributions','contributorCount'].includes(req.query.sort)
                            ? req.query.sort : 'created_at';
      const sortDir      = req.query.dir === 'asc' ? 'asc' : 'desc';
      const limit        = Math.min(Math.max(parseInt(req.query.limit) || 25, 5), 100);
      const page         = Math.max(parseInt(req.query.page) || 1, 1);
      const offset       = (page - 1) * limit;

      // Shared base query builder
      const buildBase = () => {
        let q = knex('drops')
          .leftJoin('userData', 'drops.creatorId', 'userData.id')
          .where((b) => {
            if (statusFilter) b.where('drops.status', statusFilter);
            if (typeFilter)   b.where('drops.fileType', typeFilter);
            if (search) {
              b.where((s) => {
                s.whereILike('drops.title', `%${search}%`)
                 .orWhereILike('userData.username', `%${search}%`)
                 .orWhereILike('drops.id', `%${search}%`);
              });
            }
          });
        return q;
      };

      const [{ total }] = await buildBase().count('drops.id as total');
      const totalPages  = Math.max(Math.ceil(total / limit), 1);
      const safePage    = Math.min(page, totalPages);

      const drops = await buildBase()
        .select(
          'drops.id', 'drops.title', 'drops.status', 'drops.fileType',
          'drops.goalAmount', 'drops.currentContributions', 'drops.contributorCount',
          'drops.created_at', 'drops.scheduledDropTime', 'drops.isPublic',
          'userData.username as creatorName'
        )
        .orderBy(`drops.${sortBy}`, sortDir)
        .limit(limit)
        .offset(offset);

      const statusColors = {
        draft: 'var(--text2)', pending: 'var(--orange)', active: 'var(--green)',
        dropped: 'var(--accent)', expired: 'var(--red)', removed: 'var(--red)'
      };

      // Helper: build URL preserving all current params but overriding some
      const qs = (overrides = {}) => {
        const p = { status: statusFilter, type: typeFilter, search, sort: sortBy, dir: sortDir, limit, page, ...overrides };
        const parts = Object.entries(p).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
        return parts.length ? '?' + parts.join('&') : '';
      };

      // Status filter tabs
      const statusTabs = ['', 'pending', 'draft', 'active', 'dropped', 'expired', 'removed']
        .map(s => {
          const active = statusFilter === s;
          const label  = s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All';
          return `<a href="{{BASE}}/review/drops${qs({ status: s, page: 1 })}"
            class="btn ${active ? 'btn-primary' : 'btn-outline'}"
            style="font-size:0.8em;padding:5px 12px;">${escapeHtml(label)}</a>`;
        }).join(' ');

      // File type filter
      const FILE_TYPES = ['', 'game', 'app', 'document', 'music', 'video', 'other'];
      const typeTabs = FILE_TYPES.map(t => {
        const active = typeFilter === t;
        const label  = t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All Types';
        return `<a href="{{BASE}}/review/drops${qs({ type: t, page: 1 })}"
          class="btn ${active ? 'btn-primary' : 'btn-outline'}"
          style="font-size:0.75em;padding:4px 10px;">${escapeHtml(label)}</a>`;
      }).join(' ');

      // Sort header helper
      const thSort = (col, label) => {
        const isActive = sortBy === col;
        const nextDir  = isActive && sortDir === 'desc' ? 'asc' : 'desc';
        const arrow    = isActive ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        return `<th><a href="{{BASE}}/review/drops${qs({ sort: col, dir: nextDir, page: 1 })}"
          style="color:${isActive ? 'var(--accent)' : 'inherit'};text-decoration:none;white-space:nowrap;">${escapeHtml(label)}${arrow}</a></th>`;
      };

      // Pagination
      const paginationLinks = (() => {
        const links = [];
        const mkLink = (p, label, disabled = false) => disabled
          ? `<span style="padding:4px 10px;border-radius:6px;background:var(--surface);color:var(--text2);font-size:0.85em;">${label}</span>`
          : `<a href="{{BASE}}/review/drops${qs({ page: p })}" style="padding:4px 10px;border-radius:6px;background:var(--surface2);color:var(--text);font-size:0.85em;text-decoration:none;">${label}</a>`;

        links.push(mkLink(safePage - 1, '← Prev', safePage <= 1));

        // Window of page numbers around current
        const window = 2;
        const start  = Math.max(1, safePage - window);
        const end    = Math.min(totalPages, safePage + window);
        if (start > 1) { links.push(mkLink(1, '1')); if (start > 2) links.push('<span style="color:var(--text2);">…</span>'); }
        for (let p = start; p <= end; p++) {
          links.push(p === safePage
            ? `<span style="padding:4px 10px;border-radius:6px;background:var(--accent);color:#fff;font-size:0.85em;font-weight:700;">${p}</span>`
            : mkLink(p, String(p)));
        }
        if (end < totalPages) { if (end < totalPages - 1) links.push('<span style="color:var(--text2);">…</span>'); links.push(mkLink(totalPages, String(totalPages))); }

        links.push(mkLink(safePage + 1, 'Next →', safePage >= totalPages));
        return links.join(' ');
      })();

      const rows = drops.map(d => {
        const color = statusColors[d.status] || 'var(--text2)';
        const pct = d.goalAmount > 0 ? Math.round((d.currentContributions / d.goalAmount) * 100) : 0;
        return `<tr>
          <td><a href="{{BASE}}/review/drop/${escapeHtml(d.id)}" style="color:var(--accent);text-decoration:none;font-family:monospace;font-size:0.8em;">${escapeHtml(d.id.slice(0, 8))}…</a></td>
          <td><a href="{{BASE}}/review/drop/${escapeHtml(d.id)}" style="color:var(--text);text-decoration:none;font-weight:600;">${escapeHtml(d.title || 'Untitled')}</a></td>
          <td>${escapeHtml(d.creatorName || '—')}</td>
          <td><span style="color:${color};font-weight:600;">${escapeHtml(d.status)}</span></td>
          <td style="color:var(--text2);font-size:0.85em;">${escapeHtml(d.fileType || '—')}</td>
          <td style="min-width:120px;">
            <div style="font-size:0.8em;color:var(--text2);">${Number(d.currentContributions).toLocaleString()} / ${Number(d.goalAmount).toLocaleString()} <span style="color:var(--accent);">(${pct}%)</span></div>
            <div style="background:var(--surface2);border-radius:4px;height:4px;margin-top:3px;overflow:hidden;">
              <div style="background:var(--accent);width:${Math.min(pct, 100)}%;height:100%;"></div>
            </div>
          </td>
          <td style="text-align:center;">${escapeHtml(String(d.contributorCount || 0))}</td>
          <td style="font-size:0.8em;color:var(--text2);white-space:nowrap;">${d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
          <td style="text-align:center;">${d.isPublic ? '🌐' : '🔒'}</td>
        </tr>`;
      }).join('\n');

      const startRow = offset + 1;
      const endRow   = Math.min(offset + limit, total);

      const body = `
        <h1 class="page-title">🔥 Drop Review</h1>

        <!-- Status tabs -->
        <div class="controls-bar" style="flex-wrap:wrap;gap:6px;margin-bottom:8px;">${statusTabs}</div>

        <!-- Type filter + search bar -->
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
          <div style="display:flex;gap:4px;flex-wrap:wrap;">${typeTabs}</div>
          <div style="flex:1;min-width:220px;display:flex;gap:6px;">
            <input type="text" id="searchInput" value="${escapeHtml(search)}"
              placeholder="Search title, creator, ID…"
              style="flex:1;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:0.85em;"
              onkeydown="if(event.key==='Enter') applySearch()">
            <button class="btn btn-primary" style="font-size:0.8em;padding:5px 14px;" onclick="applySearch()">Search</button>
            ${search ? `<a href="{{BASE}}/review/drops${qs({ search: '', page: 1 })}" class="btn btn-outline" style="font-size:0.8em;padding:5px 10px;" title="Clear search">✕</a>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:0.8em;color:var(--text2);">Per page:</label>
            <select onchange="setLimit(this.value)" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:0.8em;">
              ${[10, 25, 50, 100].map(n => `<option value="${n}" ${n === limit ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Results summary -->
        <div style="font-size:0.8em;color:var(--text2);margin-bottom:6px;">
          Showing <strong>${startRow}–${endRow}</strong> of <strong>${total}</strong> drop${total !== 1 ? 's' : ''}
          ${search ? `matching "<strong>${escapeHtml(search)}</strong>"` : ''}
          ${statusFilter ? `· status: <strong>${escapeHtml(statusFilter)}</strong>` : ''}
          ${typeFilter ? `· type: <strong>${escapeHtml(typeFilter)}</strong>` : ''}
        </div>

        <!-- Table -->
        <div class="card" style="padding:0;overflow:auto;">
          <table>
            <thead><tr>
              <th>ID</th>
              ${thSort('title', 'Title')}
              <th>Creator</th>
              <th>Status</th>
              <th>Type</th>
              ${thSort('currentContributions', 'Progress')}
              ${thSort('contributorCount', 'Contributors')}
              ${thSort('created_at', 'Created')}
              <th>Vis</th>
            </tr></thead>
            <tbody>${drops.length === 0
              ? '<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:40px;">No drops found</td></tr>'
              : rows}</tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div style="display:flex;justify-content:center;align-items:center;gap:6px;margin-top:14px;flex-wrap:wrap;">
          ${paginationLinks}
        </div>
        <div style="text-align:center;color:var(--text2);font-size:0.75em;margin-top:6px;">Page ${safePage} of ${totalPages}</div>

        <script>
          function applySearch() {
            const s = document.getElementById('searchInput').value.trim();
            const url = new URL(location.href);
            url.searchParams.set('search', s);
            url.searchParams.set('page', '1');
            location.href = url.toString();
          }
          function setLimit(val) {
            const url = new URL(location.href);
            url.searchParams.set('limit', val);
            url.searchParams.set('page', '1');
            location.href = url.toString();
          }
        </script>`;

      render(req, res, 'Drop Review', '/review/drops', body);
    } catch (err) {
      render(req, res, 'Error', '/review/drops',
        `<div class="card" style="border-color:var(--red);"><h3 style="color:var(--red);">Error loading drops</h3><p>${escapeHtml(err.message)}</p></div>`);
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE: Drop Review — Single Drop Detail
  // ══════════════════════════════════════════════

  router.get('/review/drop/:id', async (req, res) => {
    try {
      const drop = await knex('drops')
        .leftJoin('userData', 'drops.creatorId', 'userData.id')
        .select('drops.*', 'userData.username as creatorName', 'userData.email as creatorEmail')
        .where('drops.id', req.params.id)
        .first();

      if (!drop) {
        return render(req, res, 'Not Found', '/review/drops',
          `<div class="card"><h3 style="color:var(--red);">Drop not found</h3><p>No drop with ID ${escapeHtml(req.params.id)}</p>
           <a href="{{BASE}}/review/drops" class="btn btn-outline" style="margin-top:12px;">← Back to drops</a></div>`);
      }

      const statusColors = {
        draft: 'var(--text2)', pending: 'var(--orange)', active: 'var(--green)',
        dropped: 'var(--accent)', expired: 'var(--red)', removed: 'var(--red)'
      };
      const color = statusColors[drop.status] || 'var(--text2)';
      const pct = drop.goalAmount > 0 ? Math.round((drop.currentContributions / drop.goalAmount) * 100) : 0;

      // Build action buttons based on status
      let actionButtons = '';
      if (drop.status === 'pending') {
        actionButtons = `
          <button class="btn btn-primary" onclick="dropAction('approve')" style="margin-right:8px;">✅ Approve (Activate)</button>
          <button class="btn btn-danger" onclick="dropAction('reject')">❌ Reject</button>`;
      } else if (drop.status === 'active') {
        actionButtons = `<button class="btn btn-danger" onclick="dropAction('remove')">🚫 Remove</button>`;
      } else if (drop.status === 'draft') {
        actionButtons = `<button class="btn btn-danger" onclick="dropAction('remove')">🗑️ Remove Draft</button>`;
      }

      const tags = (() => {
        try { return JSON.parse(drop.tags || '[]'); } catch { return []; }
      })();
      const tagsHtml = tags.length > 0
        ? tags.map(t => `<span style="background:var(--surface2);padding:3px 10px;border-radius:12px;font-size:0.8em;color:var(--text2);">${escapeHtml(t)}</span>`).join(' ')
        : '<span style="color:var(--text2);">None</span>';

      const detailRow = (label, value) =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text2);font-size:0.85em;">${label}</span>
          <span style="font-size:0.9em;">${value}</span>
        </div>`;

      const fmtDate = (d) => d ? new Date(d).toLocaleString() : '<span style="color:var(--text2);">—</span>';
      const fmtNum = (n) => n != null ? Number(n).toLocaleString() : '0';
      const fmtCurrency = (n) => n != null ? '$' + (Number(n) / 100).toFixed(2) : '$0.00';

      const bannerPreview = drop.thumbnailUrl
        ? `<div class="card"><h3>Banner Preview</h3><img src="${escapeHtml(drop.thumbnailUrl)}" style="max-width:100%;border-radius:8px;margin-top:8px;" /></div>`
        : '';

      const body = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
          <a href="{{BASE}}/review/drops" style="color:var(--text2);text-decoration:none;font-size:1.2em;">←</a>
          <h1 class="page-title" style="margin-bottom:0;">${escapeHtml(drop.title || 'Untitled Drop')}</h1>
          <span style="color:${color};font-weight:700;font-size:0.9em;background:var(--surface);padding:4px 12px;border-radius:6px;border:1px solid var(--border);">${escapeHtml(drop.status)}</span>
        </div>

        ${actionButtons ? `<div class="card" style="display:flex;gap:8px;align-items:center;"><strong style="margin-right:12px;">Actions:</strong>${actionButtons}</div>` : ''}

        <div class="grid-2">
          <div>
            <div class="card">
              <h3>Basic Info</h3>
              ${detailRow('Drop ID', '<code style="color:var(--accent);font-size:0.8em;">' + escapeHtml(drop.id) + '</code>')}
              ${detailRow('Creator', escapeHtml(drop.creatorName || '—') + ' <span style="color:var(--text2);font-size:0.8em;">(' + escapeHtml(drop.creatorEmail || '—') + ')</span>')}
              ${detailRow('Creator ID', escapeHtml(drop.creatorId))}
              ${detailRow('File Type', escapeHtml(drop.fileType || '—'))}
              ${detailRow('File Size', drop.fileSize ? (Number(drop.fileSize) / (1024 * 1024)).toFixed(2) + ' MB' : '—')}
              ${detailRow('MIME Type', escapeHtml(drop.mimeType || '—'))}
              ${detailRow('Original File', escapeHtml(drop.originalFileName || '—'))}
              ${detailRow('Visibility', drop.isPublic ? '🌐 Public' : '🔒 Private')}
              ${detailRow('Created', fmtDate(drop.created_at))}
              ${detailRow('Updated', fmtDate(drop.updated_at))}
            </div>

            <div class="card">
              <h3>Schedule</h3>
              ${detailRow('Scheduled Drop', fmtDate(drop.scheduledDropTime))}
              ${detailRow('Actual Drop', fmtDate(drop.actualDropTime))}
              ${detailRow('Expires At', fmtDate(drop.expiresAt))}
            </div>

            <div class="card">
              <h3>Description</h3>
              <p style="color:var(--text);font-size:0.9em;line-height:1.6;white-space:pre-wrap;">${escapeHtml(drop.description || 'No description provided.')}</p>
            </div>

            <div class="card">
              <h3>Tags</h3>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${tagsHtml}</div>
            </div>
          </div>

          <div>
            ${bannerPreview}
            <div class="card">
              <h3>Contributions</h3>
              ${detailRow('Progress', `<strong>${fmtNum(drop.currentContributions)}</strong> / ${fmtNum(drop.goalAmount)} (${pct}%)`)}
              <div style="background:var(--surface2);border-radius:6px;height:8px;margin:12px 0;overflow:hidden;">
                <div style="background:var(--accent);width:${Math.min(pct, 100)}%;height:100%;transition:width .3s;"></div>
              </div>
              ${detailRow('Contributors', fmtNum(drop.contributorCount))}
              ${detailRow('Total Revenue', fmtCurrency(drop.totalRevenue))}
              ${detailRow('Total Downloads', fmtNum(drop.totalDownloads))}
            </div>

            <div class="card">
              <h3>Burn Engine</h3>
              ${detailRow('Momentum', drop.momentum != null ? Number(drop.momentum).toFixed(4) : '0')}
              ${detailRow('Burn Rate', drop.burnRate != null ? Number(drop.burnRate).toFixed(4) : '0')}
              ${detailRow('Sensitivity', drop.sensitivity != null ? Number(drop.sensitivity).toFixed(4) : '—')}
              ${detailRow('Decay Constant', drop.decayConstant != null ? Number(drop.decayConstant).toFixed(4) : '—')}
              ${detailRow('Last Momentum Update', fmtDate(drop.lastMomentumUpdate))}
            </div>

            <div class="card">
              <h3>Pricing</h3>
              ${detailRow('Base Price', fmtCurrency(drop.basePrice))}
              ${detailRow('Daily Price Decay', drop.dailyPriceDecayPct != null ? drop.dailyPriceDecayPct + '%' : '—')}
              ${detailRow('Volume Decay Step', fmtNum(drop.volumeDecayStep))}
              ${detailRow('Volume Decay Pct', drop.volumeDecayPct != null ? drop.volumeDecayPct + '%' : '—')}
            </div>

            <div class="card">
              <h3>Engagement</h3>
              ${detailRow('Avg Rating', drop.avgRating != null ? '⭐ ' + Number(drop.avgRating).toFixed(1) : '—')}
              ${detailRow('Reviews', fmtNum(drop.reviewCount))}
              ${detailRow('Likes / Dislikes', fmtNum(drop.likeCount) + ' / ' + fmtNum(drop.dislikeCount))}
            </div>

            <div class="card">
              <h3>File Paths</h3>
              ${detailRow('File Path', '<code style="font-size:0.75em;word-break:break-all;color:var(--text2);">' + escapeHtml(drop.filePath || 'Not uploaded') + '</code>')}
              ${detailRow('Thumbnail', drop.thumbnailUrl ? '<a href="' + escapeHtml(drop.thumbnailUrl) + '" target="_blank" style="color:var(--accent);font-size:0.8em;">View</a>' : '—')}
              ${detailRow('Trailer', drop.trailerUrl ? '<a href="' + escapeHtml(drop.trailerUrl) + '" target="_blank" style="color:var(--accent);font-size:0.8em;">View</a>' : '—')}
            </div>
          </div>
        </div>

        <script>
          async function dropAction(action) {
            if (!confirm('Are you sure you want to ' + action + ' this drop?')) return;
            try {
              const res = await fetch('{{BASE}}/api/review/drop/${escapeHtml(drop.id)}/' + action, { method: 'POST' });
              const data = await res.json();
              if (data.ok) {
                location.reload();
              } else {
                alert('Error: ' + (data.error || 'Unknown error'));
              }
            } catch (e) {
              alert('Request failed: ' + e.message);
            }
          }
        </script>`;

      render(req, res, drop.title || 'Drop Detail', '/review/drops', body);
    } catch (err) {
      render(req, res, 'Error', '/review/drops',
        `<div class="card" style="border-color:var(--red);"><h3 style="color:var(--red);">Error loading drop</h3><p>${escapeHtml(err.message)}</p></div>`);
    }
  });

  // ══════════════════════════════════════════════
  //  API: Promo Review Actions
  // ══════════════════════════════════════════════

  router.post('/api/review/promos/:id/:action', express.json(), async (req, res) => {
    try {
      await ensurePromoSubmissionsTable();
      const { id, action } = req.params;
      const statusMap = { approve: 'approved', hold: 'hold', reject: 'rejected' };
      const nextStatus = statusMap[action];
      if (!nextStatus) return res.status(400).json({ ok: false, error: 'Invalid action' });

      const updated = await knex('promoSubmissions')
        .where('id', id)
        .update({
          status: nextStatus,
          adminNotes: String(req.body?.adminNotes || '').trim() || null,
          updated_at: knex.fn.now(),
        });

      if (!updated) return res.status(404).json({ ok: false, error: 'Submission not found' });
      return res.json({ ok: true, status: nextStatus });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message || 'Failed to update promo submission' });
    }
  });

  // ══════════════════════════════════════════════
  //  API: Drop Review Actions
  // ══════════════════════════════════════════════

  router.post('/api/review/drop/:id/approve', express.json(), async (req, res) => {
    try {
      const updated = await knex('drops').where({ id: req.params.id, status: 'pending' })
        .update({ status: 'active', actualDropTime: knex.fn.now() });
      if (!updated) return res.json({ ok: false, error: 'Drop not found or not in pending status' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/api/review/drop/:id/reject', express.json(), async (req, res) => {
    try {
      const updated = await knex('drops').where({ id: req.params.id, status: 'pending' })
        .update({ status: 'draft' });
      if (!updated) return res.json({ ok: false, error: 'Drop not found or not in pending status' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/api/review/drop/:id/remove', express.json(), async (req, res) => {
    try {
      const updated = await knex('drops').where('id', req.params.id)
        .whereIn('status', ['draft', 'active', 'pending'])
        .update({ status: 'removed' });
      if (!updated) return res.json({ ok: false, error: 'Drop not found or cannot be removed' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE: Credit Purchases Review
  // ══════════════════════════════════════════════

  router.get('/review/purchases', async (req, res) => {
    try {
      const status = String(req.query.status || '');
      const paymentMethod = String(req.query.paymentMethod || '');

      let q = knex('CreditPurchases').select('*');
      if (status) q = q.where('status', status);
      if (paymentMethod) q = q.where('paymentMethod', paymentMethod);
      const rows = await q.orderBy('created_at', 'desc').limit(100);

      const all = await knex('CreditPurchases').select('status', 'paymentMethod');

      const counts = {
        total: all.length,
        pending: all.filter((r) => String(r.status || '') === 'processing').length,
        completed: all.filter((r) => String(r.status || '') === 'completed').length,
        failed: all.filter((r) => ['failed', 'refunded'].includes(String(r.status || ''))).length,
        stripe: all.filter((r) => String(r.paymentMethod || '') === 'stripe').length,
        crypto: all.filter((r) => ['btc', 'eth', 'ltc', 'sol'].includes(String(r.paymentMethod || ''))).length,
      };

      const filterBtn = (label, value, param) => {
        const url = new URLSearchParams(req.query);
        if (value) url.set(param, value); else url.delete(param);
        const active = value === (param === 'status' ? status : paymentMethod);
        return `<a href="{{BASE}}/review/purchases?${url.toString()}" class="btn ${active ? 'btn-primary' : 'btn-outline'}" style="font-size:0.78em;padding:5px 10px;">${escapeHtml(label)}</a>`;
      };

      const bodyRows = rows.map((row) => {
        const isStripe = row.paymentMethod === 'stripe';
        const identifierText = isStripe 
          ? `<div style="font-family:monospace;font-size:0.78em;">${escapeHtml(String(row.stripeCheckoutSessionId || row.stripePaymentIntentId || '—').slice(0, 24))}</div>
             <div style="font-size:0.72em;color:var(--text2);">${row.stripeCheckoutSessionId ? 'checkout_session' : 'payment_intent'}</div>`
          : `<div style="font-family:monospace;font-size:0.78em;">${escapeHtml(String(row.txHash || '—').slice(0, 20))}</div>
             <div style="font-size:0.72em;color:var(--text2);">tx_hash</div>`;
        
        return `<tr>
          <td style="font-family:monospace;font-size:0.78em;">${escapeHtml(row.id || '—')}</td>
          <td>${escapeHtml(row.username || row.userId || '—')}</td>
          <td>${escapeHtml(String(row.paymentMethod || '').toUpperCase())}</td>
          <td>${identifierText}</td>
          <td>${statusChip(row.status)}</td>
          <td>${Number(row.credits || 0).toLocaleString()}</td>
          <td>$${Number(row.amountPaid || 0).toFixed(2)}</td>
          <td style="font-size:0.82em;color:var(--text2);">${fmtDate(row.created_at)}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-primary" style="font-size:0.75em;padding:5px 9px;" onclick="purchaseAction('${escapeHtml(String(row.id || ''))}', 'approve')">Approve</button>
              <button class="btn btn-outline" style="font-size:0.75em;padding:5px 9px;" onclick="purchaseAction('${escapeHtml(String(row.id || ''))}', 'processing')">Hold</button>
              <button class="btn btn-danger" style="font-size:0.75em;padding:5px 9px;" onclick="purchaseAction('${escapeHtml(String(row.id || ''))}', 'reject')">Reject</button>
            </div>
          </td>
        </tr>`;
      }).join('');

      const body = `
        <h1 class="page-title">💰 Credit Purchases Review</h1>

        <div class="grid-4">
          <div class="card"><h3>Total Purchases</h3><div class="big-value">${counts.total}</div><div class="sub-label">All payment methods</div></div>
          <div class="card"><h3>Pending</h3><div class="big-value">${counts.pending}</div><div class="sub-label">Awaiting approval</div></div>
          <div class="card"><h3>Completed</h3><div class="big-value">${counts.completed}</div><div class="sub-label">Credits applied</div></div>
          <div class="card"><h3>Failed</h3><div class="big-value">${counts.failed}</div><div class="sub-label">Rejected or refunded</div></div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">
            <h3 style="margin-bottom:0;">All Credit Purchases</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <div style="display:flex;gap:6px;border-right:1px solid var(--border);padding-right:8px;margin-right:2px;">
                ${filterBtn('All Status', '', 'status')}
                ${filterBtn('Pending', 'processing', 'status')}
                ${filterBtn('Completed', 'completed', 'status')}
                ${filterBtn('Failed', 'failed', 'status')}
              </div>
              <div style="display:flex;gap:6px;">
                ${filterBtn('All Methods', '', 'paymentMethod')}
                ${filterBtn('Stripe', 'stripe', 'paymentMethod')}
                ${filterBtn('Crypto', 'btc', 'paymentMethod')}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
            <input type="text" id="purchaseSearch" placeholder="Search by ID, user, or tx..." style="flex:1;min-width:250px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" oninput="filterPurchaseTable()">
            <select id="purchaseSort" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" onchange="sortPurchaseTable()">
              <option value="date-desc">Date (Newest First)</option>
              <option value="date-asc">Date (Oldest First)</option>
              <option value="amount-desc">Amount (High to Low)</option>
              <option value="amount-asc">Amount (Low to High)</option>
              <option value="credits-desc">Credits (High to Low)</option>
              <option value="credits-asc">Credits (Low to High)</option>
              <option value="user-asc">User (A-Z)</option>
            </select>
          </div>
          <div style="overflow:auto;margin-top:12px;">
            <table id="purchaseTable">
              <thead><tr><th>ID</th><th>User</th><th>Method</th><th>Transaction ID</th><th>Status</th><th>Credits</th><th>USD</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>${rows.length ? bodyRows : '<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:24px;">No purchases found</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <script>
          async function purchaseAction(id, action) {
            if (!confirm('Proceed with ' + action + ' for this purchase?')) return;
            try {
              const res = await fetch('{{BASE}}/api/review/purchases/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
              const data = await res.json();
              if (data.ok) location.reload();
              else alert(data.error || 'Update failed');
            } catch (err) {
              alert('Request failed: ' + err.message);
            }
          }

          function filterPurchaseTable() {
            const searchTerm = document.getElementById('purchaseSearch').value.toLowerCase();
            const table = document.getElementById('purchaseTable');
            const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
            
            for (let row of rows) {
              if (row.cells.length === 1) continue;
              const text = row.textContent.toLowerCase();
              if (text.includes(searchTerm)) {
                row.style.display = '';
              } else {
                row.style.display = 'none';
              }
            }
          }

          function sortPurchaseTable() {
            const sortValue = document.getElementById('purchaseSort').value;
            const table = document.getElementById('purchaseTable');
            const tbody = table.getElementsByTagName('tbody')[0];
            const rows = Array.from(tbody.getElementsByTagName('tr'));
            
            if (rows.length <= 1 || rows[0].cells.length === 1) return;
            
            rows.sort((a, b) => {
              const [field, direction] = sortValue.split('-');
              let aVal, bVal;
              
              switch(field) {
                case 'date':
                  aVal = a.cells[7].textContent;
                  bVal = b.cells[7].textContent;
                  break;
                case 'amount':
                  aVal = parseFloat(a.cells[6].textContent.replace(/[^0-9.]/g, ''));
                  bVal = parseFloat(b.cells[6].textContent.replace(/[^0-9.]/g, ''));
                  break;
                case 'credits':
                  aVal = parseFloat(a.cells[5].textContent.replace(/[^0-9]/g, ''));
                  bVal = parseFloat(b.cells[5].textContent.replace(/[^0-9]/g, ''));
                  break;
                case 'user':
                  aVal = a.cells[1].textContent.toLowerCase();
                  bVal = b.cells[1].textContent.toLowerCase();
                  break;
              }
              
              if (direction === 'asc') {
                return aVal > bVal ? 1 : -1;
              } else {
                return aVal < bVal ? 1 : -1;
              }
            });
            
            rows.forEach(row => tbody.appendChild(row));
          }
        </script>`;

      render(req, res, 'Credit Purchases', '/review/purchases', body);
    } catch (err) {
      render(req, res, 'Credit Purchases', '/review/purchases', `<div class="card"><h3 style="color:var(--red);">Error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`);
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE: Stripe Review — Payments + Subscriptions
  // ══════════════════════════════════════════════

  router.get('/review/stripe', async (req, res) => {
    try {
      await ensureSubscriptionsTable();
      const stripeTableExists = await knex.schema.hasTable('stripeTransactions');
      const paymentStatus = String(req.query.paymentStatus || '');
      const subscriptionStatus = String(req.query.subscriptionStatus || '');

      let payments = [];
      let subscriptions = [];

      if (stripeTableExists) {
        let q = knex('stripeTransactions').select('*');
        if (paymentStatus) q = q.where('status', paymentStatus);
        payments = await q.orderBy([{ column: 'stripeCreatedAt', order: 'desc' }, { column: 'updated_at', order: 'desc' }]).limit(75);
      }

      let sq = knex('subscriptions').select('*');
      if (subscriptionStatus) sq = sq.where('status', subscriptionStatus);
      subscriptions = await sq.orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'created_at', order: 'desc' }]).limit(75);

      const linkedIds = payments.map((p) => p.stripePaymentIntentId).filter(Boolean);
      const linkedPurchases = linkedIds.length
        ? await knex('CreditPurchases').select('*').whereIn('stripePaymentIntentId', linkedIds)
        : [];
      const purchaseMap = new Map(linkedPurchases.map((row) => [row.stripePaymentIntentId, row]));

      const paymentStatuses = stripeTableExists
        ? await knex('stripeTransactions').select('status')
        : [];
      const subscriptionStatuses = await knex('subscriptions').select('status');

      const paymentCounts = {
        total: paymentStatuses.length,
        pending: paymentStatuses.filter((r) => ['processing', 'pending', 'requires_action'].includes(String(r.status || ''))).length,
        approved: paymentStatuses.filter((r) => ['succeeded', 'completed'].includes(String(r.status || ''))).length,
        rejected: paymentStatuses.filter((r) => ['failed', 'canceled', 'refunded'].includes(String(r.status || ''))).length,
      };

      const subscriptionCounts = {
        total: subscriptionStatuses.length,
        active: subscriptionStatuses.filter((r) => String(r.status || '') === 'active').length,
        trialing: subscriptionStatuses.filter((r) => String(r.status || '') === 'trialing').length,
        canceled: subscriptionStatuses.filter((r) => ['canceled', 'canceling'].includes(String(r.status || ''))).length,
      };

      const filterBtn = (label, value, param, activeValue) => {
        const url = new URLSearchParams(req.query);
        if (value) url.set(param, value); else url.delete(param);
        const active = value === activeValue;
        return `<a href="{{BASE}}/review/stripe?${url.toString()}" class="btn ${active ? 'btn-primary' : 'btn-outline'}" style="font-size:0.78em;padding:5px 10px;">${escapeHtml(label)}</a>`;
      };

      const paymentRows = payments.map((row) => {
        const linked = purchaseMap.get(row.stripePaymentIntentId);
        const primaryId = row.stripeBalanceTransactionId || row.stripePaymentIntentId || row.stripeChargeId || row.stripeSourceId || '—';
        const objectType = row.stripeObjectType || 'payment_intent';
        const amountText = `${escapeHtml(String(row.currency || 'USD').toUpperCase())} $${(Number(row.amount || 0) / 100).toFixed(2)}`;
        const netText = row.net != null ? `$${(Number(row.net || 0) / 100).toFixed(2)}` : '—';
        const createdText = fmtDate(row.stripeCreatedAt || row.created_at);
        const email = row.customerEmail || row.receiptEmail || '—';
        return `<tr>
          <td>
            <div style="font-family:monospace;font-size:0.78em;">${escapeHtml(String(primaryId).slice(0, 24) || '—')}</div>
            <div style="font-size:0.72em;color:var(--text2);">${escapeHtml(objectType)}</div>
          </td>
          <td>${statusChip(row.status)}</td>
          <td>${escapeHtml(email)}</td>
          <td>${amountText}</td>
          <td style="font-family:monospace;font-size:0.78em;">${escapeHtml(String(row.stripeSourceId || row.stripeChargeId || '—').slice(0, 24))}</td>
          <td>${netText}</td>
          <td>${linked ? `<a href="{{BASE}}/review/purchases?status=${linked.status}" style="color:var(--accent);text-decoration:none;">${statusChip(linked.status)}</a>` : '<span style="color:var(--text2);">—</span>'}</td>
          <td style="font-size:0.82em;color:var(--text2);">${createdText}</td>
        </tr>`;
      }).join('');

      const subscriptionRows = subscriptions.map((row) => `<tr>
        <td style="font-family:monospace;font-size:0.78em;">${escapeHtml(String(row.stripe_subscription_id || '').slice(0, 24) || '—')}</td>
        <td>${escapeHtml(row.username || row.user_id || '—')}</td>
        <td>${escapeHtml(row.plan_name || row.plan_id || '—')}</td>
        <td>${statusChip(row.status)}</td>
        <td style="font-size:0.82em;color:var(--text2);">${fmtDate(row.current_period_end)}</td>
      </tr>`).join('');

      const body = `
        <h1 class="page-title">💳 Stripe Data Reference</h1>
        <p style="color:var(--text2);margin-bottom:20px;">View Stripe payment intents and subscriptions pulled from Stripe API. For payment approval/review, see the <a href="{{BASE}}/review/purchases" style="color:var(--accent);">Purchases</a> page.</p>

        <div class="grid-4">
          <div class="card"><h3>Stripe Payments</h3><div class="big-value">${paymentCounts.total}</div><div class="sub-label">Tracked payment intents</div></div>
          <div class="card"><h3>Payment Queue</h3><div class="big-value">${paymentCounts.pending}</div><div class="sub-label">Pending or processing</div></div>
          <div class="card"><h3>Active Subs</h3><div class="big-value">${subscriptionCounts.active}</div><div class="sub-label">Current active subscriptions</div></div>
          <div class="card"><h3>Canceled Subs</h3><div class="big-value">${subscriptionCounts.canceled}</div><div class="sub-label">Canceled or canceling</div></div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">
            <h3 style="margin-bottom:0;">Stripe Payments</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <button class="btn btn-primary" style="font-size:0.78em;padding:5px 10px;" onclick="syncStripeNow()">Sync Stripe Now</button>
              ${filterBtn('All', '', 'paymentStatus', paymentStatus)}
              ${filterBtn('Pending', 'processing', 'paymentStatus', paymentStatus)}
              ${filterBtn('Approved', 'succeeded', 'paymentStatus', paymentStatus)}
              ${filterBtn('Rejected', 'canceled', 'paymentStatus', paymentStatus)}
            </div>
          </div>
          ${!stripeTableExists ? '<p style="margin-top:12px;color:var(--text2);">The Stripe tracking table is not available yet.</p>' : `
          <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
            <input type="text" id="stripePaymentSearch" placeholder="Search by ID, customer, or source..." style="flex:1;min-width:250px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" oninput="filterStripePaymentTable()">
            <select id="stripePaymentSort" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" onchange="sortStripePaymentTable()">
              <option value="date-desc">Date (Newest First)</option>
              <option value="date-asc">Date (Oldest First)</option>
              <option value="amount-desc">Amount (High to Low)</option>
              <option value="amount-asc">Amount (Low to High)</option>
              <option value="customer-asc">Customer (A-Z)</option>
            </select>
          </div>
          <div style="overflow:auto;margin-top:12px;">
            <table id="stripePaymentTable">
              <thead><tr><th>Stripe ID</th><th>Status</th><th>Customer</th><th>Amount</th><th>Source</th><th>Net</th><th>Purchase Row</th><th>Created</th></tr></thead>
              <tbody>${payments.length ? paymentRows : '<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:24px;">No Stripe payments found</td></tr>'}</tbody>
            </table>
          </div>`}
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">
            <h3 style="margin-bottom:0;">Stripe Subscriptions</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${filterBtn('All', '', 'subscriptionStatus', subscriptionStatus)}
              ${filterBtn('Active', 'active', 'subscriptionStatus', subscriptionStatus)}
              ${filterBtn('Hold', 'incomplete', 'subscriptionStatus', subscriptionStatus)}
              ${filterBtn('Canceled', 'canceled', 'subscriptionStatus', subscriptionStatus)}
            </div>
          </div>
          <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
            <input type="text" id="stripeSubSearch" placeholder="Search by subscription ID, user, or plan..." style="flex:1;min-width:250px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" oninput="filterStripeSubTable()">
            <select id="stripeSubSort" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" onchange="sortStripeSubTable()">
              <option value="date-desc">Period End (Latest First)</option>
              <option value="date-asc">Period End (Earliest First)</option>
              <option value="user-asc">User (A-Z)</option>
              <option value="plan-asc">Plan (A-Z)</option>
            </select>
          </div>
          <div style="overflow:auto;margin-top:12px;">
            <table id="stripeSubTable">
              <thead><tr><th>Subscription</th><th>User</th><th>Plan</th><th>Status</th><th>Period End</th></tr></thead>
              <tbody>${subscriptions.length ? subscriptionRows : '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:24px;">No subscriptions found yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <script>
          async function syncStripeNow() {
            try {
              const btns = document.querySelectorAll('button');
              btns.forEach(b => b.disabled = true);
              const res = await fetch('{{BASE}}/api/review/stripe/sync', { method: 'POST' });
              const data = await res.json();
              if (!data.ok) {
                alert(data.error || 'Stripe sync failed');
              } else {
                alert('Stripe sync finished: ' + data.scanned + ' records scanned.');
                location.reload();
              }
            } catch (err) {
              alert('Sync failed: ' + err.message);
            }
          }

          function filterStripePaymentTable() {
            const searchTerm = document.getElementById('stripePaymentSearch').value.toLowerCase();
            const table = document.getElementById('stripePaymentTable');
            if (!table) return;
            const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
            
            for (let row of rows) {
              if (row.cells.length === 1) continue; // Skip "no results" row
              const text = row.textContent.toLowerCase();
              if (text.includes(searchTerm)) {
                row.style.display = '';
              } else {
                row.style.display = 'none';
              }
            }
          }

          function sortStripePaymentTable() {
            const sortValue = document.getElementById('stripePaymentSort').value;
            const table = document.getElementById('stripePaymentTable');
            if (!table) return;
            const tbody = table.getElementsByTagName('tbody')[0];
            const rows = Array.from(tbody.getElementsByTagName('tr'));
            
            if (rows.length <= 1 || rows[0].cells.length === 1) return; // No data to sort
            
            rows.sort((a, b) => {
              const [field, direction] = sortValue.split('-');
              let aVal, bVal;
              
              switch(field) {
                case 'date':
                  aVal = a.cells[7].textContent;
                  bVal = b.cells[7].textContent;
                  break;
                case 'amount':
                  aVal = parseFloat(a.cells[3].textContent.replace(/[^0-9.]/g, ''));
                  bVal = parseFloat(b.cells[3].textContent.replace(/[^0-9.]/g, ''));
                  break;
                case 'customer':
                  aVal = a.cells[2].textContent.toLowerCase();
                  bVal = b.cells[2].textContent.toLowerCase();
                  break;
              }
              
              if (direction === 'asc') {
                return aVal > bVal ? 1 : -1;
              } else {
                return aVal < bVal ? 1 : -1;
              }
            });
            
            rows.forEach(row => tbody.appendChild(row));
          }

          function filterStripeSubTable() {
            const searchTerm = document.getElementById('stripeSubSearch').value.toLowerCase();
            const table = document.getElementById('stripeSubTable');
            if (!table) return;
            const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
            
            for (let row of rows) {
              if (row.cells.length === 1) continue; // Skip "no results" row
              const text = row.textContent.toLowerCase();
              if (text.includes(searchTerm)) {
                row.style.display = '';
              } else {
                row.style.display = 'none';
              }
            }
          }

          function sortStripeSubTable() {
            const sortValue = document.getElementById('stripeSubSort').value;
            const table = document.getElementById('stripeSubTable');
            if (!table) return;
            const tbody = table.getElementsByTagName('tbody')[0];
            const rows = Array.from(tbody.getElementsByTagName('tr'));
            
            if (rows.length <= 1 || rows[0].cells.length === 1) return; // No data to sort
            
            rows.sort((a, b) => {
              const [field, direction] = sortValue.split('-');
              let aVal, bVal;
              
              switch(field) {
                case 'date':
                  aVal = a.cells[4].textContent;
                  bVal = b.cells[4].textContent;
                  break;
                case 'user':
                  aVal = a.cells[1].textContent.toLowerCase();
                  bVal = b.cells[1].textContent.toLowerCase();
                  break;
                case 'plan':
                  aVal = a.cells[2].textContent.toLowerCase();
                  bVal = b.cells[2].textContent.toLowerCase();
                  break;
              }
              
              if (direction === 'asc') {
                return aVal > bVal ? 1 : -1;
              } else {
                return aVal < bVal ? 1 : -1;
              }
            });
            
            rows.forEach(row => tbody.appendChild(row));
          }
        </script>`;

      render(req, res, 'Stripe Review', '/review/stripe', body);
    } catch (err) {
      render(req, res, 'Stripe Review', '/review/stripe', `<div class="card"><h3 style="color:var(--red);">Error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`);
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE: Crypto Review — Combined Chains
  // ══════════════════════════════════════════════

  router.get('/review/crypto', async (req, res) => {
    try {
      const status = String(req.query.status || '');
      let q = knex('CreditPurchases').select('*').whereIn('paymentMethod', ['btc', 'eth', 'ltc', 'sol']);
      if (status) q = q.where('status', status);
      const rows = await q.orderBy('created_at', 'desc').limit(100);
      const all = await knex('CreditPurchases').select('status').whereIn('paymentMethod', ['btc', 'eth', 'ltc', 'sol']);

      const counts = {
        total: all.length,
        pending: all.filter((r) => String(r.status || '') === 'processing').length,
        completed: all.filter((r) => String(r.status || '') === 'completed').length,
        failed: all.filter((r) => ['failed', 'refunded'].includes(String(r.status || ''))).length,
      };

      const filterBtn = (label, value) => {
        const active = value === status;
        const query = value ? `?status=${encodeURIComponent(value)}` : '';
        return `<a href="{{BASE}}/review/crypto${query}" class="btn ${active ? 'btn-primary' : 'btn-outline'}" style="font-size:0.78em;padding:5px 10px;">${escapeHtml(label)}</a>`;
      };

      const bodyRows = rows.map((row) => `<tr>
        <td style="font-family:monospace;font-size:0.78em;">${escapeHtml(row.id || '—')}</td>
        <td>${escapeHtml(row.username || row.userId || '—')}</td>
        <td>${escapeHtml(String(row.paymentMethod || '').toUpperCase())}</td>
        <td>${statusChip(row.status)}</td>
        <td>${Number(row.credits || 0).toLocaleString()}</td>
        <td>$${Number(row.amountPaid || 0).toFixed(2)}</td>
        <td style="font-family:monospace;font-size:0.78em;">${escapeHtml(String(row.txHash || '').slice(0, 20) || '—')}</td>
        <td style="font-size:0.82em;color:var(--text2);">${fmtDate(row.created_at)}</td>
      </tr>`).join('');

      const body = `
        <h1 class="page-title">🪙 Crypto Purchases Reference</h1>
        <p style="color:var(--text2);margin-bottom:20px;">View crypto purchases from CreditPurchases table. For payment approval/review, see the <a href="{{BASE}}/review/purchases" style="color:var(--accent);">Purchases</a> page.</p>

        <div class="grid-4">
          <div class="card"><h3>Total Requests</h3><div class="big-value">${counts.total}</div><div class="sub-label">BTC, ETH, LTC, SOL combined</div></div>
          <div class="card"><h3>Pending</h3><div class="big-value">${counts.pending}</div><div class="sub-label">Awaiting approval</div></div>
          <div class="card"><h3>Completed</h3><div class="big-value">${counts.completed}</div><div class="sub-label">Credits already applied</div></div>
          <div class="card"><h3>Failed</h3><div class="big-value">${counts.failed}</div><div class="sub-label">Rejected or refunded</div></div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">
            <h3 style="margin-bottom:0;">Combined Crypto Queue</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${filterBtn('All', '')}
              ${filterBtn('Pending', 'processing')}
              ${filterBtn('Completed', 'completed')}
              ${filterBtn('Failed', 'failed')}
            </div>
          </div>
          <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
            <input type="text" id="cryptoSearch" placeholder="Search by user, ID, or tx hash..." style="flex:1;min-width:250px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" oninput="filterCryptoTable()">
            <select id="cryptoSort" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" onchange="sortCryptoTable()">
              <option value="date-desc">Date (Newest First)</option>
              <option value="date-asc">Date (Oldest First)</option>
              <option value="amount-desc">Amount (High to Low)</option>
              <option value="amount-asc">Amount (Low to High)</option>
              <option value="credits-desc">Credits (High to Low)</option>
              <option value="credits-asc">Credits (Low to High)</option>
              <option value="user-asc">User (A-Z)</option>
            </select>
          </div>
          <div style="overflow:auto;margin-top:12px;">
            <table id="cryptoTable">
              <thead><tr><th>ID</th><th>User</th><th>Chain</th><th>Status</th><th>Credits</th><th>USD</th><th>Tx Hash</th><th>Created</th></tr></thead>
              <tbody>${rows.length ? bodyRows : '<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:24px;">No crypto purchases found</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <script>
          function filterCryptoTable() {
            const searchTerm = document.getElementById('cryptoSearch').value.toLowerCase();
            const table = document.getElementById('cryptoTable');
            const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
            let visibleCount = 0;
            
            for (let row of rows) {
              if (row.cells.length === 1) continue; // Skip "no results" row
              const text = row.textContent.toLowerCase();
              if (text.includes(searchTerm)) {
                row.style.display = '';
                visibleCount++;
              } else {
                row.style.display = 'none';
              }
            }
          }

          function sortCryptoTable() {
            const sortValue = document.getElementById('cryptoSort').value;
            const table = document.getElementById('cryptoTable');
            const tbody = table.getElementsByTagName('tbody')[0];
            const rows = Array.from(tbody.getElementsByTagName('tr'));
            
            if (rows.length <= 1 || rows[0].cells.length === 1) return; // No data to sort
            
            rows.sort((a, b) => {
              const [field, direction] = sortValue.split('-');
              let aVal, bVal;
              
              switch(field) {
                case 'date':
                  aVal = a.cells[7].textContent;
                  bVal = b.cells[7].textContent;
                  break;
                case 'amount':
                  aVal = parseFloat(a.cells[5].textContent.replace(/[^0-9.]/g, ''));
                  bVal = parseFloat(b.cells[5].textContent.replace(/[^0-9.]/g, ''));
                  break;
                case 'credits':
                  aVal = parseFloat(a.cells[4].textContent.replace(/[^0-9]/g, ''));
                  bVal = parseFloat(b.cells[4].textContent.replace(/[^0-9]/g, ''));
                  break;
                case 'user':
                  aVal = a.cells[1].textContent.toLowerCase();
                  bVal = b.cells[1].textContent.toLowerCase();
                  break;
              }
              
              if (direction === 'asc') {
                return aVal > bVal ? 1 : -1;
              } else {
                return aVal < bVal ? 1 : -1;
              }
            });
            
            rows.forEach(row => tbody.appendChild(row));
          }
        </script>`;

      render(req, res, 'Crypto Review', '/review/crypto', body);
    } catch (err) {
      render(req, res, 'Crypto Review', '/review/crypto', `<div class="card"><h3 style="color:var(--red);">Error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`);
    }
  });

  // ══════════════════════════════════════════════
  //  PAGE: Redeem Review
  // ══════════════════════════════════════════════

  router.get('/review/redeems', async (req, res) => {
    try {
      await ensureRedeemCreditsTable();
      const status = String(req.query.status || '');
      let q = knex('redeemCredits').select('*');
      if (status) q = q.where('status', status);
      const rows = await q.orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'created_at', order: 'desc' }]).limit(100);
      const all = await knex('redeemCredits').select('status');

      const counts = {
        total: all.length,
        pending: all.filter((r) => String(r.status || '') === 'pending').length,
        processing: all.filter((r) => String(r.status || '') === 'processing').length,
        completed: all.filter((r) => String(r.status || '') === 'completed').length,
      };

      const filterBtn = (label, value) => {
        const active = value === status;
        const query = value ? `?status=${encodeURIComponent(value)}` : '';
        return `<a href="{{BASE}}/review/redeems${query}" class="btn ${active ? 'btn-primary' : 'btn-outline'}" style="font-size:0.78em;padding:5px 10px;">${escapeHtml(label)}</a>`;
      };

      const bodyRows = rows.map((row) => `<tr>
        <td style="font-family:monospace;font-size:0.78em;">${escapeHtml(String(row.id || ''))}</td>
        <td>${escapeHtml(row.username || row.userId || '—')}</td>
        <td>${escapeHtml(String(row.chain || '').toUpperCase())}</td>
        <td>${Number(row.credits || 0).toLocaleString()}</td>
        <td>$${Number(row.amountUSD || 0).toFixed(2)}</td>
        <td style="font-family:monospace;font-size:0.78em;">${escapeHtml(String(row.walletAddress || '').slice(0, 18) || '—')}</td>
        <td>${statusChip(row.status)}</td>
        <td style="font-size:0.82em;color:var(--text2);">${fmtDate(row.created_at || row.date)}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-outline" style="font-size:0.75em;padding:5px 9px;" onclick="redeemAction('${escapeHtml(String(row.id || ''))}', 'processing')">Mark Processing</button>
            <button class="btn btn-primary" style="font-size:0.75em;padding:5px 9px;" onclick="redeemAction('${escapeHtml(String(row.id || ''))}', 'complete')">Mark Paid</button>
            <button class="btn btn-danger" style="font-size:0.75em;padding:5px 9px;" onclick="redeemAction('${escapeHtml(String(row.id || ''))}', 'reject')">Reject & Refund</button>
          </div>
        </td>
      </tr>`).join('');

      const body = `
        <h1 class="page-title">💸 Redeem Request Review</h1>

        <div class="grid-4">
          <div class="card"><h3>Total Requests</h3><div class="big-value">${counts.total}</div><div class="sub-label">All redemption requests</div></div>
          <div class="card"><h3>Pending</h3><div class="big-value">${counts.pending}</div><div class="sub-label">New payout requests</div></div>
          <div class="card"><h3>Processing</h3><div class="big-value">${counts.processing}</div><div class="sub-label">Marked for payout</div></div>
          <div class="card"><h3>Completed</h3><div class="big-value">${counts.completed}</div><div class="sub-label">Sent out successfully</div></div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">
            <h3 style="margin-bottom:0;">Redeem Queue</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${filterBtn('All', '')}
              ${filterBtn('Pending', 'pending')}
              ${filterBtn('Processing', 'processing')}
              ${filterBtn('Completed', 'completed')}
            </div>
          </div>
          <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
            <input type="text" id="redeemSearch" placeholder="Search by user, ID, or wallet address..." style="flex:1;min-width:250px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" oninput="filterRedeemTable()">
            <select id="redeemSort" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.9em;" onchange="sortRedeemTable()">
              <option value="date-desc">Date (Newest First)</option>
              <option value="date-asc">Date (Oldest First)</option>
              <option value="amount-desc">USD Amount (High to Low)</option>
              <option value="amount-asc">USD Amount (Low to High)</option>
              <option value="credits-desc">Credits (High to Low)</option>
              <option value="credits-asc">Credits (Low to High)</option>
              <option value="user-asc">User (A-Z)</option>
            </select>
          </div>
          <div style="overflow:auto;margin-top:12px;">
            <table id="redeemTable">
              <thead><tr><th>ID</th><th>User</th><th>Chain</th><th>Credits</th><th>USD</th><th>Wallet</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead>
              <tbody>${rows.length ? bodyRows : '<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:24px;">No redemption requests found</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <script>
          async function redeemAction(id, action) {
            if (!confirm('Proceed with ' + action + ' for this redeem request?')) return;
            try {
              const res = await fetch('{{BASE}}/api/review/redeem/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
              const data = await res.json();
              if (data.ok) location.reload();
              else alert(data.error || 'Update failed');
            } catch (err) {
              alert('Request failed: ' + err.message);
            }
          }

          function filterRedeemTable() {
            const searchTerm = document.getElementById('redeemSearch').value.toLowerCase();
            const table = document.getElementById('redeemTable');
            const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
            let visibleCount = 0;
            
            for (let row of rows) {
              if (row.cells.length === 1) continue; // Skip "no results" row
              const text = row.textContent.toLowerCase();
              if (text.includes(searchTerm)) {
                row.style.display = '';
                visibleCount++;
              } else {
                row.style.display = 'none';
              }
            }
          }

          function sortRedeemTable() {
            const sortValue = document.getElementById('redeemSort').value;
            const table = document.getElementById('redeemTable');
            const tbody = table.getElementsByTagName('tbody')[0];
            const rows = Array.from(tbody.getElementsByTagName('tr'));
            
            if (rows.length <= 1 || rows[0].cells.length === 1) return; // No data to sort
            
            rows.sort((a, b) => {
              const [field, direction] = sortValue.split('-');
              let aVal, bVal;
              
              switch(field) {
                case 'date':
                  aVal = a.cells[7].textContent;
                  bVal = b.cells[7].textContent;
                  break;
                case 'amount':
                  aVal = parseFloat(a.cells[4].textContent.replace(/[^0-9.]/g, ''));
                  bVal = parseFloat(b.cells[4].textContent.replace(/[^0-9.]/g, ''));
                  break;
                case 'credits':
                  aVal = parseFloat(a.cells[3].textContent.replace(/[^0-9]/g, ''));
                  bVal = parseFloat(b.cells[3].textContent.replace(/[^0-9]/g, ''));
                  break;
                case 'user':
                  aVal = a.cells[1].textContent.toLowerCase();
                  bVal = b.cells[1].textContent.toLowerCase();
                  break;
              }
              
              if (direction === 'asc') {
                return aVal > bVal ? 1 : -1;
              } else {
                return aVal < bVal ? 1 : -1;
              }
            });
            
            rows.forEach(row => tbody.appendChild(row));
          }
        </script>`;

      render(req, res, 'Redeem Review', '/review/redeems', body);
    } catch (err) {
      render(req, res, 'Redeem Review', '/review/redeems', `<div class="card"><h3 style="color:var(--red);">Error</h3><p>${escapeHtml(err.message || String(err))}</p></div>`);
    }
  });

  // ══════════════════════════════════════════════
  //  API: Verification Document Review Actions
  // ══════════════════════════════════════════════

  router.post('/api/review/verification/:userId/:action', express.json(), async (req, res) => {
    try {
      await ensureVerificationReviewColumns();
      const { userId, action } = req.params;
      const notes = String(req.body?.notes || '').trim() || null;

      if (!['approve', 'reject', 'resubmit'].includes(action)) {
        return res.status(400).json({ ok: false, error: 'Invalid action' });
      }

      const user = await knex('userData').where('id', userId).first();
      if (!user) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      const updates = {
        verificationDocsNotes: notes,
        verificationDocsReviewedAt: knex.fn.now(),
        verificationDocsReviewedBy: 'admin',
      };

      if (action === 'approve') {
        updates.verificationDocsStatus = 'approved';
        updates.verification = user.verification === 'true' ? 'true' : 'pending';
      } else if (action === 'reject') {
        updates.verificationDocsStatus = 'rejected';
        updates.verification = 'docs';
      } else {
        updates.verificationDocsStatus = 'resubmission_requested';
        updates.verification = 'docs';
      }

      await knex('userData').where('id', userId).update(updates);

      return res.json({
        ok: true,
        status: updates.verificationDocsStatus,
        message: action === 'approve'
          ? 'Documents approved.'
          : action === 'reject'
            ? 'Submission rejected.'
            : 'Resubmission requested.',
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message || 'Failed to update submission' });
    }
  });

  // ══════════════════════════════════════════════
  //  API: Credit Purchases Review Actions
  // ══════════════════════════════════════════════

  router.post('/api/review/purchases/:id/:action', express.json(), async (req, res) => {
    const { id, action } = req.params;
    const statusMap = { approve: 'completed', reject: 'failed', processing: 'processing' };
    if (!statusMap[action]) return res.status(400).json({ ok: false, error: 'Invalid action' });

    const trx = await knex.transaction();
    try {
      const purchase = await trx('CreditPurchases').where('id', id).first();
      if (!purchase) {
        await trx.rollback();
        return res.status(404).json({ ok: false, error: 'Purchase not found' });
      }

      // Prevent double-approval of already completed purchases
      if (action === 'approve' && purchase.status === 'completed') {
        await trx.rollback();
        return res.status(400).json({ ok: false, error: 'This purchase has already been approved' });
      }

      // Update purchase status
      await trx('CreditPurchases').where('id', id).update({ status: statusMap[action] });

      let notify = null;

      // If approving, credit the user and create wallet transaction
      if (action === 'approve' && purchase.status !== 'completed' && Number(purchase.credits || 0) > 0 && purchase.userId) {
        await trx('userData').where('id', purchase.userId).increment('credits', Number(purchase.credits || 0));
        
        const userRow = await trx('userData').select('credits').where('id', purchase.userId).first();
        
        // Create wallet transaction
        await trx('walletTransactions').insert({
          id: crypto.randomUUID(),
          userId: purchase.userId,
          type: 'credit_purchase',
          amount: Number(purchase.credits || 0),
          balanceAfter: Number(userRow?.credits || 0),
          relatedPurchaseId: purchase.id,
          description: `Admin approved ${String(purchase.paymentMethod || '').toUpperCase()} payment`,
          created_at: trx.fn.now(),
        }).catch(() => {
          // Fallback if walletTransactions table doesn't exist or insert fails
          console.warn('[WARN] Could not create wallet transaction for purchase approval');
        });

        notify = {
          userId: purchase.userId,
          type: 'credit_purchase',
          title: 'Payment approved',
          message: `Your ${String(purchase.paymentMethod || '').toUpperCase()} payment for ${Number(purchase.credits || 0).toLocaleString()} credits has been approved.`,
          priority: 'success',
          category: 'buyer'
        };
      } else if (action === 'reject' && purchase.userId) {
        notify = {
          userId: purchase.userId,
          type: 'payment_rejected',
          title: 'Payment rejected',
          message: `Your ${String(purchase.paymentMethod || '').toUpperCase()} payment was rejected during admin review.`,
          priority: 'warning',
          category: 'buyer'
        };
      }

      await trx.commit();

      // Send notification after commit
      if (notify) {
        await knex('notifications').insert({
          id: crypto.randomUUID(),
          userId: notify.userId,
          type: notify.type,
          title: notify.title,
          message: notify.message,
          priority: notify.priority,
          category: notify.category,
          createdAt: knex.fn.now(),  // ✅ Fixed: Database column is 'createdAt' not 'created_at'
        }).catch(err => {
          console.warn('[WARN] Could not create notification:', err.message);
        });
      }

      res.json({ ok: true });
    } catch (err) {
      await trx.rollback();
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  // ══════════════════════════════════════════════
  //  API: Stripe Review Actions
  // ══════════════════════════════════════════════

  router.post('/api/review/stripe/sync', async (req, res) => {
    try {
      const result = await runStripeSyncNow(100);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.post('/api/review/stripe/payment/:id/:action', express.json(), async (req, res) => {
    const { id, action } = req.params;
    const statusMap = { approve: 'succeeded', reject: 'canceled', processing: 'processing' };
    const purchaseStatusMap = { approve: 'completed', reject: 'failed', processing: 'processing' };
    if (!statusMap[action]) return res.status(400).json({ ok: false, error: 'Invalid action' });

    const trx = await knex.transaction();
    try {
      const payment = await trx('stripeTransactions')
        .where('stripePaymentIntentId', id)
        .orWhere('stripeBalanceTransactionId', id)
        .orWhere('stripeChargeId', id)
        .orWhere('stripeSourceId', id)
        .first();
      if (!payment) {
        await trx.rollback();
        return res.status(404).json({ ok: false, error: 'Stripe payment not found' });
      }

      const purchase = await trx('CreditPurchases')
        .where('stripePaymentIntentId', payment.stripePaymentIntentId || id)
        .orWhere('stripeChargeId', payment.stripeChargeId || id)
        .first();
      if (action === 'reject' && purchase?.status === 'completed') {
        await trx.rollback();
        return res.status(400).json({ ok: false, error: 'Completed Stripe purchases should not be rejected from this screen' });
      }

      await trx('stripeTransactions').where('id', payment.id).update({ status: statusMap[action], syncedAt: trx.fn.now() });

      let notify = null;
      if (purchase) {
        await trx('CreditPurchases').where('id', purchase.id).update({ status: purchaseStatusMap[action] });

        if (action === 'approve' && purchase.status !== 'completed' && Number(purchase.credits || 0) > 0 && purchase.userId) {
          await trx('userData').where('id', purchase.userId).increment('credits', Number(purchase.credits || 0));
          const userRow = await trx('userData').select('credits').where('id', purchase.userId).first();
          await safeInsertWalletTransaction(trx, {
            id: crypto.randomUUID(),
            userId: purchase.userId,
            type: 'credit_purchase',
            amount: Number(purchase.credits || 0),
            balanceAfter: Number(userRow?.credits || 0),
            relatedPurchaseId: purchase.id,
            description: 'Admin approved Stripe payment',
          });
          notify = {
            userId: purchase.userId,
            type: 'credit_purchase',
            title: 'Stripe payment approved',
            message: `Your Stripe payment for ${Number(purchase.credits || 0).toLocaleString()} credits has been approved.`,
            priority: 'success',
            category: 'credit_purchase'
          };
        } else if (action === 'reject' && purchase.userId) {
          notify = {
            userId: purchase.userId,
            type: 'payment_rejected',
            title: 'Stripe payment rejected',
            message: 'Your Stripe payment was marked as rejected by an admin review.',
            priority: 'warning',
            category: 'credit_purchase'
          };
        }
      }

      await trx.commit();
      if (notify) await createNotif(pool, notify);
      res.json({ ok: true });
    } catch (err) {
      await trx.rollback();
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.post('/api/review/stripe/subscription/:id/:action', express.json(), async (req, res) => {
    const { id, action } = req.params;
    const statusMap = { approve: 'active', reject: 'canceled', processing: 'incomplete' };
    if (!statusMap[action]) return res.status(400).json({ ok: false, error: 'Invalid action' });

    try {
      await ensureSubscriptionsTable();
      const existing = await knex('subscriptions').where('stripe_subscription_id', id).first();
      if (!existing) return res.status(404).json({ ok: false, error: 'Subscription not found' });

      await knex('subscriptions').where('stripe_subscription_id', id).update({
        status: statusMap[action],
        cancel_at_period_end: action === 'reject' ? 1 : 0,
        canceled_at: action === 'reject' ? knex.fn.now() : null,
        updated_at: knex.fn.now(),
      });

      if (existing.user_id) {
        await createNotif(pool, {
          userId: existing.user_id,
          type: 'subscription_update',
          title: 'Subscription status updated',
          message: `Your subscription is now marked as ${statusMap[action]}.`,
          priority: action === 'reject' ? 'warning' : 'info',
          category: 'subscription'
        });
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  // ══════════════════════════════════════════════
  //  API: Crypto Review Actions
  // ══════════════════════════════════════════════

  router.post('/api/review/crypto/:id/:action', express.json(), async (req, res) => {
    const { id, action } = req.params;
    const statusMap = { approve: 'completed', reject: 'failed', processing: 'processing' };
    if (!statusMap[action]) return res.status(400).json({ ok: false, error: 'Invalid action' });

    const trx = await knex.transaction();
    try {
      const purchase = await trx('CreditPurchases')
        .where('id', id)
        .whereIn('paymentMethod', ['btc', 'eth', 'ltc', 'sol'])
        .first();

      if (!purchase) {
        await trx.rollback();
        return res.status(404).json({ ok: false, error: 'Crypto purchase not found' });
      }

      if (action === 'reject' && purchase.status === 'completed') {
        await trx.rollback();
        return res.status(400).json({ ok: false, error: 'Completed crypto purchases cannot be rejected without a separate refund flow' });
      }

      await trx('CreditPurchases').where('id', id).update({ status: statusMap[action] });

      let notify = null;
      if (action === 'approve' && purchase.status !== 'completed' && purchase.userId) {
        await trx('userData').where('id', purchase.userId).increment('credits', Number(purchase.credits || 0));
        const userRow = await trx('userData').select('credits').where('id', purchase.userId).first();
        await safeInsertWalletTransaction(trx, {
          id: crypto.randomUUID(),
          userId: purchase.userId,
          type: 'credit_purchase',
          amount: Number(purchase.credits || 0),
          balanceAfter: Number(userRow?.credits || 0),
          relatedPurchaseId: purchase.id,
          description: `Admin approved crypto purchase (${String(purchase.paymentMethod || '').toUpperCase()})`,
        });
        notify = {
          userId: purchase.userId,
          type: 'credit_purchase',
          title: 'Crypto payment approved',
          message: `Your ${String(purchase.paymentMethod || '').toUpperCase()} payment for ${Number(purchase.credits || 0).toLocaleString()} credits has been approved.`,
          priority: 'success',
          category: 'credit_purchase'
        };
      } else if (action === 'reject' && purchase.userId) {
        notify = {
          userId: purchase.userId,
          type: 'payment_rejected',
          title: 'Crypto payment rejected',
          message: `Your ${String(purchase.paymentMethod || '').toUpperCase()} payment was rejected during admin review.`,
          priority: 'warning',
          category: 'credit_purchase'
        };
      }

      await trx.commit();
      if (notify) await createNotif(pool, notify);
      res.json({ ok: true });
    } catch (err) {
      await trx.rollback();
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  // ══════════════════════════════════════════════
  //  API: Redeem Review Actions
  // ══════════════════════════════════════════════

  router.post('/api/review/redeem/:id/:action', express.json(), async (req, res) => {
    const { id, action } = req.params;
    const statusMap = { processing: 'processing', complete: 'completed', reject: 'failed' };
    if (!statusMap[action]) return res.status(400).json({ ok: false, error: 'Invalid action' });

    const trx = await knex.transaction();
    try {
      await ensureRedeemCreditsTable();
      const redeem = await trx('redeemCredits').where('id', id).first();
      if (!redeem) {
        await trx.rollback();
        return res.status(404).json({ ok: false, error: 'Redeem request not found' });
      }

      if (action === 'reject' && redeem.status === 'completed') {
        await trx.rollback();
        return res.status(400).json({ ok: false, error: 'Completed payouts cannot be rejected from this screen' });
      }

      await trx('redeemCredits').where('id', id).update({ status: statusMap[action] });

      let notify = null;
      if (action === 'reject' && redeem.userId) {
        await trx('userData').where('id', redeem.userId).increment('credits', Number(redeem.credits || 0));
        const userRow = await trx('userData').select('credits').where('id', redeem.userId).first();
        await safeInsertWalletTransaction(trx, {
          id: crypto.randomUUID(),
          userId: redeem.userId,
          type: 'admin_adjustment',
          amount: Number(redeem.credits || 0),
          balanceAfter: Number(userRow?.credits || 0),
          description: `Redeem request rejected — credits returned (${String(redeem.chain || '').toUpperCase()})`,
        });
        notify = {
          userId: redeem.userId,
          type: 'redeem_failed',
          title: 'Redeem request rejected',
          message: `${Number(redeem.credits || 0).toLocaleString()} credits were returned to your account because the payout request was rejected.`,
          priority: 'warning',
          category: 'redeem'
        };
      } else if (redeem.userId) {
        notify = {
          userId: redeem.userId,
          type: 'redeem_update',
          title: 'Redeem request updated',
          message: `Your redeem request is now marked as ${statusMap[action]}.`,
          priority: action === 'complete' ? 'success' : 'info',
          category: 'redeem'
        };
      }

      await trx.commit();
      if (notify) await createNotif(pool, notify);
      res.json({ ok: true });
    } catch (err) {
      await trx.rollback();
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  return router;
};
