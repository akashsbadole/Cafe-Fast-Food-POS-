// Integration tests for Weight Management API Endpoints

const assert = require('assert');
const request = require('supertest');
const express = require('express');
const router = require('./enterprise-endpoints');
const jwt = require('jsonwebtoken');

// Create test app
const app = express();
app.use(express.json());
app.use('/', router);

// Mock database
const mockDb = {
  getDatabase: () => ({
    run: () => ({ lastInsertRowid: 1 }),
    exec: () => [{ columns: [], values: [] }],
    prepare: () => mockDb.getDatabase()
  }),
  query: () => ({ rows: [] }),
  user: {
    getPermissions: () => ['manage_menu', 'manage_inventory', 'view_reports', 'manage_orders']
  }
};

// Mock modules
jest.mock('./database', () => mockDb);
jest.mock('./reporting-manager', () => ({
  init: async () => {},
  logAudit: async () => {}
}));
jest.mock('./weight-manager', () => ({
  init: async () => {},
  getAllWeightedItems: async () => [{ id: 1, menu_item_id: 1, weight_unit: 'gram' }],
  getWeightedItem: async (id) => ({ id, menu_item_id: 1, weight_unit: 'gram' }),
  getWeightedItemByMenuItemId: async (menuItemId) => ({ id: 1, menu_item_id: menuItemId, weight_unit: 'gram' }),
  createWeightedItem: async (data) => ({ id: 1, ...data }),
  updateWeightedItem: async (id, data) => ({ id, ...data }),
  deleteWeightedItem: async (id) => ({ success: true, message: 'Deleted' }),
  getPricingTiersForWeightedItem: async (itemId) => [
    { id: 1, weighted_item_id: itemId, min_weight: 1, max_weight: 100, price: 10 }
  ],
  createPricingTier: async (data) => ({ id: 1, ...data }),
  updatePricingTier: async (id, data) => ({ id, ...data }),
  deletePricingTier: async (id) => ({ success: true, message: 'Deleted' }),
  calculatePriceByWeight: async (menuItemId, weight, unit) => ({
    price: 10,
    tier: { id: 1, min_weight: 1, max_weight: 100, price: 10 },
    weight,
    weightUnit: unit || 'gram'
  }),
  initializeInventoryWeight: async (menuItemId, current, max, unit) => ({ success: true }),
  getInventoryWeight: async (menuItemId) => ({ id: 1, menu_item_id: menuItemId, current_weight: 1000, max_weight: 5000, weight_unit: 'gram' }),
  updateInventoryWeight: async (menuItemId, weight, unit, orderId, orderItemId) => ({ success: true, newWeight: 900, weightUnit: 'gram' }),
  restockInventoryWeight: async (menuItemId, weight, unit) => ({ success: true, newWeight: 950, weightUnit: 'gram' }),
  getWeightUsageHistory: async (menuItemId, limit) => [
    { id: 1, menu_item_id: menuItemId, weight_used: 100, weight_unit: 'gram', current_stock: 900 }
  ],
  isWeightedItem: async (menuItemId) => true
}));

// Create test token
const testUser = { id: 1, username: 'testuser', role: 'admin' };
const token = jwt.sign(testUser, 'test-secret', { expiresIn: '1h' });

