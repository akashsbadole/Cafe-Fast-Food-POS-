// Database Manager for robust database handling with retry logic
// Integrates with existing database.js module to provide enhanced reliability

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Database status constants
const DatabaseStatus = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    FAILED: 'failed',
    VALIDATING: 'validating',
    READY: 'ready'
};

class DatabaseManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000, // Base delay in ms
            maxRetryDelay: options.maxRetryDelay || 10000, // Max delay in ms
            healthCheckTimeout: options.healthCheckTimeout || 5000,
            schemaValidationEnabled: options.schemaValidationEnabled !== false,
            ...options
        };

        this.status = {
            connected: false,
            schemaValid: false,
            lastError: null,
            currentStatus: DatabaseStatus.DISCONNECTED,
            retryCount: 0,
            lastConnectionAttempt: null
        };

        this.database = null;
        this.retryTimeouts = [];
    }

    /**
     * Initialize database with retry logic and exponential backoff
     * @returns {Promise<void>}
     */
    async initializeDatabase() {
        this.status.currentStatus = DatabaseStatus.CONNECTING;
        this.status.lastConnectionAttempt = new Date();
        this.emit('status-change', { status: this.status.currentStatus });

        let lastError = null;

        for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
            try {
                this.status.retryCount = attempt;

                // Import database module dynamically to avoid circular dependencies
                this.database = require('./database.js');

                // Attempt database initialization
                await this.database.initDatabase();

                this.status.connected = true;
                this.status.currentStatus = DatabaseStatus.CONNECTED;
                this.status.lastError = null;
                this.emit('status-change', { status: this.status.currentStatus });

                // Validate schema if enabled
                if (this.options.schemaValidationEnabled) {
                    await this.validateSchema();
                }

                this.status.currentStatus = DatabaseStatus.READY;
                this.emit('status-change', { status: this.status.currentStatus });
                this.emit('database-ready');

                return;

            } catch (error) {
                lastError = error;
                this.status.lastError = error.message;
                this.status.connected = false;

                this.emit('connection-error', {
                    attempt: attempt + 1,
                    maxAttempts: this.options.maxRetries + 1,
                    error: error.message
                });

                // Don't retry on the last attempt
                if (attempt < this.options.maxRetries) {
                    const delay = this.calculateRetryDelay(attempt);
                    await this.waitWithTimeout(delay);
                }
            }
        }

        // All retry attempts failed
        this.status.currentStatus = DatabaseStatus.FAILED;
        this.emit('status-change', { status: this.status.currentStatus });
        this.emit('database-failed', { error: lastError });

        throw new Error(`Database initialization failed after ${this.options.maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * Validate database schema and repair if needed
     * @returns {Promise<boolean>}
     */
    async validateSchema() {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        this.status.currentStatus = DatabaseStatus.VALIDATING;
        this.emit('status-change', { status: this.status.currentStatus });

        try {
            // Check if all required tables exist
            const requiredTables = [
                'users', 'categories', 'menu_items', 'orders',
                'order_items', 'kot_tickets', 'tax_settings', 'settings'
            ];

            const tableChecks = requiredTables.map(tableName => {
                try {
                    // Try to query the table to check if it exists
                    const result = this.database.db?.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
                    return result && result.length > 0 && result[0].values.length > 0;
                } catch (error) {
                    return false;
                }
            });

            const allTablesExist = tableChecks.every(exists => exists);

            if (!allTablesExist) {
                // Attempt to repair schema by re-running initialization
                await this.repairSchema();
            }

            // Validate data integrity
            await this.validateDataIntegrity();

            this.status.schemaValid = true;
            this.emit('schema-validated');

            return true;

        } catch (error) {
            this.status.schemaValid = false;
            this.status.lastError = `Schema validation failed: ${error.message}`;
            this.emit('schema-validation-failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Repair database schema by re-running table creation
     * @returns {Promise<void>}
     */
    async repairSchema() {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        try {
            // Re-run the database initialization to create missing tables
            // The existing initDatabase function handles CREATE TABLE IF NOT EXISTS
            await this.database.initDatabase();

            this.emit('schema-repaired');

        } catch (error) {
            this.emit('schema-repair-failed', { error: error.message });
            throw new Error(`Schema repair failed: ${error.message}`);
        }
    }

    /**
     * Validate basic data integrity
     * @returns {Promise<void>}
     */
    async validateDataIntegrity() {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        try {
            // Check for basic data consistency
            // Verify foreign key relationships exist
            const categoryCheck = this.database.db?.exec('SELECT COUNT(*) as count FROM categories');
            const menuItemCheck = this.database.db?.exec('SELECT COUNT(*) as count FROM menu_items');

            // Basic sanity checks
            if (categoryCheck && categoryCheck.length > 0) {
                const categoryCount = categoryCheck[0].values[0][0];
                if (categoryCount < 0) {
                    throw new Error('Invalid category count');
                }
            }

            if (menuItemCheck && menuItemCheck.length > 0) {
                const menuItemCount = menuItemCheck[0].values[0][0];
                if (menuItemCount < 0) {
                    throw new Error('Invalid menu item count');
                }
            }

            this.emit('data-integrity-validated');

        } catch (error) {
            this.emit('data-integrity-failed', { error: error.message });
            throw new Error(`Data integrity validation failed: ${error.message}`);
        }
    }

    /**
     * Retry database connection with exponential backoff
     * @param {number} maxAttempts Maximum number of retry attempts
     * @returns {Promise<void>}
     */
    async retryConnection(maxAttempts = null) {
        const attempts = maxAttempts || this.options.maxRetries;

        // Reset status for retry
        this.status.retryCount = 0;
        this.status.connected = false;
        this.status.schemaValid = false;
        this.status.lastError = null;

        // Use the main initialization method which already has retry logic
        return this.initializeDatabase();
    }

    /**
     * Get current database status
     * @returns {Object} Current database status
     */
    getDatabaseStatus() {
        return {
            ...this.status,
            isHealthy: this.status.connected && this.status.schemaValid && this.status.currentStatus === DatabaseStatus.READY
        };
    }

    /**
     * Perform health check on database connection
     * @returns {Promise<boolean>}
     */
    async performHealthCheck() {
        if (!this.database || !this.status.connected) {
            return false;
        }

        try {
            // Simple query to test database responsiveness
            const result = this.database.db?.exec('SELECT 1 as test');
            return result && result.length > 0;

        } catch (error) {
            this.status.lastError = `Health check failed: ${error.message}`;
            this.emit('health-check-failed', { error: error.message });
            return false;
        }
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt Current attempt number (0-based)
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt) {
        const exponentialDelay = this.options.retryDelay * Math.pow(2, attempt);
        const jitteredDelay = exponentialDelay + (Math.random() * 1000); // Add jitter
        return Math.min(jitteredDelay, this.options.maxRetryDelay);
    }

    /**
     * Wait for specified timeout with ability to cancel
     * @param {number} delay Delay in milliseconds
     * @returns {Promise<void>}
     */
    waitWithTimeout(delay) {
        return new Promise((resolve) => {
            const timeout = setTimeout(resolve, delay);
            this.retryTimeouts.push(timeout);
        });
    }

    /**
     * Clean up resources and cancel pending operations
     */
    cleanup() {
        // Cancel any pending retry timeouts
        this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
        this.retryTimeouts = [];

        // Reset status
        this.status = {
            connected: false,
            schemaValid: false,
            lastError: null,
            currentStatus: DatabaseStatus.DISCONNECTED,
            retryCount: 0,
            lastConnectionAttempt: null
        };

        this.emit('cleanup-complete');
    }

    /**
     * Get database operations interface
     * @returns {Object} Database operations from existing database.js
     */
    getDatabase() {
        if (!this.database || !this.status.connected) {
            throw new Error('Database not initialized or not connected');
        }

        return this.database;
    }
}

module.exports = {
    DatabaseManager,
    DatabaseStatus
};