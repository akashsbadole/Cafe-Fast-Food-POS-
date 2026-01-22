-- PostgreSQL Migration: Combo/Meal Deals for Cafe POS
-- Run this script to add combo deal support to the database

-- Combo deals table
CREATE TABLE IF NOT EXISTS combo_deals (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    combo_code TEXT UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    min_quantity INTEGER DEFAULT 1,
    max_quantity INTEGER,
    allow_customization BOOLEAN DEFAULT TRUE,
    has_discount BOOLEAN DEFAULT TRUE,
    discount_type VARCHAR(20) DEFAULT 'fixed', -- 'fixed' or 'percentage'
    discount_value REAL DEFAULT 0,
    is_predefined BOOLEAN DEFAULT TRUE -- FALSE for build-your-own combos
);

-- Combo items table (items that can be part of combos)
CREATE TABLE IF NOT EXISTS combo_items (
    id SERIAL PRIMARY KEY,
    combo_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    is_required BOOLEAN DEFAULT TRUE,
    min_quantity INTEGER DEFAULT 1,
    max_quantity INTEGER,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (combo_id) REFERENCES combo_deals(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    UNIQUE (combo_id, menu_item_id)
);

-- Combo pricing table (price overrides for combos)
CREATE TABLE IF NOT EXISTS combo_pricing (
    id SERIAL PRIMARY KEY,
    combo_id INTEGER NOT NULL,
    price REAL NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP,
    valid_to TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (combo_id) REFERENCES combo_deals(id) ON DELETE CASCADE
);

-- Combo restrictions table (rules for combo application)
CREATE TABLE IF NOT EXISTS combo_restrictions (
    id SERIAL PRIMARY KEY,
    combo_id INTEGER NOT NULL,
    restriction_type VARCHAR(50) NOT NULL, -- 'no_other_discounts', 'no_combo_stacking', 'time_based', 'customer_type'
    restriction_value TEXT, -- JSON or value depending on type
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (combo_id) REFERENCES combo_deals(id) ON DELETE CASCADE
);

-- Add combo_id field to menu_items table for predefined combos
ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS combo_id INTEGER,
ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT FALSE;

-- Add combo_id field to order_items table for tracking combo items
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS combo_id INTEGER,
ADD COLUMN IF NOT EXISTS combo_discount_applied REAL DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_combo_deals_name ON combo_deals(name);
CREATE INDEX IF NOT EXISTS idx_combo_deals_active ON combo_deals(is_active);
CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id ON combo_items(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_menu_item_id ON combo_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_combo_pricing_combo_id ON combo_pricing(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_restrictions_combo_id ON combo_restrictions(combo_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_combo_id ON menu_items(combo_id);
CREATE INDEX IF NOT EXISTS idx_order_items_combo_id ON order_items(combo_id);

-- Add combo category for menu organization
INSERT INTO categories (name, icon, display_order) 
SELECT '🍔 Combos', '🍔', 99 
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '🍔 Combos');
