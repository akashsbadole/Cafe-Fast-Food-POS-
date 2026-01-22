// Unit tests for WeightManager

const assert = require('assert');
const WeightManager = require('./weight-manager');
const Database = require('./database');

// Mock database for testing
class MockDatabase {
  constructor() {
    this.tables = {
      weighted_items: [],
      weight_pricing_tiers: [],
      inventory_items: [],
      inventory_weight_logs: [],
      menu_items: []
    };
  }

  run(sql, params = []) {
    // Mock table creation
    if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (tableName) {
        this.tables[tableName[1]] = this.tables[tableName[1]] || [];
      }
      return { lastInsertRowid: 1 };
    }
    return { lastInsertRowid: 1 };
  }

  exec(sql, params = []) {
    return [{ columns: [], values: [] }];
  }

  prepare(sql) {
    return this;
  }
}

// Test suite
describe('WeightManager', () => {
  let weightManager;
  let mockDb;

  beforeEach(() => {
    mockDb = new MockDatabase();
    weightManager = new WeightManager(mockDb);
  });

  describe('Initialization', () => {
    it('should initialize without errors', async () => {
      try {
        await weightManager.init();
        assert.strictEqual(true, true); // If no exception, test passes
      } catch (error) {
        assert.fail(error);
      }
    });
  });

  describe('Weight Conversion', () => {
    it('should convert grams to kilograms correctly', () => {
      const result = weightManager._convertWeight(1000, 'gram', 'kilogram');
      assert.strictEqual(result, 1);
    });

    it('should convert kilograms to grams correctly', () => {
      const result = weightManager._convertWeight(1, 'kilogram', 'gram');
      assert.strictEqual(result, 1000);
    });

    it('should convert ounces to grams correctly', () => {
      const result = weightManager._convertWeight(1, 'ounce', 'gram');
      assert.strictEqual(Math.round(result), 28);
    });

    it('should convert pounds to grams correctly', () => {
      const result = weightManager._convertWeight(1, 'pound', 'gram');
      assert.strictEqual(Math.round(result), 454);
    });

    it('should return same value when units are the same', () => {
      const result = weightManager._convertWeight(100, 'gram', 'gram');
      assert.strictEqual(result, 100);
    });
  });

  describe('Weighted Item Management', () => {
    it('should create a weighted item', async () => {
      try {
        const result = await weightManager.createWeightedItem({
          menu_item_id: 1,
          unit_weight: 1.0,
          min_weight: 1.0,
          max_weight: 1000.0,
          weight_unit: 'gram'
        });
        assert.ok(result);
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should get a weighted item by ID', async () => {
      try {
        const result = await weightManager.getWeightedItem(1);
        assert.ok(result);
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should get all weighted items', async () => {
      try {
        const result = await weightManager.getAllWeightedItems();
        assert.ok(Array.isArray(result));
      } catch (error) {
        assert.fail(error);
      }
    });
  });

  describe('Pricing Tier Management', () => {
    it('should create a pricing tier', async () => {
      try {
        const result = await weightManager.createPricingTier({
          weighted_item_id: 1,
          min_weight: 1.0,
          max_weight: 100.0,
          price: 10.0,
          display_order: 1
        });
        assert.ok(result);
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should get pricing tiers for a weighted item', async () => {
      try {
        const result = await weightManager.getPricingTiersForWeightedItem(1);
        assert.ok(Array.isArray(result));
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should update a pricing tier', async () => {
      try {
        const result = await weightManager.updatePricingTier(1, {
          min_weight: 1.0,
          max_weight: 100.0,
          price: 12.0,
          display_order: 1
        });
        assert.ok(result);
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should delete a pricing tier', async () => {
      try {
        const result = await weightManager.deletePricingTier(1);
        assert.ok(result.success);
      } catch (error) {
        assert.fail(error);
      }
    });
  });

  describe('Price Calculation', () => {
    it('should calculate price based on weight', async () => {
      try {
        // First create a weighted item
        await weightManager.createWeightedItem({
          menu_item_id: 1,
          unit_weight: 1.0,
          min_weight: 1.0,
          max_weight: 1000.0,
          weight_unit: 'gram'
        });

        // Create pricing tiers
        await weightManager.createPricingTier({
          weighted_item_id: 1,
          min_weight: 1.0,
          max_weight: 100.0,
          price: 10.0,
          display_order: 1
        });

        await weightManager.createPricingTier({
          weighted_item_id: 1,
          min_weight: 101.0,
          max_weight: 500.0,
          price: 50.0,
          display_order: 2
        });

        // Test price calculation
        const result1 = await weightManager.calculatePriceByWeight(1, 50);
        assert.strictEqual(result1.price, 10);

        const result2 = await weightManager.calculatePriceByWeight(1, 200);
        assert.strictEqual(result2.price, 50);

        // Test weight validation
        try {
          await weightManager.calculatePriceByWeight(1, 0.5);
          assert.fail('Should have thrown error for weight below minimum');
        } catch (error) {
          assert.ok(error.message.includes('at least'));
        }

        try {
          await weightManager.calculatePriceByWeight(1, 1500);
          assert.fail('Should have thrown error for weight above maximum');
        } catch (error) {
          assert.ok(error.message.includes('exceed'));
        }
      } catch (error) {
        assert.fail(error);
      }
    });
  });

  describe('Inventory Weight Tracking', () => {
    it('should initialize inventory weight', async () => {
      try {
        const result = await weightManager.initializeInventoryWeight(1, 1000, 5000, 'gram');
        assert.ok(result.success);
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should get inventory weight', async () => {
      try {
        await weightManager.initializeInventoryWeight(1, 1000, 5000, 'gram');
        const result = await weightManager.getInventoryWeight(1);
        assert.ok(result);
        assert.strictEqual(result.current_weight, 1000);
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should update inventory weight after sale', async () => {
      try {
        await weightManager.initializeInventoryWeight(1, 1000, 5000, 'gram');
        const result = await weightManager.updateInventoryWeight(1, 100, 'gram');
        assert.ok(result.success);
        assert.strictEqual(result.newWeight, 900);
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should throw error when insufficient weight', async () => {
      try {
        await weightManager.initializeInventoryWeight(1, 100, 5000, 'gram');
        await weightManager.updateInventoryWeight(1, 200, 'gram');
        assert.fail('Should have thrown error for insufficient weight');
      } catch (error) {
        assert.ok(error.message.includes('Insufficient'));
      }
    });

    it('should restock inventory weight', async () => {
      try {
        await weightManager.initializeInventoryWeight(1, 1000, 5000, 'gram');
        await weightManager.updateInventoryWeight(1, 100, 'gram');
        const result = await weightManager.restockInventoryWeight(1, 50, 'gram');
        assert.ok(result.success);
        assert.strictEqual(result.newWeight, 950);
      } catch (error) {
        assert.fail(error);
      }
    });

    it('should get weight usage history', async () => {
      try {
        await weightManager.initializeInventoryWeight(1, 1000, 5000, 'gram');
        await weightManager.updateInventoryWeight(1, 100, 'gram');
        const result = await weightManager.getWeightUsageHistory(1);
        assert.ok(Array.isArray(result));
        assert.strictEqual(result.length, 1);
      } catch (error) {
        assert.fail(error);
      }
    });
  });

  describe('Helper Methods', () => {
    it('should check if item is weighted', async () => {
      try {
        const result = await weightManager.isWeightedItem(1);
        assert.strictEqual(typeof result, 'boolean');
      } catch (error) {
        assert.fail(error);
      }
    });
  });
});

console.log('All tests completed!');
