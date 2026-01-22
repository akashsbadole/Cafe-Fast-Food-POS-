-- PostgreSQL Migration: Weighted Items Support for Cafe POS
-- Run this script to add weighted items functionality to the database

-- Create weighted_items table
CREATE TABLE IF NOT EXISTS weighted_items (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER UNIQUE NOT NULL,
    unit_weight REAL NOT NULL DEFAULT 1.0,
    min_weight REAL NOT NULL DEFAULT 1.0,
    max_weight REAL NOT NULL DEFAULT 1000.0,
    weight_unit TEXT DEFAULT 'gram' CHECK (weight_unit IN ('gram', 'kilogram', 'ounce', 'pound')),
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- Create weight_pricing_tiers table
CREATE TABLE IF NOT EXISTS weight_pricing_tiers (
    id SERIAL PRIMARY KEY,
    weighted_item_id INTEGER NOT NULL,
    min_weight REAL NOT NULL,
    max_weight REAL NOT NULL,
    price REAL NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (weighted_item_id) REFERENCES weighted_items(id) ON DELETE CASCADE,
    CONSTRAINT unique_weight_range UNIQUE (weighted_item_id, min_weight, max_weight)
);

-- Create inventory_weight_logs table
CREATE TABLE IF NOT EXISTS inventory_weight_logs (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL,
    order_id INTEGER,
    order_item_id INTEGER,
    weight_used REAL NOT NULL,
    weight_unit TEXT DEFAULT 'gram',
    current_stock REAL,
    transaction_type TEXT DEFAULT 'sale',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Add weight tracking fields to menu_items table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_weighted INTEGER DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'gram';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS unit_weight REAL DEFAULT 1.0;

-- Add weight tracking fields to inventory_items table (if exists)
CREATE TABLE IF NOT EXISTS inventory_items (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER UNIQUE NOT NULL,
    current_weight REAL DEFAULT 0.0,
    max_weight REAL DEFAULT 0.0,
    weight_unit TEXT DEFAULT 'gram',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- Add weight fields to order_items table
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_weight REAL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS weight_unit TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS weight_price REAL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_weighted_items_menu_item_id ON weighted_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_weight_pricing_tiers_weighted_item_id ON weight_pricing_tiers(weighted_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_weight_logs_menu_item_id ON inventory_weight_logs(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_weight_logs_order_id ON inventory_weight_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_weight_logs_created_at ON inventory_weight_logs(created_at);
