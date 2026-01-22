-- Migration for Void/Refund Workflow
-- 
-- This migration adds:
-- 1. void_refund_requests table - tracks void/refund requests
-- 2. void_refund_reasons table - predefined reasons for voids/refunds
-- 3. void_refund_approvals table - tracks approvals for voids/refunds
-- 4. void_refund_audit_logs table - comprehensive audit logging
-- 5. Updates to orders table - adds void/refund status fields
-- 6. Updates to payments table - adds refund status fields

-- Create void_refund_reasons table
CREATE TABLE IF NOT EXISTS void_refund_reasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reason_code VARCHAR(20) NOT NULL UNIQUE,
    reason_description VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default void/refund reasons
INSERT OR IGNORE INTO void_refund_reasons (id, reason_code, reason_description, is_active) VALUES
(1, 'TYP', 'Typographical Error', 1),
(2, 'WRG', 'Wrong Item Ordered', 1),
(3, 'CUS', 'Customer Request', 1),
(4, 'DAM', 'Damaged Item', 1),
(5, 'EXP', 'Expired Item', 1),
(6, 'OVR', 'Overcharged', 1),
(7, 'UND', 'Undercharged', 1),
(8, 'CAN', 'Customer Cancelled', 1),
(9, 'MIS', 'Mistake in Order', 1),
(10, 'OTH', 'Other Reason', 1);

-- Create void_refund_requests table
CREATE TABLE IF NOT EXISTS void_refund_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_id INTEGER,
    payment_id INTEGER,
    request_type VARCHAR(10) NOT NULL CHECK (request_type IN ('VOID', 'REFUND')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'CANCELLED')),
    reason_code VARCHAR(20) NOT NULL,
    reason_details TEXT,
    requested_by INTEGER NOT NULL,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER,
    approved_at TIMESTAMP,
    processed_by INTEGER,
    processed_at TIMESTAMP,
    amount DECIMAL(12, 2),
    quantity INTEGER DEFAULT 1,
    is_partial BOOLEAN NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES order_items (id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users (id),
    FOREIGN KEY (approved_by) REFERENCES users (id),
    FOREIGN KEY (processed_by) REFERENCES users (id),
    FOREIGN KEY (reason_code) REFERENCES void_refund_reasons (reason_code)
);

-- Create void_refund_approvals table
CREATE TABLE IF NOT EXISTS void_refund_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    approved_by INTEGER NOT NULL,
    approval_status BOOLEAN NOT NULL,
    comments TEXT,
    approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES void_refund_requests (id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users (id)
);

-- Create void_refund_audit_logs table
CREATE TABLE IF NOT EXISTS void_refund_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    order_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    action_by INTEGER NOT NULL,
    action_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status_before VARCHAR(20),
    status_after VARCHAR(20),
    amount_before DECIMAL(12, 2),
    amount_after DECIMAL(12, 2),
    quantity_before INTEGER,
    quantity_after INTEGER,
    inventory_before INTEGER,
    inventory_after INTEGER,
    notes TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (request_id) REFERENCES void_refund_requests (id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (action_by) REFERENCES users (id)
);

-- Update orders table to support void/refund status
-- Add columns if they don't exist
PRAGMA table_info(orders);

-- Check if void_status column exists
SELECT name FROM pragma_table_info('orders') WHERE name = 'void_status';

-- Add void_status column if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (void_status IN ('ACTIVE', 'VOIDED', 'PARTIALLY_VOIDED'));

-- Add void_reason column if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_reason VARCHAR(100);

-- Add voided_at column if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP;

-- Add voided_by column if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_by INTEGER;

-- Update payments table to support refund status
-- Check if refund_status column exists
SELECT name FROM pragma_table_info('payments') WHERE name = 'refund_status';

-- Add refund_status column if not exists
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'NOT_REFUNDED' CHECK (refund_status IN ('NOT_REFUNDED', 'PARTIALLY_REFUNDED', 'FULLY_REFUNDED'));

-- Add refund_reason column if not exists
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason VARCHAR(100);

-- Add refunded_at column if not exists
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;

-- Add refunded_by column if not exists
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_by INTEGER;

-- Add refund_amount column if not exists
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(12, 2) DEFAULT 0.00;

-- Update order_items table to support void/refund status
-- Check if item_void_status column exists
SELECT name FROM pragma_table_info('order_items') WHERE name = 'item_void_status';

-- Add item_void_status column if not exists
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_void_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (item_void_status IN ('ACTIVE', 'VOIDED', 'PARTIALLY_VOIDED'));

-- Add item_void_reason column if not exists
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_void_reason VARCHAR(100);

-- Add item_voided_at column if not exists
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_voided_at TIMESTAMP;

-- Add item_voided_by column if not exists
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_voided_by INTEGER;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_void_refund_requests_order ON void_refund_requests (order_id);
CREATE INDEX IF NOT EXISTS idx_void_refund_requests_status ON void_refund_requests (status);
CREATE INDEX IF NOT EXISTS idx_void_refund_requests_type ON void_refund_requests (request_type);
CREATE INDEX IF NOT EXISTS idx_void_refund_audit_order ON void_refund_audit_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_void_refund_audit_action ON void_refund_audit_logs (action);
