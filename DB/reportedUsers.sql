-- Drauwper — User and content reports
-- Handles abuse reports for users, drops, and reviews

CREATE TABLE
  `reports` (
    `id` int unsigned NOT NULL AUTO_INCREMENT,
    `reporterId` varchar(10) NOT NULL,
    `targetType` enum('user','drop','review','comment') NOT NULL,
    `targetId` varchar(36) NOT NULL COMMENT 'ID of the reported user/drop/review',
    `type` enum('spam','abuse','copyright','fraud','inappropriate','other') NOT NULL,
    `description` text,
    `status` enum('pending','reviewed','resolved','dismissed') DEFAULT 'pending',
    `moderatorNote` text,
    `resolvedAt` datetime DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_reporterId` (`reporterId`),
    KEY `idx_targetType_targetId` (`targetType`, `targetId`),
    KEY `idx_status` (`status`),
    CONSTRAINT `fk_reports_reporter` FOREIGN KEY (`reporterId`) REFERENCES `userData` (`id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci