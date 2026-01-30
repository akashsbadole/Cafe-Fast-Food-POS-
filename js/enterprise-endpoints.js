// Enterprise API Endpoints for Cafe POS
// Provides enhanced reporting, multi-location support, and advanced features

module.exports = (reportingManager) => {
    const express = require('express');
    const router = express.Router();
    const jwt = require('jsonwebtoken');
    const logger = require('./logger');

    // Authentication middleware
    const authenticate = (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }

        try {
            // Use the same JWT_SECRET as server.js
            const JWT_SECRET = process.env.JWT_SECRET || require('./security-middleware').SECURITY_CONFIG.jwtSecret;
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            logger.error('Authentication error:', error);
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }
    };

    // Manager PIN verification middleware
    const verifyManagerPin = async (req, res, next) => {
        const { managerPin } = req.body;
        if (!managerPin) {
            return res.status(400).json({ error: 'Manager PIN is required' });
        }

        try {
            const db = require('./database');
            const managerPinConfig = await db.query('SELECT * FROM settings WHERE key = ?', ['manager_pin']).rows[0];

            if (!managerPinConfig || managerPinConfig.value !== managerPin) {
                return res.status(403).json({ error: 'Invalid manager PIN' });
            }

            next();
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    };

    // Authorization middleware
    const authorize = (actionOrPermission, subject) => {
        return async (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            try {
                // Admin role bypasses all permission checks
                if (req.user.role === 'admin') {
                    return next();
                }

                // If subject is provided, use CASL-style authorization
                if (subject) {
                    const { defineAbilityFor } = require('./abilities');
                    const ability = defineAbilityFor(req.user);

                    if (ability.can(actionOrPermission, subject)) {
                        return next();
                    } else {
                        return res.status(403).json({ error: `Forbidden - Cannot ${actionOrPermission} ${subject}` });
                    }
                }

                // Legacy permission string check
                const db = require('./database');
                const userPermissions = await db.user.getPermissions(req.user.id);

                if (!userPermissions.includes(actionOrPermission) && !userPermissions.includes('manage_all')) {
                    return res.status(403).json({ error: 'Forbidden - Insufficient permissions' });
                }

                next();
            } catch (error) {
                logger.error('Authorization error:', error);
                return res.status(500).json({ error: 'Authorization check failed' });
            }
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
    // TAX ENGINE MANAGEMENT
    // ========================================================================

    // Initialize TaxEngine
    let taxEngine = null;

    // Middleware to initialize TaxEngine
    router.use('/api/tax', async (req, res, next) => {
        try {
            if (!taxEngine) {
                const TaxEngine = require('./tax-engine');
                taxEngine = TaxEngine;
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get tax configuration
    router.get('/api/tax/configuration', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { locationId } = req.query;
            const config = await taxEngine.getTaxConfiguration(locationId || 1);
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update tax configuration
    router.put('/api/tax/configuration', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { locationId, defaultTaxType, displayPricesInclusive, showTaxBreakdown } = req.body;

            if (!locationId) {
                return res.status(400).json({ error: 'Location ID is required' });
            }

            const db = require('./database');

            // Get old configuration
            const oldConfig = await db.query(
                'SELECT * FROM tax_configurations WHERE location_id = ?',
                [locationId]
            ).rows[0];

            // Update or insert configuration
            if (oldConfig) {
                await db.query(
                    'UPDATE tax_configurations SET ' +
                    'default_tax_type = ?, display_prices_inclusive = ?, show_tax_breakdown = ?, updated_at = CURRENT_TIMESTAMP ' +
                    'WHERE location_id = ?',
                    [defaultTaxType || 'exclusive', displayPricesInclusive || 0, showTaxBreakdown || 1, locationId]
                );
            } else {
                await db.query(
                    'INSERT INTO tax_configurations (location_id, default_tax_type, display_prices_inclusive, show_tax_breakdown) ' +
                    'VALUES (?, ?, ?, ?)',
                    [locationId, defaultTaxType || 'exclusive', displayPricesInclusive || 0, showTaxBreakdown || 1]
                );
            }

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                oldConfig ? 'update' : 'create',
                'tax_configurations',
                oldConfig ? oldConfig.id : null,
                oldConfig || null,
                { locationId, defaultTaxType, displayPricesInclusive, showTaxBreakdown },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Tax configuration updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all tax rates
    router.get('/api/tax/rates', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { locationId, activeOnly } = req.query;
            const db = require('./database');

            let query = 'SELECT * FROM tax_rates';
            const params = [];

            if (activeOnly === 'true') {
                query += ' WHERE is_active = 1';
            }

            if (locationId) {
                if (activeOnly === 'true') {
                    query += ' AND location_id = ?';
                } else {
                    query += ' WHERE location_id = ?';
                }
                params.push(locationId);
            }

            query += ' ORDER BY id';

            const rates = await db.query(query, params).rows;
            res.json(rates);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get tax rate by ID
    router.get('/api/tax/rates/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const rate = await db.query('SELECT * FROM tax_rates WHERE id = ?', [req.params.id]).rows[0];

            if (!rate) {
                return res.status(404).json({ error: 'Tax rate not found' });
            }

            res.json(rate);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new tax rate
    router.post('/api/tax/rates', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, rate, taxType, isActive, locationId } = req.body;

            if (!name || rate === undefined) {
                return res.status(400).json({ error: 'Name and rate are required' });
            }

            const db = require('./database');
            const result = await db.query(
                'INSERT INTO tax_rates (name, rate, tax_type, is_active, location_id) VALUES (?, ?, ?, ?, ?)',
                [name, rate, taxType || 'exclusive', isActive !== false ? 1 : 0, locationId || 1]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'tax_rates',
                result.lastInsertRowid,
                null,
                { name, rate, taxType, isActive, locationId },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ id: result.lastInsertRowid, message: 'Tax rate created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update tax rate
    router.put('/api/tax/rates/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, rate, taxType, isActive, locationId } = req.body;

            const db = require('./database');
            const oldRate = await db.query('SELECT * FROM tax_rates WHERE id = ?', [req.params.id]).rows[0];

            if (!oldRate) {
                return res.status(404).json({ error: 'Tax rate not found' });
            }

            await db.query(
                'UPDATE tax_rates SET name = ?, rate = ?, tax_type = ?, is_active = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [name || oldRate.name, rate || oldRate.rate, taxType || oldRate.tax_type, isActive !== undefined ? (isActive ? 1 : 0) : oldRate.is_active, locationId || oldRate.location_id, req.params.id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'tax_rates',
                req.params.id,
                oldRate,
                { name, rate, taxType, isActive, locationId },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Tax rate updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete tax rate (soft delete)
    router.delete('/api/tax/rates/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const rate = await db.query('SELECT * FROM tax_rates WHERE id = ?', [req.params.id]).rows[0];

            if (!rate) {
                return res.status(404).json({ error: 'Tax rate not found' });
            }

            await db.query('UPDATE tax_rates SET is_active = 0 WHERE id = ?', [req.params.id]);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'tax_rates',
                req.params.id,
                rate,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Tax rate deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Calculate tax amount
    router.post('/api/tax/calculate', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { amount, taxRate, taxType } = req.body;

            if (amount === undefined || taxRate === undefined) {
                return res.status(400).json({ error: 'Amount and tax rate are required' });
            }

            const taxAmount = taxEngine.calculateTax(amount, taxRate, taxType || 'exclusive');
            const total = amount + taxAmount;

            res.json({
                amount,
                taxRate,
                taxType: taxType || 'exclusive',
                taxAmount,
                total
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get tax breakdown
    router.post('/api/tax/breakdown', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { subtotal, taxAmount, taxRate, taxType, discount } = req.body;

            if (subtotal === undefined || taxRate === undefined) {
                return res.status(400).json({ error: 'Subtotal and tax rate are required' });
            }

            const breakdown = taxEngine.getTaxBreakdown(
                subtotal,
                taxAmount || 0,
                taxRate,
                taxType || 'exclusive',
                discount || 0
            );

            res.json(breakdown);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get tax summary report
    router.get('/api/reports/tax-summary', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, locationId } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const summary = await reportingManager.getTaxSummaryByLocation(startDate, endDate);
            res.json(summary);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get tax breakdown report
    router.get('/api/reports/tax-breakdown', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, locationId } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const breakdown = await reportingManager.getTaxBreakdownReport(startDate, endDate, locationId);
            res.json(breakdown);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get tax compliance report
    router.get('/api/reports/tax-compliance', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, locationId } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const compliance = await reportingManager.getTaxComplianceReport(startDate, endDate, locationId);
            res.json(compliance);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Export tax report to CSV
    router.get('/api/reports/tax/export/csv', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { type, startDate, endDate, locationId } = req.query;

            if (!type || !startDate || !endDate) {
                return res.status(400).json({ error: 'Type, start date, and end date are required' });
            }

            let data = [];

            switch (type) {
                case 'tax-summary':
                    data = await reportingManager.getTaxSummaryByLocation(startDate, endDate);
                    break;
                case 'tax-breakdown':
                    data = await reportingManager.getTaxBreakdownReport(startDate, endDate, locationId);
                    break;
                case 'tax-compliance':
                    data = await reportingManager.getTaxComplianceReport(startDate, endDate, locationId);
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid report type' });
            }

            const filename = `tax_report_${type}_${new Date().toISOString().split('T')[0]}.csv`;
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

    // Export tax report to PDF
    router.get('/api/reports/tax/export/pdf', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { type, startDate, endDate, locationId, title } = req.query;

            if (!type || !startDate || !endDate) {
                return res.status(400).json({ error: 'Type, start date, and end date are required' });
            }

            let data = [];
            let summary = {};

            switch (type) {
                case 'tax-summary':
                    data = await reportingManager.getTaxSummaryByLocation(startDate, endDate);
                    break;
                case 'tax-breakdown':
                    data = await reportingManager.getTaxBreakdownReport(startDate, endDate, locationId);
                    break;
                case 'tax-compliance':
                    data = await reportingManager.getTaxComplianceReport(startDate, endDate, locationId);
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid report type' });
            }

            const filename = `tax_report_${type}_${new Date().toISOString().split('T')[0]}.pdf`;
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
    // CASH DRAWER MANAGEMENT
    // ========================================================================

    // Initialize CashDrawerManager
    let cashDrawerManager = null;
    let cashReconciliationManager = null;

    // Middleware to initialize cash drawer managers
    router.use('/api/cash-drawers', async (req, res, next) => {
        try {
            if (!cashDrawerManager) {
                const CashDrawerManager = require('./cash-drawer-manager');
                const CashReconciliationManager = require('./cash-reconciliation-manager');
                const db = require('./database');
                const logger = require('./logger');

                cashDrawerManager = new CashDrawerManager(db.getDatabase(), logger);
                cashReconciliationManager = new CashReconciliationManager(db.getDatabase(), logger, cashDrawerManager);
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all cash drawers
    router.get('/api/cash-drawers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { activeOnly, location } = req.query;
            const drawers = await cashDrawerManager.getCashDrawers({
                activeOnly: activeOnly !== 'false',
                location: location || null
            });
            res.json(drawers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer by ID
    router.get('/api/cash-drawers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const drawer = await cashDrawerManager.getCashDrawerById(req.params.id);
            if (!drawer) {
                return res.status(404).json({ error: 'Cash drawer not found' });
            }
            res.json(drawer);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new cash drawer
    router.post('/api/cash-drawers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, location, description, is_active = true } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const drawer = await cashDrawerManager.createCashDrawer({
                name,
                location,
                description,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'cash_drawers',
                drawer.id,
                null,
                { name, location, description, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(drawer);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update cash drawer
    router.put('/api/cash-drawers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, location, description, is_active } = req.body;

            const oldDrawer = await cashDrawerManager.getCashDrawerById(req.params.id);
            if (!oldDrawer) {
                return res.status(404).json({ error: 'Cash drawer not found' });
            }

            const drawer = await cashDrawerManager.updateCashDrawer(req.params.id, {
                name,
                location,
                description,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'cash_drawers',
                req.params.id,
                oldDrawer,
                { name, location, description, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json(drawer);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete cash drawer (soft delete)
    router.delete('/api/cash-drawers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldDrawer = await cashDrawerManager.getCashDrawerById(req.params.id);
            if (!oldDrawer) {
                return res.status(404).json({ error: 'Cash drawer not found' });
            }

            await cashDrawerManager.deleteCashDrawer(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'cash_drawers',
                req.params.id,
                oldDrawer,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Cash drawer deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer sessions
    router.get('/api/cash-drawers/:id/sessions', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { limit, offset } = req.query;
            const sessions = await cashDrawerManager.getSessionsByDrawerId(req.params.id, {
                limit: limit ? parseInt(limit) : null,
                offset: offset ? parseInt(offset) : null
            });
            res.json(sessions);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Open cash drawer session
    router.post('/api/cash-drawers/:id/open', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { opening_balance, notes } = req.body;

            if (opening_balance === undefined) {
                return res.status(400).json({ error: 'Opening balance is required' });
            }

            const session = await cashDrawerManager.openCashDrawerSession({
                cash_drawer_id: req.params.id,
                opened_by: req.user.id,
                opening_balance,
                notes: notes || ''
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'open_session',
                'cash_drawer_sessions',
                session.id,
                null,
                { cash_drawer_id: req.params.id, opening_balance, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(session);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get open session for cash drawer
    router.get('/api/cash-drawers/:id/open-session', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const session = await cashDrawerManager.getOpenSessionByDrawerId(req.params.id);
            res.json(session || null);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Close cash drawer session
    router.post('/api/cash-drawers/sessions/:sessionId/close', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { closing_balance, notes } = req.body;

            if (closing_balance === undefined) {
                return res.status(400).json({ error: 'Closing balance is required' });
            }

            const session = await cashDrawerManager.closeCashDrawerSession(req.params.sessionId, req.user.id, {
                closing_balance,
                notes: notes || ''
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'close_session',
                'cash_drawer_sessions',
                req.params.sessionId,
                null,
                { closing_balance, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(session);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer session by ID
    router.get('/api/cash-drawers/sessions/:id', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const session = await cashDrawerManager.getSessionById(req.params.id);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }
            res.json(session);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer session transactions
    router.get('/api/cash-drawers/sessions/:id/transactions', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const transactions = await cashDrawerManager.getTransactionsBySessionId(req.params.id);
            res.json(transactions);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Record cash drawer transaction
    router.post('/api/cash-drawers/sessions/:id/transactions', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { transaction_type, amount, reference_id, reference_type, description } = req.body;

            if (!transaction_type || amount === undefined) {
                return res.status(400).json({ error: 'Transaction type and amount are required' });
            }

            const transaction = await cashDrawerManager.recordTransaction({
                session_id: req.params.id,
                transaction_type,
                amount,
                reference_id: reference_id || null,
                reference_type: reference_type || null,
                description: description || ''
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'record_transaction',
                'cash_drawer_transactions',
                transaction.id,
                null,
                { session_id: req.params.id, transaction_type, amount, reference_id, reference_type, description },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(transaction);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Transfer cash drawer session
    router.post('/api/cash-drawers/sessions/:id/transfer', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { transferred_to, notes } = req.body;

            if (!transferred_to) {
                return res.status(400).json({ error: 'Transferred to user ID is required' });
            }

            const session = await cashDrawerManager.transferCashDrawerSession(req.params.id, transferred_to, notes || '');

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'transfer_session',
                'cash_drawer_sessions',
                req.params.id,
                null,
                { transferred_to, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(session);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Start cash drawer reconciliation
    router.post('/api/cash-drawers/sessions/:id/reconcile', authenticate, authorize('manage_orders'), verifyManagerPin, async (req, res) => {
        try {
            const { actual_count, notes, difference_reason } = req.body;

            if (actual_count === undefined) {
                return res.status(400).json({ error: 'Actual count is required' });
            }

            const reconciliation = await cashReconciliationManager.startReconciliation(
                req.params.id,
                req.user.id,
                actual_count,
                notes || '',
                difference_reason || ''
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'reconcile_session',
                'cash_drawer_reconciliations',
                reconciliation.id,
                null,
                { session_id: req.params.id, actual_count, notes, difference_reason },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(reconciliation);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer reconciliation by ID
    router.get('/api/cash-drawers/reconciliations/:id', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const reconciliation = await cashReconciliationManager.getReconciliationById(req.params.id);
            if (!reconciliation) {
                return res.status(404).json({ error: 'Reconciliation not found' });
            }
            res.json(reconciliation);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get reconciliations by session ID
    router.get('/api/cash-drawers/sessions/:id/reconciliations', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const reconciliations = await cashReconciliationManager.getReconciliationsBySessionId(req.params.id);
            res.json(reconciliations);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get reconciliations by cash drawer ID
    router.get('/api/cash-drawers/:id/reconciliations', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { dateFrom, dateTo, limit, offset } = req.query;
            const reconciliations = await cashReconciliationManager.getReconciliationsByCashDrawerId(
                req.params.id,
                {
                    dateFrom: dateFrom || null,
                    dateTo: dateTo || null,
                    limit: limit ? parseInt(limit) : 100,
                    offset: offset ? parseInt(offset) : 0
                }
            );
            res.json(reconciliations);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Calculate reconciliation summary
    router.get('/api/cash-drawers/sessions/:id/reconciliation-summary', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const summary = await cashReconciliationManager.calculateReconciliationSummary(req.params.id);
            res.json(summary);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Verify cash drawer balance
    router.post('/api/cash-drawers/sessions/:id/verify-balance', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { actual_count } = req.body;

            if (actual_count === undefined) {
                return res.status(400).json({ error: 'Actual count is required' });
            }

            const verification = await cashReconciliationManager.verifyCashDrawerBalance(req.params.id, actual_count);
            res.json(verification);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer audit logs
    router.get('/api/cash-drawers/:id/audit-logs', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { session_id, user_id, action, limit, offset } = req.query;
            const logs = await cashDrawerManager.getAuditLogs({
                cash_drawer_id: req.params.id,
                session_id: session_id ? parseInt(session_id) : null,
                user_id: user_id ? parseInt(user_id) : null,
                action: action || null,
                limit: limit ? parseInt(limit) : 100,
                offset: offset ? parseInt(offset) : 0
            });
            res.json(logs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer summary
    router.get('/api/cash-drawers/:id/summary', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const summary = await cashDrawerManager.getCashDrawerSummary(req.params.id);
            res.json(summary);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer reports
    router.get('/api/cash-drawers/:id/reports/summary', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { dateFrom, dateTo } = req.query;
            const summary = await reportingManager.getCashDrawerSummary(
                req.params.id,
                dateFrom || null,
                dateTo || null
            );
            res.json(summary);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer activity report
    router.get('/api/cash-drawers/:id/reports/activity', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { dateFrom, dateTo } = req.query;
            const report = await reportingManager.getCashDrawerActivityReport(
                req.params.id,
                dateFrom || null,
                dateTo || null
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer transaction report
    router.get('/api/cash-drawers/:id/reports/transactions', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { dateFrom, dateTo } = req.query;
            const report = await reportingManager.getCashDrawerTransactionReport(
                req.params.id,
                dateFrom || null,
                dateTo || null
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer reconciliation report
    router.get('/api/cash-drawers/:id/reports/reconciliations', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { dateFrom, dateTo } = req.query;
            const report = await reportingManager.getCashDrawerReconciliationReport(
                req.params.id,
                dateFrom || null,
                dateTo || null
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer over/short report
    router.get('/api/cash-drawers/reports/over-short', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { dateFrom, dateTo } = req.query;
            const report = await reportingManager.getCashDrawerOverShortReport(
                dateFrom || null,
                dateTo || null
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get cash drawer audit log report
    router.get('/api/cash-drawers/:id/reports/audit-logs', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { dateFrom, dateTo, action } = req.query;
            const report = await reportingManager.getCashDrawerAuditLogReport(
                req.params.id,
                dateFrom || null,
                dateTo || null,
                action || null
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Generate cash drawer reconciliation report (PDF/CSV)
    router.get('/api/cash-drawers/:id/reports/export', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { format, dateFrom, dateTo } = req.query;

            if (!format || !['pdf', 'csv'].includes(format)) {
                return res.status(400).json({ error: 'Format is required (pdf or csv)' });
            }

            const reportData = await reportingManager.getCashDrawerReconciliationReport(
                req.params.id,
                dateFrom || null,
                dateTo || null
            );

            const filename = `cash_drawer_${req.params.id}_${new Date().toISOString().split('T')[0]}`;

            if (format === 'csv') {
                const filePath = await reportingManager.exportToCSV(reportData, `${filename}.csv`);
                res.download(filePath, `${filename}.csv`, (err) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                    }
                });
            } else {
                const filePath = await reportingManager.exportToPDF(reportData, `${filename}.pdf`, {
                    title: 'Cash Drawer Reconciliation Report',
                    subtitle: `Cash Drawer: ${req.params.id} | Period: ${dateFrom || 'All'} to ${dateTo || 'All'}`
                });
                res.download(filePath, `${filename}.pdf`, (err) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                    }
                });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // PRODUCT MODIFIERS
    // ========================================================================

    // Get all modifier groups
    router.get('/api/modifier-groups', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const db = require('./database');
            const modifierGroups = await db.query(
                'SELECT * FROM modifier_groups WHERE is_active = 1 ORDER BY display_order, name'
            ).rows;
            res.json(modifierGroups);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get modifier group by ID
    router.get('/api/modifier-groups/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const db = require('./database');
            const modifierGroup = await db.query(
                'SELECT * FROM modifier_groups WHERE id = ? AND is_active = 1',
                [req.params.id]
            ).rows[0];

            if (!modifierGroup) {
                return res.status(404).json({ error: 'Modifier group not found' });
            }
            res.json(modifierGroup);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new modifier group
    router.post('/api/modifier-groups', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { name, description, is_required, max_selections, display_order } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const db = require('./database');
            const result = await db.query(
                'INSERT INTO modifier_groups (name, description, is_required, max_selections, display_order) VALUES (?, ?, ?, ?, ?)',
                [name, description || '', is_required || false, max_selections || null, display_order || 0]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'modifier_groups',
                result.lastInsertRowid,
                null,
                { name, description, is_required, max_selections, display_order },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ id: result.lastInsertRowid, message: 'Modifier group created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update modifier group
    router.put('/api/modifier-groups/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { name, description, is_required, max_selections, display_order, is_active } = req.body;

            const db = require('./database');
            const oldGroup = await db.query(
                'SELECT * FROM modifier_groups WHERE id = ?',
                [req.params.id]
            ).rows[0];

            if (!oldGroup) {
                return res.status(404).json({ error: 'Modifier group not found' });
            }

            await db.query(
                'UPDATE modifier_groups SET name = ?, description = ?, is_required = ?, max_selections = ?, display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [name, description || '', is_required || false, max_selections || null, display_order || 0, is_active || true, req.params.id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'modifier_groups',
                req.params.id,
                oldGroup,
                { name, description, is_required, max_selections, display_order, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Modifier group updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete modifier group (soft delete)
    router.delete('/api/modifier-groups/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const db = require('./database');
            const modifierGroup = await db.query(
                'SELECT * FROM modifier_groups WHERE id = ?',
                [req.params.id]
            ).rows[0];

            if (!modifierGroup) {
                return res.status(404).json({ error: 'Modifier group not found' });
            }

            await db.query('UPDATE modifier_groups SET is_active = 0 WHERE id = ?', [req.params.id]);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'modifier_groups',
                req.params.id,
                modifierGroup,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Modifier group deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all modifiers
    router.get('/api/modifiers', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const db = require('./database');
            const modifiers = await db.query(
                'SELECT m.*, mg.name as group_name FROM modifiers m LEFT JOIN modifier_groups mg ON m.group_id = mg.id WHERE m.is_active = 1 ORDER BY mg.display_order, m.display_order, m.name'
            ).rows;
            res.json(modifiers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get modifier by ID
    router.get('/api/modifiers/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const db = require('./database');
            const modifier = await db.query(
                'SELECT m.*, mg.name as group_name FROM modifiers m LEFT JOIN modifier_groups mg ON m.group_id = mg.id WHERE m.id = ? AND m.is_active = 1',
                [req.params.id]
            ).rows[0];

            if (!modifier) {
                return res.status(404).json({ error: 'Modifier not found' });
            }
            res.json(modifier);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new modifier
    router.post('/api/modifiers', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { group_id, name, price, display_order } = req.body;

            if (!group_id || !name) {
                return res.status(400).json({ error: 'Group ID and name are required' });
            }

            const db = require('./database');

            // Verify group exists
            const group = await db.query('SELECT * FROM modifier_groups WHERE id = ? AND is_active = 1', [group_id]).rows[0];
            if (!group) {
                return res.status(400).json({ error: 'Invalid modifier group' });
            }

            const result = await db.query(
                'INSERT INTO modifiers (group_id, name, price, display_order) VALUES (?, ?, ?, ?)',
                [group_id, name, price || 0, display_order || 0]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'modifiers',
                result.lastInsertRowid,
                null,
                { group_id, name, price, display_order },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ id: result.lastInsertRowid, message: 'Modifier created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update modifier
    router.put('/api/modifiers/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { group_id, name, price, display_order, is_active } = req.body;

            const db = require('./database');
            const oldModifier = await db.query(
                'SELECT * FROM modifiers WHERE id = ?',
                [req.params.id]
            ).rows[0];

            if (!oldModifier) {
                return res.status(404).json({ error: 'Modifier not found' });
            }

            // Verify group exists if provided
            if (group_id) {
                const group = await db.query('SELECT * FROM modifier_groups WHERE id = ? AND is_active = 1', [group_id]).rows[0];
                if (!group) {
                    return res.status(400).json({ error: 'Invalid modifier group' });
                }
            }

            await db.query(
                'UPDATE modifiers SET group_id = ?, name = ?, price = ?, display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [group_id || oldModifier.group_id, name || oldModifier.name, price || oldModifier.price, display_order || oldModifier.display_order, is_active || true, req.params.id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'modifiers',
                req.params.id,
                oldModifier,
                { group_id, name, price, display_order, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Modifier updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete modifier (soft delete)
    router.delete('/api/modifiers/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const db = require('./database');
            const modifier = await db.query(
                'SELECT * FROM modifiers WHERE id = ?',
                [req.params.id]
            ).rows[0];

            if (!modifier) {
                return res.status(404).json({ error: 'Modifier not found' });
            }

            await db.query('UPDATE modifiers SET is_active = 0 WHERE id = ?', [req.params.id]);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'modifiers',
                req.params.id,
                modifier,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Modifier deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get modifier groups for a menu item
    router.get('/api/menu-items/:id/modifiers', authenticate, authorize('view_menu'), async (req, res) => {
        try {
            const db = require('./database');

            // Get menu item to verify it exists
            const item = await db.query('SELECT * FROM menu_items WHERE id = ?', [req.params.id]).rows[0];
            if (!item) {
                return res.status(404).json({ error: 'Menu item not found' });
            }

            // Get modifier groups for this item
            const result = await db.query(
                `SELECT mg.*,
                    json_agg(json_build_object('id', m.id, 'name', m.name, 'price', m.price, 'display_order', m.display_order)) as modifiers
             FROM modifier_groups mg
             LEFT JOIN menu_item_modifier_groups mm ON mg.id = mm.modifier_group_id
             LEFT JOIN modifiers m ON mg.id = m.group_id AND m.is_active = 1
             WHERE mm.menu_item_id = ? AND mg.is_active = 1
             GROUP BY mg.id
             ORDER BY mg.display_order, mg.name`,
                [req.params.id]
            );

            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add modifier group to menu item
    router.post('/api/menu-items/:itemId/modifier-groups', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { modifier_group_id } = req.body;

            if (!modifier_group_id) {
                return res.status(400).json({ error: 'Modifier group ID is required' });
            }

            const db = require('./database');

            // Verify menu item exists
            const item = await db.query('SELECT * FROM menu_items WHERE id = ?', [req.params.itemId]).rows[0];
            if (!item) {
                return res.status(404).json({ error: 'Menu item not found' });
            }

            // Verify modifier group exists
            const group = await db.query('SELECT * FROM modifier_groups WHERE id = ? AND is_active = 1', [modifier_group_id]).rows[0];
            if (!group) {
                return res.status(404).json({ error: 'Modifier group not found' });
            }

            // Check if already exists
            const existing = await db.query(
                'SELECT * FROM menu_item_modifier_groups WHERE menu_item_id = ? AND modifier_group_id = ?',
                [req.params.itemId, modifier_group_id]
            ).rows[0];

            if (existing) {
                return res.status(400).json({ error: 'Modifier group already assigned to this item' });
            }

            await db.query(
                'INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id) VALUES (?, ?)',
                [req.params.itemId, modifier_group_id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'menu_item_modifier_groups',
                null,
                null,
                { menu_item_id: req.params.itemId, modifier_group_id },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ message: 'Modifier group added to menu item successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Remove modifier group from menu item
    router.delete('/api/menu-items/:itemId/modifier-groups/:groupId', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const db = require('./database');

            // Verify menu item exists
            const item = await db.query('SELECT * FROM menu_items WHERE id = ?', [req.params.itemId]).rows[0];
            if (!item) {
                return res.status(404).json({ error: 'Menu item not found' });
            }

            // Verify modifier group exists
            const group = await db.query('SELECT * FROM modifier_groups WHERE id = ? AND is_active = 1', [req.params.groupId]).rows[0];
            if (!group) {
                return res.status(404).json({ error: 'Modifier group not found' });
            }

            // Check if exists
            const existing = await db.query(
                'SELECT * FROM menu_item_modifier_groups WHERE menu_item_id = ? AND modifier_group_id = ?',
                [req.params.itemId, req.params.groupId]
            ).rows[0];

            if (!existing) {
                return res.status(404).json({ error: 'Modifier group not assigned to this item' });
            }

            await db.query(
                'DELETE FROM menu_item_modifier_groups WHERE menu_item_id = ? AND modifier_group_id = ?',
                [req.params.itemId, req.params.groupId]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'menu_item_modifier_groups',
                null,
                { menu_item_id: req.params.itemId, modifier_group_id: req.params.groupId },
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Modifier group removed from menu item successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add modifier to cart item
    router.post('/api/cart/add-modifier', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { cartItemId, modifierId, quantity } = req.body;

            if (!cartItemId || !modifierId) {
                return res.status(400).json({ error: 'Cart item ID and modifier ID are required' });
            }

            const db = require('./database');

            // Verify modifier exists
            const modifier = await db.query(
                'SELECT * FROM modifiers WHERE id = ? AND is_active = 1',
                [modifierId]
            ).rows[0];

            if (!modifier) {
                return res.status(404).json({ error: 'Modifier not found' });
            }

            // Get modifier details with group info
            const modifierWithGroup = await db.query(
                'SELECT m.*, mg.name as group_name FROM modifiers m LEFT JOIN modifier_groups mg ON m.group_id = mg.id WHERE m.id = ?',
                [modifierId]
            ).rows[0];

            // Add modifier to order item
            const result = await db.query(
                'INSERT INTO order_item_modifiers (order_item_id, modifier_id, quantity, price) VALUES (?, ?, ?, ?)',
                [cartItemId, modifierId, quantity || 1, modifier.price]
            );

            // Recalculate order item total
            const orderItem = await db.query(
                'SELECT oi.*, mi.name as item_name FROM order_items oi LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id WHERE oi.id = ?',
                [cartItemId]
            ).rows[0];

            if (orderItem) {
                // Get all modifiers for this item
                const modifiers = await db.query(
                    'SELECT oim.*, m.name as modifier_name FROM order_item_modifiers oim LEFT JOIN modifiers m ON oim.modifier_id = m.id WHERE oim.order_item_id = ?',
                    [cartItemId]
                ).rows;

                // Calculate new total with modifiers
                const modifierSubtotal = modifiers.reduce((sum, mod) => sum + (mod.price * mod.quantity), 0);
                const newTotal = (orderItem.quantity * orderItem.unit_price) + modifierSubtotal;

                await db.query(
                    'UPDATE order_items SET total_price = ? WHERE id = ?',
                    [newTotal, cartItemId]
                );
            }

            res.status(201).json({
                id: result.lastInsertRowid,
                modifier: modifierWithGroup,
                message: 'Modifier added to cart item successfully'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update modifier on cart item
    router.put('/api/cart/update-modifier', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { cartItemId, modifierId, quantity } = req.body;

            if (!cartItemId || !modifierId) {
                return res.status(400).json({ error: 'Cart item ID and modifier ID are required' });
            }

            const db = require('./database');

            // Check if modifier exists on this item
            const existing = await db.query(
                'SELECT * FROM order_item_modifiers WHERE order_item_id = ? AND modifier_id = ?',
                [cartItemId, modifierId]
            ).rows[0];

            if (!existing) {
                return res.status(404).json({ error: 'Modifier not found on this cart item' });
            }

            if (quantity <= 0) {
                // Remove modifier if quantity is 0 or less
                await db.query(
                    'DELETE FROM order_item_modifiers WHERE order_item_id = ? AND modifier_id = ?',
                    [cartItemId, modifierId]
                );
            } else {
                // Update modifier quantity
                await db.query(
                    'UPDATE order_item_modifiers SET quantity = ? WHERE order_item_id = ? AND modifier_id = ?',
                    [quantity, cartItemId, modifierId]
                );
            }

            // Recalculate order item total
            const orderItem = await db.query(
                'SELECT oi.*, mi.name as item_name FROM order_items oi LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id WHERE oi.id = ?',
                [cartItemId]
            ).rows[0];

            if (orderItem) {
                // Get all modifiers for this item
                const modifiers = await db.query(
                    'SELECT oim.*, m.name as modifier_name FROM order_item_modifiers oim LEFT JOIN modifiers m ON oim.modifier_id = m.id WHERE oim.order_item_id = ?',
                    [cartItemId]
                ).rows;

                // Calculate new total with modifiers
                const modifierSubtotal = modifiers.reduce((sum, mod) => sum + (mod.price * mod.quantity), 0);
                const newTotal = (orderItem.quantity * orderItem.unit_price) + modifierSubtotal;

                await db.query(
                    'UPDATE order_items SET total_price = ? WHERE id = ?',
                    [newTotal, cartItemId]
                );
            }

            res.json({ message: 'Modifier updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Remove modifier from cart item
    router.delete('/api/cart/remove-modifier', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { cartItemId, modifierId } = req.body;

            if (!cartItemId || !modifierId) {
                return res.status(400).json({ error: 'Cart item ID and modifier ID are required' });
            }

            const db = require('./database');

            // Check if modifier exists on this item
            const existing = await db.query(
                'SELECT * FROM order_item_modifiers WHERE order_item_id = ? AND modifier_id = ?',
                [cartItemId, modifierId]
            ).rows[0];

            if (!existing) {
                return res.status(404).json({ error: 'Modifier not found on this cart item' });
            }

            await db.query(
                'DELETE FROM order_item_modifiers WHERE order_item_id = ? AND modifier_id = ?',
                [cartItemId, modifierId]
            );

            // Recalculate order item total
            const orderItem = await db.query(
                'SELECT oi.*, mi.name as item_name FROM order_items oi LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id WHERE oi.id = ?',
                [cartItemId]
            ).rows[0];

            if (orderItem) {
                // Get all modifiers for this item
                const modifiers = await db.query(
                    'SELECT oim.*, m.name as modifier_name FROM order_item_modifiers oim LEFT JOIN modifiers m ON oim.modifier_id = m.id WHERE oim.order_item_id = ?',
                    [cartItemId]
                ).rows;

                // Calculate new total with modifiers
                const modifierSubtotal = modifiers.reduce((sum, mod) => sum + (mod.price * mod.quantity), 0);
                const newTotal = (orderItem.quantity * orderItem.unit_price) + modifierSubtotal;

                await db.query(
                    'UPDATE order_items SET total_price = ? WHERE id = ?',
                    [newTotal, cartItemId]
                );
            }

            res.json({ message: 'Modifier removed from cart item successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // TABLE MANAGEMENT
    // ========================================================================

    // Get all tables
    router.get('/api/tables', authenticate, authorize('read', 'Table'), async (req, res) => {
        try {
            const { location_id } = req.query;
            const db = require('./database');
            const query = 'SELECT * FROM tables';
            const params = [];

            if (location_id) {
                params.push(location_id);
            }

            const tables = await db.query(query, params).rows;
            res.json(tables);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get table by ID
    router.get('/api/tables/:id', authenticate, authorize('read', 'Table'), async (req, res) => {
        try {
            const db = require('./database');
            const table = await db.query('SELECT * FROM tables WHERE id = ?', [req.params.id]).rows[0];
            if (!table) {
                return res.status(404).json({ error: 'Table not found' });
            }
            res.json(table);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get available tables
    router.get('/api/tables/available', authenticate, authorize('read', 'Table'), async (req, res) => {
        try {
            const { location_id } = req.query;
            const db = require('./database');
            const query = 'SELECT * FROM tables WHERE status = ?';
            const params = ['available'];

            if (location_id) {
                query.push(' AND location_id = ?');
                params.push(location_id);
            }

            const tables = await db.query(query, params).rows;
            res.json(tables);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new table
    router.post('/api/tables', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { table_number, name, capacity, status, location_id } = req.body;

            if (!table_number) {
                return res.status(400).json({ error: 'Table number is required' });
            }

            const db = require('./database');
            const result = await db.query(
                'INSERT INTO tables (table_number, name, capacity, status, location_id) VALUES (?, ?, ?, ?, ?)',
                [table_number, name || '', capacity || 4, status || 'available', location_id || 1]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'tables',
                result.lastInsertRowid,
                null,
                { table_number, name, capacity, status, location_id },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ id: result.lastInsertRowid, message: 'Table created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update table
    router.put('/api/tables/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { table_number, name, capacity, status, location_id } = req.body;

            const db = require('./database');
            const oldTable = await db.query('SELECT * FROM tables WHERE id = ?', [req.params.id]).rows[0];

            if (!oldTable) {
                return res.status(404).json({ error: 'Table not found' });
            }

            await db.query(
                'UPDATE tables SET table_number = ?, name = ?, capacity = ?, status = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [table_number || oldTable.table_number, name || oldTable.name, capacity || oldTable.capacity, status || oldTable.status, location_id || oldTable.location_id, req.params.id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'tables',
                req.params.id,
                oldTable,
                { table_number, name, capacity, status, location_id },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Table updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete table
    router.delete('/api/tables/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const table = await db.query('SELECT * FROM tables WHERE id = ?', [req.params.id]).rows[0];

            if (!table) {
                return res.status(404).json({ error: 'Table not found' });
            }

            await db.query('DELETE FROM tables WHERE id = ?', [req.params.id]);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'tables',
                req.params.id,
                table,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Table deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update table status
    router.put('/api/tables/:id/status', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({ error: 'Status is required' });
            }

            const db = require('./database');
            const oldTable = await db.query('SELECT * FROM tables WHERE id = ?', [req.params.id]).rows[0];

            if (!oldTable) {
                return res.status(404).json({ error: 'Table not found' });
            }

            await db.query(
                'UPDATE tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [status, req.params.id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'tables',
                req.params.id,
                oldTable,
                { status },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Table status updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // TABLE LAYOUT MANAGEMENT
    // ========================================================================

    // Get all table layouts
    router.get('/api/table-layouts', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { location_id } = req.query;
            const db = require('./database');
            const query = 'SELECT * FROM table_layouts';
            const params = [];

            if (location_id) {
                query.push(' WHERE location_id = ?');
                params.push(location_id);
            }

            const layouts = await db.query(query, params).rows;
            res.json(layouts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get table layout by ID
    router.get('/api/table-layouts/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const layout = await db.query('SELECT * FROM table_layouts WHERE id = ?', [req.params.id]).rows[0];
            if (!layout) {
                return res.status(404).json({ error: 'Table layout not found' });
            }
            res.json(layout);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new table layout
    router.post('/api/table-layouts', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, description, location_id, is_active } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const db = require('./database');
            const result = await db.query(
                'INSERT INTO table_layouts (name, description, location_id, is_active) VALUES (?, ?, ?, ?)',
                [name, description || '', location_id || 1, is_active || 1]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'table_layouts',
                result.lastInsertRowid,
                null,
                { name, description, location_id, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ id: result.lastInsertRowid, message: 'Table layout created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update table layout
    router.put('/api/table-layouts/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, description, location_id, is_active } = req.body;

            const db = require('./database');
            const oldLayout = await db.query('SELECT * FROM table_layouts WHERE id = ?', [req.params.id]).rows[0];

            if (!oldLayout) {
                return res.status(404).json({ error: 'Table layout not found' });
            }

            await db.query(
                'UPDATE table_layouts SET name = ?, description = ?, location_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [name || oldLayout.name, description || oldLayout.description, location_id || oldLayout.location_id, is_active || oldLayout.is_active, req.params.id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'table_layouts',
                req.params.id,
                oldLayout,
                { name, description, location_id, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Table layout updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete table layout
    router.delete('/api/table-layouts/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const layout = await db.query('SELECT * FROM table_layouts WHERE id = ?', [req.params.id]).rows[0];

            if (!layout) {
                return res.status(404).json({ error: 'Table layout not found' });
            }

            await db.query('DELETE FROM table_layouts WHERE id = ?', [req.params.id]);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'table_layouts',
                req.params.id,
                layout,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Table layout deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get table positions for a layout
    router.get('/api/table-layouts/:id/positions', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const positions = await db.query(
                'SELECT * FROM table_layout_positions WHERE layout_id = ? ORDER BY position_x, position_y',
                [req.params.id]
            ).rows;
            res.json(positions);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update table positions for a layout
    router.post('/api/table-layouts/:id/positions', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { positions } = req.body;

            if (!Array.isArray(positions)) {
                return res.status(400).json({ error: 'Positions must be an array' });
            }

            const db = require('./database');

            // Clear existing positions
            await db.query('DELETE FROM table_layout_positions WHERE layout_id = ?', [req.params.id]);

            // Insert new positions
            for (const pos of positions) {
                await db.query(
                    'INSERT INTO table_layout_positions (layout_id, table_id, position_x, position_y, width, height, rotation) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [req.params.id, pos.table_id, pos.position_x, pos.position_y, pos.width || 100, pos.height || 100, pos.rotation || 0]
                );
            }

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'table_layout_positions',
                req.params.id,
                null,
                { positions },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Table positions updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // BUZZER MANAGEMENT
    // ========================================================================

    // Get all buzzers
    router.get('/api/buzzers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const buzzers = await db.query('SELECT * FROM buzzers ORDER BY buzzer_number').rows;
            res.json(buzzers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get buzzer by ID
    router.get('/api/buzzers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const buzzer = await db.query('SELECT * FROM buzzers WHERE id = ?', [req.params.id]).rows[0];
            if (!buzzer) {
                return res.status(404).json({ error: 'Buzzer not found' });
            }
            res.json(buzzer);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get available buzzers
    router.get('/api/buzzers/available', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const buzzers = await db.query('SELECT * FROM buzzers WHERE status = ? ORDER BY buzzer_number', ['available']).rows;
            res.json(buzzers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new buzzer
    router.post('/api/buzzers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { buzzer_number, status } = req.body;

            if (!buzzer_number) {
                return res.status(400).json({ error: 'Buzzer number is required' });
            }

            const db = require('./database');
            const result = await db.query(
                'INSERT INTO buzzers (buzzer_number, status) VALUES (?, ?)',
                [buzzer_number, status || 'available']
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'buzzers',
                result.lastInsertRowid,
                null,
                { buzzer_number, status },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ id: result.lastInsertRowid, message: 'Buzzer created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create multiple buzzers (batch)
    router.post('/api/buzzers/batch', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { count, startNumber } = req.body;

            if (!count || count <= 0) {
                return res.status(400).json({ error: 'Count must be a positive number' });
            }

            const db = require('./database');
            const createdBuzzers = [];

            for (let i = 0; i < count; i++) {
                const buzzerNumber = `B${String(startNumber + i).padStart(3, '0')}`;
                const result = await db.query(
                    'INSERT INTO buzzers (buzzer_number, status) VALUES (?, ?)',
                    [buzzerNumber, 'available']
                );
                createdBuzzers.push({ id: result.lastInsertRowid, buzzer_number: buzzerNumber });
            }

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'buzzers',
                null,
                null,
                { count, startNumber },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ buzzers: createdBuzzers, message: `${count} buzzers created successfully` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update buzzer
    router.put('/api/buzzers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { buzzer_number, status } = req.body;

            const db = require('./database');
            const oldBuzzer = await db.query('SELECT * FROM buzzers WHERE id = ?', [req.params.id]).rows[0];

            if (!oldBuzzer) {
                return res.status(404).json({ error: 'Buzzer not found' });
            }

            await db.query(
                'UPDATE buzzers SET buzzer_number = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [buzzer_number || oldBuzzer.buzzer_number, status || oldBuzzer.status, req.params.id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'buzzers',
                req.params.id,
                oldBuzzer,
                { buzzer_number, status },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Buzzer updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete buzzer
    router.delete('/api/buzzers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const buzzer = await db.query('SELECT * FROM buzzers WHERE id = ?', [req.params.id]).rows[0];

            if (!buzzer) {
                return res.status(404).json({ error: 'Buzzer not found' });
            }

            await db.query('DELETE FROM buzzers WHERE id = ?', [req.params.id]);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'buzzers',
                req.params.id,
                buzzer,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Buzzer deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update buzzer status
    router.put('/api/buzzers/:id/status', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({ error: 'Status is required' });
            }

            const db = require('./database');
            const oldBuzzer = await db.query('SELECT * FROM buzzers WHERE id = ?', [req.params.id]).rows[0];

            if (!oldBuzzer) {
                return res.status(404).json({ error: 'Buzzer not found' });
            }

            await db.query(
                'UPDATE buzzers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [status, req.params.id]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'buzzers',
                req.params.id,
                oldBuzzer,
                { status },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Buzzer status updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Generate next available buzzer number
    router.get('/api/buzzers/next-number', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            const result = await db.query(
                'SELECT MAX(CAST(SUBSTRING(buzzer_number, 2) AS INTEGER)) as max_num FROM buzzers'
            );
            const maxNum = result.rows[0].max_num || 0;
            const nextNum = maxNum + 1;
            const buzzerNumber = `B${String(nextNum).padStart(3, '0')}`;
            res.json({ buzzer_number: buzzerNumber });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Reset all buzzers to available status
    router.post('/api/buzzers/reset', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const db = require('./database');
            await db.query('UPDATE buzzers SET status = ?', ['available']);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'buzzers',
                null,
                null,
                { action: 'reset_all' },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'All buzzers reset to available status' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // ORDER TABLE/BUZZER ASSIGNMENT
    // ========================================================================

    // Assign table to order
    router.post('/api/orders/assign-table', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { orderId, tableId } = req.body;

            if (!orderId || !tableId) {
                return res.status(400).json({ error: 'Order ID and table ID are required' });
            }

            const db = require('./database');

            // Verify order exists
            const order = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]).rows[0];
            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            // Verify table exists
            const table = await db.query('SELECT * FROM tables WHERE id = ?', [tableId]).rows[0];
            if (!table) {
                return res.status(404).json({ error: 'Table not found' });
            }

            // Check if already assigned
            const existing = await db.query(
                'SELECT * FROM orders_tables WHERE order_id = ? AND table_id = ?',
                [orderId, tableId]
            ).rows[0];

            if (existing) {
                return res.json({ message: 'Table already assigned to this order' });
            }

            // Assign table to order
            await db.query(
                'INSERT INTO orders_tables (order_id, table_id) VALUES (?, ?)',
                [orderId, tableId]
            );

            // Update order table_id for backward compatibility
            await db.query(
                'UPDATE orders SET table_id = ? WHERE id = ?',
                [tableId, orderId]
            );

            // Update table status to occupied
            await db.query(
                'UPDATE tables SET status = ? WHERE id = ?',
                ['occupied', tableId]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'orders_tables',
                null,
                null,
                { orderId, tableId },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Table assigned to order successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Assign buzzer to order
    router.post('/api/orders/assign-buzzer', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { orderId, buzzerId } = req.body;

            if (!orderId || !buzzerId) {
                return res.status(400).json({ error: 'Order ID and buzzer ID are required' });
            }

            const db = require('./database');

            // Verify order exists
            const order = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]).rows[0];
            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            // Verify buzzer exists
            const buzzer = await db.query('SELECT * FROM buzzers WHERE id = ?', [buzzerId]).rows[0];
            if (!buzzer) {
                return res.status(404).json({ error: 'Buzzer not found' });
            }

            // Check if already assigned
            const existing = await db.query(
                'SELECT * FROM orders_buzzers WHERE order_id = ? AND buzzer_id = ?',
                [orderId, buzzerId]
            ).rows[0];

            if (existing) {
                return res.json({ message: 'Buzzer already assigned to this order' });
            }

            // Assign buzzer to order
            await db.query(
                'INSERT INTO orders_buzzers (order_id, buzzer_id) VALUES (?, ?)',
                [orderId, buzzerId]
            );

            // Update order buzzer_id for backward compatibility
            await db.query(
                'UPDATE orders SET buzzer_id = ? WHERE id = ?',
                [buzzerId, orderId]
            );

            // Update buzzer status to occupied
            await db.query(
                'UPDATE buzzers SET status = ? WHERE id = ?',
                ['occupied', buzzerId]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'orders_buzzers',
                null,
                null,
                { orderId, buzzerId },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Buzzer assigned to order successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get tables for an order
    router.get('/api/orders/:id/tables', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const db = require('./database');
            const tables = await db.query(
                'SELECT t.* FROM tables t JOIN orders_tables ot ON t.id = ot.table_id WHERE ot.order_id = ?',
                [req.params.id]
            ).rows;
            res.json(tables);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get buzzers for an order
    router.get('/api/orders/:id/buzzers', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const db = require('./database');
            const buzzers = await db.query(
                'SELECT b.* FROM buzzers b JOIN orders_buzzers ob ON b.id = ob.buzzer_id WHERE ob.order_id = ?',
                [req.params.id]
            ).rows;
            res.json(buzzers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Transfer order to different table
    router.post('/api/orders/transfer', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { orderId, newTableId } = req.body;

            if (!orderId || !newTableId) {
                return res.status(400).json({ error: 'Order ID and new table ID are required' });
            }

            const db = require('./database');

            // Verify order exists
            const order = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]).rows[0];
            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            // Verify new table exists
            const newTable = await db.query('SELECT * FROM tables WHERE id = ?', [newTableId]).rows[0];
            if (!newTable) {
                return res.status(404).json({ error: 'New table not found' });
            }

            // Get current table
            const currentTable = await db.query(
                'SELECT t.* FROM tables t JOIN orders_tables ot ON t.id = ot.table_id WHERE ot.order_id = ? LIMIT 1',
                [orderId]
            ).rows[0];

            if (currentTable && currentTable.id === newTableId) {
                return res.json({ message: 'Order is already at this table' });
            }

            // If there's a current table, update its status
            if (currentTable) {
                await db.query(
                    'UPDATE tables SET status = ? WHERE id = ?',
                    ['available', currentTable.id]
                );
            }

            // Update order table
            await db.query(
                'UPDATE orders SET table_id = ? WHERE id = ?',
                [newTableId, orderId]
            );

            // Update orders_tables
            if (currentTable) {
                await db.query(
                    'UPDATE orders_tables SET table_id = ? WHERE order_id = ?',
                    [newTableId, orderId]
                );
            } else {
                await db.query(
                    'INSERT INTO orders_tables (order_id, table_id) VALUES (?, ?)',
                    [orderId, newTableId]
                );
            }

            // Update new table status
            await db.query(
                'UPDATE tables SET status = ? WHERE id = ?',
                ['occupied', newTableId]
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'orders_tables',
                orderId,
                null,
                { orderId, newTableId, oldTableId: currentTable?.id },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Order transferred successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Merge orders from multiple tables
    router.post('/api/orders/merge', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { targetOrderId, sourceOrderIds } = req.body;

            if (!targetOrderId || !Array.isArray(sourceOrderIds) || sourceOrderIds.length === 0) {
                return res.status(400).json({ error: 'Target order ID and source order IDs are required' });
            }

            const db = require('./database');

            // Verify target order exists
            const targetOrder = await db.query('SELECT * FROM orders WHERE id = ?', [targetOrderId]).rows[0];
            if (!targetOrder) {
                return res.status(404).json({ error: 'Target order not found' });
            }

            // Verify source orders exist
            for (const orderId of sourceOrderIds) {
                const order = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]).rows[0];
                if (!order) {
                    return res.status(404).json({ error: `Source order ${orderId} not found` });
                }
            }

            // Get all items from source orders
            const sourceItems = await db.query(
                'SELECT * FROM order_items WHERE order_id IN (?)',
                [sourceOrderIds]
            ).rows;

            // Insert items into target order
            for (const item of sourceItems) {
                await db.query(
                    'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes) VALUES (?, ?, ?, ?, ?, ?)',
                    [targetOrderId, item.menu_item_id, item.quantity, item.unit_price, item.total_price, item.notes]
                );
            }

            // Get all modifiers from source orders
            const sourceModifiers = await db.query(
                'SELECT * FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (?))',
                [sourceOrderIds]
            ).rows;

            // Insert modifiers into target order (need to map order_item_id)
            for (const modifier of sourceModifiers) {
                // Find the corresponding item in target order
                const targetItem = await db.query(
                    'SELECT id FROM order_items WHERE order_id = ? AND menu_item_id = ? AND quantity = ? AND unit_price = ?',
                    [targetOrderId, modifier.menu_item_id, modifier.quantity, modifier.unit_price]
                ).rows[0];

                if (targetItem) {
                    await db.query(
                        'INSERT INTO order_item_modifiers (order_item_id, modifier_id, quantity, price) VALUES (?, ?, ?, ?)',
                        [targetItem.id, modifier.modifier_id, modifier.quantity, modifier.price]
                    );
                }
            }

            // Recalculate target order total
            const items = await db.query(
                'SELECT * FROM order_items WHERE order_id = ?',
                [targetOrderId]
            ).rows;

            const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
            const taxAmount = subtotal * (targetOrder.tax_rate / 100);
            const totalAmount = subtotal + taxAmount - targetOrder.discount_amount;

            await db.query(
                'UPDATE orders SET subtotal = ?, tax_amount = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [subtotal, taxAmount, totalAmount, targetOrderId]
            );

            // Mark source orders as merged
            for (const orderId of sourceOrderIds) {
                await db.query(
                    'UPDATE orders SET status = ?, notes = CONCAT(COALESCE(notes, \'\'), ?) WHERE id = ?',
                    ['merged', '\nMerged into order ' + targetOrderId, orderId]
                );
            }

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'orders',
                targetOrderId,
                null,
                { targetOrderId, sourceOrderIds, action: 'merge' },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Orders merged successfully', targetOrderId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // KITCHEN DISPLAY SYSTEM (KDS)
    // ========================================================================

    // Initialize KDS manager
    let kdsManager = null;

    // Middleware to initialize KDS manager
    router.use('/api/kds', async (req, res, next) => {
        try {
            if (!kdsManager) {
                const KDSManager = require('./kds-manager');
                kdsManager = KDSManager;
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all KDS stations
    router.get('/api/kds/stations', authenticate, authorize('read', 'KdsStation'), async (req, res) => {
        try {
            const stations = await kdsManager.getAllStations();
            res.json(stations);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get KDS station by ID
    router.get('/api/kds/stations/:id', authenticate, authorize('read', 'KdsStation'), async (req, res) => {
        try {
            const station = await kdsManager.getStationById(req.params.id);
            if (!station) {
                return res.status(404).json({ error: 'KDS station not found' });
            }
            res.json(station);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new KDS station
    router.post('/api/kds/stations', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, displayName, description, position, isActive } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Station name is required' });
            }

            const station = await kdsManager.createStation({
                name,
                displayName: displayName || name,
                description,
                position,
                isActive
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'kds_stations',
                station.station_id,
                null,
                { name, displayName, description, position, isActive },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(station);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update KDS station
    router.put('/api/kds/stations/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, displayName, description, position, isActive } = req.body;

            const oldStation = await kdsManager.getStationById(req.params.id);
            if (!oldStation) {
                return res.status(404).json({ error: 'KDS station not found' });
            }

            const station = await kdsManager.updateStation(req.params.id, {
                name,
                displayName,
                description,
                position,
                isActive
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'kds_stations',
                req.params.id,
                oldStation,
                { name, displayName, description, position, isActive },
                req.ip,
                req.headers['user-agent']
            );

            res.json(station);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete KDS station
    router.delete('/api/kds/stations/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldStation = await kdsManager.getStationById(req.params.id);
            if (!oldStation) {
                return res.status(404).json({ error: 'KDS station not found' });
            }

            await kdsManager.deleteStation(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'kds_stations',
                req.params.id,
                oldStation,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'KDS station deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Submit order to KDS
    router.post('/api/kds/orders', authenticate, authorize('create', 'KdsOrder'), async (req, res) => {
        try {
            const { orderId, items, priority, notes, tableId, customerName, orderType } = req.body;

            if (!orderId || !items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Order ID and items are required' });
            }

            const kdsOrder = await kdsManager.submitOrderToKDS({
                orderId,
                items,
                priority: priority || false,
                notes,
                tableId,
                customerName,
                orderType: orderType || 'dine_in'
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'kds_orders',
                kdsOrder.kds_order_id,
                null,
                { orderId, items, priority, notes, tableId, customerName, orderType },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(kdsOrder);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get KDS order by ID
    router.get('/api/kds/orders/:id', authenticate, authorize('read', 'KdsOrder'), async (req, res) => {
        try {
            const kdsOrder = await kdsManager.getKDSOrderById(req.params.id);
            if (!kdsOrder) {
                return res.status(404).json({ error: 'KDS order not found' });
            }
            res.json(kdsOrder);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all KDS orders
    router.get('/api/kds/orders', authenticate, authorize('read', 'KdsOrder'), async (req, res) => {
        try {
            const { status, stationId, priorityOnly, limit } = req.query;

            const filters = {};
            if (status) filters.status = status;
            if (stationId) filters.stationId = parseInt(stationId);
            if (priorityOnly === 'true') filters.priorityOnly = true;
            if (limit) filters.limit = parseInt(limit);

            const orders = await kdsManager.getAllKDSOrders(filters);
            res.json(orders);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update KDS order status
    router.put('/api/kds/orders/:id/status', authenticate, authorize('update', 'KdsOrder'), async (req, res) => {
        try {
            const { status, changedBy, changeReason } = req.body;

            if (!status) {
                return res.status(400).json({ error: 'Status is required' });
            }

            const updatedOrder = await kdsManager.updateOrderStatus(
                req.params.id,
                status,
                changedBy || req.user.id,
                changeReason
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'kds_orders',
                req.params.id,
                null,
                { status, changedBy, changeReason },
                req.ip,
                req.headers['user-agent']
            );

            res.json(updatedOrder);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update KDS item status
    router.put('/api/kds/items/:id/status', authenticate, authorize('update', 'KdsItem'), async (req, res) => {
        try {
            const { status, changedBy, changeReason } = req.body;

            if (!status) {
                return res.status(400).json({ error: 'Status is required' });
            }

            const updatedItem = await kdsManager.updateItemStatus(
                req.params.id,
                status,
                changedBy || req.user.id,
                changeReason
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'kds_order_items',
                req.params.id,
                null,
                { status, changedBy, changeReason },
                req.ip,
                req.headers['user-agent']
            );

            res.json(updatedItem);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Bulk update item statuses
    router.put('/api/kds/items/status', authenticate, authorize('update', 'KdsItem'), async (req, res) => {
        try {
            const { updates, changedBy, changeReason } = req.body;

            if (!Array.isArray(updates) || updates.length === 0) {
                return res.status(400).json({ error: 'Updates array is required' });
            }

            const results = await kdsManager.bulkUpdateItemStatuses(
                updates,
                changedBy || req.user.id,
                changeReason
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'kds_order_items',
                null,
                null,
                { updates, changedBy, changeReason },
                req.ip,
                req.headers['user-agent']
            );

            res.json(results);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Bump KDS order (clear from display)
    router.post('/api/kds/orders/:id/bump', authenticate, authorize('update', 'KdsOrder'), async (req, res) => {
        try {
            const bumpedOrder = await kdsManager.bumpOrder(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'kds_orders',
                req.params.id,
                null,
                { action: 'bump' },
                req.ip,
                req.headers['user-agent']
            );

            res.json(bumpedOrder);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Reopen KDS order
    router.post('/api/kds/orders/:id/reopen', authenticate, authorize('update', 'KdsOrder'), async (req, res) => {
        try {
            const reopenedOrder = await kdsManager.reopenOrder(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'kds_orders',
                req.params.id,
                null,
                { action: 'reopen' },
                req.ip,
                req.headers['user-agent']
            );

            res.json(reopenedOrder);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get orders by station
    router.get('/api/kds/stations/:id/orders', authenticate, authorize('read', 'KdsOrder'), async (req, res) => {
        try {
            const { status, priorityOnly } = req.query;

            const filters = {};
            if (status) filters.status = status;
            if (priorityOnly === 'true') filters.priorityOnly = true;

            const orders = await kdsManager.getOrdersByStation(req.params.id, filters);
            res.json(orders);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get KDS statistics
    router.get('/api/kds/statistics', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const stats = await kdsManager.getStatistics();
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get KDS status history
    router.get('/api/kds/history', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { orderId, itemId } = req.query;

            const history = await kdsManager.getStatusHistory(
                orderId ? parseInt(orderId) : null,
                itemId ? parseInt(itemId) : null
            );
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // COMBO/MEAL DEALS
    // ========================================================================

    // Initialize ComboManager
    let comboManager = null;

    // Middleware to initialize ComboManager
    router.use('/api/combos', async (req, res, next) => {
        try {
            if (!comboManager) {
                const ComboManager = require('./combo-manager');
                comboManager = ComboManager;
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all active combo deals
    router.get('/api/combos', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const combos = await comboManager.getAllActiveCombos();
            res.json(combos);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get combo deal by ID
    router.get('/api/combos/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const combo = await comboManager.getById(req.params.id);
            if (!combo) {
                return res.status(404).json({ error: 'Combo not found' });
            }
            res.json(combo);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new combo deal
    router.post('/api/combos', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const {
                name,
                description,
                combo_code,
                min_quantity,
                max_quantity,
                allow_customization,
                has_discount,
                discount_type,
                discount_value,
                is_predefined
            } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Combo name is required' });
            }

            const comboId = await comboManager.createCombo({
                name,
                description,
                combo_code,
                min_quantity,
                max_quantity,
                allow_customization,
                has_discount,
                discount_type,
                discount_value,
                is_predefined
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'combo_deals',
                comboId,
                null,
                { name, description, combo_code, min_quantity, max_quantity, allow_customization, has_discount, discount_type, discount_value, is_predefined },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ id: comboId, message: 'Combo deal created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update combo deal
    router.put('/api/combos/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const {
                name,
                description,
                combo_code,
                min_quantity,
                max_quantity,
                allow_customization,
                has_discount,
                discount_type,
                discount_value,
                is_predefined,
                is_active
            } = req.body;

            const oldCombo = await comboManager.getById(req.params.id);
            if (!oldCombo) {
                return res.status(404).json({ error: 'Combo not found' });
            }

            await comboManager.updateCombo(req.params.id, {
                name,
                description,
                combo_code,
                min_quantity,
                max_quantity,
                allow_customization,
                has_discount,
                discount_type,
                discount_value,
                is_predefined,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'combo_deals',
                req.params.id,
                oldCombo,
                { name, description, combo_code, min_quantity, max_quantity, allow_customization, has_discount, discount_type, discount_value, is_predefined, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Combo deal updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add item to combo
    router.post('/api/combos/:comboId/items', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { menu_item_id, is_required, min_quantity, max_quantity, display_order } = req.body;

            if (!menu_item_id) {
                return res.status(400).json({ error: 'Menu item ID is required' });
            }

            await comboManager.addItemToCombo(
                req.params.comboId,
                menu_item_id,
                is_required !== false,
                min_quantity || 1,
                max_quantity || null,
                display_order || 0
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'combo_items',
                null,
                null,
                { combo_id: req.params.comboId, menu_item_id, is_required, min_quantity, max_quantity, display_order },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ message: 'Item added to combo successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update combo item
    router.put('/api/combo-items/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { is_required, min_quantity, max_quantity, display_order } = req.body;

            await comboManager.updateComboItem(req.params.id, {
                is_required,
                min_quantity,
                max_quantity,
                display_order
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'combo_items',
                req.params.id,
                null,
                { is_required, min_quantity, max_quantity, display_order },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Combo item updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Remove item from combo
    router.delete('/api/combo-items/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            await comboManager.removeItemFromCombo(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'combo_items',
                req.params.id,
                null,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Item removed from combo successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Set combo pricing
    router.post('/api/combos/:id/pricing', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { price, valid_from, valid_to } = req.body;

            if (!price) {
                return res.status(400).json({ error: 'Price is required' });
            }

            await comboManager.setComboPricing(req.params.id, price, valid_from, valid_to);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'combo_pricing',
                null,
                null,
                { combo_id: req.params.id, price, valid_from, valid_to },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Combo pricing set successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add combo restriction
    router.post('/api/combos/:id/restrictions', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { restriction_type, restriction_value } = req.body;

            if (!restriction_type) {
                return res.status(400).json({ error: 'Restriction type is required' });
            }

            await comboManager.addRestriction(req.params.id, restriction_type, restriction_value);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'combo_restrictions',
                null,
                null,
                { combo_id: req.params.id, restriction_type, restriction_value },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json({ message: 'Combo restriction added successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Validate combo eligibility
    router.post('/api/combos/validate', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { combo_id, cart_items } = req.body;

            if (!combo_id || !Array.isArray(cart_items)) {
                return res.status(400).json({ error: 'Combo ID and cart items are required' });
            }

            const validation = await comboManager.validateCombo(combo_id, cart_items);
            res.json(validation);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Find applicable combos for cart
    router.post('/api/combos/find-applicable', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { cart_items } = req.body;

            if (!Array.isArray(cart_items)) {
                return res.status(400).json({ error: 'Cart items are required' });
            }

            const applicableCombos = await comboManager.findApplicableCombos(cart_items);
            res.json(applicableCombos);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Apply combo to cart
    router.post('/api/combos/apply', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { combo_id, cart_items } = req.body;

            if (!combo_id || !Array.isArray(cart_items)) {
                return res.status(400).json({ error: 'Combo ID and cart items are required' });
            }

            const combo = await comboManager.getById(combo_id);
            if (!combo) {
                return res.status(404).json({ error: 'Combo not found' });
            }

            const updatedItems = comboManager.applyComboToCart(cart_items, combo);
            res.json({ items: updatedItems, combo });
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

    // ========================================================================
    // WEIGHTED ITEMS MANAGEMENT
    // ========================================================================

    // Initialize WeightManager
    let weightManager = null;

    // Middleware to initialize WeightManager
    router.use('/api/weight', async (req, res, next) => {
        try {
            if (!weightManager) {
                const WeightManager = require('./weight-manager');
                const db = require('./database');
                weightManager = new WeightManager(db.getDatabase());
                await weightManager.init();
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all weighted items
    router.get('/api/weight/items', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { activeOnly } = req.query;
            const weightedItems = await weightManager.getAllWeightedItems(activeOnly !== 'false');
            res.json(weightedItems);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get weighted item by ID
    router.get('/api/weight/items/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const weightedItem = await weightManager.getWeightedItem(req.params.id);
            if (!weightedItem) {
                return res.status(404).json({ error: 'Weighted item not found' });
            }
            res.json(weightedItem);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get weighted item by menu item ID
    router.get('/api/weight/menu-items/:menuItemId', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const weightedItem = await weightManager.getWeightedItemByMenuItemId(req.params.menuItemId);
            if (!weightedItem) {
                return res.status(404).json({ error: 'Menu item is not configured as weighted' });
            }
            res.json(weightedItem);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create weighted item
    router.post('/api/weight/items', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { menu_item_id, unit_weight, min_weight, max_weight, weight_unit, is_active } = req.body;

            if (!menu_item_id) {
                return res.status(400).json({ error: 'Menu item ID is required' });
            }

            const weightedItem = await weightManager.createWeightedItem({
                menu_item_id,
                unit_weight,
                min_weight,
                max_weight,
                weight_unit,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'weighted_items',
                weightedItem.id,
                null,
                { menu_item_id, unit_weight, min_weight, max_weight, weight_unit, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(weightedItem);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update weighted item
    router.put('/api/weight/items/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { unit_weight, min_weight, max_weight, weight_unit, is_active } = req.body;

            const oldItem = await weightManager.getWeightedItem(req.params.id);
            if (!oldItem) {
                return res.status(404).json({ error: 'Weighted item not found' });
            }

            const weightedItem = await weightManager.updateWeightedItem(req.params.id, {
                unit_weight,
                min_weight,
                max_weight,
                weight_unit,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'weighted_items',
                req.params.id,
                oldItem,
                { unit_weight, min_weight, max_weight, weight_unit, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json(weightedItem);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete weighted item
    router.delete('/api/weight/items/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const oldItem = await weightManager.getWeightedItem(req.params.id);
            if (!oldItem) {
                return res.status(404).json({ error: 'Weighted item not found' });
            }

            const result = await weightManager.deleteWeightedItem(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'weighted_items',
                req.params.id,
                oldItem,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get pricing tiers for a weighted item
    router.get('/api/weight/items/:itemId/tiers', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { activeOnly } = req.query;
            const tiers = await weightManager.getPricingTiersForWeightedItem(req.params.itemId, activeOnly !== 'false');
            res.json(tiers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create pricing tier
    router.post('/api/weight/tiers', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { weighted_item_id, min_weight, max_weight, price, display_order, is_active } = req.body;

            if (!weighted_item_id || min_weight === undefined || max_weight === undefined || price === undefined) {
                return res.status(400).json({ error: 'Weighted item ID, min weight, max weight, and price are required' });
            }

            const tier = await weightManager.createPricingTier({
                weighted_item_id,
                min_weight,
                max_weight,
                price,
                display_order,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'weight_pricing_tiers',
                tier.id,
                null,
                { weighted_item_id, min_weight, max_weight, price, display_order, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(tier);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update pricing tier
    router.put('/api/weight/tiers/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { min_weight, max_weight, price, display_order, is_active } = req.body;

            const oldTier = await weightManager.getPricingTier(req.params.id);
            if (!oldTier) {
                return res.status(404).json({ error: 'Pricing tier not found' });
            }

            const tier = await weightManager.updatePricingTier(req.params.id, {
                min_weight,
                max_weight,
                price,
                display_order,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'weight_pricing_tiers',
                req.params.id,
                oldTier,
                { min_weight, max_weight, price, display_order, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json(tier);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete pricing tier
    router.delete('/api/weight/tiers/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const oldTier = await weightManager.getPricingTier(req.params.id);
            if (!oldTier) {
                return res.status(404).json({ error: 'Pricing tier not found' });
            }

            const result = await weightManager.deletePricingTier(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'weight_pricing_tiers',
                req.params.id,
                oldTier,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Calculate price by weight
    router.post('/api/weight/calculate-price', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { menu_item_id, weight, weight_unit } = req.body;

            if (!menu_item_id || weight === undefined) {
                return res.status(400).json({ error: 'Menu item ID and weight are required' });
            }

            const result = await weightManager.calculatePriceByWeight(menu_item_id, weight, weight_unit);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    // Initialize weight tracking for an item
    router.post('/api/weight/inventory/:menuItemId/init', authenticate, authorize('manage_inventory'), async (req, res) => {
        try {
            const { current_weight, max_weight, weight_unit } = req.body;

            if (current_weight === undefined || max_weight === undefined) {
                return res.status(400).json({ error: 'Current weight and max weight are required' });
            }

            const result = await weightManager.initializeInventoryWeight(
                req.params.menuItemId,
                current_weight,
                max_weight,
                weight_unit || 'gram'
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'inventory_items',
                null,
                null,
                { menu_item_id: req.params.menuItemId, current_weight, max_weight, weight_unit },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get inventory weight for an item
    router.get('/api/weight/inventory/:menuItemId', authenticate, authorize('manage_inventory'), async (req, res) => {
        try {
            const inventory = await weightManager.getInventoryWeight(req.params.menuItemId);
            if (!inventory) {
                return res.status(404).json({ error: 'Inventory weight not found for this item' });
            }
            res.json(inventory);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update inventory weight after sale
    router.post('/api/weight/inventory/:menuItemId/update', authenticate, authorize('manage_inventory'), async (req, res) => {
        try {
            const { weight_used, weight_unit, order_id, order_item_id } = req.body;

            if (weight_used === undefined) {
                return res.status(400).json({ error: 'Weight used is required' });
            }

            const result = await weightManager.updateInventoryWeight(
                req.params.menuItemId,
                weight_used,
                weight_unit || 'gram',
                order_id,
                order_item_id
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'inventory_items',
                null,
                null,
                { menu_item_id: req.params.menuItemId, weight_used, weight_unit, order_id, order_item_id },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    // Restock inventory weight
    router.post('/api/weight/inventory/:menuItemId/restock', authenticate, authorize('manage_inventory'), async (req, res) => {
        try {
            const { weight_added, weight_unit } = req.body;

            if (weight_added === undefined) {
                return res.status(400).json({ error: 'Weight added is required' });
            }

            const result = await weightManager.restockInventoryWeight(
                req.params.menuItemId,
                weight_added,
                weight_unit || 'gram'
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'inventory_items',
                null,
                null,
                { menu_item_id: req.params.menuItemId, weight_added, weight_unit },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get weight usage history
    router.get('/api/weight/inventory/:menuItemId/history', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { limit } = req.query;
            const history = await weightManager.getWeightUsageHistory(
                req.params.menuItemId,
                limit ? parseInt(limit) : 50
            );
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Check if item is weighted
    router.get('/api/weight/check/:menuItemId', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const isWeighted = await weightManager.isWeightedItem(req.params.menuItemId);
            res.json({ is_weighted: isWeighted });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // OFFLINE MODE SYNCHRONIZATION
    // ========================================================================

    // Initialize database manager for offline sync
    let dbManager = null;

    // Middleware to initialize database manager
    router.use('/api/offline', async (req, res, next) => {
        try {
            if (!dbManager) {
                const { DatabaseManager } = require('./database-manager');
                const logger = require('./logger');
                dbManager = new DatabaseManager();
                await dbManager.initializeDatabase();
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get sync status
    router.get('/api/offline/status', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const syncManager = require('./sync-manager');
            const status = syncManager.getSyncStatus();

            // Get additional stats
            const stats = await dbManager.getSyncStatistics();
            const metadata = await dbManager.getSyncMetadata();

            res.json({
                ...status,
                ...stats,
                metadata,
                isOffline: offlineManager.isCurrentlyOffline()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Manual sync trigger
    router.post('/api/offline/sync', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const syncManager = require('./sync-manager');

            // Start sync in background
            syncManager.manualSync().then(() => {
                res.json({ message: 'Sync started successfully' });
            }).catch((error) => {
                res.status(500).json({ error: error.message });
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get pending operations
    router.get('/api/offline/operations', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { status, entityType, limit } = req.query;
            const operations = await dbManager.getPendingOfflineOperations(
                status || 'pending',
                entityType || null,
                limit ? parseInt(limit) : null
            );
            res.json(operations);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get sync history
    router.get('/api/offline/history', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { limit, status, entityType } = req.query;
            let query = 'SELECT * FROM sync_history';
            const params = [];

            if (status) {
                query += ' WHERE status = ?';
                params.push(status);
            }

            if (entityType) {
                query += (params.length > 0 ? ' AND' : ' WHERE') + ' entity_type = ?';
                params.push(entityType);
            }

            query += ' ORDER BY completed_at DESC';

            if (limit) {
                query += ' LIMIT ?';
                params.push(parseInt(limit));
            }

            const history = await dbManager.query(query, params);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get sync sessions
    router.get('/api/offline/sessions', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { limit, status } = req.query;

            if (status === 'active') {
                const sessions = await dbManager.getActiveSyncSessions();
                res.json(sessions);
            } else {
                const sessions = await dbManager.getRecentSyncSessions(limit ? parseInt(limit) : 10);
                res.json(sessions);
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get sync session by ID
    router.get('/api/offline/sessions/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const session = await dbManager.getSyncSession(req.params.id);
            if (!session) {
                return res.status(404).json({ error: 'Sync session not found' });
            }
            res.json(session);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get unresolved conflicts
    router.get('/api/offline/conflicts', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { entityType } = req.query;
            const conflicts = await dbManager.getUnresolvedConflicts(entityType || null);
            res.json(conflicts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Resolve conflict
    router.post('/api/offline/conflicts/:id/resolve', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { resolvedVersion, resolutionStrategy, notes } = req.body;

            if (!resolvedVersion || !resolutionStrategy) {
                return res.status(400).json({ error: 'Resolved version and resolution strategy are required' });
            }

            const conflict = await dbManager.resolveConflict(
                req.params.id,
                resolvedVersion,
                resolutionStrategy,
                req.user.id,
                notes || null
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'conflict_resolution',
                req.params.id,
                null,
                { resolvedVersion, resolutionStrategy, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(conflict);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Verify data integrity
    router.post('/api/offline/verify-integrity', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await dbManager.verifyDataIntegrity();
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get sync queue statistics
    router.get('/api/offline/queue/stats', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const stats = await dbManager.getSyncStatistics();
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get sync metadata
    router.get('/api/offline/metadata', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const metadata = await dbManager.getSyncMetadata();
            res.json(metadata);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update sync metadata
    router.put('/api/offline/metadata', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { last_sync_timestamp, last_full_sync_timestamp, last_known_server_version } = req.body;

            const metadata = await dbManager.updateSyncMetadata({
                last_sync_timestamp,
                last_full_sync_timestamp,
                last_known_server_version
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'sync_metadata',
                1,
                null,
                { last_sync_timestamp, last_full_sync_timestamp, last_known_server_version },
                req.ip,
                req.headers['user-agent']
            );

            res.json(metadata);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get network status
    router.get('/api/offline/network-status', async (req, res) => {
        try {
            const offlineManager = require('./offline-manager');
            res.json({
                isOffline: offlineManager.isCurrentlyOffline(),
                pendingOperations: offlineManager.getPendingOperationsCount()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // SPLIT BILLING
    // ========================================================================

    // Initialize SplitBillManager
    let splitBillManager = null;

    // Middleware to initialize SplitBillManager
    router.use('/api/split-bills', async (req, res, next) => {
        try {
            if (!splitBillManager) {
                const SplitBillManager = require('./split-bill-manager');
                const db = require('./database');
                splitBillManager = new SplitBillManager(db.getDatabase());
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Create split bill session
    router.post('/api/split-bills', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { orderId, totalSplits, splitMethod, notes } = req.body;

            if (!orderId || !totalSplits || !splitMethod) {
                return res.status(400).json({ error: 'Order ID, total splits, and split method are required' });
            }

            const session = await splitBillManager.createSplitBillSession({
                orderId,
                totalSplits,
                splitMethod,
                notes: notes || ''
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'split_bill_sessions',
                session.id,
                null,
                { orderId, totalSplits, splitMethod, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(session);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get split bill session by ID
    router.get('/api/split-bills/:id', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const session = await splitBillManager.getSplitBillSession(req.params.id);
            if (!session) {
                return res.status(404).json({ error: 'Split bill session not found' });
            }
            res.json(session);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all split bill sessions for an order
    router.get('/api/orders/:orderId/split-bills', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const sessions = await splitBillManager.getActiveSessionsForOrder(req.params.orderId);
            res.json(sessions);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Split order items by item count
    router.post('/api/split-bills/:id/split-by-count', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { totalSplits } = req.body;

            if (!totalSplits) {
                return res.status(400).json({ error: 'Total splits is required' });
            }

            const result = await splitBillManager.splitByItemCount(req.params.id, totalSplits);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'split_bill_items',
                req.params.id,
                null,
                { action: 'split_by_count', totalSplits },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Split order items by custom amounts
    router.post('/api/split-bills/:id/split-by-amount', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { splitAmounts } = req.body;

            if (!Array.isArray(splitAmounts) || splitAmounts.length === 0) {
                return res.status(400).json({ error: 'Split amounts array is required' });
            }

            const result = await splitBillManager.splitByAmount(req.params.id, splitAmounts);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'split_bill_items',
                req.params.id,
                null,
                { action: 'split_by_amount', splitAmounts },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Assign customers to splits
    router.post('/api/split-bills/:id/customers', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { customerAssignments } = req.body;

            if (!Array.isArray(customerAssignments)) {
                return res.status(400).json({ error: 'Customer assignments array is required' });
            }

            const result = await splitBillManager.assignCustomersToSplits(req.params.id, customerAssignments);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'split_bill_customers',
                req.params.id,
                null,
                { action: 'assign_customers', customerAssignments },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get split items for a session
    router.get('/api/split-bills/:id/items', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const items = await splitBillManager.getSplitItems(req.params.id);
            res.json(items);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get split payments for a session
    router.get('/api/split-bills/:id/payments', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { splitNumber } = req.query;
            const payments = await splitBillManager.getSplitPayments(req.params.id, splitNumber ? parseInt(splitNumber) : null);
            res.json(payments);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get customer assignments for a session
    router.get('/api/split-bills/:id/customers', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const customers = await splitBillManager.getCustomerAssignments(req.params.id);
            res.json(customers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Process payment for a split
    router.post('/api/split-bills/:id/payments', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { splitNumber, amount, paymentMethod, transactionId } = req.body;

            if (!splitNumber || !amount || !paymentMethod) {
                return res.status(400).json({ error: 'Split number, amount, and payment method are required' });
            }

            const result = await splitBillManager.processSplitPayment({
                sessionId: req.params.id,
                splitNumber,
                amount,
                paymentMethod,
                transactionId: transactionId || null,
                userId: req.user.id
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'split_bill_payments',
                result.paymentId,
                null,
                { sessionId: req.params.id, splitNumber, amount, paymentMethod, transactionId },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get split bill summary
    router.get('/api/split-bills/:id/summary', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const summary = await splitBillManager.getSplitBillSummary(req.params.id);
            res.json(summary);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Merge split bills
    router.post('/api/split-bills/:id/merge', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const result = await splitBillManager.mergeSplitBills(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'split_bill_sessions',
                req.params.id,
                null,
                { action: 'merge' },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Remove item from split
    router.delete('/api/split-bills/:id/items/:itemId', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            await splitBillManager.removeItemFromSplit(req.params.id, req.params.itemId);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'split_bill_items',
                null,
                null,
                { sessionId: req.params.id, itemId: req.params.itemId },
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Item removed from split successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // VOID/REFUND WORKFLOW
    // ========================================================================

    // Initialize VoidRefundManager
    let voidRefundManager = null;

    // Middleware to initialize VoidRefundManager
    router.use('/api/void-refund', async (req, res, next) => {
        try {
            if (!voidRefundManager) {
                const VoidRefundManager = require('./void-refund-manager');
                const db = require('./database');
                const logger = require('./logger');
                voidRefundManager = new VoidRefundManager(db.getDatabase(), logger);
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get void/refund reasons
    router.get('/api/void-refund/reasons', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const reasons = await voidRefundManager.getVoidRefundReasons();
            res.json(reasons);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Request void/refund
    router.post('/api/void-refund/request', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const {
                requestType,
                orderId,
                itemId,
                paymentId,
                reasonCode,
                reasonDetails,
                quantity,
                amount,
                notes
            } = req.body;

            if (!requestType || !['VOID', 'REFUND'].includes(requestType)) {
                return res.status(400).json({ error: 'Invalid request type. Must be VOID or REFUND' });
            }

            if (!orderId) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            if (!reasonCode) {
                return res.status(400).json({ error: 'Reason code is required' });
            }

            const result = await voidRefundManager.requestVoidRefund({
                requestType,
                orderId,
                itemId: itemId || null,
                paymentId: paymentId || null,
                reasonCode,
                reasonDetails: reasonDetails || '',
                requestedBy: req.user.id,
                quantity: quantity || null,
                amount: amount || null,
                notes: notes || ''
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'void_refund_requests',
                result.requestId,
                null,
                { requestType, orderId, itemId, paymentId, reasonCode, reasonDetails, quantity, amount, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Approve void/refund request
    router.post('/api/void-refund/approve', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { requestId, approvalStatus, comments } = req.body;

            if (!requestId) {
                return res.status(400).json({ error: 'Request ID is required' });
            }

            if (approvalStatus === undefined) {
                return res.status(400).json({ error: 'Approval status is required' });
            }

            const result = await voidRefundManager.approveVoidRefund({
                requestId,
                approvalStatus: Boolean(approvalStatus),
                approvedBy: req.user.id,
                comments: comments || ''
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                approvalStatus ? 'approve' : 'reject',
                'void_refund_requests',
                requestId,
                null,
                { approvalStatus, comments },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Process void/refund request
    router.post('/api/void-refund/process', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { requestId } = req.body;

            if (!requestId) {
                return res.status(400).json({ error: 'Request ID is required' });
            }

            const result = await voidRefundManager.processVoidRefund({
                requestId,
                processedBy: req.user.id
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'process',
                'void_refund_requests',
                requestId,
                null,
                { action: 'process' },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get void/refund history for an order
    router.get('/api/void-refund/orders/:orderId/history', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const history = await voidRefundManager.getVoidRefundHistory(req.params.orderId);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get void/refund audit logs
    router.get('/api/void-refund/requests/:requestId/audit-logs', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const logs = await voidRefundManager.getAuditLogs(req.params.requestId);
            res.json(logs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get pending void/refund requests
    router.get('/api/void-refund/pending', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const requests = await voidRefundManager.getPendingRequests();
            res.json(requests);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Verify manager PIN
    router.post('/api/void-refund/verify-pin', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { pin } = req.body;

            if (!pin) {
                return res.status(400).json({ error: 'PIN is required' });
            }

            const result = await voidRefundManager.verifyManagerPin(pin);

            // Log audit (without the actual PIN)
            await reportingManager.logAudit(
                req.user.id,
                'verify_pin',
                'manager_auth',
                null,
                null,
                { pin_verified: result.success },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Check if order can be voided
    router.get('/api/void-refund/orders/:orderId/check', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const db = require('./database');

            // Get order details
            const order = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.orderId]).rows[0];

            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            // Check if order is already voided
            if (order.void_status !== 'ACTIVE') {
                return res.json({
                    canVoid: false,
                    reason: 'Order is already voided'
                });
            }

            // Check time limit (24 hours)
            const orderTime = new Date(order.created_at);
            const currentTime = new Date();
            const timeDiffHours = (currentTime - orderTime) / (1000 * 60 * 60);

            if (timeDiffHours > 24) {
                return res.json({
                    canVoid: false,
                    reason: 'Void can only be requested within 24 hours of order creation'
                });
            }

            // Check if order is paid
            const payments = await db.query('SELECT * FROM payments WHERE order_id = ?', [req.params.orderId]).rows;
            const hasPayments = payments.length > 0;

            res.json({
                canVoid: true,
                isPaid: hasPayments,
                requiresApproval: hasPayments,
                timeRemaining: Math.max(0, 24 - timeDiffHours).toFixed(2)
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Check if payment can be refunded
    router.get('/api/void-refund/payments/:paymentId/check', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const db = require('./database');

            // Get payment details
            const payment = await db.query('SELECT * FROM payments WHERE id = ?', [req.params.paymentId]).rows[0];

            if (!payment) {
                return res.status(404).json({ error: 'Payment not found' });
            }

            // Check if already refunded
            if (payment.refund_status === 'FULLY_REFUNDED') {
                return res.json({
                    canRefund: false,
                    reason: 'Payment already fully refunded'
                });
            }

            // Check if order is voided
            const order = await db.query('SELECT void_status FROM orders WHERE id = ?', [payment.order_id]).rows[0];
            if (order && order.void_status === 'VOIDED') {
                return res.json({
                    canRefund: false,
                    reason: 'Order is voided'
                });
            }

            res.json({
                canRefund: true,
                requiresApproval: true,
                currentStatus: payment.refund_status
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // RECIPE/BOM MANAGEMENT
    // ========================================================================

    // Initialize RecipeManager
    let recipeManager = null;

    // Middleware to initialize RecipeManager
    router.use('/api/recipes', async (req, res, next) => {
        try {
            if (!recipeManager) {
                const RecipeManager = require('./recipe-manager');
                const db = require('./database');
                const logger = require('./logger');
                recipeManager = new RecipeManager(db.getDatabase(), logger);
                await recipeManager.init();
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all recipes
    router.get('/api/recipes', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { activeOnly, menuItemId } = req.query;
            const recipes = await recipeManager.getAllRecipes(activeOnly !== 'false', menuItemId || null);
            res.json(recipes);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get recipe by ID
    router.get('/api/recipes/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const recipe = await recipeManager.getRecipeById(req.params.id);
            if (!recipe) {
                return res.status(404).json({ error: 'Recipe not found' });
            }
            res.json(recipe);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new recipe
    router.post('/api/recipes', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { name, menu_item_id, description, is_active, notes } = req.body;

            if (!name || !menu_item_id) {
                return res.status(400).json({ error: 'Name and menu item ID are required' });
            }

            const recipe = await recipeManager.createRecipe({
                name,
                menu_item_id,
                description,
                is_active,
                notes
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'recipes',
                recipe.id,
                null,
                { name, menu_item_id, description, is_active, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(recipe);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update recipe
    router.put('/api/recipes/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { name, menu_item_id, description, is_active, notes } = req.body;

            const oldRecipe = await recipeManager.getRecipeById(req.params.id);
            if (!oldRecipe) {
                return res.status(404).json({ error: 'Recipe not found' });
            }

            const recipe = await recipeManager.updateRecipe(req.params.id, {
                name,
                menu_item_id,
                description,
                is_active,
                notes
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'recipes',
                req.params.id,
                oldRecipe,
                { name, menu_item_id, description, is_active, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(recipe);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete recipe (soft delete)
    router.delete('/api/recipes/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const oldRecipe = await recipeManager.getRecipeById(req.params.id);
            if (!oldRecipe) {
                return res.status(404).json({ error: 'Recipe not found' });
            }

            await recipeManager.deleteRecipe(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'recipes',
                req.params.id,
                oldRecipe,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Recipe deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get recipe ingredients
    router.get('/api/recipes/:id/ingredients', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const ingredients = await recipeManager.getRecipeIngredients(req.params.id);
            res.json(ingredients);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add ingredient to recipe
    router.post('/api/recipes/:id/ingredients', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { menu_item_id, quantity, unit, is_weighted, display_order, notes } = req.body;

            if (!menu_item_id || quantity === undefined) {
                return res.status(400).json({ error: 'Menu item ID and quantity are required' });
            }

            const ingredient = await recipeManager.addIngredientToRecipe(
                req.params.id,
                menu_item_id,
                quantity,
                unit || 'unit',
                is_weighted || false,
                display_order || 0,
                notes || ''
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'recipe_ingredients',
                ingredient.id,
                null,
                { recipe_id: req.params.id, menu_item_id, quantity, unit, is_weighted, display_order, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(ingredient);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update recipe ingredient
    router.put('/api/recipe-ingredients/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { quantity, unit, is_weighted, display_order, notes } = req.body;

            const oldIngredient = await recipeManager.getRecipeIngredient(req.params.id);
            if (!oldIngredient) {
                return res.status(404).json({ error: 'Recipe ingredient not found' });
            }

            const ingredient = await recipeManager.updateRecipeIngredient(req.params.id, {
                quantity,
                unit,
                is_weighted,
                display_order,
                notes
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'recipe_ingredients',
                req.params.id,
                oldIngredient,
                { quantity, unit, is_weighted, display_order, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(ingredient);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Remove ingredient from recipe
    router.delete('/api/recipe-ingredients/:id', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const oldIngredient = await recipeManager.getRecipeIngredient(req.params.id);
            if (!oldIngredient) {
                return res.status(404).json({ error: 'Recipe ingredient not found' });
            }

            await recipeManager.removeIngredientFromRecipe(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'recipe_ingredients',
                req.params.id,
                oldIngredient,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Ingredient removed from recipe successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get ingredient conversion rates
    router.get('/api/recipes/ingredients/:ingredientId/conversion-rates', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const rates = await recipeManager.getConversionRatesForIngredient(req.params.ingredientId);
            res.json(rates);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Set ingredient conversion rate
    router.post('/api/recipes/ingredients/:ingredientId/conversion-rates', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const { from_unit, to_unit, conversion_factor, is_active } = req.body;

            if (!from_unit || !to_unit || conversion_factor === undefined) {
                return res.status(400).json({ error: 'From unit, to unit, and conversion factor are required' });
            }

            const rate = await recipeManager.setConversionRate(
                req.params.ingredientId,
                from_unit,
                to_unit,
                conversion_factor,
                is_active
            );

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'ingredient_conversion_rates',
                rate.id,
                null,
                { ingredient_id: req.params.ingredientId, from_unit, to_unit, conversion_factor, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(rate);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Calculate recipe cost
    router.get('/api/recipes/:id/calculate-cost', authenticate, authorize('manage_menu'), async (req, res) => {
        try {
            const cost = await recipeManager.calculateRecipeCost(req.params.id);
            res.json({ recipe_cost: cost });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Check recipe ingredient availability
    router.get('/api/recipes/:id/check-availability', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { quantity } = req.query;
            const availability = await recipeManager.checkRecipeIngredientAvailability(
                req.params.id,
                quantity ? parseInt(quantity) : 1
            );
            res.json(availability);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get recipe usage history
    router.get('/api/recipes/:id/usage-history', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { limit } = req.query;
            const history = await recipeManager.getRecipeUsageHistory(
                req.params.id,
                limit ? parseInt(limit) : 50
            );
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get recipe reports

    // ========================================================================
    // HARDWARE MANAGEMENT
    // ========================================================================

    // Initialize HardwareManager
    let hardwareManager = null;

    // Middleware to initialize HardwareManager
    router.use('/api/hardware', async (req, res, next) => {
        try {
            if (!hardwareManager) {
                const HardwareManager = require('./hardware-manager');
                const db = require('./database');
                const logger = require('./logger');
                hardwareManager = new HardwareManager(db.getDatabase(), logger);
                await hardwareManager.init();
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all hardware devices
    router.get('/api/hardware/devices', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { deviceType, status, connectionType } = req.query;
            const devices = await hardwareManager.getAllDevices({
                deviceType: deviceType || null,
                status: status || null,
                connectionType: connectionType || null
            });
            res.json(devices);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get hardware device by ID
    router.get('/api/hardware/devices/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const device = await hardwareManager.getDeviceById(req.params.id);
            if (!device) {
                return res.status(404).json({ error: 'Hardware device not found' });
            }
            res.json(device);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new hardware device
    router.post('/api/hardware/devices', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { device_name, device_type, device_identifier, connection_type, location_id, is_active, config } = req.body;

            if (!device_name || !device_type || !device_identifier || !connection_type) {
                return res.status(400).json({ error: 'Device name, type, identifier, and connection type are required' });
            }

            const device = await hardwareManager.createDevice({
                device_name,
                device_type,
                device_identifier,
                connection_type,
                location_id: location_id || 1,
                is_active: is_active !== false,
                config: config || {}
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'hardware_devices',
                device.id,
                null,
                { device_name, device_type, device_identifier, connection_type, location_id, is_active, config },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(device);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update hardware device
    router.put('/api/hardware/devices/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { device_name, device_type, device_identifier, connection_type, location_id, is_active, config } = req.body;

            const oldDevice = await hardwareManager.getDeviceById(req.params.id);
            if (!oldDevice) {
                return res.status(404).json({ error: 'Hardware device not found' });
            }

            const device = await hardwareManager.updateDevice(req.params.id, {
                device_name,
                device_type,
                device_identifier,
                connection_type,
                location_id,
                is_active,
                config
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'hardware_devices',
                req.params.id,
                oldDevice,
                { device_name, device_type, device_identifier, connection_type, location_id, is_active, config },
                req.ip,
                req.headers['user-agent']
            );

            res.json(device);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete hardware device
    router.delete('/api/hardware/devices/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldDevice = await hardwareManager.getDeviceById(req.params.id);
            if (!oldDevice) {
                return res.status(404).json({ error: 'Hardware device not found' });
            }

            await hardwareManager.deleteDevice(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'hardware_devices',
                req.params.id,
                oldDevice,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Hardware device deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get device configuration
    router.get('/api/hardware/devices/:id/config', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const config = await hardwareManager.getDeviceConfig(req.params.id);
            if (!config) {
                return res.status(404).json({ error: 'Device configuration not found' });
            }
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update device configuration
    router.put('/api/hardware/devices/:id/config', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { config } = req.body;

            if (!config) {
                return res.status(400).json({ error: 'Configuration is required' });
            }

            const oldConfig = await hardwareManager.getDeviceConfig(req.params.id);
            const updatedConfig = await hardwareManager.updateDeviceConfig(req.params.id, config);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'hardware_device_configs',
                req.params.id,
                oldConfig,
                { config },
                req.ip,
                req.headers['user-agent']
            );

            res.json(updatedConfig);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get device status
    router.get('/api/hardware/devices/:id/status', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const status = await hardwareManager.getDeviceStatus(req.params.id);
            if (!status) {
                return res.status(404).json({ error: 'Device status not found' });
            }
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all device statuses
    router.get('/api/hardware/status', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const statuses = await hardwareManager.getAllDeviceStatuses();
            res.json(statuses);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Test device connection
    router.post('/api/hardware/devices/:id/test', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await hardwareManager.testDeviceConnection(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get device logs
    router.get('/api/hardware/devices/:id/logs', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { limit, logLevel } = req.query;
            const logs = await hardwareManager.getDeviceLogs(req.params.id, {
                limit: limit ? parseInt(limit) : 100,
                logLevel: logLevel || null
            });
            res.json(logs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Clear device logs
    router.delete('/api/hardware/devices/:id/logs', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            await hardwareManager.clearDeviceLogs(req.params.id);
            res.json({ message: 'Device logs cleared successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // ESC/POS PRINTER MANAGEMENT
    // ========================================================================

    // Get all ESC/POS printers
    router.get('/api/hardware/printers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const printers = await hardwareManager.getPrinters();
            res.json(printers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get ESC/POS printer by ID
    router.get('/api/hardware/printers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const printer = await hardwareManager.getPrinterById(req.params.id);
            if (!printer) {
                return res.status(404).json({ error: 'ESC/POS printer not found' });
            }
            res.json(printer);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Test printer connection
    router.post('/api/hardware/printers/:id/test', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await hardwareManager.testPrinterConnection(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Print test page
    router.post('/api/hardware/printers/:id/test-print', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await hardwareManager.printTestPage(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get print jobs
    router.get('/api/hardware/printers/:id/jobs', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { status, limit } = req.query;
            const jobs = await hardwareManager.getPrintJobs(req.params.id, {
                status: status || null,
                limit: limit ? parseInt(limit) : 50
            });
            res.json(jobs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create print job
    router.post('/api/hardware/printers/:id/jobs', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { job_type, content, copies, priority } = req.body;

            if (!job_type || !content) {
                return res.status(400).json({ error: 'Job type and content are required' });
            }

            const job = await hardwareManager.createPrintJob({
                device_id: req.params.id,
                job_type,
                content,
                copies: copies || 1,
                priority: priority || false,
                created_by: req.user.id
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'print_jobs',
                job.id,
                null,
                { device_id: req.params.id, job_type, content, copies, priority },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(job);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get print job by ID
    router.get('/api/hardware/print-jobs/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const job = await hardwareManager.getPrintJob(req.params.id);
            if (!job) {
                return res.status(404).json({ error: 'Print job not found' });
            }
            res.json(job);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Retry failed print job
    router.post('/api/hardware/print-jobs/:id/retry', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await hardwareManager.retryPrintJob(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Cancel print job
    router.post('/api/hardware/print-jobs/:id/cancel', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await hardwareManager.cancelPrintJob(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // CUSTOMER FACING DISPLAY (CFD) MANAGEMENT
    // ========================================================================

    // Get all CFD displays
    router.get('/api/hardware/cfds', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const cfds = await hardwareManager.getCFDs();
            res.json(cfds);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get CFD by ID
    router.get('/api/hardware/cfds/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const cfd = await hardwareManager.getCFDById(req.params.id);
            if (!cfd) {
                return res.status(404).json({ error: 'CFD display not found' });
            }
            res.json(cfd);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Test CFD connection
    router.post('/api/hardware/cfds/:id/test', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await hardwareManager.testCFDConnection(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Send test message to CFD
    router.post('/api/hardware/cfds/:id/test-message', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await hardwareManager.sendTestMessageToCFD(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get CFD content
    router.get('/api/hardware/cfds/:id/content', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const content = await hardwareManager.getCFDContent(req.params.id);
            res.json(content);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update CFD content
    router.put('/api/hardware/cfds/:id/content', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { content_type, content_data, display_duration } = req.body;

            if (!content_type || !content_data) {
                return res.status(400).json({ error: 'Content type and content data are required' });
            }

            const result = await hardwareManager.updateCFDContent(req.params.id, {
                content_type,
                content_data,
                display_duration: display_duration || 30
            });

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Clear CFD content
    router.delete('/api/hardware/cfds/:id/content', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            await hardwareManager.clearCFDContent(req.params.id);
            res.json({ message: 'CFD content cleared successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // HARDWARE REPORTS
    // ========================================================================

    // Get hardware device summary
    router.get('/api/reports/hardware/device-summary', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const summary = await reportingManager.getHardwareDeviceSummary();
            res.json(summary);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get printer usage report
    router.get('/api/reports/hardware/printer-usage', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const report = await reportingManager.getPrinterUsageReport(startDate, endDate);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get CFD usage report
    router.get('/api/reports/hardware/cfd-usage', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const report = await reportingManager.getCFDUsageReport(startDate, endDate);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get print job history
    router.get('/api/reports/hardware/print-jobs', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { deviceId, startDate, endDate, limit } = req.query;
            const history = await reportingManager.getPrintJobHistory(
                deviceId || null,
                startDate || null,
                endDate || null,
                limit ? parseInt(limit) : 100
            );
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get device status history
    router.get('/api/reports/hardware/device-status', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { deviceId, startDate, endDate, limit } = req.query;
            const history = await reportingManager.getDeviceStatusHistory(
                deviceId || null,
                startDate || null,
                endDate || null,
                limit ? parseInt(limit) : 100
            );
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get hardware error report
    router.get('/api/reports/hardware/errors', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, limit } = req.query;
            const report = await reportingManager.getHardwareErrorReport(
                startDate || null,
                endDate || null,
                limit ? parseInt(limit) : 100
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get hardware connectivity report
    router.get('/api/reports/hardware/connectivity', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const report = await reportingManager.getHardwareConnectivityReport(startDate, endDate);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get hardware daily activity report
    router.get('/api/reports/hardware/daily-activity', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { date } = req.query;
            if (!date) {
                return res.status(400).json({ error: 'Date is required' });
            }
            const report = await reportingManager.getHardwareDailyActivityReport(date);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // ONLINE ORDER INTEGRATION
    // ========================================================================

    // Initialize OnlineOrderManager
    let onlineOrderManager = null;
    let onlineOrderApi = null;

    // Middleware to initialize OnlineOrderManager
    router.use('/api/online-orders', async (req, res, next) => {
        try {
            if (!onlineOrderManager) {
                const OnlineOrderManager = require('./online-order-manager');
                const OnlineOrderApi = require('./online-order-api');
                const db = require('./database');
                const logger = require('./logger');
                onlineOrderManager = new OnlineOrderManager(db.getDatabase(), logger);
                onlineOrderApi = new OnlineOrderApi(db.getDatabase(), logger);
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all online order providers
    router.get('/api/online-orders/providers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const providers = await onlineOrderManager.getAllProviders();
            res.json(providers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online order provider by ID
    router.get('/api/online-orders/providers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const provider = await onlineOrderManager.getProviderById(req.params.id);
            if (!provider) {
                return res.status(404).json({ error: 'Online order provider not found' });
            }
            res.json(provider);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new online order provider
    router.post('/api/online-orders/providers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, display_name, api_endpoint, webhook_url, auth_type, is_active, config } = req.body;

            if (!name || !api_endpoint) {
                return res.status(400).json({ error: 'Name and API endpoint are required' });
            }

            const provider = await onlineOrderManager.createProvider({
                name,
                display_name: display_name || name,
                api_endpoint,
                webhook_url: webhook_url || '',
                auth_type: auth_type || 'api_key',
                is_active: is_active !== false,
                config: config || {}
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'online_order_providers',
                provider.id,
                null,
                { name, display_name, api_endpoint, webhook_url, auth_type, is_active, config },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(provider);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update online order provider
    router.put('/api/online-orders/providers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, display_name, api_endpoint, webhook_url, auth_type, is_active, config } = req.body;

            const oldProvider = await onlineOrderManager.getProviderById(req.params.id);
            if (!oldProvider) {
                return res.status(404).json({ error: 'Online order provider not found' });
            }

            const provider = await onlineOrderManager.updateProvider(req.params.id, {
                name,
                display_name,
                api_endpoint,
                webhook_url,
                auth_type,
                is_active,
                config
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'online_order_providers',
                req.params.id,
                oldProvider,
                { name, display_name, api_endpoint, webhook_url, auth_type, is_active, config },
                req.ip,
                req.headers['user-agent']
            );

            res.json(provider);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete online order provider
    router.delete('/api/online-orders/providers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldProvider = await onlineOrderManager.getProviderById(req.params.id);
            if (!oldProvider) {
                return res.status(404).json({ error: 'Online order provider not found' });
            }

            await onlineOrderManager.deleteProvider(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'online_order_providers',
                req.params.id,
                oldProvider,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Online order provider deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get provider credentials
    router.get('/api/online-orders/providers/:id/credentials', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const credentials = await onlineOrderManager.getProviderCredentials(req.params.id);
            if (!credentials) {
                return res.status(404).json({ error: 'Credentials not found' });
            }
            res.json(credentials);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update provider credentials
    router.put('/api/online-orders/providers/:id/credentials', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { api_key, client_id, client_secret, access_token, refresh_token, expires_at, auth_config } = req.body;

            const oldCredentials = await onlineOrderManager.getProviderCredentials(req.params.id);

            const credentials = await onlineOrderManager.updateProviderCredentials(req.params.id, {
                api_key,
                client_id,
                client_secret,
                access_token,
                refresh_token,
                expires_at,
                auth_config: auth_config || {}
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'online_order_credentials',
                req.params.id,
                oldCredentials,
                { api_key: !!api_key, client_id: !!client_id, client_secret: !!client_secret, expires_at },
                req.ip,
                req.headers['user-agent']
            );

            res.json(credentials);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Webhook endpoint for receiving orders
    router.post('/api/online-orders/webhook', async (req, res) => {
        try {
            const { provider_id, signature, payload } = req.body;

            if (!provider_id || !payload) {
                return res.status(400).json({ error: 'Provider ID and payload are required' });
            }

            // Verify signature if provided
            const provider = await onlineOrderManager.getProviderById(provider_id);
            if (provider && signature) {
                const isValid = await onlineOrderApi.verifyWebhookSignature(provider, signature, payload);
                if (!isValid) {
                    return res.status(401).json({ error: 'Invalid signature' });
                }
            }

            // Process the webhook
            const result = await onlineOrderManager.processWebhookEvent(provider_id, payload);

            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online orders
    router.get('/api/online-orders', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { providerId, status, startDate, endDate, limit } = req.query;

            const orders = await onlineOrderManager.getOnlineOrders({
                providerId: providerId || null,
                status: status || null,
                startDate: startDate || null,
                endDate: endDate || null,
                limit: limit ? parseInt(limit) : null
            });

            res.json(orders);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online order by ID
    router.get('/api/online-orders/:id', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const order = await onlineOrderManager.getOnlineOrderById(req.params.id);
            if (!order) {
                return res.status(404).json({ error: 'Online order not found' });
            }
            res.json(order);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update online order status
    router.put('/api/online-orders/:id/status', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { status, notes } = req.body;

            if (!status) {
                return res.status(400).json({ error: 'Status is required' });
            }

            const order = await onlineOrderManager.updateOrderStatus(req.params.id, status, notes || '');

            // Notify provider if needed
            if (order.provider_id) {
                await onlineOrderApi.updateOrderStatus(order.provider_id, req.params.id, status, notes);
            }

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'online_orders',
                req.params.id,
                null,
                { status, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(order);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Confirm order fulfillment
    router.post('/api/online-orders/:id/fulfill', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { notes, fulfillment_time } = req.body;

            const result = await onlineOrderManager.confirmOrderFulfillment(req.params.id, {
                notes: notes || '',
                fulfillment_time: fulfillment_time || new Date().toISOString()
            });

            // Notify provider
            if (result.order.provider_id) {
                await onlineOrderApi.confirmOrderFulfillment(result.order.provider_id, req.params.id, {
                    notes: notes || '',
                    fulfillment_time: fulfillment_time || new Date().toISOString()
                });
            }

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'online_orders',
                req.params.id,
                null,
                { action: 'fulfill', notes, fulfillment_time },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online order history
    router.get('/api/online-orders/:id/history', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const history = await onlineOrderManager.getOrderHistory(req.params.id);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online order reports
    router.get('/api/reports/online-orders', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, providerId } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await reportingManager.getOnlineOrderReport(startDate, endDate, providerId || null);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online order provider performance report
    router.get('/api/reports/online-orders/provider-performance', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await reportingManager.getOnlineOrderProviderPerformance(startDate, endDate);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online order status distribution
    router.get('/api/reports/online-orders/status-distribution', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, providerId } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await reportingManager.getOnlineOrderStatusDistribution(startDate, endDate, providerId || null);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online order payment method analysis
    router.get('/api/reports/online-orders/payment-analysis', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, providerId } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await reportingManager.getOnlineOrderPaymentAnalysis(startDate, endDate, providerId || null);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get online order hourly trends
    router.get('/api/reports/online-orders/hourly-trends', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { date, providerId } = req.query;

            if (!date) {
                return res.status(400).json({ error: 'Date is required' });
            }

            const report = await reportingManager.getOnlineOrderHourlyTrends(date, providerId || null);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get top online order items
    router.get('/api/reports/online-orders/top-items', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, limit, providerId } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await reportingManager.getTopOnlineOrderItems(
                startDate,
                endDate,
                limit ? parseInt(limit) : 10,
                providerId || null
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Test provider connection
    router.post('/api/online-orders/providers/:id/test-connection', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const result = await onlineOrderApi.testConnection(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Register webhook with provider
    router.post('/api/online-orders/providers/:id/register-webhook', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { webhookUrl, events } = req.body;

            const result = await onlineOrderApi.registerWebhook(req.params.id, webhookUrl || '', events || []);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // DIGITAL RECEIPTS
    // ========================================================================

    // Initialize DigitalReceiptManager
    let digitalReceiptManager = null;
    let emailService = null;
    let whatsappService = null;

    // Middleware to initialize digital receipt services
    router.use('/api/digital-receipts', async (req, res, next) => {
        try {
            if (!digitalReceiptManager) {
                const DigitalReceiptManager = require('./digital-receipt-manager');
                const EmailService = require('./email-service');
                const WhatsAppService = require('./whatsapp-service');
                const db = require('./database');
                const logger = require('./logger');

                digitalReceiptManager = new DigitalReceiptManager(db.getDatabase(), logger);
                emailService = new EmailService(db.getDatabase(), logger);
                whatsappService = new WhatsAppService(db.getDatabase(), logger);

                await digitalReceiptManager.init();
                await emailService.init();
                await whatsappService.init();
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all digital receipt templates
    router.get('/api/digital-receipts/templates', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const templates = await digitalReceiptManager.getAllTemplates();
            res.json(templates);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get digital receipt template by ID
    router.get('/api/digital-receipts/templates/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const template = await digitalReceiptManager.getTemplateById(req.params.id);
            if (!template) {
                return res.status(404).json({ error: 'Digital receipt template not found' });
            }
            res.json(template);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new digital receipt template
    router.post('/api/digital-receipts/templates', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, type, subject, html_template, text_template, is_default, is_active } = req.body;

            if (!name || !type || !html_template) {
                return res.status(400).json({ error: 'Name, type, and HTML template are required' });
            }

            const template = await digitalReceiptManager.createTemplate({
                name,
                type,
                subject: subject || '',
                html_template,
                text_template: text_template || '',
                is_default: is_default || false,
                is_active: is_active !== false
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'digital_receipt_templates',
                template.id,
                null,
                { name, type, subject, is_default, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(template);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update digital receipt template
    router.put('/api/digital-receipts/templates/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, type, subject, html_template, text_template, is_default, is_active } = req.body;

            const oldTemplate = await digitalReceiptManager.getTemplateById(req.params.id);
            if (!oldTemplate) {
                return res.status(404).json({ error: 'Digital receipt template not found' });
            }

            const template = await digitalReceiptManager.updateTemplate(req.params.id, {
                name,
                type,
                subject,
                html_template,
                text_template,
                is_default,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'digital_receipt_templates',
                req.params.id,
                oldTemplate,
                { name, type, subject, html_template, text_template, is_default, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json(template);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete digital receipt template
    router.delete('/api/digital-receipts/templates/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldTemplate = await digitalReceiptManager.getTemplateById(req.params.id);
            if (!oldTemplate) {
                return res.status(404).json({ error: 'Digital receipt template not found' });
            }

            await digitalReceiptManager.deleteTemplate(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'digital_receipt_templates',
                req.params.id,
                oldTemplate,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Digital receipt template deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Test digital receipt template
    router.post('/api/digital-receipts/templates/:id/test', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { email, phone, orderId } = req.body;

            if (!email && !phone) {
                return res.status(400).json({ error: 'Email or phone is required for testing' });
            }

            const result = await digitalReceiptManager.testTemplate(
                req.params.id,
                email || null,
                phone || null,
                orderId || null
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get customer communication preferences
    router.get('/api/digital-receipts/preferences', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { customerId } = req.query;

            let preferences;
            if (customerId) {
                preferences = await digitalReceiptManager.getCustomerPreferences(customerId);
            } else {
                preferences = await digitalReceiptManager.getAllCustomerPreferences();
            }

            res.json(preferences);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get customer communication preferences by ID
    router.get('/api/digital-receipts/preferences/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const preferences = await digitalReceiptManager.getCustomerPreferencesById(req.params.id);
            if (!preferences) {
                return res.status(404).json({ error: 'Customer preferences not found' });
            }
            res.json(preferences);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update customer communication preferences
    router.put('/api/digital-receipts/preferences/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { customer_id, email_enabled, whatsapp_enabled, sms_enabled, phone_number, email_address } = req.body;

            const oldPreferences = await digitalReceiptManager.getCustomerPreferencesById(req.params.id);
            if (!oldPreferences) {
                return res.status(404).json({ error: 'Customer preferences not found' });
            }

            const preferences = await digitalReceiptManager.updateCustomerPreferences(req.params.id, {
                customer_id,
                email_enabled,
                whatsapp_enabled,
                sms_enabled,
                phone_number,
                email_address
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'customer_communication_preferences',
                req.params.id,
                oldPreferences,
                { customer_id, email_enabled, whatsapp_enabled, sms_enabled, phone_number, email_address },
                req.ip,
                req.headers['user-agent']
            );

            res.json(preferences);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create customer communication preferences
    router.post('/api/digital-receipts/preferences', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { customer_id, email_enabled, whatsapp_enabled, sms_enabled, phone_number, email_address } = req.body;

            if (!customer_id) {
                return res.status(400).json({ error: 'Customer ID is required' });
            }

            const preferences = await digitalReceiptManager.createCustomerPreferences({
                customer_id,
                email_enabled: email_enabled !== false,
                whatsapp_enabled: whatsapp_enabled !== false,
                sms_enabled: sms_enabled !== false,
                phone_number: phone_number || null,
                email_address: email_address || null
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'customer_communication_preferences',
                preferences.id,
                null,
                { customer_id, email_enabled, whatsapp_enabled, sms_enabled, phone_number, email_address },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(preferences);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Send digital receipt
    router.post('/api/digital-receipts/send', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { orderId, email, phone, method, templateId, forceSend } = req.body;

            if (!orderId) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            const result = await digitalReceiptManager.sendDigitalReceipt({
                orderId,
                email: email || null,
                phone: phone || null,
                method: method || 'auto',
                templateId: templateId || null,
                forceSend: forceSend || false,
                sentBy: req.user.id
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'digital_receipt_history',
                result.id,
                null,
                { orderId, email, phone, method, templateId, forceSend },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get digital receipt history
    router.get('/api/digital-receipts/history', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { orderId, customerId, startDate, endDate, status, limit } = req.query;

            const history = await digitalReceiptManager.getDigitalReceiptHistory({
                orderId: orderId || null,
                customerId: customerId || null,
                startDate: startDate || null,
                endDate: endDate || null,
                status: status || null,
                limit: limit ? parseInt(limit) : null
            });

            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get digital receipt history by ID
    router.get('/api/digital-receipts/history/:id', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const history = await digitalReceiptManager.getDigitalReceiptHistoryById(req.params.id);
            if (!history) {
                return res.status(404).json({ error: 'Digital receipt history not found' });
            }
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Resend digital receipt
    router.post('/api/digital-receipts/history/:id/resend', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const result = await digitalReceiptManager.resendDigitalReceipt(req.params.id, req.user.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'digital_receipt_history',
                req.params.id,
                null,
                { action: 'resend' },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update digital receipt status
    router.put('/api/digital-receipts/history/:id/status', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { status, delivery_status, notes } = req.body;

            if (!status) {
                return res.status(400).json({ error: 'Status is required' });
            }

            const history = await digitalReceiptManager.updateDigitalReceiptStatus(req.params.id, {
                status,
                delivery_status: delivery_status || null,
                notes: notes || null
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'digital_receipt_history',
                req.params.id,
                null,
                { status, delivery_status, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get digital receipt reports
    router.get('/api/reports/digital-receipts/summary', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await reportingManager.getDigitalReceiptSummary(startDate, endDate);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get digital receipt daily report
    router.get('/api/reports/digital-receipts/daily', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { date } = req.query;

            if (!date) {
                return res.status(400).json({ error: 'Date is required' });
            }

            const report = await reportingManager.getDigitalReceiptDailyReport(date);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get digital receipt delivery rate report
    router.get('/api/reports/digital-receipts/delivery-rate', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await reportingManager.getDigitalReceiptDeliveryRate(startDate, endDate);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get digital receipt method distribution report
    router.get('/api/reports/digital-receipts/method-distribution', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ error: 'Start date and end date are required' });
            }

            const report = await reportingManager.getDigitalReceiptMethodDistribution(startDate, endDate);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Export digital receipt report to CSV
    router.get('/api/reports/digital-receipts/export/csv', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { startDate, endDate, type } = req.query;

            if (!startDate || !endDate || !type) {
                return res.status(400).json({ error: 'Start date, end date, and type are required' });
            }

            let data = [];

            switch (type) {
                case 'summary':
                    data = await reportingManager.getDigitalReceiptSummary(startDate, endDate);
                    break;
                case 'daily':
                    data = await reportingManager.getDigitalReceiptDailyReport(startDate);
                    break;
                case 'delivery-rate':
                    data = await reportingManager.getDigitalReceiptDeliveryRate(startDate, endDate);
                    break;
                case 'method-distribution':
                    data = await reportingManager.getDigitalReceiptMethodDistribution(startDate, endDate);
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid report type' });
            }

            const filename = `digital_receipt_report_${type}_${new Date().toISOString().split('T')[0]}.csv`;
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

    // Get email service configuration
    router.get('/api/digital-receipts/email/config', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const config = await emailService.getConfiguration();
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update email service configuration
    router.put('/api/digital-receipts/email/config', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { host, port, secure, auth, from, reply_to, signature } = req.body;

            const oldConfig = await emailService.getConfiguration();

            const config = await emailService.updateConfiguration({
                host,
                port,
                secure,
                auth,
                from,
                reply_to,
                signature
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'email_service_config',
                1,
                oldConfig,
                { host, port, secure, from, reply_to, signature },
                req.ip,
                req.headers['user-agent']
            );

            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Test email configuration
    router.post('/api/digital-receipts/email/test', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { to, subject, text } = req.body;

            if (!to) {
                return res.status(400).json({ error: 'Recipient email is required' });
            }

            const result = await emailService.testEmail(to, subject || 'Test Email', text || 'This is a test email');
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get WhatsApp service configuration
    router.get('/api/digital-receipts/whatsapp/config', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const config = await whatsappService.getConfiguration();
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update WhatsApp service configuration
    router.put('/api/digital-receipts/whatsapp/config', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { api_url, api_key, phone_number_id, from_number, message_template_name, is_sandbox } = req.body;

            const oldConfig = await whatsappService.getConfiguration();

            const config = await whatsappService.updateConfiguration({
                api_url,
                api_key,
                phone_number_id,
                from_number,
                message_template_name,
                is_sandbox
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'whatsapp_service_config',
                1,
                oldConfig,
                { api_url, phone_number_id, from_number, message_template_name, is_sandbox },
                req.ip,
                req.headers['user-agent']
            );

            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Test WhatsApp configuration
    router.post('/api/digital-receipts/whatsapp/test', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { to, message } = req.body;

            if (!to) {
                return res.status(400).json({ error: 'Recipient phone number is required' });
            }

            const result = await whatsappService.testMessage(to, message || 'This is a test WhatsApp message');
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================================================
    // CUSTOMER LOYALTY POINTS SYSTEM
    // ========================================================================

    // Initialize LoyaltyManager
    let loyaltyManager = null;

    // Middleware to initialize LoyaltyManager
    router.use('/api/loyalty', async (req, res, next) => {
        try {
            if (!loyaltyManager) {
                const LoyaltyManager = require('./loyalty-manager');
                const db = require('./database');
                const logger = require('./logger');
                loyaltyManager = new LoyaltyManager(db.getDatabase(), logger);
                await loyaltyManager.init();
            }
            next();
        } catch (error) {
            next(error);
        }
    });

    // Get all loyalty programs
    router.get('/api/loyalty/programs', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const programs = await loyaltyManager.getAllLoyaltyPrograms();
            res.json(programs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get loyalty program by ID
    router.get('/api/loyalty/programs/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const program = await loyaltyManager.getLoyaltyProgram(req.params.id);
            if (!program) {
                return res.status(404).json({ error: 'Loyalty program not found' });
            }
            res.json(program);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new loyalty program
    router.post('/api/loyalty/programs', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, description, points_per_currency, is_active, min_purchase_amount } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const program = await loyaltyManager.createLoyaltyProgram({
                name,
                description,
                points_per_currency,
                is_active,
                min_purchase_amount
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_programs',
                program.id,
                null,
                { name, description, points_per_currency, is_active, min_purchase_amount },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(program);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update loyalty program
    router.put('/api/loyalty/programs/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, description, points_per_currency, is_active, min_purchase_amount } = req.body;

            const oldProgram = await loyaltyManager.getLoyaltyProgram(req.params.id);
            if (!oldProgram) {
                return res.status(404).json({ error: 'Loyalty program not found' });
            }

            const program = await loyaltyManager.updateLoyaltyProgram(req.params.id, {
                name,
                description,
                points_per_currency,
                is_active,
                min_purchase_amount
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'loyalty_programs',
                req.params.id,
                oldProgram,
                { name, description, points_per_currency, is_active, min_purchase_amount },
                req.ip,
                req.headers['user-agent']
            );

            res.json(program);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete loyalty program
    router.delete('/api/loyalty/programs/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldProgram = await loyaltyManager.getLoyaltyProgram(req.params.id);
            if (!oldProgram) {
                return res.status(404).json({ error: 'Loyalty program not found' });
            }

            await loyaltyManager.deleteLoyaltyProgram(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'loyalty_programs',
                req.params.id,
                oldProgram,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Loyalty program deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all loyalty tiers for a program
    router.get('/api/loyalty/programs/:programId/tiers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const tiers = await loyaltyManager.getLoyaltyTiers(req.params.programId);
            res.json(tiers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create loyalty tier
    router.post('/api/loyalty/tiers', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { program_id, name, min_points, discount_percent, benefits } = req.body;

            if (!program_id || !name || min_points === undefined) {
                return res.status(400).json({ error: 'Program ID, name, and min points are required' });
            }

            const tier = await loyaltyManager.createLoyaltyTier({
                program_id,
                name,
                min_points,
                discount_percent,
                benefits: benefits || []
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_tiers',
                tier.id,
                null,
                { program_id, name, min_points, discount_percent, benefits },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(tier);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update loyalty tier
    router.put('/api/loyalty/tiers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, min_points, discount_percent, benefits } = req.body;

            const oldTier = await loyaltyManager.getLoyaltyTier(req.params.id);
            if (!oldTier) {
                return res.status(404).json({ error: 'Loyalty tier not found' });
            }

            const tier = await loyaltyManager.updateLoyaltyTier(req.params.id, {
                name,
                min_points,
                discount_percent,
                benefits
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'loyalty_tiers',
                req.params.id,
                oldTier,
                { name, min_points, discount_percent, benefits },
                req.ip,
                req.headers['user-agent']
            );

            res.json(tier);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete loyalty tier
    router.delete('/api/loyalty/tiers/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldTier = await loyaltyManager.getLoyaltyTier(req.params.id);
            if (!oldTier) {
                return res.status(404).json({ error: 'Loyalty tier not found' });
            }

            await loyaltyManager.deleteLoyaltyTier(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'loyalty_tiers',
                req.params.id,
                oldTier,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Loyalty tier deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get customer loyalty status
    router.get('/api/loyalty/customers/:customerId/status', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const status = await loyaltyManager.getCustomerLoyaltyStatus(req.params.customerId);
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Assign customer to loyalty program
    router.post('/api/loyalty/customers/:customerId/enroll', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { program_id, notes } = req.body;

            if (!program_id) {
                return res.status(400).json({ error: 'Program ID is required' });
            }

            const result = await loyaltyManager.enrollCustomerInProgram(req.params.customerId, program_id, notes || '');

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'customer_loyalty',
                null,
                null,
                { customer_id: req.params.customerId, program_id, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Calculate points for an order
    router.post('/api/loyalty/calculate-points', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { order_id, customer_id, program_id } = req.body;

            if (!order_id) {
                return res.status(400).json({ error: 'Order ID is required' });
            }

            const points = await loyaltyManager.calculatePointsForOrder(order_id, customer_id, program_id);
            res.json(points);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Award points to customer
    router.post('/api/loyalty/points/award', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { customer_id, order_id, points, notes } = req.body;

            if (!customer_id || points === undefined) {
                return res.status(400).json({ error: 'Customer ID and points are required' });
            }

            const transaction = await loyaltyManager.awardPoints(customer_id, order_id, points, notes || '');

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_points_transactions',
                transaction.id,
                null,
                { customer_id, order_id, points, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(transaction);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Redeem points
    router.post('/api/loyalty/points/redeem', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { customer_id, order_id, points, notes } = req.body;

            if (!customer_id || points === undefined) {
                return res.status(400).json({ error: 'Customer ID and points are required' });
            }

            const transaction = await loyaltyManager.redeemPoints(customer_id, order_id, points, notes || '');

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_points_transactions',
                transaction.id,
                null,
                { customer_id, order_id, points, notes, type: 'redemption' },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(transaction);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Adjust points (manual adjustment)
    router.post('/api/loyalty/points/adjust', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { customer_id, points, reason, notes } = req.body;

            if (!customer_id || points === undefined || !reason) {
                return res.status(400).json({ error: 'Customer ID, points, and reason are required' });
            }

            const transaction = await loyaltyManager.adjustPoints(customer_id, points, reason, notes || '', req.user.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_points_transactions',
                transaction.id,
                null,
                { customer_id, points, reason, notes, type: 'adjustment' },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(transaction);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get customer points history
    router.get('/api/loyalty/customers/:customerId/transactions', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { limit, offset } = req.query;
            const transactions = await loyaltyManager.getCustomerPointsHistory(
                req.params.customerId,
                limit ? parseInt(limit) : 50,
                offset ? parseInt(offset) : 0
            );
            res.json(transactions);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all loyalty rewards
    router.get('/api/loyalty/rewards', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const rewards = await loyaltyManager.getAllRewards();
            res.json(rewards);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get reward by ID
    router.get('/api/loyalty/rewards/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const reward = await loyaltyManager.getReward(req.params.id);
            if (!reward) {
                return res.status(404).json({ error: 'Reward not found' });
            }
            res.json(reward);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new reward
    router.post('/api/loyalty/rewards', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { program_id, name, description, points_required, type, value, max_uses, is_active } = req.body;

            if (!program_id || !name || points_required === undefined) {
                return res.status(400).json({ error: 'Program ID, name, and points required are required' });
            }

            const reward = await loyaltyManager.createReward({
                program_id,
                name,
                description,
                points_required,
                type,
                value,
                max_uses,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_rewards',
                reward.id,
                null,
                { program_id, name, description, points_required, type, value, max_uses, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(reward);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update reward
    router.put('/api/loyalty/rewards/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, description, points_required, type, value, max_uses, is_active } = req.body;

            const oldReward = await loyaltyManager.getReward(req.params.id);
            if (!oldReward) {
                return res.status(404).json({ error: 'Reward not found' });
            }

            const reward = await loyaltyManager.updateReward(req.params.id, {
                name,
                description,
                points_required,
                type,
                value,
                max_uses,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'loyalty_rewards',
                req.params.id,
                oldReward,
                { name, description, points_required, type, value, max_uses, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json(reward);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete reward
    router.delete('/api/loyalty/rewards/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldReward = await loyaltyManager.getReward(req.params.id);
            if (!oldReward) {
                return res.status(404).json({ error: 'Reward not found' });
            }

            await loyaltyManager.deleteReward(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'loyalty_rewards',
                req.params.id,
                oldReward,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Reward deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Redeem reward
    router.post('/api/loyalty/rewards/:rewardId/redeem', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { customer_id, order_id, notes } = req.body;

            if (!customer_id) {
                return res.status(400).json({ error: 'Customer ID is required' });
            }

            const redemption = await loyaltyManager.redeemReward(req.params.rewardId, customer_id, order_id, notes || '');

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_reward_redemptions',
                redemption.id,
                null,
                { reward_id: req.params.rewardId, customer_id, order_id, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(redemption);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get customer redeemed rewards
    router.get('/api/loyalty/customers/:customerId/rewards', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const rewards = await loyaltyManager.getCustomerRewards(req.params.customerId);
            res.json(rewards);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get available rewards for customer
    router.get('/api/loyalty/customers/:customerId/available-rewards', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const rewards = await loyaltyManager.getAvailableRewardsForCustomer(req.params.customerId);
            res.json(rewards);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all punch cards
    router.get('/api/loyalty/punch-cards', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const punchCards = await loyaltyManager.getAllPunchCards();
            res.json(punchCards);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get punch card by ID
    router.get('/api/loyalty/punch-cards/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const punchCard = await loyaltyManager.getPunchCard(req.params.id);
            if (!punchCard) {
                return res.status(404).json({ error: 'Punch card not found' });
            }
            res.json(punchCard);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create new punch card
    router.post('/api/loyalty/punch-cards', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { program_id, name, description, required_punches, reward_points, reward_item_id, is_active } = req.body;

            if (!program_id || !name || required_punches === undefined) {
                return res.status(400).json({ error: 'Program ID, name, and required punches are required' });
            }

            const punchCard = await loyaltyManager.createPunchCard({
                program_id,
                name,
                description,
                required_punches,
                reward_points,
                reward_item_id,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_punch_cards',
                punchCard.id,
                null,
                { program_id, name, description, required_punches, reward_points, reward_item_id, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(punchCard);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update punch card
    router.put('/api/loyalty/punch-cards/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { name, description, required_punches, reward_points, reward_item_id, is_active } = req.body;

            const oldPunchCard = await loyaltyManager.getPunchCard(req.params.id);
            if (!oldPunchCard) {
                return res.status(404).json({ error: 'Punch card not found' });
            }

            const punchCard = await loyaltyManager.updatePunchCard(req.params.id, {
                name,
                description,
                required_punches,
                reward_points,
                reward_item_id,
                is_active
            });

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'loyalty_punch_cards',
                req.params.id,
                oldPunchCard,
                { name, description, required_punches, reward_points, reward_item_id, is_active },
                req.ip,
                req.headers['user-agent']
            );

            res.json(punchCard);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete punch card
    router.delete('/api/loyalty/punch-cards/:id', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const oldPunchCard = await loyaltyManager.getPunchCard(req.params.id);
            if (!oldPunchCard) {
                return res.status(404).json({ error: 'Punch card not found' });
            }

            await loyaltyManager.deletePunchCard(req.params.id);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'delete',
                'loyalty_punch_cards',
                req.params.id,
                oldPunchCard,
                null,
                req.ip,
                req.headers['user-agent']
            );

            res.json({ message: 'Punch card deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add punch to customer's punch card
    router.post('/api/loyalty/punch-cards/:cardId/punch', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { customer_id, order_id, notes } = req.body;

            if (!customer_id) {
                return res.status(400).json({ error: 'Customer ID is required' });
            }

            const punch = await loyaltyManager.addPunchToCard(req.params.cardId, customer_id, order_id, notes || '');

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'create',
                'loyalty_punch_card_punches',
                punch.id,
                null,
                { card_id: req.params.cardId, customer_id, order_id, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.status(201).json(punch);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get customer's punch cards
    router.get('/api/loyalty/customers/:customerId/punch-cards', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const punchCards = await loyaltyManager.getCustomerPunchCards(req.params.customerId);
            res.json(punchCards);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get loyalty reports
    router.get('/api/loyalty/reports/summary', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { programId, startDate, endDate } = req.query;
            const report = await reportingManager.getLoyaltySummaryReport(programId || null, startDate || null, endDate || null);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get points activity report
    router.get('/api/loyalty/reports/points-activity', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { programId, customerId, startDate, endDate, limit } = req.query;
            const report = await reportingManager.getLoyaltyPointsActivityReport(
                programId || null,
                customerId || null,
                startDate || null,
                endDate || null,
                limit ? parseInt(limit) : 100
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get redemptions report
    router.get('/api/loyalty/reports/redemptions', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { programId, startDate, endDate, limit } = req.query;
            const report = await reportingManager.getLoyaltyRedemptionsReport(
                programId || null,
                startDate || null,
                endDate || null,
                limit ? parseInt(limit) : 100
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get customer activity report
    router.get('/api/loyalty/reports/customer-activity', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { programId, startDate, endDate, limit } = req.query;
            const report = await reportingManager.getLoyaltyCustomerActivityReport(
                programId || null,
                startDate || null,
                endDate || null,
                limit ? parseInt(limit) : 100
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get punch card activity report
    router.get('/api/loyalty/reports/punch-cards', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { programId, startDate, endDate, limit } = req.query;
            const report = await reportingManager.getLoyaltyPunchCardActivityReport(
                programId || null,
                startDate || null,
                endDate || null,
                limit ? parseInt(limit) : 100
            );
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Export loyalty report to CSV
    router.get('/api/loyalty/reports/export/csv', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { type, programId, startDate, endDate } = req.query;

            if (!type) {
                return res.status(400).json({ error: 'Report type is required' });
            }

            let data = [];

            switch (type) {
                case 'summary':
                    data = await reportingManager.getLoyaltySummaryReport(programId || null, startDate || null, endDate || null);
                    break;
                case 'points-activity':
                    data = await reportingManager.getLoyaltyPointsActivityReport(programId || null, null, startDate || null, endDate || null, 1000);
                    break;
                case 'redemptions':
                    data = await reportingManager.getLoyaltyRedemptionsReport(programId || null, startDate || null, endDate || null, 1000);
                    break;
                case 'customer-activity':
                    data = await reportingManager.getLoyaltyCustomerActivityReport(programId || null, startDate || null, endDate || null, 1000);
                    break;
                case 'punch-cards':
                    data = await reportingManager.getLoyaltyPunchCardActivityReport(programId || null, startDate || null, endDate || null, 1000);
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid report type' });
            }

            const filename = `loyalty_${type}_${new Date().toISOString().split('T')[0]}.csv`;
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

    // Export loyalty report to PDF
    router.get('/api/loyalty/reports/export/pdf', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { type, programId, startDate, endDate, title } = req.query;

            if (!type) {
                return res.status(400).json({ error: 'Report type is required' });
            }

            let data = [];
            let summary = {};

            switch (type) {
                case 'summary':
                    data = await reportingManager.getLoyaltySummaryReport(programId || null, startDate || null, endDate || null);
                    summary = data;
                    break;
                case 'points-activity':
                    data = await reportingManager.getLoyaltyPointsActivityReport(programId || null, null, startDate || null, endDate || null, 1000);
                    break;
                case 'redemptions':
                    data = await reportingManager.getLoyaltyRedemptionsReport(programId || null, startDate || null, endDate || null, 1000);
                    break;
                case 'customer-activity':
                    data = await reportingManager.getLoyaltyCustomerActivityReport(programId || null, startDate || null, endDate || null, 1000);
                    break;
                case 'punch-cards':
                    data = await reportingManager.getLoyaltyPunchCardActivityReport(programId || null, startDate || null, endDate || null, 1000);
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid report type' });
            }

            const filename = `loyalty_${type}_${new Date().toISOString().split('T')[0]}.pdf`;
            const filePath = await reportingManager.exportToPDF(data, filename, {
                title: title || `${type.replace('-', ' ')} Report`,
                subtitle: `Period: ${startDate || 'All'} to ${endDate || 'All'}`,
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

    // Process expired points
    router.post('/api/loyalty/process-expired-points', authenticate, authorize('manage_settings'), async (req, res) => {
        try {
            const { daysBefore } = req.body;
            const result = await loyaltyManager.processExpiredPoints(daysBefore || 30);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'process',
                'loyalty_points',
                null,
                null,
                { action: 'process_expired_points', daysBefore },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get expired points report
    router.get('/api/loyalty/reports/expired-points', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { daysBefore, limit } = req.query;
            const report = await reportingManager.getExpiredPointsReport(daysBefore ? parseInt(daysBefore) : 30, limit ? parseInt(limit) : 100);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get loyalty statements for customer
    router.get('/api/loyalty/customers/:customerId/statements', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const statements = await loyaltyManager.getLoyaltyStatement(
                req.params.customerId,
                startDate || null,
                endDate || null
            );
            res.json(statements);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Export loyalty statement to PDF
    router.get('/api/loyalty/customers/:customerId/statements/export', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const statements = await loyaltyManager.getLoyaltyStatement(
                req.params.customerId,
                startDate || null,
                endDate || null
            );

            const filename = `loyalty_statement_${req.params.customerId}_${new Date().toISOString().split('T')[0]}.pdf`;
            const filePath = await reportingManager.exportToPDF(statements, filename, {
                title: 'Loyalty Statement',
                subtitle: `Customer ID: ${req.params.customerId} | Period: ${startDate || 'All'} to ${endDate || 'All'}`
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

    // Check if customer is eligible for tier upgrade
    router.get('/api/loyalty/customers/:customerId/check-tier-upgrade', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const check = await loyaltyManager.checkTierUpgradeEligibility(req.params.customerId);
            res.json(check);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Manually trigger tier upgrade
    router.post('/api/loyalty/customers/:customerId/upgrade-tier', authenticate, authorize('manage_orders'), async (req, res) => {
        try {
            const result = await loyaltyManager.upgradeCustomerTier(req.params.customerId);

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'customer_loyalty',
                req.params.customerId,
                null,
                { action: 'tier_upgrade' },
                req.ip,
                req.headers['user-agent']
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/api/reports/recipes/cost', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const report = await reportingManager.getRecipeCostReport();
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get ingredient usage report
    router.get('/api/reports/recipes/ingredients', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { recipeId } = req.query;
            const report = await reportingManager.getIngredientUsageReport(recipeId || null);
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get recipe efficiency report
    router.get('/api/reports/recipes/efficiency', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const report = await reportingManager.getRecipeEfficiencyReport();
            res.json(report);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get recipe ingredient alerts
    router.get('/api/reports/recipes/alerts', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { resolved } = req.query;
            const alerts = await reportingManager.getRecipeIngredientAlerts(resolved !== 'false');
            res.json(alerts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Resolve recipe ingredient alert
    router.post('/api/recipes/alerts/:id/resolve', authenticate, authorize('manage_inventory'), async (req, res) => {
        try {
            const { notes } = req.body;
            const alert = await recipeManager.resolveIngredientAlert(req.params.id, req.user.id, notes || '');

            // Log audit
            await reportingManager.logAudit(
                req.user.id,
                'update',
                'recipe_ingredient_alerts',
                req.params.id,
                null,
                { is_resolved: true, resolved_by: req.user.id, notes },
                req.ip,
                req.headers['user-agent']
            );

            res.json(alert);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Export recipe report to CSV
    router.get('/api/reports/recipes/export/csv', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { type } = req.query;

            if (!type || !['cost', 'ingredients', 'efficiency'].includes(type)) {
                return res.status(400).json({ error: 'Invalid report type' });
            }

            let data = [];

            switch (type) {
                case 'cost':
                    data = await reportingManager.getRecipeCostReport();
                    break;
                case 'ingredients':
                    data = await reportingManager.getIngredientUsageReport();
                    break;
                case 'efficiency':
                    data = await reportingManager.getRecipeEfficiencyReport();
                    break;
            }

            const filename = `recipe_report_${type}_${new Date().toISOString().split('T')[0]}.csv`;
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

    // Export recipe report to PDF
    router.get('/api/reports/recipes/export/pdf', authenticate, authorize('view_reports'), async (req, res) => {
        try {
            const { type, title } = req.query;

            if (!type || !['cost', 'ingredients', 'efficiency'].includes(type)) {
                return res.status(400).json({ error: 'Invalid report type' });
            }

            let data = [];

            switch (type) {
                case 'cost':
                    data = await reportingManager.getRecipeCostReport();
                    break;
                case 'ingredients':
                    data = await reportingManager.getIngredientUsageReport();
                    break;
                case 'efficiency':
                    data = await reportingManager.getRecipeEfficiencyReport();
                    break;
            }

            const filename = `recipe_report_${type}_${new Date().toISOString().split('T')[0]}.pdf`;
            const filePath = await reportingManager.exportToPDF(data, filename, {
                title: title || `${type.replace('-', ' ')} Report`,
                subtitle: `Generated on: ${new Date().toLocaleDateString()}`
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

    return router;
};
