-- KeyChingDB MySQL Database Creation Script
-- Generated from db.json structure

-- Create Database
CREATE DATABASE IF NOT EXISTS KeyChingDB;
USE KeyChingDB;

-- =============================================
-- Table: userData
-- =============================================
CREATE TABLE userData (
    id VARCHAR(10) PRIMARY KEY,
    loginStatus BOOLEAN DEFAULT FALSE,
    lastLogin DATETIME,
    accountType ENUM('buyer', 'seller') NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    firstName VARCHAR(50),
    lastName VARCHAR(50),
    phoneNumber VARCHAR(20),
    birthDate DATE,
    encryptionKey VARCHAR(100),
    credits INT DEFAULT 0,
    reportCount INT DEFAULT 0,
    isBanned BOOLEAN DEFAULT FALSE,
    banReason TEXT,
    banDate DATETIME NULL,
    banDuration INT NULL,
    createdAt BIGINT,
    updatedAt BIGINT,
    passwordHash VARCHAR(255),
    twoFactorEnabled BOOLEAN DEFAULT FALSE,
    twoFactorSecret VARCHAR(50),
    recoveryCodes JSON,
    profilePicture VARCHAR(255),
    bio TEXT,
    socialLinks JSON
);

-- =============================================
-- Table: buyCredits
-- =============================================
CREATE TABLE buyCredits (
    id VARCHAR(10) PRIMARY KEY,
    username VARCHAR(50),
    email VARCHAR(100),
    firstName VARCHAR(50),
    lastName VARCHAR(50),
    phoneNumber VARCHAR(20),
    birthDate DATE,
    encryptionKey VARCHAR(100),
    date BIGINT,
    time VARCHAR(20),
    currency ENUM('BTC', 'ETH', 'LTC') NOT NULL,
    amount DECIMAL(18,8),
    walletAddress VARCHAR(100),
    credits INT,
    status ENUM('completed', 'processing', 'failed') DEFAULT 'processing',
    transactionHash VARCHAR(255),
    FOREIGN KEY (username) REFERENCES userData(username) ON DELETE CASCADE
);

-- =============================================
-- Table: redeemCredits
-- =============================================
CREATE TABLE redeemCredits (
    id VARCHAR(10) PRIMARY KEY,
    firstName VARCHAR(50),
    lastName VARCHAR(50),
    phoneNumber VARCHAR(20),
    birthDate DATE,
    encryptionKey VARCHAR(100),
    currency ENUM('BTC', 'ETH', 'LTC') NOT NULL,
    amount DECIMAL(18,8),
    walletAddress VARCHAR(100),
    credits INT,
    fee INT,
    totalDeduction INT,
    date BIGINT,
    time VARCHAR(20),
    username VARCHAR(50),
    email VARCHAR(100),
    status ENUM('completed', 'processing', 'failed') DEFAULT 'processing',
    FOREIGN KEY (username) REFERENCES userData(username) ON DELETE CASCADE
);

-- =============================================
-- Table: earnings
-- =============================================
CREATE TABLE earnings (
    id VARCHAR(10) PRIMARY KEY,
    date DATE,
    transactionType VARCHAR(50),
    keyTitle VARCHAR(255),
    buyer VARCHAR(50),
    amount DECIMAL(10,2),
    status ENUM('Completed', 'Processing', 'Failed') DEFAULT 'Processing',
    username VARCHAR(50),
    FOREIGN KEY (username) REFERENCES userData(username) ON DELETE CASCADE
);

-- =============================================
-- Table: createdKeys
-- =============================================
CREATE TABLE createdKeys (
    id VARCHAR(10) PRIMARY KEY,
    keyId VARCHAR(20) UNIQUE,
    username VARCHAR(50),
    email VARCHAR(100),
    keyTitle VARCHAR(255),
    keyValue TEXT,
    description TEXT,
    price INT,
    quantity INT,
    sold INT DEFAULT 0,
    available INT,
    creationDate BIGINT,
    expirationDate BIGINT NULL,
    isActive BOOLEAN DEFAULT TRUE,
    isReported BOOLEAN DEFAULT FALSE,
    reportCount INT DEFAULT 0,
    encryptionKey VARCHAR(100),
    tags JSON,
    FOREIGN KEY (username) REFERENCES userData(username) ON DELETE CASCADE
);

