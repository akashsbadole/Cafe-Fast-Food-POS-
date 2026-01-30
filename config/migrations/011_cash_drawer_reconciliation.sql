-- Cash Drawer Reconciliation Migration
-- ============================================

-- Create cash_drawers table
CREATE TABLE IF NOT EXISTS cash_drawers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create cash_drawer_sessions table
CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
    id SERIAL PRIMARY KEY,
    cash_drawer_id INTEGER NOT NULL,
    opened_by INTEGER NOT NULL,
    opened_at TIMESTAMP NOT NULL,
    closed_at TIMESTAMP,
    opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    closing_balance DECIMAL(12, 2),
    expected_balance DECIMAL(12, 2),
    over_short_amount DECIMAL(12, 2),
    status TEXT NOT NULL DEFAULT 'open',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cash_drawer_id) REFERENCES cash_drawers(id),
    FOREIGN KEY (opened_by) REFERENCES users(id)
);

-- Create cash_drawer_transactions table
CREATE TABLE IF NOT EXISTS cash_drawer_transactions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    reference_id INTEGER,
    reference_type TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES cash_drawer_sessions(id)
);

-- Create cash_drawer_reconciliations table
CREATE TABLE IF NOT EXISTS cash_drawer_reconciliations (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    reconciled_by INTEGER NOT NULL,
    reconciled_at TIMESTAMP NOT NULL,
    actual_count DECIMAL(12, 2) NOT NULL,
    expected_amount DECIMAL(12, 2) NOT NULL,
    difference DECIMAL(12, 2) NOT NULL,
    difference_reason TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES cash_drawer_sessions(id),
    FOREIGN KEY (reconciled_by) REFERENCES users(id)
);

-- Create cash_drawer_audit_logs table
CREATE TABLE IF NOT EXISTS cash_drawer_audit_logs (
    id SERIAL PRIMARY KEY,
    cash_drawer_id INTEGER,
    session_id INTEGER,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cash_drawer_id) REFERENCES cash_drawers(id),
    FOREIGN KEY (session_id) REFERENCES cash_drawer_sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Update payments table to track cash drawer associations
-- Add cash_drawer_id and session_id columns if they don't exist
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_drawer_id INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS session_id INTEGER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_cash_drawer ON cash_drawer_sessions(cash_drawer_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_status ON cash_drawer_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_transactions_session ON cash_drawer_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_transactions_type ON cash_drawer_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_reconciliations_session ON cash_drawer_reconciliations(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_audit_cash_drawer ON cash_drawer_audit_logs(cash_drawer_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_audit_session ON cash_drawer_audit_logs(session_id);
