// Enterprise API Endpoints for Cafe POS
// Provides enhanced reporting, multi-location support, and advanced features

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const ReportingManager = require('./reporting-manager');

// Initialize reporting manager
let reportingManager = null;

// Middleware to initialize reporting manager
router.use(async (req, res, next) => {
    try {
        if (!reportingManager) {
            const db = require('./database');
            const logger = require('./logger');
            reportingManager = new ReportingManager(db.getDatabase(), logger);
            await reportingManager.init();
        }
        next();
    } catch (error) {
        next(error);
    }
});

// Authentication middleware
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cafe-pos-secret');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
};

// Authorization middleware
const authorize = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const db = require('./database');
        const userPermissions = db.user.getPermissions(req.user.id);
        
        if (!userPermissions.includes(permission) && !userPermissions.includes('manage_all')) {
            return res.status(403).json({ error: 'Forbidden - Insufficient permissions' });
        }
        
        next();
    };
};

// ========================================================================
// LOCATION MANAGEMENT
// ========================================================================

// Get all locations
router.get('/api/locations', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const db = require('./database');
        const locations = await db.query('SELECT * FROM locations WHERE is_active = 1 ORDER BY name').rows;
        res.json(locations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get location by ID
router.get('/api/locations/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const db = require('./database');
        const location = await db.query('SELECT * FROM locations WHERE id = ?', [req.params.id]).rows[0];
        if (!location) {
            return res.status(404).json({ error: 'Location not found' });
        }
        res.json(location);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new location
router.post('/api/locations', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { name, address, city, state, postal_code, phone } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        const db = require('./database');
        const result = await db.query(
            'INSERT INTO locations (name, address, city, state, postal_code, phone) VALUES (?, ?, ?, ?, ?, ?)',
            [name, address, city, state, postal_code, phone]
        );
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'create',
            'locations',
            result.lastInsertRowid,
            null,
            { name, address, city, state, postal_code, phone },
            req.ip,
            req.headers['user-agent']
        );
        
        res.status(201).json({ id: result.lastInsertRowid, message: 'Location created successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update location
router.put('/api/locations/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { name, address, city, state, postal_code, phone } = req.body;
        
        const db = require('./database');
        const oldLocation = await db.query('SELECT * FROM locations WHERE id = ?', [req.params.id]).rows[0];
        
        if (!oldLocation) {
            return res.status(404).json({ error: 'Location not found' });
        }
        
        await db.query(
            'UPDATE locations SET name = ?, address = ?, city = ?, state = ?, postal_code = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [name, address, city, state, postal_code, phone, req.params.id]
        );
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'update',
            'locations',
            req.params.id,
            oldLocation,
            { name, address, city, state, postal_code, phone },
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Location updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete location (soft delete)
router.delete('/api/locations/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const db = require('./database');
        const location = await db.query('SELECT * FROM locations WHERE id = ?', [req.params.id]).rows[0];
        
        if (!location) {
            return res.status(404).json({ error: 'Location not found' });
        }
        
        await db.query('UPDATE locations SET is_active = 0 WHERE id = ?', [req.params.id]);
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'delete',
            'locations',
            req.params.id,
            location,
            null,
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Location deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================================================
// ENHANCED REPORTING
// ========================================================================

// Get sales report with location filter
router.get('/api/reports/sales', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, locationId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        
        const salesReport = await reportingManager.getSalesReport(startDate, endDate, locationId);
        res.json(salesReport);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get daily summary with location filter
router.get('/api/reports/daily-summary', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { date, locationId } = req.query;
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }
        
        const summary = await reportingManager.getDailySummary(date, locationId);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get top selling items with location filter
router.get('/api/reports/top-items', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, limit, locationId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        
        const topItems = await reportingManager.getTopSellingItems(
            startDate,
            endDate,
            limit || 10,
            locationId
        );
        res.json(topItems);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get tax report with location filter
router.get('/api/reports/tax', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, locationId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        
        const taxReport = await reportingManager.getTaxReport(startDate, endDate, locationId);
        res.json(taxReport);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get payment breakdown with location filter
router.get('/api/reports/payment-breakdown', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, locationId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        
        const paymentBreakdown = await reportingManager.getPaymentBreakdown(startDate, endDate, locationId);
        res.json(paymentBreakdown);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get hourly sales report
router.get('/api/reports/hourly-sales', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { date, locationId } = req.query;
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }
        
        const hourlySales = await reportingManager.getHourlySalesReport(date, locationId);
        res.json(hourlySales);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get customer sales report
router.get('/api/reports/customer-sales', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, locationId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        
        const customerSales = await reportingManager.getCustomerSalesReport(startDate, endDate, locationId);
        res.json(customerSales);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get inventory turnover report
router.get('/api/reports/inventory-turnover', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { startDate, endDate, locationId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        
        const inventoryTurnover = await reportingManager.getInventoryTurnoverReport(startDate, endDate, locationId);
        res.json(inventoryTurnover);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate chart data
router.get('/api/reports/charts/:type', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { type } = req.params;
        const { startDate, endDate, locationId } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        
        const chartData = await reportingManager.generateChartData(type, startDate, endDate, locationId);
        res.json(chartData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export report to CSV
router.get('/api/reports/export/csv', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { type, startDate, endDate, locationId } = req.query;
        
        if (!type || !startDate || !endDate) {
            return res.status(400).json({ error: 'Type, start date, and end date are required' });
        }
        
        let data = [];
        
        switch (type) {
            case 'sales':
                data = await reportingManager.getSalesReport(startDate, endDate, locationId);
                break;
            case 'top-items':
                data = await reportingManager.getTopSellingItems(startDate, endDate, 10, locationId);
                break;
            case 'tax':
                data = await reportingManager.getTaxReport(startDate, endDate, locationId);
                break;
            case 'payment-breakdown':
                data = await reportingManager.getPaymentBreakdown(startDate, endDate, locationId);
                break;
            default:
                return res.status(400).json({ error: 'Invalid report type' });
        }
        
        const filename = `report_${type}_${new Date().toISOString().split('T')[0]}.csv`;
        const filePath = await reportingManager.exportToCSV(data, filename);
        
        res.download(filePath, filename, (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export report to PDF
router.get('/api/reports/export/pdf', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { type, startDate, endDate, locationId, title } = req.query;
        
        if (!type || !startDate || !endDate) {
            return res.status(400).json({ error: 'Type, start date, and end date are required' });
        }
        
        let data = [];
        let summary = {};
        
        switch (type) {
            case 'sales':
                data = await reportingManager.getSalesReport(startDate, endDate, locationId);
                const salesSummary = await reportingManager.getDailySummary(startDate, locationId);
                summary = salesSummary || {};
                break;
            case 'top-items':
                data = await reportingManager.getTopSellingItems(startDate, endDate, 10, locationId);
                break;
            case 'tax':
                data = await reportingManager.getTaxReport(startDate, endDate, locationId);
                break;
            case 'payment-breakdown':
                data = await reportingManager.getPaymentBreakdown(startDate, endDate, locationId);
                break;
            default:
                return res.status(400).json({ error: 'Invalid report type' });
        }
        
        const filename = `report_${type}_${new Date().toISOString().split('T')[0]}.pdf`;
        const filePath = await reportingManager.exportToPDF(data, filename, {
            title: title || `${type.replace('-', ' ')} Report`,
            subtitle: `Period: ${startDate} to ${endDate}`,
            summary: summary
        });
        
        res.download(filePath, filename, (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================================================
// SCHEDULED REPORTS
// ========================================================================

// Get all scheduled reports
router.get('/api/scheduled-reports', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const reports = await reportingManager.getScheduledReports();
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get scheduled report by ID
router.get('/api/scheduled-reports/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const report = await reportingManager.getScheduledReport(req.params.id);
        if (!report) {
            return res.status(404).json({ error: 'Scheduled report not found' });
        }
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create scheduled report
router.post('/api/scheduled-reports', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { name, reportType, scheduleCron, timeZone, emailTo, emailCc, emailBcc, format } = req.body;
        
        if (!name || !reportType || !scheduleCron) {
            return res.status(400).json({ error: 'Name, report type, and schedule are required' });
        }
        
        const reportId = await reportingManager.createScheduledReport({
            name,
            reportType,
            scheduleCron,
            timeZone,
            emailTo,
            emailCc,
            emailBcc,
            format,
            createdBy: req.user.id
        });
        
        // Start the scheduled report
        const report = await reportingManager.getScheduledReport(reportId);
        await reportingManager.startScheduledReport(report);
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'create',
            'scheduled_reports',
            reportId,
            null,
            { name, reportType, scheduleCron, timeZone, emailTo, emailCc, emailBcc, format },
            req.ip,
            req.headers['user-agent']
        );
        
        res.status(201).json({ id: reportId, message: 'Scheduled report created successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update scheduled report
router.put('/api/scheduled-reports/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { name, reportType, scheduleCron, timeZone, emailTo, emailCc, emailBcc, format, isActive } = req.body;
        
        const oldReport = await reportingManager.getScheduledReport(req.params.id);
        if (!oldReport) {
            return res.status(404).json({ error: 'Scheduled report not found' });
        }
        
        await reportingManager.updateScheduledReport(req.params.id, {
            name,
            reportType,
            scheduleCron,
            timeZone,
            emailTo,
            emailCc,
            emailBcc,
            format,
            isActive
        });
        
        // Restart the scheduled report if it's active
        if (isActive) {
            const report = await reportingManager.getScheduledReport(req.params.id);
            await reportingManager.startScheduledReport(report);
        }
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'update',
            'scheduled_reports',
            req.params.id,
            oldReport,
            { name, reportType, scheduleCron, timeZone, emailTo, emailCc, emailBcc, format, isActive },
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Scheduled report updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete scheduled report
router.delete('/api/scheduled-reports/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const report = await reportingManager.getScheduledReport(req.params.id);
        if (!report) {
            return res.status(404).json({ error: 'Scheduled report not found' });
        }
        
        await reportingManager.deleteScheduledReport(req.params.id);
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'delete',
            'scheduled_reports',
            req.params.id,
            report,
            null,
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Scheduled report deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================================================
// CUSTOM REPORT BUILDER
// ========================================================================

// Get all report templates
router.get('/api/report-templates', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const templates = await reportingManager.getReportTemplates(req.user.id);
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get report template by ID
router.get('/api/report-templates/:id', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const template = await reportingManager.getReportTemplate(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Report template not found' });
        }
        res.json(template);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create report template
router.post('/api/report-templates', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { name, description, querySql, columns, filters, isPublic } = req.body;
        
        if (!name || !querySql || !columns) {
            return res.status(400).json({ error: 'Name, query SQL, and columns are required' });
        }
        
        const templateId = await reportingManager.createReportTemplate({
            name,
            description,
            querySql,
            columns,
            filters,
            isPublic,
            createdBy: req.user.id
        });
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'create',
            'report_templates',
            templateId,
            null,
            { name, description, querySql, columns, filters, isPublic },
            req.ip,
            req.headers['user-agent']
        );
        
        res.status(201).json({ id: templateId, message: 'Report template created successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update report template
router.put('/api/report-templates/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { name, description, querySql, columns, filters, isPublic } = req.body;
        
        const oldTemplate = await reportingManager.getReportTemplate(req.params.id);
        if (!oldTemplate) {
            return res.status(404).json({ error: 'Report template not found' });
        }
        
        await reportingManager.updateReportTemplate(req.params.id, {
            name,
            description,
            querySql,
            columns,
            filters,
            isPublic
        });
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'update',
            'report_templates',
            req.params.id,
            oldTemplate,
            { name, description, querySql, columns, filters, isPublic },
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Report template updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete report template
router.delete('/api/report-templates/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const template = await reportingManager.getReportTemplate(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Report template not found' });
        }
        
        await reportingManager.deleteReportTemplate(req.params.id);
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'delete',
            'report_templates',
            req.params.id,
            template,
            null,
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Report template deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Execute custom report
router.post('/api/report-templates/:id/execute', authenticate, authorize('view_reports'), async (req, res) => {
    try {
        const { params } = req.body;
        const result = await reportingManager.executeCustomReport(req.params.id, params || {});
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================================================
// BACKUP SCHEDULING
// ========================================================================

// Get all backup schedules
router.get('/api/backup-schedules', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const schedules = await reportingManager.getBackupSchedules();
        res.json(schedules);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get backup schedule by ID
router.get('/api/backup-schedules/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const schedule = await reportingManager.getBackupSchedule(req.params.id);
        if (!schedule) {
            return res.status(404).json({ error: 'Backup schedule not found' });
        }
        res.json(schedule);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create backup schedule
router.post('/api/backup-schedules', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { name, scheduleCron, timeZone, retentionDays, backupLocation } = req.body;
        
        if (!name || !scheduleCron) {
            return res.status(400).json({ error: 'Name and schedule are required' });
        }
        
        const scheduleId = await reportingManager.createBackupSchedule({
            name,
            scheduleCron,
            timeZone,
            retentionDays,
            backupLocation,
            createdBy: req.user.id
        });
        
        // Start the backup schedule
        const schedule = await reportingManager.getBackupSchedule(scheduleId);
        await reportingManager.startBackupSchedule(schedule);
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'create',
            'backup_schedules',
            scheduleId,
            null,
            { name, scheduleCron, timeZone, retentionDays, backupLocation },
            req.ip,
            req.headers['user-agent']
        );
        
        res.status(201).json({ id: scheduleId, message: 'Backup schedule created successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update backup schedule
router.put('/api/backup-schedules/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { name, scheduleCron, timeZone, retentionDays, backupLocation, isActive } = req.body;
        
        const oldSchedule = await reportingManager.getBackupSchedule(req.params.id);
        if (!oldSchedule) {
            return res.status(404).json({ error: 'Backup schedule not found' });
        }
        
        await reportingManager.updateBackupSchedule(req.params.id, {
            name,
            scheduleCron,
            timeZone,
            retentionDays,
            backupLocation,
            isActive
        });
        
        // Restart the backup schedule if it's active
        if (isActive) {
            const schedule = await reportingManager.getBackupSchedule(req.params.id);
            await reportingManager.startBackupSchedule(schedule);
        }
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'update',
            'backup_schedules',
            req.params.id,
            oldSchedule,
            { name, scheduleCron, timeZone, retentionDays, backupLocation, isActive },
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Backup schedule updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete backup schedule
router.delete('/api/backup-schedules/:id', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const schedule = await reportingManager.getBackupSchedule(req.params.id);
        if (!schedule) {
            return res.status(404).json({ error: 'Backup schedule not found' });
        }
        
        await reportingManager.deleteBackupSchedule(req.params.id);
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'delete',
            'backup_schedules',
            req.params.id,
            schedule,
            null,
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Backup schedule deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get backup history
router.get('/api/backup-history', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const db = require('./database');
        const history = await db.query('SELECT * FROM backup_history ORDER BY started_at DESC').rows;
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================================================
// AUDIT LOGGING
// ========================================================================

// Get audit logs
router.get('/api/audit-logs', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { userId, tableName, startDate, endDate, limit } = req.query;
        
        const filter = {};
        if (userId) filter.userId = parseInt(userId);
        if (tableName) filter.tableName = tableName;
        if (startDate && endDate) {
            filter.startDate = startDate;
            filter.endDate = endDate;
        }
        if (limit) filter.limit = parseInt(limit);
        
        const logs = await reportingManager.getAuditLogs(filter);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================================================
// SYSTEM HEALTH MONITORING
// ========================================================================

// Check system health
router.get('/api/system-health', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const healthChecks = await reportingManager.checkSystemHealth();
        res.json(healthChecks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get recent health checks
router.get('/api/system-health/recent', authenticate, authorize('manage_settings'), async (req, res) => {
    try {
        const { limit } = req.query;
        const healthChecks = await reportingManager.getRecentHealthChecks(limit || 10);
        res.json(healthChecks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================================================
// ADVANCED USER PERMISSIONS
// ========================================================================

// Get user permissions
router.get('/api/users/:id/permissions', authenticate, authorize('manage_users'), async (req, res) => {
    try {
        const db = require('./database');
        const permissions = db.user.getPermissions(req.params.id);
        res.json({ permissions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user permissions
router.put('/api/users/:id/permissions', authenticate, authorize('manage_users'), async (req, res) => {
    try {
        const { permissions } = req.body;
        
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ error: 'Permissions must be an array' });
        }
        
        const db = require('./database');
        const oldUser = await db.user.getById(req.params.id);
        
        if (!oldUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await db.user.update(req.params.id, { permissions });
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'update',
            'users',
            req.params.id,
            oldUser,
            { permissions },
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'User permissions updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all roles with permissions
router.get('/api/roles', authenticate, authorize('manage_users'), async (req, res) => {
    try {
        const db = require('./database');
        const roles = await db.query('SELECT * FROM roles WHERE is_active = 1 ORDER BY name').rows;
        res.json(roles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new role
router.post('/api/roles', authenticate, authorize('manage_users'), async (req, res) => {
    try {
        const { name, description, permissions } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        const db = require('./database');
        const result = await db.query(
            'INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?)',
            [name, description || '', JSON.stringify(permissions || [])]
        );
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'create',
            'roles',
            result.lastInsertRowid,
            null,
            { name, description, permissions },
            req.ip,
            req.headers['user-agent']
        );
        
        res.status(201).json({ id: result.lastInsertRowid, message: 'Role created successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update role
router.put('/api/roles/:id', authenticate, authorize('manage_users'), async (req, res) => {
    try {
        const { name, description, permissions } = req.body;
        
        const db = require('./database');
        const oldRole = await db.query('SELECT * FROM roles WHERE id = ?', [req.params.id]).rows[0];
        
        if (!oldRole) {
            return res.status(404).json({ error: 'Role not found' });
        }
        
        await db.query(
            'UPDATE roles SET name = ?, description = ?, permissions = ? WHERE id = ?',
            [name, description || '', JSON.stringify(permissions || []), req.params.id]
        );
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'update',
            'roles',
            req.params.id,
            oldRole,
            { name, description, permissions },
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Role updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete role
router.delete('/api/roles/:id', authenticate, authorize('manage_users'), async (req, res) => {
    try {
        const db = require('./database');
        const role = await db.query('SELECT * FROM roles WHERE id = ?', [req.params.id]).rows[0];
        
        if (!role) {
            return res.status(404).json({ error: 'Role not found' });
        }
        
        await db.query('UPDATE roles SET is_active = 0 WHERE id = ?', [req.params.id]);
        
        // Log audit
        await reportingManager.logAudit(
            req.user.id,
            'delete',
            'roles',
            req.params.id,
            role,
            null,
            req.ip,
            req.headers['user-agent']
        );
        
        res.json({ message: 'Role deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
