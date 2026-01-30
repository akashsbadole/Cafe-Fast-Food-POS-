-- PostgreSQL Migration: Enterprise Features for Cafe POS
-- Run this script to add enterprise features to the database

-- Locations table for multi-location support
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    phone TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory transactions table (if not exists)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER,
    transaction_type TEXT NOT NULL,
    quantity REAL NOT NULL,
    reason TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    location_id INTEGER DEFAULT 1,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Customers table (if not exists)
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name TEXT,
    phone TEXT UNIQUE NOT NULL,
    email TEXT,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table for tracking system changes
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Scheduled reports table
CREATE TABLE IF NOT EXISTS scheduled_reports (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    report_type TEXT NOT NULL,
    schedule_cron TEXT NOT NULL,
    time_zone TEXT DEFAULT 'UTC',
    email_to TEXT,
    email_cc TEXT,
    email_bcc TEXT,
    format TEXT DEFAULT 'pdf',
    is_active INTEGER DEFAULT 1,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Report templates for custom report builder
CREATE TABLE IF NOT EXISTS report_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    query_sql TEXT NOT NULL,
    columns JSONB NOT NULL,
    filters JSONB DEFAULT '{}',
    is_public INTEGER DEFAULT 0,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Data backup schedule
CREATE TABLE IF NOT EXISTS backup_schedules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    schedule_cron TEXT NOT NULL,
    time_zone TEXT DEFAULT 'UTC',
    retention_days INTEGER DEFAULT 30,
    backup_location TEXT DEFAULT 'local',
    is_active INTEGER DEFAULT 1,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Backup history
CREATE TABLE IF NOT EXISTS backup_history (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER,
    backup_path TEXT NOT NULL,
    file_size INTEGER,
    status TEXT DEFAULT 'pending',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    FOREIGN KEY (schedule_id) REFERENCES backup_schedules(id)
);

-- System health monitoring
CREATE TABLE IF NOT EXISTS system_health (
    id SERIAL PRIMARY KEY,
    check_type TEXT NOT NULL,
    status TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add location_id to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_id INTEGER DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_location') THEN
    ALTER TABLE orders ADD CONSTRAINT fk_orders_location
        FOREIGN KEY (location_id) REFERENCES locations(id);
  END IF;
END $$;

-- Add location_id to menu_items table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS location_id INTEGER DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_menu_items_location') THEN
    ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_location
        FOREIGN KEY (location_id) REFERENCES locations(id);
  END IF;
END $$;

-- Add location_id to inventory_transactions table
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS location_id INTEGER DEFAULT 1;

-- Add location_id to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS location_id INTEGER DEFAULT 1;

-- Add location_id to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_id INTEGER DEFAULT 1;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_location_id ON orders(location_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_location_id ON menu_items(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_location_id ON inventory_transactions(location_id);
CREATE INDEX IF NOT EXISTS idx_customers_location_id ON customers(location_id);
CREATE INDEX IF NOT EXISTS idx_users_location_id ON users(location_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_created_by ON scheduled_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_report_templates_created_by ON report_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_backup_schedules_created_by ON backup_schedules(created_by);
CREATE INDEX IF NOT EXISTS idx_backup_history_schedule_id ON backup_history(schedule_id);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);
CREATE INDEX IF NOT EXISTS idx_backup_history_started_at ON backup_history(started_at);

-- Create default location
INSERT INTO locations (name, address, city, state, postal_code, phone, is_active) 
SELECT 'Main Location', '123 Main Street', 'City', 'State', '12345', '555-1234', 1 
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE id = 1);
