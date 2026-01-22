-- PostgreSQL Migration: Product Modifiers for Cafe POS
-- Run this script to add product modifier support to the database

-- Modifier groups table
CREATE TABLE IF NOT EXISTS modifier_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT FALSE,
    max_selections INTEGER,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modifiers table
CREATE TABLE IF NOT EXISTS modifiers (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
);

-- Menu item to modifier group mapping
CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL,
    modifier_group_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE,
    UNIQUE (menu_item_id, modifier_group_id)
);

-- Order item to modifier mapping
CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER NOT NULL,
    modifier_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    price REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
    FOREIGN KEY (modifier_id) REFERENCES modifiers(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_modifier_groups_name ON modifier_groups(name);
CREATE INDEX IF NOT EXISTS idx_modifiers_group_id ON modifiers(group_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifier_groups_menu_item_id ON menu_item_modifier_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifier_groups_modifier_group_id ON menu_item_modifier_groups(modifier_group_id);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_order_item_id ON order_item_modifiers(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_modifier_id ON order_item_modifiers(modifier_id);
