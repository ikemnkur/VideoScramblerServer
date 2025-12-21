-- MySQL dump 10.13  Distrib 8.0.44, for Linux (x86_64)
--
-- Host: 34.57.139.74    Database: videoscrambler
-- ------------------------------------------------------
-- Server version	8.0.41-google

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
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

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'b1fb7176-d1f2-11f0-9251-42010a400002:1-1027';

--
-- Table structure for table `CryptoTransactions_BTC`
--

DROP TABLE IF EXISTS `CryptoTransactions_BTC`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `CryptoTransactions_BTC` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `time` varchar(255) DEFAULT NULL,
  `direction` varchar(255) DEFAULT NULL,
  `amount` varchar(255) DEFAULT NULL,
  `fromAddress` varchar(255) DEFAULT NULL,
  `toAddress` varchar(255) DEFAULT NULL,
  `hash` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CryptoTransactions_BTC`
--

LOCK TABLES `CryptoTransactions_BTC` WRITE;
/*!40000 ALTER TABLE `CryptoTransactions_BTC` DISABLE KEYS */;
INSERT  IGNORE INTO `CryptoTransactions_BTC` VALUES (1,'2025-08-22 02:52:22.000 UTC','IN','0.00024717','bc1qq904ynep5mvwpjxdlyecgeupg22dm8am6cfvgq','bc1q4j9e7equq4xvlyu7tan4gdmkvze7wc0egvykr6','5f010d1e3eb3d9fb12404d271b9399dccf693ff3ca2e2aaef76117fb6398f5ba','2025-11-10 05:00:00');
/*!40000 ALTER TABLE `CryptoTransactions_BTC` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CryptoTransactions_ETH`
--

DROP TABLE IF EXISTS `CryptoTransactions_ETH`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `CryptoTransactions_ETH` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `time` varchar(255) DEFAULT NULL,
  `direction` varchar(255) DEFAULT NULL,
  `amount` varchar(255) DEFAULT NULL,
  `fromAddress` varchar(255) DEFAULT NULL,
  `toAddress` varchar(255) DEFAULT NULL,
  `hash` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CryptoTransactions_ETH`
--

LOCK TABLES `CryptoTransactions_ETH` WRITE;
/*!40000 ALTER TABLE `CryptoTransactions_ETH` DISABLE KEYS */;
INSERT  IGNORE INTO `CryptoTransactions_ETH` VALUES (1,'2025-10-27T05:21:59.000Z','IN','1240860000000000','0x6081258689a75d253d87ce902a8de3887239fe80','0x9a61f30347258a3d03228f363b07692f3cbb7f27','0xb838805293426888a8e44c7a42a3775bf7e2b8c5a779bcd59544dc9cc0bdeaae','2025-11-10 05:00:02');
/*!40000 ALTER TABLE `CryptoTransactions_ETH` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CryptoTransactions_LTC`
--

