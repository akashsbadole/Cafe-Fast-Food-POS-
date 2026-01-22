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
            isHealthy: this.status.connected && this.status.schemaValid && this.status.currentStatus === DatabaseStatus.READY,
            isReady: this.status.currentStatus === DatabaseStatus.READY
        };
    }

    /**
     * Check if database is ready for operations
     * @returns {boolean} True if database is ready
     */
    isDatabaseReady() {
        return this.status.currentStatus === DatabaseStatus.READY;
    }

    /**
     * Wait for database to be ready
     * @param {number} timeout - Maximum time to wait in milliseconds
     * @returns {Promise<void>}
     */
    async waitForDatabaseReady(timeout = 30000) {
        if (this.isDatabaseReady()) {
            return;
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.removeListener('database-ready', onReady);
                reject(new Error('Database did not become ready within the specified timeout'));
            }, timeout);

            const onReady = () => {
                clearTimeout(timeoutId);
                resolve();
            };

            this.once('database-ready', onReady);
        });
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

    /**
     * Queue an operation for offline sync
     * @param {string} operationType - Type of operation
     * @param {string} entityType - Entity type
     * @param {number} entityId - Entity ID
     * @param {any} payload - Operation payload
     * @param {number} syncSessionId - Optional sync session ID
     * @returns {Promise<object>} Queued operation record
     */
    async queueOfflineOperation(operationType, entityType, entityId, payload, syncSessionId = null) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        const result = await this.database.execute(
            `INSERT INTO sync_queue
             (operation_type, entity_type, entity_id, payload, status, sync_session_id)
             VALUES (?, ?, ?, ?, 'pending', ?)`,
            [operationType, entityType, entityId, JSON.stringify(payload), syncSessionId]
        );

        // Update sync_metadata pending operations count
        await this.database.execute(
            `UPDATE sync_metadata
             SET pending_operations_count = pending_operations_count + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = 1`
        );

        return this.database.getById('sync_queue', result.lastID);
    }

    /**
     * Get pending offline operations
     * @param {string} status - Optional status filter
     * @param {string} entityType - Optional entity type filter
     * @param {number} limit - Optional limit
     * @returns {Promise<Array>} Array of pending operations
     */
    async getPendingOfflineOperations(status = 'pending', entityType = null, limit = null) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        let query = `SELECT * FROM sync_queue WHERE status = ?`;
        const params = [status];

        if (entityType) {
            query += ` AND entity_type = ?`;
            params.push(entityType);
        }

        if (limit) {
            query += ` LIMIT ?`;
            params.push(limit);
        }

        query += ` ORDER BY created_at ASC`;

        return await this.database.query(query, params);
    }

    /**
     * Update offline operation status
     * @param {number} operationId - Operation ID
     * @param {string} status - New status
     * @param {string} errorMessage - Optional error message
     * @returns {Promise<object>} Updated operation
     */
    async updateOfflineOperationStatus(operationId, status, errorMessage = null) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        let query = `UPDATE sync_queue SET status = ?, updated_at = CURRENT_TIMESTAMP`;
        const params = [status];

        if (errorMessage) {
            query += `, last_error = ?`;
            params.push(errorMessage);
        }

        query += ` WHERE id = ?`;
        params.push(operationId);

        await this.database.execute(query, params);

        // Update sync_metadata pending operations count
        if (status === 'completed' || status === 'failed') {
            await this.database.execute(
                `UPDATE sync_metadata
                 SET pending_operations_count =
                     (SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'),
                 updated_at = CURRENT_TIMESTAMP
                 WHERE id = 1`
            );
        }

        return this.database.getById('sync_queue', operationId);
    }

    /**
     * Record sync history
     * @param {number} syncQueueId - Sync queue ID
     * @param {string} operationType - Operation type
     * @param {string} entityType - Entity type
     * @param {number} entityId - Entity ID
     * @param {string} status - Sync status
     * @param {string} serverResponse - Server response
     * @param {number} syncSessionId - Sync session ID
     * @returns {Promise<object>} Created history record
     */
    async recordSyncHistory(syncQueueId, operationType, entityType, entityId, status, serverResponse, syncSessionId) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        return await this.database.execute(
            `INSERT INTO sync_history
             (sync_queue_id, operation_type, entity_type, entity_id, status,
              started_at, completed_at, server_response, sync_session_id)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`,
            [syncQueueId, operationType, entityType, entityId, status, serverResponse || null, syncSessionId]
        );
    }

    /**
     * Create conflict resolution record
     * @param {string} entityType - Entity type
     * @param {number} entityId - Entity ID
     * @param {string} conflictType - Conflict type
     * @param {string} localVersion - Local version
     * @param {string} localTimestamp - Local timestamp
     * @param {string} remoteVersion - Remote version
     * @param {string} remoteTimestamp - Remote timestamp
     * @param {string} resolutionStrategy - Resolution strategy
     * @param {string} status - Status
     * @param {number} syncSessionId - Sync session ID
     * @param {string} notes - Optional notes
     * @returns {Promise<object>} Created conflict record
     */
    async createConflictResolution(
        entityType, entityId, conflictType, localVersion, localTimestamp,
        remoteVersion, remoteTimestamp, resolutionStrategy, status, syncSessionId, notes = null
    ) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        return await this.database.execute(
            `INSERT INTO conflict_resolution
             (entity_type, entity_id, conflict_type, local_version,
              local_timestamp, remote_version, remote_timestamp,
              resolution_strategy, status, notes, sync_session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entityType, entityId, conflictType, localVersion, localTimestamp,
                remoteVersion, remoteTimestamp, resolutionStrategy, status, notes || null, syncSessionId
            ]
        );
    }

    /**
     * Get unresolved conflicts
     * @param {string} entityType - Optional entity type filter
     * @returns {Promise<Array>} Array of unresolved conflicts
     */
    async getUnresolvedConflicts(entityType = null) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        let query = `SELECT * FROM conflict_resolution WHERE status = 'unresolved'`;
        const params = [];

        if (entityType) {
            query += ` AND entity_type = ?`;
            params.push(entityType);
        }

        query += ` ORDER BY created_at ASC`;

        return await this.database.query(query, params);
    }

    /**
     * Resolve conflict
     * @param {number} conflictId - Conflict ID
     * @param {string} resolvedVersion - Resolved version
     * @param {string} resolutionStrategy - Resolution strategy
     * @param {string} resolvedBy - Who resolved it
     * @param {string} notes - Optional notes
     * @returns {Promise<object>} Updated conflict record
     */
    async resolveConflict(conflictId, resolvedVersion, resolutionStrategy, resolvedBy, notes = null) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        await this.database.execute(
            `UPDATE conflict_resolution
             SET resolved_version = ?,
                 resolution_strategy = ?,
                 resolved_by = ?,
                 resolved_at = CURRENT_TIMESTAMP,
                 status = 'resolved',
                 notes = ?
             WHERE id = ?`,
            [resolvedVersion, resolutionStrategy, resolvedBy, notes || null, conflictId]
        );

        return this.database.getById('conflict_resolution', conflictId);
    }

    /**
     * Get sync metadata
     * @returns {Promise<object>} Sync metadata
     */
    async getSyncMetadata() {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        return await this.database.getById('sync_metadata', 1);
    }

    /**
     * Update sync metadata
     * @param {object} updates - Updates to apply
     * @returns {Promise<object>} Updated sync metadata
     */
    async updateSyncMetadata(updates) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        const setClauses = [];
        const params = [];

        if (updates.last_sync_timestamp !== undefined) {
            setClauses.push('last_sync_timestamp = ?');
            params.push(updates.last_sync_timestamp);
        }

        if (updates.last_full_sync_timestamp !== undefined) {
            setClauses.push('last_full_sync_timestamp = ?');
            params.push(updates.last_full_sync_timestamp);
        }

        if (updates.last_known_server_version !== undefined) {
            setClauses.push('last_known_server_version = ?');
            params.push(updates.last_known_server_version);
        }

        if (setClauses.length === 0) {
            throw new Error('No updates provided');
        }

        setClauses.push('updated_at = CURRENT_TIMESTAMP');

        const query = `UPDATE sync_metadata SET ${setClauses.join(', ')} WHERE id = 1`;
        await this.database.execute(query, params);

        return this.getSyncMetadata();
    }

    /**
     * Get sync session by ID
     * @param {number} sessionId - Sync session ID
     * @returns {Promise<object>} Sync session
     */
    async getSyncSession(sessionId) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        return await this.database.getById('offline_sessions', sessionId);
    }

    /**
     * Get active sync sessions
     * @returns {Promise<Array>} Array of active sync sessions
     */
    async getActiveSyncSessions() {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        return await this.database.query(
            `SELECT * FROM offline_sessions WHERE status = 'active' ORDER BY started_at DESC`
        );
    }

    /**
     * Get recent sync sessions
     * @param {number} limit - Number of sessions to retrieve
     * @returns {Promise<Array>} Array of recent sync sessions
     */
    async getRecentSyncSessions(limit = 10) {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        return await this.database.query(
            `SELECT * FROM offline_sessions ORDER BY started_at DESC LIMIT ?`,
            [limit]
        );
    }

    /**
     * Get sync statistics
     * @returns {Promise<object>} Sync statistics
     */
    async getSyncStatistics() {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        const [pendingOps, completedOps, failedOps, conflicts] = await Promise.all([
            this.database.query('SELECT COUNT(*) as count FROM sync_queue WHERE status = ?', ['pending']),
            this.database.query('SELECT COUNT(*) as count FROM sync_queue WHERE status = ?', ['completed']),
            this.database.query('SELECT COUNT(*) as count FROM sync_queue WHERE status = ?', ['failed']),
            this.database.query('SELECT COUNT(*) as count FROM conflict_resolution WHERE status = ?', ['unresolved'])
        ]);

        return {
            pendingOperations: pendingOps[0].count,
            completedOperations: completedOps[0].count,
            failedOperations: failedOps[0].count,
            unresolvedConflicts: conflicts[0].count
        };
    }

    /**
     * Verify data integrity after sync
     * @returns {Promise<object>} Integrity verification results
     */
    async verifyDataIntegrity() {
        if (!this.database) {
            throw new Error('Database not initialized');
        }

        const results = {
            checks: {},
            passed: true,
            errors: []
        };

        try {
            // Check for orphaned records
            const orphanedOrders = await this.database.query(
                `SELECT COUNT(*) as count
                 FROM orders
                 WHERE sync_status = 'pending'
                 AND id NOT IN (SELECT entity_id FROM sync_queue WHERE entity_type = 'orders' AND status = 'pending')`
            );

            results.checks.orphanedOrders = orphanedOrders[0].count;
            if (orphanedOrders[0].count > 0) {
                results.passed = false;
                results.errors.push(`Found ${orphanedOrders[0].count} orphaned orders`);
            }

            // Check for inconsistent sync status
            const inconsistentOrders = await this.database.query(
                `SELECT COUNT(*) as count
                 FROM orders
                 WHERE sync_status = 'synced'
                 AND id IN (SELECT entity_id FROM sync_queue WHERE entity_type = 'orders' AND status = 'pending')`
            );

            results.checks.inconsistentOrders = inconsistentOrders[0].count;
            if (inconsistentOrders[0].count > 0) {
                results.passed = false;
                results.errors.push(`Found ${inconsistentOrders[0].count} orders with inconsistent sync status`);
            }

            // Check sync_metadata consistency
            const metadata = await this.getSyncMetadata();
            const actualPending = await this.database.query(
                'SELECT COUNT(*) as count FROM sync_queue WHERE status = ?', ['pending']
            );

            if (metadata.pending_operations_count !== actualPending[0].count) {
                results.passed = false;
                results.errors.push(
                    `Sync metadata pending count (${metadata.pending_operations_count}) ` +
                    `doesn't match actual count (${actualPending[0].count})`
                );
            }

        } catch (error) {
            results.passed = false;
            results.errors.push(`Data integrity check failed: ${error.message}`);
        }

        return results;
    }
}

module.exports = {
    DatabaseManager,
    DatabaseStatus
};