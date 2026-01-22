/**
 * Loyalty Manager
 * 
 * Handles all loyalty program operations including:
 * - Program management
 * - Points calculation and transactions
 * - Tier management
 * - Reward management
 * - Punch card management
 * - Points expiration
 * - Fraud prevention
 */

const { v4: uuidv4 } = require('uuid');

class LoyaltyManager {
    constructor(db) {
        this.db = db;
    }

    /**
     * Create a new loyalty program
     * @param {Object} programData - Program details
     * @returns {Promise<Object>} Created program
     */
    async createProgram(programData) {
        const { name, description, points_per_currency, is_active, 
                min_purchase_amount, points_expiration_days, max_points_balance } = programData;
        
        const sql = `
            INSERT INTO loyalty_programs 
            (name, description, points_per_currency, is_active, 
             min_purchase_amount, points_expiration_days, max_points_balance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `;
        
        const params = [
            name, 
            description || null, 
            points_per_currency || 1.0, 
            is_active !== undefined ? is_active : true,
            min_purchase_amount || 0.0,
            points_expiration_days || null,
            max_points_balance || null
        ];
        
        const result = await this.db.run(sql, params);
        return result;
    }

    /**
     * Get loyalty program by ID
     * @param {number} programId - Program ID
     * @returns {Promise<Object>} Program details
     */
    async getProgram(programId) {
        const sql = 'SELECT * FROM loyalty_programs WHERE id = ?';
        return await this.db.get(sql, [programId]);
    }

    /**
     * Get all loyalty programs
     * @param {boolean} activeOnly - Only active programs
     * @returns {Promise<Array>} List of programs
     */
    async getAllPrograms(activeOnly = true) {
        let sql = 'SELECT * FROM loyalty_programs';
        const params = [];
        
        if (activeOnly) {
            sql += ' WHERE is_active = 1';
        }
        
        sql += ' ORDER BY name';
        return await this.db.all(sql, params);
    }

    /**
     * Update loyalty program
     * @param {number} programId - Program ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated program
     */
    async updateProgram(programId, updates) {
        const { name, description, points_per_currency, is_active, 
                min_purchase_amount, points_expiration_days, max_points_balance } = updates;
        
        const fields = [];
        const params = [];
        
        if (name !== undefined) {
            fields.push('name = ?');
            params.push(name);
        }
        if (description !== undefined) {
            fields.push('description = ?');
            params.push(description);
        }
        if (points_per_currency !== undefined) {
            fields.push('points_per_currency = ?');
            params.push(points_per_currency);
        }
        if (is_active !== undefined) {
            fields.push('is_active = ?');
            params.push(is_active);
        }
        if (min_purchase_amount !== undefined) {
            fields.push('min_purchase_amount = ?');
            params.push(min_purchase_amount);
        }
        if (points_expiration_days !== undefined) {
            fields.push('points_expiration_days = ?');
            params.push(points_expiration_days);
        }
        if (max_points_balance !== undefined) {
            fields.push('max_points_balance = ?');
            params.push(max_points_balance);
        }
        
        params.push(programId);
        
        const sql = `UPDATE loyalty_programs SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`;
        return await this.db.get(sql, params);
    }

    /**
     * Create a loyalty tier
     * @param {number} programId - Program ID
     * @param {Object} tierData - Tier details
     * @returns {Promise<Object>} Created tier
     */
    async createTier(programId, tierData) {
        const { name, min_points, max_points, description, discount_percent, free_shipping } = tierData;
        
        const sql = `
            INSERT INTO loyalty_tiers 
            (program_id, name, min_points, max_points, description, 
             discount_percent, free_shipping)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `;
        
        const params = [
            programId,
            name,
            min_points,
            max_points || null,
            description || null,
            discount_percent || 0.0,
            free_shipping || false
        ];
        
        return await this.db.get(sql, params);
    }

