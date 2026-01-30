-- Migration for Split Billing Feature
-- 
-- This migration adds support for splitting bills into multiple sessions,
-- tracking items per split, and handling multiple payments per order.

-- 1. Add split_bill_sessions table
CREATE TABLE IF NOT EXISTS split_bill_sessions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'active',
    total_splits INTEGER NOT NULL DEFAULT 1,
    split_method TEXT,
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 2. Add split_bill_items table
CREATE TABLE IF NOT EXISTS split_bill_items (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    split_number INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    tax_amount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES split_bill_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES order_items(id) ON DELETE CASCADE
);

-- 3. Add split_bill_payments table
CREATE TABLE IF NOT EXISTS split_bill_payments (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    split_number INTEGER NOT NULL,
    payment_id INTEGER,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    transaction_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES split_bill_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

-- 4. Add split_bill_customers table for customer-based splitting
CREATE TABLE IF NOT EXISTS split_bill_customers (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    split_number INTEGER NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    customer_contact TEXT,
    FOREIGN KEY (session_id) REFERENCES split_bill_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- 5. Add split_bill_history table for audit trail
CREATE TABLE IF NOT EXISTS split_bill_history (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES split_bill_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 6. Add split_number column to order_items for backward compatibility
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS split_number INTEGER DEFAULT 0;

-- 7. Add split_number column to payments for tracking which split a payment belongs to
ALTER TABLE payments ADD COLUMN IF NOT EXISTS split_number INTEGER DEFAULT 0;

-- 8. Add split_session_id column to payments for direct reference
ALTER TABLE payments ADD COLUMN IF NOT EXISTS split_session_id INTEGER DEFAULT NULL;

-- 9. Add split_status column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_status TEXT DEFAULT 'single';

-- 10. Add split_info column to orders (JSON for flexible split data)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_info TEXT DEFAULT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_split_bill_sessions_order_id ON split_bill_sessions(order_id);
CREATE INDEX IF NOT EXISTS idx_split_bill_items_session_id ON split_bill_items(session_id);
CREATE INDEX IF NOT EXISTS idx_split_bill_items_split_number ON split_bill_items(split_number);
CREATE INDEX IF NOT EXISTS idx_split_bill_payments_session_id ON split_bill_payments(session_id);
CREATE INDEX IF NOT EXISTS idx_split_bill_payments_split_number ON split_bill_payments(split_number);
CREATE INDEX IF NOT EXISTS idx_payments_split_session_id ON payments(split_session_id);
