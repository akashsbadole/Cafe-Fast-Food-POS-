/**
 * Unit tests for VoidRefundManager
 */

const assert = require('assert');
const sinon = require('sinon');
const VoidRefundManager = require('./void-refund-manager');

describe('VoidRefundManager', () => {
  let manager;
  let mockDb;
  let mockLogger;
  
  beforeEach(() => {
    // Create mock database
    mockDb = {
      run: sinon.stub(),
      get: sinon.stub(),
      all: sinon.stub()
    };
    
    // Create mock logger
    mockLogger = {
      error: sinon.stub(),
      info: sinon.stub()
    };
    
    // Create manager instance
    manager = new VoidRefundManager(mockDb, mockLogger);
  });
  
  describe('requestVoidRefund', () => {
    it('should validate request parameters', async () => {
      try {
        await manager.requestVoidRefund({});
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.strictEqual(error.message, 'Invalid request type. Must be VOID or REFUND');
      }
    });
    
    it('should check void time limit for void requests', async () => {
      const mockOrder = { created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
      mockDb.get.yields(null, null, mockOrder);
      
      try {
        await manager.requestVoidRefund({
          requestType: 'VOID',
          orderId: 1,
          reasonCode: 'TYP',
          requestedBy: 1
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.strictEqual(error.message, 'Void can only be requested within 24 hours of order creation');
      }
    });
    
    it('should check if order/item is already voided', async () => {
      const mockOrder = { created_at: new Date().toISOString(), void_status: 'VOIDED' };
      mockDb.get.yields(null, null, mockOrder);
      
      try {
        await manager.requestVoidRefund({
          requestType: 'VOID',
          orderId: 1,
          reasonCode: 'TYP',
          requestedBy: 1
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.strictEqual(error.message, 'Order or item is already voided/refunded');
      }
    });
    
    it('should create a void/refund request successfully', async () => {
      // Setup mocks
      mockDb.get.yields(null, null, { created_at: new Date().toISOString(), void_status: 'ACTIVE' });
      mockDb.run.yields({ lastInsertRowid: 1 });
      
      const result = await manager.requestVoidRefund({
        requestType: 'VOID',
        orderId: 1,
        reasonCode: 'TYP',
        requestedBy: 1
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.requestId, 1);
      assert.strictEqual(result.requiresApproval, false);
    });
  });
  
  describe('approveVoidRefund', () => {
    it('should throw error if request not found', async () => {
      mockDb.get.yields(null, null, null);
      
      try {
        await manager.approveVoidRefund({
          requestId: 1,
          approvalStatus: true,
          approvedBy: 1
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.strictEqual(error.message, 'Void/Refund request not found');
      }
    });
    
    it('should throw error if request is not pending', async () => {
      mockDb.get.yields(null, null, { status: 'APPROVED' });
      
      try {
        await manager.approveVoidRefund({
          requestId: 1,
          approvalStatus: true,
          approvedBy: 1
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.strictEqual(error.message, 'Request is not in pending status');
      }
    });
    
    it('should approve a void/refund request successfully', async () => {
      mockDb.get.yields(null, null, { id: 1, order_id: 1, status: 'PENDING' });
      mockDb.run.yields({ lastInsertRowid: 1 });
      
      const result = await manager.approveVoidRefund({
        requestId: 1,
        approvalStatus: true,
        approvedBy: 1,
        comments: 'Approved'
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.message, 'Void/Refund request APPROVED successfully');
    });
  });
  
  describe('processVoidRefund', () => {
    it('should throw error if request not found', async () => {
      mockDb.get.yields(null, null, null);
      
      try {
        await manager.processVoidRefund({
          requestId: 1,
          processedBy: 1
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.strictEqual(error.message, 'Void/Refund request not found');
      }
    });
    
    it('should throw error if request is not approved', async () => {
      mockDb.get.yields(null, null, { status: 'PENDING' });
      
      try {
        await manager.processVoidRefund({
          requestId: 1,
          processedBy: 1
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.strictEqual(error.message, 'Request must be approved before processing');
      }
    });
    
    it('should process a void request successfully', async () => {
      // Setup mocks for void processing
      mockDb.get.onCall(0).yields(null, null, { 
        id: 1, 
        order_id: 1, 
        status: 'APPROVED',
        request_type: 'VOID',
        reason_code: 'TYP'
      });
      mockDb.get.onCall(1).yields(null, null, { id: 1, void_status: 'ACTIVE' });
      mockDb.all.yields(null, null, []); // No items
      mockDb.run.yields({});
      
      const result = await manager.processVoidRefund({
        requestId: 1,
        processedBy: 1
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.message, 'Void/Refund processed successfully');
    });
  });
  
  describe('getVoidRefundReasons', () => {
    it('should return list of void/refund reasons', async () => {
      const mockReasons = [
        { id: 1, reason_code: 'TYP', reason_description: 'Typographical Error' },
        { id: 2, reason_code: 'WRG', reason_description: 'Wrong Item Ordered' }
      ];
      mockDb.all.yields(null, null, mockReasons);
      
      const reasons = await manager.getVoidRefundReasons();
      
      assert.strictEqual(reasons.length, 2);
      assert.strictEqual(reasons[0].reason_code, 'TYP');
    });
  });
  
  describe('getVoidRefundHistory', () => {
    it('should return void/refund history for an order', async () => {
      const mockHistory = [
        { id: 1, order_id: 1, request_type: 'VOID', status: 'PROCESSED' }
      ];
      mockDb.all.yields(null, null, mockHistory);
      
      const history = await manager.getVoidRefundHistory(1);
      
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].order_id, 1);
    });
  });
  
  describe('verifyManagerPin', () => {
    it('should return success for valid manager PIN', async () => {
      mockDb.get.yields(null, null, { id: 1, name: 'Manager', pin: '1234', is_manager: 1 });
      
      const result = await manager.verifyManagerPin('1234');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.userId, 1);
    });
    
    it('should return failure for invalid manager PIN', async () => {
      mockDb.get.yields(null, null, null);
      
      const result = await manager.verifyManagerPin('0000');
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.message, 'Invalid manager PIN');
    });
  });
  
  describe('getPendingRequests', () => {
    it('should return list of pending void/refund requests', async () => {
      const mockRequests = [
        { id: 1, order_id: 1, status: 'PENDING', request_type: 'VOID' }
      ];
      mockDb.all.yields(null, null, mockRequests);
      
      const requests = await manager.getPendingRequests();
      
      assert.strictEqual(requests.length, 1);
      assert.strictEqual(requests[0].status, 'PENDING');
    });
  });
  
  describe('Configuration', () => {
    it('should have default configuration', () => {
      assert.strictEqual(manager.config.voidTimeLimitHours, 24);
      assert.strictEqual(manager.config.managerPinRequired, true);
      assert.strictEqual(manager.config.requireReason, true);
    });
  });
});

console.log('All tests completed for VoidRefundManager');
