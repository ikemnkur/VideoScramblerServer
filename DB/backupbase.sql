-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
--
-- Host: 34.174.158.123    Database: microtrax
-- ------------------------------------------------------
-- Server version	8.0.31-google

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '1530ff4f-4732-11ef-b256-42010a400002:1-15225';

--
-- Table structure for table `account_tiers`
--

DROP TABLE IF EXISTS `account_tiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `account_tiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `daily_transaction_limit` decimal(10,2) NOT NULL,
  `monthly_fee` decimal(5,2) NOT NULL,
  `send_limit` int NOT NULL DEFAULT '10',
  `recieve_limit` int NOT NULL DEFAULT '10',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account_tiers`
--

LOCK TABLES `account_tiers` WRITE;
/*!40000 ALTER TABLE `account_tiers` DISABLE KEYS */;
INSERT INTO `account_tiers` VALUES (1,'Basic',100.00,0.00,10,10),(2,'Standard',500.00,5.00,10,10),(3,'Premium',1000.00,10.00,10,10),(4,'Gold',5000.00,20.00,10,10),(5,'Platinum',10000.00,35.00,10,10),(6,'Diamond',50000.00,50.00,10,10),(7,'Ultimate',100000.00,75.00,10,10);
/*!40000 ALTER TABLE `account_tiers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `balance` int DEFAULT '25',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `account_status` enum('active','suspended','closed') DEFAULT 'active',
  `account_id` varchar(255) DEFAULT NULL,
  `redeemable` int DEFAULT '0',
  `spendable` int DEFAULT '25',
  `user_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`userId`),
  CONSTRAINT `accounts_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
