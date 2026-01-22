/**
 * Integration tests for KDS API Endpoints
 */

const assert = require('assert');
const sinon = require('sinon');
const { describe, it, beforeEach, afterEach } = require('mocha');
const request = require('supertest');
const express = require('express');

describe('KDS API Endpoints', () => {
    let app;
    let sandbox;
    let mockKdsManager;
    let mockReportingManager;
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Create Express app
        app = express();
        app.use(express.json());
        
        // Mock KDS Manager
        mockKdsManager = {
            getAllStations: sandbox.stub(),
            getStationById: sandbox.stub(),
            createStation: sandbox.stub(),
            updateStation: sandbox.stub(),
            deleteStation: sandbox.stub(),
            submitOrderToKDS: sandbox.stub(),
            getKDSOrderById: sandbox.stub(),
            getAllKDSOrders: sandbox.stub(),
            updateOrderStatus: sandbox.stub(),
            updateItemStatus: sandbox.stub(),
            bulkUpdateItemStatuses: sandbox.stub(),
            bumpOrder: sandbox.stub(),
            reopenOrder: sandbox.stub(),
            getOrdersByStation: sandbox.stub(),
            getStatistics: sandbox.stub(),
            getStatusHistory: sandbox.stub()
        };
        
        // Mock Reporting Manager
        mockReportingManager = {
            logAudit: sandbox.stub(),
            init: sandbox.stub().resolves()
        };
        
        // Mock authentication middleware
        const authenticate = (req, res, next) => {
            req.user = { id: 1, permissions: ['manage_settings', 'manage_orders', 'view_reports'] };
            next();
        };
        
        const authorize = (permission) => (req, res, next) => {
            if (req.user.permissions.includes(permission)) {
                next();
            } else {
                res.status(403).json({ error: 'Forbidden' });
            }
        };
        
        // Mock database
        const mockDb = {
            query: sandbox.stub(),
            getDatabase: sandbox.stub().returns({}),
            user: {
                getPermissions: sandbox.stub().returns(['manage_settings', 'manage_orders', 'view_reports'])
            }
        };
        
        // Mock dependencies
        sandbox.stub(require('./kds-manager'), 'default').value(mockKdsManager);
        sandbox.stub(require('./reporting-manager'), 'ReportingManager').returns(mockReportingManager);
        sandbox.stub(require('./database'), 'default').value(mockDb);
        
        // Import and use the router
        const router = require('./enterprise-endpoints');
        app.use(router);
    });
    
    afterEach(() => {
        sandbox.restore();
    });
    
    describe('Station Endpoints', () => {
        it('should get all KDS stations', async () => {
            const stations = [
                { station_id: 1, name: 'Grill', display_name: 'Grill Station' },
                { station_id: 2, name: 'Fry', display_name: 'Fry Station' }
            ];
            
            mockKdsManager.getAllStations.resolves(stations);
            
            const res = await request(app)
                .get('/api/kds/stations')
                .expect(200);
            
            assert(mockKdsManager.getAllStations.calledOnce);
            assert.deepStrictEqual(res.body, stations);
        });
        
        it('should get KDS station by ID', async () => {
            const station = { station_id: 1, name: 'Grill', display_name: 'Grill Station' };
            
            mockKdsManager.getStationById.withArgs(1).resolves(station);
            
            const res = await request(app)
                .get('/api/kds/stations/1')
                .expect(200);
            
            assert(mockKdsManager.getStationById.calledWith(1));
            assert.deepStrictEqual(res.body, station);
        });
        
        it('should return 404 for non-existent station', async () => {
            mockKdsManager.getStationById.withArgs(999).resolves(null);
            
            await request(app)
                .get('/api/kds/stations/999')
                .expect(404);
        });
        
        it('should create a new KDS station', async () => {
            const stationData = {
                name: 'Bar',
                displayName: 'Bar Station',
                description: 'Beverage preparation',
                position: 3,
                isActive: true
            };
            
            const createdStation = {
                station_id: 3,
                ...stationData
            };
            
            mockKdsManager.createStation.resolves(createdStation);
            
            const res = await request(app)
                .post('/api/kds/stations')
                .send(stationData)
                .expect(201);
            
            assert(mockKdsManager.createStation.calledWith(stationData));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.deepStrictEqual(res.body, createdStation);
        });
        
        it('should return 400 for missing station name', async () => {
            const stationData = {
                displayName: 'Bar Station'
            };
            
            await request(app)
                .post('/api/kds/stations')
                .send(stationData)
                .expect(400);
        });
        
        it('should update a KDS station', async () => {
            const stationId = 1;
            const updates = {
                displayName: 'Updated Grill Station',
                position: 2
            };
            
            const updatedStation = {
                station_id: stationId,
                name: 'Grill',
                display_name: 'Updated Grill Station',
                position: 2
            };
            
            mockKdsManager.getStationById.withArgs(stationId).resolves({ station_id: stationId, name: 'Grill' });
            mockKdsManager.updateStation.withArgs(stationId, updates).resolves(updatedStation);
            
            const res = await request(app)
                .put(`/api/kds/stations/${stationId}`)
                .send(updates)
                .expect(200);
            
            assert(mockKdsManager.updateStation.calledWith(stationId, updates));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.deepStrictEqual(res.body, updatedStation);
        });
        
        it('should delete a KDS station', async () => {
            const stationId = 1;
            
            mockKdsManager.getStationById.withArgs(stationId).resolves({ station_id: stationId, name: 'Grill' });
            mockKdsManager.deleteStation.withArgs(stationId).resolves(true);
            
            const res = await request(app)
                .delete(`/api/kds/stations/${stationId}`)
                .expect(200);
            
            assert(mockKdsManager.deleteStation.calledWith(stationId));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.strictEqual(res.body.message, 'KDS station deleted successfully');
        });
    });
    
    describe('Order Endpoints', () => {
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
            
            const kdsOrder = {
                kds_order_id: 1,
                order_id: 123,
                status: 'received',
                items: orderData.items
            };
            
            mockKdsManager.submitOrderToKDS.resolves(kdsOrder);
            
            const res = await request(app)
                .post('/api/kds/orders')
                .send(orderData)
                .expect(201);
            
            assert(mockKdsManager.submitOrderToKDS.calledWith(orderData));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.deepStrictEqual(res.body, kdsOrder);
        });
        
        it('should return 400 for missing order data', async () => {
            await request(app)
                .post('/api/kds/orders')
                .send({})
                .expect(400);
        });
        
        it('should get KDS order by ID', async () => {
            const kdsOrderId = 1;
            const kdsOrder = {
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'received',
                items: []
            };
            
            mockKdsManager.getKDSOrderById.withArgs(kdsOrderId).resolves(kdsOrder);
            
            const res = await request(app)
                .get(`/api/kds/orders/${kdsOrderId}`)
                .expect(200);
            
            assert(mockKdsManager.getKDSOrderById.calledWith(kdsOrderId));
            assert.deepStrictEqual(res.body, kdsOrder);
        });
        
        it('should return 404 for non-existent KDS order', async () => {
            mockKdsManager.getKDSOrderById.withArgs(999).resolves(null);
            
            await request(app)
                .get('/api/kds/orders/999')
                .expect(404);
        });
        
        it('should get all KDS orders', async () => {
            const orders = [
                {
                    kds_order_id: 1,
                    order_id: 123,
                    status: 'received',
                    items: []
                },
                {
                    kds_order_id: 2,
                    order_id: 124,
                    status: 'in-progress',
                    items: []
                }
            ];
            
            mockKdsManager.getAllKDSOrders.resolves(orders);
            
            const res = await request(app)
                .get('/api/kds/orders')
                .expect(200);
            
            assert(mockKdsManager.getAllKDSOrders.calledWith({}));
            assert.deepStrictEqual(res.body, orders);
        });
        
        it('should get all KDS orders with filters', async () => {
            const filters = {
                status: 'received',
                stationId: 1,
                priorityOnly: true,
                limit: 10
            };
            
            const orders = [
                {
                    kds_order_id: 1,
                    order_id: 123,
                    status: 'received',
                    items: []
                }
            ];
            
            mockKdsManager.getAllKDSOrders.resolves(orders);
            
            const res = await request(app)
                .get('/api/kds/orders?status=received&stationId=1&priorityOnly=true&limit=10')
                .expect(200);
            
            assert(mockKdsManager.getAllKDSOrders.calledWith(filters));
            assert.deepStrictEqual(res.body, orders);
        });
        
        it('should update KDS order status', async () => {
            const kdsOrderId = 1;
            const statusUpdate = {
                status: 'in-progress',
                changedBy: 'chef1',
                changeReason: 'Starting preparation'
            };
            
            const updatedOrder = {
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'in-progress',
                items: []
            };
            
            mockKdsManager.updateOrderStatus.resolves(updatedOrder);
            
            const res = await request(app)
                .put(`/api/kds/orders/${kdsOrderId}/status`)
                .send(statusUpdate)
                .expect(200);
            
            assert(mockKdsManager.updateOrderStatus.calledWith(
                kdsOrderId,
                statusUpdate.status,
                statusUpdate.changedBy,
                statusUpdate.changeReason
            ));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.deepStrictEqual(res.body, updatedOrder);
        });
        
        it('should return 400 for missing status in update', async () => {
            await request(app)
                .put('/api/kds/orders/1/status')
                .send({})
                .expect(400);
        });
        
        it('should update KDS item status', async () => {
            const kdsItemId = 1;
            const statusUpdate = {
                status: 'in-progress',
                changedBy: 'chef1',
                changeReason: 'Starting preparation'
            };
            
            const updatedItem = {
                kds_item_id: kdsItemId,
                kds_order_id: 1,
                product_id: 101,
                product_name: 'Burger',
                quantity: 2,
                status: 'in-progress'
            };
            
            mockKdsManager.updateItemStatus.resolves(updatedItem);
            
            const res = await request(app)
                .put(`/api/kds/items/${kdsItemId}/status`)
                .send(statusUpdate)
                .expect(200);
            
            assert(mockKdsManager.updateItemStatus.calledWith(
                kdsItemId,
                statusUpdate.status,
                statusUpdate.changedBy,
                statusUpdate.changeReason
            ));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.deepStrictEqual(res.body, updatedItem);
        });
        
        it('should bulk update item statuses', async () => {
            const updates = [
                { kdsItemId: 1, status: 'in-progress' },
                { kdsItemId: 2, status: 'ready' }
            ];
            
            const results = [
                {
                    kds_item_id: 1,
                    status: 'in-progress'
                },
                {
                    kds_item_id: 2,
                    status: 'ready'
                }
            ];
            
            mockKdsManager.bulkUpdateItemStatuses.resolves(results);
            
            const res = await request(app)
                .put('/api/kds/items/status')
                .send({ updates })
                .expect(200);
            
            assert(mockKdsManager.bulkUpdateItemStatuses.calledWith(updates, undefined, undefined));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.deepStrictEqual(res.body, results);
        });
        
        it('should return 400 for invalid bulk update', async () => {
            await request(app)
                .put('/api/kds/items/status')
                .send({})
                .expect(400);
        });
        
        it('should bump KDS order', async () => {
            const kdsOrderId = 1;
            
            const bumpedOrder = {
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'bumped',
                items: []
            };
            
            mockKdsManager.bumpOrder.resolves(bumpedOrder);
            
            const res = await request(app)
                .post(`/api/kds/orders/${kdsOrderId}/bump`)
                .expect(200);
            
            assert(mockKdsManager.bumpOrder.calledWith(kdsOrderId));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.deepStrictEqual(res.body, bumpedOrder);
        });
        
        it('should reopen KDS order', async () => {
            const kdsOrderId = 1;
            
            const reopenedOrder = {
                kds_order_id: kdsOrderId,
                order_id: 123,
                status: 'received',
                items: []
            };
            
            mockKdsManager.reopenOrder.resolves(reopenedOrder);
            
            const res = await request(app)
                .post(`/api/kds/orders/${kdsOrderId}/reopen`)
                .expect(200);
            
            assert(mockKdsManager.reopenOrder.calledWith(kdsOrderId));
            assert(mockReportingManager.logAudit.calledOnce);
            assert.deepStrictEqual(res.body, reopenedOrder);
        });
        
        it('should get orders by station', async () => {
            const stationId = 1;
            
            const orders = [
                {
                    kds_order_id: 1,
                    order_id: 123,
                    status: 'received',
                    items: []
                }
            ];
            
            mockKdsManager.getOrdersByStation.resolves(orders);
            
            const res = await request(app)
                .get(`/api/kds/stations/${stationId}/orders`)
                .expect(200);
            
            assert(mockKdsManager.getOrdersByStation.calledWith(stationId, {}));
            assert.deepStrictEqual(res.body, orders);
        });
        
        it('should get orders by station with filters', async () => {
            const stationId = 1;
            
            const orders = [
                {
                    kds_order_id: 1,
                    order_id: 123,
                    status: 'received',
                    items: []
                }
            ];
            
            mockKdsManager.getOrdersByStation.resolves(orders);
            
            const res = await request(app)
                .get(`/api/kds/stations/${stationId}/orders?status=received&priorityOnly=true`)
                .expect(200);
            
            assert(mockKdsManager.getOrdersByStation.calledWith(stationId, {
                status: 'received',
                priorityOnly: true
            }));
            assert.deepStrictEqual(res.body, orders);
        });
    });
    
    describe('Statistics Endpoints', () => {
        it('should get KDS statistics', async () => {
            const stats = {
                totalOrders: 20,
                receivedOrders: 5,
                inProgressOrders: 3,
                readyOrders: 2,
                completedOrders: 10,
                stations: 3,
                avgPrepTime: 8.5
            };
            
            mockKdsManager.getStatistics.resolves(stats);
            
            const res = await request(app)
                .get('/api/kds/statistics')
                .expect(200);
            
            assert(mockKdsManager.getStatistics.calledOnce);
            assert.deepStrictEqual(res.body, stats);
        });
        
        it('should get KDS status history', async () => {
            const history = [
                {
                    history_id: 1,
                    kds_order_id: 1,
                    old_status: 'received',
                    new_status: 'in-progress',
                    changed_by: 'chef1',
                    created_at: '2024-01-01T10:00:00Z'
                }
            ];
            
            mockKdsManager.getStatusHistory.resolves(history);
            
            const res = await request(app)
                .get('/api/kds/history?orderId=1')
                .expect(200);
            
            assert(mockKdsManager.getStatusHistory.calledWith(1, null));
            assert.deepStrictEqual(res.body, history);
        });
        
        it('should get KDS status history for item', async () => {
            const history = [
                {
                    history_id: 1,
                    kds_item_id: 1,
                    old_status: 'received',
                    new_status: 'in-progress',
                    changed_by: 'chef1',
                    created_at: '2024-01-01T10:00:00Z'
                }
            ];
            
            mockKdsManager.getStatusHistory.resolves(history);
            
            const res = await request(app)
                .get('/api/kds/history?itemId=1')
                .expect(200);
            
            assert(mockKdsManager.getStatusHistory.calledWith(null, 1));
            assert.deepStrictEqual(res.body, history);
        });
    });
    
    describe('Error Handling', () => {
        it('should handle KDS manager errors', async () => {
            mockKdsManager.getAllStations.rejects(new Error('KDS error'));
            
            await request(app)
                .get('/api/kds/stations')
                .expect(500);
        });
        
        it('should handle missing authentication', async () => {
            // Remove authentication from mock
            const appWithoutAuth = express();
            appWithoutAuth.use(express.json());
            
            const router = require('./enterprise-endpoints');
            appWithoutAuth.use(router);
            
            await request(appWithoutAuth)
                .get('/api/kds/stations')
                .expect(401);
        });
        
        it('should handle insufficient permissions', async () => {
            // Mock with insufficient permissions
            const appWithLimitedPerms = express();
            appWithLimitedPerms.use(express.json());
            
            const authenticate = (req, res, next) => {
                req.user = { id: 1, permissions: [] }; // No permissions
                next();
            };
            
            appWithLimitedPerms.use((req, res, next) => {
                req.user = { id: 1, permissions: [] };
                next();
            });
            
            const router = require('./enterprise-endpoints');
            appWithLimitedPerms.use(router);
            
            await request(appWithLimitedPerms)
                .get('/api/kds/stations')
                .expect(403);
        });
    });
});

console.log('KDS API Endpoints tests completed');