// Unit tests for Tax Engine

const assert = require('assert');
const TaxEngine = require('./tax-engine');

describe('Tax Engine', () => {
    describe('calculateTax', () => {
        it('should calculate exclusive tax correctly', () => {
            const amount = 100;
            const taxRate = 0.10; // 10%
            const taxType = 'exclusive';
            
            const taxAmount = TaxEngine.calculateTax(amount, taxRate, taxType);
            assert.strictEqual(taxAmount, 10);
        });
        
        it('should calculate inclusive tax correctly', () => {
            const amount = 110; // Price includes tax
            const taxRate = 0.10; // 10%
            const taxType = 'inclusive';
            
            const taxAmount = TaxEngine.calculateTax(amount, taxRate, taxType);
            assert.strictEqual(taxAmount.toFixed(2), '9.09');
        });
        
        it('should handle zero tax rate', () => {
            const amount = 100;
            const taxRate = 0;
            const taxType = 'exclusive';
            
            const taxAmount = TaxEngine.calculateTax(amount, taxRate, taxType);
            assert.strictEqual(taxAmount, 0);
        });
    });
    
    describe('getPriceExcludingTax', () => {
        it('should calculate price excluding tax from inclusive price', () => {
            const inclusivePrice = 110;
            const taxRate = 0.10; // 10%
            
            const priceExcludingTax = TaxEngine.getPriceExcludingTax(inclusivePrice, taxRate);
            assert.strictEqual(priceExcludingTax.toFixed(2), '100.00');
        });
        
        it('should handle zero tax rate', () => {
            const inclusivePrice = 100;
            const taxRate = 0;
            
            const priceExcludingTax = TaxEngine.getPriceExcludingTax(inclusivePrice, taxRate);
            assert.strictEqual(priceExcludingTax, 100);
        });
    });
    
    describe('getPriceIncludingTax', () => {
        it('should calculate price including tax from exclusive price', () => {
            const exclusivePrice = 100;
            const taxRate = 0.10; // 10%
            
            const priceIncludingTax = TaxEngine.getPriceIncludingTax(exclusivePrice, taxRate);
            assert.strictEqual(priceIncludingTax, 110);
        });
        
        it('should handle zero tax rate', () => {
            const exclusivePrice = 100;
            const taxRate = 0;
            
            const priceIncludingTax = TaxEngine.getPriceIncludingTax(exclusivePrice, taxRate);
            assert.strictEqual(priceIncludingTax, 100);
        });
    });
    
    describe('calculateOrderTax', () => {
        it('should calculate order tax with discount', () => {
            const subtotal = 100;
            const taxRate = 0.10;
            const taxType = 'exclusive';
            const discount = 10;
            
            const taxAmount = TaxEngine.calculateOrderTax(subtotal, taxRate, taxType, discount);
            assert.strictEqual(taxAmount, 9); // (100 - 10) * 0.10 = 9
        });
        
        it('should not allow negative taxable amount', () => {
            const subtotal = 10;
            const taxRate = 0.10;
            const taxType = 'exclusive';
            const discount = 20;
            
            const taxAmount = TaxEngine.calculateOrderTax(subtotal, taxRate, taxType, discount);
            assert.strictEqual(taxAmount, 0); // max(0, 10 - 20) * 0.10 = 0
        });
    });
    
    describe('calculateItemTax', () => {
        it('should calculate tax for an item', () => {
            const item = {
                quantity: 2,
                unit_price: 50,
                total: 100
            };
            const taxRate = 0.10;
            const taxType = 'exclusive';
            
            const taxAmount = TaxEngine.calculateItemTax(item, taxRate, taxType);
            assert.strictEqual(taxAmount, 10);
        });
    });
    
    describe('calculateTotalWithTax', () => {
        it('should calculate total with exclusive tax', () => {
            const amount = 100;
            const taxRate = 0.10;
            const taxType = 'exclusive';
            
            const total = TaxEngine.calculateTotalWithTax(amount, taxRate, taxType);
            assert.strictEqual(total, 110);
        });
        
        it('should calculate total with inclusive tax', () => {
            const amount = 100;
            const taxRate = 0.10;
            const taxType = 'inclusive';
            
            const total = TaxEngine.calculateTotalWithTax(amount, taxRate, taxType);
            assert.strictEqual(total.toFixed(2), '109.09');
        });
    });
    
    describe('getTaxBreakdown', () => {
        it('should return tax breakdown for exclusive tax', () => {
            const subtotal = 100;
            const taxAmount = 10;
            const taxRate = 0.10;
            const taxType = 'exclusive';
            const discount = 0;
            
            const breakdown = TaxEngine.getTaxBreakdown(subtotal, taxAmount, taxRate, taxType, discount);
            
            assert.strictEqual(breakdown.subtotal, 100);
            assert.strictEqual(breakdown.discount, 0);
            assert.strictEqual(breakdown.taxable_amount, 100);
            assert.strictEqual(breakdown.tax_rate, 0.10);
            assert.strictEqual(breakdown.tax_type, 'exclusive');
            assert.strictEqual(breakdown.tax_amount, 10);
            assert.strictEqual(breakdown.total, 110);
            assert.strictEqual(breakdown.price_inclusive, false);
        });
        
        it('should return tax breakdown for inclusive tax', () => {
            const subtotal = 110;
            const taxAmount = 9.09;
            const taxRate = 0.10;
            const taxType = 'inclusive';
            const discount = 0;
            
            const breakdown = TaxEngine.getTaxBreakdown(subtotal, taxAmount, taxRate, taxType, discount);
            
            assert.strictEqual(breakdown.subtotal, 110);
            assert.strictEqual(breakdown.taxable_amount, 110);
            assert.strictEqual(breakdown.tax_type, 'inclusive');
            assert.strictEqual(breakdown.price_inclusive, true);
        });
    });
    
    describe('calculateCartTax', () => {
        it('should calculate total tax for multiple cart items', () => {
            const cartItems = [
                { quantity: 2, unit_price: 50, total: 100 },
                { quantity: 1, unit_price: 30, total: 30 }
            ];
            const taxRate = 0.10;
            const taxType = 'exclusive';
            const discount = 0;
            
            const totalTax = TaxEngine.calculateCartTax(cartItems, taxRate, taxType, discount);
            assert.strictEqual(totalTax, 13); // (100 + 30) * 0.10 = 13
        });
    });
});

console.log('All tax engine tests passed!');
