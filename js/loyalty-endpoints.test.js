/**
 * Integration tests for Loyalty API Endpoints
 */

const assert = require('assert');
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Mock database
class MockDB {
    query(sql, params) {
        return Promise.resolve({ rows: [] });
    }
    
    run(sql, params) {
        return Promise.resolve();
    }
}

// Mock logger
class MockLogger {
    info(msg) {}
    error(msg) {}
    warn(msg) {}
    debug(msg) {}
}

// Mock ReportingManager
class MockReportingManager {
    async logAudit(userId, action, tableName, recordId, oldValue, newValue, ip, userAgent) {
        return Promise.resolve();
    }
    
    async getLoyaltySummaryReport(programId, startDate, endDate) {
        return Promise.resolve({ total_customers: 0, total_points: 0 });
    }
    
    async getLoyaltyPointsActivityReport(programId, customerId, startDate, endDate, limit) {
        return Promise.resolve([]);
    }
    
    async getLoyaltyRedemptionsReport(programId, startDate, endDate, limit) {
        return Promise.resolve([]);
    }
    
    async getLoyaltyCustomerActivityReport(programId, startDate, endDate, limit) {
        return Promise.resolve([]);
    }
    
    async getLoyaltyPunchCardActivityReport(programId, startDate, endDate, limit) {
        return Promise.resolve([]);
    }
    
    async getExpiredPointsReport(daysBefore, limit) {
        return Promise.resolve([]);
    }
    
    async exportToCSV(data, filename) {
        return Promise.resolve('/tmp/test.csv');
    }
    
    async exportToPDF(data, filename, options) {
        return Promise.resolve('/tmp/test.pdf');
    }
}

// Mock LoyaltyManager
class MockLoyaltyManager {
    async init() {}
    
    async getAllLoyaltyPrograms() {
        return Promise.resolve([
            { id: 1, name: 'Basic Program', points_per_currency: 1 },
            { id: 2, name: 'Premium Program', points_per_currency: 2 }
        ]);
    }
    
    async getLoyaltyProgram(id) {
        if (id === 1) {
            return Promise.resolve({ id: 1, name: 'Basic Program', points_per_currency: 1 });
        }
        return Promise.resolve(null);
    }
    
    async createLoyaltyProgram(program) {
        return Promise.resolve({ id: 1, ...program });
    }
    
    async updateLoyaltyProgram(id, program) {
        return Promise.resolve({ id, ...program });
    }
    
    async deleteLoyaltyProgram(id) {
        return Promise.resolve();
    }
    
    async getLoyaltyTiers(programId) {
        return Promise.resolve([
            { id: 1, name: 'Bronze', min_points: 0 },
            { id: 2, name: 'Silver', min_points: 1000 }
        ]);
    }
    
    async createLoyaltyTier(tier) {
        return Promise.resolve({ id: 1, ...tier });
    }
    
    async updateLoyaltyTier(id, tier) {
        return Promise.resolve({ id, ...tier });
    }
    
    async deleteLoyaltyTier(id) {
        return Promise.resolve();
    }
    
    async getCustomerLoyaltyStatus(customerId) {
        return Promise.resolve({
            customer_id: customerId,
            program_id: 1,
            current_points: 500,
            lifetime_points: 1500,
            tier: 'Silver',
            tier_id: 2
        });
    }
    
    async enrollCustomerInProgram(customerId, programId, notes) {
        return Promise.resolve({
            customer_id: customerId,
            program_id: programId,
            notes
        });
    }
    
    async calculatePointsForOrder(orderId, customerId, programId) {
        return Promise.resolve({ points: 100, order_total: 100 });
    }
    
    async awardPoints(customerId, orderId, points, notes) {
        return Promise.resolve({
            id: 1,
            customer_id: customerId,
            order_id: orderId,
            points,
            type: 'earned',
            balance_after: 100,
            notes
        });
    }
    
    async redeemPoints(customerId, orderId, points, notes) {
        return Promise.resolve({
            id: 1,
            customer_id: customerId,
            order_id: orderId,
            points,
            type: 'redemption',
            balance_after: 50,
            notes
        });
    }
    
    async adjustPoints(customerId, points, reason, notes, userId) {
        return Promise.resolve({
            id: 1,
            customer_id: customerId,
            points,
            type: 'adjustment',
            balance_after: 75,
            reason,
            notes
        });
    }
    
    async getCustomerPointsHistory(customerId, limit, offset) {
        return Promise.resolve([
            { id: 1, points: 100, type: 'earned', created_at: '2023-01-01' },
            { id: 2, points: 50, type: 'redemption', created_at: '2023-01-02' }
        ]);
    }
    
    async getAllRewards() {
        return Promise.resolve([
            { id: 1, name: 'Free Coffee', points_required: 100 },
            { id: 2, name: 'Free Pastry', points_required: 50 }
        ]);
    }
    
    async getReward(id) {
        if (id === 1) {
            return Promise.resolve({ id: 1, name: 'Free Coffee', points_required: 100 });
        }
        return Promise.resolve(null);
    }
    
    async createReward(reward) {
        return Promise.resolve({ id: 1, ...reward });
    }
    
    async updateReward(id, reward) {
        return Promise.resolve({ id, ...reward });
    }
    
    async deleteReward(id) {
        return Promise.resolve();
    }
    
    async redeemReward(rewardId, customerId, orderId, notes) {
        return Promise.resolve({
            id: 1,
            reward_id: rewardId,
            customer_id: customerId,
            order_id: orderId,
            points_used: 100,
            notes
        });
    }
    
    async getCustomerRewards(customerId) {
        return Promise.resolve([
            { id: 1, name: 'Free Coffee', redeemed: true },
            { id: 2, name: 'Free Pastry', redeemed: false }
        ]);
    }
    
    async getAvailableRewardsForCustomer(customerId) {
        return Promise.resolve([
            { id: 1, name: 'Free Coffee', points_required: 100 }
        ]);
    }
    
    async getAllPunchCards() {
        return Promise.resolve([
            { id: 1, name: 'Buy 9 Get 1 Free', required_punches: 9 },
            { id: 2, name: 'Buy 5 Get 1 Free', required_punches: 5 }
        ]);
    }
    
    async getPunchCard(id) {
        if (id === 1) {
            return Promise.resolve({ id: 1, name: 'Buy 9 Get 1 Free', required_punches: 9 });
        }
        return Promise.resolve(null);
    }
    
    async createPunchCard(punchCard) {
        return Promise.resolve({ id: 1, ...punchCard });
    }
    
    async updatePunchCard(id, punchCard) {
        return Promise.resolve({ id, ...punchCard });
    }
    
    async deletePunchCard(id) {
        return Promise.resolve();
    }
    
    async addPunchToCard(cardId, customerId, orderId, notes) {
        return Promise.resolve({
            id: 1,
            card_id: cardId,
            customer_id: customerId,
            order_id: orderId,
            current_punches: 1,
            notes
        });
    }
    
    async getCustomerPunchCards(customerId) {
        return Promise.resolve([
            { id: 1, name: 'Buy 9 Get 1 Free', current_punches: 5, required_punches: 9 }
        ]);
    }
    
    async processExpiredPoints(daysBefore) {
        return Promise.resolve({
            expiredPoints: 100,
            affectedCustomers: 5,
            transactionsCreated: 5
        });
    }
    
    async checkTierUpgradeEligibility(customerId) {
        return Promise.resolve({
            eligible: true,
            current_tier: 'Silver',
            current_tier_id: 2,
            next_tier: 'Gold',
            next_tier_id: 3,
            points_needed: 0
        });
    }
    
    async upgradeCustomerTier(customerId) {
        return Promise.resolve({
            customer_id: customerId,
            old_tier: 'Silver',
            new_tier: 'Gold',
            points: 5000
        });
    }
    
    async getLoyaltyStatement(customerId, startDate, endDate) {
        return Promise.resolve({
            customer_id: customerId,
            name: 'John Doe',
            current_points: 1000,
            lifetime_points: 5000,
            transactions: [
                { id: 1, points: 100, type: 'earned', created_at: '2023-01-01' }
            ]
        });
    }
}

describe('Loyalty API Endpoints', function() {
    let app;
    let token;
    
    beforeEach(function() {
        // Create Express app
        app = express();
        app.use(express.json());
        
        // Mock database
        const mockDB = new MockDB();
        global.db = mockDB;
        
        // Mock logger
        const mockLogger = new MockLogger();
        global.logger = mockLogger;
        
        // Mock ReportingManager
        const mockReportingManager = new MockReportingManager();
        
        // Mock LoyaltyManager
        const mockLoyaltyManager = new MockLoyaltyManager();
        
        // Create JWT token
        token = jwt.sign(
            { id: 1, email: 'test@example.com', permissions: ['manage_settings', 'manage_orders', 'view_reports'] },
            'test-secret',
            { expiresIn: '1h' }
        );
        
        // Load enterprise endpoints
        const enterpriseEndpoints = require('./enterprise-endpoints');
        app.use(enterpriseEndpoints);
    });
    
    describe('Loyalty Programs', function() {
        it('should get all loyalty programs', function(done) {
            request(app)
                .get('/api/loyalty/programs')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 2);
                    assert.strictEqual(res.body[0].name, 'Basic Program');
                    done();
                });
        });
        
        it('should get a loyalty program by ID', function(done) {
            request(app)
                .get('/api/loyalty/programs/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Basic Program');
                    done();
                });
        });
        
        it('should return 404 for non-existent program', function(done) {
            request(app)
                .get('/api/loyalty/programs/999')
                .set('Authorization', `Bearer ${token}`)
                .expect(404)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Loyalty program not found');
                    done();
                });
        });
        
        it('should create a new loyalty program', function(done) {
            request(app)
                .post('/api/loyalty/programs')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'New Program',
                    description: 'Test program',
                    points_per_currency: 1,
                    is_active: true,
                    min_purchase_amount: 10
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'New Program');
                    done();
                });
        });
        
        it('should update a loyalty program', function(done) {
            request(app)
                .put('/api/loyalty/programs/1')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Updated Program',
                    points_per_currency: 2
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Updated Program');
                    done();
                });
        });
        
        it('should delete a loyalty program', function(done) {
            request(app)
                .delete('/api/loyalty/programs/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.message, 'Loyalty program deleted successfully');
                    done();
                });
        });
    });
    
    describe('Loyalty Tiers', function() {
        it('should get all loyalty tiers for a program', function(done) {
            request(app)
                .get('/api/loyalty/programs/1/tiers')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 2);
                    assert.strictEqual(res.body[0].name, 'Bronze');
                    done();
                });
        });
        
        it('should create a new loyalty tier', function(done) {
            request(app)
                .post('/api/loyalty/tiers')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    program_id: 1,
                    name: 'Gold',
                    min_points: 5000,
                    discount_percent: 10
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Gold');
                    done();
                });
        });
        
        it('should update a loyalty tier', function(done) {
            request(app)
                .put('/api/loyalty/tiers/1')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Platinum',
                    min_points: 10000
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Platinum');
                    done();
                });
        });
        
        it('should delete a loyalty tier', function(done) {
            request(app)
                .delete('/api/loyalty/tiers/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.message, 'Loyalty tier deleted successfully');
                    done();
                });
        });
    });
    
    describe('Customer Loyalty', function() {
        it('should get customer loyalty status', function(done) {
            request(app)
                .get('/api/loyalty/customers/1/status')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.current_points, 500);
                    assert.strictEqual(res.body.tier, 'Silver');
                    done();
                });
        });
        
        it('should enroll customer in loyalty program', function(done) {
            request(app)
                .post('/api/loyalty/customers/1/enroll')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    program_id: 1,
                    notes: 'Initial enrollment'
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.customer_id, 1);
                    assert.strictEqual(res.body.program_id, 1);
                    done();
                });
        });
        
        it('should calculate points for order', function(done) {
            request(app)
                .post('/api/loyalty/calculate-points')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    order_id: 1,
                    customer_id: 1,
                    program_id: 1
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.points, 100);
                    done();
                });
        });
        
        it('should award points to customer', function(done) {
            request(app)
                .post('/api/loyalty/points/award')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customer_id: 1,
                    order_id: 1,
                    points: 100,
                    notes: 'Purchase reward'
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.points, 100);
                    assert.strictEqual(res.body.type, 'earned');
                    done();
                });
        });
        
        it('should redeem points', function(done) {
            request(app)
                .post('/api/loyalty/points/redeem')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customer_id: 1,
                    order_id: 1,
                    points: 50,
                    notes: 'Discount applied'
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.points, 50);
                    assert.strictEqual(res.body.type, 'redemption');
                    done();
                });
        });
        
        it('should adjust points', function(done) {
            request(app)
                .post('/api/loyalty/points/adjust')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customer_id: 1,
                    points: 25,
                    reason: 'Promotional bonus',
                    notes: 'Staff bonus'
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.points, 25);
                    assert.strictEqual(res.body.type, 'adjustment');
                    done();
                });
        });
        
        it('should get customer points history', function(done) {
            request(app)
                .get('/api/loyalty/customers/1/transactions')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 2);
                    assert.strictEqual(res.body[0].type, 'earned');
                    done();
                });
        });
    });
    
    describe('Loyalty Rewards', function() {
        it('should get all rewards', function(done) {
            request(app)
                .get('/api/loyalty/rewards')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 2);
                    assert.strictEqual(res.body[0].name, 'Free Coffee');
                    done();
                });
        });
        
        it('should get a reward by ID', function(done) {
            request(app)
                .get('/api/loyalty/rewards/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Free Coffee');
                    done();
                });
        });
        
        it('should return 404 for non-existent reward', function(done) {
            request(app)
                .get('/api/loyalty/rewards/999')
                .set('Authorization', `Bearer ${token}`)
                .expect(404)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Reward not found');
                    done();
                });
        });
        
        it('should create a new reward', function(done) {
            request(app)
                .post('/api/loyalty/rewards')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    program_id: 1,
                    name: 'Free Dessert',
                    points_required: 200,
                    type: 'discount',
                    value: 5
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Free Dessert');
                    done();
                });
        });
        
        it('should update a reward', function(done) {
            request(app)
                .put('/api/loyalty/rewards/1')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Free Lunch',
                    points_required: 500
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Free Lunch');
                    done();
                });
        });
        
        it('should delete a reward', function(done) {
            request(app)
                .delete('/api/loyalty/rewards/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.message, 'Reward deleted successfully');
                    done();
                });
        });
        
        it('should redeem a reward', function(done) {
            request(app)
                .post('/api/loyalty/rewards/1/redeem')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customer_id: 1,
                    order_id: 1,
                    notes: 'Reward redemption'
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.reward_id, 1);
                    assert.strictEqual(res.body.customer_id, 1);
                    done();
                });
        });
        
        it('should get customer rewards', function(done) {
            request(app)
                .get('/api/loyalty/customers/1/rewards')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 2);
                    done();
                });
        });
        
        it('should get available rewards for customer', function(done) {
            request(app)
                .get('/api/loyalty/customers/1/available-rewards')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 1);
                    done();
                });
        });
    });
    
    describe('Punch Cards', function() {
        it('should get all punch cards', function(done) {
            request(app)
                .get('/api/loyalty/punch-cards')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 2);
                    assert.strictEqual(res.body[0].name, 'Buy 9 Get 1 Free');
                    done();
                });
        });
        
        it('should get a punch card by ID', function(done) {
            request(app)
                .get('/api/loyalty/punch-cards/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Buy 9 Get 1 Free');
                    done();
                });
        });
        
        it('should return 404 for non-existent punch card', function(done) {
            request(app)
                .get('/api/loyalty/punch-cards/999')
                .set('Authorization', `Bearer ${token}`)
                .expect(404)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Punch card not found');
                    done();
                });
        });
        
        it('should create a new punch card', function(done) {
            request(app)
                .post('/api/loyalty/punch-cards')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    program_id: 1,
                    name: 'Buy 10 Get 1 Free',
                    required_punches: 10,
                    reward_points: 0,
                    reward_item_id: 1
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Buy 10 Get 1 Free');
                    done();
                });
        });
        
        it('should update a punch card', function(done) {
            request(app)
                .put('/api/loyalty/punch-cards/1')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Buy 8 Get 1 Free',
                    required_punches: 8
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.name, 'Buy 8 Get 1 Free');
                    done();
                });
        });
        
        it('should delete a punch card', function(done) {
            request(app)
                .delete('/api/loyalty/punch-cards/1')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.message, 'Punch card deleted successfully');
                    done();
                });
        });
        
        it('should add punch to card', function(done) {
            request(app)
                .post('/api/loyalty/punch-cards/1/punch')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customer_id: 1,
                    order_id: 1,
                    notes: 'Punch added'
                })
                .expect(201)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.card_id, 1);
                    assert.strictEqual(res.body.customer_id, 1);
                    done();
                });
        });
        
        it('should get customer punch cards', function(done) {
            request(app)
                .get('/api/loyalty/customers/1/punch-cards')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 1);
                    assert.strictEqual(res.body[0].current_punches, 5);
                    done();
                });
        });
    });
    
    describe('Loyalty Reports', function() {
        it('should get loyalty summary report', function(done) {
            request(app)
                .get('/api/loyalty/reports/summary')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.total_customers, 0);
                    assert.strictEqual(res.body.total_points, 0);
                    done();
                });
        });
        
        it('should get points activity report', function(done) {
            request(app)
                .get('/api/loyalty/reports/points-activity')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 0);
                    done();
                });
        });
        
        it('should get redemptions report', function(done) {
            request(app)
                .get('/api/loyalty/reports/redemptions')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 0);
                    done();
                });
        });
        
        it('should get customer activity report', function(done) {
            request(app)
                .get('/api/loyalty/reports/customer-activity')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 0);
                    done();
                });
        });
        
        it('should get punch card activity report', function(done) {
            request(app)
                .get('/api/loyalty/reports/punch-cards')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 0);
                    done();
                });
        });
    });
    
    describe('Points Expiration', function() {
        it('should process expired points', function(done) {
            request(app)
                .post('/api/loyalty/process-expired-points')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    daysBefore: 30
                })
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.expiredPoints, 100);
                    assert.strictEqual(res.body.affectedCustomers, 5);
                    done();
                });
        });
        
        it('should get expired points report', function(done) {
            request(app)
                .get('/api/loyalty/reports/expired-points')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.length, 0);
                    done();
                });
        });
    });
    
    describe('Tier Management', function() {
        it('should check tier upgrade eligibility', function(done) {
            request(app)
                .get('/api/loyalty/customers/1/check-tier-upgrade')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.eligible, true);
                    assert.strictEqual(res.body.next_tier, 'Gold');
                    done();
                });
        });
        
        it('should upgrade customer tier', function(done) {
            request(app)
                .post('/api/loyalty/customers/1/upgrade-tier')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.customer_id, 1);
                    assert.strictEqual(res.body.new_tier, 'Gold');
                    done();
                });
        });
    });
    
    describe('Loyalty Statements', function() {
        it('should get loyalty statement', function(done) {
            request(app)
                .get('/api/loyalty/customers/1/statements')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.customer_id, 1);
                    assert.strictEqual(res.body.current_points, 1000);
                    done();
                });
        });
    });
    
    describe('Authentication and Authorization', function() {
        it('should return 401 for missing token', function(done) {
            request(app)
                .get('/api/loyalty/programs')
                .expect(401)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Unauthorized - No token provided');
                    done();
                });
        });
        
        it('should return 401 for invalid token', function(done) {
            request(app)
                .get('/api/loyalty/programs')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Unauthorized - Invalid token');
                    done();
                });
        });
        
        it('should return 403 for insufficient permissions', function(done) {
            const restrictedToken = jwt.sign(
                { id: 1, email: 'test@example.com', permissions: [] },
                'test-secret',
                { expiresIn: '1h' }
            );
            
            request(app)
                .get('/api/loyalty/programs')
                .set('Authorization', `Bearer ${restrictedToken}`)
                .expect(403)
                .end((err, res) => {
                    if (err) return done(err);
                    assert.strictEqual(res.body.error, 'Forbidden - Insufficient permissions');
                    done();
                });
        });
    });
});

// Run tests if this file is executed directly
if (require.main === module) {
    const mocha = require('mocha');
    const runner = new mocha.Runner(new mocha());
    
    runner.run(failures => {
        process.exitCode = failures ? 1 : 0;
    });
}
