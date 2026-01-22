/**
 * Sync Manager - Handles synchronization of offline operations with the server
 * 
 * This module provides:
 * - Automatic sync when connection is restored
 * - Periodic sync checks
 * - Conflict detection and resolution
 * - Sync progress tracking
 * - Manual sync triggering
 */

const offlineManager = require('./offline-manager');
const databaseManager = require('./database-manager');
const logger = require('./logger');

class SyncManager {
    constructor() {
        this.syncInterval = 300000; // 5 minutes
        this.maxRetries = 3;
        this.retryDelay = 10000; // 10 seconds
        this.currentSyncSession = null;
        this.isSyncing = false;
        this.syncQueue = [];
        
        // Initialize
        this.initialize();
    }

    /**
     * Initialize the sync manager
     */
    initialize() {
        // Listen for offline manager events
        offlineManager.on('online-restored', () => this.handleOnlineRestored());
        offlineManager.on('sync-required', () => this.startSync());
        
        // Set up periodic sync
        this.syncIntervalId = setInterval(() => {
            if (!offlineManager.isCurrentlyOffline()) {
                this.startSync();
            }
        }, this.syncInterval);
        
        logger.info('[SyncManager] Initialized');
    }

    /**
     * Handle online restored event
     */
    async handleOnlineRestored() {
        logger.info('[SyncManager] Connection restored, starting sync');
        await this.startSync();
    }

    /**
     * Start synchronization process
     */
    async startSync() {
        if (this.isSyncing) {
            logger.info('[SyncManager] Sync already in progress');
            return;
        }
        
        if (offlineManager.isCurrentlyOffline()) {
            logger.info('[SyncManager] Cannot sync - offline mode');
            return;
        }
        
        this.isSyncing = true;
        logger.info('[SyncManager] Starting sync process');
        
        try {
            // Create new sync session
            this.currentSyncSession = await this.createSyncSession();
            
            // Get pending operations from database
            const pendingOps = await this.getPendingOperations();
            
            if (pendingOps.length === 0) {
                logger.info('[SyncManager] No pending operations to sync');
                await this.completeSyncSession('completed');
                return;
            }
            
            logger.info(`[SyncManager] Found ${pendingOps.length} pending operations to sync`);
            
            // Process each operation
            let successCount = 0;
            let failureCount = 0;
            
            for (const op of pendingOps) {
                try {
                    const result = await this.processOperation(op);
                    if (result) {
                        successCount++;
                    } else {
                        failureCount++;
                    }
                } catch (error) {
                    logger.error(`[SyncManager] Error processing operation ${op.id}:`, error);
                    failureCount++;
                }
            }
            
            // Complete sync session
            await this.completeSyncSession('completed', successCount, failureCount);
            
            logger.info(`[SyncManager] Sync completed - ${successCount} success, ${failureCount} failed`);
            
        } catch (error) {
            logger.error('[SyncManager] Sync failed:', error);
            if (this.currentSyncSession) {
                await this.completeSyncSession('failed');
            }
        } finally {
            this.isSyncing = false;
            this.currentSyncSession = null;
        }
    }

    /**
     * Create a new sync session in database
     * @returns {Promise<object>} Sync session record
     */
    async createSyncSession() {
        const sessionToken = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const deviceInfo = await this.getDeviceInfo();
        const networkInfo = await this.getNetworkInfo();
        
        const result = await databaseManager.execute(
            `INSERT INTO offline_sessions 
             (session_token, status, device_info, network_info, total_operations) 
             VALUES (?, 'active', ?, ?, 
                 (SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'))`,
            [sessionToken, deviceInfo, networkInfo]
        );
        
        const sessionId = result.lastID;
        return await databaseManager.getById('offline_sessions', sessionId);
    }

    /**
     * Complete sync session
     * @param {string} status - Session status
     * @param {number} successCount - Successful operations
     * @param {number} failureCount - Failed operations
     */
    async completeSyncSession(status, successCount = 0, failureCount = 0) {
        if (!this.currentSyncSession) return;
        
        const syncDuration = Date.now() - new Date(this.currentSyncSession.started_at).getTime();
        
        await databaseManager.execute(
            `UPDATE offline_sessions 
             SET status = ?, 
                 completed_at = CURRENT_TIMESTAMP,
                 successful_operations = ?,
                 failed_operations = ?,
                 sync_duration_ms = ? 
             WHERE id = ?`,
            [status, successCount, failureCount, syncDuration, this.currentSyncSession.id]
        );
        
        this.currentSyncSession = null;
    }

    /**
     * Get pending operations from database
     * @returns {Promise<Array>} Array of pending operations
     */
    async getPendingOperations() {
        return await databaseManager.query(
            `SELECT * FROM sync_queue 
             WHERE status = 'pending' 
             ORDER BY created_at ASC`
        );
    }