-- =============================================
-- Table: unlocks
-- =============================================
CREATE TABLE unlocks (
    id VARCHAR(10) PRIMARY KEY,
    transactionId INT,
    username VARCHAR(50),
    email VARCHAR(100),
    date BIGINT,
    time VARCHAR(20),
    credits INT,
    keyId VARCHAR(20),
    keyTitle VARCHAR(255),
    keyValue TEXT,
    sellerUsername VARCHAR(50),
    sellerEmail VARCHAR(100),
    price INT,
    status ENUM('Completed', 'Pending', 'Failed') DEFAULT 'Pending',
    FOREIGN KEY (username) REFERENCES userData(username) ON DELETE CASCADE,
    FOREIGN KEY (sellerUsername) REFERENCES userData(username) ON DELETE CASCADE,
    FOREIGN KEY (keyId) REFERENCES createdKeys(keyId) ON DELETE CASCADE
);

-- =============================================
-- Table: notifications
-- =============================================
CREATE TABLE notifications (
    id VARCHAR(10) PRIMARY KEY,
    type VARCHAR(50),
    title VARCHAR(255),
    message TEXT,
    createdAt DATETIME,
    priority ENUM('success', 'info', 'warning', 'error') DEFAULT 'info',
    category ENUM('buyer', 'seller') NOT NULL,
    username VARCHAR(50),
    isRead BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (username) REFERENCES userData(username) ON DELETE CASCADE
);

-- =============================================
-- Table: wallet
-- =============================================
CREATE TABLE wallet (
    id VARCHAR(10) PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    balance INT DEFAULT 0,
    totalEarned INT DEFAULT 0,
    totalSpent INT DEFAULT 0,
    pendingCredits INT DEFAULT 0,
    lastUpdated DATETIME,
    FOREIGN KEY (username) REFERENCES userData(username) ON DELETE CASCADE
);

-- =============================================
-- Table: reports
-- =============================================
CREATE TABLE reports (
    id VARCHAR(10) PRIMARY KEY,
    reportId VARCHAR(20) UNIQUE,
    reporterUsername VARCHAR(50),
    reporterEmail VARCHAR(100),
    reportedKeyId VARCHAR(20),
    reportedKeyTitle VARCHAR(255),
    reportedSellerUsername VARCHAR(50),
    reason VARCHAR(255),
    details TEXT,
    status ENUM('under_review', 'resolved', 'rejected') DEFAULT 'under_review',
    createdAt DATETIME,
    updatedAt DATETIME,
    FOREIGN KEY (reporterUsername) REFERENCES userData(username) ON DELETE CASCADE,
    FOREIGN KEY (reportedSellerUsername) REFERENCES userData(username) ON DELETE CASCADE,
    FOREIGN KEY (reportedKeyId) REFERENCES createdKeys(keyId) ON DELETE CASCADE
);

-- =============================================
-- Table: supportTickets
-- =============================================
CREATE TABLE supportTickets (
    id VARCHAR(10) PRIMARY KEY,
    ticketId VARCHAR(20) UNIQUE,
    username VARCHAR(50),
    email VARCHAR(100),
    subject VARCHAR(255),
    description TEXT,
    status ENUM('open', 'closed', 'pending') DEFAULT 'open',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    createdAt DATETIME,
    updatedAt DATETIME,
    responses JSON,
    FOREIGN KEY (username) REFERENCES userData(username) ON DELETE CASCADE
);

-- =============================================
-- INSERT DATA - userData
-- =============================================
INSERT INTO userData VALUES 
('1', TRUE, '2025-09-28 10:10:47', 'buyer', 'user_123', 'johnbuyer@example.com', 'John', 'Smith', '+1-555-0123', '1990-05-15', 'enc_key_abc123', 750, 1, FALSE, '', NULL, NULL, 1693497600000, 1727517000000, '$2b$10$hashedpassword123', FALSE, '', '[]', 'https://i.pravatar.cc/150?img=1', 'Gaming enthusiast and software collector', '{"facebook": "", "twitter": "@johnsmith", "instagram": "", "linkedin": "", "website": ""}'),

