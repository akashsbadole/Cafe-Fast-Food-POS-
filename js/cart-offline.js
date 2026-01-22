/**
 * Offline Cart Extension - Adds offline mode support to the cart
 * This module extends the base Cart functionality with offline capabilities
 */

const offlineManager = require('./offline-manager');
const databaseManager = require('./database-manager');

// Extend the Cart object with offline capabilities
const OfflineCart = {
    
    /**
     * Initialize offline cart functionality
     */
    init: () => {
        // Listen for offline manager events
        offlineManager.on('network-status-changed', (isOffline) => {
            OfflineCart.isOffline = isOffline;
            OfflineCart.updateOfflineIndicator();
        });
        
        // Initialize offline state
        OfflineCart.isOffline = offlineManager.isCurrentlyOffline();
        OfflineCart.updateOfflineIndicator();
    },
    
    /**
     * Update offline indicator in UI
     */
    updateOfflineIndicator: () => {
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            if (OfflineCart.isOffline) {
                offlineIndicator.style.display = 'block';
                offlineIndicator.textContent = 'Offline Mode - Changes will sync when connection is restored';
            } else {
                offlineIndicator.style.display = 'none';
            }
        }
    },
    
    /**
     * Check if we're in offline mode
     * @returns {boolean} True if offline
     */
    isOffline: () => {
        return offlineManager.isCurrentlyOffline();
    },
    
    /**
     * Save cart to local storage for offline persistence
     */
    saveCartToLocalStorage: () => {
        if (Cart.items.length > 0) {
            localStorage.setItem('offline_cart', JSON.stringify({
                items: Cart.items,
                discountType: Cart.discountType,
                discountValue: Cart.discountValue,
                selectedTableId: Cart.selectedTableId,
                selectedBuzzerId: Cart.selectedBuzzerId,
                appliedCombos: Cart.appliedCombos,
                timestamp: new Date().toISOString()
            }));
        }
    },
    
    /**
     * Load cart from local storage
     */
    loadCartFromLocalStorage: () => {
        const savedCart = localStorage.getItem('offline_cart');
        if (savedCart) {
            try {
                const cartData = JSON.parse(savedCart);
                Cart.items = cartData.items || [];
                Cart.discountType = cartData.discountType || 'fixed';
                Cart.discountValue = cartData.discountValue || 0;
                Cart.selectedTableId = cartData.selectedTableId || null;
                Cart.selectedBuzzerId = cartData.selectedBuzzerId || null;
                Cart.appliedCombos = cartData.appliedCombos || [];
                
                Cart.render();
                Billing.calculate();
                
                // Clear the saved cart
                localStorage.removeItem('offline_cart');
                
                return true;
            } catch (error) {
                console.error('Error loading cart from local storage:', error);
                return false;
            }
        }
        return false;
    },
    
    /**
     * Queue cart for offline sync when order is completed
     * @param {object} orderData - Order data
     * @returns {Promise<object>} Queued operation
     */
    queueOrderForSync: async (orderData) => {
        try {
            // Queue the order creation
            const orderOp = await databaseManager.queueOfflineOperation(
                'CREATE_ORDER',
                'orders',
                orderData.id,
                orderData
            );
            
            // Queue order items if they exist
            if (orderData.items && orderData.items.length > 0) {
                for (const item of orderData.items) {
                    await databaseManager.queueOfflineOperation(
                        'CREATE_ORDER_ITEM',
                        'order_items',
                        item.id,
                        item
                    );
                }
            }
            
            return orderOp;
        } catch (error) {
            console.error('Error queuing order for sync:', error);
            throw error;
        }
    },
    
    /**
     * Queue payment for offline sync
     * @param {object} paymentData - Payment data
     * @returns {Promise<object>} Queued operation
     */
    queuePaymentForSync: async (paymentData) => {
        try {
            return await databaseManager.queueOfflineOperation(
                'CREATE_PAYMENT',
                'payments',
                paymentData.id,
                paymentData
            );
        } catch (error) {
            console.error('Error queuing payment for sync:', error);
            throw error;
        }
    },
    
    /**
     * Get pending operations count
     * @returns {Promise<number>} Count of pending operations
     */
    getPendingOperationsCount: async () => {
        return await databaseManager.getPendingOperationsCount();
    }
};

// Initialize offline cart
OfflineCart.init();

// Export for use in other modules
module.exports = OfflineCart;

// Add to window for global access
if (typeof window !== 'undefined') {
    window.OfflineCart = OfflineCart;
}