DROP TABLE IF EXISTS `CryptoTransactions_LTC`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `CryptoTransactions_LTC` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `time` varchar(255) DEFAULT NULL,
  `direction` varchar(255) DEFAULT NULL,
  `amount` varchar(255) DEFAULT NULL,
  `fromAddress` varchar(255) DEFAULT NULL,
  `toAddress` varchar(255) DEFAULT NULL,
  `hash` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CryptoTransactions_LTC`
--

LOCK TABLES `CryptoTransactions_LTC` WRITE;
/*!40000 ALTER TABLE `CryptoTransactions_LTC` DISABLE KEYS */;
INSERT  IGNORE INTO `CryptoTransactions_LTC` VALUES (1,'2025-11-01 15:48:35.000 UTC','IN','0.05063804','ltc1qm2ewl6pzujlq7j70dkwpkzh9fupxrdn8w2na5r','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','b8e47da78beec8a411259482125041131babf4a131801759e715a4bc5c760d2e','2025-11-10 05:00:01'),(2,'2025-11-01 00:45:36.000 UTC','IN','0.02101061','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','40aa886e5202c1f96223a253c114abe570c82d665569fe186739cd80d6a06a5a','2025-11-10 05:00:01'),(3,'2025-10-20 00:40:23.000 UTC','IN','0.027','ltc1q0p5tnqln0x2htpp0rhxh5n77mmzmnqxqxsrv0w','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','c0ebfcbdb27602f1bebbc6033f02c922d7753f50c131056bf96c094ddcd35809','2025-11-10 05:00:01'),(4,'2025-10-19 19:28:42.000 UTC','IN','0.0266269','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','1c1ea540a537e931d9278b48b7e98581220d903ca372fa33b8e5c6251c810ae5','2025-11-10 05:00:01'),(5,'2025-10-18 21:24:49.000 UTC','IN','0.05443066','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','3900e0e289381eb7a941640b4a6742a2bd20edc9dd3d7ffc409c49fbfc241045','2025-11-10 05:00:01'),(6,'2025-10-18 04:30:22.000 UTC','IN','0.10665482','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','57268232f6a18ae1085bc68a78b27d5a2ca2f81cd361e671bcff02b4d9523b8b','2025-11-10 05:00:01'),(7,'2025-10-05 01:12:52.000 UTC','IN','0.01649213','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','3fd224d82484bc9f4482b1bb27acbd4d33cc8d0a81e64e31f3bd497a994a20df','2025-11-10 05:00:01'),(8,'2025-10-04 23:38:28.000 UTC','IN','0.0415835','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','5aad284f9c92ad5573b3d909e57a4914558d99065fb8449d6edcb9eb0a5373c8','2025-11-10 05:00:01'),(9,'2025-10-04 00:08:43.000 UTC','OUT','0.01914703','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','ltc1qtu0qyl057lcm4r0z898lzt42x7r20mfex28v5k','53c9b8776385ce5766d792771ffca02d5b17e6ab2da65d4c4ad06f163fcbbcd4','2025-11-10 05:00:01'),(10,'2025-09-26 22:25:20.000 UTC','IN','0.01434857','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','6176a443a084d04e2e7cfe91c8d864a8803f982b1e009a4a84761565e0dc9d5b','2025-11-10 05:00:01'),(11,'2025-09-26 21:50:31.000 UTC','IN','0.00479846','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','5f3b4567ef29ac2f7cbc6bdcd824c74948d85078cef52c609d37e5e6d00602a6','2025-11-10 05:00:01');
/*!40000 ALTER TABLE `CryptoTransactions_LTC` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CryptoTransactions_SOL`
--

