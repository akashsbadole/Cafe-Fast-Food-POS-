# Business Logic Documentation

## Overview

This directory documents the business logic modules that power the core functionality of the Cafe POS system. These modules handle order processing, inventory management, payments, reporting, and the token queue system.

## Business Logic Modules

### Order Management

#### cart.js
- **Purpose**: Cart operations and management
- **Features**:
  - Add/remove items from cart
  - Quantity adjustments
  - Discount application
  - Cart persistence
  - Cart validation

**Usage**:
```javascript
const cart = require('./cart');

// Add item to cart
cart.addItem(menuItemId, quantity);

// Update item quantity
cart.updateQuantity(menuItemId, newQuantity);

// Remove item from cart
cart.removeItem(menuItemId);

// Apply discount
cart.applyDiscount(discountType, discountValue);

// Get cart total
const total = cart.getTotal();

// Clear cart
cart.clear();
```

#### billing.js
- **Purpose**: Tax calculation, discount application, and bill generation
- **Features**:
  - Tax calculation (GST, VAT, etc.)
  - Discount application
  - Bill generation
  - Receipt printing
  - Payment breakdown

**Usage**:
```javascript
const billing = require('./billing');

// Calculate tax
const taxAmount = billing.calculateTax(cartItems, taxRate);

// Apply discount
const discountedTotal = billing.applyDiscount(total, discount);

// Generate bill
const bill = billing.generateBill(orderId, items, total, tax, discount);

// Print receipt
billing.printReceipt(bill);
```

#### payments.js
- **Purpose**: Payment processing and checkout
- **Features**:
  - Payment mode selection (cash, UPI, card)
  - Payment validation
  - Change calculation
  - Receipt generation
  - Payment confirmation

**Usage**:
```javascript
const payments = require('./payments');

// Process payment
const paymentResult = await payments.processPayment({
  orderId: 123,
  amount: 100.00,
  paymentMode: 'cash',
  receivedAmount: 150.00
});

// Get payment modes
const modes = payments.getPaymentModes();

// Calculate change
const change = payments.calculateChange(100.00, 150.00);
```

#### kot.js
- **Purpose**: Kitchen Order Ticket system
- **Features**:
  - Order ticket generation
  - Ticket status tracking
  - Kitchen display integration
  - Order fulfillment tracking
  - Ticket printing

**Usage**:
```javascript
const kot = require('./kot');

// Generate KOT
const ticket = kot.generateTicket(orderId, items);

// Update ticket status
kot.updateStatus(ticketId, 'preparing');
kot.updateStatus(ticketId, 'ready');
kot.updateStatus(ticketId, 'served');

// Get active tickets
const activeTickets = kot.getActiveTickets();

// Print ticket
kot.printTicket(ticketId);
```

#### order-hold-manager.js
- **Purpose**: Order hold and cancellation management
- **Features**:
  - Hold orders temporarily
  - Cancel orders with reasons
  - Timeout management
  - Order recovery
  - Hold status tracking

**Usage**:
```javascript
const orderHold = require('./order-hold-manager');

// Hold an order
orderHold.holdOrder(orderId, 'Customer not ready');

// Cancel an order
orderHold.cancelOrder(orderId, 'Customer left');

// Release a held order
orderHold.releaseOrder(orderId);

// Check hold status
const isHeld = orderHold.isOrderHeld(orderId);

// Get hold timeout
const timeout = orderHold.getHoldTimeout(orderId);
```

### Inventory Management

#### inventory-manager.js
- **Purpose**: Comprehensive inventory system
- **Features**:
  - Stock level tracking
  - Low stock alerts
  - Supplier management
  - Purchase order system
  - Reorder level configuration
  - Inventory transfers
  - Stock movement history

**Usage**:
```javascript
const inventory = require('./inventory-manager');

// Get stock level
const stock = await inventory.getStock(menuItemId);

// Update stock
await inventory.updateStock(menuItemId, newQuantity);

// Check if low stock
const isLow = await inventory.isLowStock(menuItemId);

// Create purchase order
const po = await inventory.createPurchaseOrder({
  supplierId: 1,
  items: [
    { menuItemId: 1, quantity: 10 }
  ]
});

// Transfer inventory
await inventory.transferStock(
  menuItemId,
  fromLocation,
  toLocation,
  quantity
);
```

### Reporting

#### reporting-manager.js
- **Purpose**: Comprehensive reporting system
- **Features**:
  - Sales reports (daily, weekly, monthly)
  - Top selling items
  - Tax reports for GST compliance
  - Payment breakdown analysis
  - Inventory turnover reports
  - Customer sales reports
  - Data visualization (charts)
  - Scheduled reports with email delivery
  - Custom report builder
  - PDF/CSV export capabilities