('2', TRUE, '2025-09-28 09:15:00', 'seller', 'seller_123', 'jane.seller@example.com', 'Jane', 'Doe', '+1-555-0456', '1985-12-03', 'enc_key_xyz789', 2350, 0, FALSE, '', NULL, NULL, 1680307200000, 1727516100000, '$2b$10$hashedpassword456', TRUE, 'JBSWY3DPEHPK3PXP', '["abc123", "def456", "ghi789"]', 'https://i.pravatar.cc/150?img=2', 'Professional software key vendor', '{"facebook": "", "twitter": "", "instagram": "", "linkedin": "jane-doe", "website": "https://janekeysshop.com"}'),

('3', FALSE, '2025-09-27 18:45:00', 'buyer', 'keycollector', 'collector@example.com', 'Mike', 'Johnson', '+1-555-0789', '1995-08-22', 'enc_key_mno456', 125, 0, FALSE, '', NULL, NULL, 1695340800000, 1727467500000, '$2b$10$hashedpassword789', FALSE, '', '[]', 'https://i.pravatar.cc/150?img=3', 'Always looking for rare software keys', '{"facebook": "", "twitter": "", "instagram": "@keycollector95", "linkedin": "", "website": ""}'),

('6d43', TRUE, '2025-09-28 10:05:33', 'buyer', 'asdf', 'ikemnkur@gmail.com', 'Ikem', 'Nkurumeh', '', '2000-09-11', 'enc_key_1759053933321', 100, 0, FALSE, '', NULL, NULL, 1759053933321, 1759053933321, '$2b$10$hashedpassword', FALSE, '', '[]', 'https://i.pravatar.cc/150?img=22', '', '{"facebook": "", "twitter": "", "instagram": "", "linkedin": "", "website": ""}');

-- =============================================
-- INSERT DATA - buyCredits
-- =============================================
INSERT INTO buyCredits VALUES 
('1', 'user_123', 'john.buyer@example.com', 'John', 'Smith', '+1-555-0123', '1990-05-15', 'enc_key_abc123', 1727517000000, '10:30:00 AM', 'BTC', 0.01000000, 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 500, 'completed', 'a1b2c3d4e5f6789012345678901234567890abcdef'),

('2', 'seller_123', 'jane.seller@example.com', 'Jane', 'Doe', '+1-555-0456', '1985-12-03', 'enc_key_xyz789', 1727430600000, '2:30:00 PM', 'ETH', 0.50000000, '0x742d35Cc6639C0532fEb5e7b9d9d1E8b3c6df8b8', 1000, 'processing', '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01'),

('3', 'keycollector', 'collector@example.com', 'Mike', 'Johnson', '+1-555-0789', '1995-08-22', 'enc_key_mno456', 1727344200000, '6:30:00 PM', 'LTC', 2.50000000, 'ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kg3g4ty', 250, 'completed', 'ltc123456789abcdef0123456789abcdef0123456789abcdef');

-- =============================================
-- INSERT DATA - redeemCredits
-- =============================================
INSERT INTO redeemCredits VALUES 
('1', 'John', 'Smith', '+1-555-0123', '1990-05-15', 'enc_key_abc123', 'BTC', 0.00500000, 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 250, 25, 275, 1727430600000, '3:45:00 PM', 'user_123', 'john.buyer@example.com', 'processing'),

('2', 'Jane', 'Doe', '+1-555-0456', '1985-12-03', 'enc_key_xyz789', 'ETH', 0.25000000, '0x742d35Cc6639C0532fEb5e7b9d9d1E8b3c6df8b8', 500, 50, 550, 1727344200000, '11:20:00 AM', 'seller_123', 'jane.seller@example.com', 'completed');

-- =============================================
-- INSERT DATA - earnings
-- =============================================
INSERT INTO earnings VALUES 
('1', '2025-09-28', 'Key Sale', 'Premium Game License Key', 'user_123', 85.50, 'Completed', 'seller_123'),
('2', '2025-09-27', 'Key Sale', 'Microsoft Office Professional', 'keycollector', 125.00, 'Completed', 'seller_123'),
('3', '2025-09-26', 'Platform Fee', 'Antivirus Software License', 'gamer456', -15.25, 'Completed', 'seller_123'),
('4', '2025-09-25', 'Key Sale', 'Adobe Creative Suite', 'techuser', 200.00, 'Processing', 'seller_123'),
('5', '2025-09-24', 'Earnings Payout', '', '', 450.75, 'Completed', 'seller_123');

