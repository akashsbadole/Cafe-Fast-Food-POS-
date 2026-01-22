-- Migration 014: Customer Loyalty Points System
-- 
-- This migration adds all necessary tables and columns for the loyalty points system
-- including programs, tiers, transactions, rewards, and punch cards.

-- Enable foreign keys for this migration
PRAGMA foreign_keys = ON;

-- 1. Create loyalty_programs table
CREATE TABLE IF NOT EXISTS loyalty_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    points_per_currency REAL NOT NULL DEFAULT 1.0,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    min_purchase_amount REAL DEFAULT 0.0,
    points_expiration_days INTEGER DEFAULT NULL,
    max_points_balance INTEGER DEFAULT NULL,
    UNIQUE(name)
);

-- 2. Create loyalty_tiers table
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    min_points INTEGER NOT NULL,
    max_points INTEGER,
    description TEXT,
    discount_percent REAL DEFAULT 0.0,
    free_shipping BOOLEAN DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    UNIQUE(program_id, name)
);

-- 3. Create loyalty_points_transactions table
CREATE TABLE IF NOT EXISTS loyalty_points_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    program_id INTEGER NOT NULL,
    order_id INTEGER,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'adjustment', 'expired', 'manual')),
    points INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_id INTEGER,
    reference_type VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- 4. Create loyalty_rewards table
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    points_required INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('discount', 'free_product', 'gift_card', 'other')),
    value REAL NOT NULL,
    max_usage_per_customer INTEGER DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE
);

-- 5. Create loyalty_punch_cards table
CREATE TABLE IF NOT EXISTS loyalty_punch_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    required_punches INTEGER NOT NULL,
    reward_description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE
);

-- 6. Create loyalty_punch_card_instances table
CREATE TABLE IF NOT EXISTS loyalty_punch_card_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    punch_card_id INTEGER NOT NULL,
    current_punches INTEGER NOT NULL DEFAULT 0,
    redeemed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (punch_card_id) REFERENCES loyalty_punch_cards(id) ON DELETE CASCADE,
    UNIQUE(customer_id, punch_card_id)
);

-- 7. Create loyalty_customer_memberships table
CREATE TABLE IF NOT EXISTS loyalty_customer_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    program_id INTEGER NOT NULL,
    tier_id INTEGER,
    points_balance INTEGER NOT NULL DEFAULT 0,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    FOREIGN KEY (tier_id) REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
    UNIQUE(customer_id, program_id)
);

-- 8. Add loyalty program columns to customers table
-- Check if column already exists to avoid errors
PRAGMA table_info(customers);
-- We'll use ALTER TABLE to add columns if they don't exist
-- This is a workaround for SQLite which doesn't have IF NOT EXISTS for ALTER TABLE
-- We'll check manually and add only if needed

-- For production, we'll add the columns directly
-- Default value for loyalty_program_id is NULL (no program)
ALTER TABLE customers ADD COLUMN loyalty_program_id INTEGER DEFAULT NULL;
ALTER TABLE customers ADD COLUMN loyalty_points_balance INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN loyalty_tier_id INTEGER DEFAULT NULL;

-- 9. Add loyalty tracking columns to orders table
ALTER TABLE orders ADD COLUMN loyalty_points_earned INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN loyalty_points_redeemed INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN loyalty_program_id INTEGER DEFAULT NULL;

-- 10. Create index for performance
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_points_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_program ON loyalty_points_transactions(program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order ON loyalty_points_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_memberships_customer ON loyalty_customer_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_memberships_program ON loyalty_customer_memberships(program_id);

-- 11. Create view for loyalty customer status
CREATE VIEW IF NOT EXISTS vw_loyalty_customer_status AS
SELECT 
    c.id AS customer_id,
    c.name AS customer_name,
    c.email,
    c.phone,
    lp.id AS program_id,
    lp.name AS program_name,
    lcm.points_balance,
    lt.id AS tier_id,
    lt.name AS tier_name,
    lt.min_points AS tier_min_points,
    lt.max_points AS tier_max_points,
    lt.discount_percent,
    lt.free_shipping,
    lcm.joined_at,
    lcm.last_activity_at
FROM customers c
LEFT JOIN loyalty_customer_memberships lcm ON c.id = lcm.customer_id
LEFT JOIN loyalty_programs lp ON lcm.program_id = lp.id
LEFT JOIN loyalty_tiers lt ON lcm.tier_id = lt.id
WHERE lp.is_active = 1;

-- 12. Create view for loyalty reports
CREATE VIEW IF NOT EXISTS vw_loyalty_reports AS
SELECT 
    lp.id AS program_id,
    lp.name AS program_name,
    COUNT(DISTINCT lcm.customer_id) AS active_members,
    SUM(lcm.points_balance) AS total_points_issued,
    AVG(lcm.points_balance) AS avg_points_per_member,
    COUNT(DISTINCT CASE WHEN lcm.points_balance > 0 THEN lcm.customer_id END) AS members_with_balance,
    COUNT(DISTINCT CASE WHEN lcm.points_balance = 0 THEN lcm.customer_id END) AS members_without_balance,
    COUNT(DISTINCT CASE WHEN lt.id IS NOT NULL THEN lcm.customer_id END) AS members_in_tiers
FROM loyalty_programs lp
LEFT JOIN loyalty_customer_memberships lcm ON lp.id = lcm.program_id
LEFT JOIN loyalty_tiers lt ON lcm.tier_id = lt.id
WHERE lp.is_active = 1
GROUP BY lp.id, lp.name;

-- 13. Create view for points expiration tracking
CREATE VIEW IF NOT EXISTS vw_loyalty_points_expiration AS
SELECT 
    lpt.id,
    lpt.customer_id,
    lpt.program_id,
    lpt.points,
    lpt.balance_after,
    lpt.created_at,
    lp.points_expiration_days,
    DATE(lpt.created_at, lp.points_expiration_days || ' days') AS expiration_date,
    CASE 
        WHEN lp.points_expiration_days IS NOT NULL AND DATE(lpt.created_at, lp.points_expiration_days || ' days') < DATE('now') 
        THEN 1 
        ELSE 0 
    END AS is_expired
FROM loyalty_points_transactions lpt
JOIN loyalty_programs lp ON lpt.program_id = lp.id
WHERE lpt.transaction_type = 'earned';
