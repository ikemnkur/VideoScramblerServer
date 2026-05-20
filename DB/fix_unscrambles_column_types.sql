-- Fix column types for photo_unscrambles and video_unscrambles tables
-- Columns storing JSON data must be TEXT/JSON, not VARCHAR(255)

ALTER TABLE `photo_unscrambles`
  MODIFY COLUMN `watermark_params` MEDIUMTEXT DEFAULT NULL,
  MODIFY COLUMN `keyData`          MEDIUMTEXT DEFAULT NULL,
  MODIFY COLUMN `mediaDetails`     MEDIUMTEXT DEFAULT NULL,
  MODIFY COLUMN `fingerprint`      MEDIUMTEXT DEFAULT NULL,
  MODIFY COLUMN `creator`          MEDIUMTEXT DEFAULT NULL;

ALTER TABLE `video_unscrambles`
  MODIFY COLUMN `watermark_params` MEDIUMTEXT DEFAULT NULL,
  MODIFY COLUMN `keyData`          MEDIUMTEXT DEFAULT NULL,
  MODIFY COLUMN `mediaDetails`     MEDIUMTEXT DEFAULT NULL,
  MODIFY COLUMN `fingerprint`      MEDIUMTEXT DEFAULT NULL,
  MODIFY COLUMN `creator`          MEDIUMTEXT DEFAULT NULL;
