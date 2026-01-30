-- Migration 017: Hardware Drivers
-- Adds support for ESC/POS printers and Customer Facing Displays

-- Create hardware_devices table
CREATE TABLE IF NOT EXISTS hardware_devices (
    id SERIAL PRIMARY KEY,
    device_type TEXT NOT NULL CHECK (device_type IN ('escpos_printer', 'cfd_display', 'cash_drawer')),
    device_name TEXT NOT NULL,
    device_identifier TEXT UNIQUE,
    connection_type TEXT NOT NULL CHECK (connection_type IN ('usb', 'network', 'serial', 'bluetooth')),
    connection_string TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'maintenance')),
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    device_model TEXT,
    manufacturer TEXT,
    serial_number TEXT,
    ip_address TEXT,
    port INTEGER,
    baud_rate INTEGER,
    paper_size TEXT DEFAULT '80mm',
    character_set TEXT DEFAULT 'UTF-8'
);

-- Create hardware_device_configs table
CREATE TABLE IF NOT EXISTS hardware_device_configs (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL,
    config_key TEXT NOT NULL,
    config_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES hardware_devices (id) ON DELETE CASCADE
);

-- Create hardware_device_logs table
CREATE TABLE IF NOT EXISTS hardware_device_logs (
    id SERIAL PRIMARY KEY,
    device_id INTEGER,
    log_level TEXT NOT NULL CHECK (log_level IN ('info', 'warning', 'error', 'debug')),
    message TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES hardware_devices (id) ON DELETE SET NULL
);

-- Create print_jobs table
CREATE TABLE IF NOT EXISTS print_jobs (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL,
    job_type TEXT NOT NULL CHECK (job_type IN ('receipt', 'kot', 'label', 'report')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    content TEXT,
    content_type TEXT DEFAULT 'text/plain',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (device_id) REFERENCES hardware_devices (id) ON DELETE CASCADE
);

-- Create cfd_content table
CREATE TABLE IF NOT EXISTS cfd_content (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('order_info', 'payment_info', 'loyalty', 'promotion', 'custom')),
    content_data TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES hardware_devices (id) ON DELETE CASCADE
);

-- Create hardware_device_status table
CREATE TABLE IF NOT EXISTS hardware_device_status (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    status_details TEXT,
    paper_level INTEGER,
    ink_level INTEGER,
    error_code TEXT,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES hardware_devices (id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_hardware_devices_type ON hardware_devices (device_type);
CREATE INDEX IF NOT EXISTS idx_hardware_devices_status ON hardware_devices (status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs (status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_device ON print_jobs (device_id);
CREATE INDEX IF NOT EXISTS idx_cfd_content_device ON cfd_content (device_id);
CREATE INDEX IF NOT EXISTS idx_hardware_logs_device ON hardware_device_logs (device_id);
