/**
 * Kitchen Display System (KDS) Manager
 * 
 * Handles all KDS operations including:
 * - Order submission to KDS
 * - Order status management
 * - Station management
 * - Real-time updates via WebSocket
 * - Order bumping and reopening
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const database = require('./database');
const KdsSocket = require('./kds-socket');

class KDSManager {
    constructor() {
        this.websocket = null;
        this.stations = {};
        this.statuses = {
            RECEIVED: 'received',
            IN_PROGRESS: 'in-progress',
            READY: 'ready',
            COMPLETED: 'completed',
            CANCELLED: 'cancelled'
        };
        this.priorityStatuses = ['received', 'in-progress'];
        
        // Initialize WebSocket connection
        this.initializeWebSocket();
    }

    /**
     * Initialize WebSocket connection for real-time updates
     */
    initializeWebSocket() {
        try {
            this.websocket = new KdsSocket();
            this.websocket.on('connected', () => {
                logger.info('KDS WebSocket connected');
            });
            
            this.websocket.on('disconnected', () => {
                logger.warn('KDS WebSocket disconnected');
            });
            
            this.websocket.on('error', (error) => {
                logger.error('KDS WebSocket error:', error);
            });
        } catch (error) {
            logger.error('Failed to initialize KDS WebSocket:', error);
        }
    }

    /**
     * Create a new KDS station
     * @param {Object} stationData - Station data
     * @returns {Promise<Object>} Created station
     */
    async createStation(stationData) {
        try {
            const { name, displayName, description, position, isActive } = stationData;
            
            const query = `
                INSERT INTO kds_stations (name, display_name, description, position, is_active)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            const result = await database.run(query, [
                name,
                displayName,
                description || null,
                position || 0,
                isActive !== undefined ? isActive : 1
            ]);
            
            const station = await this.getStationById(result.lastID);
            this.stations[station.station_id] = station;
            
            // Broadcast station creation
            if (this.websocket) {
                this.websocket.broadcast('station:created', station);
            }
            
            return station;
        } catch (error) {
            logger.error('Error creating KDS station:', error);
            throw error;
        }
    }

    /**
     * Get all KDS stations
     * @returns {Promise<Array>} Array of stations
     */
    async getAllStations() {
        try {
            const query = `
                SELECT * FROM kds_stations
                ORDER BY position ASC, display_name ASC
            `;
            
            const stations = await database.all(query);
            this.stations = {};
            stations.forEach(station => {
                this.stations[station.station_id] = station;
            });
            
            return stations;
        } catch (error) {
            logger.error('Error fetching KDS stations:', error);
            throw error;
        }
    }

    /**
     * Get station by ID
     * @param {number} stationId - Station ID
     * @returns {Promise<Object>} Station data
     */
    async getStationById(stationId) {
        try {
            const query = 'SELECT * FROM kds_stations WHERE station_id = ?';
            const station = await database.get(query, [stationId]);
            return station;
        } catch (error) {
            logger.error(`Error fetching station ${stationId}:`, error);
            throw error;
        }
    }

    /**
     * Update KDS station
     * @param {number} stationId - Station ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated station
     */
    async updateStation(stationId, updates) {
        try {
            const { name, displayName, description, position, isActive } = updates;
            
            const fields = [];
            const values = [];
            
            if (name !== undefined) {
                fields.push('name = ?');
                values.push(name);
            }
            if (displayName !== undefined) {
                fields.push('display_name = ?');
                values.push(displayName);
            }
            if (description !== undefined) {
                fields.push('description = ?');
                values.push(description);
            }
            if (position !== undefined) {
                fields.push('position = ?');
                values.push(position);
            }
            if (isActive !== undefined) {
                fields.push('is_active = ?');
                values.push(isActive ? 1 : 0);
            }
            
            if (fields.length === 0) {
                throw new Error('No fields to update');
            }
            
            fields.push('updated_at = CURRENT_TIMESTAMP');
            
            const query = `
                UPDATE kds_stations
                SET ${fields.join(', ')}
                WHERE station_id = ?
            `;
            
            values.push(stationId);
            
            await database.run(query, values);
            const updatedStation = await this.getStationById(stationId);
            this.stations[stationId] = updatedStation;
            
            // Broadcast station update
            if (this.websocket) {
                this.websocket.broadcast('station:updated', updatedStation);
            }
            
            return updatedStation;
        } catch (error) {
            logger.error(`Error updating station ${stationId}:`, error);
            throw error;
        }
    }

    /**
     * Delete KDS station
     * @param {number} stationId - Station ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteStation(stationId) {
        try {
            // Check if station has active orders
            const activeOrdersQuery = `
                SELECT COUNT(*) as count FROM kds_order_items
                WHERE station_id = ? AND status NOT IN ('completed', 'cancelled')
            `;
            
            const result = await database.get(activeOrdersQuery, [stationId]);
            if (result.count > 0) {
                throw new Error('Cannot delete station with active orders');
            }
            
            const query = 'DELETE FROM kds_stations WHERE station_id = ?';
            await database.run(query, [stationId]);
            
            delete this.stations[stationId];
            
            // Broadcast station deletion
            if (this.websocket) {
                this.websocket.broadcast('station:deleted', { stationId });
            }
            
            return true;
        } catch (error) {
            logger.error(`Error deleting station ${stationId}:`, error);
            throw error;
        }
    }

    /**
     * Submit order to KDS
     * @param {Object} orderData - Order data
     * @returns {Promise<Object>} KDS order
     */
    async submitOrderToKDS(orderData) {
        try {
            const {
                orderId,
                tableId,
                customerName,
                orderType,
                items,
                priority,
                notes
            } = orderData;
            
            // Start transaction
            await database.run('BEGIN TRANSACTION');
            
            // Create KDS order
            const orderQuery = `
                INSERT INTO kds_orders (
                    order_id, table_id, customer_name, order_type, 
                    priority, notes, status, estimated_prep_time
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const estimatedPrepTime = this.calculateEstimatedPrepTime(items);
            
            await database.run(orderQuery, [
                orderId,
                tableId || null,
                customerName || null,
                orderType || 'dine_in',
                priority || 0,
                notes || null,
                'received',
                estimatedPrepTime
            ]);
            
            const kdsOrderId = database.lastID;
            
            // Create KDS order items
            for (const item of items) {
                const { orderItemId, productId, productName, quantity, stationId, notes } = item;
                
                if (!stationId) {
                    // Auto-assign station based on product
                    const assignedStation = await this.getStationForProduct(productId);
                    if (!assignedStation) {
                        logger.warn(`No station assigned for product ${productId}, skipping item`);
                        continue;
                    }
                }
                
                const itemQuery = `
                    INSERT INTO kds_order_items (
                        kds_order_id, order_item_id, station_id, 
                        product_id, product_name, quantity, status, notes
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                await database.run(itemQuery, [
                    kdsOrderId,
                    orderItemId,
                    stationId || assignedStation.station_id,
                    productId,
                    productName,
                    quantity || 1,
                    'received',
                    notes || null
                ]);
            }
            
            // Update original order with KDS reference
            const updateOrderQuery = `
                UPDATE orders
                SET kds_order_id = ?, kds_status = 'received', kds_sent_at = CURRENT_TIMESTAMP
                WHERE order_id = ?
            `;
            
            await database.run(updateOrderQuery, [kdsOrderId, orderId]);
            
            // Commit transaction
            await database.run('COMMIT');
            
            // Get the created order
            const kdsOrder = await this.getKDSOrderById(kdsOrderId);
            
            // Broadcast order creation
            if (this.websocket) {
                this.websocket.broadcast('order:created', kdsOrder);
            }
            
            logger.info(`Order ${orderId} submitted to KDS`);
            
            return kdsOrder;
        } catch (error) {
            await database.run('ROLLBACK');
            logger.error('Error submitting order to KDS:', error);
            throw error;
        }
    }

    /**
     * Get KDS order by ID
     * @param {number} kdsOrderId - KDS Order ID
     * @returns {Promise<Object>} KDS order with items
     */
    async getKDSOrderById(kdsOrderId) {
        try {
            // Get order details
            const orderQuery = `
                SELECT ko.*, o.table_name, o.table_number
                FROM kds_orders ko
                LEFT JOIN orders o ON ko.order_id = o.order_id
                WHERE ko.kds_order_id = ?
            `;
            
            const order = await database.get(orderQuery, [kdsOrderId]);
            if (!order) {
                throw new Error('KDS order not found');
            }
            
            // Get order items
            const itemsQuery = `
                SELECT 
                    koi.*, 
                    ks.name as station_name,
                    ks.display_name as station_display_name
                FROM kds_order_items koi
                LEFT JOIN kds_stations ks ON koi.station_id = ks.station_id
                WHERE koi.kds_order_id = ?
                ORDER BY ks.position ASC, koi.created_at ASC
            `;
            
            const items = await database.all(itemsQuery, [kdsOrderId]);
            order.items = items;
            
            return order;
        } catch (error) {
            logger.error(`Error fetching KDS order ${kdsOrderId}:`, error);
            throw error;
        }
    }

    /**
     * Get all KDS orders with filtering
     * @param {Object} filters - Filter parameters
     * @returns {Promise<Array>} Array of KDS orders
     */
    async getAllKDSOrders(filters = {}) {
        try {
            const { status, stationId, priorityOnly, limit } = filters;
            
            let query = `
                SELECT 
                    ko.*, 
                    o.table_name, 
                    o.table_number,
                    COUNT(koi.kds_item_id) as item_count,
                    SUM(CASE WHEN koi.status = 'received' THEN 1 ELSE 0 END) as received_count,
                    SUM(CASE WHEN koi.status = 'in-progress' THEN 1 ELSE 0 END) as in_progress_count,
                    SUM(CASE WHEN koi.status = 'ready' THEN 1 ELSE 0 END) as ready_count
                FROM kds_orders ko
                LEFT JOIN orders o ON ko.order_id = o.order_id
                LEFT JOIN kds_order_items koi ON ko.kds_order_id = koi.kds_order_id
            `;
            
            const params = [];
            let whereClauses = [];
            
            if (status) {
                whereClauses.push('ko.status = ?');
                params.push(status);
            }
            
            if (stationId) {
                whereClauses.push('koi.station_id = ?');
                params.push(stationId);
            }
            
            if (priorityOnly) {
                whereClauses.push('ko.priority = 1');
            }
            
            if (whereClauses.length > 0) {
                query += ' WHERE ' + whereClauses.join(' AND ');
            }
            
            query += ' GROUP BY ko.kds_order_id ORDER BY ko.created_at DESC';
            
            if (limit) {
                query += ' LIMIT ?';
                params.push(limit);
            }
            
            const orders = await database.all(query, params);
            
            // Get items for each order
            for (const order of orders) {
                const itemsQuery = `
                    SELECT 
                        koi.*, 
                        ks.name as station_name,
                        ks.display_name as station_display_name
                    FROM kds_order_items koi
                    LEFT JOIN kds_stations ks ON koi.station_id = ks.station_id
                    WHERE koi.kds_order_id = ?
                    ORDER BY ks.position ASC, koi.created_at ASC
                `;
                
                const items = await database.all(itemsQuery, [order.kds_order_id]);
                order.items = items;
            }
            
            return orders;
        } catch (error) {
            logger.error('Error fetching KDS orders:', error);
            throw error;
        }
    }

    /**
     * Update order status
     * @param {number} kdsOrderId - KDS Order ID
     * @param {string} status - New status
     * @param {string} changedBy - Who made the change
     * @param {string} changeReason - Reason for change
     * @returns {Promise<Object>} Updated order
     */
    async updateOrderStatus(kdsOrderId, status, changedBy, changeReason) {
        try {
            // Get current order
            const currentOrder = await this.getKDSOrderById(kdsOrderId);
            const oldStatus = currentOrder.status;
            
            if (oldStatus === status) {
                return currentOrder; // No change needed
            }
            
            // Validate status transition
            this.validateStatusTransition(oldStatus, status);
            
            // Update order status
            const query = `
                UPDATE kds_orders
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE kds_order_id = ?
            `;
            
            await database.run(query, [status, kdsOrderId]);
            
            // Record status history
            await this.recordStatusChange(kdsOrderId, null, oldStatus, status, changedBy, changeReason);
            
            // If order is completed, update completion time
            if (status === 'completed') {
                await database.run(
                    'UPDATE kds_orders SET kds_completed_at = CURRENT_TIMESTAMP WHERE kds_order_id = ?',
                    [kdsOrderId]
                );
                
                // Update original order
                const orderId = currentOrder.order_id;
                await database.run(
                    'UPDATE orders SET kds_status = ?, kds_completed_at = CURRENT_TIMESTAMP WHERE order_id = ?',
                    [status, orderId]
                );
            }
            
            // Get updated order
            const updatedOrder = await this.getKDSOrderById(kdsOrderId);
            
            // Broadcast status update
            if (this.websocket) {
                this.websocket.broadcast('order:status-updated', {
                    kdsOrderId,
                    oldStatus,
                    newStatus: status,
                    order: updatedOrder
                });
            }
            
            return updatedOrder;
        } catch (error) {
            logger.error(`Error updating order status ${kdsOrderId}:`, error);
            throw error;
        }
    }

    /**
     * Update item status
     * @param {number} kdsItemId - KDS Item ID
     * @param {string} status - New status
     * @param {string} changedBy - Who made the change
     * @param {string} changeReason - Reason for change
     * @returns {Promise<Object>} Updated item
     */
    async updateItemStatus(kdsItemId, status, changedBy, changeReason) {
        try {
            // Get current item
            const currentItem = await this.getKDSItemById(kdsItemId);
            const oldStatus = currentItem.status;
            
            if (oldStatus === status) {
                return currentItem; // No change needed
            }
            
            // Validate status transition
            this.validateStatusTransition(oldStatus, status);
            
            // Update item status
            const query = `
                UPDATE kds_order_items
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE kds_item_id = ?
            `;
            
            await database.run(query, [status, kdsItemId]);
            
            // Record status history
            await this.recordStatusChange(null, kdsItemId, oldStatus, status, changedBy, changeReason);
            
            // If item is completed, check if all items in order are completed
            if (status === 'completed') {
                const kdsOrderId = currentItem.kds_order_id;
                const allCompleted = await this.checkAllItemsCompleted(kdsOrderId);
                
                if (allCompleted) {
                    // Update order status to completed
                    await this.updateOrderStatus(kdsOrderId, 'completed', changedBy, changeReason);
                }
            }
            
            // Get updated item
            const updatedItem = await this.getKDSItemById(kdsItemId);
            
            // Broadcast item status update
            if (this.websocket) {
                this.websocket.broadcast('item:status-updated', {
                    kdsItemId,
                    oldStatus,
                    newStatus: status,
                    item: updatedItem
                });
            }
            
            return updatedItem;
        } catch (error) {
            logger.error(`Error updating item status ${kdsItemId}:`, error);
            throw error;
        }
    }

    /**
     * Bulk update item statuses
     * @param {Array} updates - Array of {kdsItemId, status} objects
     * @param {string} changedBy - Who made the changes
     * @param {string} changeReason - Reason for changes
     * @returns {Promise<Array>} Updated items
     */
    async bulkUpdateItemStatuses(updates, changedBy, changeReason) {
        try {
            const results = [];
            
            for (const update of updates) {
                const { kdsItemId, status } = update;
                const result = await this.updateItemStatus(kdsItemId, status, changedBy, changeReason);
                results.push(result);
            }
            
            return results;
        } catch (error) {
            logger.error('Error in bulk item status update:', error);
            throw error;
        }
    }

    /**
     * Bump order (clear from KDS after completion)
     * @param {number} kdsOrderId - KDS Order ID
     * @returns {Promise<Object>} Bumped order
     */
    async bumpOrder(kdsOrderId) {
        try {
            // Get current order
            const order = await this.getKDSOrderById(kdsOrderId);
            
            if (order.status !== 'completed') {
                throw new Error('Only completed orders can be bumped');
            }
            
            // Update order status to 'bumped' (or archive it)
            const query = `
                UPDATE kds_orders
                SET status = 'bumped', updated_at = CURRENT_TIMESTAMP
                WHERE kds_order_id = ?
            `;
            
            await database.run(query, [kdsOrderId]);
            
            // Record status change
            await this.recordStatusChange(kdsOrderId, null, 'completed', 'bumped', 'system', 'Order bumped from KDS');
            
            // Get updated order
            const updatedOrder = await this.getKDSOrderById(kdsOrderId);
            
            // Broadcast bump event
            if (this.websocket) {
                this.websocket.broadcast('order:bumped', updatedOrder);
            }
            
            return updatedOrder;
        } catch (error) {
            logger.error(`Error bumping order ${kdsOrderId}:`, error);
            throw error;
        }
    }

    /**
     * Reopen order
     * @param {number} kdsOrderId - KDS Order ID
     * @returns {Promise<Object>} Reopened order
     */
    async reopenOrder(kdsOrderId) {
        try {
            // Get current order
            const order = await this.getKDSOrderById(kdsOrderId);
            
            if (order.status !== 'completed') {
                throw new Error('Only completed orders can be reopened');
            }
            
            // Start transaction
            await database.run('BEGIN TRANSACTION');
            
            // Update order status
            const orderQuery = `
                UPDATE kds_orders
                SET status = 'received', updated_at = CURRENT_TIMESTAMP
                WHERE kds_order_id = ?
            `;
            
            await database.run(orderQuery, [kdsOrderId]);
            
            // Reopen all items
            const itemsQuery = `
                UPDATE kds_order_items
                SET status = 'received', updated_at = CURRENT_TIMESTAMP
                WHERE kds_order_id = ? AND status = 'completed'
            `;
            
            await database.run(itemsQuery, [kdsOrderId]);
            
            // Record status changes
            await this.recordStatusChange(kdsOrderId, null, 'completed', 'received', 'system', 'Order reopened');
            
            // Commit transaction
            await database.run('COMMIT');
            
            // Get updated order
            const updatedOrder = await this.getKDSOrderById(kdsOrderId);
            
            // Broadcast reopen event
            if (this.websocket) {
                this.websocket.broadcast('order:reopened', updatedOrder);
            }
            
            return updatedOrder;
        } catch (error) {
            await database.run('ROLLBACK');
            logger.error(`Error reopening order ${kdsOrderId}:`, error);
            throw error;
        }
    }

    /**
     * Get KDS item by ID
     * @param {number} kdsItemId - KDS Item ID
     * @returns {Promise<Object>} KDS item
     */
    async getKDSItemById(kdsItemId) {
        try {
            const query = `
                SELECT 
                    koi.*, 
                    ks.name as station_name,
                    ks.display_name as station_display_name,
                    ko.order_id
                FROM kds_order_items koi
                LEFT JOIN kds_stations ks ON koi.station_id = ks.station_id
                LEFT JOIN kds_orders ko ON koi.kds_order_id = ko.kds_order_id
                WHERE koi.kds_item_id = ?
            `;
            
            const item = await database.get(query, [kdsItemId]);
            return item;
        } catch (error) {
            logger.error(`Error fetching KDS item ${kdsItemId}:`, error);
            throw error;
        }
    }

    /**
     * Get orders by station
     * @param {number} stationId - Station ID
     * @param {Object} filters - Additional filters
     * @returns {Promise<Array>} Orders for station
     */
    async getOrdersByStation(stationId, filters = {}) {
        try {
            const { status, priorityOnly } = filters;
            
            let query = `
                SELECT 
                    ko.*, 
                    o.table_name, 
                    o.table_number,
                    COUNT(koi.kds_item_id) as item_count,
                    SUM(CASE WHEN koi.status = 'received' THEN 1 ELSE 0 END) as received_count,
                    SUM(CASE WHEN koi.status = 'in-progress' THEN 1 ELSE 0 END) as in_progress_count,
                    SUM(CASE WHEN koi.status = 'ready' THEN 1 ELSE 0 END) as ready_count
                FROM kds_orders ko
                LEFT JOIN orders o ON ko.order_id = o.order_id
                LEFT JOIN kds_order_items koi ON ko.kds_order_id = koi.kds_order_id
                WHERE koi.station_id = ?
            `;
            
            const params = [stationId];
            
            if (status) {
                query += ' AND ko.status = ?';
                params.push(status);
            }
            
            if (priorityOnly) {
                query += ' AND ko.priority = 1';
            }
            
            query += ' GROUP BY ko.kds_order_id ORDER BY ko.created_at DESC';
            
            const orders = await database.all(query, params);
            
            // Get items for each order
            for (const order of orders) {
                const itemsQuery = `
                    SELECT 
                        koi.*, 
                        ks.name as station_name,
                        ks.display_name as station_display_name
                    FROM kds_order_items koi
                    LEFT JOIN kds_stations ks ON koi.station_id = ks.station_id
                    WHERE koi.kds_order_id = ?
                    ORDER BY ks.position ASC, koi.created_at ASC
                `;
                
                const items = await database.all(itemsQuery, [order.kds_order_id]);
                order.items = items;
            }
            
            return orders;
        } catch (error) {
            logger.error(`Error fetching orders for station ${stationId}:`, error);
            throw error;
        }
    }

    /**
     * Get station for product (based on product category or configuration)
     * @param {number} productId - Product ID
     * @returns {Promise<Object>} Station
     */
    async getStationForProduct(productId) {
        try {
            // In a real implementation, this would query a product_station_mapping table
            // or use product categories to determine the station
            
            // For now, return the first active station as a fallback
            const query = `
                SELECT * FROM kds_stations
                WHERE is_active = 1
                ORDER BY position ASC
                LIMIT 1
            `;
            
            const station = await database.get(query);
            return station;
        } catch (error) {
            logger.error(`Error getting station for product ${productId}:`, error);
            return null;
        }
    }

    /**
     * Calculate estimated preparation time for order
     * @param {Array} items - Order items
     * @returns {number} Estimated prep time in minutes
     */
    calculateEstimatedPrepTime(items) {
        // Simple calculation: sum of base prep times for all items
        // In a real implementation, this would consider:
        // - Product-specific prep times
        // - Quantity multipliers
        // - Station-specific factors
        // - Complexity scoring
        
        let totalTime = 0;
        
        for (const item of items) {
            // Base prep time per item (minimum 2 minutes, maximum 15 minutes)
            const baseTime = Math.min(15, Math.max(2, item.quantity * 1.5));
            totalTime += baseTime;
        }
        
        // Average across items
        return Math.round(totalTime / items.length) || 5;
    }

    /**
     * Check if all items in an order are completed
     * @param {number} kdsOrderId - KDS Order ID
     * @returns {Promise<boolean>} True if all items completed
     */
    async checkAllItemsCompleted(kdsOrderId) {
        try {
            const query = `
                SELECT COUNT(*) as total, 
                       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
                FROM kds_order_items
                WHERE kds_order_id = ?
            `;
            
            const result = await database.get(query, [kdsOrderId]);
            return result.total > 0 && result.completed === result.total;
        } catch (error) {
            logger.error(`Error checking items completion for order ${kdsOrderId}:`, error);
            return false;
        }
    }

    /**
     * Record status change in history
     * @param {number} kdsOrderId - KDS Order ID (optional)
     * @param {number} kdsItemId - KDS Item ID (optional)
     * @param {string} oldStatus - Old status
     * @param {string} newStatus - New status
     * @param {string} changedBy - Who made the change
     * @param {string} changeReason - Reason for change
     */
    async recordStatusChange(kdsOrderId, kdsItemId, oldStatus, newStatus, changedBy, changeReason) {
        try {
            const query = `
                INSERT INTO kds_status_history (
                    kds_order_id, kds_item_id, old_status, new_status, 
                    changed_by, change_reason
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            await database.run(query, [
                kdsOrderId || null,
                kdsItemId || null,
                oldStatus,
                newStatus,
                changedBy || 'system',
                changeReason || null
            ]);
        } catch (error) {
            logger.error('Error recording status change:', error);
            throw error;
        }
    }

    /**
     * Validate status transition
     * @param {string} oldStatus - Old status
     * @param {string} newStatus - New status
     * @throws {Error} If transition is invalid
     */
    validateStatusTransition(oldStatus, newStatus) {
        const validTransitions = {
            received: ['in-progress', 'completed', 'cancelled'],
            'in-progress': ['ready', 'completed', 'cancelled'],
            ready: ['completed', 'cancelled'],
            completed: ['received'], // Reopen
            cancelled: []
        };
        
        if (!validTransitions[oldStatus]) {
            throw new Error(`Invalid old status: ${oldStatus}`);
        }
        
        if (!validTransitions[oldStatus].includes(newStatus)) {
            throw new Error(`Invalid transition from ${oldStatus} to ${newStatus}`);
        }
    }

    /**
     * Get status history for order or item
     * @param {number} kdsOrderId - KDS Order ID (optional)
     * @param {number} kdsItemId - KDS Item ID (optional)
     * @returns {Promise<Array>} Status history
     */
    async getStatusHistory(kdsOrderId, kdsItemId) {
        try {
            let query = 'SELECT * FROM kds_status_history';
            const params = [];
            
            if (kdsOrderId && kdsItemId) {
                query += ' WHERE kds_order_id = ? AND kds_item_id = ?';
                params.push(kdsOrderId, kdsItemId);
            } else if (kdsOrderId) {
                query += ' WHERE kds_order_id = ?';
                params.push(kdsOrderId);
            } else if (kdsItemId) {
                query += ' WHERE kds_item_id = ?';
                params.push(kdsItemId);
            }
            
            query += ' ORDER BY created_at DESC';
            
            const history = await database.all(query, params);
            return history;
        } catch (error) {
            logger.error('Error fetching status history:', error);
            throw error;
        }
    }

    /**
     * Send online order to KDS with special handling
     * @param {Object} orderData - Online order data
     * @returns {Promise<Object>} KDS order
     */
    async sendOnlineOrderToKDS(orderData) {
        try {
            const {
                orderId,
                items,
                customerName,
                deliveryAddress,
                instructions,
                onlineOrderSource,
                externalOrderId
            } = orderData;

            // Prepare items for KDS with online order metadata
            const kdsItems = items.map(item => ({
                ...item,
                notes: item.notes || item.online_order_preparation_notes || ''
            }));

            // Submit to KDS with online order context
            const kdsOrder = await this.submitOrderToKDS({
                orderId: orderId,
                tableId: null, // Online orders don't have tables
                customerName: customerName || 'Online Customer',
                orderType: 'online',
                items: kdsItems,
                priority: orderData.priority || 0,
                notes: instructions || `Online Order: ${externalOrderId}
Delivery: ${deliveryAddress || 'N/A'}`
            });

            logger.info(`Online order ${externalOrderId} sent to KDS as order ${orderId}`);

            return kdsOrder;
        } catch (error) {
            logger.error(`Error sending online order to KDS: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get KDS statistics
     * @returns {Promise<Object>} KDS statistics
     */
    async getStatistics() {
        try {
            const stats = {
                totalOrders: 0,
                pendingOrders: 0,
                inProgressOrders: 0,
                readyOrders: 0,
                completedOrders: 0,
                stations: 0,
                avgPrepTime: 0
            };
            
            // Get order counts by status
            const orderCounts = await database.all(`
                SELECT status, COUNT(*) as count
                FROM kds_orders
                GROUP BY status
            `);
            
            for (const count of orderCounts) {
                stats[`${count.status}Orders`] = count.count;
                stats.totalOrders += count.count;
            }
            
            // Get station count
            const stationCount = await database.get(
                'SELECT COUNT(*) as count FROM kds_stations WHERE is_active = 1'
            );
            stats.stations = stationCount.count;
            
            // Get average prep time
            const avgPrep = await database.get(`
                SELECT AVG(estimated_prep_time) as avg_time
                FROM kds_orders
                WHERE estimated_prep_time IS NOT NULL
            `);
            stats.avgPrepTime = avgPrep.avg_time || 0;
            
            return stats;
        } catch (error) {
            logger.error('Error fetching KDS statistics:', error);
            throw error;
        }
    }

    /**
     * Close WebSocket connection
     */
    close() {
        if (this.websocket) {
            this.websocket.close();
        }
    }
}

// Export singleton instance
module.exports = new KDSManager();