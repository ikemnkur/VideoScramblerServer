-- =============================================
--  Drauwper · followers
--  User-to-user follow relationships
-- =============================================

CREATE TABLE IF NOT EXISTS `followers` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `followerId`  VARCHAR(10) NOT NULL COMMENT 'The user who is following',
  `followeeId`  VARCHAR(10) NOT NULL COMMENT 'The user being followed',
  `createdAt`   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_follow` (`followerId`, `followeeId`),
  KEY `idx_followee` (`followeeId`),
  CONSTRAINT `fk_follower_user` FOREIGN KEY (`followerId`) REFERENCES `userData` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_followee_user` FOREIGN KEY (`followeeId`) REFERENCES `userData` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
