-- Enhanced Inventory Management Database Schema
-- This migration adds comprehensive inventory management functionality

-- Create inventory categories table
CREATE TABLE IF NOT EXISTS inventory_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
);

-- Create inventory suppliers table
CREATE TABLE IF NOT EXISTS inventory_suppliers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_email (email)
);

-- Create inventory items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    category_id INT NOT NULL,
    stock_quantity INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    cost_price DECIMAL(10,2) DEFAULT 0.00,
    selling_price DECIMAL(10,2) DEFAULT 0.00,
    unit ENUM('piece', 'kg', 'g', 'ml', 'l', 'pack', 'box') DEFAULT 'piece',
    supplier_id INT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers(id) ON DELETE SET NULL,
    UNIQUE KEY unique_item_name (name),
    INDEX idx_category (category_id),
    INDEX idx_supplier (supplier_id),
    INDEX idx_stock_quantity (stock_quantity),
    INDEX idx_low_stock_threshold (low_stock_threshold)
);

-- Create inventory adjustments table (for tracking stock changes)
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    type ENUM('add', 'remove', 'set') NOT NULL,
    quantity INT NOT NULL,
    reason VARCHAR(200) NOT NULL,
    previous_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    adjusted_by INT,
    adjusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_item (item_id),
    INDEX idx_adjusted_by (adjusted_by),
    INDEX idx_adjusted_at (adjusted_at)
);

-- Create inventory logs table (for audit trail)
CREATE TABLE IF NOT EXISTS inventory_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT,
    action VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_item (item_id),
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
);

-- Insert default inventory categories
INSERT INTO inventory_categories (name, description) VALUES
('Coffee & Beverages', 'Coffee, tea, and other beverages'),
('Food Items', 'Snacks, meals, and food products'),
('Packaging', 'Cups, lids, bags, and packaging materials'),
('Cleaning Supplies', 'Cleaning and sanitization products'),
('Office Supplies', 'Paper, pens, and office materials'),
('Equipment Parts', 'Machine parts and equipment components')
ON DUPLICATE KEY UPDATE name=name;