-- =============================================
-- INSERT DATA - createdKeys
-- =============================================
INSERT INTO createdKeys VALUES 
('1', 'key_001', 'seller_123', 'jane.seller@example.com', 'Windows 11 Pro License Keys', 'ABCD-EFGH-IJKL-MNOP-QRST', 'Genuine Windows 11 Professional activation keys', 250, 50, 12, 38, 1726762200000, NULL, TRUE, FALSE, 0, 'enc_key_win11', '["windows", "operating-system", "professional"]'),

('2', 'key_002', 'seller_123', 'jane.seller@example.com', 'Steam Game Keys Bundle', 'steam-key-ABCD123456789', 'Premium PC game keys for Steam platform', 150, 25, 8, 17, 1726675800000, NULL, TRUE, FALSE, 0, 'enc_key_steam', '["steam", "gaming", "bundle"]'),

('3', 'key_003', 'seller_123', 'jane.seller@example.com', 'Netflix Premium Accounts', 'netflix-premium-2024-ABCD', '30-day Netflix Premium subscription codes', 100, 30, 15, 15, 1726589400000, 1759125400000, TRUE, FALSE, 0, 'enc_key_netflix', '["netflix", "streaming", "subscription"]'),

('4', 'key_004', 'seller_123', 'jane.seller@example.com', 'Office 365 License Keys', 'office365-ABCD-EFGH-IJKL-MNOP', 'Microsoft Office 365 Business licenses', 300, 20, 5, 15, 1726503000000, NULL, TRUE, FALSE, 0, 'enc_key_office365', '["office", "microsoft", "business", "productivity"]');

-- =============================================
-- INSERT DATA - unlocks
-- =============================================
INSERT INTO unlocks VALUES 
('1', 21, 'user_123', 'john.buyer@example.com', 1727517000000, '10:30:00 AM', 750, 'key_001', 'Windows 11 Pro License Key', 'ABCD-EFGH-IJKL-MNOP-QRST', 'seller_123', 'jane.seller@example.com', 250, 'Completed'),

('2', 23, 'keycollector', 'collector@example.com', 1727430600000, '2:30:00 PM', 375, 'key_002', 'Steam Game Keys Bundle', 'steam-key-ABCD123456789', 'seller_123', 'jane.seller@example.com', 150, 'Completed'),

('3', 13, 'user_123', 'john.buyer@example.com', 1727344200000, '6:15:00 PM', 600, 'key_003', 'Netflix Premium Account', 'netflix-premium-2024-ABCD', 'seller_123', 'jane.seller@example.com', 100, 'Pending');

-- =============================================
-- INSERT DATA - notifications
-- =============================================
INSERT INTO notifications VALUES 
('1', 'key_purchased', 'Key Purchase Successful', 'You purchased "Windows Pro License Key" for 250 credits.', '2025-09-28 10:20:00', 'success', 'buyer', 'user_123', FALSE),

('2', 'credits_purchased', 'Credits Added', 'Successfully purchased 500 credits using Bitcoin payment.', '2025-09-28 08:30:00', 'success', 'buyer', 'user_123', TRUE),

('3', 'credits_approval', 'Payment Processing', 'Your credit purchase of 1000 credits is being processed. This may take up to 24 hours.', '2025-09-28 10:00:00', 'info', 'buyer', 'user_123', FALSE),

('4', 'report_submitted', 'Report Submitted', 'Your report for "Steam Game Code" has been submitted and is under review.', '2025-09-28 06:30:00', 'warning', 'buyer', 'user_123', TRUE),

('5', 'key_sold', 'Key Sold!', 'Your "Archive Password" was purchased by user_42 for 75 credits.', '2025-09-28 09:30:00', 'success', 'seller', 'seller_123', FALSE),

('6', 'key_reported', 'Key Reported', 'Your key "Game DLC Code" has been reported by a buyer. Please review.', '2025-09-28 04:30:00', 'warning', 'seller', 'seller_123', FALSE),

('7', 'redemption_status', 'Key Redemption Confirmed', 'The buyer has confirmed successful redemption of "Windows Pro License Key".', '2025-09-28 07:30:00', 'success', 'seller', 'seller_123', TRUE),

