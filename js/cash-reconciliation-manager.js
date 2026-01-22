/**
 * Cash Reconciliation Manager
 * Handles cash drawer reconciliation workflows
 */

class CashReconciliationManager {
    constructor(db, logger, cashDrawerManager) {
        this.db = db;
        this.logger = logger || console;
        this.cashDrawerManager = cashDrawerManager;
    }

    /**
     * Start reconciliation for a cash drawer session
     * @param {number} session_id - Session ID
     * @param {number} reconciled_by - User ID
     * @param {number} actual_count - Actual cash count
     * @param {string} notes - Reconciliation notes
     * @param {string} difference_reason - Reason for difference (if any)
     * @returns {Promise<Object>} Reconciliation result
     */
    async startReconciliation(session_id, reconciled_by, actual_count, notes = '', difference_reason = '') {
        // Get session details
        const session = await this.cashDrawerManager.getSessionById(session_id);
        if (!session || session.status !== 'open') {
            throw new Error('Session not found or not open');
        }
        
        // Calculate expected amount
        const transactions = await this.cashDrawerManager.getTransactionsBySessionId(session_id);
        const expected_amount = this.cashDrawerManager.calculateExpectedBalance(
            session.opening_balance,
            transactions
        );
        
        const difference = parseFloat(actual_count) - parseFloat(expected_amount);
        
        // Create reconciliation record
        const sql = `
            INSERT INTO cash_drawer_reconciliations 
            (session_id, reconciled_by, reconciled_at, actual_count, expected_amount, difference, difference_reason, notes, status)
            VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'completed')
            RETURNING *
        `;
        
        const result = await this.db.get(sql, [
            session_id,
            reconciled_by,
            actual_count,
            expected_amount,
            difference,
            difference_reason,
            notes
        ]);
        
        // Close the session with reconciliation data
        await this.cashDrawerManager.closeCashDrawerSession(session_id, reconciled_by, {
            closing_balance: actual_count,
            notes: `Reconciled: ${notes}`
        });
        
        // Log audit
        await this.cashDrawerManager.logAudit({
            action: 'RECONCILE_SESSION',
            details: JSON.stringify({ 
                reconciliation_id: result.id,
                session_id,
                actual_count,
                expected_amount,
                difference,
                difference_reason
            }),
            cash_drawer_id: session.cash_drawer_id,
            session_id,
            user_id: reconciled_by
        });
        
        return result;
    }

    /**
     * Get reconciliation by ID
     * @param {number} reconciliation_id - Reconciliation ID
     * @returns {Promise<Object>} Reconciliation data
     */
    async getReconciliationById(reconciliation_id) {
        const sql = 'SELECT * FROM cash_drawer_reconciliations WHERE id = ?';
        return await this.db.get(sql, [reconciliation_id]);
    }

    /**
     * Get reconciliations by session ID
     * @param {number} session_id - Session ID
     * @returns {Promise<Array>} List of reconciliations
     */
    async getReconciliationsBySessionId(session_id) {
        const sql = `
            SELECT * FROM cash_drawer_reconciliations
            WHERE session_id = ?
            ORDER BY reconciled_at DESC
        `;
        return await this.db.all(sql, [session_id]);
    }

    /**
     * Get reconciliations by cash drawer ID
     * @param {number} cash_drawer_id - Cash drawer ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of reconciliations
     */
    async getReconciliationsByCashDrawerId(cash_drawer_id, options = {}) {
        const { limit = 100, offset = 0, dateFrom, dateTo } = options;
        
        let sql = `
            SELECT cr.*
            FROM cash_drawer_reconciliations cr
            JOIN cash_drawer_sessions cs ON cr.session_id = cs.id
            WHERE cs.cash_drawer_id = ?
        `;
        const params = [cash_drawer_id];
        
        if (dateFrom) {
            sql += ' AND cr.reconciled_at >= ?';
            params.push(dateFrom);
        }
        
        if (dateTo) {
            sql += ' AND cr.reconciled_at <= ?';
            params.push(dateTo);
        }
        
        sql += ' ORDER BY cr.reconciled_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return await this.db.all(sql, params);
    }

