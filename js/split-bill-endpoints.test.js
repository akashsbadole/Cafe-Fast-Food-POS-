/**
 * Integration tests for Split Billing API Endpoints
 */

const assert = require('assert');
const request = require('supertest');
const app = require('../server');
const db = require('./database');

describe('Split Billing API Endpoints', () => {
    let testOrderId;
    let testSessionId;
    let authToken;

    before(async () => {
        // Create test user and get auth token
        const userResult = await db.query(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            ['Test User', 'test@example.com', '$2a$10$testhashedpassword', 'admin']
        );

        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'testhashedpassword' });

        authToken = response.body.token;

        // Create test order
        const orderResult = await db.query(
            'INSERT INTO orders (order_number, subtotal, discount_amount, tax_amount, total_amount, payment_mode, payment_status, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['ORD-001', 100, 0, 9, 109, 'cash', 'paid', 'completed', 'Test order']
        );

        testOrderId = orderResult.lastInsertRowid;

        // Add test items to order
        await db.query(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [testOrderId, 1, 2, 10, 20, '']
        );
        await db.query(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [testOrderId, 2, 1, 15, 15, '']
        );
        await db.query(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [testOrderId, 3, 1, 20, 20, '']
        );
        await db.query(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [testOrderId, 4, 1, 25, 25, '']
        );
    });

    after(async () => {
        // Cleanup test data
        await db.query('DELETE FROM split_bill_sessions WHERE order_id = ?', [testOrderId]);
        await db.query('DELETE FROM split_bill_items WHERE session_id IN (SELECT id FROM split_bill_sessions WHERE order_id = ?)', [testOrderId]);
        await db.query('DELETE FROM split_bill_payments WHERE session_id IN (SELECT id FROM split_bill_sessions WHERE order_id = ?)', [testOrderId]);
        await db.query('DELETE FROM split_bill_customers WHERE session_id IN (SELECT id FROM split_bill_sessions WHERE order_id = ?)', [testOrderId]);
        await db.query('DELETE FROM split_bill_history WHERE session_id IN (SELECT id FROM split_bill_sessions WHERE order_id = ?)', [testOrderId]);
        await db.query('DELETE FROM order_items WHERE order_id = ?', [testOrderId]);
        await db.query('DELETE FROM orders WHERE id = ?', [testOrderId]);
        await db.query('DELETE FROM users WHERE email = ?', ['test@example.com']);
    });

    describe('POST /api/split-bills', () => {
        it('should create a split bill session', async () => {
            const response = await request(app)
                .post('/api/split-bills')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    orderId: testOrderId,
                    totalSplits: 2,
                    splitMethod: 'item_count',
                    notes: 'Test split session'
                });

            assert.strictEqual(response.status, 201);
            assert(response.body.id);
            assert.strictEqual(response.body.orderId, testOrderId);
            assert.strictEqual(response.body.totalSplits, 2);
            assert.strictEqual(response.body.splitMethod, 'item_count');
            assert.strictEqual(response.body.status, 'active');

            testSessionId = response.body.id;
        });

        it('should return 400 if required fields are missing', async () => {
            const response = await request(app)
                .post('/api/split-bills')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    orderId: testOrderId,
                    totalSplits: 2
                    // Missing splitMethod
                });

            assert.strictEqual(response.status, 400);
            assert.match(response.body.error, /required/);
        });
    });

    describe('GET /api/split-bills/:id', () => {
        it('should get a split bill session', async () => {
            const response = await request(app)
                .get(`/api/split-bills/${testSessionId}`)
                .set('Authorization', `Bearer ${authToken}`);

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.id, testSessionId);
            assert.strictEqual(response.body.order_id, testOrderId);
        });

        it('should return 404 if session not found', async () => {
            const response = await request(app)
                .get('/api/split-bills/999999')
                .set('Authorization', `Bearer ${authToken}`);

            assert.strictEqual(response.status, 404);
        });
    });

    describe('POST /api/split-bills/:id/split-by-count', () => {
        it('should split items by count', async () => {
            const response = await request(app)
                .post(`/api/split-bills/${testSessionId}/split-by-count`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    totalSplits: 2
                });

            assert.strictEqual(response.status, 200);
            assert(Array.isArray(response.body));
            assert.strictEqual(response.body.length, 4);
            
            // Verify items are distributed
            const split1Items = response.body.filter(item => item.split_number === 1);
            const split2Items = response.body.filter(item => item.split_number === 2);
            
            assert.strictEqual(split1Items.length, 2);
            assert.strictEqual(split2Items.length, 2);
        });
    });

    describe('POST /api/split-bills/:id/split-by-amount', () => {
        it('should split items by custom amounts', async () => {
            // Create a new session for this test
            const newSessionResponse = await request(app)
                .post('/api/split-bills')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    orderId: testOrderId,
                    totalSplits: 2,
                    splitMethod: 'amount',
                    notes: 'Test amount split'
                });

            const newSessionId = newSessionResponse.body.id;

            const response = await request(app)
                .post(`/api/split-bills/${newSessionId}/split-by-amount`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    splitAmounts: [30, 79] // 20+10 = 30, 25+20+15+9 = 79
                });

            assert.strictEqual(response.status, 200);
            assert(Array.isArray(response.body));
        });

        it('should return 400 if amounts do not match total', async () => {
            const response = await request(app)
                .post(`/api/split-bills/${testSessionId}/split-by-amount`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    splitAmounts: [20] // Doesn't match total of 109
                });

            assert.strictEqual(response.status, 400);
        });
    });

    describe('POST /api/split-bills/:id/customers', () => {
        it('should assign customers to splits', async () => {
            const response = await request(app)
                .post(`/api/split-bills/${testSessionId}/customers`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    customerAssignments: [
                        {
                            splitNumber: 1,
                            customerId: 1,
                            customerName: 'John Doe',
                            customerContact: '1234567890'
                        },
                        {
                            splitNumber: 2,
                            customerId: 2,
                            customerName: 'Jane Smith',
                            customerContact: '9876543210'
                        }
                    ]
                });

            assert.strictEqual(response.status, 200);
            assert(Array.isArray(response.body));
            assert.strictEqual(response.body.length, 2);
        });
    });

    describe('GET /api/split-bills/:id/items', () => {
        it('should get split items', async () => {
            const response = await request(app)
                .get(`/api/split-bills/${testSessionId}/items`)
                .set('Authorization', `Bearer ${authToken}`);

            assert.strictEqual(response.status, 200);
            assert(Array.isArray(response.body));
            assert(response.body.length > 0);
        });
    });

    describe('POST /api/split-bills/:id/payments', () => {
        it('should process payment for a split', async () => {
            const response = await request(app)
                .post(`/api/split-bills/${testSessionId}/payments`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    splitNumber: 1,
                    amount: 30,
                    paymentMethod: 'cash',
                    transactionId: 'TXN-001'
                });

            assert.strictEqual(response.status, 201);
            assert(response.body.paymentId);
            assert.strictEqual(response.body.sessionId, testSessionId);
            assert.strictEqual(response.body.splitNumber, 1);
            assert.strictEqual(response.body.amount, 30);
            assert.strictEqual(response.body.paymentMethod, 'cash');
            assert.strictEqual(response.body.status, 'completed');
        });

        it('should return 400 if payment exceeds split total', async () => {
            const response = await request(app)
                .post(`/api/split-bills/${testSessionId}/payments`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    splitNumber: 1,
                    amount: 1000, // Exceeds split total
                    paymentMethod: 'cash'
                });

            assert.strictEqual(response.status, 400);
        });
    });

    describe('GET /api/split-bills/:id/summary', () => {
        it('should get split bill summary', async () => {
            const response = await request(app)
                .get(`/api/split-bills/${testSessionId}/summary`)
                .set('Authorization', `Bearer ${authToken}`);

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.sessionId, testSessionId);
            assert.strictEqual(response.body.orderId, testOrderId);
            assert.strictEqual(response.body.totalSplits, 2);
            assert(Array.isArray(response.body.splits));
            assert.strictEqual(response.body.splits.length, 2);
        });
    });

    describe('POST /api/split-bills/:id/merge', () => {
        it('should merge split bills', async () => {
            const response = await request(app)
                .post(`/api/split-bills/${testSessionId}/merge`)
                .set('Authorization', `Bearer ${authToken}`);

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.sessionId, testSessionId);
            assert.strictEqual(response.body.orderId, testOrderId);
            assert.strictEqual(response.body.status, 'merged');
        });
    });

    describe('DELETE /api/split-bills/:id/items/:itemId', () => {
        it('should remove item from split', async () => {
            // First create a new session
            const newSessionResponse = await request(app)
                .post('/api/split-bills')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    orderId: testOrderId,
                    totalSplits: 2,
                    splitMethod: 'item_count'
                });

            const newSessionId = newSessionResponse.body.id;

            // Split items
            await request(app)
                .post(`/api/split-bills/${newSessionId}/split-by-count`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ totalSplits: 2 });

            // Get items to find an item ID
            const itemsResponse = await request(app)
                .get(`/api/split-bills/${newSessionId}/items`)
                .set('Authorization', `Bearer ${authToken}`);

            const itemId = itemsResponse.body[0].item_id;

            // Remove item
            const response = await request(app)
                .delete(`/api/split-bills/${newSessionId}/items/${itemId}`)
                .set('Authorization', `Bearer ${authToken}`);

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.message, 'Item removed from split successfully');
        });
    });

    describe('GET /api/orders/:orderId/split-bills', () => {
        it('should get all active split bill sessions for an order', async () => {
            const response = await request(app)
                .get(`/api/orders/${testOrderId}/split-bills`)
                .set('Authorization', `Bearer ${authToken}`);

            assert.strictEqual(response.status, 200);
            assert(Array.isArray(response.body));
        });
    });
});

console.log('All integration tests completed for Split Billing API Endpoints');
