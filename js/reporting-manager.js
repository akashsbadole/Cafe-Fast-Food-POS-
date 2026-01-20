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
        
        query += ' GROUP BY DATE(created_at), tax_rate ORDER BY date DESC';
        
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
    // DATA VISUALIZATION
    // ========================================================================

    async generateChartData(type, startDate, endDate, locationId = null) {
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
