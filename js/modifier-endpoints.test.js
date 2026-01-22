// Integration tests for Modifier API Endpoints
// Test the REST API endpoints for modifiers

const request = require('supertest');
const app = require('../server');
const db = require('./database');

let testModifierGroupId;
let testModifierId;
let testMenuItemId;

describe('Modifier API Endpoints', () => {
    beforeAll(async () => {
        // Create test data
        const groupResult = await db.query(
            'INSERT INTO modifier_groups (name, description, is_required, max_selections, display_order) VALUES (?, ?, ?, ?, ?) RETURNING id',
            ['Test Size', 'Test size group', false, null, 0]
        );
        testModifierGroupId = groupResult.rows[0].id;

        const modifierResult = await db.query(
            'INSERT INTO modifiers (group_id, name, price, display_order) VALUES (?, ?, ?, ?) RETURNING id',
            [testModifierGroupId, 'Large', 0.50, 0]
        );
        testModifierId = modifierResult.rows[0].id;

        const itemResult = await db.query(
            'INSERT INTO menu_items (category_id, name, price, description, is_available) VALUES (?, ?, ?, ?, ?) RETURNING id',
            [1, 'Test Coffee', 3.00, 'Test coffee item', 1]
        );
        testMenuItemId = itemResult.rows[0].id;

        // Assign modifier group to menu item
        await db.query(
            'INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id) VALUES (?, ?)',
            [testMenuItemId, testModifierGroupId]
        );
    });

    afterAll(async () => {
        // Clean up test data
        await db.query('DELETE FROM menu_item_modifier_groups WHERE menu_item_id = ?', [testMenuItemId]);
        await db.query('DELETE FROM modifiers WHERE group_id = ?', [testModifierGroupId]);
        await db.query('DELETE FROM modifier_groups WHERE id = ?', [testModifierGroupId]);
        await db.query('DELETE FROM menu_items WHERE id = ?', [testMenuItemId]);
    });

    describe('GET /api/modifier-groups', () => {
        test('should return list of modifier groups', async () => {
            const response = await request(app)
                .get('/api/modifier-groups')
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.some(g => g.id === testModifierGroupId)).toBe(true);
        });
    });

    describe('GET /api/modifier-groups/:id', () => {
        test('should return specific modifier group', async () => {
            const response = await request(app)
                .get(`/api/modifier-groups/${testModifierGroupId}`)
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(200);
            expect(response.body.id).toBe(testModifierGroupId);
            expect(response.body.name).toBe('Test Size');
        });

        test('should return 404 for non-existent group', async () => {
            const response = await request(app)
                .get('/api/modifier-groups/999999')
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(404);
        });
    });

    describe('POST /api/modifier-groups', () => {
        test('should create new modifier group', async () => {
            const response = await request(app)
                .post('/api/modifier-groups')
                .set('Authorization', 'Bearer test-token')
                .send({
                    name: 'Test Toppings',
                    description: 'Test toppings group',
                    is_required: true,
                    max_selections: 3,
                    display_order: 1
                });

            expect(response.statusCode).toBe(201);
            expect(response.body.message).toBe('Modifier group created successfully');
            expect(response.body.id).toBeDefined();
        });

        test('should return 400 for missing name', async () => {
            const response = await request(app)
                .post('/api/modifier-groups')
                .set('Authorization', 'Bearer test-token')
                .send({
                    description: 'Test without name'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Name is required');
        });
    });

    describe('PUT /api/modifier-groups/:id', () => {
        test('should update modifier group', async () => {
            const response = await request(app)
                .put(`/api/modifier-groups/${testModifierGroupId}`)
                .set('Authorization', 'Bearer test-token')
                .send({
                    name: 'Updated Size',
                    description: 'Updated description',
                    is_required: true,
                    max_selections: 2,
                    display_order: 5
                });

            expect(response.statusCode).toBe(200);
            expect(response.body.message).toBe('Modifier group updated successfully');

            // Verify the update
            const getResponse = await request(app)
                .get(`/api/modifier-groups/${testModifierGroupId}`)
                .set('Authorization', 'Bearer test-token');

            expect(getResponse.body.name).toBe('Updated Size');
            expect(getResponse.body.is_required).toBe(true);
        });

        test('should return 404 for non-existent group', async () => {
            const response = await request(app)
                .put('/api/modifier-groups/999999')
                .set('Authorization', 'Bearer test-token')
                .send({
                    name: 'Updated Name'
                });

            expect(response.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/modifier-groups/:id', () => {
        test('should soft delete modifier group', async () => {
            // Create a new group to delete
            const createResponse = await request(app)
                .post('/api/modifier-groups')
                .set('Authorization', 'Bearer test-token')
                .send({
                    name: 'Delete Test',
                    description: 'Group to delete'
                });

            const deleteResponse = await request(app)
                .delete(`/api/modifier-groups/${createResponse.body.id}`)
                .set('Authorization', 'Bearer test-token');

            expect(deleteResponse.statusCode).toBe(200);
            expect(deleteResponse.body.message).toBe('Modifier group deleted successfully');

            // Verify it's marked as inactive
            const getResponse = await request(app)
                .get(`/api/modifier-groups/${createResponse.body.id}`)
                .set('Authorization', 'Bearer test-token');

            expect(getResponse.statusCode).toBe(404);
        });
    });

    describe('GET /api/modifiers', () => {
        test('should return list of modifiers', async () => {
            const response = await request(app)
                .get('/api/modifiers')
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.some(m => m.id === testModifierId)).toBe(true);
        });
    });

    describe('GET /api/modifiers/:id', () => {
        test('should return specific modifier', async () => {
            const response = await request(app)
                .get(`/api/modifiers/${testModifierId}`)
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(200);
            expect(response.body.id).toBe(testModifierId);
            expect(response.body.name).toBe('Large');
            expect(response.body.price).toBe(0.50);
        });

        test('should return 404 for non-existent modifier', async () => {
            const response = await request(app)
                .get('/api/modifiers/999999')
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(404);
        });
    });

    describe('POST /api/modifiers', () => {
        test('should create new modifier', async () => {
            const response = await request(app)
                .post('/api/modifiers')
                .set('Authorization', 'Bearer test-token')
                .send({
                    group_id: testModifierGroupId,
                    name: 'Medium',
                    price: 0.30,
                    display_order: 1
                });

            expect(response.statusCode).toBe(201);
            expect(response.body.message).toBe('Modifier created successfully');
            expect(response.body.id).toBeDefined();
        });

        test('should return 400 for missing required fields', async () => {
            const response = await request(app)
                .post('/api/modifiers')
                .set('Authorization', 'Bearer test-token')
                .send({
                    name: 'Test without group'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Group ID and name are required');
        });

        test('should return 400 for invalid group_id', async () => {
            const response = await request(app)
                .post('/api/modifiers')
                .set('Authorization', 'Bearer test-token')
                .send({
                    group_id: 999999,
                    name: 'Test modifier'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Invalid modifier group');
        });
    });

    describe('PUT /api/modifiers/:id', () => {
        test('should update modifier', async () => {
            const response = await request(app)
                .put(`/api/modifiers/${testModifierId}`)
                .set('Authorization', 'Bearer test-token')
                .send({
                    name: 'Updated Size',
                    price: 0.60,
                    display_order: 2
                });

            expect(response.statusCode).toBe(200);
            expect(response.body.message).toBe('Modifier updated successfully');

            // Verify the update
            const getResponse = await request(app)
                .get(`/api/modifiers/${testModifierId}`)
                .set('Authorization', 'Bearer test-token');

            expect(getResponse.body.name).toBe('Updated Size');
            expect(getResponse.body.price).toBe(0.60);
        });
    });

    describe('DELETE /api/modifiers/:id', () => {
        test('should soft delete modifier', async () => {
            // Create a new modifier to delete
            const createResponse = await request(app)
                .post('/api/modifiers')
                .set('Authorization', 'Bearer test-token')
                .send({
                    group_id: testModifierGroupId,
                    name: 'Delete Test',
                    price: 0.25
                });

            const deleteResponse = await request(app)
                .delete(`/api/modifiers/${createResponse.body.id}`)
                .set('Authorization', 'Bearer test-token');

            expect(deleteResponse.statusCode).toBe(200);
            expect(deleteResponse.body.message).toBe('Modifier deleted successfully');

            // Verify it's marked as inactive
            const getResponse = await request(app)
                .get(`/api/modifiers/${createResponse.body.id}`)
                .set('Authorization', 'Bearer test-token');

            expect(getResponse.statusCode).toBe(404);
        });
    });

    describe('GET /api/menu-items/:id/modifiers', () => {
        test('should return modifier groups for menu item', async () => {
            const response = await request(app)
                .get(`/api/menu-items/${testMenuItemId}/modifiers`)
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0].id).toBe(testModifierGroupId);
            expect(response.body[0].modifiers).toBeDefined();
        });

        test('should return 404 for non-existent menu item', async () => {
            const response = await request(app)
                .get('/api/menu-items/999999/modifiers')
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(404);
        });
    });

    describe('POST /api/menu-items/:itemId/modifier-groups', () => {
        test('should add modifier group to menu item', async () => {
            // Create a new modifier group
            const groupResponse = await request(app)
                .post('/api/modifier-groups')
                .set('Authorization', 'Bearer test-token')
                .send({
                    name: 'Test Milk',
                    description: 'Milk options'
                });

            const addResponse = await request(app)
                .post(`/api/menu-items/${testMenuItemId}/modifier-groups`)
                .set('Authorization', 'Bearer test-token')
                .send({
                    modifier_group_id: groupResponse.body.id
                });

            expect(addResponse.statusCode).toBe(201);
            expect(addResponse.body.message).toBe('Modifier group added to menu item successfully');
        });

        test('should return 400 for missing modifier_group_id', async () => {
            const response = await request(app)
                .post(`/api/menu-items/${testMenuItemId}/modifier-groups`)
                .set('Authorization', 'Bearer test-token')
                .send({});

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Modifier group ID is required');
        });

        test('should return 400 for duplicate assignment', async () => {
            const response = await request(app)
                .post(`/api/menu-items/${testMenuItemId}/modifier-groups`)
                .set('Authorization', 'Bearer test-token')
                .send({
                    modifier_group_id: testModifierGroupId
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Modifier group already assigned to this item');
        });
    });

    describe('DELETE /api/menu-items/:itemId/modifier-groups/:groupId', () => {
        test('should remove modifier group from menu item', async () => {
            const response = await request(app)
                .delete(`/api/menu-items/${testMenuItemId}/modifier-groups/${testModifierGroupId}`)
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(200);
            expect(response.body.message).toBe('Modifier group removed from menu item successfully');

            // Verify it's removed
            const getResponse = await request(app)
                .get(`/api/menu-items/${testMenuItemId}/modifiers`)
                .set('Authorization', 'Bearer test-token');

            expect(getResponse.body.some(g => g.id === testModifierGroupId)).toBe(false);
        });

        test('should return 404 for non-existent assignment', async () => {
            const response = await request(app)
                .delete(`/api/menu-items/${testMenuItemId}/modifier-groups/999999`)
                .set('Authorization', 'Bearer test-token');

            expect(response.statusCode).toBe(404);
        });
    });

    describe('Cart Modifier Endpoints', () => {
        let testOrderId;
        let testOrderItemId;

        beforeAll(async () => {
            // Create test order and order item
            const orderResult = await db.query(
                'INSERT INTO orders (order_number, subtotal, discount_amount, tax_amount, total_amount, payment_mode, payment_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
                ['ORD-1001', 0, 0, 0, 0, 'cash', 'unpaid', 'pending']
            );
            testOrderId = orderResult.rows[0].id;

            const orderItemResult = await db.query(
                'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?) RETURNING id',
                [testOrderId, testMenuItemId, 1, 3.00, 3.00]
            );
            testOrderItemId = orderItemResult.rows[0].id;
        });

        afterAll(async () => {
            // Clean up test order
            await db.query('DELETE FROM order_items WHERE order_id = ?', [testOrderId]);
            await db.query('DELETE FROM orders WHERE id = ?', [testOrderId]);
        });

        describe('POST /api/cart/add-modifier', () => {
            test('should add modifier to cart item', async () => {
                const response = await request(app)
                    .post('/api/cart/add-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: testModifierId,
                        quantity: 1
                    });

                expect(response.statusCode).toBe(201);
                expect(response.body.message).toBe('Modifier added to cart item successfully');
                expect(response.body.id).toBeDefined();
            });

            test('should return 404 for non-existent modifier', async () => {
                const response = await request(app)
                    .post('/api/cart/add-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: 999999,
                        quantity: 1
                    });

                expect(response.statusCode).toBe(404);
                expect(response.body.error).toBe('Modifier not found');
            });

            test('should return 400 for missing required fields', async () => {
                const response = await request(app)
                    .post('/api/cart/add-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId
                    });

                expect(response.statusCode).toBe(400);
                expect(response.body.error).toBe('Cart item ID and modifier ID are required');
            });
        });

        describe('PUT /api/cart/update-modifier', () => {
            test('should update modifier quantity', async () => {
                // First add a modifier
                await request(app)
                    .post('/api/cart/add-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: testModifierId,
                        quantity: 1
                    });

                // Then update it
                const response = await request(app)
                    .put('/api/cart/update-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: testModifierId,
                        quantity: 2
                    });

                expect(response.statusCode).toBe(200);
                expect(response.body.message).toBe('Modifier updated successfully');
            });

            test('should remove modifier when quantity is 0', async () => {
                const response = await request(app)
                    .put('/api/cart/update-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: testModifierId,
                        quantity: 0
                    });

                expect(response.statusCode).toBe(200);
                expect(response.body.message).toBe('Modifier updated successfully');
            });

            test('should return 404 for non-existent modifier on item', async () => {
                const response = await request(app)
                    .put('/api/cart/update-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: 999999,
                        quantity: 1
                    });

                expect(response.statusCode).toBe(404);
                expect(response.body.error).toBe('Modifier not found on this cart item');
            });
        });

        describe('DELETE /api/cart/remove-modifier', () => {
            test('should remove modifier from cart item', async () => {
                // First add a modifier
                await request(app)
                    .post('/api/cart/add-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: testModifierId,
                        quantity: 1
                    });

                // Then remove it
                const response = await request(app)
                    .delete('/api/cart/remove-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: testModifierId
                    });

                expect(response.statusCode).toBe(200);
                expect(response.body.message).toBe('Modifier removed from cart item successfully');
            });

            test('should return 404 for non-existent modifier on item', async () => {
                const response = await request(app)
                    .delete('/api/cart/remove-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId,
                        modifierId: 999999
                    });

                expect(response.statusCode).toBe(404);
                expect(response.body.error).toBe('Modifier not found on this cart item');
            });

            test('should return 400 for missing required fields', async () => {
                const response = await request(app)
                    .delete('/api/cart/remove-modifier')
                    .set('Authorization', 'Bearer test-token')
                    .send({
                        cartItemId: testOrderItemId
                    });

                expect(response.statusCode).toBe(400);
                expect(response.body.error).toBe('Cart item ID and modifier ID are required');
            });
        });
    });
});