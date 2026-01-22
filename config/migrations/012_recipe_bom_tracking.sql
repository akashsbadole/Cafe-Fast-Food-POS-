-- PostgreSQL Migration: Recipe/BOM Tracking for Cafe POS
-- Run this script to add recipe and BOM tracking functionality to the database

-- Create recipes table
CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- Create recipe_ingredients table
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'gram' CHECK (unit IN ('gram', 'kilogram', 'milliliter', 'liter', 'piece', 'count', 'ounce', 'pound')),
    is_required INTEGER DEFAULT 1,
    is_modifier INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Create recipe_usage_history table
CREATE TABLE IF NOT EXISTS recipe_usage_history (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    order_item_id INTEGER NOT NULL,
    quantity_used INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

-- Create ingredient_conversion_rates table
CREATE TABLE IF NOT EXISTS ingredient_conversion_rates (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER UNIQUE NOT NULL,
    base_unit TEXT NOT NULL CHECK (base_unit IN ('gram', 'kilogram', 'milliliter', 'liter', 'piece', 'count', 'ounce', 'pound')),
    conversion_factor REAL NOT NULL DEFAULT 1.0,
    servings_per_unit REAL NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- Add recipe_id field to menu_items table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS recipe_id INTEGER;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_recipe_based INTEGER DEFAULT 0;

-- Add recipe_cost field to menu_items table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS recipe_cost REAL DEFAULT 0.0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS last_recipe_cost_update TIMESTAMP;

-- Add recipe_id to order_items table
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS recipe_id INTEGER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item_id ON recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_menu_item_id ON recipe_ingredients(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_history_recipe_id ON recipe_usage_history(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_history_order_id ON recipe_usage_history(order_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_conversion_rates_menu_item_id ON ingredient_conversion_rates(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_recipe_id ON order_items(recipe_id);

-- Create inventory_alerts for recipe ingredients
CREATE TABLE IF NOT EXISTS recipe_ingredient_alerts (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL,
    ingredient_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_resolved INTEGER DEFAULT 0,
    resolved_at TIMESTAMP,
    resolved_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id),
    FOREIGN KEY (ingredient_id) REFERENCES menu_items(id),
    FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredient_alerts_recipe_id ON recipe_ingredient_alerts(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredient_alerts_ingredient_id ON recipe_ingredient_alerts(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredient_alerts_is_resolved ON recipe_ingredient_alerts(is_resolved);
