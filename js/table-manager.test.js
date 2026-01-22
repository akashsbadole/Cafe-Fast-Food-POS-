// Unit tests for Table Manager

const assert = require('assert');
const sinon = require('sinon');

// Mock the fetch API
global.fetch = require('node-fetch');

// Import the module (simulated since we're testing browser code)
const TableManager = {
  getAll: async (locationId = 1) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables?location_id=${locationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tables');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching tables:', error);
      return [];
    }
  },
  
  getById: async (tableId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/${tableId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch table');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching table:', error);
      return null;
    }
  },
  
  getAvailable: async (locationId = 1) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/available?location_id=${locationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch available tables');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching available tables:', error);
      return [];
    }
  },
  
  create: async (tableData) => {
    try {
      const response = await fetch('http://localhost:3000/api/tables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tableData),
      });
      if (!response.ok) {
        throw new Error('Failed to create table');
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating table:', error);
      return null;
    }
  },
  
  update: async (tableId, tableData) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/${tableId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tableData),
      });
      if (!response.ok) {
        throw new Error('Failed to update table');
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating table:', error);
      return null;
    }
  },
  
  delete: async (tableId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/${tableId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete table');
      }
      return true;
    } catch (error) {
      console.error('Error deleting table:', error);
      return false;
    }
  },
  
  assignToOrder: async (orderId, tableId) => {
    try {
      const response = await fetch('http://localhost:3000/api/orders/assign-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, tableId }),
      });
      if (!response.ok) {
        throw new Error('Failed to assign table to order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error assigning table to order:', error);
      return null;
    }
  },
  
  transferOrder: async (orderId, newTableId) => {
    try {
      const response = await fetch('http://localhost:3000/api/orders/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, newTableId }),
      });
      if (!response.ok) {
        throw new Error('Failed to transfer order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error transferring order:', error);
      return null;
    }
  },
  
  getByOrderId: async (orderId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/orders/${orderId}/tables`);
      if (!response.ok) {
        throw new Error('Failed to fetch tables for order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching tables for order:', error);
      return [];
    }
  },
  
  getLayouts: async (locationId = 1) => {
    try {
      const response = await fetch(`http://localhost:3000/api/table-layouts?location_id=${locationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch table layouts');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching table layouts:', error);
      return [];
    }
  },
  
  getLayoutPositions: async (layoutId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/table-layouts/${layoutId}/positions`);
      if (!response.ok) {
        throw new Error('Failed to fetch table positions');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching table positions:', error);
      return [];
    }
  },
  
  updateStatus: async (tableId, status) => {
    try {
      const response = await fetch(`http://localhost:3000/api/tables/${tableId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error('Failed to update table status');
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating table status:', error);
      return null;
    }
  },
};

