/**
 * Unit tests for CashDrawerManager
 */

const assert = require('assert');
const sinon = require('sinon');
const { Database } = require('sqlite3').verbose();

// Mock database
class MockDB {
  constructor() {
    this.data = {
      cash_drawers: [],
      cash_drawer_sessions: [],
      cash_drawer_transactions: [],
      cash_drawer_reconciliations: [],
      cash_drawer_audit_logs: [],
      users: []
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

// Import the manager
const CashDrawerManager = require('./cash-drawer-manager');

describe('CashDrawerManager', () => {
  let manager;
  let mockDB;
  let mockLogger;
  
  beforeEach(() => {
    mockDB = new MockDB();
    mockLogger = {
      info: sinon.stub(),
      error: sinon.stub()
    };
    manager = new CashDrawerManager(mockDB, mockLogger);
  });
  
  describe('createCashDrawer', () => {
    it('should create a new cash drawer', async () => {
      const drawerData = {
        name: 'Main Cash Drawer',
        location: 'Counter 1',
        description: 'Primary cash drawer',
        is_active: true
      };
      
      // Mock the run method to return the created drawer
      mockDB.run = async (sql, params) => {
        const id = ++mockDB.lastID;
        mockDB.data.cash_drawers.push({
          id,
          ...drawerData,
          created_at: new Date(),
          updated_at: new Date()
        });
        return { lastID: id, changes: 1 };
      };
      
      const result = await manager.createCashDrawer(drawerData);
      
      assert.strictEqual(result.id, 1);
      assert.strictEqual(result.name, 'Main Cash Drawer');
      assert.strictEqual(result.location, 'Counter 1');
    });
  });
  
  describe('getCashDrawers', () => {
    it('should return all cash drawers', async () => {
      // Mock data
      mockDB.data.cash_drawers = [
        { id: 1, name: 'Drawer 1', is_active: true },
        { id: 2, name: 'Drawer 2', is_active: true },
        { id: 3, name: 'Drawer 3', is_active: false }
      ];
      
      mockDB.all = async (sql, params) => {
        return mockDB.data.cash_drawers.filter(d => d.is_active);
      };
      
      const result = await manager.getCashDrawers({ activeOnly: true });
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, 'Drawer 1');
      assert.strictEqual(result[1].name, 'Drawer 2');
    });
  });
  
  describe('getCashDrawerById', () => {
    it('should return cash drawer by ID', async () => {
      const expectedDrawer = { id: 1, name: 'Main Drawer', is_active: true };
      
      mockDB.get = async (sql, params) => {
        return expectedDrawer;
      };
      
      const result = await manager.getCashDrawerById(1);
      
      assert.deepStrictEqual(result, expectedDrawer);
    });
    
    it('should return null for non-existent drawer', async () => {
      mockDB.get = async (sql, params) => {
        return null;
      };
      
      const result = await manager.getCashDrawerById(999);
      
      assert.strictEqual(result, null);
    });
  });
  
  describe('updateCashDrawer', () => {
    it('should update cash drawer', async () => {
      const oldDrawer = { id: 1, name: 'Old Name', location: 'Old Location' };
      const updates = { name: 'New Name', location: 'New Location' };
      
      mockDB.get = async (sql, params) => {
        return { id: 1, ...updates, updated_at: new Date() };
      };
      
      const result = await manager.updateCashDrawer(1, updates);
      
      assert.strictEqual(result.id, 1);
      assert.strictEqual(result.name, 'New Name');
      assert.strictEqual(result.location, 'New Location');
    });
  });
  
  describe('deleteCashDrawer', () => {
    it('should soft delete cash drawer', async () => {
      mockDB.run = async (sql, params) => {
        return { changes: 1 };
      };
      
      const result = await manager.deleteCashDrawer(1);
      
      assert.strictEqual(result, true);
    });
  });
  
  describe('openCashDrawerSession', () => {
    it('should open a new session', async () => {
      // Setup mock drawer
      mockDB.get = async (sql, params) => {
        if (sql.includes('cash_drawers')) {
          return { id: 1, name: 'Main Drawer', is_active: true };
        }
        return null;
      };
      
      const sessionData = {
        cash_drawer_id: 1,
        opened_by: 1,
        opening_balance: 1000.00,
        notes: 'Start of shift'
      };
      
      mockDB.get = async (sql, params) => {
        if (sql.includes('cash_drawers')) {
          return { id: 1, name: 'Main Drawer', is_active: true };
        }
        if (sql.includes('cash_drawer_sessions') && sql.includes('OPEN_SESSION')) {
          return {
            id: 1,
            cash_drawer_id: 1,
            opened_by: 1,
            opened_at: new Date(),
            opening_balance: 1000.00,
            status: 'open',
            notes: 'Start of shift'
          };
        }
        return null;
      };
      
      const result = await manager.openCashDrawerSession(sessionData);
      
      assert.strictEqual(result.cash_drawer_id, 1);
      assert.strictEqual(result.opened_by, 1);
      assert.strictEqual(result.opening_balance, 1000.00);
      assert.strictEqual(result.status, 'open');
    });
    
    it('should throw error if drawer not active', async () => {
      mockDB.get = async (sql, params) => {
        return { id: 1, name: 'Main Drawer', is_active: false };
      };
      
      await assert.rejects(
        manager.openCashDrawerSession({ cash_drawer_id: 1, opened_by: 1, opening_balance: 1000.00 }),
        /Cash drawer not found or not active/
      );
    });
  });
  
  describe('getOpenSessionByDrawerId', () => {
    it('should return open session', async () => {
      const expectedSession = {
        id: 1,
        cash_drawer_id: 1,
        status: 'open',
        opened_at: new Date()
      };
      
      mockDB.get = async (sql, params) => {
        return expectedSession;
      };
      
      const result = await manager.getOpenSessionByDrawerId(1);
      
      assert.deepStrictEqual(result, expectedSession);
    });
    
    it('should return null if no open session', async () => {
      mockDB.get = async (sql, params) => {
        return null;
      };
      
      const result = await manager.getOpenSessionByDrawerId(1);
      
      assert.strictEqual(result, null);
    });
  });
  
  describe('getSessionsByDrawerId', () => {
    it('should return sessions for drawer', async () => {
      const sessions = [
        { id: 1, cash_drawer_id: 1, status: 'closed' },
        { id: 2, cash_drawer_id: 1, status: 'open' }
      ];
      
      mockDB.all = async (sql, params) => {
        return sessions;
      };
      
      const result = await manager.getSessionsByDrawerId(1);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].cash_drawer_id, 1);
    });
  });
  
  describe('closeCashDrawerSession', () => {
    it('should close a session', async () => {
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
      
      mockDB.get = async (sql, params) => {
        if (sql.includes('cash_drawer_sessions') && !sql.includes('UPDATE')) {
          return session;
        }
        return {
          id: 1,
          cash_drawer_id: 1,
          opened_by: 1,
          opened_at: new Date(),
          opening_balance: 1000.00,
          closing_balance: 1800.00,
          expected_balance: 1800.00,
          over_short_amount: 0.00,
          status: 'closed',
          updated_at: new Date()
        };
      };
      
      mockDB.all = async (sql, params) => {
        return transactions;
      };
      
      const result = await manager.closeCashDrawerSession(1, 1, {
        closing_balance: 1800.00,
        notes: 'End of shift'
      });
      
      assert.strictEqual(result.status, 'closed');
      assert.strictEqual(result.closing_balance, 1800.00);
      assert.strictEqual(result.expected_balance, 1800.00);
    });
  });
  
  describe('calculateExpectedBalance', () => {
    it('should calculate expected balance correctly', () => {
      const openingBalance = 1000.00;
      const transactions = [
        { transaction_type: 'PAYMENT', amount: 500.00 },
        { transaction_type: 'REFUND', amount: 100.00 },
        { transaction_type: 'CASH_IN', amount: 200.00 }
      ];
      
      const result = manager.calculateExpectedBalance(openingBalance, transactions);
      
      assert.strictEqual(result, 1600.00);
    });
  });
  
  describe('recordTransaction', () => {
    it('should record a transaction', async () => {
      const session = { id: 1, cash_drawer_id: 1, status: 'open' };
      
      mockDB.get = async (sql, params) => {
        if (sql.includes('cash_drawer_sessions') && !sql.includes('INSERT')) {
          return session;
        }
        return {
          id: 1,
          session_id: 1,
          transaction_type: 'PAYMENT',
          amount: 500.00,
          reference_id: 100,
          reference_type: 'payment',
          description: 'Order #123'
        };
      };
      
      const result = await manager.recordTransaction({
        session_id: 1,
        transaction_type: 'PAYMENT',
        amount: 500.00,
        reference_id: 100,
        reference_type: 'payment',
        description: 'Order #123'
      });
      
      assert.strictEqual(result.session_id, 1);
      assert.strictEqual(result.transaction_type, 'PAYMENT');
      assert.strictEqual(result.amount, 500.00);
    });
  });
  
  describe('getTransactionsBySessionId', () => {
    it('should return transactions for session', async () => {
      const transactions = [
        { id: 1, session_id: 1, transaction_type: 'PAYMENT', amount: 500.00 },
        { id: 2, session_id: 1, transaction_type: 'PAYMENT', amount: 300.00 }
      ];
      
      mockDB.all = async (sql, params) => {
        return transactions;
      };
      
      const result = await manager.getTransactionsBySessionId(1);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].session_id, 1);
    });
  });
  
  describe('transferCashDrawerSession', () => {
    it('should transfer session to another user', async () => {
      const session = { id: 1, cash_drawer_id: 1, opened_by: 1, status: 'open' };
      
      mockDB.get = async (sql, params) => {
        if (sql.includes('cash_drawer_sessions') && !sql.includes('UPDATE')) {
          return session;
        }
        return {
          id: 1,
          cash_drawer_id: 1,
          opened_by: 2,
          status: 'open',
          notes: 'Transferred to user 2',
          updated_at: new Date()
        };
      };
      
      const result = await manager.transferCashDrawerSession(1, 2, 'Transferred to user 2');
      
      assert.strictEqual(result.opened_by, 2);
      assert.strictEqual(result.notes, 'Transferred to user 2');
    });
  });
  
  describe('logAudit', () => {
    it('should log audit trail', async () => {
      mockDB.run = async (sql, params) => {
        return { changes: 1 };
      };
      
      await manager.logAudit({
        cash_drawer_id: 1,
        session_id: 1,
        user_id: 1,
        action: 'OPEN_SESSION',
        details: JSON.stringify({ session_id: 1, opening_balance: 1000.00 })
      });
      
      assert(mockDB.run.calledOnce);
    });
  });
  
  describe('getAuditLogs', () => {
    it('should return audit logs', async () => {
      const logs = [
        { id: 1, action: 'OPEN_SESSION', cash_drawer_id: 1 },
        { id: 2, action: 'PAYMENT', cash_drawer_id: 1 }
      ];
      
      mockDB.all = async (sql, params) => {
        return logs;
      };
      
      const result = await manager.getAuditLogs({ cash_drawer_id: 1 });
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].action, 'OPEN_SESSION');
    });
  });
  
  describe('getCashDrawerSummary', () => {
    it('should return cash drawer summary', async () => {
      const drawer = { id: 1, name: 'Main Drawer', is_active: true };
      const openSession = { id: 1, cash_drawer_id: 1, status: 'open' };
      
      mockDB.get = async (sql, params) => {
        if (sql.includes('cash_drawers')) {
          return drawer;
        }
        return openSession;
      };
      
      const result = await manager.getCashDrawerSummary(1);
      
      assert.strictEqual(result.cash_drawer.id, 1);
      assert.strictEqual(result.open_session.id, 1);
      assert.strictEqual(result.status, 'open');
    });
  });
});

console.log('CashDrawerManager tests completed');