    /**
     * Calculate reconciliation summary for a session
     * @param {number} session_id - Session ID
     * @returns {Promise<Object>} Reconciliation summary
     */
    async calculateReconciliationSummary(session_id) {
        const session = await this.cashDrawerManager.getSessionById(session_id);
        if (!session) {
            throw new Error('Session not found');
        }
        
        const transactions = await this.cashDrawerManager.getTransactionsBySessionId(session_id);
        const expected_amount = this.cashDrawerManager.calculateExpectedBalance(
            session.opening_balance,
            transactions
        );
        
        // Get reconciliation if exists
        const reconciliation = await this.getReconciliationsBySessionId(session_id);
        
        return {
            session_id: session.id,
            cash_drawer_id: session.cash_drawer_id,
            opened_by: session.opened_by,
            opened_at: session.opened_at,
            opening_balance: session.opening_balance,
            expected_amount: expected_amount,
            actual_count: reconciliation.length > 0 ? reconciliation[0].actual_count : null,
            difference: reconciliation.length > 0 ? reconciliation[0].difference : null,
            difference_reason: reconciliation.length > 0 ? reconciliation[0].difference_reason : null,
            status: session.status,
            transactions_count: transactions.length,
            total_payments: transactions.filter(t => t.transaction_type === 'PAYMENT').reduce((sum, t) => sum + parseFloat(t.amount), 0),
            total_refunds: transactions.filter(t => t.transaction_type === 'REFUND').reduce((sum, t) => sum + parseFloat(t.amount), 0),
            total_cash_in: transactions.filter(t => t.transaction_type === 'CASH_IN').reduce((sum, t) => sum + parseFloat(t.amount), 0),
            total_cash_out: transactions.filter(t => t.transaction_type === 'CASH_OUT').reduce((sum, t) => sum + parseFloat(t.amount), 0)
        };
    }

    /**
     * Generate reconciliation report
     * @param {Object} options - Report options
     * @param {number} options.cash_drawer_id - Cash drawer ID (optional)
     * @param {Date} options.date_from - Start date
     * @param {Date} options.date_to - End date
     * @returns {Promise<Object>} Reconciliation report
     */
    async generateReconciliationReport(options = {}) {
        const { cash_drawer_id, date_from, date_to } = options;
        
        let sql = `
            SELECT 
                cs.id as session_id,
                cs.cash_drawer_id,
                cd.name as cash_drawer_name,
                cs.opened_by,
                u1.name as opened_by_name,
                cs.opened_at,
                cs.closed_at,
                cs.opening_balance,
                cs.closing_balance,
                cs.expected_balance,
                cs.over_short_amount,
                cr.id as reconciliation_id,
                cr.actual_count,
                cr.difference,
                cr.difference_reason,
                cr.notes as reconciliation_notes,
                u2.name as reconciled_by_name,
                cr.reconciled_at
            FROM cash_drawer_sessions cs
            LEFT JOIN cash_drawers cd ON cs.cash_drawer_id = cd.id
            LEFT JOIN users u1 ON cs.opened_by = u1.id
            LEFT JOIN cash_drawer_reconciliations cr ON cs.id = cr.session_id
            LEFT JOIN users u2 ON cr.reconciled_by = u2.id
            WHERE cs.status = 'closed'
        `;
        const params = [];
        
        if (cash_drawer_id) {
            sql += ' AND cs.cash_drawer_id = ?';
            params.push(cash_drawer_id);
        }
        
        if (date_from) {
            sql += ' AND cs.closed_at >= ?';
            params.push(date_from);
        }
        
        if (date_to) {
            sql += ' AND cs.closed_at <= ?';
            params.push(date_to);
        }
        
        sql += ' ORDER BY cs.closed_at DESC';
        
        const sessions = await this.db.all(sql, params);
        
        // Calculate summary statistics
        const totalOpeningBalance = sessions.reduce((sum, s) => sum + parseFloat(s.opening_balance || 0), 0);
        const totalClosingBalance = sessions.reduce((sum, s) => sum + parseFloat(s.closing_balance || 0), 0);
        const totalExpectedBalance = sessions.reduce((sum, s) => sum + parseFloat(s.expected_balance || 0), 0);
        const totalActualCount = sessions.reduce((sum, s) => sum + parseFloat(s.actual_count || 0), 0);
        const totalDifference = sessions.reduce((sum, s) => sum + parseFloat(s.difference || 0), 0);
        
        return {
            sessions: sessions,
            summary: {
                total_sessions: sessions.length,
                total_opening_balance: totalOpeningBalance,
                total_closing_balance: totalClosingBalance,
                total_expected_balance: totalExpectedBalance,
                total_actual_count: totalActualCount,
                total_difference: totalDifference,
                average_difference: sessions.length > 0 ? totalDifference / sessions.length : 0
            }
        };
    }