    /**
     * Get all tiers for a program
     * @param {number} programId - Program ID
     * @returns {Promise<Array>} List of tiers
     */
    async getTiers(programId) {
        const sql = 'SELECT * FROM loyalty_tiers WHERE program_id = ? ORDER BY min_points ASC';
        return await this.db.all(sql, [programId]);
    }

    /**
     * Assign customer to loyalty program
     * @param {number} customerId - Customer ID
     * @param {number} programId - Program ID
     * @returns {Promise<Object>} Membership record
     */
    async assignCustomerToProgram(customerId, programId) {
        // Check if customer already has a membership
        const existing = await this.db.get(
            'SELECT * FROM loyalty_customer_memberships WHERE customer_id = ? AND program_id = ?',
            [customerId, programId]
        );
        
        if (existing) {
            return existing;
        }
        
        // Create new membership
        const sql = `
            INSERT INTO loyalty_customer_memberships 
            (customer_id, program_id, points_balance, joined_at, last_activity_at)
            VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
        `;
        
        const membership = await this.db.get(sql, [customerId, programId]);
        
        // Update customer record
        await this.db.run(
            'UPDATE customers SET loyalty_program_id = ?, loyalty_points_balance = 0 WHERE id = ?',
            [programId, customerId]
        );
        
        return membership;
    }

    /**
     * Get customer's loyalty status
     * @param {number} customerId - Customer ID
     * @param {number} programId - Program ID (optional)
     * @returns {Promise<Object>} Loyalty status
     */
    async getCustomerLoyaltyStatus(customerId, programId = null) {
        let sql;
        let params;
        
        if (programId) {
            sql = `
                SELECT 
                    lcm.id AS membership_id,
                    lcm.customer_id,
                    lcm.program_id,
                    lp.name AS program_name,
                    lp.points_per_currency,
                    lp.min_purchase_amount,
                    lp.points_expiration_days,
                    lp.max_points_balance,
                    lcm.points_balance,
                    lcm.tier_id,
                    lt.name AS tier_name,
                    lt.min_points AS tier_min_points,
                    lt.max_points AS tier_max_points,
                    lt.discount_percent,
                    lt.free_shipping,
                    lcm.joined_at,
                    lcm.last_activity_at
                FROM loyalty_customer_memberships lcm
                JOIN loyalty_programs lp ON lcm.program_id = lp.id
                LEFT JOIN loyalty_tiers lt ON lcm.tier_id = lt.id
                WHERE lcm.customer_id = ? AND lcm.program_id = ?
            `;
            params = [customerId, programId];
        } else {
            sql = `
                SELECT 
                    lcm.id AS membership_id,
                    lcm.customer_id,
                    lcm.program_id,
                    lp.name AS program_name,
                    lp.points_per_currency,
                    lp.min_purchase_amount,
                    lp.points_expiration_days,
                    lp.max_points_balance,
                    lcm.points_balance,
                    lcm.tier_id,
                    lt.name AS tier_name,
                    lt.min_points AS tier_min_points,
                    lt.max_points AS tier_max_points,
                    lt.discount_percent,
                    lt.free_shipping,
                    lcm.joined_at,
                    lcm.last_activity_at
                FROM loyalty_customer_memberships lcm
                JOIN loyalty_programs lp ON lcm.program_id = lp.id
                LEFT JOIN loyalty_tiers lt ON lcm.tier_id = lt.id
                WHERE lcm.customer_id = ?
                ORDER BY lp.name
            `;
            params = [customerId];
        }
        
        return await this.db.get(sql, params);
    }

    /**
     * Calculate points to earn for an order
     * @param {number} programId - Program ID
     * @param {number} orderTotal - Order total amount
     * @param {number} customerId - Customer ID (for fraud prevention)
     * @returns {Promise<Object>} Points calculation result
     */
    async calculatePointsToEarn(programId, orderTotal, customerId) {
        const program = await this.getProgram(programId);
        
        if (!program || !program.is_active) {
            throw new Error('Invalid or inactive loyalty program');
        }
        
        // Check minimum purchase requirement
        if (program.min_purchase_amount > 0 && orderTotal < program.min_purchase_amount) {
            return { points: 0, reason: 'minimum_purchase_not_met' };
        }
        
        // Calculate points
        const points = Math.floor(orderTotal * program.points_per_currency);
        
        // Check for fraud prevention - unusual points patterns
        if (await this._checkForFraudulentActivity(customerId, points, orderTotal)) {
            throw new Error('Potential fraud detected - points calculation failed');
        }
        
        return { points, reason: 'calculated' };
    }

