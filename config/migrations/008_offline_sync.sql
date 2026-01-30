-- Migration 008: Offline Mode Synchronization
-- Adds tables and modifications for offline-first operations

-- Create offline_sessions table to track sync sessions
CREATE TABLE IF NOT EXISTS offline_sessions (
    id SERIAL PRIMARY KEY,
    session_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    total_operations INTEGER DEFAULT 0,
    successful_operations INTEGER DEFAULT 0,
    failed_operations INTEGER DEFAULT 0,
    sync_duration_ms INTEGER,
    device_info TEXT,
    network_info TEXT
);

-- Create sync_queue table to store pending operations
CREATE TABLE IF NOT EXISTS sync_queue (
    id SERIAL PRIMARY KEY,
    operation_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    attempt_count INTEGER DEFAULT 0,
    last_error TEXT,
    sync_session_id INTEGER,
    FOREIGN KEY (sync_session_id) REFERENCES offline_sessions(id)
);

-- Create sync_history table to track completed sync operations
CREATE TABLE IF NOT EXISTS sync_history (
    id SERIAL PRIMARY KEY,
    sync_queue_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    status TEXT NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NOT NULL,
    server_response TEXT,
    sync_session_id INTEGER,
    FOREIGN KEY (sync_queue_id) REFERENCES sync_queue(id),
    FOREIGN KEY (sync_session_id) REFERENCES offline_sessions(id)
);

-- Create conflict_resolution table to track conflicts
CREATE TABLE IF NOT EXISTS conflict_resolution (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    conflict_type TEXT NOT NULL,
    local_version TEXT NOT NULL,
    local_timestamp TIMESTAMP NOT NULL,
    remote_version TEXT NOT NULL,
    remote_timestamp TIMESTAMP NOT NULL,
    resolved_version TEXT,
    resolution_strategy TEXT NOT NULL,
    resolved_by TEXT,
    resolved_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'unresolved',
    notes TEXT,
    sync_session_id INTEGER,
    FOREIGN KEY (sync_session_id) REFERENCES offline_sessions(id)
);

-- Create sync_metadata table to track sync state
CREATE TABLE IF NOT EXISTS sync_metadata (
    id INTEGER PRIMARY KEY,
    last_sync_timestamp TIMESTAMP,
    last_full_sync_timestamp TIMESTAMP,
    pending_operations_count INTEGER DEFAULT 0,
    last_known_server_version TEXT,
    device_id TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial sync metadata record
INSERT INTO sync_metadata (id, device_id) VALUES (1, 'device-default') ON CONFLICT (id) DO NOTHING;

-- Add offline support fields to existing tables

-- Add to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_offline INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offline_created_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_queue_id INTEGER;

-- Add to order_items table
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_offline INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sync_queue_id INTEGER;

-- Add to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_offline INTEGER DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS offline_created_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sync_queue_id INTEGER;

-- Add to inventory_transactions table
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS is_offline INTEGER DEFAULT 0;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS offline_created_at TIMESTAMP;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending';
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS sync_queue_id INTEGER;

-- Add to order_holds table
ALTER TABLE order_holds ADD COLUMN IF NOT EXISTS is_offline INTEGER DEFAULT 0;
ALTER TABLE order_holds ADD COLUMN IF NOT EXISTS offline_created_at TIMESTAMP;
ALTER TABLE order_holds ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending';
ALTER TABLE order_holds ADD COLUMN IF NOT EXISTS sync_queue_id INTEGER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_session ON sync_queue(sync_session_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_session ON sync_history(sync_session_id);
CREATE INDEX IF NOT EXISTS idx_conflict_entity ON conflict_resolution(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_orders_sync_status ON orders(sync_status);
CREATE INDEX IF NOT EXISTS idx_payments_sync_status ON payments(sync_status);
CREATE INDEX IF NOT EXISTS idx_inventory_sync_status ON inventory_transactions(sync_status);
CREATE INDEX IF NOT EXISTS idx_order_holds_sync_status ON order_holds(sync_status);

-- Create triggers to update timestamps
CREATE OR REPLACE FUNCTION update_sync_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sync_queue SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sync_queue_timestamp_trigger
AFTER UPDATE ON sync_queue
FOR EACH ROW
EXECUTE FUNCTION update_sync_queue_timestamp();

CREATE OR REPLACE FUNCTION update_sync_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sync_metadata SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sync_metadata_timestamp_trigger
AFTER UPDATE ON sync_metadata
FOR EACH ROW
EXECUTE FUNCTION update_sync_metadata_timestamp();
