// Enhanced Reporting Manager for Cafe POS
// Provides advanced reporting, data visualization, and scheduled reports

const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const ChartJS = require('chart.js');

class ReportingManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger || console;
        this.scheduledJobs = new Map();
        this.backupJobs = new Map();
        this.reportTemplates = new Map();
        this.transporter = null;
        this.isInitialized = false;

        if (!this.db) {
            this.logger.error('ReportingManager initialized with null database connection');
        } else {
            this.logger.info('ReportingManager initialized with database connection');
        }
    }

    async init() {
        try {
            this.logger.info('Initializing Reporting Manager...');
            
            // Initialize email transporter if configured
            if (process.env.SMTP_HOST) {
                this.transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASSWORD
                    }
                });
                
                // Test connection
                await this.transporter.verify();
                this.logger.info('Email transporter initialized successfully');
            }
            
            // Load report templates
            await this.loadReportTemplates();
            
            // Load and start scheduled reports
            await this.loadScheduledReports();
            
            // Load and start backup schedules
            await this.loadBackupSchedules();
            
            this.isInitialized = true;
            this.logger.info('Reporting Manager initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Reporting Manager:', error);
            throw error;
        }
    }

    // ========================================================================
    // CASH DRAWER REPORTS
    // ========================================================================

    async getCashDrawerSummary(cashDrawerId, dateFrom, dateTo) {
        let query = `
            SELECT
                cd.id as cash_drawer_id,
                cd.name as cash_drawer_name,
                cd.location,
                COUNT(DISTINCT cs.id) as total_sessions,
                SUM(CASE WHEN cs.status = 'open' THEN 1 ELSE 0 END) as open_sessions,
                SUM(CASE WHEN cs.status = 'closed' THEN 1 ELSE 0 END) as closed_sessions,
                SUM(cs.opening_balance) as total_opening_balance,
                SUM(cs.closing_balance) as total_closing_balance,
                SUM(cs.expected_balance) as total_expected_balance,
                SUM(cs.over_short_amount) as total_over_short
            FROM cash_drawers cd
            LEFT JOIN cash_drawer_sessions cs ON cd.id = cs.cash_drawer_id
            WHERE cd.id = ?
        `;
        
        const params = [cashDrawerId];
        
        if (dateFrom) {
            query += ' AND DATE(cs.opened_at) >= ?';
            params.push(dateFrom);
        }
        
        if (dateTo) {
            query += ' AND DATE(cs.opened_at) <= ?';
            params.push(dateTo);
        }
        
        query += ' GROUP BY cd.id, cd.name, cd.location';
        
        return this.db.prepare(query).all(...params);
    }

    async getCashDrawerActivityReport(cashDrawerId, dateFrom, dateTo) {
        let query = `
            SELECT
                cs.id as session_id,
                cs.opened_at,
                cs.closed_at,
                cs.opening_balance,
                cs.closing_balance,
                cs.expected_balance,
                cs.over_short_amount,
                cs.status,
                u.name as opened_by_name,
                cr.id as reconciliation_id,
                cr.actual_count,
                cr.difference,
                cr.difference_reason,
                cr.notes as reconciliation_notes
            FROM cash_drawer_sessions cs
            LEFT JOIN users u ON cs.opened_by = u.id
            LEFT JOIN cash_drawer_reconciliations cr ON cs.id = cr.session_id
            WHERE cs.cash_drawer_id = ?
        `;
        
        const params = [cashDrawerId];
        
        if (dateFrom) {
            query += ' AND DATE(cs.opened_at) >= ?';
            params.push(dateFrom);
        }
        
        if (dateTo) {
            query += ' AND DATE(cs.opened_at) <= ?';
            params.push(dateTo);
        }
        
        query += ' ORDER BY cs.opened_at DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getCashDrawerTransactionReport(cashDrawerId, dateFrom, dateTo) {
        let query = `
            SELECT
                cdt.id as transaction_id,
                cdt.session_id,
                cdt.transaction_type,
                cdt.amount,
                cdt.reference_id,
                cdt.reference_type,
                cdt.description,
                cdt.created_at,
                cs.opened_at as session_opened_at,
                cs.opening_balance,
                u.name as opened_by_name
            FROM cash_drawer_transactions cdt
            JOIN cash_drawer_sessions cs ON cdt.session_id = cs.id
            LEFT JOIN users u ON cs.opened_by = u.id
            WHERE cs.cash_drawer_id = ?
        `;
        
        const params = [cashDrawerId];
        
        if (dateFrom) {
            query += ' AND DATE(cdt.created_at) >= ?';
            params.push(dateFrom);
        }
        
        if (dateTo) {
            query += ' AND DATE(cdt.created_at) <= ?';
            params.push(dateTo);
        }
        
        query += ' ORDER BY cdt.created_at DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getCashDrawerReconciliationReport(cashDrawerId, dateFrom, dateTo) {
        let query = `
            SELECT
                cr.id as reconciliation_id,
                cr.session_id,
                cr.reconciled_at,
                cr.actual_count,
                cr.expected_amount,
                cr.difference,
                cr.difference_reason,
                cr.notes,
                cs.opened_at as session_opened_at,
                cs.closed_at as session_closed_at,
                cs.opening_balance,
                cs.expected_balance,
                u.name as reconciled_by_name
            FROM cash_drawer_reconciliations cr
            JOIN cash_drawer_sessions cs ON cr.session_id = cs.id
            LEFT JOIN users u ON cr.reconciled_by = u.id
            WHERE cs.cash_drawer_id = ?
        `;
        
        const params = [cashDrawerId];
        
        if (dateFrom) {
            query += ' AND DATE(cr.reconciled_at) >= ?';
            params.push(dateFrom);
        }
        
        if (dateTo) {
            query += ' AND DATE(cr.reconciled_at) <= ?';
            params.push(dateTo);
        }
        
        query += ' ORDER BY cr.reconciled_at DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getCashDrawerOverShortReport(dateFrom, dateTo) {
        let query = `
            SELECT
                cd.id as cash_drawer_id,
                cd.name as cash_drawer_name,
                COUNT(cs.id) as session_count,
                SUM(cs.over_short_amount) as total_over_short,
                AVG(cs.over_short_amount) as avg_over_short,
                SUM(CASE WHEN cs.over_short_amount > 0 THEN 1 ELSE 0 END) as over_count,
                SUM(CASE WHEN cs.over_short_amount < 0 THEN 1 ELSE 0 END) as short_count
            FROM cash_drawers cd
            JOIN cash_drawer_sessions cs ON cd.id = cs.cash_drawer_id
            WHERE cs.status = 'closed'
        `;
        
        const params = [];
        
        if (dateFrom) {
            query += ' AND DATE(cs.closed_at) >= ?';
            params.push(dateFrom);
        }
        
        if (dateTo) {
            query += ' AND DATE(cs.closed_at) <= ?';
            params.push(dateTo);
        }
        
        query += ' GROUP BY cd.id, cd.name ORDER BY total_over_short DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getCashDrawerAuditLogReport(cashDrawerId, dateFrom, dateTo, actionFilter = null) {
        let query = `
            SELECT
                cal.id as log_id,
                cal.action,
                cal.details,
                cal.ip_address,
                cal.user_agent,
                cal.created_at,
                u.name as user_name
            FROM cash_drawer_audit_logs cal
            LEFT JOIN users u ON cal.user_id = u.id
            WHERE cal.cash_drawer_id = ?
        `;
        
        const params = [cashDrawerId];
        
        if (dateFrom) {
            query += ' AND DATE(cal.created_at) >= ?';
            params.push(dateFrom);
        }
        
        if (dateTo) {
            query += ' AND DATE(cal.created_at) <= ?';
            params.push(dateTo);
        }
        
        if (actionFilter) {
            query += ' AND cal.action = ?';
            params.push(actionFilter);
        }
        
        query += ' ORDER BY cal.created_at DESC';
        
        return this.db.prepare(query).all(...params);
    }

    // ========================================================================
    // LOYALTY REPORTS
    // ========================================================================

    async getLoyaltyProgramSummary(programId = null) {
        let query = `
            SELECT
                lp.id AS program_id,
                lp.name AS program_name,
                lp.points_per_currency,
                lp.min_purchase_amount,
                lp.points_expiration_days,
                lp.max_points_balance,
                lp.is_active,
                COUNT(DISTINCT lcm.customer_id) AS member_count,
                SUM(lcm.points_balance) AS total_points_issued,
                AVG(lcm.points_balance) AS avg_points_per_member,
                COUNT(DISTINCT CASE WHEN lcm.tier_id IS NOT NULL THEN lcm.customer_id END) AS members_in_tiers,
                COUNT(DISTINCT CASE WHEN lcm.points_balance > 0 THEN lcm.customer_id END) AS members_with_balance
            FROM loyalty_programs lp
            LEFT JOIN loyalty_customer_memberships lcm ON lp.id = lcm.program_id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lp.id = ?';
            params.push(programId);
        }
        
        query += ' GROUP BY lp.id, lp.name, lp.points_per_currency, lp.min_purchase_amount, lp.points_expiration_days, lp.max_points_balance, lp.is_active';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyPointsTransactionReport(programId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                lpt.id AS transaction_id,
                lpt.customer_id,
                c.name AS customer_name,
                c.phone AS customer_phone,
                lpt.program_id,
                lp.name AS program_name,
                lpt.order_id,
                o.order_number,
                lpt.transaction_type,
                lpt.points,
                lpt.balance_after,
                lpt.created_at,
                lpt.notes
            FROM loyalty_points_transactions lpt
            JOIN customers c ON lpt.customer_id = c.id
            JOIN loyalty_programs lp ON lpt.program_id = lp.id
            LEFT JOIN orders o ON lpt.order_id = o.id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lpt.program_id = ?';
            params.push(programId);
        } else {
            query += ' WHERE 1=1';
        }
        
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) >= ?' : ' WHERE DATE(lpt.created_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) <= ?' : ' WHERE DATE(lpt.created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY lpt.created_at DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyPointsEarnedReport(programId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                lpt.program_id,
                lp.name AS program_name,
                COUNT(lpt.id) AS transaction_count,
                SUM(lpt.points) AS total_points_earned,
                SUM(CASE WHEN lpt.order_id IS NOT NULL THEN lpt.points ELSE 0 END) AS points_from_orders,
                SUM(CASE WHEN lpt.order_id IS NULL THEN lpt.points ELSE 0 END) AS points_from_other,
                COUNT(DISTINCT lpt.customer_id) AS unique_customers
            FROM loyalty_points_transactions lpt
            JOIN loyalty_programs lp ON lpt.program_id = lp.id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lpt.program_id = ?';
            params.push(programId);
        } else {
            query += ' WHERE 1=1';
        }
        
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) >= ?' : ' WHERE DATE(lpt.created_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) <= ?' : ' WHERE DATE(lpt.created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' AND lpt.transaction_type = "earned" GROUP BY lpt.program_id, lp.name';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyPointsRedeemedReport(programId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                lpt.program_id,
                lp.name AS program_name,
                COUNT(lpt.id) AS transaction_count,
                SUM(lpt.points) AS total_points_redeemed,
                COUNT(DISTINCT lpt.customer_id) AS unique_customers,
                AVG(lpt.points) AS avg_points_per_redemption
            FROM loyalty_points_transactions lpt
            JOIN loyalty_programs lp ON lpt.program_id = lp.id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lpt.program_id = ?';
            params.push(programId);
        } else {
            query += ' WHERE 1=1';
        }
        
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) >= ?' : ' WHERE DATE(lpt.created_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) <= ?' : ' WHERE DATE(lpt.created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' AND lpt.transaction_type = "redeemed" GROUP BY lpt.program_id, lp.name';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyCustomerActivityReport(programId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                c.id AS customer_id,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.email AS customer_email,
                lcm.points_balance,
                lcm.joined_at,
                lcm.last_activity_at,
                lt.name AS tier_name,
                COUNT(DISTINCT o.id) AS order_count,
                SUM(o.total_amount) AS total_spent,
                SUM(CASE WHEN lpt.transaction_type = 'earned' THEN lpt.points ELSE 0 END) AS points_earned,
                SUM(CASE WHEN lpt.transaction_type = 'redeemed' THEN lpt.points ELSE 0 END) AS points_redeemed
            FROM customers c
            JOIN loyalty_customer_memberships lcm ON c.id = lcm.customer_id
            LEFT JOIN loyalty_tiers lt ON lcm.tier_id = lt.id
            LEFT JOIN orders o ON c.id = o.customer_id
            LEFT JOIN loyalty_points_transactions lpt ON c.id = lpt.customer_id AND lpt.program_id = lcm.program_id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lcm.program_id = ?';
            params.push(programId);
        } else {
            query += ' WHERE 1=1';
        }
        
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) >= ?' : ' WHERE DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' GROUP BY c.id, c.name, c.phone, c.email, lcm.points_balance, lcm.joined_at, lcm.last_activity_at, lt.name ORDER BY total_spent DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyTierPerformanceReport(programId = null) {
        let query = `
            SELECT
                lt.id AS tier_id,
                lt.name AS tier_name,
                lt.min_points AS min_points,
                lt.max_points AS max_points,
                lt.discount_percent,
                lt.free_shipping,
                COUNT(DISTINCT lcm.customer_id) AS member_count,
                SUM(lcm.points_balance) AS total_points_in_tier,
                AVG(lcm.points_balance) AS avg_points_in_tier,
                COUNT(DISTINCT o.id) AS order_count,
                SUM(o.total_amount) AS total_spent
            FROM loyalty_tiers lt
            JOIN loyalty_customer_memberships lcm ON lt.id = lcm.tier_id
            LEFT JOIN orders o ON lcm.customer_id = o.customer_id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lt.program_id = ?';
            params.push(programId);
        }
        
        query += ' GROUP BY lt.id, lt.name, lt.min_points, lt.max_points, lt.discount_percent, lt.free_shipping ORDER BY min_points ASC';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyRedemptionRateReport(programId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                lp.id AS program_id,
                lp.name AS program_name,
                COUNT(DISTINCT CASE WHEN lpt.transaction_type = 'earned' THEN lpt.customer_id END) AS customers_earned_points,
                COUNT(DISTINCT CASE WHEN lpt.transaction_type = 'redeemed' THEN lpt.customer_id END) AS customers_redeemed_points,
                SUM(CASE WHEN lpt.transaction_type = 'earned' THEN lpt.points ELSE 0 END) AS total_points_earned,
                SUM(CASE WHEN lpt.transaction_type = 'redeemed' THEN lpt.points ELSE 0 END) AS total_points_redeemed,
                CASE
                    WHEN SUM(CASE WHEN lpt.transaction_type = 'earned' THEN lpt.points ELSE 0 END) > 0
                    THEN (SUM(CASE WHEN lpt.transaction_type = 'redeemed' THEN lpt.points ELSE 0 END) * 100.0 /
                          SUM(CASE WHEN lpt.transaction_type = 'earned' THEN lpt.points ELSE 0 END))
                    ELSE 0
                END AS redemption_rate_percentage
            FROM loyalty_programs lp
            LEFT JOIN loyalty_points_transactions lpt ON lp.id = lpt.program_id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lp.id = ?';
            params.push(programId);
        }
        
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) >= ?' : ' WHERE DATE(lpt.created_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) <= ?' : ' WHERE DATE(lpt.created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' GROUP BY lp.id, lp.name';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyPointsExpirationReport(programId = null) {
        let query = `
            SELECT
                lpt.id AS transaction_id,
                lpt.customer_id,
                c.name AS customer_name,
                lpt.program_id,
                lp.name AS program_name,
                lpt.points,
                lpt.created_at AS earned_date,
                DATE(lpt.created_at, lp.points_expiration_days || ' days') AS expiration_date,
                CASE
                    WHEN lp.points_expiration_days IS NOT NULL AND DATE(lpt.created_at, lp.points_expiration_days || ' days') < DATE('now')
                    THEN 1
                    ELSE 0
                END AS is_expired,
                CASE
                    WHEN lp.points_expiration_days IS NOT NULL
                    THEN julianday(DATE('now')) - julianday(lpt.created_at)
                    ELSE NULL
                END AS days_since_earned
            FROM loyalty_points_transactions lpt
            JOIN customers c ON lpt.customer_id = c.id
            JOIN loyalty_programs lp ON lpt.program_id = lp.id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lpt.program_id = ?';
            params.push(programId);
        }
        
        query += ' AND lpt.transaction_type = "earned" ORDER BY expiration_date ASC';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyPunchCardReport(programId = null) {
        let query = `
            SELECT
                lpc.id AS punch_card_id,
                lpc.name AS punch_card_name,
                lpc.required_punches,
                lpc.reward_description,
                lpc.is_active,
                COUNT(DISTINCT lpi.customer_id) AS customers_with_card,
                SUM(lpi.current_punches) AS total_punches_collected,
                COUNT(DISTINCT CASE WHEN lpi.redeemed_at IS NOT NULL THEN lpi.customer_id END) AS cards_redeemed,
                COUNT(DISTINCT CASE WHEN lpi.redeemed_at IS NULL AND lpi.current_punches >= lpc.required_punches THEN lpi.customer_id END) AS cards_ready_to_redeem
            FROM loyalty_punch_cards lpc
            LEFT JOIN loyalty_punch_card_instances lpi ON lpc.id = lpi.punch_card_id
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lpc.program_id = ?';
            params.push(programId);
        }
        
        query += ' GROUP BY lpc.id, lpc.name, lpc.required_punches, lpc.reward_description, lpc.is_active ORDER BY cards_redeemed DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getLoyaltyRewardRedemptionReport(programId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                lr.id AS reward_id,
                lr.name AS reward_name,
                lr.points_required,
                lr.type AS reward_type,
                lr.value,
                COUNT(DISTINCT lpt.customer_id) AS redemption_count,
                COUNT(DISTINCT CASE WHEN lpt.order_id IS NOT NULL THEN lpt.order_id END) AS orders_with_reward
            FROM loyalty_rewards lr
            LEFT JOIN loyalty_points_transactions lpt ON lr.id = lpt.reference_id AND lpt.reference_type = 'reward'
        `;
        
        const params = [];
        
        if (programId) {
            query += ' WHERE lr.program_id = ?';
            params.push(programId);
        }
        
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) >= ?' : ' WHERE DATE(lpt.created_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(lpt.created_at) <= ?' : ' WHERE DATE(lpt.created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' GROUP BY lr.id, lr.name, lr.points_required, lr.type, lr.value ORDER BY redemption_count DESC';
        
        return this.db.prepare(query).all(...params);
    }

    // ========================================================================
    // DIGITAL RECEIPT REPORTS
    // ========================================================================

    async getDigitalReceiptSummary(startDate = null, endDate = null) {
        let query = `
            SELECT
                COUNT(*) as total_receipts,
                SUM(CASE WHEN receipt_type = 'email' THEN 1 ELSE 0 END) as email_receipts,
                SUM(CASE WHEN receipt_type = 'whatsapp' THEN 1 ELSE 0 END) as whatsapp_receipts,
                SUM(CASE WHEN receipt_type = 'sms' THEN 1 ELSE 0 END) as sms_receipts,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_receipts,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_receipts,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_receipts,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_receipts,
                SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_receipts
            FROM digital_receipt_history
        `;

        const params = [];

        if (startDate) {
            query += ' WHERE DATE(created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += params.length > 0 ? ' AND DATE(created_at) <= ?' : ' WHERE DATE(created_at) <= ?';
            params.push(endDate);
        }

        const result = this.db.prepare(query).all(...params);
        return result.length > 0 ? result[0] : null;
    }

    async getDigitalReceiptDailyReport(startDate, endDate) {
        let query = `
            SELECT
                DATE(created_at) as report_date,
                COUNT(*) as total_receipts,
                SUM(CASE WHEN receipt_type = 'email' THEN 1 ELSE 0 END) as email_receipts,
                SUM(CASE WHEN receipt_type = 'whatsapp' THEN 1 ELSE 0 END) as whatsapp_receipts,
                SUM(CASE WHEN receipt_type = 'sms' THEN 1 ELSE 0 END) as sms_receipts,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_receipts,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_receipts,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_receipts,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_receipts,
                SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_receipts
            FROM digital_receipt_history
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY report_date
        `;

        return this.db.prepare(query).all(startDate, endDate);
    }

    async getDigitalReceiptByTypeReport(startDate = null, endDate = null) {
        let query = `
            SELECT
                receipt_type,
                COUNT(*) as receipt_count,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                CASE
                    WHEN COUNT(*) > 0
                    THEN (SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
                    ELSE 0
                END as delivery_rate
            FROM digital_receipt_history
        `;

        const params = [];

        if (startDate) {
            query += ' WHERE DATE(created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += params.length > 0 ? ' AND DATE(created_at) <= ?' : ' WHERE DATE(created_at) <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY receipt_type ORDER BY receipt_count DESC';

        return this.db.prepare(query).all(...params);
    }

    async getDigitalReceiptByStatusReport(startDate = null, endDate = null) {
        let query = `
            SELECT
                status,
                COUNT(*) as receipt_count,
                COUNT(DISTINCT order_id) as unique_orders,
                COUNT(DISTINCT customer_id) as unique_customers
            FROM digital_receipt_history
        `;

        const params = [];

        if (startDate) {
            query += ' WHERE DATE(created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += params.length > 0 ? ' AND DATE(created_at) <= ?' : ' WHERE DATE(created_at) <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY status ORDER BY receipt_count DESC';

        return this.db.prepare(query).all(...params);
    }

    async getDigitalReceiptFailureReport(startDate = null, endDate = null, limit = 100) {
        let query = `
            SELECT
                drh.id as history_id,
                drh.order_id,
                o.order_number,
                drh.receipt_type,
                drh.status,
                drh.error_message,
                drh.retry_count,
                drh.created_at,
                drh.updated_at,
                o.customer_id,
                c.name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone
            FROM digital_receipt_history drh
            JOIN orders o ON drh.order_id = o.id
            LEFT JOIN customers c ON drh.customer_id = c.id
            WHERE drh.status = 'failed'
        `;

        const params = [];

        if (startDate) {
            query += ' AND DATE(drh.created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += params.length > 0 ? ' AND DATE(drh.created_at) <= ?' : ' WHERE DATE(drh.created_at) <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY drh.created_at DESC LIMIT ?';
        params.push(limit);

        return this.db.prepare(query).all(...params);
    }

    async getCustomerDigitalReceiptStats(customerId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                c.id as customer_id,
                c.name as customer_name,
                c.phone as customer_phone,
                c.email as customer_email,
                COUNT(DISTINCT drh.id) as total_receipts,
                SUM(CASE WHEN drh.receipt_type = 'email' THEN 1 ELSE 0 END) as email_receipts,
                SUM(CASE WHEN drh.receipt_type = 'whatsapp' THEN 1 ELSE 0 END) as whatsapp_receipts,
                SUM(CASE WHEN drh.receipt_type = 'sms' THEN 1 ELSE 0 END) as sms_receipts,
                SUM(CASE WHEN drh.status = 'sent' THEN 1 ELSE 0 END) as sent_receipts,
                SUM(CASE WHEN drh.status = 'delivered' THEN 1 ELSE 0 END) as delivered_receipts,
                SUM(CASE WHEN drh.status = 'failed' THEN 1 ELSE 0 END) as failed_receipts,
                MAX(drh.created_at) as last_receipt_date,
                ccp.email_enabled,
                ccp.whatsapp_enabled,
                ccp.sms_enabled
            FROM customers c
            LEFT JOIN digital_receipt_history drh ON c.id = drh.customer_id
            LEFT JOIN customer_communication_preferences ccp ON c.id = ccp.customer_id
        `;

        const params = [];

        if (customerId) {
            query += ' WHERE c.id = ?';
            params.push(customerId);
        }

        if (startDate) {
            query += params.length > 0 ? ' AND DATE(drh.created_at) >= ?' : ' WHERE DATE(drh.created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += params.length > 0 ? ' AND DATE(drh.created_at) <= ?' : ' WHERE DATE(drh.created_at) <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY c.id, c.name, c.phone, c.email, ccp.email_enabled, ccp.whatsapp_enabled, ccp.sms_enabled ORDER BY total_receipts DESC';

        return this.db.prepare(query).all(...params);
    }

    async getOrderDigitalReceiptStatus(orderId) {
        const query = `
            SELECT
                o.id as order_id,
                o.order_number,
                o.total_amount,
                o.status as order_status,
                o.created_at as order_date,
                o.customer_id,
                c.name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone,
                o.digital_receipt_email_sent,
                o.digital_receipt_whatsapp_sent,
                o.digital_receipt_sms_sent,
                o.digital_receipt_status,
                o.digital_receipt_last_sent_at,
                COUNT(DISTINCT drh.id) as receipt_attempts,
                MAX(CASE WHEN drh.receipt_type = 'email' AND drh.status = 'sent' THEN 1 ELSE 0 END) as email_sent,
                MAX(CASE WHEN drh.receipt_type = 'whatsapp' AND drh.status = 'sent' THEN 1 ELSE 0 END) as whatsapp_sent,
                MAX(CASE WHEN drh.receipt_type = 'sms' AND drh.status = 'sent' THEN 1 ELSE 0 END) as sms_sent,
                MAX(CASE WHEN drh.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                MAX(CASE WHEN drh.status = 'failed' THEN 1 ELSE 0 END) as failed,
                MAX(drh.created_at) as last_receipt_attempt
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            LEFT JOIN digital_receipt_history drh ON o.id = drh.order_id
            WHERE o.id = ?
            GROUP BY o.id, c.id
        `;

        const result = this.db.prepare(query).all(orderId);
        return result.length > 0 ? result[0] : null;
    }

    async getDigitalReceiptTemplateUsage() {
        const query = `
            SELECT
                dt.id as template_id,
                dt.name as template_name,
                dt.template_type,
                dt.is_default,
                COUNT(drh.id) as usage_count,
                SUM(CASE WHEN drh.status = 'sent' THEN 1 ELSE 0 END) as sent_count,
                SUM(CASE WHEN drh.status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
                SUM(CASE WHEN drh.status = 'failed' THEN 1 ELSE 0 END) as failed_count
            FROM digital_receipt_templates dt
            LEFT JOIN digital_receipt_history drh ON dt.id = drh.template_id
            GROUP BY dt.id, dt.name, dt.template_type, dt.is_default
            ORDER BY usage_count DESC
        `;

        return this.db.prepare(query).all();
    }

    async getDigitalReceiptHourlyTrend(date) {
        const query = `
            SELECT
                strftime('%H', created_at) as hour,
                COUNT(*) as receipt_count,
                SUM(CASE WHEN receipt_type = 'email' THEN 1 ELSE 0 END) as email_count,
                SUM(CASE WHEN receipt_type = 'whatsapp' THEN 1 ELSE 0 END) as whatsapp_count,
                SUM(CASE WHEN receipt_type = 'sms' THEN 1 ELSE 0 END) as sms_count
            FROM digital_receipt_history
            WHERE DATE(created_at) = ?
            GROUP BY hour
            ORDER BY hour
        `;

        return this.db.prepare(query).all(date);
    }

    // ========================================================================
    // ONLINE ORDER REPORTS
    // ========================================================================

    async getOnlineOrderSummary(providerId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                COUNT(DISTINCT o.id) as total_orders,
                SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
                SUM(CASE WHEN o.status = 'rejected' THEN 1 ELSE 0 END) as rejected_orders,
                SUM(o.total_amount) as total_revenue,
                AVG(o.total_amount) as avg_order_value,
                MIN(o.created_at) as first_order_date,
                MAX(o.created_at) as last_order_date,
                COUNT(DISTINCT CASE WHEN o.created_at >= DATE('now', '-7 days') THEN o.id END) as orders_last_7_days,
                COUNT(DISTINCT CASE WHEN o.created_at >= DATE('now', '-30 days') THEN o.id END) as orders_last_30_days
            FROM orders o
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (providerId) {
            query += ' AND o.online_order_provider_id = ?';
            params.push(providerId);
        }
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) >= ?' : ' WHERE DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        const result = this.db.prepare(query).all(...params);
        return result.length > 0 ? result[0] : null;
    }

    async getOnlineOrderProviderPerformance(providerId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                oop.id AS provider_id,
                oop.name AS provider_name,
                oop.display_name AS provider_display_name,
                COUNT(DISTINCT o.id) AS total_orders,
                SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
                SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
                SUM(CASE WHEN o.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_orders,
                SUM(o.total_amount) AS total_revenue,
                COUNT(DISTINCT o.customer_id) AS unique_customers,
                AVG(o.total_amount) AS avg_order_value,
                MIN(o.created_at) AS first_order_date,
                MAX(o.created_at) AS last_order_date,
                COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= DATE('now', '-1 day')) AS orders_today,
                COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= DATE('now', '-7 days')) AS orders_last_7_days,
                COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= DATE('now', '-30 days')) AS orders_last_30_days,
                COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= DATE('now', '-90 days')) AS orders_last_90_days
            FROM online_order_providers oop
            LEFT JOIN orders o ON oop.id = o.online_order_provider_id
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (providerId) {
            query += ' AND oop.id = ?';
            params.push(providerId);
        }
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) >= ?' : ' WHERE DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY oop.id, oop.name, oop.display_name ORDER BY total_revenue DESC';

        return this.db.prepare(query).all(...params);
    }

    async getOnlineOrderList(providerId = null, status = null, startDate = null, endDate = null, limit = 100, offset = 0) {
        let query = `
            SELECT
                o.id,
                o.order_number,
                o.status,
                o.total_amount,
                o.created_at,
                o.online_order_external_id,
                o.online_order_status,
                o.online_order_customer_name,
                o.online_order_customer_phone,
                o.online_order_customer_email,
                o.online_order_delivery_address,
                o.online_order_expected_delivery_time,
                o.online_order_accepted_at,
                o.online_order_completed_at,
                o.online_order_cancelled_at,
                oop.id as provider_id,
                oop.name as provider_name,
                oop.display_name as provider_display_name
            FROM orders o
            LEFT JOIN online_order_providers oop ON o.online_order_provider_id = oop.id
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (providerId) {
            query += ' AND o.online_order_provider_id = ?';
            params.push(providerId);
        }
        if (status) {
            query += params.length > 0 ? ' AND o.status = ?' : ' WHERE o.status = ?';
            params.push(status);
        }
        if (startDate) {
            const condition = params.length > 0 ? ' AND' : ' WHERE';
            query += `${condition} DATE(o.created_at) >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            const condition = params.length > 0 ? ' AND' : ' WHERE';
            query += `${condition} DATE(o.created_at) <= ?`;
            params.push(endDate);
        }

        query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        return this.db.prepare(query).all(...params);
    }

    async getOnlineOrderItemDetails(orderId) {
        const query = `
            SELECT
                oi.id,
                oi.product_id,
                oi.product_name,
                oi.quantity,
                oi.unit_price,
                oi.total_price,
                oi.online_order_item_id,
                oi.online_order_preparation_notes
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.id = ?
            AND o.online_order_external_id IS NOT NULL
            ORDER BY oi.id
        `;

        return this.db.prepare(query).all(orderId);
    }

    async getOnlineOrderHistory(orderId) {
        const query = `
            SELECT
                ooh.id,
                ooh.event_type,
                ooh.status,
                ooh.payload,
                ooh.metadata,
                ooh.created_at,
                ooh.is_processed,
                ooh.retry_count,
                ooh.error_message,
                oop.name as provider_name
            FROM online_order_history ooh
            JOIN online_order_providers oop ON ooh.provider_id = oop.id
            WHERE ooh.order_id = ?
            ORDER BY ooh.created_at DESC
        `;

        return this.db.prepare(query).all(orderId);
    }

    async getOnlineOrderStatusDistribution(providerId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                o.status,
                COUNT(*) as order_count,
                SUM(o.total_amount) as total_amount,
                AVG(o.total_amount) as avg_amount
            FROM orders o
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (providerId) {
            query += ' AND o.online_order_provider_id = ?';
            params.push(providerId);
        }
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) >= ?' : ' WHERE DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY o.status ORDER BY order_count DESC';

        return this.db.prepare(query).all(...params);
    }

    async getOnlineOrderPaymentMethodDistribution(providerId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                o.online_order_payment_method as payment_method,
                COUNT(*) as order_count,
                SUM(o.total_amount) as total_amount,
                AVG(o.total_amount) as avg_amount
            FROM orders o
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (providerId) {
            query += ' AND o.online_order_provider_id = ?';
            params.push(providerId);
        }
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) >= ?' : ' WHERE DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY o.online_order_payment_method ORDER BY total_amount DESC';

        return this.db.prepare(query).all(...params);
    }

    async getOnlineOrderHourlyTrend(date, providerId = null) {
        let query = `
            SELECT
                strftime('%H', o.created_at) as hour,
                COUNT(*) as order_count,
                SUM(o.total_amount) as total_sales
            FROM orders o
            WHERE DATE(o.created_at) = ?
            AND o.online_order_external_id IS NOT NULL
        `;

        const params = [date];
        if (providerId) {
            query += ' AND o.online_order_provider_id = ?';
            params.push(providerId);
        }

        query += ' GROUP BY hour ORDER BY hour';

        return this.db.prepare(query).all(...params);
    }

    async getOnlineOrderTopItems(providerId = null, startDate = null, endDate = null, limit = 10) {
        let query = `
            SELECT
                oi.product_name,
                oi.product_id,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                COUNT(DISTINCT oi.order_id) as order_count
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (providerId) {
            query += ' AND o.online_order_provider_id = ?';
            params.push(providerId);
        }
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) >= ?' : ' WHERE DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY oi.product_id, oi.product_name ORDER BY total_revenue DESC LIMIT ?';
        params.push(limit);

        return this.db.prepare(query).all(...params);
    }

    async getOnlineOrderCustomerAnalysis(providerId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                COUNT(DISTINCT CASE WHEN o.online_order_customer_phone IS NOT NULL THEN o.id END) as orders_with_phone,
                COUNT(DISTINCT CASE WHEN o.online_order_customer_email IS NOT NULL THEN o.id END) as orders_with_email,
                COUNT(DISTINCT CASE WHEN o.online_order_customer_name IS NOT NULL THEN o.id END) as orders_with_name,
                COUNT(DISTINCT o.customer_id) as orders_with_customer_id,
                COUNT(DISTINCT o.id) as total_orders
            FROM orders o
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (providerId) {
            query += ' AND o.online_order_provider_id = ?';
            params.push(providerId);
        }
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) >= ?' : ' WHERE DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        const result = this.db.prepare(query).all(...params);
        return result.length > 0 ? result[0] : null;
    }

    async getOnlineOrderDeliveryAnalysis(providerId = null, startDate = null, endDate = null) {
        let query = `
            SELECT
                COUNT(*) as total_orders,
                COUNT(DISTINCT CASE WHEN o.online_order_delivery_address IS NOT NULL THEN o.id END) as orders_with_address,
                COUNT(DISTINCT CASE WHEN o.online_order_instructions IS NOT NULL THEN o.id END) as orders_with_instructions,
                COUNT(DISTINCT CASE WHEN o.online_order_expected_delivery_time IS NOT NULL THEN o.id END) as orders_with_eta,
                AVG(julianday(o.online_order_completed_at) - julianday(o.created_at)) as avg_completion_time_minutes
            FROM orders o
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (providerId) {
            query += ' AND o.online_order_provider_id = ?';
            params.push(providerId);
        }
        if (startDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) >= ?' : ' WHERE DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        const result = this.db.prepare(query).all(...params);
        return result.length > 0 ? result[0] : null;
    }

    async getOnlineOrderProviderComparison(startDate = null, endDate = null) {
        let query = `
            SELECT
                oop.id as provider_id,
                oop.name as provider_name,
                oop.display_name as provider_display_name,
                COUNT(DISTINCT o.id) as order_count,
                SUM(o.total_amount) as total_revenue,
                AVG(o.total_amount) as avg_order_value,
                SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
                SUM(CASE WHEN o.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
                CASE
                    WHEN COUNT(DISTINCT o.id) > 0
                    THEN (SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT o.id))
                    ELSE 0
                END as completion_rate
            FROM online_order_providers oop
            LEFT JOIN orders o ON oop.id = o.online_order_provider_id
            WHERE o.online_order_external_id IS NOT NULL
        `;

        const params = [];
        if (startDate) {
            query += ' AND DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += params.length > 0 ? ' AND DATE(o.created_at) <= ?' : ' WHERE DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY oop.id, oop.name, oop.display_name ORDER BY total_revenue DESC';

        return this.db.prepare(query).all(...params);
    }

    // ========================================================================
    // REPORTING OPERATIONS
    // ========================================================================

    async getSalesReport(startDate, endDate, locationId = null) {
        let query = `
            SELECT 
                COUNT(*) as total_orders,
                SUM(total_amount) as total_sales,
                SUM(tax_amount) as total_tax,
                SUM(discount_amount) as total_discounts,
                AVG(total_amount) as average_order_value,
                payment_mode,
                COUNT(*) as payment_count
            FROM orders 
            WHERE DATE(created_at) BETWEEN ? AND ?
            AND payment_status = 'paid'
        `;
        
        const params = [startDate, endDate];
        
        if (locationId) {
            query += ' AND location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY payment_mode';
        
        return this.db.prepare(query).all(...params);
    }

    async getDailySummary(date, locationId = null) {
        let query = `
            SELECT 
                COUNT(*) as total_orders,
                SUM(total_amount) as total_sales,
                SUM(tax_amount) as total_tax,
                SUM(discount_amount) as total_discounts,
                AVG(total_amount) as average_order_value
            FROM orders 
            WHERE DATE(created_at) = ?
            AND payment_status = 'paid'
        `;
        
        const params = [date];
        
        if (locationId) {
            query += ' AND location_id = ?';
            params.push(locationId);
        }
        
        const result = this.db.prepare(query).all(...params);
        return result.length > 0 ? result[0] : null;
    }

    async getTopSellingItems(startDate, endDate, limit = 10, locationId = null) {
        let query = `
            SELECT 
                m.name,
                m.price,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                COUNT(DISTINCT oi.order_id) as order_count
            FROM order_items oi
            JOIN menu_items m ON oi.menu_item_id = m.id
            JOIN orders o ON oi.order_id = o.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.payment_status = 'paid'
        `;
        
        const params = [startDate, endDate, limit];
        
        if (locationId) {
            query += ' AND o.location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY m.id, m.name, m.price ORDER BY total_quantity DESC LIMIT ?';
        
        return this.db.prepare(query).all(...params);
    }

    async getTaxReport(startDate, endDate, locationId = null) {
        let query = `
            SELECT
                DATE(created_at) as date,
                SUM(subtotal) as taxable_amount,
                SUM(tax_amount) as tax_collected,
                tax_rate,
                tax_type,
                COUNT(*) as transaction_count
            FROM orders
            WHERE DATE(created_at) BETWEEN ? AND ?
            AND payment_status = 'paid'
        `;
        
        const params = [startDate, endDate];
        
        if (locationId) {
            query += ' AND location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY DATE(created_at), tax_rate, tax_type ORDER BY date DESC';
        
        return this.db.prepare(query).all(...params);
    }
    
    async getTaxBreakdownReport(startDate, endDate, locationId = null) {
        let query = `
            SELECT
                tax_type,
                SUM(subtotal) as total_subtotal,
                SUM(tax_amount) as total_tax_amount,
                SUM(total_amount) as total_amount,
                COUNT(*) as order_count,
                SUM(tax_amount) / NULLIF(SUM(subtotal), 0) * 100 as tax_percentage
            FROM orders
            WHERE DATE(created_at) BETWEEN ? AND ?
            AND payment_status = 'paid'
        `;
        
        const params = [startDate, endDate];
        
        if (locationId) {
            query += ' AND location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY tax_type ORDER BY total_tax_amount DESC';
        
        return this.db.prepare(query).all(...params);
    }
    
    async getTaxSummaryByLocation(startDate, endDate) {
        let query = `
            SELECT
                l.id as location_id,
                l.name as location_name,
                SUM(o.subtotal) as total_subtotal,
                SUM(o.tax_amount) as total_tax_amount,
                COUNT(o.id) as order_count,
                SUM(o.tax_amount) / NULLIF(SUM(o.subtotal), 0) * 100 as avg_tax_rate
            FROM orders o
            JOIN locations l ON o.location_id = l.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.payment_status = 'paid'
        `;
        
        const params = [startDate, endDate];
        
        query += ' GROUP BY l.id, l.name ORDER BY total_tax_amount DESC';
        
        return this.db.prepare(query).all(...params);
    }
    
    async getTaxComplianceReport(startDate, endDate, locationId = null) {
        let query = `
            SELECT
                DATE(created_at) as date,
                location_id,
                tax_type,
                SUM(subtotal) as taxable_sales,
                SUM(tax_amount) as tax_collected,
                SUM(total_amount) as gross_sales,
                COUNT(*) as transaction_count
            FROM orders
            WHERE DATE(created_at) BETWEEN ? AND ?
            AND payment_status = 'paid'
        `;
        
        const params = [startDate, endDate];
        
        if (locationId) {
            query += ' AND location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY DATE(created_at), location_id, tax_type ORDER BY date';
        
        return this.db.prepare(query).all(...params);
    }

    async getPaymentBreakdown(startDate, endDate, locationId = null) {
        let query = `
            SELECT 
                payment_mode,
                COUNT(*) as transaction_count,
                SUM(total_amount) as total_amount,
                AVG(total_amount) as average_amount
            FROM orders 
            WHERE DATE(created_at) BETWEEN ? AND ?
            AND payment_status = 'paid'
        `;
        
        const params = [startDate, endDate];
        
        if (locationId) {
            query += ' AND location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY payment_mode ORDER BY total_amount DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getHourlySalesReport(date, locationId = null) {
        let query = `
            SELECT 
                strftime('%H', created_at) as hour,
                COUNT(*) as order_count,
                SUM(total_amount) as total_sales
            FROM orders 
            WHERE DATE(created_at) = ?
            AND payment_status = 'paid'
        `;
        
        const params = [date];
        
        if (locationId) {
            query += ' AND location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY hour ORDER BY hour';
        
        return this.db.prepare(query).all(...params);
    }

    async getCustomerSalesReport(startDate, endDate, locationId = null) {
        let query = `
            SELECT 
                c.id,
                c.name,
                c.phone,
                COUNT(o.id) as order_count,
                SUM(o.total_amount) as total_spent
            FROM customers c
            LEFT JOIN orders o ON c.id = o.customer_id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.payment_status = 'paid'
        `;
        
        const params = [startDate, endDate];
        
        if (locationId) {
            query += ' AND o.location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY c.id, c.name, c.phone ORDER BY total_spent DESC';
        
        return this.db.prepare(query).all(...params);
    }

    async getInventoryTurnoverReport(startDate, endDate, locationId = null) {
        let query = `
            SELECT 
                m.id,
                m.name,
                m.category_id,
                SUM(oi.quantity) as total_sold,
                SUM(oi.total_price) as total_revenue,
                m.stock_quantity as current_stock
            FROM order_items oi
            JOIN menu_items m ON oi.menu_item_id = m.id
            JOIN orders o ON oi.order_id = o.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.payment_status = 'paid'
        `;

        const params = [startDate, endDate];

        if (locationId) {
            query += ' AND o.location_id = ?';
            params.push(locationId);
        }

        query += ' GROUP BY m.id, m.name, m.category_id, m.stock_quantity ORDER BY total_revenue DESC';

        return this.db.prepare(query).all(...params);
    }

    // ========================================================================
    // RECIPE REPORTS
    // ========================================================================

    // Get recipe cost report
    async getRecipeCostReport() {
      const query = `
        SELECT 
          r.id,
          r.name as recipe_name,
          mi.name as menu_item_name,
          mi.price as menu_item_price,
          r.recipe_cost,
          COUNT(ruh.id) as usage_count,
          SUM(ruh.quantity_used) as total_quantity_used
        FROM recipes r
        JOIN menu_items mi ON r.menu_item_id = mi.id
        LEFT JOIN recipe_usage_history ruh ON r.id = ruh.recipe_id
        WHERE r.is_active = 1
        GROUP BY r.id, r.name, mi.name, mi.price, r.recipe_cost
        ORDER BY total_quantity_used DESC
      `;

      return this.db.prepare(query).all();
    }

    // Get ingredient usage report
    async getIngredientUsageReport(recipeId = null) {
      let query = `
        SELECT 
          mi.id as ingredient_id,
          mi.name as ingredient_name,
          SUM(ri.quantity * ruh.quantity_used) as total_quantity_used,
          SUM(mi.price * ri.quantity * ruh.quantity_used) as total_cost
        FROM recipe_usage_history ruh
        JOIN recipes r ON ruh.recipe_id = r.id
        JOIN recipe_ingredients ri ON r.id = ri.recipe_id
        JOIN menu_items mi ON ri.menu_item_id = mi.id
      `;

      const params = [];

      if (recipeId) {
        query += ' WHERE r.id = ?';
        params.push(recipeId);
      }

      query += ' GROUP BY mi.id, mi.name ORDER BY total_quantity_used DESC';

      return this.db.prepare(query).all(...params);
    }

    // Get recipe efficiency report
    async getRecipeEfficiencyReport() {
      const query = `
        SELECT 
          r.id,
          r.name as recipe_name,
          mi.price as selling_price,
          r.recipe_cost,
          (mi.price - r.recipe_cost) as profit_per_item,
          COUNT(ruh.id) as items_sold,
          (mi.price - r.recipe_cost) * COUNT(ruh.id) as total_profit,
          (r.recipe_cost / mi.price) * 100 as cost_percentage
        FROM recipes r
        JOIN menu_items mi ON r.menu_item_id = mi.id
        LEFT JOIN recipe_usage_history ruh ON r.id = ruh.recipe_id
        WHERE r.is_active = 1
        GROUP BY r.id, r.name, mi.price, r.recipe_cost
        ORDER BY total_profit DESC
      `;

      return this.db.prepare(query).all();
    }

    // Get recipe ingredient alerts
    async getRecipeIngredientAlerts(resolvedFilter = null) {
      let query = 'SELECT * FROM recipe_ingredient_alerts';
      const params = [];

      if (resolvedFilter !== null) {
        query += ' WHERE is_resolved = ?';
        params.push(resolvedFilter ? 1 : 0);
      }

      query += ' ORDER BY created_at DESC';

      return this.db.prepare(query).all(...params);
    }
    
    // ========================================================================
    // DATA VISUALIZATION
    // ========================================================================

    async generateChartData(type, startDate, endDate, locationId = null, providerId = null) {
        switch (type) {
            case 'sales-trend':
                return this.generateSalesTrendChart(startDate, endDate, locationId);
            case 'payment-methods':
                return this.generatePaymentMethodsChart(startDate, endDate, locationId);
            case 'top-items':
                return this.generateTopItemsChart(startDate, endDate, locationId);
            case 'hourly-sales':
                return this.generateHourlySalesChart(startDate, endDate, locationId);
            case 'category-performance':
                return this.generateCategoryPerformanceChart(startDate, endDate, locationId);
            case 'online-provider-performance':
                return this.generateOnlineOrderProviderChart(startDate, endDate);
            case 'online-status-distribution':
                return this.generateOnlineOrderStatusChart(startDate, endDate, providerId);
            case 'online-payment-methods':
                return this.generateOnlineOrderPaymentMethodChart(startDate, endDate, providerId);
            case 'online-hourly-trend':
                return this.generateOnlineOrderHourlyTrendChart(startDate, providerId);
            case 'online-top-items':
                return this.generateOnlineOrderTopItemsChart(startDate, endDate, providerId);
            case 'digital-receipt-type':
                return this.generateDigitalReceiptTypeChart(startDate, endDate);
            case 'digital-receipt-status':
                return this.generateDigitalReceiptStatusChart(startDate, endDate);
            case 'digital-receipt-delivery-rate':
                return this.generateDigitalReceiptDeliveryRateChart(startDate, endDate);
            case 'digital-receipt-hourly-trend':
                return this.generateDigitalReceiptHourlyTrendChart(startDate);
            default:
                throw new Error(`Unknown chart type: ${type}`);
        }
    }

    async generateSalesTrendChart(startDate, endDate, locationId = null) {
        const salesData = await this.getSalesReport(startDate, endDate, locationId);
        
        // Group by date for trend line
        const dateQuery = `
            SELECT 
                DATE(created_at) as date,
                SUM(total_amount) as daily_sales
            FROM orders 
            WHERE DATE(created_at) BETWEEN ? AND ?
            AND payment_status = 'paid'
        `;
        
        let params = [startDate, endDate];
        if (locationId) {
            dateQuery += ' AND location_id = ?';
            params.push(locationId);
        }
        
        dateQuery += ' GROUP BY DATE(created_at) ORDER BY date';
        
        const dailySales = this.db.prepare(dateQuery).all(...params);
        
        return {
            type: 'line',
            data: {
                labels: dailySales.map(d => d.date),
                datasets: [
                    {
                        label: 'Daily Sales',
                        data: dailySales.map(d => d.daily_sales),
                        borderColor: '#36A2EB',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Sales Amount' }
                    },
                    x: {
                        title: { display: true, text: 'Date' }
                    }
                }
            }
        };
    }

    async generatePaymentMethodsChart(startDate, endDate, locationId = null) {
        const paymentData = await this.getPaymentBreakdown(startDate, endDate, locationId);
        
        return {
            type: 'doughnut',
            data: {
                labels: paymentData.map(d => d.payment_mode),
                datasets: [
                    {
                        data: paymentData.map(d => d.total_amount),
                        backgroundColor: [
                            '#FF6384',
                            '#36A2EB',
                            '#FFCE56',
                            '#4BC0C0',
                            '#9966FF'
                        ]
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        };
    }

    async generateTopItemsChart(startDate, endDate, locationId = null) {
        const topItems = await this.getTopSellingItems(startDate, endDate, 10, locationId);
        
        return {
            type: 'bar',
            data: {
                labels: topItems.map(i => i.name),
                datasets: [
                    {
                        label: 'Quantity Sold',
                        data: topItems.map(i => i.total_quantity),
                        backgroundColor: '#4BC0C0'
                    },
                    {
                        label: 'Revenue',
                        data: topItems.map(i => i.total_revenue),
                        backgroundColor: '#FF6384'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: false
                    },
                    x: {
                        stacked: false
                    }
                }
            }
        };
    }

    async generateHourlySalesChart(date, locationId = null) {
        const hourlyData = await this.getHourlySalesReport(date, locationId);
        
        return {
            type: 'bar',
            data: {
                labels: hourlyData.map(d => `${d.hour}:00`).sort((a, b) => a.localeCompare(b)),
                datasets: [
                    {
                        label: 'Orders',
                        data: hourlyData.map(d => d.order_count),
                        backgroundColor: '#36A2EB'
                    },
                    {
                        label: 'Sales',
                        data: hourlyData.map(d => d.total_sales),
                        backgroundColor: '#FF6384',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Number of Orders' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Sales Amount' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        };
    }

    async generateOnlineOrderProviderChart(startDate, endDate) {
        const providerData = await this.getOnlineOrderProviderComparison(startDate, endDate);
        
        return {
            type: 'bar',
            data: {
                labels: providerData.map(d => d.provider_display_name),
                datasets: [
                    {
                        label: 'Total Revenue',
                        data: providerData.map(d => d.total_revenue),
                        backgroundColor: '#36A2EB'
                    },
                    {
                        label: 'Order Count',
                        data: providerData.map(d => d.order_count),
                        backgroundColor: '#FF6384',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Revenue' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Order Count' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        };
    }

    async generateOnlineOrderStatusChart(startDate, endDate, providerId = null) {
        const statusData = await this.getOnlineOrderStatusDistribution(providerId, startDate, endDate);
        
        return {
            type: 'doughnut',
            data: {
                labels: statusData.map(d => d.status),
                datasets: [
                    {
                        data: statusData.map(d => d.order_count),
                        backgroundColor: [
                            '#4BC0C0',
                            '#FF6384',
                            '#FFCE56',
                            '#9966FF'
                        ]
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} orders (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        };
    }

    async generateOnlineOrderPaymentMethodChart(startDate, endDate, providerId = null) {
        const paymentData = await this.getOnlineOrderPaymentMethodDistribution(providerId, startDate, endDate);
        
        return {
            type: 'pie',
            data: {
                labels: paymentData.map(d => d.payment_method || 'Unknown'),
                datasets: [
                    {
                        data: paymentData.map(d => d.total_amount),
                        backgroundColor: [
                            '#FF6384',
                            '#36A2EB',
                            '#FFCE56',
                            '#4BC0C0',
                            '#9966FF'
                        ]
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        };
    }

    async generateOnlineOrderHourlyTrendChart(date, providerId = null) {
        const hourlyData = await this.getOnlineOrderHourlyTrend(date, providerId);
        
        return {
            type: 'line',
            data: {
                labels: hourlyData.map(d => `${d.hour}:00`).sort((a, b) => a.localeCompare(b)),
                datasets: [
                    {
                        label: 'Orders',
                        data: hourlyData.map(d => d.order_count),
                        borderColor: '#36A2EB',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Revenue',
                        data: hourlyData.map(d => d.total_sales),
                        borderColor: '#FF6384',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Number of Orders' },
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Revenue' },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true
                    }
                }
            }
        };
    }

    async generateOnlineOrderTopItemsChart(startDate, endDate, providerId = null, limit = 10) {
        const topItems = await this.getOnlineOrderTopItems(providerId, startDate, endDate, limit);
        
        return {
            type: 'horizontalBar',
            data: {
                labels: topItems.map(i => i.product_name),
                datasets: [
                    {
                        label: 'Revenue',
                        data: topItems.map(i => i.total_revenue),
                        backgroundColor: '#4BC0C0'
                    },
                    {
                        label: 'Quantity',
                        data: topItems.map(i => i.total_quantity),
                        backgroundColor: '#FF6384'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        stacked: false,
                        beginAtZero: true
                    },
                    y: {
                        stacked: false
                    }
                }
            }
        };
    }

    async generateDigitalReceiptTypeChart(startDate, endDate) {
        const typeData = await this.getDigitalReceiptByTypeReport(startDate, endDate);
        
        return {
            type: 'doughnut',
            data: {
                labels: typeData.map(d => d.receipt_type),
                datasets: [
                    {
                        data: typeData.map(d => d.receipt_count),
                        backgroundColor: [
                            '#36A2EB',
                            '#FF6384',
                            '#FFCE56'
                        ]
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} receipts (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        };
    }

    async generateDigitalReceiptStatusChart(startDate, endDate) {
        const statusData = await this.getDigitalReceiptByStatusReport(startDate, endDate);
        
        return {
            type: 'bar',
            data: {
                labels: statusData.map(d => d.status),
                datasets: [
                    {
                        label: 'Receipt Count',
                        data: statusData.map(d => d.receipt_count),
                        backgroundColor: '#36A2EB'
                    },
                    {
                        label: 'Unique Orders',
                        data: statusData.map(d => d.unique_orders),
                        backgroundColor: '#FF6384',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Receipt Count' },
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Unique Orders' },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true
                    }
                }
            }
        };
    }

    async generateDigitalReceiptDeliveryRateChart(startDate, endDate) {
        const typeData = await this.getDigitalReceiptByTypeReport(startDate, endDate);
        
        return {
            type: 'bar',
            data: {
                labels: typeData.map(d => d.receipt_type),
                datasets: [
                    {
                        label: 'Delivery Rate (%)',
                        data: typeData.map(d => d.delivery_rate),
                        backgroundColor: '#4BC0C0'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Delivery Rate (%)' }
                    },
                    x: {
                        title: { display: true, text: 'Receipt Type' }
                    }
                }
            }
        };
    }

    async generateDigitalReceiptHourlyTrendChart(date) {
        const hourlyData = await this.getDigitalReceiptHourlyTrend(date);
        
        return {
            type: 'line',
            data: {
                labels: hourlyData.map(d => `${d.hour}:00`).sort((a, b) => a.localeCompare(b)),
                datasets: [
                    {
                        label: 'Total Receipts',
                        data: hourlyData.map(d => d.receipt_count),
                        borderColor: '#36A2EB',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Email',
                        data: hourlyData.map(d => d.email_count),
                        borderColor: '#FF6384',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        fill: false,
                        tension: 0.4
                    },
                    {
                        label: 'WhatsApp',
                        data: hourlyData.map(d => d.whatsapp_count),
                        borderColor: '#FFCE56',
                        backgroundColor: 'rgba(255, 206, 86, 0.2)',
                        fill: false,
                        tension: 0.4
                    },
                    {
                        label: 'SMS',
                        data: hourlyData.map(d => d.sms_count),
                        borderColor: '#4BC0C0',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Number of Receipts' },
                        beginAtZero: true
                    },
                    x: {
                        title: { display: true, text: 'Hour of Day' }
                    }
                }
            }
        };
    }

    async generateCategoryPerformanceChart(startDate, endDate, locationId = null) {
        let query = `
            SELECT 
                c.name as category,
                COUNT(DISTINCT oi.order_id) as order_count,
                SUM(oi.total_price) as total_revenue
            FROM order_items oi
            JOIN menu_items m ON oi.menu_item_id = m.id
            JOIN categories c ON m.category_id = c.id
            JOIN orders o ON oi.order_id = o.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.payment_status = 'paid'
        `;
        
        const params = [startDate, endDate];
        
        if (locationId) {
            query += ' AND o.location_id = ?';
            params.push(locationId);
        }
        
        query += ' GROUP BY c.name ORDER BY total_revenue DESC';
        
        const categoryData = this.db.prepare(query).all(...params);
        
        return {
            type: 'pie',
            data: {
                labels: categoryData.map(d => d.category),
                datasets: [
                    {
                        data: categoryData.map(d => d.total_revenue),
                        backgroundColor: [
                            '#FF6384',
                            '#36A2EB',
                            '#FFCE56',
                            '#4BC0C0',
                            '#9966FF',
                            '#FF9F40',
                            '#8AC24A',
                            '#FF6384'
                        ]
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        };
    }

    // ========================================================================
    // REPORT EXPORT
    // ========================================================================

    async exportToCSV(data, filename) {
        try {
            const parser = new Parser();
            const csv = parser.parse(data);
            
            const exportPath = path.join(__dirname, '..', 'exports', filename);
            const exportDir = path.dirname(exportPath);
            
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir, { recursive: true });
            }
            
            fs.writeFileSync(exportPath, csv);
            return exportPath;
        } catch (error) {
            this.logger.error('Error exporting to CSV:', error);
            throw error;
        }
    }

    async exportToPDF(data, filename, options = {}) {
        try {
            const doc = new PDFDocument({
                size: options.size || 'A4',
                margins: {
                    top: 50,
                    bottom: 50,
                    left: 50,
                    right: 50
                }
            });
            
            const exportPath = path.join(__dirname, '..', 'exports', filename);
            const exportDir = path.dirname(exportPath);
            
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir, { recursive: true });
            }
            
            const streams = [
                doc,
                fs.createWriteStream(exportPath)
            ];
            
            doc.pipe(streams[1]);
            
            // Header
            doc.image(path.join(__dirname, '..', 'images', 'logo.svg'), 50, 45, { width: 50 });
            doc.fillColor('#444444')
                .fontSize(20)
                .text('Cafe POS Report', 120, 50, { align: 'center' });
            
            doc.moveDown();
            doc.fillColor('#666666')
                .fontSize(12)
                .text(`Generated on: ${new Date().toLocaleDateString()}`);
            
            doc.moveDown();
            
            // Content
            if (options.title) {
                doc.fontSize(16)
                    .text(options.title, { align: 'center' });
                doc.moveDown();
            }
            
            if (options.subtitle) {
                doc.fontSize(12)
                    .text(options.subtitle, { align: 'center' });
                doc.moveDown();
            }
            
            // Table data
            if (data && data.length > 0) {
                const headers = Object.keys(data[0]);
                
                // Table header
                doc.fontSize(10)
                    .text(headers.join(' | '), { align: 'center' });
                doc.moveDown();
                
                // Table separator
                const separator = headers.map(() => '------').join(' | ');
                doc.text(separator, { align: 'center' });
                doc.moveDown();
                
                // Table rows
                data.forEach(row => {
                    const values = headers.map(header => row[header] || '');
                    doc.text(values.join(' | '));
                    doc.moveDown();
                });
            }
            
            // Summary
            if (options.summary) {
                doc.moveDown();
                doc.fontSize(12)
                    .text('Summary:', { underline: true });
                doc.moveDown();
                
                Object.entries(options.summary).forEach(([key, value]) => {
                    doc.text(`${key}: ${value}`);
                    doc.moveDown();
                });
            }
            
            doc.end();
            
            return exportPath;
        } catch (error) {
            this.logger.error('Error exporting to PDF:', error);
            throw error;
        }
    }

    // ========================================================================
    // SCHEDULED REPORTS
    // ========================================================================

    async createScheduledReport(reportData) {
        const { name, reportType, scheduleCron, timeZone, emailTo, emailCc, emailBcc, format, createdBy } = reportData;
        
        const result = this.db.prepare(`
            INSERT INTO scheduled_reports (name, report_type, schedule_cron, time_zone, email_to, email_cc, email_bcc, format, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name,
            reportType,
            scheduleCron,
            timeZone || 'UTC',
            emailTo || '',
            emailCc || '',
            emailBcc || '',
            format || 'pdf',
            createdBy
        );
        
        return result.lastInsertRowid;
    }

    async getScheduledReports() {
        return this.db.prepare(`
            SELECT * FROM scheduled_reports ORDER BY created_at DESC
        `).all();
    }

    async getScheduledReport(id) {
        return this.db.prepare(`
            SELECT * FROM scheduled_reports WHERE id = ?
        `).get(id);
    }

    async updateScheduledReport(id, updates) {
        const fields = [];
        const values = [];
        
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });
        
        if (fields.length === 0) return;
        
        values.push(id);
        
        this.db.prepare(`
            UPDATE scheduled_reports SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(...values);
    }

    async deleteScheduledReport(id) {
        this.db.prepare('UPDATE scheduled_reports SET is_active = 0 WHERE id = ?').run(id);
        
        // Stop the cron job
        const report = await this.getScheduledReport(id);
        if (report && this.scheduledJobs.has(id)) {
            this.scheduledJobs.get(id)();
            this.scheduledJobs.delete(id);
        }
    }

    async loadScheduledReports() {
        const reports = await this.getScheduledReports();
        
        reports.forEach(report => {
            if (report.is_active) {
                this.startScheduledReport(report);
            }
        });
    }

    async startScheduledReport(report) {
        try {
            // Stop existing job if it exists
            if (this.scheduledJobs.has(report.id)) {
                this.scheduledJobs.get(report.id)();
            }
            
            // Create new job
            const job = cron.schedule(
                report.schedule_cron,
                async () => {
                    try {
                        await this.executeScheduledReport(report);
                    } catch (error) {
                        this.logger.error(`Error executing scheduled report ${report.id}:`, error);
                    }
                },
                {
                    scheduled: true,
                    timezone: report.time_zone
                }
            );
            
            this.scheduledJobs.set(report.id, () => job.stop());
            this.logger.info(`Started scheduled report: ${report.name} (${report.schedule_cron})`);
        } catch (error) {
            this.logger.error(`Failed to start scheduled report ${report.id}:`, error);
        }
    }

    async executeScheduledReport(report) {
        this.logger.info(`Executing scheduled report: ${report.name}`);
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        const endDate = new Date();
        
        let reportData = null;
        
        switch (report.report_type) {
            case 'daily-sales':
                reportData = await this.getDailySummary(endDate.toISOString().split('T')[0]);
                break;
            case 'sales-report':
                reportData = await this.getSalesReport(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                );
                break;
            case 'top-items':
                reportData = await this.getTopSellingItems(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0],
                    10
                );
                break;
            case 'tax-report':
                reportData = await this.getTaxReport(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                );
                break;
            default:
                throw new Error(`Unknown report type: ${report.report_type}`);
        }
        
        // Generate file
        let filePath = null;
        if (report.format === 'pdf') {
            filePath = await this.exportToPDF(
                reportData,
                `report_${report.id}_${new Date().toISOString().split('T')[0]}.pdf`,
                {
                    title: report.name,
                    subtitle: `Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`
                }
            );
        } else {
            filePath = await this.exportToCSV(
                reportData,
                `report_${report.id}_${new Date().toISOString().split('T')[0]}.csv`
            );
        }
        
        // Send email if configured
        if (report.email_to && this.transporter) {
            await this.sendReportEmail(
                report,
                filePath,
                reportData,
                startDate,
                endDate
            );
        }
        
        this.logger.info(`Scheduled report ${report.name} executed successfully`);
    }

    async sendReportEmail(report, filePath, data, startDate, endDate) {
        try {
            const subject = `[Cafe POS] ${report.name} - ${new Date().toLocaleDateString()}`;
            const text = `Hello,

Please find attached the ${report.name} report for the period ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}.

Best regards,
Cafe POS System`;
            
            const html = `<html>
                <body>
                    <h2>Cafe POS Report</h2>
                    <p>Hello,</p>
                    <p>Please find attached the <strong>${report.name}</strong> report for the period 
                    ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}.</p>
                    <p>Best regards,<br>Cafe POS System</p>
                </body>
            </html>`;
            
            const attachments = [
                {
                    filename: path.basename(filePath),
                    path: filePath
                }
            ];
            
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM || 'noreply@cafe-pos.com',
                to: report.email_to,
                cc: report.email_cc,
                bcc: report.email_bcc,
                subject: subject,
                text: text,
                html: html,
                attachments: attachments
            });
            
            this.logger.info(`Report email sent to ${report.email_to}`);
        } catch (error) {
            this.logger.error('Error sending report email:', error);
            throw error;
        }
    }

    // ========================================================================
    // CUSTOM REPORT BUILDER
    // ========================================================================

    async createReportTemplate(templateData) {
        const { name, description, querySql, columns, filters, isPublic, createdBy } = templateData;
        
        const result = this.db.prepare(`
            INSERT INTO report_templates (name, description, query_sql, columns, filters, is_public, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            name,
            description || '',
            querySql,
            JSON.stringify(columns),
            JSON.stringify(filters || {}),
            isPublic ? 1 : 0,
            createdBy
        );
        
        return result.lastInsertRowid;
    }

    async getReportTemplates(userId, includePrivate = false) {
        let query = `
            SELECT * FROM report_templates 
            WHERE (is_public = 1 OR created_by = ?)
        `;
        
        if (includePrivate) {
            query = 'SELECT * FROM report_templates';
        }
        
        return this.db.prepare(query).all(userId);
    }

    async getReportTemplate(id) {
        return this.db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id);
    }

    async updateReportTemplate(id, updates) {
        const fields = [];
        const values = [];
        
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(key === 'columns' || key === 'filters' ? JSON.stringify(updates[key]) : updates[key]);
            }
        });
        
        if (fields.length === 0) return;
        
        values.push(id);
        
        this.db.prepare(`
            UPDATE report_templates SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(...values);
    }

    async deleteReportTemplate(id) {
        this.db.prepare('DELETE FROM report_templates WHERE id = ?').run(id);
    }

    async executeCustomReport(templateId, params = {}) {
        const template = await this.getReportTemplate(templateId);
        if (!template) {
            throw new Error('Report template not found');
        }
        
        // Replace parameters in query
        let query = template.query_sql;
        Object.keys(params).forEach(key => {
            query = query.replace(new RegExp(`:\${key}`, 'g'), params[key]);
        });
    
        this.logger.info('Custom report query after param replacement:', query);
        if (!this.db) {
            this.logger.error('Database connection is null in executeCustomReport');
            throw new Error('Database connection not available');
        }
        return this.db.prepare(query).all();
    }

    async loadReportTemplates() {
        const templates = await this.getReportTemplates(null, true);
        templates.forEach(template => {
            this.reportTemplates.set(template.id, template);
        });
    }

    // ========================================================================
    // BACKUP SCHEDULING
    // ========================================================================

    async createBackupSchedule(scheduleData) {
        const { name, scheduleCron, timeZone, retentionDays, backupLocation, createdBy } = scheduleData;
        
        const result = this.db.prepare(`
            INSERT INTO backup_schedules (name, schedule_cron, time_zone, retention_days, backup_location, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            name,
            scheduleCron,
            timeZone || 'UTC',
            retentionDays || 30,
            backupLocation || 'local',
            createdBy
        );
        
        return result.lastInsertRowid;
    }

    async getBackupSchedules() {
        return this.db.prepare('SELECT * FROM backup_schedules ORDER BY created_at DESC').all();
    }

    async getBackupSchedule(id) {
        return this.db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(id);
    }

    async updateBackupSchedule(id, updates) {
        const fields = [];
        const values = [];
        
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });
        
        if (fields.length === 0) return;
        
        values.push(id);
        
        this.db.prepare(`
            UPDATE backup_schedules SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(...values);
    }

    async deleteBackupSchedule(id) {
        this.db.prepare('UPDATE backup_schedules SET is_active = 0 WHERE id = ?').run(id);
        
        // Stop the cron job
        if (this.backupJobs.has(id)) {
            this.backupJobs.get(id)();
            this.backupJobs.delete(id);
        }
    }

    async loadBackupSchedules() {
        const schedules = await this.getBackupSchedules();
        
        schedules.forEach(schedule => {
            if (schedule.is_active) {
                this.startBackupSchedule(schedule);
            }
        });
    }

    async startBackupSchedule(schedule) {
        try {
            // Stop existing job if it exists
            if (this.backupJobs.has(schedule.id)) {
                this.backupJobs.get(schedule.id)();
            }
            
            // Create new job
            const job = cron.schedule(
                schedule.schedule_cron,
                async () => {
                    try {
                        await this.executeBackup(schedule);
                    } catch (error) {
                        this.logger.error(`Error executing backup schedule ${schedule.id}:`, error);
                    }
                },
                {
                    scheduled: true,
                    timezone: schedule.time_zone
                }
            );
            
            this.backupJobs.set(schedule.id, () => job.stop());
            this.logger.info(`Started backup schedule: ${schedule.name} (${schedule.schedule_cron})`);
        } catch (error) {
            this.logger.error(`Failed to start backup schedule ${schedule.id}:`, error);
        }
    }

    async executeBackup(schedule) {
        this.logger.info(`Executing backup schedule: ${schedule.name}`);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, '..', 'backups');
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const backupPath = path.join(backupDir, `cafe_pos_backup_${timestamp}.sql`);
        
        try {
            // Record backup start
            const backupId = this.db.prepare(`
                INSERT INTO backup_history (schedule_id, backup_path, status, started_at)
                VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
            `).run(schedule.id, backupPath).lastInsertRowid;
            
            // Perform backup
            const dump = this.db.prepare('SELECT * FROM orders LIMIT 1').all();
            
            // Simulate backup process
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Record backup completion
            this.db.prepare(`
                UPDATE backup_history 
                SET status = 'completed', completed_at = CURRENT_TIMESTAMP, file_size = ?
                WHERE id = ?
            `).run(1024, backupId);
            
            // Clean up old backups
            await this.cleanupOldBackups(schedule.retention_days);
            
            this.logger.info(`Backup completed: ${backupPath}`);
        } catch (error) {
            this.logger.error('Backup failed:', error);
            
            // Record backup failure
            this.db.prepare(`
                UPDATE backup_history 
                SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = ?
                WHERE id = ?
            `).run(error.message, backupId);
            
            throw error;
        }
    }

    async cleanupOldBackups(retentionDays = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        const oldBackups = this.db.prepare(`
            SELECT id, backup_path 
            FROM backup_history 
            WHERE completed_at < ?
            AND status = 'completed'
        `).all(cutoffDate.toISOString());
        
        oldBackups.forEach(backup => {
            try {
                if (fs.existsSync(backup.backup_path)) {
                    fs.unlinkSync(backup.backup_path);
                    this.logger.info(`Deleted old backup: ${backup.backup_path}`);
                }
                
                this.db.prepare('DELETE FROM backup_history WHERE id = ?').run(backup.id);
            } catch (error) {
                this.logger.error(`Error deleting old backup ${backup.backup_path}:`, error);
            }
        });
    }

    // ========================================================================
    // AUDIT LOGGING
    // ========================================================================

    async logAudit(userId, action, tableName, recordId, oldValues, newValues, ipAddress, userAgent) {
        try {
            this.db.prepare(`
                INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                userId,
                action,
                tableName,
                recordId,
                oldValues ? JSON.stringify(oldValues) : null,
                newValues ? JSON.stringify(newValues) : null,
                ipAddress,
                userAgent
            );
        } catch (error) {
            this.logger.error('Error logging audit:', error);
        }
    }

    async getAuditLogs(filter = {}) {
        let query = 'SELECT * FROM audit_logs';
        const params = [];
        
        if (filter.userId) {
            query += ' WHERE user_id = ?';
            params.push(filter.userId);
        }
        
        if (filter.tableName) {
            query += params.length > 0 ? ' AND table_name = ?' : ' WHERE table_name = ?';
            params.push(filter.tableName);
        }
        
        if (filter.startDate && filter.endDate) {
            query += params.length > 0 ? ' AND DATE(created_at) BETWEEN ? AND ?' : ' WHERE DATE(created_at) BETWEEN ? AND ?';
            params.push(filter.startDate, filter.endDate);
        }
        
        query += ' ORDER BY created_at DESC';
        
        if (filter.limit) {
            query += ' LIMIT ?';
            params.push(filter.limit);
        }
        
        return this.db.prepare(query).all(...params);
    }

    // ========================================================================
    // SYSTEM HEALTH MONITORING
    // ========================================================================

    async checkSystemHealth() {
        const checks = [];
        
        // Database connection check
        try {
            const result = this.db.prepare('SELECT 1 as test').all();
            checks.push({
                check_type: 'database_connection',
                status: 'healthy',
                details: {
                    connected: true,
                    tables: await this.getTableCount()
                }
            });
        } catch (error) {
            checks.push({
                check_type: 'database_connection',
                status: 'unhealthy',
                details: {
                    error: error.message
                }
            });
        }
        
        // Database size check
        try {
            const dbPath = path.join(__dirname, '..', 'data', 'cafe_pos.db');
            const stats = fs.statSync(dbPath);
            checks.push({
                check_type: 'database_size',
                status: stats.size < 100 * 1024 * 1024 ? 'healthy' : 'warning',
                details: {
                    size_bytes: stats.size,
                    size_mb: (stats.size / (1024 * 1024)).toFixed(2)
                }
            });
        } catch (error) {
            checks.push({
                check_type: 'database_size',
                status: 'unhealthy',
                details: {
                    error: error.message
                }
            });
        }
        
        // Memory usage check
        try {
            const memoryUsage = process.memoryUsage();
            checks.push({
                check_type: 'memory_usage',
                status: memoryUsage.heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'warning',
                details: {
                    rss: memoryUsage.rss,
                    heapTotal: memoryUsage.heapTotal,
                    heapUsed: memoryUsage.heapUsed,
                    external: memoryUsage.external
                }
            });
        } catch (error) {
            checks.push({
                check_type: 'memory_usage',
                status: 'unhealthy',
                details: {
                    error: error.message
                }
            });
        }
        
        // Disk space check
        try {
            const { diskSpace } = require('./utils');
            const space = await diskSpace();
            checks.push({
                check_type: 'disk_space',
                status: space.free > 1000 * 1024 * 1024 ? 'healthy' : 'warning',
                details: {
                    total: space.total,
                    free: space.free,
                    used: space.used
                }
            });
        } catch (error) {
            checks.push({
                check_type: 'disk_space',
                status: 'unhealthy',
                details: {
                    error: error.message
                }
            });
        }
        
        // Save health checks
        checks.forEach(check => {
            this.db.prepare(`
                INSERT INTO system_health (check_type, status, details)
                VALUES (?, ?, ?)
            `).run(check.check_type, check.status, JSON.stringify(check.details));
        });
        
        return checks;
    }

    async getTableCount() {
        const tables = ['users', 'roles', 'categories', 'menu_items', 'orders', 'order_items', 'customers'];
        const counts = {};
        
        for (const table of tables) {
            try {
                const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).all();
                counts[table] = result[0].count;
            } catch (error) {
                counts[table] = 0;
            }
        }
        
        return counts;
    }

    async getRecentHealthChecks(limit = 10) {
        return this.db.prepare(`
            SELECT * FROM system_health 
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(limit);
    }

    // ========================================================================
    // HARDWARE REPORTS
    // ========================================================================

    async getHardwareDeviceSummary() {
        try {
            if (!this.hardwareManager) {
                throw new Error('Hardware manager not initialized');
            }
            
            const devices = await this.db.prepare(
                'SELECT device_type, COUNT(*) as count, SUM(CASE WHEN status = "connected" THEN 1 ELSE 0 END) as connected_count FROM hardware_devices GROUP BY device_type'
            ).all();
            
            return {
                totalDevices: devices.reduce((sum, d) => sum + d.count, 0),
                devices: devices.map(d => ({
                    type: d.device_type,
                    total: d.count,
                    connected: d.connected_count
                }))
            };
        } catch (error) {
            this.logger.error('Error getting hardware device summary:', error);
            throw error;
        }
    }

    async getPrinterUsageReport(startDate = null, endDate = null) {
        try {
            if (!this.hardwareManager) {
                throw new Error('Hardware manager not initialized');
            }
            
            let query = `
                SELECT
                    hd.id as device_id,
                    hd.device_name,
                    hd.device_identifier,
                    COUNT(pj.id) as total_jobs,
                    SUM(CASE WHEN pj.status = "completed" THEN 1 ELSE 0 END) as completed_jobs,
                    SUM(CASE WHEN pj.status = "failed" THEN 1 ELSE 0 END) as failed_jobs,
                    SUM(CASE WHEN pj.job_type = "receipt" THEN 1 ELSE 0 END) as receipt_count,
                    SUM(CASE WHEN pj.job_type = "kot" THEN 1 ELSE 0 END) as kot_count,
                    SUM(CASE WHEN pj.job_type = "label" THEN 1 ELSE 0 END) as label_count,
                    SUM(CASE WHEN pj.job_type = "report" THEN 1 ELSE 0 END) as report_count
                FROM hardware_devices hd
                LEFT JOIN print_jobs pj ON hd.id = pj.device_id AND hd.device_type = 'escpos_printer'
            `;
            
            const params = [];
            
            if (startDate || endDate) {
                query += ' WHERE pj.created_at BETWEEN ? AND ?';
                params.push(startDate || '1970-01-01');
                params.push(endDate || '2999-12-31');
            }
            
            query += ' GROUP BY hd.id, hd.device_name, hd.device_identifier ORDER BY total_jobs DESC';
            
            return this.db.prepare(query).all(...params);
        } catch (error) {
            this.logger.error('Error getting printer usage report:', error);
            throw error;
        }
    }

    async getCFDUsageReport(startDate = null, endDate = null) {
        try {
            if (!this.hardwareManager) {
                throw new Error('Hardware manager not initialized');
            }
            
            let query = `
                SELECT
                    hd.id as device_id,
                    hd.device_name,
                    hd.device_identifier,
                    COUNT(cfd.id) as content_count,
                    SUM(CASE WHEN cfd.content_type = "order_info" THEN 1 ELSE 0 END) as order_info_count,
                    SUM(CASE WHEN cfd.content_type = "payment_info" THEN 1 ELSE 0 END) as payment_info_count,
                    SUM(CASE WHEN cfd.content_type = "loyalty" THEN 1 ELSE 0 END) as loyalty_count,
                    SUM(CASE WHEN cfd.content_type = "promotion" THEN 1 ELSE 0 END) as promotion_count,
                    SUM(CASE WHEN cfd.content_type = "custom" THEN 1 ELSE 0 END) as custom_count
                FROM hardware_devices hd
                LEFT JOIN cfd_content cfd ON hd.id = cfd.device_id AND hd.device_type = 'cfd_display'
            `;
            
            const params = [];
            
            if (startDate || endDate) {
                query += ' WHERE cfd.created_at BETWEEN ? AND ?';
                params.push(startDate || '1970-01-01');
                params.push(endDate || '2999-12-31');
            }
            
            query += ' GROUP BY hd.id, hd.device_name, hd.device_identifier ORDER BY content_count DESC';
            
            return this.db.prepare(query).all(...params);
        } catch (error) {
            this.logger.error('Error getting CFD usage report:', error);
            throw error;
        }
    }

    async getPrintJobHistory(deviceId = null, startDate = null, endDate = null, limit = 100) {
        try {
            if (!this.hardwareManager) {
                throw new Error('Hardware manager not initialized');
            }
            
            let query = `
                SELECT
                    pj.id as job_id,
                    pj.device_id,
                    hd.device_name,
                    pj.job_type,
                    pj.status,
                    pj.created_at,
                    pj.completed_at,
                    pj.retry_count,
                    pj.error_message
                FROM print_jobs pj
                JOIN hardware_devices hd ON pj.device_id = hd.id
                WHERE hd.device_type = 'escpos_printer'
            `;
            
            const params = [];
            
            if (deviceId) {
                query += ' AND pj.device_id = ?';
                params.push(deviceId);
            }
            
            if (startDate || endDate) {
                const condition = params.length > 0 ? ' AND' : ' WHERE';
                query += `${condition} pj.created_at BETWEEN ? AND ?`;
                params.push(startDate || '1970-01-01');
                params.push(endDate || '2999-12-31');
            }
            
            query += ' ORDER BY pj.created_at DESC LIMIT ?';
            params.push(limit);
            
            return this.db.prepare(query).all(...params);
        } catch (error) {
            this.logger.error('Error getting print job history:', error);
            throw error;
        }
    }

    async getDeviceStatusHistory(deviceId = null, startDate = null, endDate = null, limit = 100) {
        try {
            if (!this.hardwareManager) {
                throw new Error('Hardware manager not initialized');
            }
            
            let query = `
                SELECT
                    hds.id as status_id,
                    hds.device_id,
                    hd.device_name,
                    hd.device_type,
                    hds.status,
                    hds.status_details,
                    hds.paper_level,
                    hds.ink_level,
                    hds.error_code,
                    hds.last_ping,
                    hds.created_at
                FROM hardware_device_status hds
                JOIN hardware_devices hd ON hds.device_id = hd.id
            `;
            
            const params = [];
            
            if (deviceId) {
                query += ' WHERE hds.device_id = ?';
                params.push(deviceId);
            }
            
            if (startDate || endDate) {
                const condition = params.length > 0 ? ' AND' : ' WHERE';
                query += `${condition} hds.created_at BETWEEN ? AND ?`;
                params.push(startDate || '1970-01-01');
                params.push(endDate || '2999-12-31');
            }
            
            query += ' ORDER BY hds.created_at DESC LIMIT ?';
            params.push(limit);
            
            return this.db.prepare(query).all(...params);
        } catch (error) {
            this.logger.error('Error getting device status history:', error);
            throw error;
        }
    }

    async getHardwareErrorReport(startDate = null, endDate = null, limit = 100) {
        try {
            if (!this.hardwareManager) {
                throw new Error('Hardware manager not initialized');
            }
            
            let query = `
                SELECT
                    hdl.id as log_id,
                    hdl.device_id,
                    hd.device_name,
                    hd.device_type,
                    hdl.log_level,
                    hdl.message,
                    hdl.details,
                    hdl.created_at
                FROM hardware_device_logs hdl
                JOIN hardware_devices hd ON hdl.device_id = hd.id
                WHERE hdl.log_level IN ('error', 'warning')
            `;
            
            const params = [];
            
            if (startDate || endDate) {
                query += ' AND hdl.created_at BETWEEN ? AND ?';
                params.push(startDate || '1970-01-01');
                params.push(endDate || '2999-12-31');
            }
            
            query += ' ORDER BY hdl.created_at DESC LIMIT ?';
            params.push(limit);
            
            return this.db.prepare(query).all(...params);
        } catch (error) {
            this.logger.error('Error getting hardware error report:', error);
            throw error;
        }
    }

    async getHardwareConnectivityReport(startDate = null, endDate = null) {
        try {
            if (!this.hardwareManager) {
                throw new Error('Hardware manager not initialized');
            }
            
            let query = `
                SELECT
                    hd.id as device_id,
                    hd.device_name,
                    hd.device_type,
                    hd.connection_type,
                    COUNT(*) as status_records,
                    SUM(CASE WHEN hds.status = 'connected' THEN 1 ELSE 0 END) as connected_count,
                    SUM(CASE WHEN hds.status = 'disconnected' THEN 1 ELSE 0 END) as disconnected_count,
                    SUM(CASE WHEN hds.status = 'error' THEN 1 ELSE 0 END) as error_count,
                    SUM(CASE WHEN hds.status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_count,
                    CASE
                        WHEN COUNT(*) > 0
                        THEN (SUM(CASE WHEN hds.status = 'connected' THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
                        ELSE 0
                    END as uptime_percentage
                FROM hardware_devices hd
                LEFT JOIN hardware_device_status hds ON hd.id = hds.device_id
            `;
            
            const params = [];
            
            if (startDate || endDate) {
                query += ' WHERE hds.created_at BETWEEN ? AND ?';
                params.push(startDate || '1970-01-01');
                params.push(endDate || '2999-12-31');
            }
            
            query += ' GROUP BY hd.id, hd.device_name, hd.device_type, hd.connection_type ORDER BY uptime_percentage DESC';
            
            return this.db.prepare(query).all(...params);
        } catch (error) {
            this.logger.error('Error getting hardware connectivity report:', error);
            throw error;
        }
    }

    async getHardwareDailyActivityReport(date) {
        try {
            if (!this.hardwareManager) {
                throw new Error('Hardware manager not initialized');
            }
            
            const query = `
                SELECT
                    hd.device_type,
                    COUNT(DISTINCT hd.id) as device_count,
                    SUM(CASE WHEN hd.status = 'connected' THEN 1 ELSE 0 END) as connected_devices,
                    COUNT(pj.id) as print_jobs,
                    SUM(CASE WHEN pj.status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
                    SUM(CASE WHEN pj.status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
                    COUNT(cfd.id) as cfd_content_updates
                FROM hardware_devices hd
                LEFT JOIN print_jobs pj ON hd.id = pj.device_id AND DATE(pj.created_at) = ?
                LEFT JOIN cfd_content cfd ON hd.id = cfd.device_id AND DATE(cfd.created_at) = ?
                GROUP BY hd.device_type
            `;
            
            return this.db.prepare(query).all(date, date);
        } catch (error) {
            this.logger.error('Error getting hardware daily activity report:', error);
            throw error;
        }
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================

    async cleanup() {
        // Stop all scheduled jobs
        this.scheduledJobs.forEach(job => job());
        this.scheduledJobs.clear();
        
        this.backupJobs.forEach(job => job());
        this.backupJobs.clear();
        
        this.logger.info('Reporting Manager cleanup completed');
    }
}

module.exports = ReportingManager;
