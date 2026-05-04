-- Drauwper — Verification transaction deduplication log
-- Stores every TX hash used for account micro-payment verification.
-- The UNIQUE constraint on (txHash, chain) prevents the same hash
-- from being submitted twice, blocking spoofed or replayed verifications.

CREATE TABLE `verificationTxLog` (
  `id`           int unsigned  NOT NULL AUTO_INCREMENT,
  `txHash`       varchar(128)  NOT NULL,
  `chain`        enum('BTC','ETH','LTC','SOL') NOT NULL,
  `usedBy`       varchar(10)   NOT NULL,   -- userData.id of the account that verified
  `usedForEmail` varchar(255)  NOT NULL,
  `usedAt`       timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_hash_chain` (`txHash`, `chain`),
  KEY `idx_usedBy` (`usedBy`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
