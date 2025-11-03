-- Option to fix the database schema (run this in MySQL)

-- First, check if you have any existing data that might conflict
SELECT * FROM userData;

-- If you want to change to auto-increment integer ID:
ALTER TABLE userData DROP PRIMARY KEY;
ALTER TABLE userData MODIFY COLUMN id INT AUTO_INCREMENT PRIMARY KEY;

-- Or if you want to keep VARCHAR but add a default:
-- ALTER TABLE userData MODIFY COLUMN id VARCHAR(10) DEFAULT (UUID());

-- Note: The UUID() function might not be available in all MySQL versions
-- In that case, use the server-side generation we implemented above