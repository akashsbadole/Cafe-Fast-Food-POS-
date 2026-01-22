/**
 * Void/Refund Manager
 * 
 * Handles all void and refund operations for the POS system
 * Implements approval workflows, audit logging, and inventory management
 */

const { v4: uuidv4 } = require('uuid');

class VoidRefundManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger || console;
        this.config = {
            voidTimeLimitHours: 24, // Void must be requested within 24 hours
            managerPinRequired: true,
            requireReason: true,
            maxPartialRefunds: 3
        };
    }

    /**
     * Request a void or refund
     * @param {Object} params - Request parameters
     * @param {string} params.requestType - 'VOID' or 'REFUND'
     * @param {number} params.orderId - Order ID
     * @param {number} [params.itemId] - Item ID (for partial voids/refunds)
     * @param {number} [params.paymentId] - Payment ID (for refunds)
     * @param {string} params.reasonCode - Reason code
     * @param {string} [params.reasonDetails] - Additional details
     * @param {number} params.requestedBy - User ID
     * @param {number} [params.quantity] - Quantity for partial voids
     * @param {number} [params.amount] - Amount for partial refunds
     * @param {string} [params.notes] - Additional notes
     * @returns {Promise<Object>} - Request result
     */
    async requestVoidRefund(params) {
        try {
            // Validate request
            this._validateRequest(params);

            // Check time limits for voids
            if (params.requestType === 'VOID') {
                await this._checkVoidTimeLimit(params.orderId);
            }

            // Check if order/item is already voided/refunded
            const isAlreadyVoided = await this._checkAlreadyVoided(params);
            if (isAlreadyVoided) {
                throw new Error('Order or item is already voided/refunded');
            }

            // Calculate amount for refunds
            let amount = params.amount;
            if (params.requestType === 'REFUND' && !amount) {
                amount = await this._calculateRefundAmount(params);
            }

            // Insert request into database
            const requestId = await this.db.run(
                `INSERT INTO void_refund_requests 
                 (order_id, item_id, payment_id, request_type, status, reason_code, 
                  reason_details, requested_by, requested_at, amount, quantity, 
                  is_partial, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    params.orderId,
                    params.itemId || null,
                    params.paymentId || null,
                    params.requestType,
                    params.requestType === 'VOID' ? 'PENDING' : 'PENDING',
                    params.reasonCode,
                    params.reasonDetails || '',
                    params.requestedBy,
                    new Date().toISOString(),
                    amount,
                    params.quantity || 1,
                    params.itemId || params.paymentId ? 1 : 0,
                    params.notes || ''
                ]
            );

            // Log audit trail
            await this._logAuditAction({
                requestId: requestId,
                orderId: params.orderId,
                action: 'REQUEST_VOID_REFUND',
                actionBy: params.requestedBy,
                statusBefore: 'ACTIVE',
                statusAfter: 'PENDING',
                notes: `Void/Refund requested: ${params.requestType} - ${params.reasonCode}`
            });

            return {
                success: true,
                requestId: requestId,
                message: 'Void/Refund request created successfully',
                requiresApproval: params.requestType === 'REFUND' || (params.requestType === 'VOID' && params.itemId)
            };
        } catch (error) {
            this.logger.error('Error requesting void/refund:', error);
            throw error;
        }
    }

    /**
     * Approve or reject a void/refund request
     * @param {Object} params - Approval parameters
     * @param {number} params.requestId - Request ID
     * @param {boolean} params.approvalStatus - true for approve, false for reject
     * @param {number} params.approvedBy - User ID
     * @param {string} [params.comments] - Approval comments
     * @returns {Promise<Object>} - Approval result
     */
    async approveVoidRefund(params) {
        try {
            // Get the request details
            const request = await this.db.get(
                'SELECT * FROM void_refund_requests WHERE id = ?',
                [params.requestId]
            );

            if (!request) {
                throw new Error('Void/Refund request not found');
            }

            if (request.status !== 'PENDING') {
                throw new Error('Request is not in pending status');
            }

            // Update request status
            const newStatus = params.approvalStatus ? 'APPROVED' : 'REJECTED';
            await this.db.run(
                'UPDATE void_refund_requests SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?',
                [newStatus, params.approvedBy, new Date().toISOString(), params.requestId]
            );

            // Insert approval record
            await this.db.run(
                'INSERT INTO void_refund_approvals (request_id, approved_by, approval_status, comments, approved_at) VALUES (?, ?, ?, ?, ?)',
                [params.requestId, params.approvedBy, params.approvalStatus, params.comments || '', new Date().toISOString()]
            );

            // Log audit trail
            await this._logAuditAction({
                requestId: params.requestId,
                orderId: request.order_id,
                action: params.approvalStatus ? 'APPROVE_VOID_REFUND' : 'REJECT_VOID_REFUND',
                actionBy: params.approvedBy,
                statusBefore: 'PENDING',
                statusAfter: newStatus,
                notes: params.comments || ''
            });

            return {
                success: true,
                message: `Void/Refund request ${newStatus} successfully`
            };
        } catch (error) {
            this.logger.error('Error approving void/refund:', error);
            throw error;
        }
    }

    /**
     * Process an approved void/refund request
     * @param {Object} params - Processing parameters
     * @param {number} params.requestId - Request ID
     * @param {number} params.processedBy - User ID
     * @returns {Promise<Object>} - Processing result
     */
    async processVoidRefund(params) {
        try {
            // Get the request details
            const request = await this.db.get(
                'SELECT * FROM void_refund_requests WHERE id = ?',
                [params.requestId]
            );

            if (!request) {
                throw new Error('Void/Refund request not found');
            }

            if (request.status !== 'APPROVED') {
                throw new Error('Request must be approved before processing');
            }

            // Get order details
            const order = await this.db.get(
                'SELECT * FROM orders WHERE id = ?',
                [request.order_id]
            );

            if (!order) {
                throw new Error('Order not found');
            }

            // Process based on type
            if (request.request_type === 'VOID') {
                await this._processVoid(request, params.processedBy);
            } else {
                await this._processRefund(request, params.processedBy);
            }

            // Update request status
            await this.db.run(
                'UPDATE void_refund_requests SET status = ?, processed_by = ?, processed_at = ? WHERE id = ?',
                ['PROCESSED', params.processedBy, new Date().toISOString(), params.requestId]
            );

            // Log audit trail
            await this._logAuditAction({
                requestId: params.requestId,
                orderId: request.order_id,
                action: 'PROCESS_VOID_REFUND',
                actionBy: params.processedBy,
                statusBefore: 'APPROVED',
                statusAfter: 'PROCESSED',
                notes: `Void/Refund processed: ${request.request_type}`
            });

            return {
                success: true,
                message: 'Void/Refund processed successfully'
            };
        } catch (error) {
            this.logger.error('Error processing void/refund:', error);
            throw error;
        }
    }

    /**
     * Process a void operation
     * @private
     */
    async _processVoid(request, processedBy) {
        const order = await this.db.get(
            'SELECT * FROM orders WHERE id = ?',
            [request.order_id]
        );

        // Get inventory before changes
        let inventoryBefore = null;
        let inventoryAfter = null;

        if (request.item_id) {
            // Partial void - update specific item
            const item = await this.db.get(
                'SELECT * FROM order_items WHERE id = ?',
                [request.item_id]
            );

            if (!item) {
                throw new Error('Order item not found');
            }

            // Get current inventory
            const inventory = await this.db.get(
                'SELECT quantity FROM inventory WHERE product_id = ?',
                [item.product_id]
            );

            inventoryBefore = inventory ? inventory.quantity : null;

            // Update item status
            await this.db.run(
                'UPDATE order_items SET item_void_status = ?, item_void_reason = ?, item_voided_at = ?, item_voided_by = ? WHERE id = ?',
                [
                    request.is_partial ? 'PARTIALLY_VOIDED' : 'VOIDED',
                    request.reason_code,
                    new Date().toISOString(),
                    processedBy,
                    request.item_id
                ]
            );

            // Reverse inventory
            if (inventory) {
                const newQuantity = inventory.quantity + (request.quantity || item.quantity);
                await this.db.run(
                    'UPDATE inventory SET quantity = ? WHERE product_id = ?',
                    [newQuantity, item.product_id]
                );
                inventoryAfter = newQuantity;
            }

            // Check if all items are voided
            const voidedItems = await this.db.all(
                'SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND item_void_status = ?',
                [request.order_id, 'ACTIVE']
            );

            if (voidedItems.count === 0) {
                // All items voided - mark order as voided
                await this.db.run(
                    'UPDATE orders SET void_status = ?, void_reason = ?, voided_at = ?, voided_by = ? WHERE id = ?',
                    ['VOIDED', request.reason_code, new Date().toISOString(), processedBy, request.order_id]
                );
            } else {
                await this.db.run(
                    'UPDATE orders SET void_status = ? WHERE id = ?',
                    ['PARTIALLY_VOIDED', request.order_id]
                );
            }
        } else {
            // Full order void
            // Get all items in the order
            const items = await this.db.all(
                'SELECT * FROM order_items WHERE order_id = ? AND item_void_status = ?',
                [request.order_id, 'ACTIVE']
            );

            // Update all items
            for (const item of items) {
                const inventory = await this.db.get(
                    'SELECT quantity FROM inventory WHERE product_id = ?',
                    [item.product_id]
                );

                if (inventory) {
                    const newQuantity = inventory.quantity + item.quantity;
                    await this.db.run(
                        'UPDATE inventory SET quantity = ? WHERE product_id = ?',
                        [newQuantity, item.product_id]
                    );
                }

                await this.db.run(
                    'UPDATE order_items SET item_void_status = ?, item_void_reason = ?, item_voided_at = ?, item_voided_by = ? WHERE id = ?',
                    ['VOIDED', request.reason_code, new Date().toISOString(), processedBy, item.id]
                );
            }

            // Mark order as voided
            await this.db.run(
                'UPDATE orders SET void_status = ?, void_reason = ?, voided_at = ?, voided_by = ? WHERE id = ?',
                ['VOIDED', request.reason_code, new Date().toISOString(), processedBy, request.order_id]
            );
        }

        // Log inventory changes
        if (inventoryBefore !== null) {
            await this._logAuditAction({
                requestId: request.id,
                orderId: request.order_id,
                action: 'UPDATE_INVENTORY',
                actionBy: processedBy,
                inventoryBefore: inventoryBefore,
                inventoryAfter: inventoryAfter,
                notes: `Inventory updated for product ${request.item_id ? 'item' : 'all items'}`
            });
        }
    }

    /**
     * Process a refund operation
     * @private
     */
    async _processRefund(request, processedBy) {
        // Update payment status
        await this.db.run(
            'UPDATE payments SET refund_status = ?, refund_reason = ?, refunded_at = ?, refunded_by = ?, refund_amount = ? WHERE id = ?',
            [
                request.is_partial ? 'PARTIALLY_REFUNDED' : 'FULLY_REFUNDED',
                request.reason_code,
                new Date().toISOString(),
                processedBy,
                request.amount,
                request.payment_id
            ]
        );

        // If this is a full refund, mark the order as well
        if (!request.is_partial) {
            await this.db.run(
                'UPDATE orders SET void_status = ? WHERE id = ?',
                ['VOIDED', request.order_id]
            );
        }
    }

    /**
     * Get void/refund reasons
     * @returns {Promise<Array>} - List of reasons
     */
    async getVoidRefundReasons() {
        try {
            return await this.db.all(
                'SELECT * FROM void_refund_reasons WHERE is_active = 1 ORDER BY reason_code'
            );
        } catch (error) {
            this.logger.error('Error getting void/refund reasons:', error);
            throw error;
        }
    }

    /**
     * Get void/refund history for an order
     * @param {number} orderId - Order ID
     * @returns {Promise<Array>} - History records
     */
    async getVoidRefundHistory(orderId) {
        try {
            return await this.db.all(
                `SELECT vr.*, 
                        u1.name as requested_by_name,
                        u2.name as approved_by_name,
                        u3.name as processed_by_name,
                        vrr.reason_description
                 FROM void_refund_requests vr
                 LEFT JOIN users u1 ON vr.requested_by = u1.id
                 LEFT JOIN users u2 ON vr.approved_by = u2.id
                 LEFT JOIN users u3 ON vr.processed_by = u3.id
                 LEFT JOIN void_refund_reasons vrr ON vr.reason_code = vrr.reason_code
                 WHERE vr.order_id = ?
                 ORDER BY vr.requested_at DESC`,
                [orderId]
            );
        } catch (error) {
            this.logger.error('Error getting void/refund history:', error);
            throw error;
        }
    }

    /**
     * Get audit logs for a void/refund request
     * @param {number} requestId - Request ID
     * @returns {Promise<Array>} - Audit log records
     */
    async getAuditLogs(requestId) {
        try {
            return await this.db.all(
                `SELECT val.*, u.name as action_by_name
                 FROM void_refund_audit_logs val
                 LEFT JOIN users u ON val.action_by = u.id
                 WHERE val.request_id = ?
                 ORDER BY val.action_at DESC`,
                [requestId]
            );
        } catch (error) {
            this.logger.error('Error getting audit logs:', error);
            throw error;
        }
    }

    /**
     * Validate a void/refund request
     * @private
     */
    _validateRequest(params) {
        if (!params.requestType || !['VOID', 'REFUND'].includes(params.requestType)) {
            throw new Error('Invalid request type. Must be VOID or REFUND');
        }

        if (!params.orderId || isNaN(params.orderId)) {
            throw new Error('Order ID is required');
        }

        if (this.config.requireReason && !params.reasonCode) {
            throw new Error('Reason code is required');
        }

        if (!params.requestedBy || isNaN(params.requestedBy)) {
            throw new Error('Requested by user ID is required');
        }

        if (params.requestType === 'REFUND' && !params.paymentId) {
            throw new Error('Payment ID is required for refunds');
        }

        if (params.quantity && (params.quantity <= 0 || !Number.isInteger(params.quantity))) {
            throw new Error('Quantity must be a positive integer');
        }

        if (params.amount && (params.amount <= 0 || params.amount > 1000000)) {
            throw new Error('Amount must be a positive number');
        }
    }

    /**
     * Check void time limit
     * @private
     */
    async _checkVoidTimeLimit(orderId) {
        const order = await this.db.get(
            'SELECT created_at FROM orders WHERE id = ?',
            [orderId]
        );

        if (!order) {
            throw new Error('Order not found');
        }

        const orderTime = new Date(order.created_at);
        const currentTime = new Date();
        const timeDiffHours = (currentTime - orderTime) / (1000 * 60 * 60);

        if (timeDiffHours > this.config.voidTimeLimitHours) {
            throw new Error(`Void can only be requested within ${this.config.voidTimeLimitHours} hours of order creation`);
        }
    }

    /**
     * Check if order/item is already voided/refunded
     * @private
     */
    async _checkAlreadyVoided(params) {
        if (params.itemId) {
            // Check specific item
            const item = await this.db.get(
                'SELECT item_void_status FROM order_items WHERE id = ?',
                [params.itemId]
            );

            if (item && item.item_void_status !== 'ACTIVE') {
                return true;
            }
        } else {
            // Check order
            const order = await this.db.get(
                'SELECT void_status FROM orders WHERE id = ?',
                [params.orderId]
            );

            if (order && order.void_status !== 'ACTIVE') {
                return true;
            }

            // Check if all payments are refunded
            const payments = await this.db.all(
                'SELECT refund_status FROM payments WHERE order_id = ?',
                [params.orderId]
            );

            const allRefunded = payments.every(p => 
                p.refund_status === 'FULLY_REFUNDED' || p.refund_status === 'PARTIALLY_REFUNDED'
            );

            if (allRefunded) {
                return true;
            }
        }

        return false;
    }

    /**
     * Calculate refund amount
     * @private
     */
    async _calculateRefundAmount(params) {
        if (params.paymentId) {
            const payment = await this.db.get(
                'SELECT amount FROM payments WHERE id = ?',
                [params.paymentId]
            );

            if (payment) {
                return params.quantity 
                    ? (payment.amount / payment.quantity) * params.quantity
                    : payment.amount;
            }
        }

        return 0;
    }

    /**
     * Log audit action
     * @private
     */
    async _logAuditAction(params) {
        try {
            await this.db.run(
                `INSERT INTO void_refund_audit_logs 
                 (request_id, order_id, action, action_by, action_at, 
                  status_before, status_after, amount_before, amount_after, 
                  quantity_before, quantity_after, inventory_before, inventory_after, 
                  notes, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    params.requestId || null,
                    params.orderId,
                    params.action,
                    params.actionBy,
                    new Date().toISOString(),
                    params.statusBefore || null,
                    params.statusAfter || null,
                    params.amountBefore || null,
                    params.amountAfter || null,
                    params.quantityBefore || null,
                    params.quantityAfter || null,
                    params.inventoryBefore || null,
                    params.inventoryAfter || null,
                    params.notes || '',
                    params.ipAddress || null,
                    params.userAgent || null
                ]
            );
        } catch (error) {
            this.logger.error('Error logging audit action:', error);
            throw error;
        }
    }

    /**
     * Verify manager PIN
     * @param {string} pin - Manager PIN
     * @returns {Promise<Object>} - Verification result
     */
    async verifyManagerPin(pin) {
        try {
            const manager = await this.db.get(
                'SELECT * FROM users WHERE is_manager = 1 AND pin = ?',
                [pin]
            );

            if (manager) {
                return {
                    success: true,
                    userId: manager.id,
                    username: manager.name
                };
            }

            return {
                success: false,
                message: 'Invalid manager PIN'
            };
        } catch (error) {
            this.logger.error('Error verifying manager PIN:', error);
            throw error;
        }
    }

    /**
     * Get pending void/refund requests
     * @returns {Promise<Array>} - Pending requests
     */
    async getPendingRequests() {
        try {
            return await this.db.all(
                `SELECT vr.*, 
                        o.order_number,
                        u.name as requested_by_name,
                        vrr.reason_description
                 FROM void_refund_requests vr
                 JOIN orders o ON vr.order_id = o.id
                 LEFT JOIN users u ON vr.requested_by = u.id
                 LEFT JOIN void_refund_reasons vrr ON vr.reason_code = vrr.reason_code
                 WHERE vr.status = 'PENDING'
                 ORDER BY vr.requested_at DESC`
            );
        } catch (error) {
            this.logger.error('Error getting pending requests:', error);
            throw error;
        }
    }
}

module.exports = VoidRefundManager;