INSERT INTO `accounts` VALUES (6,8,805,'2024-08-25 00:18:05','2024-12-08 01:31:26','active','ACC1724545085519',0,805,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8'),(7,9,1209,'2024-08-25 22:20:48','2024-12-08 01:31:26','active','ACC1724624447803',34,1175,'4566cd6cf-897c-4d96-822c-118adfgdfc8'),(8,10,26021,'2024-08-31 00:10:57','2024-12-08 01:31:26','active','ACC1725063057429',4,26031,'123ds435-897c-4d96-822c-118a4cc899c8'),(9,11,1343,'2024-10-13 03:34:56','2024-12-08 01:31:26','active','ACC1728790496792',1042,301,'dfghfghfcf-897c-4d96-822c-118aa4cc899c8'),(10,12,25,'2024-10-27 19:54:01','2024-12-08 01:31:26','active','ACC1730058841525',0,25,'ewfwgd6cf-897c-4d96-8sdf-118a4cc899c8'),(11,13,75,'2024-11-09 18:52:26','2024-11-09 19:15:33','active','ACC1731178345987',50,25,'d56cd6cf-897c-4d96-822c-118a4cc899c8');
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `content_ratings`
--

DROP TABLE IF EXISTS `content_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `content_ratings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `content_id` int unsigned NOT NULL,
  `user_id` int NOT NULL,
  `rating` decimal(2,1) DEFAULT NULL,
  `like_status` tinyint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `content_user_unique` (`content_id`,`user_id`),
  KEY `content_ratings_ibfk_2` (`user_id`),
  CONSTRAINT `content_ratings_ibfk_1` FOREIGN KEY (`content_id`) REFERENCES `public_content` (`id`),
  CONSTRAINT `content_ratings_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `content_ratings`
--

LOCK TABLES `content_ratings` WRITE;
/*!40000 ALTER TABLE `content_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `content_ratings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `favorites`
--

DROP TABLE IF EXISTS `favorites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favorites` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `userId` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `favorite_user_Id` varchar(255) DEFAULT NULL,
  `favorite_username` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `favorites`
--

LOCK TABLES `favorites` WRITE;
/*!40000 ALTER TABLE `favorites` DISABLE KEYS */;
/*!40000 ALTER TABLE `favorites` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `type` varchar(255) DEFAULT NULL,
  `recipient_user_id` varchar(255) DEFAULT NULL,
  `message` tinytext,
  `from` varchar(255) DEFAULT NULL,
  `date` varchar(255) DEFAULT NULL,
  `recipient_username` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,'2024-10-28 05:07:26','send','10','you sent coins','Admin','10/27/2024','you'),(2,'2024-10-28 05:07:26','alert','10','welcome','Admin','10/27/2024','you'),(3,'2024-10-28 05:07:26','recieve','10','you recieved coins','Admin','10/27/2024','you'),(4,'2024-10-28 05:07:26','alert','10','welcome','Admin','10/27/2024','you'),(5,'2024-10-28 06:37:17','money_received','9','You received ₡34 from ikemnkur.','10',NULL,NULL),(6,'2024-10-28 06:49:07','money_received','11','You received ₡4 from ikemnkur.','10',NULL,NULL),(7,'2024-10-28 06:54:40','money_received','11','You received ₡200 from ikemnkur.','10',NULL,NULL),(8,'2024-10-28 06:56:56','money_received','9','You received ₡17 from ikemnkur.','10',NULL,NULL),(9,'2024-10-28 07:04:55','money_received','9','You received ₡345 from ikemnkur.','10',NULL,NULL),(10,'2024-10-28 07:06:05','money_received','9','You received ₡9 from ikemnkur.','10',NULL,NULL),(11,'2024-10-28 07:12:10','money_received','8','You received ₡45 from ikemnkur.','10',NULL,NULL),(12,'2024-10-28 07:15:09','money_received','11','You received ₡50 from ikemnkur.','10','2024-10-28T07:15:09.909Z','user2'),(13,'2024-10-28 18:08:52','money_received','9','You received ₡23 from user2.','11','2024-10-28T18:08:52.677Z','moneyman'),(14,'2024-11-02 16:38:20','money_received','11','You received ₡50 from ikemnkur.','10','2024-11-02T16:38:20.384Z','user2'),(15,'2024-11-02 16:40:36','money_received','10','You received ₡5 from user2.','11','2024-11-02T16:40:36.408Z','ikemnkur'),(16,'2024-11-08 02:30:50','money_received','11','You received ₡15 from ikemnkur.','10','2024-11-08T02:30:50.675Z','user2'),(17,'2024-11-08 14:46:14','money_received','9','You received ₡34 from ikemnkur.','10','2024-11-08T14:46:14.348Z','moneyman'),(18,'2024-11-09 17:10:39','money_received','11','You received ₡4 from ikemnkur.','10','2024-11-09T17:10:38.987Z','user2'),(19,'2024-11-09 17:35:32','money_received','11','You received ₡23 from ikemnkur.','10','2024-11-09T17:35:32.329Z','user2'),(20,'2024-11-09 19:15:33','money_received','13','You received ₡50 from ikemnkur.','10','2024-11-09T19:15:33.602Z','Testman'),(21,'2024-11-16 23:25:55','money_received','11','You received ₡1000 from ikemnkur.','10','2024-11-16T23:25:55.207Z','user2');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `public_content`
--

DROP TABLE IF EXISTS `public_content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `public_content` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `title` varchar(255) DEFAULT NULL,
  `cost` int DEFAULT '1',
  `description` text,
  `content` json DEFAULT NULL,
  `host_username` varchar(255) DEFAULT NULL,
  `host_user_id` varchar(255) DEFAULT NULL,
  `likes` int DEFAULT '1',
  `unlocks` int DEFAULT '0',
  `views` int DEFAULT '0',
  `type` varchar(255) DEFAULT NULL,
  `reference_id` varchar(255) DEFAULT NULL,
  `dislikes` int DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `public_content`
--

LOCK TABLES `public_content` WRITE;
/*!40000 ALTER TABLE `public_content` DISABLE KEYS */;
INSERT INTO `public_content` VALUES (3,'2024-09-08 04:05:07','The Letter',1,'a code','{\"content\": \"1234\"}','userman','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',4,3,1050,'code','34534534663',0),(5,'2024-09-09 05:00:46','Apple',1,'an apple','{\"content\": \"apple text\"}','userman','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,1,1,'url','b3848420-cffe-4e64-a19d-fc40b46ae5ae',0),(6,'2024-09-14 23:00:32','lockedItem # 444',1,'A test thing','{\"content\": \"secret path.\"}','userman','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,0,0,'url','9417c21e-7965-4522-a268-765307e7c0cd',0),(8,'2024-09-08 15:14:22','D Object',1,'An thing','{\"content\": \"Blah blah blah\"}','userman','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,3,0,'code','8a499ed6-4772-49e0-85c0-6d660ea48f66',0),(9,'2024-09-09 05:00:46','Orange',3,'an apple','{\"content\": \"apple text\"}','ikemnkur','123ds435-897c-4d96-822c-118a4cc899c8',1,0,0,'url','b3848420-cffe-4e64-a19d-fc40b46ae5ae',0),(10,'2024-09-14 23:00:32','the lockedItem # 45',2,'A test thing','{\"content\": \"secret path.\"}','userman','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,0,0,'url','9417c21e-7965-4522-a268-765307e7c0cd',0),(11,'2024-09-09 05:00:46','Lemon',3,'an apple','{\"content\": \"pear text\"}','ikemnkur','123ds435-897c-4d96-822c-118a4cc899c8',1,0,0,'url','b3848420-cffe-4e64-a19d-fc40b46ae5ae',0),(12,'2024-09-09 05:00:46','Banana',3,'an lemon\n','{\"content\": \"blueberry text\"}','ikemnkur','123ds435-897c-4d96-822c-118a4cc899c8',1,0,0,'url','b3848420-cffe-4e64-a19d-fc40b46ae5ae',0),(13,'2024-10-26 09:25:46','retertertd',1,'fgnfg','{\"content\": \"bfgb\"}','user2','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',1,0,45,'url','35861881-d7c4-4205-aaa3-26ab442c9492',0),(14,'2024-10-27 04:42:16','dtgh',1,'eer','{\"content\": \"erherherh\"}','ikemnkur','123ds435-897c-4d96-822c-118a4cc899c8',1,0,0,'url','f3a2f354-6b50-4557-9b94-2efa75719192',0),(16,'2024-10-29 03:10:17','dsgvtd',1,'asdas','{\"content\": \"dsvdsvsdv\"}','ikemnkur','123ds435-897c-4d96-822c-118a4cc899c8',1,0,0,'url','21e6a736-88d1-4253-9fe2-96bba99bfa1c',0),(17,'2024-10-31 05:01:40','sfsdf',1,'vsdvs','{\"content\": \"fbdbfdb\"}','ikemnkur','123ds435-897c-4d96-822c-118a4cc899c8',1,0,0,'url','a0211ae7-6f7f-4c74-9414-9e3f34003c10',0),(18,'2024-11-02 16:42:51','Here is an article',100,'Arctile Link','{\"content\": \"https://steemit.com/artical/@usmanwarraich/11-article-writing-examples-and-samples\"}','user2','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',1,0,0,'url','a00cea30-c510-4d69-9116-98ca285e7ff4',0),(19,'2024-11-09 17:40:14','qwesdfsdfdsf',1,'sadas','\"sdfsdfdsf\"','ikemnkur','123ds435-897c-4d96-822c-118a4cc899c8',1,0,8,'code','288d43bb-0b85-44ed-9f02-6dc18f16c6ef',0),(20,'2024-11-09 19:14:26','Tren Tracks',100,'supp detials','{\"content\": \"https://www.google.com/search?client=ubuntu-sn&channel=fs&q=google.com+train+tracks+near+me+map\"}','Testman','d56cd6cf-897c-4d96-822c-118a4cc899c8',1,0,5,'url','3e975b49-c20f-46f3-a3bd-f84415f6bd1f',0);
/*!40000 ALTER TABLE `public_content` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `public_subscriptions`
--

DROP TABLE IF EXISTS `public_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `public_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `hostuser_id` int NOT NULL,
  `reference_id` varchar(255) NOT NULL,
  `frequency` enum('daily','weekly','monthly','quaterly') NOT NULL DEFAULT 'weekly',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `account_id` varchar(255) DEFAULT NULL,
  `cost` int DEFAULT '10',
  `type` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` tinytext,
  `content` text,
  `host_username` varchar(255) DEFAULT NULL,
  `num_of_subs` int DEFAULT '0',
  `likes` int DEFAULT '0',
  `dislikes` int DEFAULT '0',
  `views` int DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `public_subscriptions`
--

LOCK TABLES `public_subscriptions` WRITE;
/*!40000 ALTER TABLE `public_subscriptions` DISABLE KEYS */;
INSERT INTO `public_subscriptions` VALUES (1,8,'uiluihuilu','weekly','2024-10-02 04:14:52','2024-11-16 23:01:15','6',10,'game','chess','board game',NULL,'sdf',0,0,0,0),(2,10,'1jkhlpou45','daily','2024-10-02 04:14:52','2024-11-16 23:01:15','7',10,'game','dominos','tile',NULL,'asdasd',0,0,0,5),(3,9,'1jkhl687lkjl','daily','2024-10-02 04:14:52','2024-11-16 23:01:15','8',10,'game','solitare','cardgame',NULL,'dfsdfsdf',0,0,0,0),(4,8,'rsthoiu','weekly','2024-10-02 04:14:52','2024-11-16 23:01:15','9',10,'game','majong','tile',NULL,'sdf',0,0,0,0),(5,9,'asdfsdvsdv','daily','2024-10-02 04:14:52','2024-11-16 23:01:15','10',10,'game','solitare','cardgame',NULL,'asd',0,0,0,0),(6,10,'fdgndfg','daily','2024-10-02 04:14:52','2024-11-16 23:01:15','8',10,'game','checkers','board game',NULL,'ewr',0,0,0,0),(7,8,'1dfgsdgfdfg','weekly','2024-10-02 04:14:52','2024-11-16 23:01:15','9',10,'game','chess','board game',NULL,'sdf',0,0,0,0),(12,8,'1dsfsdfasfd','weekly','2024-10-02 04:14:52','2024-11-16 23:01:15','11',10,'game','dice','chance game',NULL,'asdf',0,0,0,0),(15,10,'23r23rfvewr6','weekly','2024-10-29 09:54:48','2024-11-02 03:02:38','10',1,'url','2134534g','123','324234',NULL,0,0,0,0),(16,10,'86ae0ecb-3c55-4a9d-b078-59aff768db09','daily','2024-10-29 10:03:24','2024-11-02 03:02:38','8',1,'url','asd','sdfdsf','sdfsdfvvvv',NULL,0,0,0,0),(18,10,'d4208663-3c7c-4f12-928f-7eefe683f87d','weekly','2024-10-29 10:46:16','2024-11-16 23:00:50','7',12,'software','sad','asd thing','secret code 1','person',0,0,0,0),(19,11,'ef9df118-c044-4d46-84f6-0a5506caf87b','weekly','2024-11-16 15:57:21','2024-11-17 00:57:52',NULL,1,'url','cool thing','thing','cool.com','user 2',0,0,0,10);
/*!40000 ALTER TABLE `public_subscriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchases`
--

DROP TABLE IF EXISTS `purchases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchases` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `username` varchar(255) DEFAULT NULL,
  `amount` int DEFAULT NULL,
  `userid` varchar(255) DEFAULT NULL,
  `reference_id` varchar(255) DEFAULT NULL,
  `stripe` varchar(255) DEFAULT NULL,
  `date` varchar(255) DEFAULT NULL,
  `sessionID` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `transactionId` varchar(255) DEFAULT NULL,
  `data` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchases`
--

LOCK TABLES `purchases` WRITE;
/*!40000 ALTER TABLE `purchases` DISABLE KEYS */;
INSERT INTO `purchases` VALUES (3,'2024-10-19 23:29:31','',0,'10','bba251e5-1f7e-46c5-b7c4-969334023d88',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(4,'2024-10-19 23:32:05','',0,'10','1a7989e1-0be1-4219-af0e-5c6a7943e1c3',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(5,'2024-10-19 23:32:09','ikemnkur',0,'10','7c5dc020-28f8-4312-ab9a-fc0aec020627',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(6,'2024-10-19 23:32:31','',0,'10','b4fda5fb-abeb-4e49-8c8b-4013d3d50b6d',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(7,'2024-10-19 23:33:44','',0,'10','33566836-4cf3-498c-9d75-169f46795716',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(8,'2024-10-19 23:33:45','ikemnkur',0,'10','1d01b8af-6c42-41ad-bff5-121b35c4fbc1',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(9,'2024-10-19 23:33:46','ikemnkur',0,'10','e174ca22-5c60-416f-a580-976040c9f00e',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(10,'2024-10-19 23:35:43','',0,'10','fbc85b28-7919-40e0-b12f-906ff7f1825a',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(11,'2024-10-19 23:41:05','ikemnkur',0,'10','6729443c-9fcc-44ef-b79b-e12801378c82',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(12,'2024-10-19 23:41:08','ikemnkur',0,'10','bba5f780-9f15-4c34-8f34-a80db6ed8efa',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(13,'2024-10-19 23:41:15','',0,'10','a38497b9-06c9-4821-b6a0-8b93f2cba583',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14,'2024-10-19 23:41:15','ikemnkur',0,'10','e38adbd7-cee3-482b-9f5a-f48dd44e3fe7',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(15,'2024-10-19 23:41:37','',0,'10','4f6ead9a-1d63-4020-968b-589af01560ca',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(16,'2024-10-19 23:41:38','ikemnkur',0,'10','460820f7-0521-43cd-9d09-47ed4cdf0d86',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(17,'2024-10-19 23:44:17','',0,'10','c2352b48-30a7-4622-826c-45e5317dd0e4',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(18,'2024-10-19 23:45:52','ikemnkur',0,'10','d43a97e8-e2c0-43d7-ac44-595cdcef59cf',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(19,'2024-10-19 23:45:54','ikemnkur',0,'10','a70d32f9-d362-4238-97d7-c387deece79d',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(20,'2024-10-19 23:45:55','ikemnkur',0,'10','e057937c-4e84-4e09-a0fa-8810ee721150',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(21,'2024-10-19 23:45:56','ikemnkur',0,'10','1f3e622b-8593-457a-ae4a-b65e10649d72',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(22,'2024-10-20 00:03:24','',0,'10','2a51b76c-33d6-4221-8313-48f7ae381783',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(23,'2024-10-20 00:05:53','ikemnkur',0,'10','0345c4b6-007c-47a5-b638-547e5d1bf67e',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(24,'2024-10-20 05:19:25','ikemnkur',2000,'10','30a62e07-d865-40e0-90ae-2de963ef2767',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(25,'2024-10-20 05:22:15','ikemnkur',2000,'10','346abfbb-8072-4c69-88be-a2e4920f6872',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(26,'2024-10-21 05:33:03','ikemnkur',5000,'10','90967dc1-046f-4f53-b4ad-7339c9e9479e','f78651b8-8f5c-4cdd-b92a-25ec89513518','1729488782938',NULL,NULL,NULL,NULL,NULL),(27,'2024-10-21 05:33:14','ikemnkur',5000,'10','25eed84f-30e6-4dfd-9a1b-30c0c4109e76','b517cc0b-dc60-4416-82fa-f228e2787274','1729488794292',NULL,NULL,NULL,NULL,NULL),(28,'2024-10-21 05:35:24','ikemnkur',5000,'10','421d0c10-f01d-4fe8-8509-351836c76f16','956a8e52-de83-453e-bbe8-ad658cbb4465','1729488924639',NULL,NULL,NULL,NULL,NULL),(29,'2024-10-21 05:46:29','ikemnkur',5000,'10','67fde8d1-1402-4cdc-8449-f70885f653eb','bc9cd996-f509-4fcf-bc52-a032695dee2b','1729489589380',NULL,NULL,NULL,NULL,NULL),(30,'2024-10-21 05:47:09','ikemnkur',5000,'10','67aae6b7-98cd-4f96-a66e-a51da4194579','6ef2e92a-112d-4834-82c6-805a86d3a793','1729489629700',NULL,NULL,NULL,NULL,NULL),(31,'2024-10-21 05:48:08','ikemnkur',5000,'10','c74948e9-d8fc-4df7-82dd-bc9985315a6d','e5bfc8dd-0b88-474c-a95b-cf36afe611be','1729489688160','cs_test_a1a8RSXxhElEcMyjxN3HKTcs0PYyrIHfgPcTMJnSaCLWo9iqyHuUJPuEGQ',NULL,NULL,NULL,NULL),(32,'2024-10-25 04:09:43','ikemnkur',1000,'10','a232d51f-0340-43ea-b015-adf73f24929c','246a157e-f8bb-4f7a-bc1a-999e35f0e991','1729829383006','cs_test_a1auYEQJ8g8xrxg79r8cENzSuEINpoNuHvt3F68KLsocrtzrgeAg1a900L',NULL,NULL,NULL,NULL),(33,'2024-10-26 21:47:03','ikemnkur',5000,'10','787cd384-a648-4ecf-a471-2069266d37d9',NULL,'2024-10-26T21:47:03.310Z','5fc4b32b-a4f5-420f-b9ba-2cc2d8024bb6','LTC','Pending','39540tuj9845jg8945jg98456456','{\"username\":\"ikemnkur\",\"userId\":10,\"name\":\"uykiyukyuk\",\"email\":\"rtghrtbhr@dsfg.com\",\"wallertAddress\":\"o43909034ut845ghjh4267hg845gh4987hg249h8g-489\",\"key\":\"fjnij454398\",\"transactionId\":\"39540tuj9845jg8945jg98456456\",\"currency\":\"LTC\",\"amount\":\"5000\",\"date\":\"2024-10-26T21:47:03.310Z\",\"session_id\":\"5fc4b32b-a4f5-420f-b9ba-2cc2d8024bb6\"}'),(37,'2024-10-26 22:38:23','ikemnkur',2355,'10','87fd0615-bb9e-4406-9c5b-0b6bdaa4eeb1',NULL,'2024-10-26T22:38:23.572Z','90cbfcfd-0c81-408e-915c-86af113ae17d','BTC','Pending','31423rrf343v4567b6537n5','{\"username\":\"ikemnkur\",\"userId\":10,\"name\":\"ew4245345\",\"email\":\"dsfdsfsf5545@dafadf.com\",\"wallertAddress\":\"345634t34\",\"key\":\"rwetrewtg5wera vtret\",\"transactionId\":\"31423rrf343v4567b6537n5\",\"currency\":\"BTC\",\"amount\":\"2355\",\"date\":\"2024-10-26T22:38:23.572Z\",\"session_id\":\"90cbfcfd-0c81-408e-915c-86af113ae17d\"}'),(38,'2024-10-26 22:41:30','ikemnkur',3005,'10','6f6c4522-36e5-486b-9e40-1e3420ae90b0',NULL,'2024-10-26T22:41:30.944Z','b52773ae-0e61-4e9b-af8e-df08f9c15af7','BTC','Pending','8934r782h23yhr3498ty9834ty9h','{\"username\":\"ikemnkur\",\"userId\":10,\"name\":\"fdgfdgdfgbb\",\"email\":\"user@gmail.com\",\"wallertAddress\":\"83934r84yf34hh34579fg85473gh8745hg745hg7845h798\",\"key\":\"1234\",\"transactionId\":\"8934r782h23yhr3498ty9834ty9h\",\"currency\":\"BTC\",\"amount\":\"3005\",\"date\":\"2024-10-26T22:41:30.944Z\",\"session_id\":\"b52773ae-0e61-4e9b-af8e-df08f9c15af7\"}'),(39,'2024-10-26 22:42:50','ikemnkur',3005,'10','ad7c4816-6e6c-4d5e-b8de-6c6018b49512',NULL,'2024-10-26T22:42:50.148Z','6864f490-ed47-4fca-8a07-efe154ba21c4','BTC','Pending','8934r782h23yhr3498ty9834ty9hdfgdf','{\"username\":\"ikemnkur\",\"userId\":10,\"name\":\"fdgfdgdfgbb\",\"email\":\"user@gmail.com\",\"wallertAddress\":\"83934r84yf34hh34579fg85473gh8745hg745hg7845h798fdgfdg\",\"key\":\"1234\",\"transactionId\":\"8934r782h23yhr3498ty9834ty9hdfgdf\",\"currency\":\"BTC\",\"amount\":\"3005\",\"date\":\"2024-10-26T22:42:50.148Z\",\"session_id\":\"6864f490-ed47-4fca-8a07-efe154ba21c4\"}'),(40,'2024-10-26 22:44:18','ikemnkur',3005,'10','85dca24b-92c1-4968-b527-b72101e3850a',NULL,'2024-10-26T22:44:17.968Z','3225c87a-9b2a-4d1a-9283-966158fd2a36','BTC','Pending','fdgdfgdfgdfg','{\"username\":\"ikemnkur\",\"userId\":10,\"name\":\"e4gergregreg\",\"email\":\"ewferfgwefgwergfewffg@gmail.com\",\"wallertAddress\":\"wefewfew\",\"key\":\"fewfewfewf\",\"transactionId\":\"fdgdfgdfgdfg\",\"currency\":\"BTC\",\"amount\":\"3005\",\"date\":\"2024-10-26T22:44:17.968Z\",\"session_id\":\"3225c87a-9b2a-4d1a-9283-966158fd2a36\"}'),(41,'2024-10-26 22:45:59','ikemnkur',3005,'10','cec88000-f2f4-4225-b320-ca774d9e0e9b',NULL,'2024-10-26T22:45:59.680Z','2ebe53eb-f631-4f1d-a4eb-94546537adf6','BTC','Pending','fdgdfgdfgdfgfdgdfgdfbgve4rgegerg','{\"username\":\"ikemnkur\",\"userId\":10,\"name\":\"e4gergregreg\",\"email\":\"ewferfgwefgwergfewffg@gmail.com\",\"wallertAddress\":\"wefewfew\",\"key\":\"fewfewfewf\",\"transactionId\":\"fdgdfgdfgdfgfdgdfgdfbgve4rgegerg\",\"currency\":\"BTC\",\"amount\":\"3005\",\"date\":\"2024-10-26T22:45:59.680Z\",\"session_id\":\"2ebe53eb-f631-4f1d-a4eb-94546537adf6\"}'),(42,'2024-10-26 23:01:04','ikemnkur',3242,'10','18abc330-4cfb-4b11-abdc-1527191f6029',NULL,'2024-10-26T23:01:03.992Z','4b8c66e8-da83-41a1-b779-de6e1278a1dc','BTC','Pending','erfg43wrt4356b58m7689,','{\"username\":\"ikemnkur\",\"userId\":10,\"name\":\"ikrhethte\",\"email\":\"rew@kjsdfjkn.com\",\"wallertAddress\":\"roisvdfmnerj8943t89h348hgt3yt89\",\"key\":\"12354\",\"transactionId\":\"erfg43wrt4356b58m7689,\",\"currency\":\"BTC\",\"amount\":\"3242\",\"date\":\"2024-10-26T23:01:03.992Z\",\"session_id\":\"4b8c66e8-da83-41a1-b779-de6e1278a1dc\"}'),(43,'2024-10-26 23:04:27','user2',2345,'11','eca0744b-6047-4d23-94ed-60bd41fa5cc0',NULL,'2024-10-26T23:04:27.721Z','f31dcd6e-d8f0-45a6-ab0c-3a9a5388215c','BTC','Pending','oifpvwj4390t34','{\"username\":\"user2\",\"userId\":11,\"name\":\"eiohweif\",\"email\":\"idco@iodfjgs.com\",\"wallertAddress\":\"djiosjdf4oi34o`\",\"key\":\"49ur34ut\",\"transactionId\":\"oifpvwj4390t34\",\"currency\":\"BTC\",\"amount\":\"2345\",\"date\":\"2024-10-26T23:04:27.721Z\",\"session_id\":\"f31dcd6e-d8f0-45a6-ab0c-3a9a5388215c\"}'),(44,'2024-10-26 23:07:36','user2',12344,'11','b515be2d-f5cd-4ea9-9dd6-90ebe5837ff1',NULL,'2024-10-26T23:07:36.534Z','3fd19c8f-418b-4d0b-b7a4-410af0c1bacc','BTC','Pending','0923r439t3tn340th340tg3ljkg','{\"username\":\"user2\",\"userId\":11,\"name\":\"fw4eerv\",\"email\":\"dsfsdfdsf@asdasd.com\",\"wallertAddress\":\"ionn8493nklvn438nf834n4380h890h\",\"key\":\"9035r0j\",\"transactionId\":\"0923r439t3tn340th340tg3ljkg\",\"currency\":\"BTC\",\"amount\":\"12344\",\"date\":\"2024-10-26T23:07:36.534Z\",\"session_id\":\"3fd19c8f-418b-4d0b-b7a4-410af0c1bacc\"}'),(45,'2024-10-26 23:10:07','user2',12344,'11','6bfa7ddb-8632-400f-9b8a-41cde6cbbc56',NULL,'2024-10-26T23:10:07.214Z','7885614f-c273-4e20-b670-06aa8f4b0e01','BTC','Pending','93498thnigvrgnpoi','{\"username\":\"user2\",\"userId\":11,\"name\":\"jask\",\"email\":\"isnv@gmail.com\",\"wallertAddress\":\"odfiiosdjfwnbfownvoiwervneoirnvieornvo\",\"key\":\"9034rj34g9043thg8\",\"transactionId\":\"93498thnigvrgnpoi\",\"currency\":\"BTC\",\"amount\":\"12344\",\"date\":\"2024-10-26T23:10:07.214Z\",\"session_id\":\"7885614f-c273-4e20-b670-06aa8f4b0e01\"}'),(46,'2024-10-27 19:57:18','superduper',5120,'12','aa0155d4-e9c3-45e4-aa35-92e26f595c59',NULL,'2024-10-27T19:57:18.415Z','6f087b20-b224-4e8c-a9f9-930ef54eacd8','XMR','Pending','904u34tj348tj905mg','{\"username\":\"superduper\",\"userId\":12,\"name\":\"sup man\",\"email\":\"superduper@gmail.com\",\"wallertAddress\":\"1243-04959345j34095jc-i5903uj5cnhvh4568965vn\",\"key\":\"02-3c4ij5089cj\",\"transactionId\":\"904u34tj348tj905mg\",\"currency\":\"XMR\",\"amount\":\"5120\",\"date\":\"2024-10-27T19:57:18.415Z\",\"session_id\":\"6f087b20-b224-4e8c-a9f9-930ef54eacd8\"}');
/*!40000 ALTER TABLE `purchases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subscriptions_ratings`
--

DROP TABLE IF EXISTS `subscriptions_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscriptions_ratings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `content_id` int unsigned NOT NULL,
  `user_id` int NOT NULL,
  `rating` decimal(2,1) DEFAULT NULL,
  `like_status` tinyint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `content_user_unique` (`content_id`,`user_id`),
  KEY `content_ratings_ibfk_2` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscriptions_ratings`
--

LOCK TABLES `subscriptions_ratings` WRITE;
/*!40000 ALTER TABLE `subscriptions_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `subscriptions_ratings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sender_account_id` varchar(255) NOT NULL,
  `recipient_account_id` varchar(255) NOT NULL,
  `amount` int NOT NULL,
  `transaction_type` varchar(255) NOT NULL,
  `status` enum('pending','completed','failed') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `message` text,
  `reference_id` varchar(255) DEFAULT NULL,
  `receiving_user` varchar(255) DEFAULT NULL,
  `sending_user` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sender_account_id` (`sender_account_id`),
  KEY `recipient_account_id` (`recipient_account_id`)
) ENGINE=InnoDB AUTO_INCREMENT=73 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
INSERT INTO `transactions` VALUES (2,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',1,'unlock-content','completed','2024-09-10 12:34:30',NULL,NULL,'idk',NULL),(3,'7','10',1,'unlock-content','completed','2024-09-11 02:08:04',NULL,NULL,'ik',NULL),(4,'7','10',1,'unlock-content','completed','2024-09-14 19:54:28','Sup my YN!','123235345','who',NULL),(5,'7','10',1,'unlock-content','completed','2024-09-14 20:04:14','fssfgfdsg','123235345','incognito',NULL),(6,'8','7',5,'send','completed','2024-09-14 22:51:24',NULL,NULL,'mysterio',NULL),(7,'8','7',3,'send','completed','2024-09-14 22:51:24','cash',NULL,'dude',NULL),(8,'8','7',2,'send','completed','2024-09-14 22:51:24','mopnzy',NULL,'rando',NULL),(9,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',2,'send','completed','2024-09-14 22:51:24','mopnzy',NULL,'bummy',NULL),(10,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',1,'unlock-content','completed','2024-09-10 12:34:30',NULL,NULL,'idk',NULL),(11,'7','10',1,'unlock-content','completed','2024-09-11 02:08:04',NULL,NULL,'ik',NULL),(12,'7','10',1,'unlock-content','completed','2024-09-14 19:54:28','Sup my YN!','123235345','who',NULL),(13,'7','10',1,'unlock-content','completed','2024-09-14 20:04:14','fssfgfdsg','123235345','incognito',NULL),(14,'8','7',5,'send','completed','2024-09-14 22:51:24',NULL,NULL,'mysterio',NULL),(15,'8','7',3,'recieve','completed','2024-09-14 22:51:24','cash',NULL,'???',NULL),(16,'8','7',2,'send','completed','2024-09-14 22:51:24','mopnzy',NULL,'random',NULL),(17,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',2,'recieve','completed','2024-09-14 22:51:24','mopnzy',NULL,'Person B',NULL),(19,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',200,'send','completed','2024-10-25 03:04:00',NULL,NULL,'userman',NULL),(21,'0','10',2355,'purchase','pending','2024-10-26 22:38:23','BTC order: 2355',NULL,'ikemnkur',NULL),(25,'0','10',3005,'purchase','pending','2024-10-26 22:45:59','BTC order: 3005',NULL,'ikemnkur',NULL),(26,'0','10',3242,'purchase','pending','2024-10-26 23:01:04','BTC order: 3242',NULL,'ikemnkur',NULL),(27,'0','11',2345,'purchase','pending','2024-10-26 23:04:27','BTC order: 2345',NULL,'user2',NULL),(28,'0','11',12344,'purchase','pending','2024-10-26 23:07:36','BTC order: 12344',NULL,'user2',NULL),(29,'0','11',12344,'purchase','pending','2024-10-26 23:10:07','BTC order: 12344',NULL,'user2',NULL),(30,'0','12',5120,'purchase','pending','2024-10-27 19:57:18','XMR order: 5120',NULL,'superduper',NULL),(31,'8','6',50,'send','completed','2024-10-28 06:00:54',NULL,NULL,'userman',NULL),(32,'8','6',456,'send','completed','2024-10-28 06:20:58',NULL,NULL,'userman',NULL),(33,'8','7',44,'send','completed','2024-10-28 06:33:38',NULL,NULL,'moneyman',NULL),(34,'8','7',50,'send','completed','2024-10-28 06:34:11',NULL,NULL,'moneyman',NULL),(35,'8','7',56,'send','completed','2024-10-28 06:35:20',NULL,NULL,'moneyman',NULL),(36,'8','7',45,'send','completed','2024-10-28 06:36:07',NULL,NULL,'moneyman',NULL),(37,'8','7',34,'send','completed','2024-10-28 06:37:17',NULL,NULL,'moneyman',NULL),(38,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','4566cd6cf-897c-4d96-822c-118adfgdfc8',4,'send','completed','2024-10-28 06:49:07',NULL,NULL,'user2',NULL),(39,'123ds435-897c-4d96-822c-118a4cc899c8','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',200,'send','completed','2024-10-28 06:54:40',NULL,NULL,'user2',NULL),(40,'123ds435-897c-4d96-822c-118a4cc899c8','4566cd6cf-897c-4d96-822c-118adfgdfc8',17,'send','completed','2024-10-28 06:56:55',NULL,NULL,'moneyman',NULL),(41,'123ds435-897c-4d96-822c-118a4cc899c8','4566cd6cf-897c-4d96-822c-118adfgdfc8',345,'send','completed','2024-10-28 07:04:55',NULL,NULL,'moneyman',NULL),(42,'123ds435-897c-4d96-822c-118a4cc899c8','4566cd6cf-897c-4d96-822c-118adfgdfc8',9,'send','completed','2024-10-28 07:06:05',NULL,NULL,'moneyman',NULL),(43,'123ds435-897c-4d96-822c-118a4cc899c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',34,'send','completed','2024-10-28 07:11:18',NULL,NULL,'userman',NULL),(44,'123ds435-897c-4d96-822c-118a4cc899c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',45,'send','completed','2024-10-28 07:12:10',NULL,NULL,'userman',NULL),(45,'123ds435-897c-4d96-822c-118a4cc899c8','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',50,'send','completed','2024-10-28 07:15:09',NULL,NULL,'user2',NULL),(46,'dfghfghfcf-897c-4d96-822c-118aa4cc899c8','4566cd6cf-897c-4d96-822c-118adfgdfc8',23,'send','completed','2024-10-28 18:08:52',NULL,NULL,'moneyman',NULL),(47,'123ds435-897c-4d96-822c-118a4cc899c8','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',50,'send','completed','2024-11-02 16:38:20',NULL,NULL,'user2',NULL),(48,'dfghfghfcf-897c-4d96-822c-118aa4cc899c8','123ds435-897c-4d96-822c-118a4cc899c8',5,'send','completed','2024-11-02 16:40:36',NULL,NULL,'ikemnkur',NULL),(53,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','4566cd6cf-897c-4d96-822c-118adfgdfc8',1,'unlock-content','completed','2024-11-06 08:31:53',NULL,'b3848420-cffe-4e64-a19d-fc40b46ae5ae',NULL,NULL),(54,'4566cd6cf-897c-4d96-822c-118adfgdfc8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,'content sold','completed','2024-11-06 08:31:53',NULL,'b3848420-cffe-4e64-a19d-fc40b46ae5ae',NULL,NULL),(55,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',1,'unlock-content','completed','2024-11-07 05:12:05',NULL,'8a499ed6-4772-49e0-85c0-6d660ea48f66',NULL,NULL),(56,'123ds435-897c-4d96-822c-118a4cc899c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,'content sold','completed','2024-11-07 05:12:05',NULL,'8a499ed6-4772-49e0-85c0-6d660ea48f66',NULL,NULL),(57,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',1,'unlock-content','completed','2024-11-07 05:18:05',NULL,'8a499ed6-4772-49e0-85c0-6d660ea48f66',NULL,NULL),(58,'123ds435-897c-4d96-822c-118a4cc899c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,'content sold','completed','2024-11-07 05:18:05',NULL,'8a499ed6-4772-49e0-85c0-6d660ea48f66',NULL,NULL),(59,'123ds435-897c-4d96-822c-118a4cc899c8','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',15,'send','completed','2024-11-08 02:30:50',NULL,NULL,'user2',NULL),(60,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',1,'unlock-content','completed','2024-11-08 04:26:58',NULL,'8a499ed6-4772-49e0-85c0-6d660ea48f66',NULL,NULL),(61,'123ds435-897c-4d96-822c-118a4cc899c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,'content sold','completed','2024-11-08 04:26:58',NULL,'8a499ed6-4772-49e0-85c0-6d660ea48f66',NULL,NULL),(62,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',1,'unlock-content','completed','2024-11-08 04:42:42',NULL,'34534534663',NULL,NULL),(63,'123ds435-897c-4d96-822c-118a4cc899c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,'content sold','completed','2024-11-08 04:42:42',NULL,'34534534663',NULL,NULL),(64,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',1,'unlock-content','completed','2024-11-08 05:36:42',NULL,'34534534663',NULL,NULL),(65,'123ds435-897c-4d96-822c-118a4cc899c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,'content sold','completed','2024-11-08 05:36:42',NULL,'34534534663',NULL,NULL),(66,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8','123ds435-897c-4d96-822c-118a4cc899c8',1,'unlock-content','completed','2024-11-08 05:37:50',NULL,'34534534663',NULL,NULL),(67,'123ds435-897c-4d96-822c-118a4cc899c8','sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',1,'content sold','completed','2024-11-08 05:37:50',NULL,'34534534663',NULL,NULL),(68,'123ds435-897c-4d96-822c-118a4cc899c8','4566cd6cf-897c-4d96-822c-118adfgdfc8',34,'send','completed','2024-11-08 14:46:14',NULL,NULL,'moneyman',NULL),(69,'123ds435-897c-4d96-822c-118a4cc899c8','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',4,'send','completed','2024-11-09 17:10:38',NULL,NULL,'user2','ikemnkur'),(70,'123ds435-897c-4d96-822c-118a4cc899c8','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',23,'send','completed','2024-11-09 17:35:32','dsf',NULL,'user2','ikemnkur'),(71,'123ds435-897c-4d96-822c-118a4cc899c8','d56cd6cf-897c-4d96-822c-118a4cc899c8',50,'send','completed','2024-11-09 19:15:33','123 guy',NULL,'Testman','ikemnkur'),(72,'123ds435-897c-4d96-822c-118a4cc899c8','dfghfghfcf-897c-4d96-822c-118aa4cc899c8',1000,'send','completed','2024-11-16 23:25:55','sup budddy',NULL,'user2','ikemnkur');
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_content`
--

DROP TABLE IF EXISTS `user_content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_content` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `title` varchar(255) DEFAULT NULL,
  `cost` int DEFAULT '1',
  `description` text,
  `content` json DEFAULT NULL,
  `host_username` varchar(255) DEFAULT NULL,
  `host_user_id` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `reference_id` varchar(255) DEFAULT NULL,
  `owner_id` varchar(255) DEFAULT NULL,
  `owner_username` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_content`
--

LOCK TABLES `user_content` WRITE;
/*!40000 ALTER TABLE `user_content` DISABLE KEYS */;
INSERT INTO `user_content` VALUES (3,'2024-09-08 04:05:07','The Letter',1,'a code','{\"content\": \"1234\"}','userman','10','code','34534534663','12',NULL),(5,'2024-09-09 05:00:46','Apple',1,'an apple','{\"content\": \"apple text\"}','userman','9','url','b3848420-cffe-4e64-a19d-fc40b46ae5ae','11',NULL),(6,'2024-09-14 23:00:32','lockedItem # 444',1,'A test thing','{\"content\": \"secret path.\"}','userman','8','url','9417c21e-7965-4522-a268-765307e7c0cd','12',NULL),(8,'2024-09-08 15:14:22','D Object',1,'An thing','{\"content\": \"Blah blah blah\"}','userman','10','code','8a499ed6-4772-49e0-85c0-6d660ea48f66','11',NULL),(9,'2024-09-09 05:00:46','Orange',3,'an apple','{\"content\": \"apple text\"}','ikemnkur','9','url','b3848420-cffe-4e64-a19d-fc40b46ae5ae','9',NULL),(10,'2024-09-14 23:00:32','the lockedItem # 45',2,'A test thing','{\"content\": \"secret path.\"}','userman','8','url','9417c21e-7965-4522-a268-765307e7c0cd','10',NULL),(11,'2024-09-09 05:00:46','Lemon',3,'an apple','{\"content\": \"pear text\"}','ikemnkur','9','url','b3848420-cffe-4e64-a19d-fc40b46ae5ae','9',NULL),(12,'2024-09-09 05:00:46','Banana',3,'an lemon\n','{\"content\": \"blueberry text\"}','ikemnkur','9','url','b3848420-cffe-4e64-a19d-fc40b46ae5ae','10',NULL),(13,'2024-10-13 03:57:47','sdsdv',1,'sdvsdv','{\"content\": \"sdvsdzvzaesrfb\"}','user2','11','url','b9ef0ccf-32c1-4031-9797-19382ba9bcab','8',NULL),(14,'2024-10-13 04:10:47','sawe',1,'asdasdsa','{\"content\": \"asfasfas\"}','user2','11','url','96fd3d58-897a-454b-9b7a-e23c2c009671','10',NULL),(15,'2024-10-13 04:12:56','asdf',1,'asdgsfdgfdhfgj','{\"content\": \"qweretryuytui ewre sed fdgerger gwer sdfsdf\"}','user2','11','url','35ccf03b-0de7-42ba-acc1-9bb3ddbacb05','8',NULL);
/*!40000 ALTER TABLE `user_content` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_ratings`
--

DROP TABLE IF EXISTS `user_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_ratings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `ratinguser_id` int NOT NULL,
  `rating` decimal(2,1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_id` (`user_id`),
  CONSTRAINT `user_ratings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_ratings`
--

LOCK TABLES `user_ratings` WRITE;
/*!40000 ALTER TABLE `user_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_ratings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_reports`
--

DROP TABLE IF EXISTS `user_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reporter_id` int NOT NULL,
  `reported_user_id` int NOT NULL,
  `report_message` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `reporter_id` (`reporter_id`),
  KEY `reported_user_id` (`reported_user_id`),
  CONSTRAINT `user_reports_ibfk_1` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_reports_ibfk_2` FOREIGN KEY (`reported_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_reports`
--

LOCK TABLES `user_reports` WRITE;
/*!40000 ALTER TABLE `user_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_subscriptions`
--

DROP TABLE IF EXISTS `user_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `reference_id` varchar(255) NOT NULL,
  `status` enum('active','expired','cancelled') NOT NULL DEFAULT 'active',
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `title` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `cost` varchar(255) DEFAULT NULL,
  `host_username` varchar(255) DEFAULT NULL,
  `content` text,
  `description` tinytext,
  `owner_id` int DEFAULT NULL,
  `owner_username` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_subscriptions`
--

LOCK TABLES `user_subscriptions` WRITE;
/*!40000 ALTER TABLE `user_subscriptions` DISABLE KEYS */;
INSERT INTO `user_subscriptions` VALUES (1,9,'1231233r','active','2010-04-24 00:00:00','2011-03-24 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','sub1','page','2','ikemnkur','234234r2q w','sumtin interesting',8,NULL),(2,9,'23r32r23','active','2024-10-04 00:00:00','2024-11-03 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','123','game','2','moneyman','123412345','sumtin interesting',9,NULL),(3,10,'5324','active','2010-04-24 00:00:00','2011-03-24 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','abc','page','5','userman','thrththeszrnrf','sumtin interesting',11,NULL),(4,10,'53r2r23qr','active','2024-10-04 00:00:00','2024-11-03 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','def','code','5','ikemnkur','123412345','sumtin interesting',9,NULL),(5,9,'52324324','active','2010-04-24 00:00:00','2011-03-24 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','ghi','donate','2','moneyman','thrththeszrnrf','sumtin interesting',10,NULL),(6,9,'51322','active','2024-10-04 00:00:00','2024-11-03 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','lol','page','1','userman','123412345','sumtin interesting',11,NULL),(7,10,'5dsf','active','2010-04-24 00:00:00','2011-03-24 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','4 help','donate','4','ikemnkur','thrththeszrnrf','sumtin interesting',12,NULL),(8,10,'5sdfsdf','active','2024-10-04 00:00:00','2024-11-03 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','support ','donate','6','moneyman','3452543sv','sumtin interesting',10,NULL),(9,10,'2342sdfsdf','active','2010-04-24 00:00:00','2011-03-24 00:00:00','2010-04-24 00:00:00','2024-11-03 15:50:39','4 help','donate','4','ikemnkur','thrththeszrnrf','sumtin interesting',12,NULL);
/*!40000 ALTER TABLE `user_subscriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_tiers`
--

DROP TABLE IF EXISTS `user_tiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_tiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tier_id` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `tier_id` (`tier_id`),
  CONSTRAINT `user_tiers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_tiers_ibfk_2` FOREIGN KEY (`tier_id`) REFERENCES `account_tiers` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_tiers`
--

LOCK TABLES `user_tiers` WRITE;
/*!40000 ALTER TABLE `user_tiers` DISABLE KEYS */;
INSERT INTO `user_tiers` VALUES (3,8,1,'2024-08-25','2024-08-25'),(4,8,1,'2024-08-25','2024-08-25'),(5,8,1,'2024-08-25','2024-08-25'),(6,8,1,'2024-08-25',NULL),(7,9,1,'2024-08-25','2024-08-30'),(8,9,2,'2024-08-30',NULL),(9,10,1,'2024-08-31','2024-08-31'),(10,10,2,'2024-08-31','2024-08-31'),(11,10,4,'2024-08-31','2024-08-31'),(12,10,4,'2024-08-31','2024-08-31'),(13,10,5,'2024-08-31','2024-08-31'),(14,10,2,'2024-08-31','2024-08-31'),(15,10,3,'2024-08-31',NULL),(16,11,1,'2024-10-13',NULL),(17,12,1,'2024-10-27',NULL),(18,13,1,'2024-11-09',NULL);
/*!40000 ALTER TABLE `user_tiers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(128) NOT NULL,
  `salt` varchar(32) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `firstName` varchar(255) DEFAULT NULL,
  `lastName` varchar(255) DEFAULT NULL,
  `phoneNumber` varchar(255) DEFAULT NULL,
  `birthDate` date DEFAULT NULL,
  `account_id` varchar(255) DEFAULT NULL,
  `encryptionKey` varchar(255) DEFAULT NULL,
  `profilePic` varchar(255) DEFAULT NULL,
  `accountTier` int DEFAULT '1',
  `Favorites` mediumtext,
  `bio` text,
  `data` tinytext,
  `unlocks` tinyint DEFAULT '0',
  `subscriptions` tinyint DEFAULT '0',
  `user_id` varchar(255) DEFAULT NULL,
  `rating` float DEFAULT '2.5',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `account_id` (`account_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (8,'userman','user@gmail.com','043853fcfa725028b3c4145e0ea93de8afcebec9cfd7aa0b28fed3901a5d966e757d0431a92b282e9d3b64c451108e41d1a3630d6b191e3ad8bcf588acb4e8cd','c6f8b05656ac758d3c3cc7bdf9cd1e27','2024-08-25 00:18:05','mike','smith','4568791436','2024-08-01','ACC1724545085519','key','https://mui./static/images/avatar/3.jpg',1,'[\"9\"]','Macho Money Maker',NULL,0,0,'sdafdscvrwd56cd6cf-897c-4d96-822c-118adfgs9c8',3),(9,'moneyman','money@gmail.com','1153e2c881e3ece8ebbbffa7ec7d58d9b1f3db83e41dc002dca65597c707f5a66a978f8dd02cfddc52d4c84d4ed266cbbf038797880871aaae09b705ad0e37b7','4cf6de399003127272af7d312230a1d8','2024-08-25 22:20:47','MoneyMan','Bands','4057778577','1999-02-05','ACC1724624447803','cashflow','https://mui./static/images/avatar/3.jpg',2,NULL,'I am a super Rich Boy',NULL,0,0,'4566cd6cf-897c-4d96-822c-118adfgdfc8',3),(10,'ikemnkur','ikemnkur@gmail.com','634b8efe4ee899901c7912d4625e8869e7dd12dc04849e73f5481027f82f3682a063af31b9125ce799f2408e3c982db7a5b794c4754be7e40057ab1a62b05efc','212f606d8371a5d30871648eb7ad506c','2024-08-31 00:10:57','Ikem','NKURUMEH','4055478963','2024-08-06','ACC1725063057429','123',NULL,3,'[\"10\"]','I keep making it rain',NULL,7,0,'123ds435-897c-4d96-822c-118a4cc899c8',3),(11,'user2','user2@gmail.com','2e15af2b48357c25c36da826baaab26bba9debc415bf3cad217aac0bb063b52c0257bb93013d87be6569ac1c75e7fa7f9503d8ace0fc9cee169cc47c813acdd6','385d6808a31985c492707b45c76f4cc7','2024-10-13 03:34:56',NULL,NULL,NULL,NULL,'ACC1728790496792',NULL,NULL,1,NULL,'super man dude',NULL,0,0,'dfghfghfcf-897c-4d96-822c-118aa4cc899c8',3),(12,'superduper','superduper@gmail.com','85829b08d9d4b6e4864737d25e4dd675b4b5a96d77ddc4ca6784838b57e4d052e1897a88896ecbcc86b040f1d97a41a6436ab60b08cae7bec8077b3bff9a123e','cd9f052db853ade3f05ffbf21d2028eb','2024-10-27 19:54:01',NULL,NULL,NULL,NULL,'ACC1730058841525',NULL,NULL,1,NULL,'cash money man',NULL,0,0,'ewfwgd6cf-897c-4d96-8sdf-118a4cc899c8',3),(13,'Testman','testman@gmail.com','1f9b4ec87dfeddd966faebb415cf5c2313e898ef4d6a17acee3aaf528d4e48425d7fa3f8ba76f7c4834cde6aebfed3bb6dd8fc1d660148a081de1f526a9fb861','e47b16ac0cf0b8432c7891de4b2c1e7c','2024-11-09 18:52:25',NULL,NULL,NULL,NULL,'ACC1731178345987',NULL,NULL,1,NULL,'money man malone',NULL,0,0,'d56cd6cf-897c-4d96-822c-118a4cc899c8',2.5);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `withdraws`
--

DROP TABLE IF EXISTS `withdraws`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `withdraws` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `username` varchar(255) DEFAULT NULL,
  `amount` int DEFAULT NULL,
  `userid` varchar(255) DEFAULT NULL,
  `reference_id` varchar(255) DEFAULT NULL,
  `method` varchar(255) DEFAULT NULL,
  `formdata` json DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `withdraws`
--

LOCK TABLES `withdraws` WRITE;
/*!40000 ALTER TABLE `withdraws` DISABLE KEYS */;
INSERT INTO `withdraws` VALUES (1,'2024-10-26 03:25:52','ikemnkur',5000,'10','179c1109-fdb0-44da-bf27-6bfb540ee540',NULL,NULL),(2,'2024-10-26 03:48:09','ikemnkur',5200,'10','f7f6710c-19d0-4830-99c8-10b2f4bce5cb',NULL,NULL),(3,'2024-10-26 04:15:12','ikemnkur',3500,'10','f844d9b5-0e67-4308-849c-24ad5b1520b7',NULL,NULL),(4,'2024-10-26 05:12:07','ikemnkur',5000,'10','5e52b3e5-192d-4d2c-927d-e28792935691',NULL,NULL),(5,'2024-10-26 05:15:38','ikemnkur',3456,'10','ee498e47-98a1-492e-a5d2-75412e2bbf07','XMR','{\"date\": \"2024-10-26T05:15:38.372Z\", \"fees\": 100, \"rate\": 158250, \"email\": \"ikemnkur@gmail.com\", \"amount\": 3456, \"method\": \"XMR\", \"balance\": 32860, \"currency\": \"XMR\", \"lastname\": \"NKURUMEH\", \"username\": \"ikemnkur\", \"waitTime\": \"3-6 hrs\", \"extraData\": {\"cryptoAddress\": \"bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297\"}, \"firstname\": \"Ikem\", \"serverCost\": 34.56, \"minWithdraw\": 2500}'),(6,'2024-10-26 06:01:59','ikemnkur',4234,'10','eae32db7-84a1-443c-b400-07cdf862f31f','XMR','{\"date\": \"2024-10-26T06:01:59.850Z\", \"fees\": 100, \"rate\": 158160, \"email\": \"ikemnkur@gmail.com\", \"amount\": 4234, \"method\": \"XMR\", \"balance\": 32860, \"currency\": \"XMR\", \"lastname\": \"NKURUMEH\", \"username\": \"ikemnkur\", \"waitTime\": \"3-6 hrs\", \"extraData\": {\"cryptoAddress\": \"bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297\"}, \"firstname\": \"Ikem\", \"serverCost\": 42.34, \"minWithdraw\": 2500}');
/*!40000 ALTER TABLE `withdraws` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2024-12-09 22:01:18
