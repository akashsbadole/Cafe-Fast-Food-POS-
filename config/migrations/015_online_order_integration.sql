-- Migration 015: Online Order Integration
-- 
-- This migration adds all necessary tables and columns for online order integration
-- including provider management, order tracking, webhooks, and authentication.

-- 1. Create online_order_providers table
CREATE TABLE IF NOT EXISTS online_order_providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    api_base_url TEXT NOT NULL,
    webhook_url_pattern TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logo_url TEXT,
    support_email TEXT,
    support_phone TEXT,
    UNIQUE(name)
);

-- 2. Create online_order_credentials table
CREATE TABLE IF NOT EXISTS online_order_credentials (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL,
    client_id VARCHAR(255),
    client_secret TEXT,
    api_key TEXT,
    api_secret TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_type VARCHAR(50),
    expires_at TIMESTAMP,
    webhook_secret TEXT,
    signature_key TEXT,
    auth_header_name VARCHAR(100) DEFAULT 'Authorization',
    auth_header_format VARCHAR(100) DEFAULT 'Bearer {token}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES online_order_providers(id) ON DELETE CASCADE,
    UNIQUE(provider_id)
);

-- 3. Create online_order_history table
CREATE TABLE IF NOT EXISTS online_order_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    provider_order_id TEXT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    status VARCHAR(50),
    payload JSON,
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    is_processed BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES online_order_providers(id) ON DELETE CASCADE
);

-- 4. Create online_order_webhooks table
CREATE TABLE IF NOT EXISTS online_order_webhooks (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL,
    webhook_url TEXT NOT NULL,
    event_types TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES online_order_providers(id) ON DELETE CASCADE
);

-- 5. Add online order columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_source_id INTEGER DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_provider_id INTEGER DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_external_id TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_status VARCHAR(50) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_webhook_processed BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_customer_name TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_customer_phone TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_customer_email TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_delivery_address TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_instructions TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_payment_method VARCHAR(50) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_expected_delivery_time TIMESTAMP DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_accepted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_rejected_at TIMESTAMP DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_completed_at TIMESTAMP DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_order_cancelled_at TIMESTAMP DEFAULT NULL;

-- 6. Add online order columns to order_items table
ALTER TABLE order_items ADD COLUMN online_order_item_id TEXT DEFAULT NULL;
ALTER TABLE order_items ADD COLUMN online_order_preparation_notes TEXT DEFAULT NULL;

-- 7. Create index for performance
CREATE INDEX IF NOT EXISTS idx_online_order_history_order ON online_order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_online_order_history_provider ON online_order_history(provider_id);
CREATE INDEX IF NOT EXISTS idx_online_order_history_external ON online_order_history(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_online_order_history_processed ON online_order_history(is_processed);
CREATE INDEX IF NOT EXISTS idx_orders_online_provider ON orders(online_order_provider_id);
CREATE INDEX IF NOT EXISTS idx_orders_online_external ON orders(online_order_external_id);

-- 8. Create view for online order tracking
DROP VIEW IF EXISTS vw_online_orders;
CREATE VIEW vw_online_orders AS
SELECT 
    o.id AS order_id,
    o.order_number,
    o.status AS pos_status,
    o.total_amount,
    o.created_at AS order_created_at,
    o.online_order_external_id,
    o.online_order_status,
    o.online_order_customer_name,
    o.online_order_customer_phone,
    o.online_order_customer_email,
    o.online_order_delivery_address,
    o.online_order_instructions,
    o.online_order_payment_method,
    o.online_order_expected_delivery_time,
    o.online_order_accepted_at,
    o.online_order_rejected_at,
    o.online_order_completed_at,
    o.online_order_cancelled_at,
    oop.id AS provider_id,
    oop.name AS provider_name,
    oop.display_name AS provider_display_name,
    COUNT(DISTINCT ooh.id) AS history_count,
    MAX(CASE WHEN ooh.event_type = 'order_created' THEN ooh.created_at END) AS first_received_at,
    MAX(CASE WHEN ooh.event_type = 'order_accepted' THEN ooh.created_at END) AS accepted_at,
    MAX(CASE WHEN ooh.event_type = 'order_completed' THEN ooh.created_at END) AS completed_at,
    MAX(CASE WHEN ooh.event_type = 'order_cancelled' THEN ooh.created_at END) AS cancelled_at
FROM orders o
LEFT JOIN online_order_providers oop ON o.online_order_provider_id = oop.id
LEFT JOIN online_order_history ooh ON o.id = ooh.order_id
WHERE o.online_order_external_id IS NOT NULL
GROUP BY o.id, oop.id;

-- 9. Create view for online order reports
DROP VIEW IF EXISTS vw_online_order_reports;
CREATE VIEW vw_online_order_reports AS
SELECT
    oop.id AS provider_id,
    oop.name AS provider_name,
    oop.display_name AS provider_display_name,
    COUNT(DISTINCT o.id) AS total_orders,
    SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
    SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
    SUM(CASE WHEN o.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_orders,
    SUM(o.total_amount) AS total_revenue,
    AVG(o.total_amount) AS avg_order_value,
    MIN(o.created_at) AS first_order_date,
    MAX(o.created_at) AS last_order_date,
    COUNT(DISTINCT CASE WHEN o.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN o.id END) AS orders_last_7_days,
    COUNT(DISTINCT CASE WHEN o.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN o.id END) AS orders_last_30_days
FROM online_order_providers oop
LEFT JOIN orders o ON oop.id = o.online_order_provider_id
WHERE o.online_order_external_id IS NOT NULL
GROUP BY oop.id, oop.name, oop.display_name;

-- 10. Create view for online order provider performance
DROP VIEW IF EXISTS vw_online_order_provider_performance;
CREATE VIEW vw_online_order_provider_performance AS
SELECT
    oop.id AS provider_id,
    oop.name AS provider_name,
    oop.display_name AS provider_display_name,
    COUNT(DISTINCT o.id) AS total_orders,
    SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
    SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
    SUM(CASE WHEN o.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_orders,
    SUM(o.total_amount) AS total_revenue,
    COUNT(DISTINCT o.online_order_customer_email) AS unique_customers,
    AVG(o.total_amount) AS avg_order_value,
    MIN(o.created_at) AS first_order_date,
    MAX(o.created_at) AS last_order_date,
    COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= CURRENT_DATE - INTERVAL '1 day') AS orders_today,
    COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= CURRENT_DATE - INTERVAL '7 days') AS orders_last_7_days,
    COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days') AS orders_last_30_days,
    COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= CURRENT_DATE - INTERVAL '90 days') AS orders_last_90_days
FROM online_order_providers oop
LEFT JOIN orders o ON oop.id = o.online_order_provider_id
WHERE o.online_order_external_id IS NOT NULL
GROUP BY oop.id, oop.name, oop.display_name;
