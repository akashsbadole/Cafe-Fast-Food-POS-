/**
 * Order Manager
 * 
 * Handles order operations including creation, retrieval, and management.
 */

const { Database } = require('./database');

class OrderManager {
    constructor() {
        this.db = new Database();
    }

    /**
     * Get an order by ID
     * @param {number} orderId - Order ID
     * @returns {Promise<Object>} Order
     */
    async getOrder(orderId) {
        try {
            const order = await this.db.order.getById(orderId);
            return order || null;
        } catch (error) {
            console.error(`Failed to get order ${orderId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get order items for an order
     * @param {number} orderId - Order ID
     * @returns {Promise<Array>} Order items
     */
    async getOrderItems(orderId) {
        try {
            const orderWithItems = await this.db.order.getWithItems(orderId);
            return orderWithItems?.items || [];
        } catch (error) {
            console.error(`Failed to get order items for ${orderId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get a customer by ID
     * @param {number} customerId - Customer ID
     * @returns {Promise<Object>} Customer
     */
    async getCustomer(customerId) {
        try {
            const customer = await this.db.customer.getById(customerId);
            return customer || null;
        } catch (error) {
            console.error(`Failed to get customer ${customerId}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = { OrderManager };