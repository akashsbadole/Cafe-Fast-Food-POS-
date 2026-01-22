/**
 * Offline Manager - Handles offline mode detection and basic offline operations
 * 
 * This module provides:
 * - Network connectivity monitoring
 * - Offline mode detection
 * - Basic offline operation queueing
 * - Event handling for online/offline state changes
 */

const { ipcRenderer } = require('electron');
const EventEmitter = require('events');

class OfflineManager extends EventEmitter {
    constructor() {
        super();
        this.isOffline = false;
        this.lastOnlineCheck = 0;
        this.checkInterval = 30000; // 30 seconds
        this.pingTimeout = 5000; // 5 seconds
        this.pingUrl = '/api/ping';
        this.pendingOperations = [];
        
        // Initialize
        this.initialize();
    }

    /**
     * Initialize the offline manager
     */
    initialize() {
        // Check initial network status
        this.checkNetworkStatus();
        
        // Set up periodic checks
        this.networkCheckInterval = setInterval(() => {
            this.checkNetworkStatus();
        }, this.checkInterval);
        
        // Listen for window online/offline events (only in renderer process)
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.handleOnline());
            window.addEventListener('offline', () => this.handleOffline());
        }
        
        // Listen for IPC events from main process
        if (ipcRenderer) {
            ipcRenderer.on('network-status-changed', (event, status) => {
                this.handleNetworkStatusChange(status);
            });
        }
        
        console.log('[OfflineManager] Initialized');
    }

    /**
     * Check current network status
     */
    async checkNetworkStatus() {
        try {
            const isOnline = await this.pingServer();
            
            if (isOnline !== this.isOffline) {
                this.isOffline = !isOnline;
                this.emit('network-status-changed', this.isOffline);
                
                if (this.isOffline) {
                    this.handleOffline();
                } else {
                    this.handleOnline();
                }
            }
        } catch (error) {
            console.warn('[OfflineManager] Network check failed:', error.message);
            // If we can't reach the server, assume offline
            if (!this.isOffline) {
                this.isOffline = true;
                this.emit('network-status-changed', true);
                this.handleOffline();
            }
        }
    }

    /**
     * Ping the server to check connectivity
     * @returns {Promise<boolean>} True if server is reachable
     */
    async pingServer() {
        const startTime = Date.now();

        console.log('[OfflineManager] Attempting ping to:', this.pingUrl);

        try {
            const response = await fetch(this.pingUrl, {
                method: 'GET',
                cache: 'no-store',
                signal: AbortSignal.timeout(this.pingTimeout)
            });

            if (response.ok) {
                const latency = Date.now() - startTime;
                console.debug(`[OfflineManager] Server ping successful (${latency}ms)`);
                return true;
            }

            console.warn('[OfflineManager] Server ping response not ok:', response.status, response.statusText);
            return false;
        } catch (error) {
            console.error('[OfflineManager] Server ping failed with error:', error.message, 'URL:', this.pingUrl);
            return false;
        }
    }

    /**
     * Handle going offline
     */
    handleOffline() {
        console.warn('[OfflineManager] Network connection lost - entering offline mode');
        this.emit('offline-entered');
        
        // Queue any pending operations
        this.queuePendingOperations();
    }

    /**
     * Handle coming back online
     */
    handleOnline() {
        console.log('[OfflineManager] Network connection restored - exiting offline mode');
        this.emit('online-restored');
        
        // Notify sync manager to start syncing
        this.emit('sync-required');
    }

    /**
     * Handle network status change from main process
     * @param {boolean} isOffline - True if offline
     */
    handleNetworkStatusChange(isOffline) {
        if (isOffline !== this.isOffline) {
            this.isOffline = isOffline;
            this.emit('network-status-changed', this.isOffline);
            
            if (this.isOffline) {
                this.handleOffline();
            } else {
                this.handleOnline();
            }
        }
    }

    /**
     * Queue pending operations for offline mode
     */
    queuePendingOperations() {
        // This will be implemented by modules that need offline queueing
        this.emit('queue-pending-operations');
    }

    /**
     * Add operation to pending queue
     * @param {string} operationType - Type of operation
     * @param {string} entityType - Entity type
     * @param {number} entityId - Entity ID
     * @param {any} payload - Operation payload
     */
    addToPendingQueue(operationType, entityType, entityId, payload) {
        const operation = {
            operationType,
            entityType,
            entityId,
            payload,
            timestamp: new Date().toISOString()
        };
        
        this.pendingOperations.push(operation);
        this.emit('operation-queued', operation);
        
        return operation;
    }

    /**
     * Get pending operations count
     * @returns {number} Count of pending operations
     */
    getPendingOperationsCount() {
        return this.pendingOperations.length;
    }

    /**
     * Clear pending operations
     */
    clearPendingOperations() {
        this.pendingOperations = [];
    }

    /**
     * Check if we're currently offline
     * @returns {boolean} True if offline
     */
    isCurrentlyOffline() {
        return this.isOffline;
    }

    /**
     * Destroy the offline manager
     */
    destroy() {
        clearInterval(this.networkCheckInterval);
        
        // Remove window event listeners (only in renderer process)
        if (typeof window !== 'undefined') {
            window.removeEventListener('online', this.handleOnline);
            window.removeEventListener('offline', this.handleOffline);
        }
        
        if (ipcRenderer) {
            ipcRenderer.removeAllListeners('network-status-changed');
        }
        
        this.removeAllListeners();
    }
}

// Export singleton instance
const offlineManager = new OfflineManager();

module.exports = offlineManager;
