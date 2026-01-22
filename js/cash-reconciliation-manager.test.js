/**
 * Unit tests for CashReconciliationManager
 */

const assert = require('assert');
const sinon = require('sinon');

// Mock database
class MockDB {
  constructor() {
    this.data = {
      cash_drawer_reconciliations: [],
      cash_drawer_sessions: [],
      cash_drawer_transactions: [],
      cash_drawers: []
    };
    this.lastID = 0;
  }
  
  async run(sql, params = []) {
    this.lastID++;
    return { lastID: this.lastID, changes: 1 };
  }
  
  async get(sql, params = []) {
    return null;
  }
  
  async all(sql, params = []) {
    return [];
  }
}

// Mock CashDrawerManager
class MockCashDrawerManager {
  constructor() {
    this.getSessionById = sinon.stub();
    this.getTransactionsBySessionId = sinon.stub();
    this.calculateExpectedBalance = sinon.stub();
    this.closeCashDrawerSession = sinon.stub();
    this.logAudit = sinon.stub();
  }
}

// Import the manager
const CashReconciliationManager = require('./cash-reconciliation-manager');

describe('CashReconciliationManager', () => {
  let manager;
  let mockDB;
  let mockLogger;
  let mockCashDrawerManager;
  
  beforeEach(() => {
    mockDB = new MockDB();
    mockLogger = {
      info: sinon.stub(),
      error: sinon.stub()
    };
    mockCashDrawerManager = new MockCashDrawerManager();
    manager = new CashReconciliationManager(mockDB, mockLogger, mockCashDrawerManager);
  });
  
  describe('startReconciliation', () => {
    it('should start reconciliation and close session', async () => {
      const session = {
        id: 1,
        cash_drawer_id: 1,
        opened_by: 1,
        opening_balance: 1000.00,
        status: 'open'
      };
      
      const transactions = [
        { transaction_type: 'PAYMENT', amount: 500.00 },
        { transaction_type: 'PAYMENT', amount: 300.00 }
      ];
      
      const expectedAmount = 1800.00;
      const actualCount = 1800.00;
      const difference = 0.00;
      
      // Setup mocks
      mockCashDrawerManager.getSessionById = sinon.stub().resolves(session);
      mockCashDrawerManager.getTransactionsBySessionId = sinon.stub().resolves(transactions);
      mockCashDrawerManager.calculateExpectedBalance = sinon.stub().returns(expectedAmount);
      mockCashDrawerManager.closeCashDrawerSession = sinon.stub().resolves({ ...session, status: 'closed' });
      
      mockDB.get = async (sql, params) => {
        return {
          id: 1,
          session_id: 1,
          reconciled_by: 1,
          reconciled_at: new Date(),
          actual_count: actualCount,
          expected_amount: expectedAmount,
          difference: difference,
          status: 'completed'
        };
      };
      
      const result = await manager.startReconciliation(1, 1, actualCount, 'Reconciliation notes', 'No difference');
      
      assert.strictEqual(result.session_id, 1);
      assert.strictEqual(result.reconciled_by, 1);
      assert.strictEqual(result.actual_count, actualCount);
      assert.strictEqual(result.expected_amount, expectedAmount);
      assert.strictEqual(result.difference, difference);
      assert.strictEqual(result.status, 'completed');
      
      // Verify closeCashDrawerSession was called
      assert(mockCashDrawerManager.closeCashDrawerSession.calledOnce);
    });
    
    it('should throw error if session not found', async () => {
      mockCashDrawerManager.getSessionById = sinon.stub().resolves(null);
      
      await assert.rejects(
        manager.startReconciliation(999, 1, 1000.00),
        /Session not found/
      );
    });
    
    it('should throw error if session already closed', async () => {
      const closedSession = { id: 1, status: 'closed' };
      mockCashDrawerManager.getSessionById = sinon.stub().resolves(closedSession);
      
      await assert.rejects(
        manager.startReconciliation(1, 1, 1000.00),
        /Session not found or not open/
      );
    });
  });
  
  describe('getReconciliationById', () => {
    it('should return reconciliation by ID', async () => {
      const expectedReconciliation = {
        id: 1,
        session_id: 1,
        reconciled_by: 1,
        actual_count: 1000.00,
        expected_amount: 1000.00,
        difference: 0.00
      };
      
      mockDB.get = async (sql, params) => {
        return expectedReconciliation;
      };
      
      const result = await manager.getReconciliationById(1);
      
      assert.deepStrictEqual(result, expectedReconciliation);
    });
    
    it('should return null for non-existent reconciliation', async () => {
      mockDB.get = async (sql, params) => {
        return null;
      };
      
      const result = await manager.getReconciliationById(999);
      
      assert.strictEqual(result, null);
    });
  });
  
  describe('getReconciliationsBySessionId', () => {
    it('should return reconciliations for session', async () => {
      const reconciliations = [
        { id: 1, session_id: 1, actual_count: 1000.00 },
        { id: 2, session_id: 1, actual_count: 1500.00 }
      ];
      
      mockDB.all = async (sql, params) => {
        return reconciliations;
      };
      
      const result = await manager.getReconciliationsBySessionId(1);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].session_id, 1);
    });
  });
  
  describe('getReconciliationsByCashDrawerId', () => {
    it('should return reconciliations for cash drawer', async () => {
      const reconciliations = [
        { id: 1, session_id: 1, cash_drawer_id: 1 },
        { id: 2, session_id: 2, cash_drawer_id: 1 }
      ];
      
      mockDB.all = async (sql, params) => {
        return reconciliations;
      };
      
      const result = await manager.getReconciliationsByCashDrawerId(1, {
        dateFrom: '2023-01-01',
        dateTo: '2023-12-31'
      });
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].cash_drawer_id, 1);
    });
  });
  
  describe('calculateReconciliationSummary', () => {
    it('should calculate reconciliation summary', async () => {
      const session = {
        id: 1,
        cash_drawer_id: 1,
        opened_by: 1,
        opening_balance: 1000.00,
        status: 'open'
      };
      
      const transactions = [
        { transaction_type: 'PAYMENT', amount: 500.00 },
        { transaction_type: 'PAYMENT', amount: 300.00 },
        { transaction_type: 'REFUND', amount: 100.00 }
      ];
      
      const expectedAmount = 1700.00;
      
      mockCashDrawerManager.getSessionById = sinon.stub().resolves(session);
      mockCashDrawerManager.getTransactionsBySessionId = sinon.stub().resolves(transactions);
      mockCashDrawerManager.calculateExpectedBalance = sinon.stub().returns(expectedAmount);
      
      mockDB.all = async (sql, params) => {
        return []; // No reconciliations yet
      };
      
      const result = await manager.calculateReconciliationSummary(1);
      
      assert.strictEqual(result.session_id, 1);
      assert.strictEqual(result.cash_drawer_id, 1);
      assert.strictEqual(result.opening_balance, 1000.00);
      assert.strictEqual(result.expected_amount, expectedAmount);
      assert.strictEqual(result.actual_count, null);
      assert.strictEqual(result.transactions_count, 3);
      assert.strictEqual(result.total_payments, 800.00);
      assert.strictEqual(result.total_refunds, 100.00);
    });
  });
  
  describe('generateReconciliationReport', () => {
    it('should generate reconciliation report', async () => {
      const sessions = [
        {
          id: 1,
          cash_drawer_id: 1,
          opened_by: 1,
          opened_at: '2023-01-01',
          closed_at: '2023-01-01',
          opening_balance: 1000.00,
          closing_balance: 1800.00,
          expected_balance: 1800.00,
          over_short_amount: 0.00
        }
      ];
      
      mockDB.all = async (sql, params) => {
        return sessions;
      };
      
      const result = await manager.generateReconciliationReport({
        cash_drawer_id: 1,
        date_from: '2023-01-01',
        date_to: '2023-01-01'
      });
      
      assert.strictEqual(result.sessions.length, 1);
      assert.strictEqual(result.summary.total_sessions, 1);
      assert.strictEqual(result.summary.total_opening_balance, 1000.00);
      assert.strictEqual(result.summary.total_closing_balance, 1800.00);
    });
  });
  
  describe('generateDailyReport', () => {
    it('should generate daily report', async () => {
      const date = new Date('2023-01-01');
      
      mockDB.all = async (sql, params) => {
        return [];
      };
      
      // Mock the date range
      const originalDate = global.Date;
      global.Date = class extends originalDate {
        constructor(...args) {
          if (args.length === 0) {
            return new originalDate('2023-01-01');
          }
          return new originalDate(...args);
        }
      };
      
      const result = await manager.generateDailyReport(date);
      
      assert.strictEqual(result.sessions.length, 0);
      
      // Restore Date
      global.Date = originalDate;
    });
  });
  
  describe('generateWeeklyReport', () => {
    it('should generate weekly report', async () => {
      const date = new Date('2023-01-15'); // Wednesday
      
      mockDB.all = async (sql, params) => {
        return [];
      };
      
      const result = await manager.generateWeeklyReport(date);
      
      assert.strictEqual(result.sessions.length, 0);
    });
  });
  
  describe('generateMonthlyReport', () => {
    it('should generate monthly report', async () => {
      const date = new Date('2023-01-15');
      
      mockDB.all = async (sql, params) => {
        return [];
      };
      
      const result = await manager.generateMonthlyReport(date);
      
      assert.strictEqual(result.sessions.length, 0);
    });
  });
  
  describe('getCashDrawerActivitySummary', () => {
    it('should return activity summary', async () => {
      const summary = {
        total_sessions: 10,
        open_sessions: 2,
        closed_sessions: 8,
        total_opening_balance: 10000.00,
        total_closing_balance: 12000.00,
        total_expected_balance: 12000.00,
        total_over_short: 0.00
      };
      
      mockDB.get = async (sql, params) => {
        return summary;
      };
      
      const result = await manager.getCashDrawerActivitySummary(1, {
        date_from: '2023-01-01',
        date_to: '2023-12-31'
      });
      
      assert.strictEqual(result.total_sessions, 10);
      assert.strictEqual(result.closed_sessions, 8);
    });
  });
  
  describe('verifyCashDrawerBalance', () => {
    it('should verify balance and return result', async () => {
      const session = {
        id: 1,
        cash_drawer_id: 1,
        opening_balance: 1000.00
      };
      
      const transactions = [
        { transaction_type: 'PAYMENT', amount: 500.00 },
        { transaction_type: 'PAYMENT', amount: 300.00 }
      ];
      
      const expectedAmount = 1800.00;
      const actualCount = 1800.00;
      
      mockCashDrawerManager.getSessionById = sinon.stub().resolves(session);
      mockCashDrawerManager.getTransactionsBySessionId = sinon.stub().resolves(transactions);
      mockCashDrawerManager.calculateExpectedBalance = sinon.stub().returns(expectedAmount);
      
      const result = await manager.verifyCashDrawerBalance(1, actualCount);
      
      assert.strictEqual(result.session_id, 1);
      assert.strictEqual(result.expected_amount, expectedAmount);
      assert.strictEqual(result.actual_count, actualCount);
      assert.strictEqual(result.difference, 0.00);
      assert.strictEqual(result.is_balanced, true);
    });
    
    it('should detect imbalance', async () => {
      const session = {
        id: 1,
        cash_drawer_id: 1,
        opening_balance: 1000.00
      };
      
      const transactions = [
        { transaction_type: 'PAYMENT', amount: 500.00 }
      ];
      
      const expectedAmount = 1500.00;
      const actualCount = 1600.00; // Over by 100
      
      mockCashDrawerManager.getSessionById = sinon.stub().resolves(session);
      mockCashDrawerManager.getTransactionsBySessionId = sinon.stub().resolves(transactions);
      mockCashDrawerManager.calculateExpectedBalance = sinon.stub().returns(expectedAmount);
      
      const result = await manager.verifyCashDrawerBalance(1, actualCount);
      
      assert.strictEqual(result.difference, 100.00);
      assert.strictEqual(result.is_balanced, false);
    });
  });
  
  describe('getReconciliationHistory', () => {
    it('should return reconciliation history', async () => {
      const history = [
        {
          id: 1,
          session_id: 1,
          reconciled_at: '2023-01-01',
          actual_count: 1000.00,
          expected_amount: 1000.00,
          difference: 0.00
        },
        {
          id: 2,
          session_id: 2,
          reconciled_at: '2023-01-02',
          actual_count: 1500.00,
          expected_amount: 1500.00,
          difference: 0.00
        }
      ];
      
      mockDB.all = async (sql, params) => {
        return history;
      };
      
      const result = await manager.getReconciliationHistory(1, { limit: 10 });
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].session_id, 1);
    });
  });
});

console.log('CashReconciliationManager tests completed');