('8', 'credits_approved', 'Credits Approved', 'Your crypto payment has been confirmed. 1000 credits added to your account.', '2025-09-27 10:30:00', 'success', 'buyer', 'user_123', TRUE);

-- =============================================
-- INSERT DATA - wallet
-- =============================================
INSERT INTO wallet VALUES 
('1', 'user_123', 750, 0, 650, 0, '2025-09-28 10:30:00'),
('2', 'seller_123', 2350, 3200, 850, 150, '2025-09-28 09:15:00'),
('3', 'keycollector', 125, 0, 375, 0, '2025-09-27 18:45:00'),
('7d23', 'asdf', 100, 0, 0, 0, '2025-09-28 10:05:33');

-- =============================================
-- INSERT DATA - reports
-- =============================================
INSERT INTO reports VALUES 
('1', 'rep_001', 'user_123', 'user123@example.com', 'key_002', 'Steam Game Keys Bundle', 'seller_123', 'Key not working', 'The provided Steam key appears to be invalid or already used.', 'under_review', '2025-09-28 10:15:00', '2025-09-28 10:15:00'),

('2', 'rep_002', 'keycollector', 'keycollector@example.com', 'key_005', 'Windows Pro License Key', 'seller_456', 'Key not delivered', 'The key was not delivered after purchase.', 'under_review', '2025-09-28 11:00:00', '2025-09-28 11:00:00'),

('3', 'rep_003', 'user_123', 'user123@example.com', 'key_003', 'Netflix Premium Accounts', 'seller_123', 'Misleading description', 'The description claimed a 30-day subscription, but the key was for a shorter period.', 'resolved', '2025-09-27 14:30:00', '2025-09-28 09:00:00');

-- =============================================
-- INSERT DATA - supportTickets
-- =============================================
INSERT INTO supportTickets VALUES 
('1', 'tick_001', 'user_123', 'user123@example.com', 'Issue with Key Delivery', 'I purchased a key but did not receive it in my account.', 'open', 'high', '2025-09-28 10:00:00', '2025-09-28 10:00:00', '[]'),

('2', 'tick_002', 'seller_123', 'seller123@example.com', 'Issue with Key Delivery', 'I have not received payment for my sold keys.', 'open', 'medium', '2025-09-28 09:30:00', '2025-09-28 09:30:00', '[]');

-- =============================================
-- CREATE INDEXES for better performance
-- =============================================
CREATE INDEX idx_userData_username ON userData(username);
CREATE INDEX idx_userData_email ON userData(email);
CREATE INDEX idx_userData_accountType ON userData(accountType);

CREATE INDEX idx_buyCredits_username ON buyCredits(username);
CREATE INDEX idx_buyCredits_status ON buyCredits(status);
CREATE INDEX idx_buyCredits_date ON buyCredits(date);

CREATE INDEX idx_redeemCredits_username ON redeemCredits(username);
CREATE INDEX idx_redeemCredits_status ON redeemCredits(status);

CREATE INDEX idx_earnings_username ON earnings(username);
CREATE INDEX idx_earnings_date ON earnings(date);

CREATE INDEX idx_createdKeys_username ON createdKeys(username);
CREATE INDEX idx_createdKeys_keyId ON createdKeys(keyId);
CREATE INDEX idx_createdKeys_isActive ON createdKeys(isActive);

CREATE INDEX idx_unlocks_username ON unlocks(username);
CREATE INDEX idx_unlocks_keyId ON unlocks(keyId);
CREATE INDEX idx_unlocks_status ON unlocks(status);

CREATE INDEX idx_notifications_username ON notifications(username);
CREATE INDEX idx_notifications_isRead ON notifications(isRead);
CREATE INDEX idx_notifications_createdAt ON notifications(createdAt);

CREATE INDEX idx_wallet_username ON wallet(username);

CREATE INDEX idx_reports_reporterUsername ON reports(reporterUsername);
CREATE INDEX idx_reports_reportedSellerUsername ON reports(reportedSellerUsername);
CREATE INDEX idx_reports_status ON reports(status);

CREATE INDEX idx_supportTickets_username ON supportTickets(username);
CREATE INDEX idx_supportTickets_status ON supportTickets(status);

-- =============================================
-- END OF SCRIPT
-- =============================================