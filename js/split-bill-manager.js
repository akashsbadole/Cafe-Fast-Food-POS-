/**
 * Split Bill Manager
 * 
 * Handles all split billing operations including:
 * - Creating split bill sessions
 * - Distributing items across splits
 * - Processing payments for splits
 * - Generating receipts for splits
 * - Merging split bills
 */

const { v4: uuidv4 } = require('uuid');

class SplitBillManager {
    constructor(db) {
        this.db = db;
    }

    /**
     * Create a new split bill session from an order
     * @param {Object} params - Parameters for creating split bill
     * @param {number} params.orderId - The order ID to split
     * @param {number} params.totalSplits - Number of splits
     * @param {string} params.splitMethod - Method of splitting (item_count, amount, customer)
     * @param {string} [params.notes] - Additional notes
     * @returns {Promise<Object>} - Created split bill session
     */
    async createSplitBillSession(params) {
        const { orderId, totalSplits, splitMethod, notes = '' } = params;

        // Validate order exists and is not already split
        const order = await this.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) {
            throw new Error('Order not found');
        }

        if (order.split_status !== 'single') {
            throw new Error('Order is already split');
        }

        // Start transaction
        await this.db.run('BEGIN TRANSACTION');

        try {
            // Create split bill session
            const stmt = await this.db.run(
                'INSERT INTO split_bill_sessions (order_id, total_splits, split_method, notes, status) VALUES (?, ?, ?, ?, ?)',
                [orderId, totalSplits, splitMethod, notes, 'active']
            );
            const sessionId = stmt.lastID;

            // Update order status
            await this.db.run(
                'UPDATE orders SET split_status = ? WHERE id = ?',
                ['split', orderId]
            );

            // Log history
            await this.db.run(
                'INSERT INTO split_bill_history (session_id, action, details) VALUES (?, ?, ?)',
                [sessionId, 'session_created', `Created split bill session with ${totalSplits} splits`]
            );

            await this.db.run('COMMIT');

            return {
                id: sessionId,
                orderId,
                totalSplits,
                splitMethod,
                notes,
                status: 'active'
            };
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Distribute order items across splits by item count (equal distribution)
     * @param {number} sessionId - Split bill session ID
     * @param {number} totalSplits - Total number of splits
     * @returns {Promise<Array>} - Array of split distributions
     */
    async splitByItemCount(sessionId, totalSplits) {
        const session = await this.db.get(
            'SELECT * FROM split_bill_sessions WHERE id = ?',
            [sessionId]
        );

        if (!session) {
            throw new Error('Split bill session not found');
        }

        // Get all order items
        const orderItems = await this.db.all(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id',
            [session.order_id]
        );

        if (orderItems.length === 0) {
            throw new Error('No items in order');
        }

        // Distribute items evenly
        const itemsPerSplit = Math.floor(orderItems.length / totalSplits);
        const remainder = orderItems.length % totalSplits;

        await this.db.run('BEGIN TRANSACTION');

        try {
            // Clear existing split items for this session
            await this.db.run(
                'DELETE FROM split_bill_items WHERE session_id = ?',
                [sessionId]
            );

            let itemIndex = 0;
            for (let splitNumber = 1; splitNumber <= totalSplits; splitNumber++) {
                const itemsInThisSplit = itemsPerSplit + (splitNumber <= remainder ? 1 : 0);

                for (let i = 0; i < itemsInThisSplit; i++) {
                    const item = orderItems[itemIndex];
                    
                    await this.db.run(
                        `INSERT INTO split_bill_items 
                         (session_id, item_id, split_number, quantity, unit_price, 
                          tax_amount, discount_amount, total_amount, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            sessionId,
                            item.id,
                            splitNumber,
                            item.quantity,
                            item.unit_price,
                            item.tax_amount || 0,
                            item.discount_amount || 0,
                            item.total_amount,
                            'pending'
                        ]
                    );

                    itemIndex++;
                }
            }

            // Log history
            await this.db.run(
                'INSERT INTO split_bill_history (session_id, action, details) VALUES (?, ?, ?)',
                [sessionId, 'items_distributed', `Distributed items by count across ${totalSplits} splits`]
            );

            await this.db.run('COMMIT');

            return this.getSplitItems(sessionId);
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Distribute order items across splits by custom amounts
     * @param {number} sessionId - Split bill session ID
     * @param {Array} splitAmounts - Array of amounts for each split
     * @returns {Promise<Array>} - Array of split distributions
     */
    async splitByAmount(sessionId, splitAmounts) {
        const session = await this.db.get(
            'SELECT * FROM split_bill_sessions WHERE id = ?',
            [sessionId]
        );

        if (!session) {
            throw new Error('Split bill session not found');
        }

        // Get all order items
        const orderItems = await this.db.all(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id',
            [session.order_id]
        );

        if (orderItems.length === 0) {
            throw new Error('No items in order');
        }

        // Calculate total order amount
        const totalAmount = orderItems.reduce((sum, item) => sum + item.total_amount, 0);
        const providedTotal = splitAmounts.reduce((sum, amount) => sum + amount, 0);

        if (Math.abs(providedTotal - totalAmount) > 0.01) {
            throw new Error(`Amount mismatch: provided ${providedTotal}, expected ${totalAmount}`);
        }

        await this.db.run('BEGIN TRANSACTION');

        try {
            // Clear existing split items for this session
            await this.db.run(
                'DELETE FROM split_bill_items WHERE session_id = ?',
                [sessionId]
            );

            let remainingAmount = totalAmount;
            let currentSplit = 1;

            for (const item of orderItems) {
                const targetAmount = splitAmounts[currentSplit - 1];
                const amountUsedSoFar = targetAmount - remainingAmount;

                if (item.total_amount <= remainingAmount) {
                    // Add entire item to this split
                    await this.db.run(
                        `INSERT INTO split_bill_items 
                         (session_id, item_id, split_number, quantity, unit_price, 
                          tax_amount, discount_amount, total_amount, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            sessionId,
                            item.id,
                            currentSplit,
                            item.quantity,
                            item.unit_price,
                            item.tax_amount || 0,
                            item.discount_amount || 0,
                            item.total_amount,
                            'pending'
                        ]
                    );

                    remainingAmount -= item.total_amount;
                } else {
                    // Split this item across splits
                    const quantityInThisSplit = Math.floor((remainingAmount / item.unit_price) * item.quantity);
                    const unitPriceInThisSplit = remainingAmount / quantityInThisSplit;
                    const totalInThisSplit = unitPriceInThisSplit * quantityInThisSplit;

                    await this.db.run(
                        `INSERT INTO split_bill_items 
                         (session_id, item_id, split_number, quantity, unit_price, 
                          tax_amount, discount_amount, total_amount, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            sessionId,
                            item.id,
                            currentSplit,
                            quantityInThisSplit,
                            unitPriceInThisSplit,
                            (item.tax_amount || 0) * (quantityInThisSplit / item.quantity),
                            (item.discount_amount || 0) * (quantityInThisSplit / item.quantity),
                            totalInThisSplit,
                            'pending'
                        ]
                    );

                    remainingAmount = 0;
                    currentSplit++;
                }

                if (currentSplit > splitAmounts.length) {
                    break;
                }
            }

            // Log history
            await this.db.run(
                'INSERT INTO split_bill_history (session_id, action, details) VALUES (?, ?, ?)',
                [sessionId, 'items_distributed', `Distributed items by amount across ${splitAmounts.length} splits`]
            );

            await this.db.run('COMMIT');

            return this.getSplitItems(sessionId);
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Assign customers to splits
     * @param {number} sessionId - Split bill session ID
     * @param {Array} customerAssignments - Array of customer assignments
     * @returns {Promise<Array>} - Updated customer assignments
     */
    async assignCustomersToSplits(sessionId, customerAssignments) {
        const session = await this.db.get(
            'SELECT * FROM split_bill_sessions WHERE id = ?',
            [sessionId]
        );

        if (!session) {
            throw new Error('Split bill session not found');
        }

        await this.db.run('BEGIN TRANSACTION');

        try {
            // Clear existing customer assignments
            await this.db.run(
                'DELETE FROM split_bill_customers WHERE session_id = ?',
                [sessionId]
            );

            // Add new assignments
            for (const assignment of customerAssignments) {
                await this.db.run(
                    'INSERT INTO split_bill_customers (session_id, split_number, customer_id, customer_name, customer_contact) VALUES (?, ?, ?, ?, ?)',
                    [
                        sessionId,
                        assignment.splitNumber,
                        assignment.customerId || null,
                        assignment.customerName || null,
                        assignment.customerContact || null
                    ]
                );
            }

            // Log history
            await this.db.run(
                'INSERT INTO split_bill_history (session_id, action, details) VALUES (?, ?, ?)',
                [sessionId, 'customers_assigned', `Assigned ${customerAssignments.length} customers to splits`]
            );

            await this.db.run('COMMIT');

            return this.getCustomerAssignments(sessionId);
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Process payment for a split
     * @param {Object} params - Payment parameters
     * @param {number} params.sessionId - Split bill session ID
     * @param {number} params.splitNumber - Split number
     * @param {number} params.amount - Payment amount
     * @param {string} params.paymentMethod - Payment method
     * @param {string} [params.transactionId] - Transaction ID
     * @param {number} [params.userId] - User ID
     * @returns {Promise<Object>} - Payment result
     */
    async processSplitPayment(params) {
        const { sessionId, splitNumber, amount, paymentMethod, transactionId = null, userId = null } = params;

        const session = await this.db.get(
            'SELECT * FROM split_bill_sessions WHERE id = ?',
            [sessionId]
        );

        if (!session) {
            throw new Error('Split bill session not found');
        }

        // Get items for this split
        const splitItems = await this.db.all(
            'SELECT * FROM split_bill_items WHERE session_id = ? AND split_number = ?',
            [sessionId, splitNumber]
        );

        const splitTotal = splitItems.reduce((sum, item) => sum + item.total_amount, 0);

        if (amount > splitTotal) {
            throw new Error(`Payment amount ${amount} exceeds split total ${splitTotal}`);
        }

        await this.db.run('BEGIN TRANSACTION');

        try {
            // Create payment record
            const paymentStmt = await this.db.run(
                'INSERT INTO payments (order_id, amount, payment_method, transaction_id, status, split_number, split_session_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    session.order_id,
                    amount,
                    paymentMethod,
                    transactionId,
                    'completed',
                    splitNumber,
                    sessionId,
                    userId
                ]
            );
            const paymentId = paymentStmt.lastID;

            // Create split payment record
            await this.db.run(
                'INSERT INTO split_bill_payments (session_id, split_number, payment_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [sessionId, splitNumber, paymentId, amount, paymentMethod, transactionId, 'completed']
            );

            // Update split items status
            await this.db.run(
                'UPDATE split_bill_items SET status = ? WHERE session_id = ? AND split_number = ? AND total_amount <= ?',
                ['paid', sessionId, splitNumber, amount]
            );

            // Log history
            await this.db.run(
                'INSERT INTO split_bill_history (session_id, action, details, user_id) VALUES (?, ?, ?, ?)',
                [sessionId, 'payment_processed', `Processed payment of ${amount} for split ${splitNumber}`, userId]
            );

            await this.db.run('COMMIT');

            return {
                paymentId,
                sessionId,
                splitNumber,
                amount,
                paymentMethod,
                status: 'completed'
            };
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Merge split bills back into a single bill
     * @param {number} sessionId - Split bill session ID
     * @returns {Promise<Object>} - Merge result
     */
    async mergeSplitBills(sessionId) {
        const session = await this.db.get(
            'SELECT * FROM split_bill_sessions WHERE id = ?',
            [sessionId]
        );

        if (!session) {
            throw new Error('Split bill session not found');
        }

        await this.db.run('BEGIN TRANSACTION');

        try {
            // Update order status
            await this.db.run(
                'UPDATE orders SET split_status = ? WHERE id = ?',
                ['single', session.order_id]
            );

            // Update session status
            await this.db.run(
                'UPDATE split_bill_sessions SET status = ? WHERE id = ?',
                ['merged', sessionId]
            );

            // Log history
            await this.db.run(
                'INSERT INTO split_bill_history (session_id, action, details) VALUES (?, ?, ?)',
                [sessionId, 'session_merged', 'Split bill session merged back into single bill']
            );

            await this.db.run('COMMIT');

            return {
                sessionId,
                orderId: session.order_id,
                status: 'merged'
            };
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Get split bill session details
     * @param {number} sessionId - Split bill session ID
     * @returns {Promise<Object>} - Session details
     */
    async getSplitBillSession(sessionId) {
        const session = await this.db.get(
            'SELECT * FROM split_bill_sessions WHERE id = ?',
            [sessionId]
        );

        if (!session) {
            throw new Error('Split bill session not found');
        }

        return session;
    }

    /**
     * Get all split items for a session
     * @param {number} sessionId - Split bill session ID
     * @returns {Promise<Array>} - Array of split items
     */
    async getSplitItems(sessionId) {
        return await this.db.all(
            `SELECT sbi.*, oi.product_id, p.name as product_name, p.category
             FROM split_bill_items sbi
             JOIN order_items oi ON sbi.item_id = oi.id
             JOIN products p ON oi.product_id = p.id
             WHERE sbi.session_id = ? ORDER BY sbi.split_number, sbi.id`,
            [sessionId]
        );
    }

    /**
     * Get payment history for a split
     * @param {number} sessionId - Split bill session ID
     * @param {number} splitNumber - Split number
     * @returns {Promise<Array>} - Array of payments
     */
    async getSplitPayments(sessionId, splitNumber) {
        return await this.db.all(
            `SELECT sbp.*, p.transaction_id, p.user_id, u.name as user_name
             FROM split_bill_payments sbp
             LEFT JOIN payments p ON sbp.payment_id = p.id
             LEFT JOIN users u ON p.user_id = u.id
             WHERE sbp.session_id = ? AND sbp.split_number = ? ORDER BY sbp.id`,
            [sessionId, splitNumber]
        );
    }

    /**
     * Get customer assignments for a session
     * @param {number} sessionId - Split bill session ID
     * @returns {Promise<Array>} - Array of customer assignments
     */
    async getCustomerAssignments(sessionId) {
        return await this.db.all(
            'SELECT * FROM split_bill_customers WHERE session_id = ? ORDER BY split_number',
            [sessionId]
        );
    }

    /**
     * Get split bill summary
     * @param {number} sessionId - Split bill session ID
     * @returns {Promise<Object>} - Split bill summary
     */
    async getSplitBillSummary(sessionId) {
        const session = await this.db.get(
            'SELECT * FROM split_bill_sessions WHERE id = ?',
            [sessionId]
        );

        if (!session) {
            throw new Error('Split bill session not found');
        }

        const splits = [];
        for (let i = 1; i <= session.total_splits; i++) {
            const items = await this.db.all(
                'SELECT * FROM split_bill_items WHERE session_id = ? AND split_number = ?',
                [sessionId, i]
            );

            const payments = await this.db.all(
                'SELECT * FROM split_bill_payments WHERE session_id = ? AND split_number = ?',
                [sessionId, i]
            );

            const customer = await this.db.get(
                'SELECT * FROM split_bill_customers WHERE session_id = ? AND split_number = ?',
                [sessionId, i]
            );

            const totalAmount = items.reduce((sum, item) => sum + item.total_amount, 0);
            const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
            const balance = totalAmount - paidAmount;

            splits.push({
                splitNumber: i,
                totalAmount,
                paidAmount,
                balance,
                items,
                payments,
                customer
            });
        }

        const totalOrderAmount = splits.reduce((sum, split) => sum + split.totalAmount, 0);
        const totalPaid = splits.reduce((sum, split) => sum + split.paidAmount, 0);
        const totalBalance = splits.reduce((sum, split) => sum + split.balance, 0);

        return {
            sessionId: session.id,
            orderId: session.order_id,
            totalSplits: session.total_splits,
            splitMethod: session.split_method,
            status: session.status,
            totalOrderAmount,
            totalPaid,
            totalBalance,
            splits
        };
    }

    /**
     * Remove item from split
     * @param {number} sessionId - Split bill session ID
     * @param {number} itemId - Item ID
     * @returns {Promise<Object>} - Result
     */
    async removeItemFromSplit(sessionId, itemId) {
        await this.db.run('BEGIN TRANSACTION');

        try {
            // Delete the item from split
            const result = await this.db.run(
                'DELETE FROM split_bill_items WHERE session_id = ? AND item_id = ?',
                [sessionId, itemId]
            );

            if (result.changes === 0) {
                throw new Error('Item not found in split');
            }

            // Log history
            await this.db.run(
                'INSERT INTO split_bill_history (session_id, action, details) VALUES (?, ?, ?)',
                [sessionId, 'item_removed', `Removed item ${itemId} from split`]
            );

            await this.db.run('COMMIT');

            return { success: true };
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Get all active split bill sessions for an order
     * @param {number} orderId - Order ID
     * @returns {Promise<Array>} - Array of split bill sessions
     */
    async getActiveSessionsForOrder(orderId) {
        return await this.db.all(
            'SELECT * FROM split_bill_sessions WHERE order_id = ? AND status = ? ORDER BY id',
            [orderId, 'active']
        );
    }
}

module.exports = SplitBillManager;