    /**
     * Process a single operation
     * @param {object} operation - Operation to process
     * @returns {Promise<boolean>} True if successful
     */
    async processOperation(operation) {
        const maxAttempts = this.maxRetries;
        let attempt = 0;
        
        while (attempt < maxAttempts) {
            attempt++;
            
            try {
                // Update operation status to 'in_progress'
                await databaseManager.execute(
                    `UPDATE sync_queue SET status = 'in_progress', attempt_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [attempt, operation.id]
                );
                
                // Process based on operation type
                let success = false;
                let serverResponse = null;
                
                switch (operation.operation_type) {
                    case 'CREATE_ORDER':
                        success = await this.syncCreateOrder(operation);
                        break;
                    case 'UPDATE_ORDER':
                        success = await this.syncUpdateOrder(operation);
                        break;
                    case 'CREATE_PAYMENT':
                        success = await this.syncCreatePayment(operation);
                        break;
                    case 'UPDATE_INVENTORY':
                        success = await this.syncUpdateInventory(operation);
                        break;
                    case 'CREATE_ORDER_HOLD':
                        success = await this.syncCreateOrderHold(operation);
                        break;
                    case 'UPDATE_ORDER_HOLD':
                        success = await this.syncUpdateOrderHold(operation);
                        break;
                    default:
                        logger.warn(`[SyncManager] Unknown operation type: ${operation.operation_type}`);
                        success = false;
                }
                
                if (success) {
                    // Record success in sync_history
                    await this.recordSyncHistory(operation, 'success', serverResponse);
                    
                    // Mark as completed in sync_queue
                    await databaseManager.execute(
                        `UPDATE sync_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                        [operation.id]
                    );
                    
                    return true;
                } else {
                    // Record failure in sync_history
                    await this.recordSyncHistory(operation, 'failed', serverResponse);
                    
                    // Increment attempt count
                    await databaseManager.execute(
                        `UPDATE sync_queue 
                         SET status = 'pending', 
                             attempt_count = attempt_count + 1,
                             last_error = 'Sync failed',
                             updated_at = CURRENT_TIMESTAMP 
                         WHERE id = ?`,
                        [operation.id]
                    );
                    
                    if (attempt < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    }
                }
                
            } catch (error) {
                logger.error(`[SyncManager] Error processing operation ${operation.id} (attempt ${attempt}):`, error);
                
                // Record failure in sync_history
                await this.recordSyncHistory(operation, 'failed', error.message);
                
                // Update operation with error
                await databaseManager.execute(
                    `UPDATE sync_queue 
                     SET status = 'pending', 
                         attempt_count = attempt_count + 1,
                         last_error = ?,
                         updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [error.message, operation.id]
                );
                
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }
        
        return false;
    }

    /**
     * Record sync history
     * @param {object} operation - Operation
     * @param {string} status - Sync status
     * @param {string} serverResponse - Server response
     */
    async recordSyncHistory(operation, status, serverResponse) {
        await databaseManager.execute(
            `INSERT INTO sync_history 
             (sync_queue_id, operation_type, entity_type, entity_id, status, 
              started_at, completed_at, server_response, sync_session_id) 
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`,
            [
                operation.id,
                operation.operation_type,
                operation.entity_type,
                operation.entity_id,
                status,
                serverResponse || null,
                this.currentSyncSession ? this.currentSyncSession.id : null
            ]
        );
    }

    /**
     * Sync create order operation
     * @param {object} operation - Operation
     * @returns {Promise<boolean>} True if successful
     */
    async syncCreateOrder(operation) {
        try {
            const payload = JSON.parse(operation.payload);
            
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                logger.error('[SyncManager] Create order failed:', errorData);
                
                // Check for conflict
                if (response.status === 409) {
                    await this.handleConflict('orders', payload.order_id, operation, errorData);
                }
                
                return false;
            }
            
            const result = await response.json();
            logger.info(`[SyncManager] Order ${payload.order_id} synced successfully`);
            
            // Update local order with server response
            await databaseManager.execute(
                `UPDATE orders 
                 SET sync_status = 'synced', 
                     server_order_id = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [result.id, payload.order_id]
            );
            
            return true;
        } catch (error) {
            logger.error('[SyncManager] Error syncing order:', error);
            return false;
        }
    }

    /**
     * Sync update order operation
     * @param {object} operation - Operation
     * @returns {Promise<boolean>} True if successful
     */
    async syncUpdateOrder(operation) {
        try {
            const payload = JSON.parse(operation.payload);
            
            const response = await fetch(`/api/orders/${payload.order_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                logger.error('[SyncManager] Update order failed:', errorData);
                
                if (response.status === 409) {
                    await this.handleConflict('orders', payload.order_id, operation, errorData);
                }
                
                return false;
            }
            
            logger.info(`[SyncManager] Order ${payload.order_id} updated successfully`);
            
            await databaseManager.execute(
                `UPDATE orders 
                 SET sync_status = 'synced', 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [payload.order_id]
            );
            
            return true;
        } catch (error) {
            logger.error('[SyncManager] Error syncing order update:', error);
            return false;
        }
    }