// Test suite
describe('Weight Management API Endpoints', () => {
  describe('GET /api/weight/items', () => {
    it('should return all weighted items', async () => {
      const res = await request(app)
        .get('/api/weight/items')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('GET /api/weight/items/:id', () => {
    it('should return a weighted item by ID', async () => {
      const res = await request(app)
        .get('/api/weight/items/1')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.id, 1);
    });

    it('should return 404 for non-existent item', async () => {
      const res = await request(app)
        .get('/api/weight/items/999')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('GET /api/weight/menu-items/:menuItemId', () => {
    it('should return weighted item by menu item ID', async () => {
      const res = await request(app)
        .get('/api/weight/menu-items/1')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.menu_item_id, 1);
    });

    it('should return 404 for non-weighted item', async () => {
      const res = await request(app)
        .get('/api/weight/menu-items/999')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('POST /api/weight/items', () => {
    it('should create a weighted item', async () => {
      const res = await request(app)
        .post('/api/weight/items')
        .set('Authorization', `Bearer ${token}`)
        .send({
          menu_item_id: 1,
          unit_weight: 1.0,
          min_weight: 1.0,
          max_weight: 1000.0,
          weight_unit: 'gram'
        });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.menu_item_id, 1);
    });

    it('should return 400 for missing menu_item_id', async () => {
      const res = await request(app)
        .post('/api/weight/items')
        .set('Authorization', `Bearer ${token}`)
        .send({
          unit_weight: 1.0,
          min_weight: 1.0,
          max_weight: 1000.0,
          weight_unit: 'gram'
        });

      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('PUT /api/weight/items/:id', () => {
    it('should update a weighted item', async () => {
      const res = await request(app)
        .put('/api/weight/items/1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          unit_weight: 2.0,
          min_weight: 2.0,
          max_weight: 2000.0,
          weight_unit: 'kilogram'
        });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.unit_weight, 2.0);
    });

    it('should return 404 for non-existent item', async () => {
      const res = await request(app)
        .put('/api/weight/items/999')
        .set('Authorization', `Bearer ${token}`)
        .send({
          unit_weight: 2.0,
          min_weight: 2.0,
          max_weight: 2000.0,
          weight_unit: 'kilogram'
        });

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('DELETE /api/weight/items/:id', () => {
    it('should delete a weighted item', async () => {
      const res = await request(app)
        .delete('/api/weight/items/1')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.success);
    });

    it('should return 404 for non-existent item', async () => {
      const res = await request(app)
        .delete('/api/weight/items/999')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('GET /api/weight/items/:itemId/tiers', () => {
    it('should return pricing tiers for a weighted item', async () => {
      const res = await request(app)
        .get('/api/weight/items/1/tiers')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body));
      assert.strictEqual(res.body[0].weighted_item_id, 1);
    });
  });

  describe('POST /api/weight/tiers', () => {
    it('should create a pricing tier', async () => {
      const res = await request(app)
        .post('/api/weight/tiers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          weighted_item_id: 1,
          min_weight: 1.0,
          max_weight: 100.0,
          price: 10.0,
          display_order: 1
        });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.weighted_item_id, 1);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/weight/tiers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          weighted_item_id: 1,
          min_weight: 1.0
          // Missing max_weight and price
        });

      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('PUT /api/weight/tiers/:id', () => {
    it('should update a pricing tier', async () => {
      const res = await request(app)
        .put('/api/weight/tiers/1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          min_weight: 1.0,
          max_weight: 100.0,
          price: 12.0,
          display_order: 1
        });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.price, 12.0);
    });

    it('should return 404 for non-existent tier', async () => {
      const res = await request(app)
        .put('/api/weight/tiers/999')
        .set('Authorization', `Bearer ${token}`)
        .send({
          min_weight: 1.0,
          max_weight: 100.0,
          price: 12.0,
          display_order: 1
        });

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('DELETE /api/weight/tiers/:id', () => {
    it('should delete a pricing tier', async () => {
      const res = await request(app)
        .delete('/api/weight/tiers/1')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.success);
    });

    it('should return 404 for non-existent tier', async () => {
      const res = await request(app)
        .delete('/api/weight/tiers/999')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('POST /api/weight/calculate-price', () => {
    it('should calculate price by weight', async () => {
      const res = await request(app)
        .post('/api/weight/calculate-price')
        .set('Authorization', `Bearer ${token}`)
        .send({
          menu_item_id: 1,
          weight: 50,
          weight_unit: 'gram'
        });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.price, 10);
      assert.strictEqual(res.body.weight, 50);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/weight/calculate-price')
        .set('Authorization', `Bearer ${token}`)
        .send({
          menu_item_id: 1
          // Missing weight
        });

      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('POST /api/weight/inventory/:menuItemId/init', () => {
    it('should initialize weight tracking', async () => {
      const res = await request(app)
        .post('/api/weight/inventory/1/init')
        .set('Authorization', `Bearer ${token}`)
        .send({
          current_weight: 1000,
          max_weight: 5000,
          weight_unit: 'gram'
        });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.success);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/weight/inventory/1/init')
        .set('Authorization', `Bearer ${token}`)
        .send({
          current_weight: 1000
          // Missing max_weight
        });

      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('GET /api/weight/inventory/:menuItemId', () => {
    it('should return inventory weight', async () => {
      const res = await request(app)
        .get('/api/weight/inventory/1')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.menu_item_id, 1);
      assert.strictEqual(res.body.current_weight, 1000);
    });

    it('should return 404 for non-existent inventory', async () => {
      const res = await request(app)
        .get('/api/weight/inventory/999')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('POST /api/weight/inventory/:menuItemId/update', () => {
    it('should update inventory weight after sale', async () => {
      const res = await request(app)
        .post('/api/weight/inventory/1/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          weight_used: 100,
          weight_unit: 'gram',
          order_id: 1,
          order_item_id: 1
        });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.strictEqual(res.body.newWeight, 900);
    });

    it('should return 400 for missing weight_used', async () => {
      const res = await request(app)
        .post('/api/weight/inventory/1/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          weight_unit: 'gram'
          // Missing weight_used
        });

      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('POST /api/weight/inventory/:menuItemId/restock', () => {
    it('should restock inventory weight', async () => {
      const res = await request(app)
        .post('/api/weight/inventory/1/restock')
        .set('Authorization', `Bearer ${token}`)
        .send({
          weight_added: 50,
          weight_unit: 'gram'
        });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.strictEqual(res.body.newWeight, 950);
    });

    it('should return 400 for missing weight_added', async () => {
      const res = await request(app)
        .post('/api/weight/inventory/1/restock')
        .set('Authorization', `Bearer ${token}`)
        .send({
          weight_unit: 'gram'
          // Missing weight_added
        });

      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('GET /api/weight/inventory/:menuItemId/history', () => {
    it('should return weight usage history', async () => {
      const res = await request(app)
        .get('/api/weight/inventory/1/history')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body));
      assert.strictEqual(res.body.length, 1);
      assert.strictEqual(res.body[0].menu_item_id, 1);
    });
  });

  describe('GET /api/weight/check/:menuItemId', () => {
    it('should check if item is weighted', async () => {
      const res = await request(app)
        .get('/api/weight/check/1')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.is_weighted, true);
    });
  });
});

console.log('All integration tests completed!');