**Usage**:
```javascript
const reporting = require('./reporting-manager');

// Get daily sales
const dailySales = await reporting.getDailySales(date);

// Get top selling items
const topItems = await reporting.getTopSellingItems(7); // Last 7 days

// Get tax report
const taxReport = await reporting.getTaxReport(startDate, endDate);

// Get payment breakdown
const paymentBreakdown = await reporting.getPaymentBreakdown(date);

// Generate chart data
const chartData = await reporting.generateChartData('sales', 'daily');

// Export to PDF
await reporting.exportToPDF('sales_report', data);

// Export to CSV
await reporting.exportToCSV('sales_report', data);
```

### Token Queue System

#### token-queue-manager.js
- **Purpose**: Customer ordering queue management
- **Features**:
  - Token generation with configurable numbering
  - Queue status tracking (waiting, called, served, cancelled)
  - Token history and statistics
  - Queue reset functionality
  - Customer lookup by token

**Usage**:
```javascript
const tokenQueue = require('./token-queue-manager');

// Generate new token
const token = tokenQueue.generateToken();

// Update token status
tokenQueue.updateStatus(token, 'called');
tokenQueue.updateStatus(token, 'served');
tokenQueue.updateStatus(token, 'cancelled');

// Get queue statistics
const stats = tokenQueue.getQueueStats();

// Get token history
const history = tokenQueue.getTokenHistory(date);

// Reset queue
tokenQueue.resetQueue();

// Find customer by token
const customer = tokenQueue.findByToken(token);
```

## Business Logic Integration

### Order Processing Flow

```
1. Customer selects items → Cart
2. Items added to cart → Cart Manager
3. Customer requests bill → Billing
4. Tax calculated → Billing
5. Discount applied → Billing
6. KOT generated → KOT System
7. Payment processed → Payments
8. Inventory updated → Inventory Manager
9. Order completed → Database
10. Receipt printed → Billing
```

### Inventory Flow

```
1. Item sold → Inventory Manager
2. Stock level checked → Inventory Manager
3. If low stock → Alert generated
4. If below reorder level → Purchase order created
5. Stock updated → Database
6. Stock movement recorded → History
```

## Configuration

### Order Processing Settings

```javascript
// In config/database.js or .env
{
  holdTimeout: 30, // minutes
  maxHoldTime: 60, // minutes
  autoCancelAfter: 120, // minutes
  kotPrintEnabled: true,
  receiptPrintEnabled: true
}
```

### Inventory Settings

```javascript
{
  lowStockThreshold: 10,
  reorderLevel: 20,
  alertEnabled: true,
  autoPurchaseOrder: false,
  stockCheckFrequency: 60 // minutes
}
```

### Reporting Settings

```javascript
{
  defaultReportPeriod: 'daily',
  autoExportEnabled: false,
  exportFormat: 'pdf',
  emailReportsEnabled: false,
  smtpHost: 'smtp.example.com',
  smtpPort: 587
}
```

### Token Queue Settings

```javascript
{
  tokenPrefix: 'CAFE-',
  tokenNumbering: 'sequential',
  autoCallEnabled: false,
  callInterval: 5, // minutes
  maxQueueSize: 100
}
```

## Best Practices

### Order Management

1. **Validate all inputs** before processing
2. **Use transactions** for order creation
3. **Implement proper error handling**
4. **Log all order operations**
5. **Maintain audit trail** for all changes

### Inventory Management

1. **Check stock levels** before selling
2. **Update inventory** immediately after sale
3. **Implement proper alerts** for low stock
4. **Track all stock movements**
5. **Validate supplier data**

### Reporting

1. **Use proper date ranges** for reports
2. **Implement caching** for frequent reports
3. **Validate report parameters**
4. **Handle large datasets** efficiently
5. **Provide export options** for all reports

### Token Queue

1. **Generate unique tokens**
2. **Track token status** accurately
3. **Handle queue resets** properly
4. **Maintain history** for analytics
5. **Provide customer lookup** by token

## Troubleshooting

### Common Business Logic Issues

#### Order Processing Failed
- Check database connection
- Verify inventory levels
- Check payment validation
- Review error logs

#### Inventory Mismatch
- Verify stock updates
- Check for concurrent modifications
- Review transaction logs
- Check for data corruption

#### Report Generation Failed
- Verify date range
- Check data availability
- Review query execution
- Check export format

#### Token Queue Not Working
- Verify token generation
- Check status updates
- Review queue configuration
- Test token lookup

## See Also

- [Core Features Documentation](../CORE-FEATURES/README.md)
- [Database Documentation](../DATABASE/README.md)
- [Authentication Documentation](../AUTHENTICATION/README.md)
- [Testing Documentation](../TESTING/README.md)

## Additional Resources

- [Feature Implementation Details](../DOCUMENTATION-ANALYSIS.md#feature-breakdown-by-category) - Comprehensive feature breakdown
- [Business Process Flows](../plans/architecture.md#order-processing-flow) - Detailed business process documentation