    /**
     * Sync create payment operation
     * @param {object} operation - Operation
     * @returns {Promise<boolean>} True if successful
     */
    async syncCreatePayment(operation) {
        try {
            const payload = JSON.parse(operation.payload);
            
            const response = await fetch('/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                logger.error('[SyncManager] Create payment failed:', errorData);
                
                if (response.status === 409) {
                    await this.handleConflict('payments', payload.payment_id, operation, errorData);
                }
                
                return false;
            }
            
            logger.info(`[SyncManager] Payment ${payload.payment_id} synced successfully`);
            
            await databaseManager.execute(
                `UPDATE payments 
                 SET sync_status = 'synced', 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [payload.payment_id]
            );
            
            return true;
        } catch (error) {
            logger.error('[SyncManager] Error syncing payment:', error);
            return false;
        }
    }

    /**
     * Sync update inventory operation
     * @param {object} operation - Operation
     * @returns {Promise<boolean>} True if successful
     */
    async syncUpdateInventory(operation) {
        try {
            const payload = JSON.parse(operation.payload);
            
            const response = await fetch('/api/inventory/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                logger.error('[SyncManager] Update inventory failed:', errorData);
                
                if (response.status === 409) {
                    await this.handleConflict('inventory_transactions', payload.transaction_id, operation, errorData);
                }
                
                return false;
            }
            
            logger.info(`[SyncManager] Inventory transaction ${payload.transaction_id} synced successfully`);
            
            await databaseManager.execute(
                `UPDATE inventory_transactions 
                 SET sync_status = 'synced', 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [payload.transaction_id]
            );
            
            return true;
        } catch (error) {
            logger.error('[SyncManager] Error syncing inventory:', error);
            return false;
        }
    }