    /**
     * Earn points for an order
     * @param {number} customerId - Customer ID
     * @param {number} programId - Program ID
     * @param {number} orderId - Order ID
     * @param {number} points - Points to earn
     * @param {string} notes - Optional notes
     * @returns {Promise<Object>} Transaction result
     */
    async earnPoints(customerId, programId, orderId, points, notes = '') {
        // Get current balance
        const membership = await this.getCustomerLoyaltyStatus(customerId, programId);
        
        if (!membership) {
            throw new Error('Customer not enrolled in this loyalty program');
        }
        
        const newBalance = membership.points_balance + points;
        
        // Check max balance limit
        if (membership.max_points_balance && newBalance > membership.max_points_balance) {
            points = membership.max_points_balance - membership.points_balance;
            newBalance = membership.max_points_balance;
        }
        
        // Create transaction
        const sql = `
            INSERT INTO loyalty_points_transactions 
            (customer_id, program_id, order_id, transaction_type, points, 
             balance_after, reference_id, reference_type, notes)
            VALUES (?, ?, ?, 'earned', ?, ?, ?, ?, ?)
            RETURNING *
        `;
        
        const transaction = await this.db.get(sql, [
            customerId,
            programId,
            orderId,
            points,
            newBalance,
            orderId,
            'order',
            notes || null
        ]);
        
        // Update membership balance
        await this.db.run(
            'UPDATE loyalty_customer_memberships SET points_balance = ?, last_activity_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND program_id = ?',
            [newBalance, customerId, programId]
        );
        
        // Update customer record
        await this.db.run(
            'UPDATE customers SET loyalty_points_balance = ? WHERE id = ?',
            [newBalance, customerId]
        );
        
        // Check if tier should be updated
        await this._updateCustomerTier(customerId, programId);
        
        return transaction;
    }

    /**
     * Redeem points for an order
     * @param {number} customerId - Customer ID
     * @param {number} programId - Program ID
     * @param {number} orderId - Order ID
     * @param {number} points - Points to redeem
     * @param {string} notes - Optional notes
     * @returns {Promise<Object>} Transaction result
     */
    async redeemPoints(customerId, programId, orderId, points, notes = '') {
        // Get current balance
        const membership = await this.getCustomerLoyaltyStatus(customerId, programId);
        
        if (!membership) {
            throw new Error('Customer not enrolled in this loyalty program');
        }
        
        if (membership.points_balance < points) {
            throw new Error('Insufficient points balance');
        }
        
        const newBalance = membership.points_balance - points;
        
        // Create transaction
        const sql = `
            INSERT INTO loyalty_points_transactions 
            (customer_id, program_id, order_id, transaction_type, points, 
             balance_after, reference_id, reference_type, notes)
            VALUES (?, ?, ?, 'redeemed', ?, ?, ?, ?, ?)
            RETURNING *
        `;
        
        const transaction = await this.db.get(sql, [
            customerId,
            programId,
            orderId,
            -points,  // Negative for redemption
            newBalance,
            orderId,
            'order',
            notes || null
        ]);
        
        // Update membership balance
        await this.db.run(
            'UPDATE loyalty_customer_memberships SET points_balance = ?, last_activity_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND program_id = ?',
            [newBalance, customerId, programId]
        );
        
        // Update customer record
        await this.db.run(
            'UPDATE customers SET loyalty_points_balance = ? WHERE id = ?',
            [newBalance, customerId]
        );
        
        // Check if tier should be updated
        await this._updateCustomerTier(customerId, programId);
        
        return transaction;
    }

