-- Migration 016: Digital Receipts Feature
-- 
-- This migration adds all necessary tables and columns for digital receipts
-- including email, WhatsApp, templates, history, and customer preferences.

-- 1. Create digital_receipt_templates table
CREATE TABLE IF NOT EXISTS digital_receipt_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_type VARCHAR(20) NOT NULL CHECK (template_type IN ('email', 'whatsapp', 'sms')),
    subject_template TEXT,
    body_template TEXT NOT NULL,
    html_template TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    business_id INTEGER,
    UNIQUE(name, template_type, business_id)
);

-- 2. Create customer_communication_preferences table
CREATE TABLE IF NOT EXISTS customer_communication_preferences (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
    email_enabled BOOLEAN NOT NULL DEFAULT false,
    sms_enabled BOOLEAN NOT NULL DEFAULT false,
    preferred_language VARCHAR(10) DEFAULT 'en',
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    UNIQUE(customer_id)
);

-- 3. Create digital_receipt_history table
CREATE TABLE IF NOT EXISTS digital_receipt_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    customer_id INTEGER,
    template_id INTEGER,
    receipt_type VARCHAR(20) NOT NULL CHECK (receipt_type IN ('email', 'whatsapp', 'sms')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'read')),
    subject TEXT,
    message TEXT,
    message_id TEXT,
    external_id TEXT,
    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(50),
    attachment_url TEXT,
    attachment_type VARCHAR(20),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES digital_receipt_templates(id) ON DELETE SET NULL
);

-- 4. Add digital receipt columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS digital_receipt_email_sent BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS digital_receipt_whatsapp_sent BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS digital_receipt_sms_sent BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS digital_receipt_last_sent_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS digital_receipt_status VARCHAR(50) DEFAULT 'pending';

-- 5. Create index for performance
CREATE INDEX IF NOT EXISTS idx_digital_receipt_history_order ON digital_receipt_history(order_id);
CREATE INDEX IF NOT EXISTS idx_digital_receipt_history_customer ON digital_receipt_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_digital_receipt_history_status ON digital_receipt_history(status);
CREATE INDEX IF NOT EXISTS idx_digital_receipt_history_type ON digital_receipt_history(receipt_type);
CREATE INDEX IF NOT EXISTS idx_digital_receipt_history_date ON digital_receipt_history(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_preferences_customer ON customer_communication_preferences(customer_id);
CREATE INDEX IF NOT EXISTS idx_digital_receipt_templates_type ON digital_receipt_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_digital_receipt_templates_business ON digital_receipt_templates(business_id);

-- 6. Create view for digital receipt reports
DROP VIEW IF EXISTS vw_digital_receipt_reports;
CREATE VIEW vw_digital_receipt_reports AS
SELECT
    DATE(created_at) AS report_date,
    COUNT(*) AS total_receipts,
    SUM(CASE WHEN receipt_type = 'email' THEN 1 ELSE 0 END) AS email_receipts,
    SUM(CASE WHEN receipt_type = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp_receipts,
    SUM(CASE WHEN receipt_type = 'sms' THEN 1 ELSE 0 END) AS sms_receipts,
    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_receipts,
    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_receipts,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_receipts,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_receipts,
    SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) AS read_receipts
FROM digital_receipt_history
GROUP BY DATE(created_at)
ORDER BY report_date DESC;

-- 7. Create view for customer digital receipt statistics
DROP VIEW IF EXISTS vw_customer_digital_receipt_stats;
CREATE VIEW vw_customer_digital_receipt_stats AS
SELECT 
    c.id AS customer_id,
    c.name AS first_name,
    '' AS last_name,
    c.email,
    c.phone,
    COUNT(DISTINCT drh.id) AS total_receipts,
    SUM(CASE WHEN drh.receipt_type = 'email' THEN 1 ELSE 0 END) AS email_receipts,
    SUM(CASE WHEN drh.receipt_type = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp_receipts,
    SUM(CASE WHEN drh.status = 'sent' THEN 1 ELSE 0 END) AS sent_receipts,
    SUM(CASE WHEN drh.status = 'delivered' THEN 1 ELSE 0 END) AS delivered_receipts,
    SUM(CASE WHEN drh.status = 'failed' THEN 1 ELSE 0 END) AS failed_receipts,
    MAX(drh.created_at) AS last_receipt_date,
    ccp.email_enabled,
    ccp.whatsapp_enabled,
    ccp.sms_enabled
FROM customers c
LEFT JOIN digital_receipt_history drh ON c.id = drh.customer_id
LEFT JOIN customer_communication_preferences ccp ON c.id = ccp.customer_id
GROUP BY c.id, c.name, c.email, c.phone, ccp.email_enabled, ccp.whatsapp_enabled, ccp.sms_enabled;

-- 8. Create view for order digital receipt status
DROP VIEW IF EXISTS vw_order_digital_receipt_status;
CREATE VIEW vw_order_digital_receipt_status AS
SELECT 
    o.id AS order_id,
    o.order_number,
    o.total_amount,
    o.status AS order_status,
    o.created_at AS order_date,
    c.name AS first_name,
    '' AS last_name,
    c.email,
    c.phone,
    o.digital_receipt_email_sent,
    o.digital_receipt_whatsapp_sent,
    o.digital_receipt_sms_sent,
    o.digital_receipt_status,
    o.digital_receipt_last_sent_at,
    COUNT(DISTINCT drh.id) AS receipt_attempts,
    MAX(CASE WHEN drh.receipt_type = 'email' AND drh.status = 'sent' THEN 1 ELSE 0 END) AS email_sent,
    MAX(CASE WHEN drh.receipt_type = 'whatsapp' AND drh.status = 'sent' THEN 1 ELSE 0 END) AS whatsapp_sent,
    MAX(CASE WHEN drh.receipt_type = 'sms' AND drh.status = 'sent' THEN 1 ELSE 0 END) AS sms_sent,
    MAX(CASE WHEN drh.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
    MAX(CASE WHEN drh.status = 'failed' THEN 1 ELSE 0 END) AS failed,
    MAX(drh.created_at) AS last_receipt_attempt
FROM orders o
LEFT JOIN digital_receipt_history drh ON o.id = drh.order_id
LEFT JOIN customers c ON drh.customer_id = c.id
GROUP BY o.id, c.id;
