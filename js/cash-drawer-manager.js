/**
 * Cash Drawer Manager
 * Handles cash drawer operations including opening, closing, and managing sessions
 */

const { v4: uuidv4 } = require('uuid');

class CashDrawerManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger || console;
    }

    /**
     * Create a new cash drawer
     * @param {Object} drawerData - Cash drawer data
     * @returns {Promise<Object>} Created cash drawer
     */
    async createCashDrawer(drawerData) {
        const { name, location, description, is_active = true } = drawerData;
        
        const sql = `
            INSERT INTO cash_drawers (name, location, description, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
        `;
        
        const result = await this.db.run(sql, [name, location, description, is_active]);
        
        // Log audit
        await this.logAudit({
            action: 'CREATE_CASH_DRAWER',
            details: JSON.stringify({ drawer_id: result.lastID, name }),
            cash_drawer_id: result.lastID
        });
        
        return { id: result.lastID, ...drawerData };
    }

    /**
     * Get all cash drawers
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} List of cash drawers
     */
    async getCashDrawers(filters = {}) {
        const { activeOnly = true, location } = filters;
        
        let sql = 'SELECT * FROM cash_drawers WHERE deleted_at IS NULL';
        const params = [];
        
        if (activeOnly) {
            sql += ' AND is_active = 1';
        }
        
        if (location) {
            sql += ' AND location = ?';
            params.push(location);
        }
        
        sql += ' ORDER BY name ASC';
        
        return await this.db.all(sql, params);
    }

    /**
     * Get cash drawer by ID
     * @param {number} id - Cash drawer ID
     * @returns {Promise<Object>} Cash drawer data
     */
    async getCashDrawerById(id) {
        const sql = 'SELECT * FROM cash_drawers WHERE id = ? AND deleted_at IS NULL';
        return await this.db.get(sql, [id]);
    }

    /**
     * Update cash drawer
     * @param {number} id - Cash drawer ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated cash drawer
     */
    async updateCashDrawer(id, updates) {
        const { name, location, description, is_active } = updates;
        
        const sql = `
            UPDATE cash_drawers
            SET name = COALESCE(?, name),
                location = COALESCE(?, location),
                description = COALESCE(?, description),
                is_active = COALESCE(?, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *
        `;
        
        const result = await this.db.get(sql, [name, location, description, is_active, id]);
        
        if (result) {
            await this.logAudit({
                action: 'UPDATE_CASH_DRAWER',
                details: JSON.stringify({ drawer_id: id, updates }),
                cash_drawer_id: id
            });
        }
        
        return result;
    }

    /**
     * Delete (soft delete) cash drawer
     * @param {number} id - Cash drawer ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteCashDrawer(id) {
        const sql = `
            UPDATE cash_drawers
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        
        const result = await this.db.run(sql, [id]);
        
        if (result.changes > 0) {
            await this.logAudit({
                action: 'DELETE_CASH_DRAWER',
                details: JSON.stringify({ drawer_id: id }),
                cash_drawer_id: id
            });
        }
        
        return result.changes > 0;
    }

    /**
     * Open a new cash drawer session
     * @param {Object} sessionData - Session data
     * @param {number} sessionData.cash_drawer_id - Cash drawer ID
     * @param {number} sessionData.opened_by - User ID
     * @param {number} sessionData.opening_balance - Opening balance
     * @param {string} sessionData.notes - Optional notes
     * @returns {Promise<Object>} Created session
     */
    async openCashDrawerSession(sessionData) {
        const { cash_drawer_id, opened_by, opening_balance, notes = '' } = sessionData;
        
        // Validate cash drawer exists and is active
        const drawer = await this.getCashDrawerById(cash_drawer_id);
        if (!drawer || !drawer.is_active) {
            throw new Error('Cash drawer not found or not active');
        }
        
        // Check if there's an open session for this drawer
        const openSession = await this.getOpenSessionByDrawerId(cash_drawer_id);
        if (openSession) {
            throw new Error('Cash drawer already has an open session');
        }
        
        const sql = `
            INSERT INTO cash_drawer_sessions 
            (cash_drawer_id, opened_by, opened_at, opening_balance, status, notes)
            VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'open', ?)
            RETURNING *
        `;
        
        const result = await this.db.get(sql, [cash_drawer_id, opened_by, opening_balance, notes]);
        
        // Log audit
        await this.logAudit({
            action: 'OPEN_SESSION',
            details: JSON.stringify({ session_id: result.id, cash_drawer_id, opening_balance }),
            cash_drawer_id,
            session_id: result.id
        });
        
        return result;
    }

    /**
     * Get open session by cash drawer ID
     * @param {number} cash_drawer_id - Cash drawer ID
     * @returns {Promise<Object>} Open session or null
     */
    async getOpenSessionByDrawerId(cash_drawer_id) {
        const sql = `
            SELECT * FROM cash_drawer_sessions
            WHERE cash_drawer_id = ? AND status = 'open'
            ORDER BY opened_at DESC
            LIMIT 1
        `;
        return await this.db.get(sql, [cash_drawer_id]);
    }

    /**
     * Get all sessions for a cash drawer
     * @param {number} cash_drawer_id - Cash drawer ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of sessions
     */
    async getSessionsByDrawerId(cash_drawer_id, options = {}) {
        const { limit, offset } = options;
        
        let sql = `
            SELECT * FROM cash_drawer_sessions
            WHERE cash_drawer_id = ?
        `;
        const params = [cash_drawer_id];
        
        if (limit) {
            sql += ' LIMIT ?';
            params.push(limit);
        }
        
        if (offset) {
            sql += ' OFFSET ?';
            params.push(offset);
        }
        
        sql += ' ORDER BY opened_at DESC';
        
        return await this.db.all(sql, params);
    }

    /**
     * Close a cash drawer session
     * @param {number} session_id - Session ID
     * @param {number} closed_by - User ID
     * @param {Object} closeData - Close data
     * @param {number} closeData.closing_balance - Closing balance
     * @param {string} closeData.notes - Optional notes
     * @returns {Promise<Object>} Closed session
     */
    async closeCashDrawerSession(session_id, closed_by, closeData) {
        const { closing_balance, notes = '' } = closeData;
        
        // Get current session
        const session = await this.getSessionById(session_id);
        if (!session || session.status !== 'open') {
            throw new Error('Session not found or already closed');
        }
        
        // Calculate expected balance
        const transactions = await this.getTransactionsBySessionId(session_id);
        const expected_balance = this.calculateExpectedBalance(session.opening_balance, transactions);
        
        const over_short_amount = parseFloat(closing_balance) - parseFloat(expected_balance);
        
        const sql = `
            UPDATE cash_drawer_sessions
            SET 
                closed_at = CURRENT_TIMESTAMP,
                closing_balance = ?,
                expected_balance = ?,
                over_short_amount = ?,
                status = 'closed',
                notes = COALESCE(notes, ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *
        `;
        
        const result = await this.db.get(sql, [
            closing_balance,
            expected_balance,
            over_short_amount,
            notes,
            session_id
        ]);
        
        // Log audit
        await this.logAudit({
            action: 'CLOSE_SESSION',
            details: JSON.stringify({ 
                session_id, 
                closing_balance, 
                expected_balance,
                over_short_amount
            }),
            cash_drawer_id: session.cash_drawer_id,
            session_id
        });
        
        return result;
    }

    /**
     * Get session by ID
     * @param {number} session_id - Session ID
     * @returns {Promise<Object>} Session data
     */
    async getSessionById(session_id) {
        const sql = 'SELECT * FROM cash_drawer_sessions WHERE id = ?';
        return await this.db.get(sql, [session_id]);
    }

    /**
     * Calculate expected balance for a session
     * @param {number} opening_balance - Opening balance
     * @param {Array} transactions - Array of transactions
     * @returns {number} Expected balance
     */
    calculateExpectedBalance(opening_balance, transactions) {
        let balance = parseFloat(opening_balance);
        
        transactions.forEach(tx => {
            const amount = parseFloat(tx.amount) || 0;
            
            switch (tx.transaction_type) {
                case 'PAYMENT':
                case 'CASH_IN':
                    balance += amount;
                    break;
                case 'REFUND':
                case 'CASH_OUT':
                case 'VOID':
                    balance -= amount;
                    break;
            }
        });
        
        return parseFloat(balance.toFixed(2));
    }

    /**
     * Record a cash drawer transaction
     * @param {Object} transactionData - Transaction data
     * @param {number} transactionData.session_id - Session ID
     * @param {string} transactionData.transaction_type - Transaction type
     * @param {number} transactionData.amount - Amount
     * @param {number} transactionData.reference_id - Reference ID (payment ID, etc.)
     * @param {string} transactionData.reference_type - Reference type
     * @param {string} transactionData.description - Description
     * @returns {Promise<Object>} Created transaction
     */
    async recordTransaction(transactionData) {
        const { 
            session_id, 
            transaction_type, 
            amount, 
            reference_id, 
            reference_type, 
            description
        } = transactionData;
        
        // Verify session is open
        const session = await this.getSessionById(session_id);
        if (!session || session.status !== 'open') {
            throw new Error('Session not found or not open');
        }
        
        const sql = `
            INSERT INTO cash_drawer_transactions 
            (session_id, transaction_type, amount, reference_id, reference_type, description)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *
        `;
        
        const result = await this.db.get(sql, [
            session_id,
            transaction_type,
            amount,
            reference_id,
            reference_type,
            description
        ]);
        
        // Log audit
        await this.logAudit({
            action: 'RECORD_TRANSACTION',
            details: JSON.stringify({ 
                transaction_id: result.id,
                session_id,
                transaction_type,
                amount,
                reference_id,
                reference_type
            }),
            cash_drawer_id: session.cash_drawer_id,
            session_id
        });
        
        return result;
    }

    /**
     * Get transactions by session ID
     * @param {number} session_id - Session ID
     * @returns {Promise<Array>} List of transactions
     */
    async getTransactionsBySessionId(session_id) {
        const sql = `
            SELECT * FROM cash_drawer_transactions
            WHERE session_id = ?
            ORDER BY created_at ASC
        `;
        return await this.db.all(sql, [session_id]);
    }

    /**
     * Transfer cash drawer session
     * @param {number} session_id - Session ID
     * @param {number} transferred_to - User ID receiving the drawer
     * @param {string} notes - Transfer notes
     * @returns {Promise<Object>} Updated session
     */
    async transferCashDrawerSession(session_id, transferred_to, notes = '') {
        const session = await this.getSessionById(session_id);
        if (!session || session.status !== 'open') {
            throw new Error('Session not found or not open');
        }
        
        const sql = `
            UPDATE cash_drawer_sessions
            SET 
                opened_by = ?,
                notes = COALESCE(notes, ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *
        `;
        
        const result = await this.db.get(sql, [transferred_to, notes, session_id]);
        
        // Log audit
        await this.logAudit({
            action: 'TRANSFER_SESSION',
            details: JSON.stringify({ 
                session_id,
                transferred_to,
                from_user: session.opened_by
            }),
            cash_drawer_id: session.cash_drawer_id,
            session_id
        });
        
        return result;
    }

    /**
     * Log audit trail entry
     * @param {Object} logData - Audit log data
     */
    async logAudit(logData) {
        const { cash_drawer_id, session_id, user_id, action, details, ip_address, user_agent } = logData;
        
        const sql = `
            INSERT INTO cash_drawer_audit_logs 
            (cash_drawer_id, session_id, user_id, action, details, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        await this.db.run(sql, [
            cash_drawer_id,
            session_id,
            user_id,
            action,
            details,
            ip_address,
            user_agent
        ]);
    }

    /**
     * Get audit logs
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} List of audit logs
     */
    async getAuditLogs(filters = {}) {
        const { 
            cash_drawer_id,
            session_id,
            user_id,
            action,
            limit = 100,
            offset = 0
        } = filters;
        
        let sql = 'SELECT * FROM cash_drawer_audit_logs WHERE 1=1';
        const params = [];
        
        if (cash_drawer_id) {
            sql += ' AND cash_drawer_id = ?';
            params.push(cash_drawer_id);
        }
        
        if (session_id) {
            sql += ' AND session_id = ?';
            params.push(session_id);
        }
        
        if (user_id) {
            sql += ' AND user_id = ?';
            params.push(user_id);
        }
        
        if (action) {
            sql += ' AND action = ?';
            params.push(action);
        }
        
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return await this.db.all(sql, params);
    }

    /**
     * Get cash drawer summary
     * @param {number} cash_drawer_id - Cash drawer ID
     * @returns {Promise<Object>} Cash drawer summary
     */
    async getCashDrawerSummary(cash_drawer_id) {
        const drawer = await this.getCashDrawerById(cash_drawer_id);
        if (!drawer) {
            throw new Error('Cash drawer not found');
        }
        
        const openSession = await this.getOpenSessionByDrawerId(cash_drawer_id);
        
        return {
            cash_drawer: drawer,
            open_session: openSession,
            status: openSession ? 'open' : 'closed'
        };
    }
}

module.exports = CashDrawerManager;