    /**
     * Create a reward
     * @param {number} programId - Program ID
     * @param {Object} rewardData - Reward details
     * @returns {Promise<Object>} Created reward
     */
    async createReward(programId, rewardData) {
        const { name, description, points_required, type, value, 
                max_usage_per_customer, is_active } = rewardData;
        
        const sql = `
            INSERT INTO loyalty_rewards 
            (program_id, name, description, points_required, type, value, 
             max_usage_per_customer, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `;
        
        const params = [
            programId,
            name,
            description || null,
            points_required,
            type,
            value,
            max_usage_per_customer || null,
            is_active !== undefined ? is_active : true
        ];
        
        return await this.db.get(sql, params);
    }

    /**
     * Get available rewards for customer
     * @param {number} customerId - Customer ID
     * @param {number} programId - Program ID
     * @returns {Promise<Array>} Available rewards
     */
    async getAvailableRewards(customerId, programId) {
        const membership = await this.getCustomerLoyaltyStatus(customerId, programId);
        
        if (!membership) {
            return [];
        }
        
        const sql = `
            SELECT * FROM loyalty_rewards 
            WHERE program_id = ? 
            AND is_active = 1 
            AND points_required <= ?
            ORDER BY points_required ASC
        `;
        
        return await this.db.all(sql, [programId, membership.points_balance]);
    }

    /**
     * Create a punch card
     * @param {number} programId - Program ID
     * @param {Object} punchCardData - Punch card details
     * @returns {Promise<Object>} Created punch card
     */
    async createPunchCard(programId, punchCardData) {
        const { name, description, required_punches, reward_description, is_active } = punchCardData;
        
        const sql = `
            INSERT INTO loyalty_punch_cards 
            (program_id, name, description, required_punches, 
             reward_description, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *
        `;
        
        const params = [
            programId,
            name,
            description || null,
            required_punches,
            reward_description || null,
            is_active !== undefined ? is_active : true
        ];
        
        return await this.db.get(sql, params);
    }

    /**
     * Add punch to customer's punch card
     * @param {number} customerId - Customer ID
     * @param {number} punchCardId - Punch card ID
     * @param {number} orderId - Order ID
     * @returns {Promise<Object>} Updated punch card instance
     */
    async addPunch(customerId, punchCardId, orderId) {
        // Get or create punch card instance
        let instance = await this.db.get(
            'SELECT * FROM loyalty_punch_card_instances WHERE customer_id = ? AND punch_card_id = ?',
            [customerId, punchCardId]
        );
        
        if (!instance) {
            const sql = `
                INSERT INTO loyalty_punch_card_instances 
                (customer_id, punch_card_id, current_punches)
                VALUES (?, ?, 0)
                RETURNING *
            `;
            instance = await this.db.get(sql, [customerId, punchCardId]);
        }
        
        // Increment punch count
        const newPunchCount = instance.current_punches + 1;
        
        const sql = `
            UPDATE loyalty_punch_card_instances 
            SET current_punches = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *
        `;
        
        instance = await this.db.get(sql, [newPunchCount, instance.id]);
        
        // Create transaction record
        await this.db.run(
            `INSERT INTO loyalty_points_transactions 
             (customer_id, program_id, order_id, transaction_type, points, 
              balance_after, reference_id, reference_type, notes)
             VALUES (?, 
                     (SELECT program_id FROM loyalty_punch_cards WHERE id = ?), 
                     ?, 'punch', 0, 0, ?, 'punch_card', ?)`,
            [customerId, punchCardId, orderId, punchCardId, `Punch added to ${instance.current_punches}/${required_punches}`]
        );
        
        return instance;
    }

