/**
 * Unit tests for SplitBillManager
 */

const assert = require('assert');
const sinon = require('sinon');
const SplitBillManager = require('./split-bill-manager');

describe('SplitBillManager', () => {
    let db;
    let splitBillManager;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        db = {
            run: sandbox.stub(),
            get: sandbox.stub(),
            all: sandbox.stub()
        };
        splitBillManager = new SplitBillManager(db);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('createSplitBillSession', () => {
        it('should create a split bill session', async () => {
            // Setup
            const mockOrder = { id: 1, split_status: 'single' };
            const mockResult = { lastID: 1 };

            db.get.resolves(mockOrder);
            db.run.onFirstCall().resolves(mockResult);
            db.run.onSecondCall().resolves({});
            db.run.onThirdCall().resolves({});
            db.run.onCall(3).resolves({}); // COMMIT

            // Test
            const result = await splitBillManager.createSplitBillSession({
                orderId: 1,
                totalSplits: 2,
                splitMethod: 'item_count',
                notes: 'Test session'
            });

            // Assert
            assert.strictEqual(result.id, 1);
            assert.strictEqual(result.orderId, 1);
            assert.strictEqual(result.totalSplits, 2);
            assert.strictEqual(result.splitMethod, 'item_count');
            assert.strictEqual(result.status, 'active');

            // Verify database calls
            sinon.assert.calledWith(db.get, 'SELECT * FROM orders WHERE id = ?', [1]);
            sinon.assert.calledWith(
                db.run,
                'INSERT INTO split_bill_sessions (order_id, total_splits, split_method, notes, status) VALUES (?, ?, ?, ?, ?)',
                [1, 2, 'item_count', 'Test session', 'active']
            );
            sinon.assert.calledWith(
                db.run,
                'UPDATE orders SET split_status = ? WHERE id = ?',
                ['split', 1]
            );
        });

        it('should throw error if order not found', async () => {
            db.get.resolves(null);

            await assert.rejects(
                splitBillManager.createSplitBillSession({ orderId: 1, totalSplits: 2, splitMethod: 'item_count' }),
                /Order not found/
            );
        });

        it('should throw error if order is already split', async () => {
            const mockOrder = { id: 1, split_status: 'split' };
            db.get.resolves(mockOrder);

            await assert.rejects(
                splitBillManager.createSplitBillSession({ orderId: 1, totalSplits: 2, splitMethod: 'item_count' }),
                /Order is already split/
            );
        });
    });

    describe('splitByItemCount', () => {
        it('should distribute items evenly across splits', async () => {
            // Setup
            const mockSession = { id: 1, order_id: 1 };
            const mockItems = [
                { id: 1, quantity: 1, unit_price: 10, total_amount: 10, tax_amount: 0, discount_amount: 0 },
                { id: 2, quantity: 1, unit_price: 15, total_amount: 15, tax_amount: 0, discount_amount: 0 },
                { id: 3, quantity: 1, unit_price: 20, total_amount: 20, tax_amount: 0, discount_amount: 0 },
                { id: 4, quantity: 1, unit_price: 25, total_amount: 25, tax_amount: 0, discount_amount: 0 }
            ];

            db.get.resolves(mockSession);
            db.all.resolves(mockItems);
            db.run.onFirstCall().resolves({}); // DELETE
            db.run.onCall(1).resolves({}); // INSERT split 1 item 1
            db.run.onCall(2).resolves({}); // INSERT split 1 item 2
            db.run.onCall(3).resolves({}); // INSERT split 2 item 3
            db.run.onCall(4).resolves({}); // INSERT split 2 item 4
            db.run.onCall(5).resolves({}); // INSERT history
            db.run.onCall(6).resolves({}); // COMMIT

            // Test
            const result = await splitBillManager.splitByItemCount(1, 2);

            // Assert
            assert.strictEqual(result.length, 4);
            assert.strictEqual(result[0].split_number, 1);
            assert.strictEqual(result[1].split_number, 1);
            assert.strictEqual(result[2].split_number, 2);
            assert.strictEqual(result[3].split_number, 2);
        });

        it('should handle remainder items correctly', async () => {
            // Setup
            const mockSession = { id: 1, order_id: 1 };
            const mockItems = [
                { id: 1, quantity: 1, unit_price: 10, total_amount: 10, tax_amount: 0, discount_amount: 0 },
                { id: 2, quantity: 1, unit_price: 15, total_amount: 15, tax_amount: 0, discount_amount: 0 },
                { id: 3, quantity: 1, unit_price: 20, total_amount: 20, tax_amount: 0, discount_amount: 0 }
            ];

            db.get.resolves(mockSession);
            db.all.resolves(mockItems);
            db.run.onFirstCall().resolves({}); // DELETE
            db.run.onCall(1).resolves({}); // INSERT split 1 item 1
            db.run.onCall(2).resolves({}); // INSERT split 1 item 2
            db.run.onCall(3).resolves({}); // INSERT split 2 item 3
            db.run.onCall(4).resolves({}); // INSERT history
            db.run.onCall(5).resolves({}); // COMMIT

            // Test
            const result = await splitBillManager.splitByItemCount(1, 2);

            // Assert - 3 items split into 2 splits: 2 and 1
            assert.strictEqual(result.length, 3);
            assert.strictEqual(result[0].split_number, 1);
            assert.strictEqual(result[1].split_number, 1);
            assert.strictEqual(result[2].split_number, 2);
        });
    });

    describe('splitByAmount', () => {
        it('should distribute items by custom amounts', async () => {
            // Setup
            const mockSession = { id: 1, order_id: 1 };
            const mockItems = [
                { id: 1, quantity: 1, unit_price: 10, total_amount: 10, tax_amount: 0, discount_amount: 0 },
                { id: 2, quantity: 1, unit_price: 15, total_amount: 15, tax_amount: 0, discount_amount: 0 },
                { id: 3, quantity: 1, unit_price: 20, total_amount: 20, tax_amount: 0, discount_amount: 0 },
                { id: 4, quantity: 1, unit_price: 25, total_amount: 25, tax_amount: 0, discount_amount: 0 }
            ];

            db.get.resolves(mockSession);
            db.all.resolves(mockItems);
            db.run.onFirstCall().resolves({}); // DELETE
            db.run.onCall(1).resolves({}); // INSERT split 1 item 1
            db.run.onCall(2).resolves({}); // INSERT split 1 item 2
            db.run.onCall(3).resolves({}); // INSERT split 2 item 3
            db.run.onCall(4).resolves({}); // INSERT split 2 item 4
            db.run.onCall(5).resolves({}); // INSERT history
            db.run.onCall(6).resolves({}); // COMMIT

            // Test
            const result = await splitBillManager.splitByAmount(1, [25, 55]);

            // Assert
            assert.strictEqual(result.length, 4);
        });

        it('should throw error if amounts do not match total', async () => {
            const mockSession = { id: 1, order_id: 1 };
            const mockItems = [
                { id: 1, quantity: 1, unit_price: 10, total_amount: 10, tax_amount: 0, discount_amount: 0 },
                { id: 2, quantity: 1, unit_price: 15, total_amount: 15, tax_amount: 0, discount_amount: 0 }
            ];

            db.get.resolves(mockSession);
            db.all.resolves(mockItems);

            await assert.rejects(
                splitBillManager.splitByAmount(1, [20]),
                /Amount mismatch: provided 20, expected 25/
            );
        });
    });

    describe('assignCustomersToSplits', () => {
        it('should assign customers to splits', async () => {
            // Setup
            const mockSession = { id: 1, order_id: 1 };
            const mockAssignments = [
                { splitNumber: 1, customerId: 1, customerName: 'John Doe', customerContact: '1234567890' },
                { splitNumber: 2, customerId: 2, customerName: 'Jane Smith', customerContact: '9876543210' }
            ];

            db.get.resolves(mockSession);
            db.run.onFirstCall().resolves({}); // DELETE
            db.run.onCall(1).resolves({}); // INSERT customer 1
            db.run.onCall(2).resolves({}); // INSERT customer 2
            db.run.onCall(3).resolves({}); // INSERT history
            db.run.onCall(4).resolves({}); // COMMIT

            // Test
            const result = await splitBillManager.assignCustomersToSplits(1, mockAssignments);

            // Assert
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].split_number, 1);
            assert.strictEqual(result[1].split_number, 2);
        });
    });

    describe('processSplitPayment', () => {
        it('should process payment for a split', async () => {
            // Setup
            const mockSession = { id: 1, order_id: 1 };
            const mockItems = [
                { id: 1, quantity: 1, unit_price: 10, total_amount: 10, tax_amount: 0, discount_amount: 0 },
                { id: 2, quantity: 1, unit_price: 15, total_amount: 15, tax_amount: 0, discount_amount: 0 }
            ];
            const mockPaymentResult = { lastID: 1 };

            db.get.resolves(mockSession);
            db.all.resolves(mockItems);
            db.run.onFirstCall().resolves(mockPaymentResult); // INSERT payment
            db.run.onCall(1).resolves({}); // INSERT split payment
            db.run.onCall(2).resolves({}); // UPDATE split items
            db.run.onCall(3).resolves({}); // INSERT history
            db.run.onCall(4).resolves({}); // COMMIT

            // Test
            const result = await splitBillManager.processSplitPayment({
                sessionId: 1,
                splitNumber: 1,
                amount: 25,
                paymentMethod: 'cash',
                transactionId: 'TXN123',
                userId: 1
            });

            // Assert
            assert.strictEqual(result.paymentId, 1);
            assert.strictEqual(result.sessionId, 1);
            assert.strictEqual(result.splitNumber, 1);
            assert.strictEqual(result.amount, 25);
            assert.strictEqual(result.paymentMethod, 'cash');
            assert.strictEqual(result.status, 'completed');
        });

        it('should throw error if payment exceeds split total', async () => {
            const mockSession = { id: 1, order_id: 1 };
            const mockItems = [
                { id: 1, quantity: 1, unit_price: 10, total_amount: 10, tax_amount: 0, discount_amount: 0 }
            ];

            db.get.resolves(mockSession);
            db.all.resolves(mockItems);

            await assert.rejects(
                splitBillManager.processSplitPayment({
                    sessionId: 1,
                    splitNumber: 1,
                    amount: 15,
                    paymentMethod: 'cash'
                }),
                /Payment amount 15 exceeds split total 10/
            );
        });
    });

    describe('mergeSplitBills', () => {
        it('should merge split bills', async () => {
            // Setup
            const mockSession = { id: 1, order_id: 1 };

            db.get.resolves(mockSession);
            db.run.onFirstCall().resolves({}); // UPDATE order
            db.run.onCall(1).resolves({}); // UPDATE session
            db.run.onCall(2).resolves({}); // INSERT history
            db.run.onCall(3).resolves({}); // COMMIT

            // Test
            const result = await splitBillManager.mergeSplitBills(1);

            // Assert
            assert.strictEqual(result.sessionId, 1);
            assert.strictEqual(result.orderId, 1);
            assert.strictEqual(result.status, 'merged');
        });
    });

    describe('getSplitBillSummary', () => {
        it('should return split bill summary', async () => {
            // Setup
            const mockSession = { id: 1, order_id: 1, total_splits: 2, split_method: 'item_count', status: 'active' };
            const mockItems = [
                { id: 1, split_number: 1, total_amount: 10 },
                { id: 2, split_number: 1, total_amount: 15 },
                { id: 3, split_number: 2, total_amount: 20 },
                { id: 4, split_number: 2, total_amount: 25 }
            ];
            const mockPayments = [
                { id: 1, split_number: 1, amount: 25 },
                { id: 2, split_number: 2, amount: 45 }
            ];

            db.get.resolves(mockSession);
            db.all.onFirstCall().resolves([mockItems[0], mockItems[1]]); // Split 1 items
            db.all.onSecondCall().resolves([mockPayments[0]]); // Split 1 payments
            db.all.onThirdCall().resolves([mockItems[2], mockItems[3]]); // Split 2 items
            db.all.onCall(3).resolves([mockPayments[1]]); // Split 2 payments

            // Test
            const result = await splitBillManager.getSplitBillSummary(1);

            // Assert
            assert.strictEqual(result.sessionId, 1);
            assert.strictEqual(result.orderId, 1);
            assert.strictEqual(result.totalSplits, 2);
            assert.strictEqual(result.splits.length, 2);
            assert.strictEqual(result.splits[0].splitNumber, 1);
            assert.strictEqual(result.splits[0].totalAmount, 25);
            assert.strictEqual(result.splits[0].paidAmount, 25);
            assert.strictEqual(result.splits[0].balance, 0);
            assert.strictEqual(result.splits[1].splitNumber, 2);
            assert.strictEqual(result.splits[1].totalAmount, 45);
            assert.strictEqual(result.splits[1].paidAmount, 45);
            assert.strictEqual(result.splits[1].balance, 0);
        });
    });

    describe('removeItemFromSplit', () => {
        it('should remove item from split', async () => {
            // Setup
            db.run.onFirstCall().resolves({ changes: 1 }); // DELETE
            db.run.onCall(1).resolves({}); // INSERT history
            db.run.onCall(2).resolves({}); // COMMIT

            // Test
            const result = await splitBillManager.removeItemFromSplit(1, 1);

            // Assert
            assert.strictEqual(result.success, true);
        });

        it('should throw error if item not found', async () => {
            db.run.onFirstCall().resolves({ changes: 0 }); // DELETE

            await assert.rejects(
                splitBillManager.removeItemFromSplit(1, 999),
                /Item not found in split/
            );
        });
    });

    describe('getActiveSessionsForOrder', () => {
        it('should return active sessions for order', async () => {
            // Setup
            const mockSessions = [
                { id: 1, order_id: 1, status: 'active' },
                { id: 2, order_id: 1, status: 'active' }
            ];

            db.all.resolves(mockSessions);

            // Test
            const result = await splitBillManager.getActiveSessionsForOrder(1);

            // Assert
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, 1);
            assert.strictEqual(result[1].id, 2);
        });
    });
});

console.log('All tests completed for SplitBillManager');