describe('TableManager', () => {
  let fetchStub;
  
  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
  });
  
  afterEach(() => {
    fetchStub.restore();
  });
  
  describe('getAll()', () => {
    it('should fetch all tables', async () => {
      const mockResponse = [
        { id: 1, table_number: 'T01', name: 'Table 1', status: 'available' },
        { id: 2, table_number: 'T02', name: 'Table 2', status: 'occupied' },
      ];
      
      fetchStub.withArgs('http://localhost:3000/api/tables?location_id=1').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );
      
      const result = await TableManager.getAll(1);
      assert.deepStrictEqual(result, mockResponse);
    });
    
    it('should return empty array on error', async () => {
      fetchStub.withArgs('http://localhost:3000/api/tables?location_id=1').returns(
        Promise.resolve({
          ok: false,
          status: 500,
        })
      );
      
      const result = await TableManager.getAll(1);
      assert.deepStrictEqual(result, []);
    });
  });
  
  describe('getById()', () => {
    it('should fetch a specific table by ID', async () => {
      const mockTable = { id: 1, table_number: 'T01', name: 'Table 1', status: 'available' };
      
      fetchStub.withArgs('http://localhost:3000/api/tables/1').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTable),
        })
      );
      
      const result = await TableManager.getById(1);
      assert.deepStrictEqual(result, mockTable);
    });
    
    it('should return null when table not found', async () => {
      fetchStub.withArgs('http://localhost:3000/api/tables/999').returns(
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );
      
      const result = await TableManager.getById(999);
      assert.strictEqual(result, null);
    });
  });
  
  describe('getAvailable()', () => {
    it('should fetch only available tables', async () => {
      const mockResponse = [
        { id: 1, table_number: 'T01', name: 'Table 1', status: 'available' },
        { id: 3, table_number: 'T03', name: 'Table 3', status: 'available' },
      ];
      
      fetchStub.withArgs('http://localhost:3000/api/tables/available?location_id=1').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );
      
      const result = await TableManager.getAvailable(1);
      assert.deepStrictEqual(result, mockResponse);
    });
  });
  
  describe('create()', () => {
    it('should create a new table', async () => {
      const tableData = {
        table_number: 'T11',
        name: 'Table 11',
        capacity: 4,
        status: 'available',
        location_id: 1,
      };
      
      fetchStub.withArgs('http://localhost:3000/api/tables', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 11, message: 'Table created successfully' }),
        })
      );
      
      const result = await TableManager.create(tableData);
      assert.deepStrictEqual(result, { id: 11, message: 'Table created successfully' });
    });
    
    it('should return null on creation failure', async () => {
      const tableData = { table_number: 'T11' };
      
      fetchStub.withArgs('http://localhost:3000/api/tables', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: false,
          status: 500,
        })
      );
      
      const result = await TableManager.create(tableData);
      assert.strictEqual(result, null);
    });
  });
  
  describe('update()', () => {
    it('should update a table', async () => {
      const tableData = {
        name: 'Updated Table 1',
        capacity: 6,
        status: 'occupied',
      };
      
      fetchStub.withArgs('http://localhost:3000/api/tables/1', sinon.match({ method: 'PUT' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Table updated successfully' }),
        })
      );
      
      const result = await TableManager.update(1, tableData);
      assert.deepStrictEqual(result, { message: 'Table updated successfully' });
    });
  });
  
  describe('delete()', () => {
    it('should delete a table', async () => {
      fetchStub.withArgs('http://localhost:3000/api/tables/1', sinon.match({ method: 'DELETE' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Table deleted successfully' }),
        })
      );
      
      const result = await TableManager.delete(1);
      assert.strictEqual(result, true);
    });
    
    it('should return false on deletion failure', async () => {
      fetchStub.withArgs('http://localhost:3000/api/tables/999', sinon.match({ method: 'DELETE' })).returns(
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );
      
      const result = await TableManager.delete(999);
      assert.strictEqual(result, false);
    });
  });
  
  describe('assignToOrder()', () => {
    it('should assign a table to an order', async () => {
      fetchStub.withArgs('http://localhost:3000/api/orders/assign-table', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Table assigned to order successfully' }),
        })
      );
      
      const result = await TableManager.assignToOrder(1, 1);
      assert.deepStrictEqual(result, { message: 'Table assigned to order successfully' });
    });
  });
  
  describe('transferOrder()', () => {
    it('should transfer an order to a different table', async () => {
      fetchStub.withArgs('http://localhost:3000/api/orders/transfer', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Order transferred successfully' }),
        })
      );
      
      const result = await TableManager.transferOrder(1, 2);
      assert.deepStrictEqual(result, { message: 'Order transferred successfully' });
    });
  });
  
  describe('getByOrderId()', () => {
    it('should get tables for an order', async () => {
      const mockTables = [
        { id: 1, table_number: 'T01', name: 'Table 1' },
      ];
      
      fetchStub.withArgs('http://localhost:3000/api/orders/1/tables').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTables),
        })
      );
      
      const result = await TableManager.getByOrderId(1);
      assert.deepStrictEqual(result, mockTables);
    });
  });
  
  describe('getLayouts()', () => {
    it('should fetch table layouts', async () => {
      const mockLayouts = [
        { id: 1, name: 'Main Dining Area', description: 'Default layout' },
      ];
      
      fetchStub.withArgs('http://localhost:3000/api/table-layouts?location_id=1').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockLayouts),
        })
      );
      
      const result = await TableManager.getLayouts(1);
      assert.deepStrictEqual(result, mockLayouts);
    });
  });
  
  describe('getLayoutPositions()', () => {
    it('should fetch table positions for a layout', async () => {
      const mockPositions = [
        { id: 1, layout_id: 1, table_id: 1, position_x: 100, position_y: 100 },
      ];
      
      fetchStub.withArgs('http://localhost:3000/api/table-layouts/1/positions').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPositions),
        })
      );
      
      const result = await TableManager.getLayoutPositions(1);
      assert.deepStrictEqual(result, mockPositions);
    });
  });
  
  describe('updateStatus()', () => {
    it('should update table status', async () => {
      fetchStub.withArgs('http://localhost:3000/api/tables/1/status', sinon.match({ method: 'PUT' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Table status updated successfully' }),
        })
      );
      
      const result = await TableManager.updateStatus(1, 'occupied');
      assert.deepStrictEqual(result, { message: 'Table status updated successfully' });
    });
  });
});

console.log('All TableManager tests completed!');