    /**
     * Generate daily reconciliation report
     * @param {Date} date - Date to generate report for
     * @returns {Promise<Object>} Daily report
     */
    async generateDailyReport(date) {
        const dateFrom = new Date(date);
        dateFrom.setHours(0, 0, 0, 0);
        
        const dateTo = new Date(date);
        dateTo.setHours(23, 59, 59, 999);
        
        return await this.generateReconciliationReport({
            date_from: dateFrom.toISOString(),
            date_to: dateTo.toISOString()
        });
    }

    /**
     * Generate weekly reconciliation report
     * @param {Date} date - Date to generate report for (week starting from this date)
     * @returns {Promise<Object>} Weekly report
     */
    async generateWeeklyReport(date) {
        const dateFrom = new Date(date);
        dateFrom.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        dateFrom.setHours(0, 0, 0, 0);
        
        const dateTo = new Date(date);
        dateTo.setDate(date.getDate() + (6 - date.getDay())); // End of week (Saturday)
        dateTo.setHours(23, 59, 59, 999);
        
        return await this.generateReconciliationReport({
            date_from: dateFrom.toISOString(),
            date_to: dateTo.toISOString()
        });
    }

    /**
     * Generate monthly reconciliation report
     * @param {Date} date - Date to generate report for
     * @returns {Promise<Object>} Monthly report
     */
    async generateMonthlyReport(date) {
        const dateFrom = new Date(date);
        dateFrom.setDate(1); // First day of month
        dateFrom.setHours(0, 0, 0, 0);
        
        const dateTo = new Date(date);
        dateTo.setMonth(date.getMonth() + 1);
        dateTo.setDate(0); // Last day of month
        dateTo.setHours(23, 59, 59, 999);
        
        return await this.generateReconciliationReport({
            date_from: dateFrom.toISOString(),
            date_to: dateTo.toISOString()
        });
    }

    /**
     * Get cash drawer activity summary
     * @param {number} cash_drawer_id - Cash drawer ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Activity summary
     */
    async getCashDrawerActivitySummary(cash_drawer_id, options = {}) {
        const { date_from, date_to } = options;
        
        let sql = `
            SELECT 
                COUNT(*) as total_sessions,
                SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_sessions,
                SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_sessions,
                SUM(opening_balance) as total_opening_balance,
                SUM(closing_balance) as total_closing_balance,
                SUM(expected_balance) as total_expected_balance,
                SUM(over_short_amount) as total_over_short
            FROM cash_drawer_sessions
            WHERE cash_drawer_id = ?
        `;
        const params = [cash_drawer_id];
        
        if (date_from) {
            sql += ' AND opened_at >= ?';
            params.push(date_from);
        }
        
        if (date_to) {
            sql += ' AND opened_at <= ?';
            params.push(date_to);
        }
        
        return await this.db.get(sql, params);
    }

    /**
     * Verify cash drawer balance
     * @param {number} session_id - Session ID
     * @param {number} actual_count - Actual cash count
     * @returns {Promise<Object>} Verification result
     */
    async verifyCashDrawerBalance(session_id, actual_count) {
        const session = await this.cashDrawerManager.getSessionById(session_id);
        if (!session) {
            throw new Error('Session not found');
        }
        
        const transactions = await this.cashDrawerManager.getTransactionsBySessionId(session_id);
        const expected_amount = this.cashDrawerManager.calculateExpectedBalance(
            session.opening_balance,
            transactions
        );
        
        const difference = parseFloat(actual_count) - parseFloat(expected_amount);
        
        return {
            session_id: session.id,
            expected_amount: expected_amount,
            actual_count: actual_count,
            difference: difference,
            is_balanced: Math.abs(difference) < 0.01, // Small tolerance for rounding
            tolerance: 0.01
        };
    }

    /**
     * Get reconciliation history for a cash drawer
     * @param {number} cash_drawer_id - Cash drawer ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Reconciliation history
     */
    async getReconciliationHistory(cash_drawer_id, options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        const sql = `
            SELECT 
                cr.*,
                cs.opened_at as session_opened_at,
                cs.closed_at as session_closed_at,
                cs.opening_balance,
                cs.expected_balance,
                u.name as reconciled_by_name
            FROM cash_drawer_reconciliations cr
            JOIN cash_drawer_sessions cs ON cr.session_id = cs.id
            LEFT JOIN users u ON cr.reconciled_by = u.id
            WHERE cs.cash_drawer_id = ?
            ORDER BY cr.reconciled_at DESC
            LIMIT ? OFFSET ?
        `;
        
        return await this.db.all(sql, [cash_drawer_id, limit, offset]);
    }
}

module.exports = CashReconciliationManager;
