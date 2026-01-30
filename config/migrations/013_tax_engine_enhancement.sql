-- PostgreSQL Migration: Tax Engine Enhancement for Inclusive/Exclusive Taxes
-- Run this script to add tax type support to the database

-- Create tax_rates table with tax type support
CREATE TABLE IF NOT EXISTS tax_rates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    rate REAL NOT NULL,
    tax_type TEXT NOT NULL DEFAULT 'exclusive', -- 'inclusive' or 'exclusive'
    is_active INTEGER DEFAULT 1,
    location_id INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    UNIQUE(name, location_id)
);

-- Create tax_configurations table for regional tax settings
CREATE TABLE IF NOT EXISTS tax_configurations (
    id SERIAL PRIMARY KEY,
    location_id INTEGER NOT NULL,
    default_tax_type TEXT NOT NULL DEFAULT 'exclusive', -- 'inclusive' or 'exclusive'
    display_prices_inclusive INTEGER DEFAULT 0, -- 1 for true, 0 for false
    show_tax_breakdown INTEGER DEFAULT 1, -- 1 for true, 0 for false
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    UNIQUE(location_id)
);

-- Add tax_type column to menu_items table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'exclusive';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tax_rate_id INTEGER;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS custom_tax_rate REAL;
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_tax_rate
    FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id);

-- Add tax_type and tax_rate_id columns to order_items table
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'exclusive';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_rate_id INTEGER;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_rate REAL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_amount REAL DEFAULT 0;
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_tax_rate
    FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id);

-- Add tax_type column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'exclusive';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tax_rates_location_id ON tax_rates(location_id);
CREATE INDEX IF NOT EXISTS idx_tax_rates_is_active ON tax_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_menu_items_tax_rate_id ON menu_items(tax_rate_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tax_rate_id ON order_items(tax_rate_id);

-- Create default tax configuration for each location
INSERT INTO tax_configurations (location_id, default_tax_type, display_prices_inclusive, show_tax_breakdown)
SELECT id, 'exclusive', 0, 1 FROM locations
ON CONFLICT (location_id) DO NOTHING;

-- Migrate existing tax_settings to tax_rates
INSERT INTO tax_rates (name, rate, tax_type, is_active, location_id)
SELECT name, rate, 'exclusive', is_active, 1 FROM tax_settings
ON CONFLICT (name, location_id) DO NOTHING;

-- Create a view for tax summary reporting
DROP VIEW IF EXISTS tax_summary;
CREATE VIEW tax_summary AS
SELECT 
    o.id as order_id,
    o.order_number,
    o.created_at,
    o.location_id,
    o.subtotal,
    o.tax_amount,
    o.total_amount,
    o.tax_type,
    SUM(oi.tax_amount) as item_tax_amount,
    COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.payment_status = 'paid'
GROUP BY o.id, o.order_number, o.created_at, o.location_id, o.subtotal, o.tax_amount, o.total_amount, o.tax_type;

-- Create a view for tax breakdown by type
DROP VIEW IF EXISTS tax_breakdown;
CREATE VIEW tax_breakdown AS
SELECT 
    DATE(o.created_at) as date,
    o.location_id,
    o.tax_type,
    SUM(o.subtotal) as subtotal,
    SUM(o.tax_amount) as tax_amount,
    COUNT(o.id) as order_count,
    SUM(oi.tax_amount) as item_tax_amount
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.payment_status = 'paid'
GROUP BY DATE(o.created_at), o.location_id, o.tax_type;
