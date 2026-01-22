// Tax Engine for Cafe POS
// Handles inclusive and exclusive tax calculations

const TaxEngine = {
    // Get tax configuration for a location
    getTaxConfiguration: async (locationId = 1) => {
        try {
            const db = require('./database');
            const config = await db.query(
                'SELECT * FROM tax_configurations WHERE location_id = ?',
                [locationId]
            ).rows[0];
            
            return config || {
                location_id: locationId,
                default_tax_type: 'exclusive',
                display_prices_inclusive: 0,
                show_tax_breakdown: 1
            };
        } catch (error) {
            console.error('Error getting tax configuration:', error);
            return {
                location_id: locationId,
                default_tax_type: 'exclusive',
                display_prices_inclusive: 0,
                show_tax_breakdown: 1
            };
        }
    },
    
    // Get active tax rates for a location
    getActiveTaxRates: async (locationId = 1) => {
        try {
            const db = require('./database');
            const rates = await db.query(
                'SELECT * FROM tax_rates WHERE is_active = 1 AND location_id = ? ORDER BY id',
                [locationId]
            ).rows;
            return rates;
        } catch (error) {
            console.error('Error getting tax rates:', error);
            return [];
        }
    },
    
    // Calculate tax amount based on tax type
    calculateTax: (amount, taxRate, taxType = 'exclusive') => {
        if (taxType === 'inclusive') {
            // For inclusive tax: tax_amount = (price * tax_rate) / (1 + tax_rate)
            return (amount * taxRate) / (1 + taxRate);
        } else {
            // For exclusive tax: tax_amount = price * tax_rate
            return amount * taxRate;
        }
    },
    
    // Calculate price excluding tax from inclusive price
    getPriceExcludingTax: (inclusivePrice, taxRate) => {
        return inclusivePrice / (1 + taxRate);
    },
    
    // Calculate price including tax from exclusive price
    getPriceIncludingTax: (exclusivePrice, taxRate) => {
        return exclusivePrice * (1 + taxRate);
    },
    
    // Calculate total tax for an order
    calculateOrderTax: (subtotal, taxRate, taxType = 'exclusive', discount = 0) => {
        const taxableAmount = Math.max(0, subtotal - discount);
        return TaxEngine.calculateTax(taxableAmount, taxRate, taxType);
    },
    
    // Calculate item tax amount
    calculateItemTax: (item, taxRate, taxType = 'exclusive') => {
        const itemSubtotal = item.quantity * item.unit_price;
        return TaxEngine.calculateTax(itemSubtotal, taxRate, taxType);
    },
    
    // Calculate total with tax
    calculateTotalWithTax: (amount, taxRate, taxType = 'exclusive') => {
        const taxAmount = TaxEngine.calculateTax(amount, taxRate, taxType);
        return amount + taxAmount;
    },
    
    // Get tax breakdown for display
    getTaxBreakdown: (subtotal, taxAmount, taxRate, taxType = 'exclusive', discount = 0) => {
        const taxableAmount = Math.max(0, subtotal - discount);
        
        return {
            subtotal: subtotal,
            discount: discount,
            taxable_amount: taxableAmount,
            tax_rate: taxRate,
            tax_type: taxType,
            tax_amount: taxAmount,
            total: subtotal - discount + taxAmount,
            price_inclusive: taxType === 'inclusive',
            tax_back_amount: taxType === 'inclusive' ? 
                (subtotal * taxRate) / (1 + taxRate) : 
                (subtotal - discount) * taxRate
        };
    },
    
    // Calculate tax for cart items
    calculateCartTax: (cartItems, taxRate, taxType = 'exclusive', discount = 0) => {
        let totalTax = 0;
        
        cartItems.forEach(item => {
            const itemTax = TaxEngine.calculateItemTax(item, taxRate, taxType);
            totalTax += itemTax;
        });
        
        return totalTax;
    },
    
    // Get tax rate for a menu item
    getItemTaxRate: async (itemId, locationId = 1) => {
        try {
            const db = require('./database');
            
            // Get menu item with tax information
            const item = await db.query(
                'SELECT mi.tax_type, mi.tax_rate_id, mi.custom_tax_rate, mi.price ' +
                'FROM menu_items mi WHERE mi.id = ?',
                [itemId]
            ).rows[0];
            
            if (!item) {
                return null;
            }
            
            // If item has custom tax rate
            if (item.custom_tax_rate !== null && item.custom_tax_rate !== undefined) {
                return {
                    rate: item.custom_tax_rate,
                    type: item.tax_type || 'exclusive'
                };
            }
            
            // If item has tax rate ID
            if (item.tax_rate_id) {
                const taxRate = await db.query(
                    'SELECT rate, tax_type FROM tax_rates WHERE id = ? AND is_active = 1',
                    [item.tax_rate_id]
                ).rows[0];
                
                if (taxRate) {
                    return {
                        rate: taxRate.rate,
                        type: taxRate.tax_type || item.tax_type || 'exclusive'
                    };
                }
            }
            
            // Get default tax rate for location
            const defaultRate = await db.query(
                'SELECT rate, tax_type FROM tax_rates ' +
                'WHERE is_active = 1 AND location_id = ? ' +
                'ORDER BY id LIMIT 1',
                [locationId]
            ).rows[0];
            
            if (defaultRate) {
                return {
                    rate: defaultRate.rate,
                    type: defaultRate.tax_type || item.tax_type || 'exclusive'
                };
            }
            
            // Fallback to default
            return {
                rate: 0.09, // 9% default
                type: item.tax_type || 'exclusive'
            };
            
        } catch (error) {
            console.error('Error getting item tax rate:', error);
            return {
                rate: 0.09, // 9% default
                type: 'exclusive'
            };
        }
    },
    
    // Calculate tax for order items
    calculateOrderItemsTax: async (orderId) => {
        try {
            const db = require('./database');
            
            // Get order items with tax information
            const items = await db.query(
                'SELECT oi.*, mi.tax_type, mi.tax_rate_id, mi.custom_tax_rate ' +
                'FROM order_items oi ' +
                'LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id ' +
                'WHERE oi.order_id = ?',
                [orderId]
            ).rows;
            
            let totalTax = 0;
            
            for (const item of items) {
                // Determine tax rate for this item
                let taxRate = 0.09; // default
                let taxType = 'exclusive';
                
                if (item.custom_tax_rate !== null && item.custom_tax_rate !== undefined) {
                    taxRate = item.custom_tax_rate;
                    taxType = item.tax_type || 'exclusive';
                } else if (item.tax_rate_id) {
                    const taxRateData = await db.query(
                        'SELECT rate, tax_type FROM tax_rates WHERE id = ? AND is_active = 1',
                        [item.tax_rate_id]
                    ).rows[0];
                    
                    if (taxRateData) {
                        taxRate = taxRateData.rate;
                        taxType = taxRateData.tax_type || item.tax_type || 'exclusive';
                    }
                } else if (item.tax_type) {
                    taxType = item.tax_type;
                }
                
                // Calculate tax for this item
                const itemTax = TaxEngine.calculateItemTax(item, taxRate, taxType);
                totalTax += itemTax;
                
                // Update order item with tax information
                await db.query(
                    'UPDATE order_items SET tax_amount = ?, tax_rate = ?, tax_type = ?, tax_rate_id = ? ' +
                    'WHERE id = ?',
                    [itemTax, taxRate, taxType, item.tax_rate_id || null, item.id]
                );
            }
            
            return totalTax;
            
        } catch (error) {
            console.error('Error calculating order items tax:', error);
            return 0;
        }
    },
    
    // Get tax summary for reporting
    getTaxSummary: async (startDate, endDate, locationId = null) => {
        try {
            const db = require('./database');
            
            let query = `
                SELECT 
                    DATE(o.created_at) as date,
                    o.location_id,
                    o.tax_type,
                    SUM(o.subtotal) as total_subtotal,
                    SUM(o.tax_amount) as total_tax_amount,
                    SUM(o.total_amount) as total_amount,
                    COUNT(o.id) as order_count,
                    SUM(oi.tax_amount) as item_tax_amount
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.payment_status = 'paid'
            `;
            
            const params = [];
            
            if (startDate && endDate) {
                query += ' AND DATE(o.created_at) BETWEEN ? AND ?';
                params.push(startDate, endDate);
            }
            
            if (locationId) {
                query += ' AND o.location_id = ?';
                params.push(locationId);
            }
            
            query += ' GROUP BY DATE(o.created_at), o.location_id, o.tax_type ORDER BY date';
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting tax summary:', error);
            return [];
        }
    },
    
    // Get tax breakdown by type
    getTaxBreakdownByType: async (startDate, endDate, locationId = null) => {
        try {
            const db = require('./database');
            
            let query = `
                SELECT 
                    o.tax_type,
                    SUM(o.subtotal) as subtotal,
                    SUM(o.tax_amount) as tax_amount,
                    COUNT(o.id) as order_count,
                    SUM(oi.tax_amount) as item_tax_amount
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.payment_status = 'paid'
            `;
            
            const params = [];
            
            if (startDate && endDate) {
                query += ' AND DATE(o.created_at) BETWEEN ? AND ?';
                params.push(startDate, endDate);
            }
            
            if (locationId) {
                query += ' AND o.location_id = ?';
                params.push(locationId);
            }
            
            query += ' GROUP BY o.tax_type';
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting tax breakdown by type:', error);
            return [];
        }
    }
};

// Export tax engine
module.exports = TaxEngine;
