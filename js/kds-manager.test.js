/**
 * Unit tests for KDS Manager
 */

const assert = require('assert');
const sinon = require('sinon');
const { describe, it, beforeEach, afterEach } = require('mocha');

describe('KDS Manager', () => {
    let KDSManager;
    let sandbox;
    let mockDatabase;
    let mockLogger;
    let mockKdsSocket;
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Mock database
        mockDatabase = {
            run: sandbox.stub(),
            get: sandbox.stub(),
            all: sandbox.stub(),
            lastID: 1
        };
        
        // Mock logger
        mockLogger = {
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
            debug: sandbox.stub()
        };
        
        // Mock KDS Socket
        mockKdsSocket = {
            on: sandbox.stub(),
            broadcast: sandbox.stub(),
            close: sandbox.stub()
        };
        
        // Mock dependencies
        sandbox.stub(require('events'), 'EventEmitter').returns({
            on: sandbox.stub(),
            emit: sandbox.stub()
        });
        
        sandbox.stub(require('./logger'), 'default').value(mockLogger);
        sandbox.stub(require('./database'), 'default').value(mockDatabase);
        sandbox.stub(require('./kds-socket'), 'default').returns(mockKdsSocket);
        
        // Import KDSManager after mocking dependencies
        delete require.cache[require.resolve('./kds-manager')];
        KDSManager = require('./kds-manager');
    });
    
    afterEach(() => {
        sandbox.restore();
    });
    
    describe('Initialization', () => {
        it('should initialize with default values', () => {
            assert.strictEqual(KDSManager.stations, {});
            assert.deepStrictEqual(KDSManager.statuses, {
                RECEIVED: 'received',
                IN_PROGRESS: 'in-progress',
                READY: 'ready',
                COMPLETED: 'completed',
                CANCELLED: 'cancelled'
            });
        });
        
        it('should initialize WebSocket connection', () => {
            assert(mockKdsSocket.on.called);
        });
    });
    
    describe('Station Management', () => {
        it('should create a new station', async () => {
            const stationData = {
                name: 'Grill',
                displayName: 'Grill Station',
                description: 'Main grill station',
                position: 1,
                isActive: true
            };
            
            mockDatabase.run.yields(null);
            mockDatabase.get.resolves({
                station_id: 1,
                ...stationData
            });
            
            const result = await KDSManager.createStation(stationData);
            
            assert(mockDatabase.run.calledOnce);
            assert(mockKdsSocket.broadcast.calledWith('station:created', result));
            assert.strictEqual(result.name, 'Grill');
        });
        
        it('should get all stations', async () => {
            const stations = [
                { station_id: 1, name: 'Grill', display_name: 'Grill Station' },
                { station_id: 2, name: 'Fry', display_name: 'Fry Station' }
            ];
            
            mockDatabase.all.resolves(stations);
            
            const result = await KDSManager.getAllStations();
            
            assert(mockDatabase.all.calledOnce);
            assert.deepStrictEqual(result, stations);
            assert.deepStrictEqual(KDSManager.stations, {
                1: stations[0],
                2: stations[1]
            });
        });
        
        it('should get station by ID', async () => {
            const station = { station_id: 1, name: 'Grill', display_name: 'Grill Station' };
            
            mockDatabase.get.resolves(station);
            
            const result = await KDSManager.getStationById(1);
            
            assert(mockDatabase.get.calledWith('SELECT * FROM kds_stations WHERE station_id = ?', [1]));
            assert.deepStrictEqual(result, station);
        });
        
        it('should update a station', async () => {
            const stationId = 1;
            const updates = {
                displayName: 'Updated Grill Station',
                position: 2
            };
            
            mockDatabase.run.yields(null);
            mockDatabase.get.resolves({
                station_id: stationId,
                name: 'Grill',
                display_name: 'Updated Grill Station',
                position: 2
            });
            
            const result = await KDSManager.updateStation(stationId, updates);
            
            assert(mockDatabase.run.calledOnce);
            assert(mockKdsSocket.broadcast.calledWith('station:updated', result));
        });
        
        it('should delete a station', async () => {
            const stationId = 1;
            
            mockDatabase.get.onCall(0).resolves({ count: 0 }); // No active orders
            mockDatabase.run.yields(null);
            
            const result = await KDSManager.deleteStation(stationId);
            
            assert(mockDatabase.run.calledOnce);
            assert(mockKdsSocket.broadcast.calledWith('station:deleted', { stationId }));
            assert.strictEqual(result, true);
        });
        
        it('should not delete station with active orders', async () => {
            const stationId = 1;
            
            mockDatabase.get.onCall(0).resolves({ count: 1 }); // Has active orders
            
            await assert.rejects(
                KDSManager.deleteStation(stationId),
                /Cannot delete station with active orders/
            );
        });
    });
    
    describe('Order Management', () => {
        it('should submit order to KDS', async () => {
            const orderData = {
                orderId: 123,
                items: [
                    {
                        orderItemId: 1,
                        productId: 101,
                        productName: 'Burger',
                        quantity: 2,
                        stationId: 1
                    }
                ],
                priority: false,
                notes: 'No onions'
            };
            
            mockDatabase.run.yields(null);
            mockDatabase.get.resolves({
                station_id: 1,
                name: 'Grill'
            });
            mockDatabase.all.resolves([
                {
                    kds_item_id: 1,
                    kds_order_id: 1,
                    order_item_id: 1,
                    station_id: 1,
                    product_id: 101,
                    product_name: 'Burger',
                    quantity: 2,
                    status: 'received'
                }
            ]);
            
            const result = await KDSManager.submitOrderToKDS(orderData);
            
            assert(mockDatabase.run.called);
            assert(mockKdsSocket.broadcast.calledWith('order:created', result));
            assert.strictEqual(result.kds_order_id, 1);
        });
        
        it('should get KDS order by ID', async () => {
            const kdsOrderId = 1;
            
            mockDatabase.get.resolves({
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'received',
                priority: 0
            });
            mockDatabase.all.resolves([
                {
                    kds_item_id: 1,
                    kds_order_id: kdsOrderId,
                    product_id: 101,
                    product_name: 'Burger',
                    quantity: 2,
                    status: 'received'
                }
            ]);
            
            const result = await KDSManager.getKDSOrderById(kdsOrderId);
            
            assert(mockDatabase.get.calledOnce);
            assert(mockDatabase.all.calledOnce);
            assert.strictEqual(result.kds_order_id, kdsOrderId);
            assert.deepStrictEqual(result.items, [
                {
                    kds_item_id: 1,
                    kds_order_id: kdsOrderId,
                    product_id: 101,
                    product_name: 'Burger',
                    quantity: 2,
                    status: 'received'
                }
            ]);
        });
        
        it('should get all KDS orders', async () => {
            mockDatabase.all.onCall(0).resolves([
                {
                    kds_order_id: 1,
                    order_id: 123,
                    status: 'received',
                    item_count: 2,
                    received_count: 2,
                    in_progress_count: 0,
                    ready_count: 0
                }
            ]);
            mockDatabase.all.onCall(1).resolves([
                {
                    kds_item_id: 1,
                    kds_order_id: 1,
                    product_id: 101,
                    product_name: 'Burger',
                    quantity: 2,
                    status: 'received'
                }
            ]);
            
            const result = await KDSManager.getAllKDSOrders();
            
            assert(mockDatabase.all.calledTwice);
            assert.strictEqual(result.length, 1);
            assert.deepStrictEqual(result[0].items, [
                {
                    kds_item_id: 1,
                    kds_order_id: 1,
                    product_id: 101,
                    product_name: 'Burger',
                    quantity: 2,
                    status: 'received'
                }
            ]);
        });
        
        it('should update order status', async () => {
            const kdsOrderId = 1;
            const newStatus = 'in-progress';
            
            mockDatabase.get.resolves({
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'received'
            });
            mockDatabase.run.yields(null);
            mockDatabase.all.resolves([
                {
                    kds_item_id: 1,
                    kds_order_id: kdsOrderId,
                    product_id: 101,
                    product_name: 'Burger',
                    quantity: 2,
                    status: 'received'
                }
            ]);
            
            const result = await KDSManager.updateOrderStatus(kdsOrderId, newStatus, 'chef1', 'Starting preparation');
            
            assert(mockDatabase.run.called);
            assert(mockKdsSocket.broadcast.calledWith('order:status-updated', {
                kdsOrderId,
                oldStatus: 'received',
                newStatus: 'in-progress',
                order: result
            }));
        });
        
        it('should update item status', async () => {
            const kdsItemId = 1;
            const newStatus = 'in-progress';
            
            mockDatabase.get.resolves({
                kds_item_id: kdsItemId,
                kds_order_id: 1,
                product_id: 101,
                product_name: 'Burger',
                quantity: 2,
                status: 'received'
            });
            mockDatabase.run.yields(null);
            mockDatabase.get.onCall(1).resolves({
                total: 1,
                completed: 0
            });
            
            const result = await KDSManager.updateItemStatus(kdsItemId, newStatus, 'chef1', 'Starting preparation');
            
            assert(mockDatabase.run.called);
            assert(mockKdsSocket.broadcast.calledWith('item:status-updated', {
                kdsItemId,
                oldStatus: 'received',
                newStatus: 'in-progress',
                item: result
            }));
        });
        
        it('should bump order', async () => {
            const kdsOrderId = 1;
            
            mockDatabase.get.resolves({
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'completed'
            });
            mockDatabase.run.yields(null);
            mockDatabase.get.onCall(1).resolves({
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'bumped'
            });
            
            const result = await KDSManager.bumpOrder(kdsOrderId);
            
            assert(mockDatabase.run.called);
            assert(mockKdsSocket.broadcast.calledWith('order:bumped', result));
            assert.strictEqual(result.status, 'bumped');
        });
        
        it('should reopen order', async () => {
            const kdsOrderId = 1;
            
            mockDatabase.get.resolves({
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'completed'
            });
            mockDatabase.run.yields(null);
            mockDatabase.get.onCall(1).resolves({
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'received'
            });
            
            const result = await KDSManager.reopenOrder(kdsOrderId);
            
            assert(mockDatabase.run.called);
            assert(mockKdsSocket.broadcast.calledWith('order:reopened', result));
            assert.strictEqual(result.status, 'received');
        });
    });
    
    describe('Status Management', () => {
        it('should validate status transitions', () => {
            // Valid transitions
            assert.doesNotThrow(() => KDSManager.validateStatusTransition('received', 'in-progress'));
            assert.doesNotThrow(() => KDSManager.validateStatusTransition('in-progress', 'ready'));
            assert.doesNotThrow(() => KDSManager.validateStatusTransition('ready', 'completed'));
            assert.doesNotThrow(() => KDSManager.validateStatusTransition('completed', 'received'));
            
            // Invalid transitions
            assert.throws(() => KDSManager.validateStatusTransition('received', 'ready'), /Invalid transition/);
            assert.throws(() => KDSManager.validateStatusTransition('completed', 'in-progress'), /Invalid transition/);
        });
        
        it('should calculate estimated preparation time', () => {
            const items = [
                { quantity: 1, price: 10 },
                { quantity: 2, price: 15 }
            ];
            
            const result = KDSManager.calculateEstimatedPrepTime(items);
            
            // Should return average of base prep times
            assert.strictEqual(result, 5);
        });
    });
    
    describe('Statistics', () => {
        it('should get KDS statistics', async () => {
            mockDatabase.all.onCall(0).resolves([
                { status: 'received', count: 5 },
                { status: 'in-progress', count: 3 },
                { status: 'ready', count: 2 },
                { status: 'completed', count: 10 }
            ]);
            mockDatabase.get.onCall(0).resolves({ count: 3 });
            mockDatabase.get.onCall(1).resolves({ avg_time: 8.5 });
            
            const result = await KDSManager.getStatistics();
            
            assert.strictEqual(result.totalOrders, 20);
            assert.strictEqual(result.receivedOrders, 5);
            assert.strictEqual(result.inProgressOrders, 3);
            assert.strictEqual(result.readyOrders, 2);
            assert.strictEqual(result.completedOrders, 10);
            assert.strictEqual(result.stations, 3);
            assert.strictEqual(result.avgPrepTime, 8.5);
        });
    });
    
    describe('WebSocket Integration', () => {
        it('should close WebSocket connection', () => {
            KDSManager.close();
            
            assert(mockKdsSocket.close.calledOnce);
        });
    });
    
    describe('Error Handling', () => {
        it('should handle database errors', async () => {
            mockDatabase.run.yields(new Error('Database error'));
            
            await assert.rejects(
                KDSManager.createStation({ name: 'Test' }),
                /Database error/
            );
        });
        
        it('should handle invalid status transitions', () => {
            assert.throws(
                () => KDSManager.validateStatusTransition('invalid', 'received'),
                /Invalid old status/
            );
        });
    });
});

console.log('KDS Manager tests completed');