DROP TABLE IF EXISTS `CryptoTransactions_SOL`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `CryptoTransactions_SOL` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `time` varchar(255) DEFAULT NULL,
  `direction` varchar(255) DEFAULT NULL,
  `amount` varchar(255) DEFAULT NULL,
  `fromAddress` varchar(255) DEFAULT NULL,
  `toAddress` varchar(255) DEFAULT NULL,
  `hash` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CryptoTransactions_SOL`
--

LOCK TABLES `CryptoTransactions_SOL` WRITE;
/*!40000 ALTER TABLE `CryptoTransactions_SOL` DISABLE KEYS */;
/*!40000 ALTER TABLE `CryptoTransactions_SOL` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `actions`
--

DROP TABLE IF EXISTS `actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `actions` (
  `id` varchar(40) NOT NULL,
  `TXnumber` int NOT NULL AUTO_INCREMENT,
  `transactionId` varchar(255) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `date` bigint DEFAULT NULL,
  `time` varchar(20) DEFAULT NULL,
  `credits` int DEFAULT NULL,
  `action_name` varchar(255) DEFAULT NULL,
  `action_cost` int DEFAULT NULL,
  `action_details` text,
  `action_description` varchar(255) DEFAULT NULL,
  `action_type` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `TXnumber` (`TXnumber`),
  KEY `username` (`username`),
  CONSTRAINT `unlocks_ibfk_1` FOREIGN KEY (`username`) REFERENCES `userData` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `actions`
--

LOCK TABLES `actions` WRITE;
/*!40000 ALTER TABLE `actions` DISABLE KEYS */;
INSERT  IGNORE INTO `actions` VALUES ('06813fa1-2aee-4a01-bce5-8ae1f0daf002',32,'22ab6c12-d09b-44e8-8885-56419657e2eb','ikemuru','ikemuru@gmail.com',1765350624878,'1:10:24 AM',62,NULL,25,NULL,'pro level video scrambling','scramble-video-pro'),('08774b76-a5ef-46ce-a013-c2562a06715d',23,'9550deb6-17d5-4075-8379-e5536b932fef','ikemuru','ikemuru@gmail.com',1765296588113,'10:09:48 AM',201,NULL,17,NULL,'pro photo scrambling','scramble-photo-pro'),('127d00a8-6ed2-4103-ac30-e4ba1ba1ad0b',13,'1e9ae9f4-8596-4aad-9a49-960776619b05','ikemuru','ikemuru@gmail.com',1765293576086,'9:19:36 AM',355,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('1428b1f5-37b5-4d1e-a38b-580b0398e682',19,'7a1fd877-ed2b-49db-ac36-29390d203425','ikemuru','ikemuru@gmail.com',1765295122208,'9:45:22 AM',265,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('1d665bce-651d-4ee4-94f2-5ce83f25429c',12,'2e537e07-760c-49e1-bf48-320a2967caec','ikemuru','ikemuru@gmail.com',1765292135492,'8:55:35 AM',370,NULL,15,NULL,'Scrambling photo: best-dog-photos-community-cover_675.jpg','scramble'),('1fb982fa-3a42-4971-a013-7a459f496444',24,'0c68e1f4-df38-4b0a-b56c-c669e77dc97e','ikemuru','ikemuru@gmail.com',1765325137397,'6:05:37 PM',194,NULL,7,NULL,'','scramble-photo'),('223c41db-dcc9-48f3-89d6-50439807d22b',25,'1ab922b2-70e8-48f1-991c-645065fefc50','ikemuru','ikemuru@gmail.com',1765328905980,'7:08:25 PM',177,NULL,17,NULL,'pro photo scrambling','scramble-photo-pro'),('2336d7ff-e2c7-440c-a075-6d9cc1f46153',41,'bec2386a-73ea-4b42-a9d5-b3c6be197028','ikemnkur','ikemnkur@gmail.com',1766119148598,'10:39:08 PM',13533,NULL,203,NULL,'pro level video scrambling','scramble-video-pro'),('29d1c0ff-e1c9-4b66-93fd-ac07279fbd65',22,'992a777d-cc54-4c9b-915f-2971d8fb1efb','ikemuru','ikemuru@gmail.com',1765296564949,'10:09:24 AM',218,NULL,17,NULL,'pro photo scrambling','scramble-photo-pro'),('2d7669d7-5776-4e3a-b94e-9a9c9776ecce',9,'41ba745e-aebd-4979-912a-bf6acacba9ab','ikemuru','ikemuru@gmail.com',1765249264651,'9:01:04 PM',55,NULL,15,NULL,'Scrambling photo: best-dog-photos-community-cover_675.jpg','scramble'),('32f29dbc-9521-448c-a2b5-2c29d7ea5f4b',16,'05710176-761a-432c-a92b-379e51c5b1c3','ikemuru','ikemuru@gmail.com',1765294662801,'9:37:42 AM',310,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('3b14f4a9-3f50-42cd-a199-29a7e94ebe10',21,'905937ef-a443-46d4-a472-809f1054fdde','ikemuru','ikemuru@gmail.com',1765295283210,'9:48:03 AM',235,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('3d5456b3-9c07-4ba8-9b8d-52b8a3028b53',39,'204a7566-dae5-473c-bd10-c00c47dd3fb9','ikemnkur','ikemnkur@gmail.com',1766116453616,'9:54:13 PM',13845,NULL,109,NULL,'pro level video scrambling','scramble-video-pro'),('3ed2c7c3-de2d-4e36-a6fd-eef791ed6b6e',8,'98ed03e5-0b7f-4b30-990d-92381b9b1f55','ikemuru','ikemuru@gmail.com',1765248856865,'8:54:16 PM',70,NULL,15,NULL,'Scrambling photo: best-dog-photos-community-cover_675.jpg','scramble'),('3f50e193-1f77-40e4-944e-8570a494b77b',40,'0f0b8266-2fde-4662-87f4-ec438e38381e','ikemnkur','ikemnkur@gmail.com',1766118904400,'10:35:04 PM',13736,NULL,109,NULL,'pro level video scrambling','scramble-video-pro'),('4672a126-1f2a-4075-8a3b-86db8f4f54a0',18,'eb210760-b3da-4248-846b-afe8bf55c6ae','ikemuru','ikemuru@gmail.com',1765295053598,'9:44:13 AM',280,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('4f0ed19a-68a0-45bc-a98b-bd8dcd9e049f',14,'ea47b7e2-14f8-419b-99e1-f42a98a42f81','ikemuru','ikemuru@gmail.com',1765293593460,'9:19:53 AM',340,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('570a8749-a9f2-471b-bb59-af62a524f787',29,'86ff34f1-5bb9-4a83-b75a-84f8c5fbad39','ikemuru','ikemuru@gmail.com',1765347402521,'12:16:42 AM',117,NULL,15,NULL,'pro level video scrambling','scramble-video-pro'),('63fac7f6-e52e-4b86-afbc-dfe30ddbfcf4',38,'f1ebc2f2-32a5-4407-ae2a-1f40ebba667e','ikemnkur','ikemnkur@gmail.com',1766116338655,'9:52:18 PM',13954,NULL,109,NULL,'pro level video scrambling','scramble-video-pro'),('7e18639b-0399-4989-8cd4-1a6dc0dffea0',30,'ca6e6ed0-200c-4c23-9172-9113a8f6597b','ikemuru','ikemuru@gmail.com',1765348659246,'12:37:39 AM',102,NULL,15,NULL,'pro level video scrambling','scramble-video-pro'),('896ec8f8-76e0-4a29-ae18-49ed84adda05',20,'ddbad106-f631-46d4-9846-975ee1aeff76','ikemuru','ikemuru@gmail.com',1765295157579,'9:45:57 AM',250,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('a1596145-cb60-430e-8bbb-32c752e5fbe1',42,'5b2a7fac-2c9c-447f-95b6-edd8a042da9e','testman','testman@gmail.com',1766250429811,'11:07:09 AM',90,NULL,10,NULL,'basic video scrambling','scramble-video'),('a1b5695a-4528-445d-a17e-57d463b117c2',31,'2eb3e6c5-1101-4fe8-beae-8dad8327253f','ikemuru','ikemuru@gmail.com',1765350232801,'1:03:52 AM',87,NULL,15,NULL,'pro level video scrambling','scramble-video-pro'),('a518c944-62cc-471e-aefb-466b09dfa62b',11,'bfb3baf1-7639-4617-bafa-cb89c2c80b42','ikemuru','ikemuru@gmail.com',1765250459507,'9:20:59 PM',385,NULL,15,NULL,'Scrambling photo: best-dog-photos-community-cover_675.jpg','scramble'),('a6994896-6e29-4db9-afdc-1256e4260518',27,'0a8636fa-0e86-4a51-afe5-eaaa2978a4b6','ikemuru','ikemuru@gmail.com',1765342960855,'11:02:40 PM',147,NULL,15,NULL,'pro level video scrambling','scramble-video-pro'),('aa544c3b-cbfb-47f0-ac91-c5cec92c1a28',37,'bf8743ab-3fbc-405b-88b2-0dc50d3a9633','ikemnkur','ikemnkur@gmail.com',1766108759830,'7:45:59 PM',14063,NULL,28,NULL,'pro level video scrambling','scramble-video-pro'),('abe97475-d503-415c-a3ce-cb310c05d755',15,'ffe2ad25-b793-4e98-8115-af5c5924be2b','ikemuru','ikemuru@gmail.com',1765293777928,'9:22:57 AM',325,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('acceca9c-ee88-498b-8641-d585b75abb42',35,'e5c7c2c3-b8e8-4727-9fc7-4e0e214529f2','ikemuru','ikemuru@gmail.com',1765600655289,'10:37:35 PM',3992,NULL,8,NULL,'','scramble-photo'),('b0969a90-fcbd-45b9-b9f4-f51f0c2489b9',34,'2101ad61-af9d-431b-8f4e-fd67d0548ea6','ikemuru','ikemuru@gmail.com',1765583397829,'5:49:57 PM',42,NULL,3,NULL,'','scramble-audio'),('bb891945-7683-4711-a47d-854e2e53fd5e',17,'95bd6bbc-a9eb-4f30-8758-36ea9f39708a','ikemuru','ikemuru@gmail.com',1765294807119,'9:40:07 AM',295,NULL,15,NULL,'pro photo scrambling','scramble-photo-pro'),('cf73ffae-578c-4bd3-8be0-ec4b71feaab5',36,'a85744fe-287c-4162-8928-41267283a9dd','ikemnkur','ikemnkur@gmail.com',1766108247024,'7:37:27 PM',14091,NULL,109,NULL,'pro level video scrambling','scramble-video-pro'),('e5449ed9-f9ea-4e97-adf3-7c135ca0717b',33,'4eae4cce-96a1-4992-b111-ff5f087a26ee','ikemuru','ikemuru@gmail.com',1765351220938,'1:20:20 AM',45,NULL,17,NULL,'pro level video scrambling','scramble-video-pro'),('e6d44ab6-e605-4158-b3d6-2f3bc8076f5c',10,'f42fdaaf-6a2a-440e-9237-75474b180296','ikemuru','ikemuru@gmail.com',1765249355677,'9:02:35 PM',40,NULL,15,NULL,'Scrambling photo: best-dog-photos-community-cover_675.jpg','scramble'),('ec4a52b6-ef3b-42f1-91fa-c21230bd3689',28,'2ea983ae-16ef-4235-a557-cac3df6a219e','ikemuru','ikemuru@gmail.com',1765347365409,'12:16:05 AM',132,NULL,15,NULL,'pro level video scrambling','scramble-video-pro'),('f23d0ef8-a628-42a2-bc8d-efde8613c1cf',26,'bd91d5af-7e1b-409f-b085-76b9ee5280fe','ikemuru','ikemuru@gmail.com',1765342668512,'10:57:48 PM',162,NULL,15,NULL,'pro level video scrambling','scramble-video-pro');
/*!40000 ALTER TABLE `actions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `buyCredits`
--

DROP TABLE IF EXISTS `buyCredits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `buyCredits` (
  `id` varchar(10) NOT NULL DEFAULT '0',
  `username` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `phoneNumber` varchar(20) DEFAULT NULL,
  `birthDate` date DEFAULT NULL,
  `encryptionKey` varchar(100) DEFAULT NULL,
  `date` bigint DEFAULT NULL,
  `time` varchar(50) DEFAULT NULL,
  `currency` varchar(8) DEFAULT NULL,
  `amount` decimal(18,8) DEFAULT NULL,
  `walletAddress` varchar(100) DEFAULT NULL,
  `credits` int DEFAULT NULL,
  `status` enum('completed','processing','failed') DEFAULT 'processing',
  `transactionId` varchar(255) DEFAULT NULL,
  `transactionHash` varchar(255) DEFAULT NULL,
  `transactionScreenshot` varchar(255) DEFAULT NULL,
  `ip` varchar(50) DEFAULT NULL,
  `userAgent` varchar(255) DEFAULT NULL,
  `orderLoggingEnabled` tinyint(1) DEFAULT NULL,
  `session_id` varchar(255) DEFAULT NULL,
  `blockExplorerLink` varchar(255) DEFAULT NULL,
  `rate` decimal(10,3) DEFAULT NULL,
  `cryptoAmount` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `username` (`username`),
  CONSTRAINT `buyCredits_ibfk_1` FOREIGN KEY (`username`) REFERENCES `userData` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `buyCredits`
--

LOCK TABLES `buyCredits` WRITE;
/*!40000 ALTER TABLE `buyCredits` DISABLE KEYS */;
INSERT  IGNORE INTO `buyCredits` VALUES ('0k8dmndb','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1765683665011,'2025-12-14T03:41:05.011Z','USD',1000.00000000,'Stripe',1000,'processing',NULL,'pi_3Se6ALEViYxfJNd20cGBDrgE',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'G0FOMQ7T7A','Stripe',NULL,'10',NULL),('4qoogba1','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1765683055334,'2025-12-14T03:30:55.334Z','USD',500.00000000,'Stripe',500,'processing',NULL,'pi_3Se60HEViYxfJNd21399wIv6',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'G0FOMQ7T7A','Stripe',NULL,'5',NULL),('dn9c3ev4','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1765683267809,'2025-12-14T03:34:27.809Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se64SEViYxfJNd21FrOy7un',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'G0FOMQ7T7A','Stripe',NULL,'20',NULL),('e57e3smm','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1765675757708,'2025-12-14T01:29:17.708Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se46KEViYxfJNd20849fwtc',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'ZBD1124VF4','Stripe',NULL,NULL,NULL),('hae1fc8f','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1765675108474,'2025-12-14T01:18:28.474Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se3v2EViYxfJNd207JgXDNQ',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'customer_id: null','Stripe',NULL,NULL,NULL),('to8aq037','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1765682794839,'2025-12-14T03:26:34.839Z','USD',250.00000000,'Stripe',250,'processing',NULL,'pi_3Se5ufEViYxfJNd20IXhwW2l',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'G0FOMQ7T7A','Stripe',NULL,'2.5',NULL),('uqg31525','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1765675852645,'2025-12-14T01:30:52.645Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se48mEViYxfJNd20YvQk4jK',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'ZBD1124VF4','Stripe',NULL,NULL,NULL),('yvwvycfz','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1765676594999,'2025-12-14T01:43:14.999Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se4BqEViYxfJNd20sVZfFrB',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'ZBD1124VF4','Stripe',NULL,NULL,NULL);
/*!40000 ALTER TABLE `buyCredits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_fingerprints`
--

DROP TABLE IF EXISTS `device_fingerprints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_fingerprints` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `fingerprint_hash` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `short_hash` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `browser` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `os` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `screen_resolution` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timezone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `language` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `full_fingerprint` json DEFAULT NULL,
  `compact_fingerprint` json DEFAULT NULL,
  `first_seen` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `login_count` int DEFAULT '1',
  `is_trusted` tinyint(1) DEFAULT '1',
  `is_blocked` tinyint(1) DEFAULT '0',
  `block_reason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_fingerprint` (`user_id`,`fingerprint_hash`),
  KEY `idx_fingerprint_hash` (`fingerprint_hash`),
  KEY `idx_short_hash` (`short_hash`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_last_seen` (`last_seen`),
  KEY `idx_is_blocked` (`is_blocked`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores device fingerprinting data for security monitoring and fraud detection';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_fingerprints`
--

LOCK TABLES `device_fingerprints` WRITE;
/*!40000 ALTER TABLE `device_fingerprints` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_fingerprints` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` varchar(10) NOT NULL,
  `type` varchar(50) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `message` text,
  `createdAt` datetime DEFAULT NULL,
  `priority` enum('success','info','warning','error') DEFAULT 'info',
  `category` varchar(30) NOT NULL,
  `username` varchar(50) DEFAULT NULL,
  `isRead` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `username` (`username`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`username`) REFERENCES `userData` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT  IGNORE INTO `notifications` VALUES ('0CBSZFUYS3','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 7 credits to: purchase.','2025-12-10 00:05:37','info','unlock','ikemuru',0),('1ESJ8I4SIP','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: Scrambling photo: best-dog-photos-community-cover_675.jpg.','2025-12-09 14:55:35','info','unlock','ikemuru',0),('1GL66HOG0V','credits_spent','Credits Spent: pro level video scrambling','You have spent 109 credits for: pro level video scrambling.','2025-12-19 04:35:04','info','scramble-video-pro','ikemnkur',0),('1O4EH8O7MR','credits_spent','Credits Spent: pro level video scrambling','You have spent 203 credits for: pro level video scrambling.','2025-12-19 04:39:08','info','scramble-video-pro','ikemnkur',0),('2HBZ4KVPQ3','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro level video scrambling.','2025-12-10 06:16:42','info','unlock','ikemuru',0),('323KIY28IU','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro level video scrambling.','2025-12-10 04:57:48','info','unlock','ikemuru',0),('3CBQGIMXRS','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:48:03','info','unlock','ikemuru',0),('47ZQY9337S','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:19:36','info','unlock','ikemuru',0),('4J6DVGXPVJ','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:37:42','info','unlock','ikemuru',0),('4NT7CXSVI6','credits_purchased','Credits Purchase Logged','A new purchase has been logged for user ikemuru.','2025-12-14 01:29:17','info','purchase','ikemuru',0),('4OCQJROU2M','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro level video scrambling.','2025-12-10 05:02:40','info','unlock','ikemuru',0),('50XNC5O8D0','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: Scrambling photo: best-dog-photos-community-cover_675.jpg.','2025-12-09 03:02:35','info','unlock','ikemuru',0),('681LSRW4JP','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 17 credits to: pro photo scrambling.','2025-12-10 01:08:26','info','unlock','ikemuru',0),('6YAJIICISL','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 25 credits to: pro level video scrambling.','2025-12-10 07:10:24','info','unlock','ikemuru',0),('74AU0DQPMY','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:45:22','info','unlock','ikemuru',0),('862T5L4M7P','credits_spent','Credits Spent: pro level video scrambling','You have spent 109 credits for: pro level video scrambling.','2025-12-19 03:52:18','info','scramble-video-pro','ikemnkur',0),('8AUF1O8127','credits_purchased','Credits Purchased','You have purchased $250 credits for 2.5.','2025-12-14 03:26:34','info','purchase','ikemnkur',0),('C5SLGSPH8D','credits_spent','Credits Spent: pro level video scrambling','You have spent 109 credits for: pro level video scrambling.','2025-12-19 03:54:13','info','scramble-video-pro','ikemnkur',0),('DA374WE5XZ','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:45:57','info','unlock','ikemuru',0),('ESG17I1B3O','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro level video scrambling.','2025-12-10 06:37:39','info','unlock','ikemuru',0),('FPS5DEKFBR','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro level video scrambling.','2025-12-10 06:16:05','info','unlock','ikemuru',0),('I3365KYCKI','credits_purchased','Credits Purchased','You have purchased $500 credits for 5.','2025-12-14 03:30:55','info','purchase','ikemnkur',0),('J575PFUTB5','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 17 credits to: pro photo scrambling.','2025-12-09 16:09:25','info','unlock','ikemuru',0),('JUMWBVLWKN','credits_purchased','Credits Purchase Logged','A new purchase has been logged for user ikemuru.','2025-12-14 01:30:52','info','purchase','ikemuru',0),('K0P0U7A3ID','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 17 credits to: pro level video scrambling.','2025-12-10 07:20:21','info','unlock','ikemuru',0),('KCNJZBVKM7','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: Scrambling photo: best-dog-photos-community-cover_675.jpg.','2025-12-09 02:54:16','info','unlock','ikemuru',0),('KRMHXICXHN','credits_purchased','Credits Purchase Logged','A new purchase has been logged for user ikemuru.','2025-12-14 01:43:15','info','purchase','ikemuru',0),('KV3MGEJHDG','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:22:58','info','unlock','ikemuru',0),('NQOUNMI6A1','credits_spent','Credits Spent: pro level video scrambling','You have spent 28 credits for: pro level video scrambling.','2025-12-19 01:45:59','info','scramble-video-pro','ikemnkur',0),('OXPFV3XEH3','credits_spent','Credits Spent: pro level video scrambling','You have spent 109 credits for: pro level video scrambling.','2025-12-19 01:37:27','info','scramble-video-pro','ikemnkur',0),('PZSQBL6NK2','credits_purchased','Credits Purchased','You have purchased $1000 credits for 10.','2025-12-14 03:41:05','info','purchase','ikemnkur',0),('QCLBTD4SYN','credits_spent','Credits Spent: basic video scrambling','You have spent 10 credits for: basic video scrambling.','2025-12-20 17:07:09','info','scramble-video','testman',0),('RY1YMCK36E','credits_purchased','Credits Purchased','You have purchased $2000 credits for 20.','2025-12-14 03:34:27','info','purchase','ikemnkur',0),('S21KYQIPLN','credits_spent','Credits Spent: Purchase Successful','User ikemuru has spent 3 credits to: purchase.','2025-12-12 23:49:57','info','scramble-audio','ikemuru',0),('SXWE5UU70X','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:40:07','info','unlock','ikemuru',0),('T55UWLW12P','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 17 credits to: pro photo scrambling.','2025-12-09 16:09:48','info','unlock','ikemuru',0),('TIH8T09B7J','credits_spent','Credits Spent: Purchase Successful','User ikemuru has spent 8 credits to: purchase.','2025-12-13 04:37:35','info','scramble-photo','ikemuru',0),('U7GYS37BKW','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: Scrambling photo: best-dog-photos-community-cover_675.jpg.','2025-12-09 03:20:59','info','unlock','ikemuru',0),('VLL70BR4PJ','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:19:53','info','unlock','ikemuru',0),('W277ID1D02','credits_purchased','Credits Purchase Logged','A new purchase has been logged for user ikemuru.','2025-12-14 01:18:28','info','purchase','ikemuru',0),('XNB4MAEGGD','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: Scrambling photo: best-dog-photos-community-cover_675.jpg.','2025-12-09 03:01:04','info','unlock','ikemuru',0),('XW42CXTGZZ','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro photo scrambling.','2025-12-09 15:44:13','info','unlock','ikemuru',0),('YRMCHOPEU3','key_purchased','Key Unlocked: Key Purchase Successful','User ikemuru has spent 15 credits to: pro level video scrambling.','2025-12-10 07:03:52','info','unlock','ikemuru',0);
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subscription_history`
--

DROP TABLE IF EXISTS `subscription_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `subscription_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `event_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `old_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `currency` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'USD',
  `event_data` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subscription_id` (`subscription_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_event_type` (`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription_history`
--

LOCK TABLES `subscription_history` WRITE;
/*!40000 ALTER TABLE `subscription_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `subscription_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subscriptions`
--

DROP TABLE IF EXISTS `subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscriptions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `stripe_subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `stripe_customer_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_period_start` timestamp NULL DEFAULT NULL,
  `current_period_end` timestamp NULL DEFAULT NULL,
  `cancel_at_period_end` tinyint(1) DEFAULT '0',
  `canceled_at` timestamp NULL DEFAULT NULL,
  `trial_start` timestamp NULL DEFAULT NULL,
  `trial_end` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripe_subscription_id` (`stripe_subscription_id`),
  UNIQUE KEY `unique_user_subscription` (`user_id`,`status`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_stripe_subscription_id` (`stripe_subscription_id`),
  KEY `idx_stripe_customer_id` (`stripe_customer_id`),
  KEY `idx_status` (`status`),
  KEY `idx_user_status` (`user_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscriptions`
--

LOCK TABLES `subscriptions` WRITE;
/*!40000 ALTER TABLE `subscriptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `subscriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supportTickets`
--

DROP TABLE IF EXISTS `supportTickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supportTickets` (
  `id` varchar(10) NOT NULL,
  `ticketId` varchar(20) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `description` text,
  `status` enum('open','closed','pending') DEFAULT 'open',
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  `responses` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticketId` (`ticketId`),
  KEY `username` (`username`),
  CONSTRAINT `supportTickets_ibfk_1` FOREIGN KEY (`username`) REFERENCES `userData` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supportTickets`
--

LOCK TABLES `supportTickets` WRITE;
/*!40000 ALTER TABLE `supportTickets` DISABLE KEYS */;
/*!40000 ALTER TABLE `supportTickets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `userData`
--

DROP TABLE IF EXISTS `userData`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `userData` (
  `id` varchar(10) NOT NULL,
  `username` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `credits` int DEFAULT NULL,
  `passwordHash` varchar(255) DEFAULT NULL,
  `accountType` enum('free','basic','standard','premium') DEFAULT NULL,
  `lastLogin` datetime DEFAULT NULL,
  `loginStatus` tinyint(1) DEFAULT NULL,
  `firstName` varchar(50) DEFAULT NULL,
  `lastName` varchar(50) DEFAULT NULL,
  `phoneNumber` varchar(20) DEFAULT NULL,
  `birthDate` date DEFAULT NULL,
  `encryptionKey` varchar(100) DEFAULT NULL,
  `reportCount` int DEFAULT NULL,
  `isBanned` tinyint(1) DEFAULT NULL,
  `banReason` text,
  `banDate` datetime DEFAULT NULL,
  `banDuration` int DEFAULT NULL,
  `createdAt` bigint DEFAULT NULL,
  `updatedAt` bigint DEFAULT NULL,
  `twoFactorEnabled` tinyint(1) DEFAULT '0',
  `twoFactorSecret` varchar(50) DEFAULT NULL,
  `recoveryCodes` json DEFAULT NULL,
  `profilePicture` varchar(255) DEFAULT NULL,
  `bio` text,
  `socialLinks` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `userData`
--

LOCK TABLES `userData` WRITE;
/*!40000 ALTER TABLE `userData` DISABLE KEYS */;
INSERT  IGNORE INTO `userData` VALUES ('G0FOMQ7T7A','ikemnkur','ikemnkur@gmail.com',13533,'$2b$12$wQNRmouKQNwP.ThoDYR5hO1O6nCFgZKyoqS4HQqVO3P/0/rXraYtC','free','2025-12-20 18:28:19',1,'ikemnkur','','','1997-08-07','enc_key_1762835495752',0,0,'',NULL,NULL,1762835495752,1762835495752,0,'','[]','https://i.pravatar.cc/150?img=51','','{}'),('LCBGL8EJ7L','testman','testman@gmail.com',90,'$2b$12$/TN5NPt6u0Ui0CFAw1JEk.g/iSsVaj9oO5fKJZEu19gZfbhYDMO8O','free',NULL,1,'test','man','','2025-12-19','enc_key_1766249887916',0,0,'',NULL,NULL,1766249887915,1766249887915,0,'','[]','https://i.pravatar.cc/150?img=32','','{}'),('ZBD1124VF4','ikemuru','ikemuru@gmail.com',3992,'$2b$12$VY3sapBEaH4pOLrOdrvcWOZf8YRHO/gJ4pD7xGnhyOqcc.QEqPdX6','free','2025-12-20 18:02:29',1,'Ikemuru','Nkurumeh','','2000-12-11','enc_key_1765146800055',0,0,'',NULL,NULL,1765146800055,1765146800055,0,'','[]','https://i.pravatar.cc/150?img=46','','{}');
/*!40000 ALTER TABLE `userData` ENABLE KEYS */;
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

-- Dump completed on 2025-12-20 12:33:46