    /**
     * Sync create order hold operation
     * @param {object} operation - Operation
     * @returns {Promise<boolean>} True if successful
     */
    async syncCreateOrderHold(operation) {
        try {
            const payload = JSON.parse(operation.payload);
            
            const response = await fetch('/api/order-holds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                logger.error('[SyncManager] Create order hold failed:', errorData);
                
                if (response.status === 409) {
                    await this.handleConflict('order_holds', payload.hold_id, operation, errorData);
                }
                
                return false;
            }
            
            const result = await response.json();
            logger.info(`[SyncManager] Order hold ${payload.hold_id} synced successfully`);
            
            await databaseManager.execute(
                `UPDATE order_holds 
                 SET sync_status = 'synced', 
                     server_hold_id = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [result.id, payload.hold_id]
            );
            
            return true;
        } catch (error) {
            logger.error('[SyncManager] Error syncing order hold:', error);
            return false;
        }
    }

    /**
     * Sync update order hold operation
     * @param {object} operation - Operation
     * @returns {Promise<boolean>} True if successful
     */
    async syncUpdateOrderHold(operation) {
        try {
            const payload = JSON.parse(operation.payload);
            
            const response = await fetch(`/api/order-holds/${payload.hold_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                logger.error('[SyncManager] Update order hold failed:', errorData);
                
                if (response.status === 409) {
                    await this.handleConflict('order_holds', payload.hold_id, operation, errorData);
                }
                
                return false;
            }
            
            logger.info(`[SyncManager] Order hold ${payload.hold_id} updated successfully`);
            
            await databaseManager.execute(
                `UPDATE order_holds 
                 SET sync_status = 'synced', 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [payload.hold_id]
            );
            
            return true;
        } catch (error) {
            logger.error('[SyncManager] Error syncing order hold update:', error);
            return false;
        }
    }

    /**
     * Handle conflict during sync
     * @param {string} entityType - Entity type
     * @param {number} entityId - Entity ID
     * @param {object} operation - Operation
     * @param {object} errorData - Error data from server
     */
    async handleConflict(entityType, entityId, operation, errorData) {
        try {
            const localData = await databaseManager.getById(entityType, entityId);
            
            if (!localData) {
                logger.error(`[SyncManager] Local ${entityType} ${entityId} not found`);
                return;
            }
            
            // Record conflict
            await databaseManager.execute(
                `INSERT INTO conflict_resolution 
                 (entity_type, entity_id, conflict_type, local_version, 
                  local_timestamp, remote_version, remote_timestamp, 
                  resolution_strategy, status, sync_session_id) 
                 VALUES (?, ?, 'update-conflict', ?, ?, ?, ?, 'last-write-wins', 'unresolved', ?)`,
                [
                    entityType,
                    entityId,
                    JSON.stringify(localData),
                    localData.updated_at || localData.created_at,
                    errorData.remote_version || JSON.stringify(errorData),
                    errorData.remote_timestamp || new Date().toISOString(),
                    this.currentSyncSession ? this.currentSyncSession.id : null
                ]
            );
            
            logger.warn(`[SyncManager] Conflict detected for ${entityType} ${entityId}`);
            
            // Apply last-write-wins strategy
            if (new Date(localData.updated_at || localData.created_at) > new Date(errorData.remote_timestamp || errorData.timestamp)) {
                logger.info(`[SyncManager] Local version is newer, will retry later`);
                // Keep operation in queue for retry
            } else {
                logger.info(`[SyncManager] Remote version is newer, updating local`);
                // Update local with remote version
                await this.updateLocalWithRemote(entityType, entityId, errorData);
            }
            
        } catch (error) {
            logger.error('[SyncManager] Error handling conflict:', error);
        }
    }

    /**
     * Update local data with remote version
     * @param {string} entityType - Entity type
     * @param {number} entityId - Entity ID
     * @param {object} remoteData - Remote data
     */
    async updateLocalWithRemote(entityType, entityId, remoteData) {
        try {
            switch (entityType) {
                case 'orders':
                    await databaseManager.execute(
                        `UPDATE orders 
                         SET order_data = ?, status = ?, updated_at = ? 
                         WHERE id = ?`,
                        [remoteData.order_data, remoteData.status, remoteData.updated_at, entityId]
                    );
                    break;
                case 'payments':
                    await databaseManager.execute(
                        `UPDATE payments 
                         SET amount = ?, payment_method = ?, status = ?, updated_at = ? 
                         WHERE id = ?`,
                        [remoteData.amount, remoteData.payment_method, remoteData.status, remoteData.updated_at, entityId]
                    );
                    break;
                case 'inventory_transactions':
                    await databaseManager.execute(
                        `UPDATE inventory_transactions 
                         SET product_id = ?, quantity = ?, transaction_type = ?, 
                             notes = ?, updated_at = ? 
                         WHERE id = ?`,
                        [remoteData.product_id, remoteData.quantity, remoteData.transaction_type,
                         remoteData.notes, remoteData.updated_at, entityId]
                    );
                    break;
                case 'order_holds':
                    await databaseManager.execute(
                        `UPDATE order_holds 
                         SET order_id = ?, status = ?, notes = ?, updated_at = ? 
                         WHERE id = ?`,
                        [remoteData.order_id, remoteData.status, remoteData.notes, remoteData.updated_at, entityId]
                    );
                    break;
            }
            
            // Mark operation as completed since we've resolved the conflict
            await databaseManager.execute(
                `UPDATE sync_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [remoteData.operation_id || remoteData.sync_queue_id]
            );
            
        } catch (error) {
            logger.error('[SyncManager] Error updating local with remote:', error);
        }
    }

    /**
     * Get device information
     * @returns {Promise<string>} Device info JSON
     */
    async getDeviceInfo() {
        const { app, ipcRenderer } = require('electron');
        
        const deviceInfo = {
            appVersion: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            hostname: require('os').hostname(),
            timestamp: new Date().toISOString()
        };
        
        return JSON.stringify(deviceInfo);
    }

    /**
     * Get network information
     * @returns {Promise<string>} Network info JSON
     */
    async getNetworkInfo() {
        const networkInfo = {
            ipAddress: 'pending',
            connectionType: 'pending',
            timestamp: new Date().toISOString()
        };
        
        return JSON.stringify(networkInfo);
    }

    /**
     * Get sync status
     * @returns {object} Current sync status
     */
    getSyncStatus() {
        return {
            isSyncing: this.isSyncing,
            pendingOperations: this.getPendingOperationsCount(),
            lastSync: this.currentSyncSession ? this.currentSyncSession.started_at : null,
            syncSessionId: this.currentSyncSession ? this.currentSyncSession.id : null
        };
    }

    /**
     * Get pending operations count
     * @returns {Promise<number>} Count of pending operations
     */
    async getPendingOperationsCount() {
        const result = await databaseManager.query(
            `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`
        );
        return result[0].count;
    }

    /**
     * Manually trigger sync
     */
    async manualSync() {
        logger.info('[SyncManager] Manual sync triggered');
        await this.startSync();
    }

    /**
     * Destroy the sync manager
     */
    destroy() {
        clearInterval(this.syncIntervalId);
        offlineManager.removeListener('online-restored', this.handleOnlineRestored);
        offlineManager.removeListener('sync-required', this.startSync);
    }
}

// Export singleton instance
const syncManager = new SyncManager();

module.exports = syncManager;