-- Insert default suppliers (if they don't exist)
INSERT INTO inventory_suppliers (name, contact_person, phone, email, address, notes) VALUES
('Coffee Bean Co.', 'John Smith', '+1234567890', 'john@coffeebean.com', '123 Coffee St, Coffee City', 'Primary coffee supplier'),
('Bakery Supplies Ltd.', 'Sarah Johnson', '+1234567891', 'sarah@bakery.com', '456 Bakery Rd, Food Town', 'Pastries and baked goods'),
('Packaging Plus', 'Mike Wilson', '+1234567892', 'mike@packaging.com', '789 Package Ave, Box City', 'Packaging materials'),
('Clean Solutions', 'Lisa Brown', '+1234567893', 'lisa@cleansol.com', '321 Clean St, Sanitize Town', 'Cleaning supplies')
ON DUPLICATE KEY UPDATE name=name;

-- Create views for common queries

-- View for inventory items with category and supplier info
CREATE OR REPLACE VIEW inventory_items_view AS
SELECT 
    i.id,
    i.name,
    i.category_id,
    c.name as category_name,
    i.stock_quantity,
    i.low_stock_threshold,
    i.cost_price,
    i.selling_price,
    i.unit,
    i.supplier_id,
    s.name as supplier_name,
    i.description,
    i.created_at,
    i.updated_at,
    CASE 
        WHEN i.stock_quantity = 0 THEN 'out_of_stock'
        WHEN i.stock_quantity <= i.low_stock_threshold THEN 'low_stock'
        ELSE 'in_stock'
    END as stock_status,
    (i.stock_quantity * i.cost_price) as total_value
FROM inventory_items i
LEFT JOIN inventory_categories c ON i.category_id = c.id
LEFT JOIN inventory_suppliers s ON i.supplier_id = s.id;

-- View for low stock items
CREATE OR REPLACE VIEW low_stock_items_view AS
SELECT * FROM inventory_items_view 
WHERE stock_quantity <= low_stock_threshold AND stock_quantity > 0
ORDER BY stock_quantity ASC;

-- View for out of stock items
CREATE OR REPLACE VIEW out_of_stock_items_view AS
SELECT * FROM inventory_items_view 
WHERE stock_quantity = 0
ORDER BY updated_at DESC;

-- View for inventory summary by category
CREATE OR REPLACE VIEW inventory_summary_by_category AS
SELECT 
    c.id as category_id,
    c.name as category_name,
    COUNT(i.id) as item_count,
    SUM(i.stock_quantity) as total_stock,
    SUM(i.stock_quantity * i.cost_price) as total_value,
    SUM(CASE WHEN i.stock_quantity <= i.low_stock_threshold AND i.stock_quantity > 0 THEN 1 ELSE 0 END) as low_stock_items,
    SUM(CASE WHEN i.stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_items,
    AVG(i.stock_quantity) as avg_stock_level
FROM inventory_categories c
LEFT JOIN inventory_items i ON c.id = i.category_id
GROUP BY c.id, c.name
ORDER BY total_value DESC;

-- Add triggers for automatic logging

-- Trigger to log inventory item creation
DELIMITER $$
CREATE TRIGGER inventory_item_created
AFTER INSERT ON inventory_items
FOR EACH ROW
BEGIN
    INSERT INTO inventory_logs (item_id, action, description, user_id)
    VALUES (NEW.id, 'ITEM_CREATED', CONCAT('Item created: ', NEW.name), NEW.id);
END$$
DELIMITER ;

-- Trigger to log inventory item updates
DELIMITER $$
CREATE TRIGGER inventory_item_updated
AFTER UPDATE ON inventory_items
FOR EACH ROW
BEGIN
    IF OLD.name != NEW.name THEN
        INSERT INTO inventory_logs (item_id, action, description, user_id)
        VALUES (NEW.id, 'ITEM_RENAMED', CONCAT('Item renamed from "', OLD.name, '" to "', NEW.name, '"'), NEW.id);
    END IF;
    
    IF OLD.stock_quantity != NEW.stock_quantity THEN
        INSERT INTO inventory_logs (item_id, action, description, user_id)
        VALUES (NEW.id, 'STOCK_UPDATED', CONCAT('Stock updated from ', OLD.stock_quantity, ' to ', NEW.stock_quantity), NEW.id);
    END IF;
    
    IF OLD.cost_price != NEW.cost_price THEN
        INSERT INTO inventory_logs (item_id, action, description, user_id)
        VALUES (NEW.id, 'COST_UPDATED', CONCAT('Cost price updated from ', OLD.cost_price, ' to ', NEW.cost_price), NEW.id);
    END IF;
    
    IF OLD.selling_price != NEW.selling_price THEN
        INSERT INTO inventory_logs (item_id, action, description, user_id)
        VALUES (NEW.id, 'PRICE_UPDATED', CONCAT('Selling price updated from ', OLD.selling_price, ' to ', NEW.selling_price), NEW.id);
    END IF;
END$$
DELIMITER ;

-- Trigger to log inventory item deletion
DELIMITER $$
CREATE TRIGGER inventory_item_deleted
BEFORE DELETE ON inventory_items
FOR EACH ROW
BEGIN
    INSERT INTO inventory_logs (item_id, action, description, user_id)
    VALUES (OLD.id, 'ITEM_DELETED', CONCAT('Item deleted: ', OLD.name), OLD.id);
END$$
DELIMITER ;

-- Add indexes for better performance on common queries
CREATE INDEX idx_inventory_items_status ON inventory_items (stock_quantity, low_stock_threshold);
CREATE INDEX idx_inventory_adjustments_item_date ON inventory_adjustments (item_id, adjusted_at);
CREATE INDEX idx_inventory_logs_item_date ON inventory_logs (item_id, created_at);

-- Add foreign key constraints for data integrity
ALTER TABLE inventory_items 
ADD CONSTRAINT fk_inventory_category 
FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE CASCADE;

ALTER TABLE inventory_items 
ADD CONSTRAINT fk_inventory_supplier 
FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers(id) ON DELETE SET NULL;

ALTER TABLE inventory_adjustments 
ADD CONSTRAINT fk_adjustment_item 
FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;

ALTER TABLE inventory_adjustments 
ADD CONSTRAINT fk_adjustment_user 
FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE inventory_logs 
ADD CONSTRAINT fk_log_item 
FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;

ALTER TABLE inventory_logs 
ADD CONSTRAINT fk_log_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