    /**
     * Check if punch card is complete
     * @param {number} customerId - Customer ID
     * @param {number} punchCardId - Punch card ID
     * @returns {Promise<Object>} Punch card status
     */
    async checkPunchCardStatus(customerId, punchCardId) {
        const sql = `
            SELECT 
                lpi.id,
                lpi.customer_id,
                lpi.punch_card_id,
                lpi.current_punches,
                lpc.required_punches,
                lpc.reward_description,
                lpi.redeemed_at,
                CASE WHEN lpi.current_punches >= lpc.required_punches AND lpi.redeemed_at IS NULL THEN 1 ELSE 0 END AS is_ready_to_redeem
            FROM loyalty_punch_card_instances lpi
            JOIN loyalty_punch_cards lpc ON lpi.punch_card_id = lpc.id
            WHERE lpi.customer_id = ? AND lpi.punch_card_id = ?
        `;
        
        return await this.db.get(sql, [customerId, punchCardId]);
    }

    /**
     * Redeem punch card
     * @param {number} customerId - Customer ID
     * @param {number} punchCardId - Punch card ID
     * @param {number} orderId - Order ID
     * @returns {Promise<Object>} Redeemed punch card
     */
    async redeemPunchCard(customerId, punchCardId, orderId) {
        const status = await this.checkPunchCardStatus(customerId, punchCardId);
        
        if (!status || !status.is_ready_to_redeem) {
            throw new Error('Punch card not ready for redemption');
        }
        
        const sql = `
            UPDATE loyalty_punch_card_instances 
            SET redeemed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *
        `;
        
        const instance = await this.db.get(sql, [status.id]);
        
        // Create transaction record
        await this.db.run(
            `INSERT INTO loyalty_points_transactions 
             (customer_id, program_id, order_id, transaction_type, points, 
              balance_after, reference_id, reference_type, notes)
             VALUES (?, 
                     (SELECT program_id FROM loyalty_punch_cards WHERE id = ?), 
                     ?, 'punch_redeemed', 0, 0, ?, 'punch_card', ?)`,
            [customerId, punchCardId, orderId, punchCardId, 'Punch card redeemed']
        );
        
        return instance;
    }

    /**
     * Process points expiration
     * @param {number} programId - Program ID
     * @returns {Promise<Object>} Expiration results
     */
    async processPointsExpiration(programId) {
        const program = await this.getProgram(programId);
        
        if (!program || !program.points_expiration_days || !program.is_active) {
            return { expired: 0, remaining: 0 };
        }
        
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() - program.points_expiration_days);
        
        // Find expired points
        const expiredTransactions = await this.db.all(
            `SELECT lpt.* 
             FROM loyalty_points_transactions lpt
             JOIN loyalty_programs lp ON lpt.program_id = lp.id
             WHERE lpt.program_id = ?
             AND lpt.transaction_type = 'earned'
             AND lpt.created_at < ?
             AND NOT EXISTS (
                 SELECT 1 FROM loyalty_points_transactions lpt2
                 WHERE lpt2.customer_id = lpt.customer_id
                 AND lpt2.program_id = lpt.program_id
                 AND lpt2.transaction_type = 'expired'
                 AND lpt2.reference_id = lpt.id
             )`,
            [programId, expirationDate.toISOString()]
        );
        
        let expiredCount = 0;
        
        for (const tx of expiredTransactions) {
            // Create expiration transaction
            await this.db.run(
                `INSERT INTO loyalty_points_transactions 
                 (customer_id, program_id, order_id, transaction_type, points, 
                  balance_after, reference_id, reference_type, notes)
                 VALUES (?, ?, ?, 'expired', ?, ?, ?, 'expired_points', ?)`,
                [
                    tx.customer_id,
                    tx.program_id,
                    tx.order_id,
                    -tx.points,
                    tx.balance_after - tx.points,
                    tx.id,
                    `Points expired: ${tx.points} points`
                ]
            );
            
            // Update membership balance
            await this.db.run(
                'UPDATE loyalty_customer_memberships SET points_balance = points_balance - ? WHERE customer_id = ? AND program_id = ?',
                [tx.points, tx.customer_id, tx.program_id]
            );
            
            // Update customer record
            await this.db.run(
                'UPDATE customers SET loyalty_points_balance = loyalty_points_balance - ? WHERE id = ?',
                [tx.points, tx.customer_id]
            );
            
            expiredCount++;
        }
        
