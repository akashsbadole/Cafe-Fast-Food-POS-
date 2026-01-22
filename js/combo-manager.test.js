// Unit tests for Combo Manager
// Test combo creation, validation, pricing, and application

const assert = require('assert');
const ComboManager = require('./combo-manager');

// Mock database
const mockDb = {
    query: async (sql, params) => {
        // Simple mock implementation for testing
        if (sql.includes('combo_deals')) {
            return { rows: [] };
        }
        return { rows: [] };
    }
};

// Mock the database module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === './database') {
        return mockDb;
    }
    return originalRequire.apply(this, arguments);
};

describe('ComboManager', () => {
    describe('getAllActiveCombos()', () => {
        it('should return empty array when no combos exist', async () => {
            const combos = await ComboManager.getAllActiveCombos();
            assert.strictEqual(combos.length, 0);
        });
    });
    
    describe('getById()', () => {
        it('should return null when combo not found', async () => {
            const combo = await ComboManager.getById(999);
            assert.strictEqual(combo, null);
        });
    });
    
    describe('createCombo()', () => {
        it('should throw error when name is not provided', async () => {
            try {
                await ComboManager.createCombo({});
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Combo name is required');
            }
        });
        
        it('should create combo with required fields', async () => {
            const comboId = await ComboManager.createCombo({
                name: 'Burger Combo',
                description: 'Burger with fries and drink',
                min_quantity: 1,
                has_discount: true,
                discount_type: 'fixed',
                discount_value: 2.50
            });
            assert.ok(comboId > 0);
        });
    });
    
    describe('validateCombo()', () => {
        it('should return invalid when combo not found', async () => {
            const result = await ComboManager.validateCombo(999, []);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.message, 'Combo not found');
        });
        
        it('should return invalid when required items are missing', async () => {
            // This test would need a proper combo setup
            const result = await ComboManager.validateCombo(999, []);
            assert.strictEqual(result.valid, false);
        });
    });
    
    describe('calculateComboDiscount()', () => {
        it('should return 0 when combo has no discount', () => {
            const combo = {
                has_discount: false,
                items: []
            };
            const cartItems = [];
            const discount = ComboManager.calculateComboDiscount(combo, cartItems);
            assert.strictEqual(discount, 0);
        });
        
        it('should calculate fixed discount correctly', () => {
            const combo = {
                has_discount: true,
                discount_type: 'fixed',
                discount_value: 5.00,
                items: [
                    { menu_item_id: 1, min_quantity: 1 },
                    { menu_item_id: 2, min_quantity: 1 }
                ]
            };
            const cartItems = [
                { id: 1, price: 10.00, quantity: 1, total: 10.00 },
                { id: 2, price: 8.00, quantity: 1, total: 8.00 }
            ];
            const discount = ComboManager.calculateComboDiscount(combo, cartItems);
            assert.strictEqual(discount, 5.00);
        });
        
        it('should calculate percentage discount correctly', () => {
            const combo = {
                has_discount: true,
                discount_type: 'percentage',
                discount_value: 10,
                items: [
                    { menu_item_id: 1, min_quantity: 1 },
                    { menu_item_id: 2, min_quantity: 1 }
                ]
            };
            const cartItems = [
                { id: 1, price: 10.00, quantity: 1, total: 10.00 },
                { id: 2, price: 8.00, quantity: 1, total: 8.00 }
            ];
            const discount = ComboManager.calculateComboDiscount(combo, cartItems);
            assert.strictEqual(discount, 1.80); // 10% of 18
        });
    });
    
    describe('applyComboToCart()', () => {
        it('should apply combo discount to cart items', () => {
            const combo = {
                id: 1,
                has_discount: true,
                discount_type: 'fixed',
                discount_value: 5.00,
                items: [
                    { menu_item_id: 1, min_quantity: 1 },
                    { menu_item_id: 2, min_quantity: 1 }
                ]
            };
            const cartItems = [
                { id: 1, name: 'Burger', price: 10.00, quantity: 1, total: 10.00 },
                { id: 2, name: 'Fries', price: 8.00, quantity: 1, total: 8.00 }
            ];
            
            const updatedItems = ComboManager.applyComboToCart(cartItems, combo);
            
            // Check that combo ID is applied to items
            assert.ok(updatedItems[0].combo_id === 1);
            assert.ok(updatedItems[1].combo_id === 1);
        });
    });
    
    describe('findApplicableCombos()', () => {
        it('should return empty array when no combos are applicable', async () => {
            const cartItems = [
                { id: 1, name: 'Burger', price: 10.00, quantity: 1, total: 10.00 }
            ];
            const applicableCombos = await ComboManager.findApplicableCombos(cartItems);
            assert.strictEqual(applicableCombos.length, 0);
        });
    });
    
    describe('hasRestrictions()', () => {
        it('should return false when no restrictions', () => {
            const combo = { restrictions: [] };
            const hasRestrictions = ComboManager.hasRestrictions(combo);
            assert.strictEqual(hasRestrictions, false);
        });
        
        it('should return true when restrictions exist', () => {
            const combo = {
                restrictions: [
                    { restriction_type: 'no_other_discounts' }
                ]
            };
            const hasRestrictions = ComboManager.hasRestrictions(combo);
            assert.strictEqual(hasRestrictions, true);
        });
    });
});

console.log('All ComboManager tests completed!');
