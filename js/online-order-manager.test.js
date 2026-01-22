/**
 * Unit tests for OnlineOrderManager
 */

const assert = require('assert');
const sinon = require('sinon');

// Mock dependencies
const mockFetch = require('node-fetch');
const mockLogger = {
  info: sinon.stub(),
  error: sinon.stub(),
  warn: sinon.stub()
};

// Mock the OnlineOrderManager module
const OnlineOrderManager = require('./online-order-manager');

describe('OnlineOrderManager', () => {
  let manager;
  let fetchStub;
  
  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    manager = new OnlineOrderManager(mockLogger);
  });
  
  afterEach(() => {
    fetchStub.restore();
    sinon.restore();
  });
  
  describe('getOnlineOrders', () => {
    it('should fetch online orders from API', async () => {
      const mockOrders = [
        { id: 1, status: 'pending', total: 15.99 },
        { id: 2, status: 'processing', total: 25.50 }
      ];
      
      fetchStub.resolves({
        ok: true,
        json: async () => mockOrders
      });
      
      const result = await manager.getOnlineOrders();
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, 1);
      assert.strictEqual(result[1].status, 'processing');
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders'));
    });
    
    it('should handle API errors', async () => {
      fetchStub.resolves({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' })
      });
      
      await assert.rejects(
        manager.getOnlineOrders(),
        /Failed to fetch online orders/
      );
      
      assert(mockLogger.error.calledOnce);
    });
  });
  
  describe('getOrderById', () => {
    it('should fetch a specific order', async () => {
      const mockOrder = {
        id: 1,
        status: 'pending',
        total: 15.99,
        items: [
          { id: 10, name: 'Coffee', quantity: 1, price: 2.99 },
          { id: 11, name: 'Croissant', quantity: 2, price: 1.50 }
        ]
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => mockOrder
      });
      
      const result = await manager.getOrderById(1);
      
      assert.strictEqual(result.id, 1);
      assert.strictEqual(result.items.length, 2);
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders/1'));
    });
    
    it('should return null for non-existent order', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => null
      });
      
      const result = await manager.getOrderById(999);
      
      assert.strictEqual(result, null);
    });
  });
  
  describe('updateOrderStatus', () => {
    it('should update order status', async () => {
      const updatedOrder = {
        id: 1,
        status: 'accepted',
        updated_at: new Date()
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => updatedOrder
      });
      
      const result = await manager.updateOrderStatus(1, 'accepted');
      
      assert.strictEqual(result.status, 'accepted');
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders/1/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' })
      }));
    });
    
    it('should handle invalid status', async () => {
      await assert.rejects(
        manager.updateOrderStatus(1, 'invalid_status'),
        /Invalid order status/
      );
    });
  });
  
  describe('acceptOrder', () => {
    it('should accept an order', async () => {
      const acceptedOrder = {
        id: 1,
        status: 'accepted',
        accepted_at: new Date()
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => acceptedOrder
      });
      
      const result = await manager.acceptOrder(1);
      
      assert.strictEqual(result.status, 'accepted');
      assert(mockLogger.info.calledWith('Order #1 accepted'));
    });
  });
  
  describe('rejectOrder', () => {
    it('should reject an order with reason', async () => {
      const rejectedOrder = {
        id: 1,
        status: 'rejected',
        rejection_reason: 'Out of stock'
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => rejectedOrder
      });
      
      const result = await manager.rejectOrder(1, 'Out of stock');
      
      assert.strictEqual(result.status, 'rejected');
      assert.strictEqual(result.rejection_reason, 'Out of stock');
      assert(mockLogger.info.calledWith('Order #1 rejected: Out of stock'));
    });
  });
  
  describe('completeOrder', () => {
    it('should mark order as completed', async () => {
      const completedOrder = {
        id: 1,
        status: 'completed',
        completed_at: new Date()
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => completedOrder
      });
      
      const result = await manager.completeOrder(1);
      
      assert.strictEqual(result.status, 'completed');
      assert(mockLogger.info.calledWith('Order #1 completed'));
    });
  });
  
  describe('getOrdersByStatus', () => {
    it('should filter orders by status', async () => {
      const pendingOrders = [
        { id: 1, status: 'pending' },
        { id: 2, status: 'pending' }
      ];
      
      fetchStub.resolves({
        ok: true,
        json: async () => pendingOrders
      });
      
      const result = await manager.getOrdersByStatus('pending');
      
      assert.strictEqual(result.length, 2);
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders?status=pending'));
    });
  });
  
  describe('syncWithProvider', () => {
    it('should sync orders with provider', async () => {
      const syncResult = {
        synced: 5,
        last_sync: new Date()
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => syncResult
      });
      
      const result = await manager.syncWithProvider();
      
      assert.strictEqual(result.synced, 5);
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders/sync'));
      assert(mockLogger.info.calledWith('Synced 5 online orders'));
    });
  });
  
  describe('validateOrder', () => {
    it('should validate order structure', () => {
      const validOrder = {
        id: 1,
        status: 'pending',
        items: [
          { id: 10, name: 'Coffee', quantity: 1, price: 2.99 }
        ],
        total: 2.99
      };
      
      const result = manager.validateOrder(validOrder);
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });
    
    it('should detect invalid order', () => {
      const invalidOrder = {
        id: 1,
        status: 'pending'
        // Missing items and total
      };
      
      const result = manager.validateOrder(invalidOrder);
      
      assert.strictEqual(result.isValid, false);
      assert(result.errors.length > 0);
    });
  });
  
  describe('calculateTotal', () => {
    it('should calculate order total correctly', () => {
      const items = [
        { id: 10, name: 'Coffee', quantity: 2, price: 2.99 },
        { id: 11, name: 'Croissant', quantity: 1, price: 1.50 }
      ];
      
      const result = manager.calculateTotal(items);
      
      assert.strictEqual(result, 7.48); // (2.99 * 2) + (1.50 * 1)
    });
    
    it('should handle empty items array', () => {
      const result = manager.calculateTotal([]);
      
      assert.strictEqual(result, 0);
    });
  });
  
  describe('formatOrderForKDS', () => {
    it('should format order for KDS', () => {
      const order = {
        id: 1,
        status: 'accepted',
        items: [
          { id: 10, name: 'Coffee', quantity: 2, price: 2.99 },
          { id: 11, name: 'Croissant', quantity: 1, price: 1.50 }
        ],
        customer_name: 'John Doe',
        special_instructions: 'Extra sugar'
      };
      
      const result = manager.formatOrderForKDS(order);
      
      assert.strictEqual(result.order_id, 1);
      assert.strictEqual(result.status, 'accepted');
      assert.strictEqual(result.items.length, 2);
      assert.strictEqual(result.customer_name, 'John Doe');
      assert.strictEqual(result.special_instructions, 'Extra sugar');
    });
  });
  
  describe('handleWebhook', () => {
    it('should process incoming webhook', async () => {
      const webhookData = {
        event: 'order_created',
        order: { id: 1, status: 'pending' }
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => ({ success: true })
      });
      
      const result = await manager.handleWebhook(webhookData);
      
      assert.strictEqual(result.success, true);
      assert(mockLogger.info.calledWith('Webhook processed: order_created for order #1'));
    });
    
    it('should validate webhook signature', async () => {
      const webhookData = {
        event: 'order_created',
        order: { id: 1, status: 'pending' }
      };
      
      // Test with invalid signature
      await assert.rejects(
        manager.handleWebhook(webhookData, 'invalid_signature'),
        /Invalid webhook signature/
      );
    });
  });
  
  describe('getProviderConfig', () => {
    it('should return provider configuration', async () => {
      const config = {
        api_key: 'test_key',
        base_url: 'https://api.provider.com',
        webhook_secret: 'secret'
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => config
      });
      
      const result = await manager.getProviderConfig();
      
      assert.strictEqual(result.api_key, 'test_key');
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders/config'));
    });
  });
  
  describe('updateProviderConfig', () => {
    it('should update provider configuration', async () => {
      const newConfig = {
        api_key: 'new_key',
        base_url: 'https://api.newprovider.com'
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => newConfig
      });
      
      const result = await manager.updateProviderConfig(newConfig);
      
      assert.strictEqual(result.api_key, 'new_key');
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      }));
    });
  });
  
  describe('getStats', () => {
    it('should return order statistics', async () => {
      const stats = {
        total_orders: 150,
        pending: 10,
        accepted: 120,
        rejected: 5,
        completed: 15,
        average_order_value: 12.50
      };
      
      fetchStub.resolves({
        ok: true,
        json: async () => stats
      });
      
      const result = await manager.getStats();
      
      assert.strictEqual(result.total_orders, 150);
      assert.strictEqual(result.completed, 15);
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders/stats'));
    });
  });
  
  describe('searchOrders', () => {
    it('should search orders by criteria', async () => {
      const results = [
        { id: 1, customer_name: 'John Doe' },
        { id: 2, customer_name: 'Jane Smith' }
      ];
      
      fetchStub.resolves({
        ok: true,
        json: async () => results
      });
      
      const result = await manager.searchOrders({ customer_name: 'John' });
      
      assert.strictEqual(result.length, 2);
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: 'John' })
      }));
    });
  });
  
  describe('getOrderHistory', () => {
    it('should return order history for customer', async () => {
      const history = [
        { id: 1, date: '2023-01-01', total: 10.00 },
        { id: 2, date: '2023-01-02', total: 15.00 }
      ];
      
      fetchStub.resolves({
        ok: true,
        json: async () => history
      });
      
      const result = await manager.getOrderHistory(1);
      
      assert.strictEqual(result.length, 2);
      assert(fetchStub.calledWith('http://localhost:3000/api/online-orders/customer/1/history'));
    });
  });
  
  describe('handleConnectionError', () => {
    it('should handle connection errors gracefully', async () => {
      fetchStub.rejects(new Error('Network error'));
      
      await manager.handleConnectionError(new Error('Network error'));
      
      assert(mockLogger.error.calledWith('Connection error:', sinon.match.instanceOf(Error)));
      assert(mockLogger.warn.calledWith('Falling back to offline mode'));
    });
  });
  
  describe('retryFailedRequests', () => {
    it('should retry failed requests', async () => {
      fetchStub.onFirstCall().rejects(new Error('Network error'));
      fetchStub.onSecondCall().resolves({
        ok: true,
        json: async () => ({ success: true })
      });
      
      const result = await manager.retryFailedRequests(() => 
        fetch('http://localhost:3000/api/online-orders'),
        2
      );
      
      assert.strictEqual(result.success, true);
      assert(fetchStub.callCount, 2);
    });
  });
});

console.log('OnlineOrderManager tests completed');
