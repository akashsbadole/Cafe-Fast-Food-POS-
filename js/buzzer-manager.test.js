// Unit tests for Buzzer Manager

const assert = require('assert');
const sinon = require('sinon');

// Mock the fetch API
global.fetch = require('node-fetch');

// Import the module (simulated since we're testing browser code)
const BuzzerManager = {
  getAll: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers');
      if (!response.ok) {
        throw new Error('Failed to fetch buzzers');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching buzzers:', error);
      return [];
    }
  },
  
  getById: async (buzzerId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/buzzers/${buzzerId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch buzzer');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching buzzer:', error);
      return null;
    }
  },
  
  getAvailable: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers/available');
      if (!response.ok) {
        throw new Error('Failed to fetch available buzzers');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching available buzzers:', error);
      return [];
    }
  },
  
  create: async (buzzerData) => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buzzerData),
      });
      if (!response.ok) {
        throw new Error('Failed to create buzzer');
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating buzzer:', error);
      return null;
    }
  },
  
  createMultiple: async (count, startNumber = 1) => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ count, startNumber }),
      });
      if (!response.ok) {
        throw new Error('Failed to create buzzers');
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating buzzers:', error);
      return [];
    }
  },
  
  update: async (buzzerId, buzzerData) => {
    try {
      const response = await fetch(`http://localhost:3000/api/buzzers/${buzzerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buzzerData),
      });
      if (!response.ok) {
        throw new Error('Failed to update buzzer');
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating buzzer:', error);
      return null;
    }
  },
  
  delete: async (buzzerId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/buzzers/${buzzerId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete buzzer');
      }
      return true;
    } catch (error) {
      console.error('Error deleting buzzer:', error);
      return false;
    }
  },
  
  assignToOrder: async (orderId, buzzerId) => {
    try {
      const response = await fetch('http://localhost:3000/api/orders/assign-buzzer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, buzzerId }),
      });
      if (!response.ok) {
        throw new Error('Failed to assign buzzer to order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error assigning buzzer to order:', error);
      return null;
    }
  },
  
  getByOrderId: async (orderId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/orders/${orderId}/buzzers`);
      if (!response.ok) {
        throw new Error('Failed to fetch buzzers for order');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching buzzers for order:', error);
      return [];
    }
  },
  
  updateStatus: async (buzzerId, status) => {
    try {
      const response = await fetch(`http://localhost:3000/api/buzzers/${buzzerId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error('Failed to update buzzer status');
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating buzzer status:', error);
      return null;
    }
  },
  
  generateNextNumber: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers/next-number');
      if (!response.ok) {
        throw new Error('Failed to generate next buzzer number');
      }
      return await response.json();
    } catch (error) {
      console.error('Error generating next buzzer number:', error);
      return null;
    }
  },
  
  resetAll: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/buzzers/reset', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to reset buzzers');
      }
      return await response.json();
    } catch (error) {
      console.error('Error resetting buzzers:', error);
      return false;
    }
  },
};

describe('BuzzerManager', () => {
  let fetchStub;
  
  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
  });
  
  afterEach(() => {
    fetchStub.restore();
  });
  
  describe('getAll()', () => {
    it('should fetch all buzzers', async () => {
      const mockResponse = [
        { id: 1, buzzer_number: 'B001', status: 'available' },
        { id: 2, buzzer_number: 'B002', status: 'occupied' },
      ];
      
      fetchStub.withArgs('http://localhost:3000/api/buzzers').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );
      
      const result = await BuzzerManager.getAll();
      assert.deepStrictEqual(result, mockResponse);
    });
    
    it('should return empty array on error', async () => {
      fetchStub.withArgs('http://localhost:3000/api/buzzers').returns(
        Promise.resolve({
          ok: false,
          status: 500,
        })
      );
      
      const result = await BuzzerManager.getAll();
      assert.deepStrictEqual(result, []);
    });
  });
  
  describe('getById()', () => {
    it('should fetch a specific buzzer by ID', async () => {
      const mockBuzzer = { id: 1, buzzer_number: 'B001', status: 'available' };
      
      fetchStub.withArgs('http://localhost:3000/api/buzzers/1').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBuzzer),
        })
      );
      
      const result = await BuzzerManager.getById(1);
      assert.deepStrictEqual(result, mockBuzzer);
    });
    
    it('should return null when buzzer not found', async () => {
      fetchStub.withArgs('http://localhost:3000/api/buzzers/999').returns(
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );
      
      const result = await BuzzerManager.getById(999);
      assert.strictEqual(result, null);
    });
  });
  
  describe('getAvailable()', () => {
    it('should fetch only available buzzers', async () => {
      const mockResponse = [
        { id: 1, buzzer_number: 'B001', status: 'available' },
        { id: 3, buzzer_number: 'B003', status: 'available' },
      ];
      
      fetchStub.withArgs('http://localhost:3000/api/buzzers/available').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );
      
      const result = await BuzzerManager.getAvailable();
      assert.deepStrictEqual(result, mockResponse);
    });
  });
  
  describe('create()', () => {
    it('should create a new buzzer', async () => {
      const buzzerData = {
        buzzer_number: 'B011',
        status: 'available',
      };
      
      fetchStub.withArgs('http://localhost:3000/api/buzzers', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 11, message: 'Buzzer created successfully' }),
        })
      );
      
      const result = await BuzzerManager.create(buzzerData);
      assert.deepStrictEqual(result, { id: 11, message: 'Buzzer created successfully' });
    });
    
    it('should return null on creation failure', async () => {
      const buzzerData = { buzzer_number: 'B011' };
      
      fetchStub.withArgs('http://localhost:3000/api/buzzers', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: false,
          status: 500,
        })
      );
      
      const result = await BuzzerManager.create(buzzerData);
      assert.strictEqual(result, null);
    });
  });
  
  describe('createMultiple()', () => {
    it('should create multiple buzzers in batch', async () => {
      const mockResponse = {
        buzzers: [
          { id: 11, buzzer_number: 'B011' },
          { id: 12, buzzer_number: 'B012' },
          { id: 13, buzzer_number: 'B013' },
        ],
        message: '3 buzzers created successfully',
      };
      
      fetchStub.withArgs('http://localhost:3000/api/buzzers/batch', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );
      
      const result = await BuzzerManager.createMultiple(3, 11);
      assert.deepStrictEqual(result, mockResponse);
    });
  });
  
  describe('update()', () => {
    it('should update a buzzer', async () => {
      const buzzerData = {
        buzzer_number: 'B001',
        status: 'occupied',
      };
      
      fetchStub.withArgs('http://localhost:3000/api/buzzers/1', sinon.match({ method: 'PUT' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Buzzer updated successfully' }),
        })
      );
      
      const result = await BuzzerManager.update(1, buzzerData);
      assert.deepStrictEqual(result, { message: 'Buzzer updated successfully' });
    });
  });
  
  describe('delete()', () => {
    it('should delete a buzzer', async () => {
      fetchStub.withArgs('http://localhost:3000/api/buzzers/1', sinon.match({ method: 'DELETE' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Buzzer deleted successfully' }),
        })
      );
      
      const result = await BuzzerManager.delete(1);
      assert.strictEqual(result, true);
    });
    
    it('should return false on deletion failure', async () => {
      fetchStub.withArgs('http://localhost:3000/api/buzzers/999', sinon.match({ method: 'DELETE' })).returns(
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );
      
      const result = await BuzzerManager.delete(999);
      assert.strictEqual(result, false);
    });
  });
  
  describe('assignToOrder()', () => {
    it('should assign a buzzer to an order', async () => {
      fetchStub.withArgs('http://localhost:3000/api/orders/assign-buzzer', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Buzzer assigned to order successfully' }),
        })
      );
      
      const result = await BuzzerManager.assignToOrder(1, 1);
      assert.deepStrictEqual(result, { message: 'Buzzer assigned to order successfully' });
    });
  });
  
  describe('getByOrderId()', () => {
    it('should get buzzers for an order', async () => {
      const mockBuzzers = [
        { id: 1, buzzer_number: 'B001' },
      ];
      
      fetchStub.withArgs('http://localhost:3000/api/orders/1/buzzers').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBuzzers),
        })
      );
      
      const result = await BuzzerManager.getByOrderId(1);
      assert.deepStrictEqual(result, mockBuzzers);
    });
  });
  
  describe('updateStatus()', () => {
    it('should update buzzer status', async () => {
      fetchStub.withArgs('http://localhost:3000/api/buzzers/1/status', sinon.match({ method: 'PUT' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Buzzer status updated successfully' }),
        })
      );
      
      const result = await BuzzerManager.updateStatus(1, 'occupied');
      assert.deepStrictEqual(result, { message: 'Buzzer status updated successfully' });
    });
  });
  
  describe('generateNextNumber()', () => {
    it('should generate next available buzzer number', async () => {
      fetchStub.withArgs('http://localhost:3000/api/buzzers/next-number').returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ buzzer_number: 'B011' }),
        })
      );
      
      const result = await BuzzerManager.generateNextNumber();
      assert.deepStrictEqual(result, { buzzer_number: 'B011' });
    });
  });
  
  describe('resetAll()', () => {
    it('should reset all buzzers to available status', async () => {
      fetchStub.withArgs('http://localhost:3000/api/buzzers/reset', sinon.match({ method: 'POST' })).returns(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'All buzzers reset to available status' }),
        })
      );
      
      const result = await BuzzerManager.resetAll();
      assert.deepStrictEqual(result, { message: 'All buzzers reset to available status' });
    });
  });
});

console.log('All BuzzerManager tests completed!');