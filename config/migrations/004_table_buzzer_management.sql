-- PostgreSQL Migration: Table and Buzzer Management for Cafe POS
-- Run this script to add table and buzzer management features to the database

-- Tables table for restaurant table management
CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    table_number TEXT UNIQUE NOT NULL,
    name TEXT,
    capacity INTEGER DEFAULT 4,
    status TEXT DEFAULT 'available',
    location_id INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Table layouts table for different restaurant sections
CREATE TABLE IF NOT EXISTS table_layouts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    location_id INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Table layout positions for visual mapping
CREATE TABLE IF NOT EXISTS table_layout_positions (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL,
    table_id INTEGER NOT NULL,
    position_x INTEGER NOT NULL,
    position_y INTEGER NOT NULL,
    width INTEGER DEFAULT 100,
    height INTEGER DEFAULT 100,
    rotation INTEGER DEFAULT 0,
    FOREIGN KEY (layout_id) REFERENCES table_layouts(id),
    FOREIGN KEY (table_id) REFERENCES tables(id),
    UNIQUE (layout_id, table_id)
);

-- Buzzers table for fast food buzzer system
CREATE TABLE IF NOT EXISTS buzzers (
    id SERIAL PRIMARY KEY,
    buzzer_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders tables junction table
CREATE TABLE IF NOT EXISTS orders_tables (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    table_id INTEGER NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (table_id) REFERENCES tables(id),
    UNIQUE (order_id, table_id)
);

-- Orders buzzers junction table
CREATE TABLE IF NOT EXISTS orders_buzzers (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    buzzer_id INTEGER NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (buzzer_id) REFERENCES buzzers(id),
    UNIQUE (order_id, buzzer_id)
);

-- Add table_id and buzzer_id to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buzzer_id INTEGER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tables_table_number ON tables(table_number);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);
CREATE INDEX IF NOT EXISTS idx_tables_location_id ON tables(location_id);
CREATE INDEX IF NOT EXISTS idx_table_layouts_name ON table_layouts(name);
CREATE INDEX IF NOT EXISTS idx_table_layouts_location_id ON table_layouts(location_id);
CREATE INDEX IF NOT EXISTS idx_table_layout_positions_layout_id ON table_layout_positions(layout_id);
CREATE INDEX IF NOT EXISTS idx_table_layout_positions_table_id ON table_layout_positions(table_id);
CREATE INDEX IF NOT EXISTS idx_buzzers_buzzer_number ON buzzers(buzzer_number);
CREATE INDEX IF NOT EXISTS idx_buzzers_status ON buzzers(status);
CREATE INDEX IF NOT EXISTS idx_orders_tables_order_id ON orders_tables(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_tables_table_id ON orders_tables(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_buzzers_order_id ON orders_buzzers(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_buzzers_buzzer_id ON orders_buzzers(buzzer_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_buzzer_id ON orders(buzzer_id);

-- Create default table layout
INSERT INTO table_layouts (name, description, location_id, is_active) 
SELECT 'Main Dining Area', 'Default table layout for main dining area', 1, 1 
WHERE NOT EXISTS (SELECT 1 FROM table_layouts WHERE id = 1);

-- Create sample tables (1-10)
INSERT INTO tables (table_number, name, capacity, status, location_id) 
SELECT 'T01', 'Table 1', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T01')
UNION ALL
SELECT 'T02', 'Table 2', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T02')
UNION ALL
SELECT 'T03', 'Table 3', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T03')
UNION ALL
SELECT 'T04', 'Table 4', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T04')
UNION ALL
SELECT 'T05', 'Table 5', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T05')
UNION ALL
SELECT 'T06', 'Table 6', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T06')
UNION ALL
SELECT 'T07', 'Table 7', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T07')
UNION ALL
SELECT 'T08', 'Table 8', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T08')
UNION ALL
SELECT 'T09', 'Table 9', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T09')
UNION ALL
SELECT 'T10', 'Table 10', 4, 'available', 1 
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE table_number = 'T10');