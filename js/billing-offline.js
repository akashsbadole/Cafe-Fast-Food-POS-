/**
 * Offline Billing Extension - Adds offline mode support to billing operations
 * This module extends the base Billing functionality with offline capabilities
 */

const offlineManager = require('./offline-manager');
const databaseManager = require('./database-manager');
const logger = require('./logger');

// Extend the Billing object with offline capabilities
const OfflineBilling = {
    
    /**
     * Initialize offline billing functionality
     */
    init: () => {
        // Listen for offline manager events
        offlineManager.on('network-status-changed', (isOffline) => {
            OfflineBilling.isOffline = isOffline;
        });
        
        // Initialize offline state
        OfflineBilling.isOffline = offlineManager.isCurrentlyOffline();
    },
    
    /**
     * Check if we're in offline mode
     * @returns {boolean} True if offline
     */
    isOffline: () => {
        return offlineManager.isCurrentlyOffline();
    },
    
    /**
     * Process checkout with offline support
     * @param {string} paymentMode - Payment mode
     * @returns {Promise<object>} Order data
     */
    processCheckout: async (paymentMode) => {
        if (Cart.isEmpty()) {
            alert('Cart is empty. Please add items first.');
            return null;
        }
        
        const totals = Billing.getTotals();
        const orderNumber = order.generateOrderNumber();
        
        const orderData = {
            orderNumber,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            discountType: Cart.discountType,
            taxAmount: totals.taxAmount,
            taxRate: totals.taxRate,
            totalAmount: totals.total,
            paymentMode,
            paymentStatus: 'paid',
            status: 'pending',
            notes: '',
            is_offline: OfflineBilling.isOffline(),
            offline_created_at: OfflineBilling.isOffline() ? new Date().toISOString() : null,
            sync_status: OfflineBilling.isOffline() ? 'pending' : 'synced',
            table_id: Cart.selectedTableId,
            buzzer_id: Cart.selectedBuzzerId
        };
        
        try {
            // Create order in database
            const orderId = order.create(orderData);
            
            // Add order items
            const orderItems = Cart.getOrderItems();
            orderItems.forEach(item => {
                order.addItem(orderId, item);
            });
            
            // If offline, queue for sync
            if (OfflineBilling.isOffline()) {
                logger.info('[OfflineBilling] Creating order offline');
                
                // Queue the order creation
                await databaseManager.queueOfflineOperation(
                    'CREATE_ORDER',
                    'orders',
                    orderId,
                    {
                        ...orderData,
                        id: orderId,
                        items: orderItems
                    }
                );
                
                // Show offline notification
                alert('Order created in offline mode. It will sync when connection is restored.');
            } else {
                // Online mode - submit to KDS
                try {
                    const kdsResponse = await fetch('/api/kds/orders', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            orderId,
                            items: orderItems,
                            priority: false,
                            notes: orderData.notes
                        })
                    });
                    
                    if (kdsResponse.ok) {
                        const kdsResult = await kdsResponse.json();
                        orderData.kdsOrderId = kdsResult.kds_order_id;
                    }
                } catch (error) {
                    logger.error('Failed to submit to KDS:', error);
                }
            }
            
            // Clear cart after successful order
            Cart.clear();
            
            return {
                orderId,
                orderNumber,
                ...orderData,
                items: orderItems
            };
            
        } catch (error) {
            logger.error('Error processing checkout:', error);
            alert('Error processing order: ' + error.message);
            return null;
        }
    },
    
    /**
     * Process payment with offline support
     * @param {object} paymentData - Payment data
     * @returns {Promise<object>} Payment result
     */
    processPayment: async (paymentData) => {
        try {
            const paymentResult = {
                ...paymentData,
                is_offline: OfflineBilling.isOffline(),
                offline_created_at: OfflineBilling.isOffline() ? new Date().toISOString() : null,
                sync_status: OfflineBilling.isOffline() ? 'pending' : 'synced'
            };
            
            // Create payment in database
            const paymentId = payments.create(paymentResult);
            
            if (OfflineBilling.isOffline()) {
                logger.info('[OfflineBilling] Creating payment offline');
                
                // Queue the payment for sync
                await databaseManager.queueOfflineOperation(
                    'CREATE_PAYMENT',
                    'payments',
                    paymentId,
                    paymentResult
                );
                
                // Show offline notification
                alert('Payment recorded in offline mode. It will sync when connection is restored.');
            }
            
            return {
                ...paymentResult,
                id: paymentId
            };
            
        } catch (error) {
            logger.error('Error processing payment:', error);
            alert('Error processing payment: ' + error.message);
            return null;
        }
    },
    
    /**
     * Get pending operations count
     * @returns {Promise<number>} Count of pending operations
     */
    getPendingOperationsCount: async () => {
        return await databaseManager.getPendingOperationsCount();
    },
    
    /**
     * Check if there are pending offline operations
     * @returns {Promise<boolean>} True if there are pending operations
     */
    hasPendingOperations: async () => {
        const count = await OfflineBilling.getPendingOperationsCount();
        return count > 0;
    }
};

// Initialize offline billing
OfflineBilling.init();

// Export for use in other modules
module.exports = OfflineBilling;

// Add to window for global access
if (typeof window !== 'undefined') {
    window.OfflineBilling = OfflineBilling;
}
