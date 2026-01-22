/**
 * Online Order Manager
 * 
 * Handles all operations related to online orders including:
 * - Receiving and processing orders from third-party platforms
 * - Validating incoming orders
 * - Creating orders in the POS system
 * - Updating order statuses
 * - Managing webhook events
 * - Preventing duplicate orders
 * - Generating KOT for online orders
 */

const Database = require('./database').Database;
const Logger = require('./logger').Logger;
const KDSManager = require('./kds-manager').KDSManager;
const OrderManager = require('./order-manager').OrderManager;
const utils = require('./utils');

class OnlineOrderManager {
    constructor() {
        this.db = new Database();
        this.logger = new Logger('OnlineOrderManager');
        this.kdsManager = new KDSManager();
        this.orderManager = new OrderManager();
    }

    /**
     * Process an incoming online order from a webhook
     * @param {Object} orderData - The order data from the provider
     * @param {number} providerId - The ID of the online order provider
     * @param {string} externalOrderId - The external order ID from the provider
     * @returns {Promise<Object>} - Result of processing
     */
    async processIncomingOrder(orderData, providerId, externalOrderId) {
        try {
            this.logger.info(`Processing incoming online order: ${externalOrderId}`);

            // Check for duplicate order
            const existingOrder = await this.checkDuplicateOrder(externalOrderId, providerId);
            if (existingOrder) {
                this.logger.warn(`Duplicate order detected: ${externalOrderId}`);
                return {
                    success: false,
                    error: 'DUPLICATE_ORDER',
                    message: 'Order already exists in the system',
                    orderId: existingOrder.id
                };
            }

            // Validate the order data
            const validation = await this.validateOrderData(orderData, providerId);
            if (!validation.valid) {
                this.logger.error(`Order validation failed: ${validation.errors.join(', ')}`);
                return {
                    success: false,
                    error: 'VALIDATION_FAILED',
                    message: 'Order data validation failed',
                    errors: validation.errors
                };
            }

            // Create the order in the POS system
            const orderResult = await this.createPosOrderFromOnlineOrder(orderData, providerId, externalOrderId);
            if (!orderResult.success) {
                this.logger.error(`Failed to create POS order: ${orderResult.message}`);
                return {
                    success: false,
                    error: 'ORDER_CREATION_FAILED',
                    message: orderResult.message
                };
            }

            // Record the order history
            await this.recordOrderHistory(
                orderResult.orderId,
                providerId,
                externalOrderId,
                'order_created',
                orderData
            );

            // Generate KOT for the order
            await this.generateKotForOnlineOrder(orderResult.orderId, orderData, providerId);

            this.logger.info(`Successfully processed online order ${externalOrderId}, created POS order ${orderResult.orderId}`);

            return {
                success: true,
                orderId: orderResult.orderId,
                externalOrderId: externalOrderId,
                message: 'Order processed successfully'
            };
        } catch (error) {
            this.logger.error(`Error processing incoming order: ${error.message}`);
            this.logger.error(error.stack);
            return {
                success: false,
                error: 'PROCESSING_ERROR',
                message: error.message
            };
        }
    }

