/**
 * Integration tests for Void/Refund API Endpoints
 */

const assert = require('assert');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');
const router = require('./enterprise-endpoints');

describe('Void/Refund API Endpoints', () => {
  let app;
  let mockDb;
  let mockVoidRefundManager;
  let mockReportingManager;
  
  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(router);
    
    // Create mock database
    mockDb = {
      query: sinon.stub(),
      getDatabase: sinon.stub().returns({
        run: sinon.stub(),
        get: sinon.stub(),
        all: sinon.stub()
      }),
      user: {
        getPermissions: sinon.stub().returns(['manage_orders'])
      }
    };
    
    // Create mock VoidRefundManager
    mockVoidRefundManager = {
      getVoidRefundReasons: sinon.stub(),
      requestVoidRefund: sinon.stub(),
      approveVoidRefund: sinon.stub(),
      processVoidRefund: sinon.stub(),
      getVoidRefundHistory: sinon.stub(),
      getAuditLogs: sinon.stub(),
      getPendingRequests: sinon.stub(),
      verifyManagerPin: sinon.stub()
    };
    
    // Create mock ReportingManager
    mockReportingManager = {
      logAudit: sinon.stub()
    };
    
    // Mock database module
    sinon.stub(require('./database'), 'getDatabase').returns(mockDb.getDatabase());
    
    // Mock VoidRefundManager module
    sinon.stub(require('./void-refund-manager'), 'VoidRefundManager').returns(mockVoidRefundManager);
    
    // Mock ReportingManager module
    sinon.stub(require('./reporting-manager'), 'ReportingManager').returns(mockReportingManager);
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  describe('GET /api/void-refund/reasons', () => {
    it('should return list of void/refund reasons', async () => {
      const mockReasons = [
        { id: 1, reason_code: 'TYP', reason_description: 'Typographical Error' },
        { id: 2, reason_code: 'WRG', reason_description: 'Wrong Item Ordered' }
      ];
      mockVoidRefundManager.getVoidRefundReasons.resolves(mockReasons);
      
      const res = await request(app)
        .get('/api/void-refund/reasons')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.length, 2);
      assert.strictEqual(res.body[0].reason_code, 'TYP');
    });
  });
  
  describe('POST /api/void-refund/request', () => {
    it('should return 400 for invalid request type', async () => {
      const res = await request(app)
        .post('/api/void-refund/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          requestType: 'INVALID',
          orderId: 1,
          reasonCode: 'TYP'
        });
      
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Invalid request type. Must be VOID or REFUND');
    });
    
    it('should return 400 for missing order ID', async () => {
      const res = await request(app)
        .post('/api/void-refund/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          requestType: 'VOID',
          reasonCode: 'TYP'
        });
      
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Order ID is required');
    });
    
    it('should return 400 for missing reason code', async () => {
      const res = await request(app)
        .post('/api/void-refund/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          requestType: 'VOID',
          orderId: 1
        });
      
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Reason code is required');
    });
    
    it('should create a void/refund request successfully', async () => {
      mockVoidRefundManager.requestVoidRefund.resolves({
        success: true,
        requestId: 1,
        requiresApproval: false
      });
      
      const res = await request(app)
        .post('/api/void-refund/request')
        .set('Authorization', 'Bearer valid-token')
        .send({
          requestType: 'VOID',
          orderId: 1,
          reasonCode: 'TYP',
          requestedBy: 1
        });
      
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.requestId, 1);
    });
  });
  
  describe('POST /api/void-refund/approve', () => {
    it('should return 400 for missing request ID', async () => {
      const res = await request(app)
        .post('/api/void-refund/approve')
        .set('Authorization', 'Bearer valid-token')
        .send({
          approvalStatus: true
        });
      
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Request ID is required');
    });
    
    it('should return 400 for missing approval status', async () => {
      const res = await request(app)
        .post('/api/void-refund/approve')
        .set('Authorization', 'Bearer valid-token')
        .send({
          requestId: 1
        });
      
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Approval status is required');
    });
    
    it('should approve a void/refund request successfully', async () => {
      mockVoidRefundManager.approveVoidRefund.resolves({
        success: true,
        message: 'Void/Refund request APPROVED successfully'
      });
      
      const res = await request(app)
        .post('/api/void-refund/approve')
        .set('Authorization', 'Bearer valid-token')
        .send({
          requestId: 1,
          approvalStatus: true,
          comments: 'Approved'
        });
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });
  });
  
  describe('POST /api/void-refund/process', () => {
    it('should return 400 for missing request ID', async () => {
      const res = await request(app)
        .post('/api/void-refund/process')
        .set('Authorization', 'Bearer valid-token')
        .send({});
      
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Request ID is required');
    });
    
    it('should process a void/refund request successfully', async () => {
      mockVoidRefundManager.processVoidRefund.resolves({
        success: true,
        message: 'Void/Refund processed successfully'
      });
      
      const res = await request(app)
        .post('/api/void-refund/process')
        .set('Authorization', 'Bearer valid-token')
        .send({
          requestId: 1
        });
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });
  });
  
  describe('GET /api/void-refund/orders/:orderId/history', () => {
    it('should return void/refund history for an order', async () => {
      const mockHistory = [
        { id: 1, order_id: 1, request_type: 'VOID', status: 'PROCESSED' }
      ];
      mockVoidRefundManager.getVoidRefundHistory.resolves(mockHistory);
      
      const res = await request(app)
        .get('/api/void-refund/orders/1/history')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.length, 1);
      assert.strictEqual(res.body[0].order_id, 1);
    });
  });
  
  describe('GET /api/void-refund/requests/:requestId/audit-logs', () => {
    it('should return audit logs for a void/refund request', async () => {
      const mockLogs = [
        { id: 1, request_id: 1, action: 'REQUEST_VOID_REFUND' }
      ];
      mockVoidRefundManager.getAuditLogs.resolves(mockLogs);
      
      const res = await request(app)
        .get('/api/void-refund/requests/1/audit-logs')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.length, 1);
      assert.strictEqual(res.body[0].action, 'REQUEST_VOID_REFUND');
    });
  });
  
  describe('GET /api/void-refund/pending', () => {
    it('should return list of pending void/refund requests', async () => {
      const mockRequests = [
        { id: 1, order_id: 1, status: 'PENDING', request_type: 'VOID' }
      ];
      mockVoidRefundManager.getPendingRequests.resolves(mockRequests);
      
      const res = await request(app)
        .get('/api/void-refund/pending')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.length, 1);
      assert.strictEqual(res.body[0].status, 'PENDING');
    });
  });
  
  describe('POST /api/void-refund/verify-pin', () => {
    it('should return 400 for missing PIN', async () => {
      const res = await request(app)
        .post('/api/void-refund/verify-pin')
        .set('Authorization', 'Bearer valid-token')
        .send({});
      
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'PIN is required');
    });
    
    it('should verify manager PIN successfully', async () => {
      mockVoidRefundManager.verifyManagerPin.resolves({
        success: true,
        userId: 1,
        username: 'Manager'
      });
      
      const res = await request(app)
        .post('/api/void-refund/verify-pin')
        .set('Authorization', 'Bearer valid-token')
        .send({
          pin: '1234'
        });
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.userId, 1);
    });
  });
  
  describe('GET /api/void-refund/orders/:orderId/check', () => {
    it('should return order void eligibility', async () => {
      mockDb.query.onCall(0).resolves({ rows: [{ id: 1, created_at: new Date().toISOString(), void_status: 'ACTIVE' }] });
      mockDb.query.onCall(1).resolves({ rows: [] }); // No payments
      
      const res = await request(app)
        .get('/api/void-refund/orders/1/check')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.canVoid, true);
      assert.strictEqual(res.body.isPaid, false);
      assert.strictEqual(res.body.requiresApproval, false);
    });
    
    it('should return false if order is already voided', async () => {
      mockDb.query.resolves({ rows: [{ id: 1, void_status: 'VOIDED' }] });
      
      const res = await request(app)
        .get('/api/void-refund/orders/1/check')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.canVoid, false);
      assert.strictEqual(res.body.reason, 'Order is already voided');
    });
    
    it('should return false if void time limit exceeded', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      mockDb.query.resolves({ rows: [{ id: 1, created_at: oldDate, void_status: 'ACTIVE' }] });
      
      const res = await request(app)
        .get('/api/void-refund/orders/1/check')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.canVoid, false);
      assert.strictEqual(res.body.reason, 'Void can only be requested within 24 hours of order creation');
    });
  });
  
  describe('GET /api/void-refund/payments/:paymentId/check', () => {
    it('should return payment refund eligibility', async () => {
      mockDb.query.onCall(0).resolves({ rows: [{ id: 1, refund_status: 'NOT_REFUNDED' }] });
      mockDb.query.onCall(1).resolves({ rows: [{ void_status: 'ACTIVE' }] });
      
      const res = await request(app)
        .get('/api/void-refund/payments/1/check')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.canRefund, true);
      assert.strictEqual(res.body.requiresApproval, true);
    });
    
    it('should return false if payment is already fully refunded', async () => {
      mockDb.query.resolves({ rows: [{ id: 1, refund_status: 'FULLY_REFUNDED' }] });
      
      const res = await request(app)
        .get('/api/void-refund/payments/1/check')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.canRefund, false);
      assert.strictEqual(res.body.reason, 'Payment already fully refunded');
    });
    
    it('should return false if order is voided', async () => {
      mockDb.query.onCall(0).resolves({ rows: [{ id: 1, refund_status: 'NOT_REFUNDED' }] });
      mockDb.query.onCall(1).resolves({ rows: [{ void_status: 'VOIDED' }] });
      
      const res = await request(app)
        .get('/api/void-refund/payments/1/check')
        .set('Authorization', 'Bearer valid-token');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.canRefund, false);
      assert.strictEqual(res.body.reason, 'Order is voided');
    });
  });
});

console.log('All integration tests completed for Void/Refund API Endpoints');