        return { expired: expiredCount, remaining: expiredTransactions.length - expiredCount };
    }

    /**
     * Get loyalty report
     * @param {Object} filters - Report filters
     * @returns {Promise<Object>} Loyalty report data
     */
    async getLoyaltyReport(filters = {}) {
        const { programId, startDate, endDate, includeInactive } = filters;
        
        let sql = `
            SELECT 
                lp.id AS program_id,
                lp.name AS program_name,
                COUNT(DISTINCT lcm.customer_id) AS active_members,
                SUM(lcm.points_balance) AS total_points_issued,
                AVG(lcm.points_balance) AS avg_points_per_member,
                COUNT(DISTINCT CASE WHEN lcm.points_balance > 0 THEN lcm.customer_id END) AS members_with_balance,
                COUNT(DISTINCT CASE WHEN lcm.points_balance = 0 THEN lcm.customer_id END) AS members_without_balance,
                COUNT(DISTINCT CASE WHEN lt.id IS NOT NULL THEN lcm.customer_id END) AS members_in_tiers,
                SUM(CASE WHEN lcm.tier_id IS NOT NULL THEN 1 ELSE 0 END) AS total_tier_members
            FROM loyalty_programs lp
            LEFT JOIN loyalty_customer_memberships lcm ON lp.id = lcm.program_id
            LEFT JOIN loyalty_tiers lt ON lcm.tier_id = lt.id
        `;
        
        const params = [];
        
        if (programId) {
            sql += ' WHERE lp.id = ?';
            params.push(programId);
        } else if (!includeInactive) {
            sql += ' WHERE lp.is_active = 1';
        }
        
        sql += ' GROUP BY lp.id, lp.name';
        
        const programs = await this.db.all(sql, params);
        
        // Get points transaction summary
        let txSql = `
            SELECT 
                lpt.program_id,
                SUM(CASE WHEN lpt.transaction_type = 'earned' THEN lpt.points ELSE 0 END) AS points_earned,
                SUM(CASE WHEN lpt.transaction_type = 'redeemed' THEN lpt.points ELSE 0 END) AS points_redeemed,
                COUNT(*) AS total_transactions
        `;
        
        if (startDate || endDate) {
            txSql += ' WHERE';
            const conditions = [];
            if (startDate) {
                conditions.push('lpt.created_at >= ?');
                params.push(startDate);
            }
            if (endDate) {
                conditions.push('lpt.created_at <= ?');
                params.push(endDate);
            }
            txSql += conditions.join(' AND ');
        }
        
        txSql += ' GROUP BY lpt.program_id';
        
        const transactions = await this.db.all(txSql, params);
        
        // Merge data
        return programs.map(program => {
            const tx = transactions.find(t => t.program_id === program.program_id);
            return {
                ...program,
                points_earned: tx ? tx.points_earned : 0,
                points_redeemed: tx ? tx.points_redeemed : 0,
                redemption_rate: tx && tx.points_earned > 0 ? (tx.points_redeemed / tx.points_earned) * 100 : 0
            };
        });
    }

    /**
     * Get customer loyalty statement
     * @param {number} customerId - Customer ID
     * @param {number} programId - Program ID
     * @param {Object} options - Pagination options
     * @returns {Promise<Object>} Loyalty statement
     */
    async getCustomerStatement(customerId, programId, options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        const membership = await this.getCustomerLoyaltyStatus(customerId, programId);
        
        if (!membership) {
            return { membership: null, transactions: [] };
        }
        
        const txSql = `
            SELECT 
                lpt.id,
                lpt.transaction_type,
                lpt.points,
                lpt.balance_after,
                lpt.created_at,
                lpt.notes,
                o.id AS order_id,
                o.total_amount,
                o.order_number
            FROM loyalty_points_transactions lpt
            LEFT JOIN orders o ON lpt.order_id = o.id
            WHERE lpt.customer_id = ? AND lpt.program_id = ?
            ORDER BY lpt.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const transactions = await this.db.all(txSql, [customerId, programId, limit, offset]);
        
        return { membership, transactions };
    }

    /**
     * Internal method to update customer tier based on points balance
     * @private
     */
    async _updateCustomerTier(customerId, programId) {
        const membership = await this.getCustomerLoyaltyStatus(customerId, programId);
        
        if (!membership) {
            return;
        }
        
        const tiers = await this.getTiers(programId);
        
        if (tiers.length === 0) {
            return;
        }
        
        // Find the highest tier the customer qualifies for
        let newTier = null;
        
        for (const tier of tiers) {
            if (membership.points_balance >= tier.min_points) {
                if (!tier.max_points || membership.points_balance <= tier.max_points) {
                    newTier = tier;
                }
            }
        }
        
        // If no tier matches (below minimum), set to null
        if (!newTier && tiers[0].min_points > membership.points_balance) {
            newTier = null;
        }
        
        // Update membership if tier changed
        if (newTier && newTier.id !== membership.tier_id) {
            await this.db.run(
                'UPDATE loyalty_customer_memberships SET tier_id = ? WHERE customer_id = ? AND program_id = ?',
                [newTier.id, customerId, programId]
            );
            
            await this.db.run(
                'UPDATE customers SET loyalty_tier_id = ? WHERE id = ?',
                [newTier.id, customerId]
            );
        } else if (!newTier && membership.tier_id) {
            // Remove tier if customer no longer qualifies
            await this.db.run(
                'UPDATE loyalty_customer_memberships SET tier_id = NULL WHERE customer_id = ? AND program_id = ?',
                [customerId, programId]
            );
            
            await this.db.run(
                'UPDATE customers SET loyalty_tier_id = NULL WHERE id = ?',
                [customerId]
            );
        }
    }

    /**
     * Internal method for fraud prevention
     * @private
     */
    async _checkForFraudulentActivity(customerId, points, orderTotal) {
        // Check for unusual patterns
        const recentTransactions = await this.db.all(
            `SELECT * FROM loyalty_points_transactions 
             WHERE customer_id = ? 
             AND transaction_type = 'earned'
             AND created_at > datetime('now', '-1 hour')
             ORDER BY created_at DESC`,
            [customerId]
        );
        
        // If more than 5 transactions in last hour, flag as potential fraud
        if (recentTransactions.length > 5) {
            return true;
        }
        
        // Check for unusually high points for small orders
        const program = await this.getProgram(recentTransactions[0]?.program_id || 1);
        if (program && orderTotal < 1 && points > 0) {
            return true;
        }
        
        return false;
    }

    /**
     * Validate loyalty program configuration
     * @param {number} programId - Program ID
     * @returns {Promise<Object>} Validation result
     */
    async validateProgram(programId) {
        const program = await this.getProgram(programId);
        
        if (!program) {
            return { valid: false, errors: ['Program not found'] };
        }
        
        if (!program.is_active) {
            return { valid: false, errors: ['Program is inactive'] };
        }
        
        if (program.points_per_currency <= 0) {
            return { valid: false, errors: ['Points per currency must be positive'] };
        }
        
        const tiers = await this.getTiers(programId);
        
        // Check tier configuration
        for (let i = 0; i < tiers.length; i++) {
            const tier = tiers[i];
            
            if (i > 0 && tier.min_points <= tiers[i - 1].min_points) {
                return { valid: false, errors: ['Tiers must have increasing minimum points'] };
            }
            
            if (tier.max_points && tiers[i + 1] && tier.max_points >= tiers[i + 1].min_points) {
                return { valid: false, errors: ['Tier max points must be less than next tier min points'] };
            }
        }
        
        return { valid: true, errors: [] };
    }
}

module.exports = LoyaltyManager;
