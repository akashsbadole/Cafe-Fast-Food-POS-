-- Migration 005: Kitchen Display System (KDS) Integration
--
-- This migration adds tables for KDS functionality:
-- - kds_stations: Kitchen stations (Grill, Fry, Bar, etc.)
-- - kds_orders: Orders in KDS
-- - kds_order_items: Individual items in KDS orders
-- - kds_status_history: Status change history
-- - Updates to orders table for KDS integration

-- Create kds_stations table
CREATE TABLE IF NOT EXISTS kds_stations (
    station_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    position INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create kds_orders table
CREATE TABLE IF NOT EXISTS kds_orders (
    kds_order_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    table_id INTEGER,
    customer_name TEXT,
    order_type TEXT DEFAULT 'dine_in',
    priority BOOLEAN DEFAULT false,
    estimated_prep_time INTEGER,
    actual_prep_time INTEGER,
    status TEXT NOT NULL DEFAULT 'received',
    chef_assigned TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id)
);

-- Create kds_order_items table
CREATE TABLE IF NOT EXISTS kds_order_items (
    kds_item_id SERIAL PRIMARY KEY,
    kds_order_id INTEGER NOT NULL,
    order_item_id INTEGER NOT NULL,
    station_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'received',
    estimated_prep_time INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kds_order_id) REFERENCES kds_orders (kds_order_id),
    FOREIGN KEY (station_id) REFERENCES kds_stations (station_id),
    FOREIGN KEY (order_item_id) REFERENCES order_items (id)
);

-- Create kds_status_history table
CREATE TABLE IF NOT EXISTS kds_status_history (
    history_id SERIAL PRIMARY KEY,
    kds_order_id INTEGER,
    kds_item_id INTEGER,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by TEXT,
    change_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kds_order_id) REFERENCES kds_orders (kds_order_id),
    FOREIGN KEY (kds_item_id) REFERENCES kds_order_items (kds_item_id)
);

-- Update orders table to support KDS integration
-- Add KDS-specific fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kds_order_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kds_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kds_sent_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kds_completed_at TIMESTAMP;

-- Create index for faster KDS lookups
CREATE INDEX IF NOT EXISTS idx_kds_orders_status ON kds_orders (status);
CREATE INDEX IF NOT EXISTS idx_kds_order_items_status ON kds_order_items (status);
CREATE INDEX IF NOT EXISTS idx_kds_order_items_station ON kds_order_items (station_id, status);
