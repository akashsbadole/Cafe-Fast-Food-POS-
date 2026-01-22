// Integration tests for Combo API Endpoints
// Test the REST API endpoints for combo deals

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Import the enterprise endpoints
const enterpriseRouter = require('./enterprise-endpoints');

// Create test app
const app = express();
app.use(express.json());
app.use('/api', enterpriseRouter);

// Mock authentication middleware
app.use((req, res, next) => {
    // Skip authentication for testing
    req.user = { id: 1, email: 'test@example.com', permissions: ['manage_menu', 'manage_orders'] };
    next();
});

// Mock JWT secret
process.env.JWT_SECRET = 'test-secret';

describe('Combo API Endpoints', () => {
    describe('GET /api/combos', () => {
        it('should return array of combos', async () => {
            const res = await request(app)
                .get('/api/combos')
                .expect(200);
            
            assert.ok(Array.isArray(res.body));
        });
    });
    
    describe('POST /api/combos', () => {
        it('should create a new combo deal', async () => {
            const res = await request(app)
                .post('/api/combos')
                .send({
                    name: 'Test Combo',
                    description: 'Test combo for integration testing',
                    min_quantity: 1,
                    has_discount: true,
                    discount_type: 'fixed',
                    discount_value: 2.50
                })
                .expect(201);
            
            assert.ok(res.body.id);
            assert.strictEqual(res.body.message, 'Combo deal created successfully');
        });
        
        it('should return 400 when name is missing', async () => {
            const res = await request(app)
                .post('/api/combos')
                .send({})
                .expect(400);
            
            assert.strictEqual(res.body.error, 'Combo name is required');
        });
    });
    
    describe('PUT /api/combos/:id', () => {
        it('should update an existing combo', async () => {
            // First create a combo
            const createRes = await request(app)
                .post('/api/combos')
                .send({
                    name: 'Update Test Combo',
                    description: 'Original description',
                    min_quantity: 1
                });
            
            const comboId = createRes.body.id;
            
            // Now update it
            const res = await request(app)
                .put(`/api/combos/${comboId}`)
                .send({
                    name: 'Updated Combo Name',
                    description: 'Updated description',
                    min_quantity: 2
                })
                .expect(200);
            
            assert.strictEqual(res.body.message, 'Combo deal updated successfully');
        });
    });
    
    describe('POST /api/combos/:comboId/items', () => {
        it('should add item to combo', async () => {
            // Create a combo first
            const createRes = await request(app)
                .post('/api/combos')
                .send({
                    name: 'Item Test Combo',
                    min_quantity: 1
                });
            
            const comboId = createRes.body.id;
            
            // Add item to combo
            const res = await request(app)
                .post(`/api/combos/${comboId}/items`)
                .send({
                    menu_item_id: 1,
                    is_required: true,
                    min_quantity: 1,
                    max_quantity: 5
                })
                .expect(201);
            
            assert.strictEqual(res.body.message, 'Item added to combo successfully');
        });
        
        it('should return 400 when menu_item_id is missing', async () => {
            const res = await request(app)
                .post('/api/combos/1/items')
                .send({})
                .expect(400);
            
            assert.strictEqual(res.body.error, 'Menu item ID is required');
        });
    });
    
    describe('POST /api/combos/:id/pricing', () => {
        it('should set combo pricing', async () => {
            // Create a combo first
            const createRes = await request(app)
                .post('/api/combos')
                .send({
                    name: 'Pricing Test Combo',
                    min_quantity: 1
                });
            
            const comboId = createRes.body.id;
            
            // Set pricing
            const res = await request(app)
                .post(`/api/combos/${comboId}/pricing`)
                .send({
                    price: 15.99,
                    valid_from: '2024-01-01',
                    valid_to: '2024-12-31'
                })
                .expect(200);
            
            assert.strictEqual(res.body.message, 'Combo pricing set successfully');
        });
        
        it('should return 400 when price is missing', async () => {
            const res = await request(app)
                .post('/api/combos/1/pricing')
                .send({})
                .expect(400);
            
            assert.strictEqual(res.body.error, 'Price is required');
        });
    });
    
    describe('POST /api/combos/validate', () => {
        it('should validate combo eligibility', async () => {
            // Create a combo first
            const createRes = await request(app)
                .post('/api/combos')
                .send({
                    name: 'Validation Test Combo',
                    min_quantity: 1
                });
            
            const comboId = createRes.body.id;
            
            // Validate with cart items
            const res = await request(app)
                .post('/api/combos/validate')
                .send({
                    combo_id: comboId,
                    cart_items: [
                        { id: 1, name: 'Test Item', price: 10.00, quantity: 1, total: 10.00 }
                    ]
                })
                .expect(200);
            
            assert.ok('valid' in res.body);
            assert.ok('message' in res.body);
        });
    });
    
    describe('POST /api/combos/find-applicable', () => {
        it('should find applicable combos for cart', async () => {
            const res = await request(app)
                .post('/api/combos/find-applicable')
                .send({
                    cart_items: [
                        { id: 1, name: 'Burger', price: 10.00, quantity: 1, total: 10.00 },
                        { id: 2, name: 'Fries', price: 5.00, quantity: 1, total: 5.00 }
                    ]
                })
                .expect(200);
            
            assert.ok(Array.isArray(res.body));
        });
        
        it('should return 400 when cart_items is missing', async () => {
            const res = await request(app)
                .post('/api/combos/find-applicable')
                .send({})
                .expect(400);
            
            assert.strictEqual(res.body.error, 'Cart items are required');
        });
    });
    
    describe('POST /api/combos/apply', () => {
        it('should apply combo to cart items', async () => {
            // Create a combo first
            const createRes = await request(app)
                .post('/api/combos')
                .send({
                    name: 'Apply Test Combo',
                    min_quantity: 1,
                    has_discount: true,
                    discount_type: 'fixed',
                    discount_value: 2.50
                });
            
            const comboId = createRes.body.id;
            
            // Apply combo
            const res = await request(app)
                .post('/api/combos/apply')
                .send({
                    combo_id: comboId,
                    cart_items: [
                        { id: 1, name: 'Burger', price: 10.00, quantity: 1, total: 10.00 },
                        { id: 2, name: 'Fries', price: 5.00, quantity: 1, total: 5.00 }
                    ]
                })
                .expect(200);
            
            assert.ok(Array.isArray(res.body.items));
            assert.ok(res.body.combo);
        });
    });
});

console.log('All Combo API endpoint tests completed!');