    /**
     * Check for duplicate orders
     * @param {string} externalOrderId - The external order ID
     * @param {number} providerId - The provider ID
     * @returns {Promise<Object|null>} - Existing order or null
     */
    async checkDuplicateOrder(externalOrderId, providerId) {
        try {
            const query = `
                SELECT id, online_order_external_id, status 
                FROM orders 
                WHERE online_order_external_id = ? 
                AND online_order_provider_id = ?
                LIMIT 1
            `;
            const params = [externalOrderId, providerId];
            const result = await this.db.query(query, params);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            this.logger.error(`Error checking duplicate order: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate incoming order data
     * @param {Object} orderData - The order data to validate
     * @param {number} providerId - The provider ID
     * @returns {Promise<Object>} - Validation result
     */
    async validateOrderData(orderData, providerId) {
        const errors = [];

        // Basic validation
        if (!orderData || typeof orderData !== 'object') {
            errors.push('Invalid order data format');
            return { valid: false, errors };
        }

        if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
            errors.push('No items in order');
        }

        // Validate items
        for (const item of orderData.items) {
            if (!item.product_id || !item.product_name) {
                errors.push('Item missing product information');
                break;
            }
            if (item.quantity && (item.quantity <= 0 || !Number.isInteger(item.quantity))) {
                errors.push('Item has invalid quantity');
                break;
            }
        }

        // Validate customer information if present
        if (orderData.customer && orderData.customer.phone) {
            if (!utils.validatePhoneNumber(orderData.customer.phone)) {
                errors.push('Invalid customer phone number');
            }
        }

        // Validate provider-specific requirements
        const provider = await this.getProviderById(providerId);
        if (provider && provider.minimum_order_value && orderData.total_amount < provider.minimum_order_value) {
            errors.push(`Order amount below minimum (${provider.minimum_order_value})`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Create a POS order from an online order
     * @param {Object} orderData - The online order data
     * @param {number} providerId - The provider ID
     * @param {string} externalOrderId - The external order ID
     * @returns {Promise<Object>} - Result of order creation
     */
    async createPosOrderFromOnlineOrder(orderData, providerId, externalOrderId) {
        try {
            const now = new Date();
            const customerName = orderData.customer?.name || 'Online Customer';
            const customerPhone = orderData.customer?.phone || null;
            const customerEmail = orderData.customer?.email || null;
            const deliveryAddress = orderData.delivery_address || null;
            const instructions = orderData.instructions || null;
            const paymentMethod = orderData.payment_method || 'online';
            const expectedDeliveryTime = orderData.expected_delivery_time ? new Date(orderData.expected_delivery_time) : null;

            // Start a transaction
            await this.db.beginTransaction();

            // Create the order
            const orderQuery = `
                INSERT INTO orders (
                    order_number,
                    status,
                    total_amount,
                    tax_amount,
                    discount_amount,
                    subtotal_amount,
                    customer_id,
                    customer_name,
                    customer_phone,
                    customer_email,
                    table_id,
                    created_at,
                    updated_at,
                    online_order_provider_id,
                    online_order_external_id,
                    online_order_customer_name,
                    online_order_customer_phone,
                    online_order_customer_email,
                    online_order_delivery_address,
                    online_order_instructions,
                    online_order_payment_method,
                    online_order_expected_delivery_time,
                    online_order_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const orderParams = [
                await this.generateOrderNumber(),
                'pending',
                orderData.total_amount || 0,
                orderData.tax_amount || 0,
                orderData.discount_amount || 0,
                orderData.subtotal_amount || 0,
                null, // customer_id (we'll create a guest customer if needed)
                customerName,
                customerPhone,
                customerEmail,
                null, // table_id
                now,
                now,
                providerId,
                externalOrderId,
                customerName,
                customerPhone,
                customerEmail,
                deliveryAddress,
                instructions,
                paymentMethod,
                expectedDeliveryTime,
                orderData.status || 'pending'
            ];

            const orderResult = await this.db.query(orderQuery, orderParams);
            const orderId = orderResult.lastID;

            // Create order items
            for (const item of orderData.items) {
                const itemQuery = `
                    INSERT INTO order_items (
                        order_id,
                        product_id,
                        product_name,
                        quantity,
                        unit_price,
                        total_price,
                        tax_amount,
                        discount_amount,
                        status,
                        created_at,
                        updated_at,
                        online_order_item_id,
                        online_order_preparation_notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const itemParams = [
                    orderId,
                    item.product_id,
                    item.product_name,
                    item.quantity || 1,
                    item.unit_price || 0,
                    item.total_price || 0,
                    item.tax_amount || 0,
                    item.discount_amount || 0,
                    'pending',
                    now,
                    now,
                    item.item_id || null,
                    item.preparation_notes || null
                ];

                await this.db.query(itemQuery, itemParams);
            }

            // Commit the transaction
            await this.db.commitTransaction();

            return {
                success: true,
                orderId: orderId,
                message: 'Order created successfully'
            };
        } catch (error) {
            await this.db.rollbackTransaction();
            this.logger.error(`Error creating POS order: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate a unique order number
     * @returns {Promise<string>} - Generated order number
     */
    async generateOrderNumber() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const countQuery = 'SELECT COUNT(*) as count FROM orders WHERE created_at >= DATE(?)';
        const countResult = await this.db.query(countQuery, [dateStr]);
        const count = countResult.rows[0].count + 1;
        return `ON-${dateStr}-${count.toString().padStart(4, '0')}`;
    }

    /**
     * Generate KOT (Kitchen Order Ticket) for an online order
     * @param {number} orderId - The POS order ID
     * @param {Object} orderData - The online order data
     * @param {number} providerId - The provider ID
     */
    async generateKotForOnlineOrder(orderId, orderData, providerId) {
        try {
            const provider = await this.getProviderById(providerId);
            const order = await this.getOrderById(orderId);

            if (!order) {
                this.logger.warn(`Order ${orderId} not found for KOT generation`);
                return;
            }

            const kotData = {
                orderId: orderId,
                orderNumber: order.order_number,
                items: orderData.items || [],
                customerName: orderData.customer?.name || 'Online Customer',
                customerPhone: orderData.customer?.phone || '',
                deliveryAddress: orderData.delivery_address || '',
                instructions: orderData.instructions || '',
                isOnlineOrder: true,
                onlineOrderSource: provider ? provider.display_name : 'Online',
                externalOrderId: orderData.external_order_id || order.online_order_external_id,
                createdAt: new Date()
            };

            await this.kdsManager.sendToKDS(kotData);
            this.logger.info(`KOT generated for online order ${orderId}`);
        } catch (error) {
            this.logger.error(`Error generating KOT for online order: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update order status for an online order
     * @param {number} orderId - The POS order ID
     * @param {string} status - The new status
     * @param {number} providerId - The provider ID
     * @param {string} externalOrderId - The external order ID
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} - Result of status update
     */
    async updateOrderStatus(orderId, status, providerId, externalOrderId, metadata = {}) {
        try {
            // Update the order status in the database
            const updateQuery = `
                UPDATE orders 
                SET 
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP,
                    online_order_status = ?
                WHERE id = ?
            `;

            const updateParams = [status, status, orderId];
            await this.db.query(updateQuery, updateParams);

            // Record the status update in history
            await this.recordOrderHistory(
                orderId,
                providerId,
                externalOrderId,
                `order_${status}`,
                metadata
            );

            // Handle status-specific actions
            switch (status) {
                case 'accepted':
                    await this.handleOrderAccepted(orderId, providerId, externalOrderId);
                    break;
                case 'completed':
                    await this.handleOrderCompleted(orderId, providerId, externalOrderId);
                    break;
                case 'cancelled':
                    await this.handleOrderCancelled(orderId, providerId, externalOrderId);
                    break;
                case 'rejected':
                    await this.handleOrderRejected(orderId, providerId, externalOrderId);
                    break;
            }

            return {
                success: true,
                message: `Order status updated to ${status}`
            };
        } catch (error) {
            this.logger.error(`Error updating order status: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle order accepted event
     * @param {number} orderId - The order ID
     * @param {number} providerId - The provider ID
     * @param {string} externalOrderId - The external order ID
     */
    async handleOrderAccepted(orderId, providerId, externalOrderId) {
        try {
            const now = new Date();
            const updateQuery = `
                UPDATE orders 
                SET 
                    online_order_accepted_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            await this.db.query(updateQuery, [now, orderId]);
            this.logger.info(`Order ${orderId} accepted for online order ${externalOrderId}`);
        } catch (error) {
            this.logger.error(`Error handling order accepted: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle order completed event
     * @param {number} orderId - The order ID
     * @param {number} providerId - The provider ID
     * @param {string} externalOrderId - The external order ID
     */
    async handleOrderCompleted(orderId, providerId, externalOrderId) {
        try {
            const now = new Date();
            const updateQuery = `
                UPDATE orders 
                SET 
                    online_order_completed_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            await this.db.query(updateQuery, [now, orderId]);
            this.logger.info(`Order ${orderId} completed for online order ${externalOrderId}`);
        } catch (error) {
            this.logger.error(`Error handling order completed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle order cancelled event
     * @param {number} orderId - The order ID
     * @param {number} providerId - The provider ID
     * @param {string} externalOrderId - The external order ID
     */
    async handleOrderCancelled(orderId, providerId, externalOrderId) {
        try {
            const now = new Date();
            const updateQuery = `
                UPDATE orders 
                SET 
                    status = 'cancelled',
                    online_order_cancelled_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            await this.db.query(updateQuery, [now, orderId]);
            this.logger.info(`Order ${orderId} cancelled for online order ${externalOrderId}`);
        } catch (error) {
            this.logger.error(`Error handling order cancelled: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle order rejected event
     * @param {number} orderId - The order ID
     * @param {number} providerId - The provider ID
     * @param {string} externalOrderId - The external order ID
     */
    async handleOrderRejected(orderId, providerId, externalOrderId) {
        try {
            const now = new Date();
            const updateQuery = `
                UPDATE orders 
                SET 
                    status = 'rejected',
                    online_order_rejected_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            await this.db.query(updateQuery, [now, orderId]);
            this.logger.info(`Order ${orderId} rejected for online order ${externalOrderId}`);
        } catch (error) {
            this.logger.error(`Error handling order rejected: ${error.message}`);
            throw error;
        }
    }

    /**
     * Record order history
     * @param {number} orderId - The order ID
     * @param {number} providerId - The provider ID
     * @param {string} externalOrderId - The external order ID
     * @param {string} eventType - The event type
     * @param {Object} payload - The payload/data for the event
     * @param {Object} metadata - Additional metadata
     */
    async recordOrderHistory(orderId, providerId, externalOrderId, eventType, payload, metadata = {}) {
        try {
            const insertQuery = `
                INSERT INTO online_order_history (
                    order_id,
                    provider_id,
                    provider_order_id,
                    event_type,
                    status,
                    payload,
                    metadata,
                    created_at,
                    is_processed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
            `;

            const params = [
                orderId,
                providerId,
                externalOrderId,
                eventType,
                payload?.status || null,
                JSON.stringify(payload),
                JSON.stringify(metadata)
            ];

            await this.db.query(insertQuery, params);
        } catch (error) {
            this.logger.error(`Error recording order history: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get provider by ID
     * @param {number} providerId - The provider ID
     * @returns {Promise<Object|null>} - Provider data or null
     */
    async getProviderById(providerId) {
        try {
            const query = 'SELECT * FROM online_order_providers WHERE id = ? LIMIT 1';
            const result = await this.db.query(query, [providerId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            this.logger.error(`Error getting provider: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get order by ID
     * @param {number} orderId - The order ID
     * @returns {Promise<Object|null>} - Order data or null
     */
    async getOrderById(orderId) {
        try {
            const query = 'SELECT * FROM orders WHERE id = ? LIMIT 1';
            const result = await this.db.query(query, [orderId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            this.logger.error(`Error getting order: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all active online order providers
     * @returns {Promise<Array>} - List of active providers
     */
    async getActiveProviders() {
        try {
            const query = 'SELECT * FROM online_order_providers WHERE is_active = 1 ORDER BY display_name';
            const result = await this.db.query(query);
            return result.rows;
        } catch (error) {
            this.logger.error(`Error getting active providers: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get provider credentials
     * @param {number} providerId - The provider ID
     * @returns {Promise<Object|null>} - Provider credentials or null
     */
    async getProviderCredentials(providerId) {
        try {
            const query = 'SELECT * FROM online_order_credentials WHERE provider_id = ? LIMIT 1';
            const result = await this.db.query(query, [providerId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            this.logger.error(`Error getting provider credentials: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process unprocessed webhook events
     * @param {number} providerId - Optional provider ID to filter by
     * @param {number} limit - Maximum number of events to process
     */
    async processUnprocessedEvents(providerId = null, limit = 100) {
        try {
            let query = `
                SELECT id, order_id, provider_id, provider_order_id, event_type, payload, metadata 
                FROM online_order_history 
                WHERE is_processed = 0
            `;

            const params = [];
            if (providerId) {
                query += ' AND provider_id = ?';
                params.push(providerId);
            }

            query += ' ORDER BY created_at ASC LIMIT ?';
            params.push(limit);

            const result = await this.db.query(query, params);

            for (const event of result.rows) {
                try {
                    await this.processEvent(event);
                    await this.markEventAsProcessed(event.id);
                } catch (error) {
                    this.logger.error(`Error processing event ${event.id}: ${error.message}`);
                    await this.incrementEventRetryCount(event.id);
                }
            }

            return {
                success: true,
                processedCount: result.rows.length
            };
        } catch (error) {
            this.logger.error(`Error processing unprocessed events: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process a single event
     * @param {Object} event - The event to process
     */
    async processEvent(event) {
        try {
            const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
            const metadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;

            switch (event.event_type) {
                case 'order_created':
                    // This should already be handled during webhook processing
                    break;
                case 'order_accepted':
                    await this.updateOrderStatus(
                        event.order_id,
                        'accepted',
                        event.provider_id,
                        event.provider_order_id,
                        metadata
                    );
                    break;
                case 'order_completed':
                    await this.updateOrderStatus(
                        event.order_id,
                        'completed',
                        event.provider_id,
                        event.provider_order_id,
                        metadata
                    );
                    break;
                case 'order_cancelled':
                    await this.updateOrderStatus(
                        event.order_id,
                        'cancelled',
                        event.provider_id,
                        event.provider_order_id,
                        metadata
                    );
                    break;
                case 'order_rejected':
                    await this.updateOrderStatus(
                        event.order_id,
                        'rejected',
                        event.provider_id,
                        event.provider_order_id,
                        metadata
                    );
                    break;
                default:
                    this.logger.warn(`Unknown event type: ${event.event_type}`);
            }
        } catch (error) {
            this.logger.error(`Error processing event ${event.id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Mark event as processed
     * @param {number} eventId - The event ID
     */
    async markEventAsProcessed(eventId) {
        try {
            const query = `
                UPDATE online_order_history 
                SET is_processed = 1, processed_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;
            await this.db.query(query, [eventId]);
        } catch (error) {
            this.logger.error(`Error marking event as processed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Increment event retry count
     * @param {number} eventId - The event ID
     */
    async incrementEventRetryCount(eventId) {
        try {
            const query = `
                UPDATE online_order_history 
                SET retry_count = retry_count + 1, 
                    error_message = COALESCE(error_message, ''), 
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;
            await this.db.query(query, [eventId]);
        } catch (error) {
            this.logger.error(`Error incrementing retry count: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get online order statistics
     * @param {Object} filters - Filter parameters
     * @returns {Promise<Object>} - Statistics
     */
    async getStatistics(filters = {}) {
        try {
            const { providerId, startDate, endDate } = filters;

            let query = `
                SELECT 
                    COUNT(DISTINCT o.id) as total_orders,
                    SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                    SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
                    SUM(CASE WHEN o.status = 'rejected' THEN 1 ELSE 0 END) as rejected_orders,
                    SUM(o.total_amount) as total_revenue,
                    AVG(o.total_amount) as avg_order_value,
                    MIN(o.created_at) as first_order_date,
                    MAX(o.created_at) as last_order_date
                FROM orders o
                WHERE o.online_order_external_id IS NOT NULL
            `;

            const params = [];
            if (providerId) {
                query += ' AND o.online_order_provider_id = ?';
                params.push(providerId);
            }
            if (startDate) {
                query += ' AND o.created_at >= ?';
                params.push(startDate);
            }
            if (endDate) {
                query += ' AND o.created_at <= ?';
                params.push(endDate);
            }

            const result = await this.db.query(query, params);
            return result.rows[0] || {
                total_orders: 0,
                completed_orders: 0,
                cancelled_orders: 0,
                rejected_orders: 0,
                total_revenue: 0,
                avg_order_value: 0
            };
        } catch (error) {
            this.logger.error(`Error getting statistics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Search online orders
     * @param {Object} criteria - Search criteria
     * @returns {Promise<Array>} - List of orders
     */
    async searchOrders(criteria = {}) {
        try {
            const {
                providerId,
                status,
                externalOrderId,
                customerName,
                customerPhone,
                dateFrom,
                dateTo,
                limit = 100,
                offset = 0
            } = criteria;

            let query = `
                SELECT 
                    o.id,
                    o.order_number,
                    o.status,
                    o.total_amount,
                    o.created_at,
                    o.online_order_external_id,
                    o.online_order_status,
                    o.online_order_customer_name,
                    o.online_order_customer_phone,
                    o.online_order_customer_email,
                    o.online_order_delivery_address,
                    o.online_order_expected_delivery_time,
                    o.online_order_accepted_at,
                    o.online_order_completed_at,
                    o.online_order_cancelled_at,
                    oop.id as provider_id,
                    oop.name as provider_name,
                    oop.display_name as provider_display_name
                FROM orders o
                LEFT JOIN online_order_providers oop ON o.online_order_provider_id = oop.id
                WHERE o.online_order_external_id IS NOT NULL
            `;

            const params = [];
            if (providerId) {
                query += ' AND o.online_order_provider_id = ?';
                params.push(providerId);
            }
            if (status) {
                query += ' AND o.status = ?';
                params.push(status);
            }
            if (externalOrderId) {
                query += ' AND o.online_order_external_id LIKE ?';
                params.push(`%${externalOrderId}%`);
            }
            if (customerName) {
                query += ' AND o.online_order_customer_name LIKE ?';
                params.push(`%${customerName}%`);
            }
            if (customerPhone) {
                query += ' AND o.online_order_customer_phone LIKE ?';
                params.push(`%${customerPhone}%`);
            }
            if (dateFrom) {
                query += ' AND o.created_at >= ?';
                params.push(dateFrom);
            }
            if (dateTo) {
                query += ' AND o.created_at <= ?';
                params.push(dateTo);
            }

            query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const result = await this.db.query(query, params);
            return result.rows;
        } catch (error) {
            this.logger.error(`Error searching orders: ${error.message}`);
            throw error;
        }
    }
}

module.exports = {
    OnlineOrderManager
};
