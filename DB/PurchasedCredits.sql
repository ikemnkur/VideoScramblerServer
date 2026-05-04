-- Credit purchase records
-- Tracks every credit purchase via Stripe or cryptocurrency.
-- Raw payment data stored separately in stripeTransactions.

CREATE TABLE
  `CreditPurchases` (
    `id` varchar(10) NOT NULL,
    `userId` varchar(10) NOT NULL,
    `username` varchar(50) DEFAULT NULL,
    `email` varchar(100) DEFAULT NULL,
    `credits` int NOT NULL DEFAULT '0',
    `package` enum(
      '5000',
      '10000',
      '25000',
      '50000',
      '100000',
      'custom'
    ) DEFAULT NULL,
    `amountPaid` decimal(10, 2) NOT NULL DEFAULT '0.00' COMMENT 'USD amount paid',
    `amount` int DEFAULT NULL COMMENT 'Amount in smallest currency unit (cents)',
    `currency` varchar(8) DEFAULT NULL,
    `paymentMethod` enum('stripe', 'btc', 'eth', 'ltc', 'sol') DEFAULT NULL,
    `status` enum('completed', 'processing', 'failed', 'refunded') DEFAULT NULL,
    `stripePaymentIntentId` varchar(255) DEFAULT NULL,
    `stripeChargeId` varchar(255) DEFAULT NULL,
    `cryptoAmount` decimal(18, 8) DEFAULT NULL,
    `walletAddress` varchar(128) DEFAULT NULL,
    `txHash` varchar(128) DEFAULT NULL,
    `blockExplorerLink` varchar(255) DEFAULT NULL,
    `exchangeRate` decimal(12, 4) DEFAULT NULL,
    `confirmations` int DEFAULT NULL,
    `ip` varchar(45) DEFAULT NULL,
    `userAgent` varchar(255) DEFAULT NULL,
    `session_id` varchar(255) DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `date` varchar(255) DEFAULT NULL,
    `name` varchar(255) DEFAULT NULL,
    `time` varchar(255) DEFAULT NULL,
    `transactionHash` varchar(255) DEFAULT NULL,
    `rate` float DEFAULT NULL,
    `stripeCheckoutSessionId` varchar(255) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_userId` (`userId`),
    KEY `idx_username` (`username`),
    KEY `idx_status` (`status`),
    KEY `idx_paymentMethod` (`paymentMethod`),
    CONSTRAINT `CreditPurchases_ibfk_user` FOREIGN KEY (`userId`) REFERENCES `userData` (`id`) ON DELETE CASCADE,
    CONSTRAINT `CreditPurchases_ibfk_username` FOREIGN KEY (`username`) REFERENCES `userData` (`username`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci