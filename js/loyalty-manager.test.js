/**
 * Unit tests for LoyaltyManager
 */

const assert = require('assert');
const sinon = require('sinon');
const { Database } = require('sqlite3').verbose();

// Mock database
class MockDB {
    constructor() {
        this.stubs = {};
    }
    
    query(sql, params) {
        return Promise.resolve({ rows: [] });
    }
    
    run(sql, params) {
        return Promise.resolve();
    }
    
    stubQuery(methodName, returnValue) {
        this.stubs[methodName] = sinon.stub().returns(Promise.resolve(returnValue));
        return this.stubs[methodName];
    }
}

// Mock logger
class MockLogger {
    info(msg) {}
    error(msg) {}
    warn(msg) {}
    debug(msg) {}
}

describe('LoyaltyManager', function() {
    let loyaltyManager;
    let mockDB;
    let mockLogger;
    
    beforeEach(async function() {
        mockDB = new MockDB();
        mockLogger = new MockLogger();
        const LoyaltyManager = require('./loyalty-manager');
        loyaltyManager = new LoyaltyManager(mockDB, mockLogger);
        await loyaltyManager.init();
    });
    
    afterEach(function() {
        sinon.restore();
    });
    
    describe('Initialization', function() {
        it('should initialize without errors', async function() {
            assert.doesNotThrow(async () => {
                await loyaltyManager.init();
            });
        });
    });
    
    describe('Loyalty Programs', function() {
        it('should get all loyalty programs', async function() {
            const mockPrograms = [
                { id: 1, name: 'Basic Program', points_per_currency: 1 },
                { id: 2, name: 'Premium Program', points_per_currency: 2 }
            ];
            
            mockDB.stubQuery('getAllLoyaltyPrograms', { rows: mockPrograms });
            
            const programs = await loyaltyManager.getAllLoyaltyPrograms();
            assert.strictEqual(programs.length, 2);
            assert.strictEqual(programs[0].name, 'Basic Program');
        });
        
        it('should get a loyalty program by ID', async function() {
            const mockProgram = { id: 1, name: 'Basic Program', points_per_currency: 1 };
            
            mockDB.stubQuery('getLoyaltyProgram', { rows: [mockProgram] });
            
            const program = await loyaltyManager.getLoyaltyProgram(1);
            assert.strictEqual(program.name, 'Basic Program');
        });
        
        it('should create a new loyalty program', async function() {
            const newProgram = {
                name: 'New Program',
                description: 'Test program',
                points_per_currency: 1,
                is_active: true,
                min_purchase_amount: 10
            };
            
            mockDB.stubQuery('createLoyaltyProgram', { lastInsertRowid: 1 });
            mockDB.stubQuery('getLoyaltyProgram', { rows: [{ id: 1, ...newProgram }] });
            
            const program = await loyaltyManager.createLoyaltyProgram(newProgram);
            assert.strictEqual(program.id, 1);
            assert.strictEqual(program.name, 'New Program');
        });
        
        it('should update a loyalty program', async function() {
            const updatedProgram = {
                name: 'Updated Program',
                points_per_currency: 2
            };
            
            mockDB.stubQuery('getLoyaltyProgram', { rows: [{ id: 1, name: 'Old Program', points_per_currency: 1 }] });
            mockDB.stubQuery('updateLoyaltyProgram', { lastInsertRowid: 1 });
            mockDB.stubQuery('getLoyaltyProgram', { rows: [{ id: 1, ...updatedProgram }] });
            
            const program = await loyaltyManager.updateLoyaltyProgram(1, updatedProgram);
            assert.strictEqual(program.name, 'Updated Program');
        });
        
        it('should delete a loyalty program', async function() {
            mockDB.stubQuery('getLoyaltyProgram', { rows: [{ id: 1, name: 'Test Program' }] });
            mockDB.stubQuery('deleteLoyaltyProgram', {});
            
            await assert.doesNotReject(async () => {
                await loyaltyManager.deleteLoyaltyProgram(1);
            });
        });
    });
    
    describe('Loyalty Tiers', function() {
        it('should get all loyalty tiers for a program', async function() {
            const mockTiers = [
                { id: 1, name: 'Bronze', min_points: 0 },
                { id: 2, name: 'Silver', min_points: 1000 }
            ];
            
            mockDB.stubQuery('getLoyaltyTiers', { rows: mockTiers });
            
            const tiers = await loyaltyManager.getLoyaltyTiers(1);
            assert.strictEqual(tiers.length, 2);
            assert.strictEqual(tiers[0].name, 'Bronze');
        });
        
        it('should create a new loyalty tier', async function() {
            const newTier = {
                program_id: 1,
                name: 'Gold',
                min_points: 5000,
                discount_percent: 10
            };
            
            mockDB.stubQuery('createLoyaltyTier', { lastInsertRowid: 1 });
            mockDB.stubQuery('getLoyaltyTier', { rows: [{ id: 1, ...newTier }] });
            
            const tier = await loyaltyManager.createLoyaltyTier(newTier);
            assert.strictEqual(tier.id, 1);
            assert.strictEqual(tier.name, 'Gold');
        });
        
        it('should update a loyalty tier', async function() {
            const updatedTier = {
                name: 'Platinum',
                min_points: 10000
            };
            
            mockDB.stubQuery('getLoyaltyTier', { rows: [{ id: 1, name: 'Gold', min_points: 5000 }] });
            mockDB.stubQuery('updateLoyaltyTier', { lastInsertRowid: 1 });
            mockDB.stubQuery('getLoyaltyTier', { rows: [{ id: 1, ...updatedTier }] });
            
            const tier = await loyaltyManager.updateLoyaltyTier(1, updatedTier);
            assert.strictEqual(tier.name, 'Platinum');
        });
        
        it('should delete a loyalty tier', async function() {
            mockDB.stubQuery('getLoyaltyTier', { rows: [{ id: 1, name: 'Test Tier' }] });
            mockDB.stubQuery('deleteLoyaltyTier', {});
            
            await assert.doesNotReject(async () => {
                await loyaltyManager.deleteLoyaltyTier(1);
            });
        });
    });
    
    describe('Customer Loyalty', function() {
        it('should get customer loyalty status', async function() {
            const mockStatus = {
                customer_id: 1,
                program_id: 1,
                current_points: 500,
                lifetime_points: 1500,
                tier: 'Silver',
                tier_id: 2
            };
            
            mockDB.stubQuery('getCustomerLoyaltyStatus', { rows: [mockStatus] });
            
            const status = await loyaltyManager.getCustomerLoyaltyStatus(1);
            assert.strictEqual(status.current_points, 500);
            assert.strictEqual(status.tier, 'Silver');
        });
        
        it('should enroll customer in loyalty program', async function() {
            mockDB.stubQuery('enrollCustomerInProgram', { lastInsertRowid: 1 });
            mockDB.stubQuery('getCustomerLoyaltyStatus', { rows: [{ customer_id: 1, program_id: 1, current_points: 0 }] });
            
            const result = await loyaltyManager.enrollCustomerInProgram(1, 1, 'Initial enrollment');
            assert.strictEqual(result.customer_id, 1);
            assert.strictEqual(result.program_id, 1);
        });
        
        it('should calculate points for order', async function() {
            const mockOrder = {
                id: 1,
                total_amount: 100,
                tax_amount: 10,
                discount_amount: 0,
                subtotal: 90
            };
            
            const mockProgram = {
                id: 1,
                points_per_currency: 1,
                min_purchase_amount: 0
            };
            
            mockDB.stubQuery('getOrderById', { rows: [mockOrder] });
            mockDB.stubQuery('getCustomerLoyaltyProgram', { rows: [mockProgram] });
            
            const points = await loyaltyManager.calculatePointsForOrder(1, 1, 1);
            assert.strictEqual(points.points, 90);
        });
        
        it('should award points to customer', async function() {
            const mockTransaction = {
                id: 1,
                customer_id: 1,
                order_id: 1,
                points: 100,
                type: 'earned',
                balance_after: 100
            };
            
            mockDB.stubQuery('awardPoints', { lastInsertRowid: 1 });
            mockDB.stubQuery('getPointsTransaction', { rows: [mockTransaction] });
            
            const transaction = await loyaltyManager.awardPoints(1, 1, 100, 'Purchase reward');
            assert.strictEqual(transaction.points, 100);
            assert.strictEqual(transaction.type, 'earned');
        });
        
        it('should redeem points', async function() {
            const mockTransaction = {
                id: 1,
                customer_id: 1,
                order_id: 1,
                points: 50,
                type: 'redemption',
                balance_after: 50
            };
            
            mockDB.stubQuery('redeemPoints', { lastInsertRowid: 1 });
            mockDB.stubQuery('getPointsTransaction', { rows: [mockTransaction] });
            
            const transaction = await loyaltyManager.redeemPoints(1, 1, 50, 'Discount applied');
            assert.strictEqual(transaction.points, 50);
            assert.strictEqual(transaction.type, 'redemption');
        });
        
        it('should adjust points', async function() {
            const mockTransaction = {
                id: 1,
                customer_id: 1,
                points: 25,
                type: 'adjustment',
                balance_after: 75,
                reason: 'Promotional bonus'
            };
            
            mockDB.stubQuery('adjustPoints', { lastInsertRowid: 1 });
            mockDB.stubQuery('getPointsTransaction', { rows: [mockTransaction] });
            
            const transaction = await loyaltyManager.adjustPoints(1, 25, 'Promotional bonus', 'Staff bonus', 1);
            assert.strictEqual(transaction.points, 25);
            assert.strictEqual(transaction.type, 'adjustment');
        });
        
        it('should get customer points history', async function() {
            const mockTransactions = [
                { id: 1, points: 100, type: 'earned', created_at: '2023-01-01' },
                { id: 2, points: 50, type: 'redemption', created_at: '2023-01-02' }
            ];
            
            mockDB.stubQuery('getCustomerPointsHistory', { rows: mockTransactions });
            
            const transactions = await loyaltyManager.getCustomerPointsHistory(1, 10, 0);
            assert.strictEqual(transactions.length, 2);
            assert.strictEqual(transactions[0].type, 'earned');
        });
    });
    
    describe('Loyalty Rewards', function() {
        it('should get all rewards', async function() {
            const mockRewards = [
                { id: 1, name: 'Free Coffee', points_required: 100 },
                { id: 2, name: 'Free Pastry', points_required: 50 }
            ];
            
            mockDB.stubQuery('getAllRewards', { rows: mockRewards });
            
            const rewards = await loyaltyManager.getAllRewards();
            assert.strictEqual(rewards.length, 2);
            assert.strictEqual(rewards[0].name, 'Free Coffee');
        });
        
        it('should get a reward by ID', async function() {
            const mockReward = { id: 1, name: 'Free Coffee', points_required: 100 };
            
            mockDB.stubQuery('getReward', { rows: [mockReward] });
            
            const reward = await loyaltyManager.getReward(1);
            assert.strictEqual(reward.name, 'Free Coffee');
        });
        
        it('should create a new reward', async function() {
            const newReward = {
                program_id: 1,
                name: 'Free Dessert',
                points_required: 200,
                type: 'discount',
                value: 5
            };
            
            mockDB.stubQuery('createReward', { lastInsertRowid: 1 });
            mockDB.stubQuery('getReward', { rows: [{ id: 1, ...newReward }] });
            
            const reward = await loyaltyManager.createReward(newReward);
            assert.strictEqual(reward.id, 1);
            assert.strictEqual(reward.name, 'Free Dessert');
        });
        
        it('should update a reward', async function() {
            const updatedReward = {
                name: 'Free Lunch',
                points_required: 500
            };
            
            mockDB.stubQuery('getReward', { rows: [{ id: 1, name: 'Free Dessert', points_required: 200 }] });
            mockDB.stubQuery('updateReward', { lastInsertRowid: 1 });
            mockDB.stubQuery('getReward', { rows: [{ id: 1, ...updatedReward }] });
            
            const reward = await loyaltyManager.updateReward(1, updatedReward);
            assert.strictEqual(reward.name, 'Free Lunch');
        });
        
        it('should delete a reward', async function() {
            mockDB.stubQuery('getReward', { rows: [{ id: 1, name: 'Test Reward' }] });
            mockDB.stubQuery('deleteReward', {});
            
            await assert.doesNotReject(async () => {
                await loyaltyManager.deleteReward(1);
            });
        });
        
        it('should redeem a reward', async function() {
            const mockRedemption = {
                id: 1,
                reward_id: 1,
                customer_id: 1,
                order_id: 1,
                points_used: 100
            };
            
            mockDB.stubQuery('redeemReward', { lastInsertRowid: 1 });
            mockDB.stubQuery('getRewardRedemption', { rows: [mockRedemption] });
            
            const redemption = await loyaltyManager.redeemReward(1, 1, 1, 'Reward redemption');
            assert.strictEqual(redemption.reward_id, 1);
            assert.strictEqual(redemption.customer_id, 1);
        });
        
        it('should get customer rewards', async function() {
            const mockRewards = [
                { id: 1, name: 'Free Coffee', redeemed: true },
                { id: 2, name: 'Free Pastry', redeemed: false }
            ];
            
            mockDB.stubQuery('getCustomerRewards', { rows: mockRewards });
            
            const rewards = await loyaltyManager.getCustomerRewards(1);
            assert.strictEqual(rewards.length, 2);
        });
        
        it('should get available rewards for customer', async function() {
            const mockRewards = [
                { id: 1, name: 'Free Coffee', points_required: 100 }
            ];
            
            mockDB.stubQuery('getAvailableRewardsForCustomer', { rows: mockRewards });
            
            const rewards = await loyaltyManager.getAvailableRewardsForCustomer(1);
            assert.strictEqual(rewards.length, 1);
        });
    });
    
    describe('Punch Cards', function() {
        it('should get all punch cards', async function() {
            const mockPunchCards = [
                { id: 1, name: 'Buy 9 Get 1 Free', required_punches: 9 },
                { id: 2, name: 'Buy 5 Get 1 Free', required_punches: 5 }
            ];
            
            mockDB.stubQuery('getAllPunchCards', { rows: mockPunchCards });
            
            const punchCards = await loyaltyManager.getAllPunchCards();
            assert.strictEqual(punchCards.length, 2);
            assert.strictEqual(punchCards[0].name, 'Buy 9 Get 1 Free');
        });
        
        it('should get a punch card by ID', async function() {
            const mockPunchCard = { id: 1, name: 'Buy 9 Get 1 Free', required_punches: 9 };
            
            mockDB.stubQuery('getPunchCard', { rows: [mockPunchCard] });
            
            const punchCard = await loyaltyManager.getPunchCard(1);
            assert.strictEqual(punchCard.name, 'Buy 9 Get 1 Free');
        });
        
        it('should create a new punch card', async function() {
            const newPunchCard = {
                program_id: 1,
                name: 'Buy 10 Get 1 Free',
                required_punches: 10,
                reward_points: 0,
                reward_item_id: 1
            };
            
            mockDB.stubQuery('createPunchCard', { lastInsertRowid: 1 });
            mockDB.stubQuery('getPunchCard', { rows: [{ id: 1, ...newPunchCard }] });
            
            const punchCard = await loyaltyManager.createPunchCard(newPunchCard);
            assert.strictEqual(punchCard.id, 1);
            assert.strictEqual(punchCard.name, 'Buy 10 Get 1 Free');
        });
        
        it('should update a punch card', async function() {
            const updatedPunchCard = {
                name: 'Buy 8 Get 1 Free',
                required_punches: 8
            };
            
            mockDB.stubQuery('getPunchCard', { rows: [{ id: 1, name: 'Buy 10 Get 1 Free', required_punches: 10 }] });
            mockDB.stubQuery('updatePunchCard', { lastInsertRowid: 1 });
            mockDB.stubQuery('getPunchCard', { rows: [{ id: 1, ...updatedPunchCard }] });
            
            const punchCard = await loyaltyManager.updatePunchCard(1, updatedPunchCard);
            assert.strictEqual(punchCard.name, 'Buy 8 Get 1 Free');
        });
        
        it('should delete a punch card', async function() {
            mockDB.stubQuery('getPunchCard', { rows: [{ id: 1, name: 'Test Punch Card' }] });
            mockDB.stubQuery('deletePunchCard', {});
            
            await assert.doesNotReject(async () => {
                await loyaltyManager.deletePunchCard(1);
            });
        });
        
        it('should add punch to card', async function() {
            const mockPunch = {
                id: 1,
                card_id: 1,
                customer_id: 1,
                order_id: 1,
                current_punches: 1
            };
            
            mockDB.stubQuery('addPunchToCard', { lastInsertRowid: 1 });
            mockDB.stubQuery('getPunch', { rows: [mockPunch] });
            
            const punch = await loyaltyManager.addPunchToCard(1, 1, 1, 'Punch added');
            assert.strictEqual(punch.card_id, 1);
            assert.strictEqual(punch.customer_id, 1);
        });
        
        it('should get customer punch cards', async function() {
            const mockPunchCards = [
                { id: 1, name: 'Buy 9 Get 1 Free', current_punches: 5, required_punches: 9 }
            ];
            
            mockDB.stubQuery('getCustomerPunchCards', { rows: mockPunchCards });
            
            const punchCards = await loyaltyManager.getCustomerPunchCards(1);
            assert.strictEqual(punchCards.length, 1);
            assert.strictEqual(punchCards[0].current_punches, 5);
        });
    });
    
    describe('Points Expiration', function() {
        it('should process expired points', async function() {
            const mockResult = {
                expiredPoints: 100,
                affectedCustomers: 5,
                transactionsCreated: 5
            };
            
            mockDB.stubQuery('processExpiredPoints', { rows: [mockResult] });
            
            const result = await loyaltyManager.processExpiredPoints(30);
            assert.strictEqual(result.expiredPoints, 100);
            assert.strictEqual(result.affectedCustomers, 5);
        });
        
        it('should get expired points report', async function() {
            const mockReport = [
                { customer_id: 1, name: 'John Doe', expired_points: 50 },
                { customer_id: 2, name: 'Jane Smith', expired_points: 30 }
            ];
            
            mockDB.stubQuery('getExpiredPointsReport', { rows: mockReport });
            
            const report = await loyaltyManager.getExpiredPointsReport(30, 10);
            assert.strictEqual(report.length, 2);
        });
    });
    
    describe('Tier Management', function() {
        it('should check tier upgrade eligibility', async function() {
            const mockCheck = {
                eligible: true,
                current_tier: 'Silver',
                current_tier_id: 2,
                next_tier: 'Gold',
                next_tier_id: 3,
                points_needed: 0
            };
            
            mockDB.stubQuery('checkTierUpgradeEligibility', { rows: [mockCheck] });
            
            const check = await loyaltyManager.checkTierUpgradeEligibility(1);
            assert.strictEqual(check.eligible, true);
            assert.strictEqual(check.next_tier, 'Gold');
        });
        
        it('should upgrade customer tier', async function() {
            const mockResult = {
                customer_id: 1,
                old_tier: 'Silver',
                new_tier: 'Gold',
                points: 5000
            };
            
            mockDB.stubQuery('upgradeCustomerTier', { rows: [mockResult] });
            
            const result = await loyaltyManager.upgradeCustomerTier(1);
            assert.strictEqual(result.customer_id, 1);
            assert.strictEqual(result.new_tier, 'Gold');
        });
    });
    
    describe('Loyalty Statements', function() {
        it('should get loyalty statement', async function() {
            const mockStatement = {
                customer_id: 1,
                name: 'John Doe',
                current_points: 1000,
                lifetime_points: 5000,
                transactions: [
                    { id: 1, points: 100, type: 'earned', created_at: '2023-01-01' }
                ]
            };
            
            mockDB.stubQuery('getLoyaltyStatement', { rows: [mockStatement] });
            
            const statement = await loyaltyManager.getLoyaltyStatement(1, '2023-01-01', '2023-12-31');
            assert.strictEqual(statement.customer_id, 1);
            assert.strictEqual(statement.current_points, 1000);
        });
    });
    
    describe('Fraud Prevention', function() {
        it('should detect duplicate points transaction', async function() {
            const mockCheck = { is_duplicate: true };
            
            mockDB.stubQuery('checkDuplicatePointsTransaction', { rows: [mockCheck] });
            
            const check = await loyaltyManager.checkDuplicatePointsTransaction(1, 1, 'earned');
            assert.strictEqual(check.is_duplicate, true);
        });
        
        it('should validate points redemption', async function() {
            const mockValidation = {
                is_valid: true,
                available_points: 100,
                required_points: 50
            };
            
            mockDB.stubQuery('validatePointsRedemption', { rows: [mockValidation] });
            
            const validation = await loyaltyManager.validatePointsRedemption(1, 50);
            assert.strictEqual(validation.is_valid, true);
            assert.strictEqual(validation.available_points, 100);
        });
    });
    
    describe('Error Handling', function() {
        it('should handle database errors gracefully', async function() {
            mockDB.stubQuery('getLoyaltyProgram', { rows: [] });
            
            await assert.rejects(
                async () => await loyaltyManager.getLoyaltyProgram(999),
                { message: 'Loyalty program not found' }
            );
        });
        
        it('should handle invalid points operations', async function() {
            mockDB.stubQuery('getCustomerLoyaltyStatus', { rows: [{ current_points: 10 }] });
            
            await assert.rejects(
                async () => await loyaltyManager.redeemPoints(1, 1, 50, 'Test'),
                { message: 'Insufficient points' }
            );
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
