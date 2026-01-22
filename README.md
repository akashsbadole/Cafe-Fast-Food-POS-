# Cafe POS System

## Overview

Cafe POS is a comprehensive Point of Sale system built with Electron.js for coffee shops and cafes. It provides a complete solution for order management, inventory tracking, reporting, and customer management with a modern, responsive UI.

## Features

### Core Application
- **Electron.js Desktop Application**: Cross-platform support for Windows, Mac, and Linux
- **Express Server Backend**: RESTful API for all operations
- **Single-Page Application**: Fast, responsive user interface
- **Multi-Language Support**: English, Spanish, and Hindi
- **Theme Support**: Dark and light mode

### Authentication & Security
- **Multi-User System**: Role-based access control (Admin, Cashier)
- **PIN/Password Authentication**: Secure bcrypt hashing
- **Session Management**: JWT token-based authentication
- **Auto-Lock**: Automatic screen lock after inactivity
- **Audit Logging**: Complete activity tracking

### Order Processing
- **Menu Management**: Organized by categories
- **Cart System**: Add/remove items, quantity adjustments
- **Discounts**: Fixed or percentage-based
- **Tax Calculation**: Configurable tax rates
- **Payment Modes**: Cash, UPI, Card
- **Bill Generation**: Printable receipts
- **Kitchen Order Ticket (KOT)**: Real-time order tracking
- **Order Hold/Cancel**: With timeout management

### Inventory Management
- **Stock Tracking**: Real-time inventory levels
- **Low Stock Alerts**: Automatic notifications
- **Supplier Management**: Vendor information
- **Purchase Orders**: Order tracking system
- **Reorder Levels**: Automatic reorder points
- **Inventory Transfers**: Between locations
- **Stock Movement History**: Complete audit trail

### Customer Management
- **Customer Database**: Phone/email tracking
- **Order History**: Complete purchase records
- **Customer Notes**: Preferences and special requests

### Reporting & Analytics
- **Sales Reports**: Daily, weekly, monthly summaries
- **Top Selling Items**: Best-seller analysis
- **Tax Reports**: GST compliance reporting
- **Payment Breakdown**: Analysis by payment mode
- **Inventory Turnover**: Stock movement analysis
- **Token Queue Statistics**: Customer flow analysis
- **Custom Reports**: Build your own reports
- **Scheduled Reports**: Automatic email delivery
- **Export Options**: PDF and CSV formats

### Data Management
- **Database Backup**: Automatic and manual backup
- **Backup Scheduling**: Configurable backup intervals
- **Data Export**: CSV and PDF formats
- **Database Migrations**: Schema version control
- **Schema Validation**: Automatic repair
- **Connection Retry**: Exponential backoff for reliability

### System Administration
- **User Management**: Create, edit, delete users
- **Role Management**: Permission configuration
- **Settings Configuration**: System-wide settings
- **System Health**: Monitoring and alerts
- **Audit Logs**: View all system activity
- **Backup Management**: Restore and manage backups
- **Token Queue**: Administration interface

## Newly Implemented Features

### 1. Product Modifiers
- Customize menu items with additional options (e.g., extra cheese, different sauces)
- Support for required and optional modifiers
- Price adjustments for modifiers
- Modifier groups for logical organization

### 2. Table & Buzzer Management
- Restaurant table management with visual layouts
- Fast-food buzzer system for order tracking
- Table status tracking (available, occupied, reserved, cleaning)
- Order assignment to tables and buzzers

### 3. Kitchen Display System (KDS)
- Real-time order management for kitchen staff
- Multiple preparation stations (Grill, Fry, Bar, etc.)
- Order status tracking (received, in-progress, ready, completed)
- WebSocket-based real-time updates
- Order bumping and reopening capabilities

### 4. Combo/Meal Deals
- Create special packages of items with discounts
- Support for predefined and build-your-own combos
- Flexible discount types (fixed amount or percentage)
- Combo restrictions and validation
- Automatic combo detection in cart

### 5. Weighted Items
- Support for products sold by weight (coffee beans, meat, cheese)
- Dynamic pricing based on weight ranges
- Weight-based inventory tracking
- Integration with digital scales
- Price tiers for different weight ranges

### 6. Offline Mode & Sync
- Continue operations without internet connectivity
- Automatic data synchronization when connection restored
- Conflict resolution for data conflicts
- Queue-based operation processing
- Sync status monitoring and reporting

### 7. Split Billing
- Split single orders into multiple bills
- Split by amount, by items, or by customers
- Individual receipts for each split
- Multiple payment methods per order
- Customer tracking per split

### 8. Void & Refund Workflow
- Structured void and refund processes
- Approval workflows for high-value transactions
- Comprehensive audit logging
- Predefined void/refund reasons
- Inventory adjustment on voids

### 9. Cash Drawer Reconciliation
- Track cash drawer openings and closings
- Record all cash transactions
- End-of-shift reconciliation
- Over/short calculations
- Audit trail for all cash operations

### 10. Recipe & BOM Tracking
- Track ingredients used in recipes
- Calculate recipe costs automatically
- Monitor ingredient usage and availability
- Generate alerts for low stock ingredients
- Cost history tracking

### 11. Enhanced Tax Engine
- Support for inclusive and exclusive taxes
- Multiple tax rates and configurations
- Regional tax settings
- Tax breakdown on receipts
- GST compliance reporting

### 12. Loyalty Points System
- Earn points for purchases
- Redeem points for discounts or free items
- Multiple loyalty programs and tiers
- Punch cards for frequent purchases
- Points expiration and management

### 13. Online Order Integration
- Receive orders from online platforms
- Webhook-based order updates
- Multiple provider support
- Order status synchronization
- Performance tracking and reporting

### 14. Digital Receipts
- Send receipts via email, WhatsApp, and SMS
- Customizable receipt templates
- Customer communication preferences
- Delivery status tracking
- Automatic receipt sending

### 15. Hardware Drivers
- ESC/POS printer support
- Customer Facing Display (CFD) integration
- Cash drawer control
- Print job management and tracking
- Device status monitoring

## Feature Matrix

| Feature | Status | Database Changes | API Endpoints | Business Logic |
|---------|--------|-----------------|---------------|----------------|
| Product Modifiers | ✅ Complete | 4 tables | 12 endpoints | ModifierManager |
| Table & Buzzer Management | ✅ Complete | 6 tables | 15 endpoints | TableManager, BuzzerManager |
| Kitchen Display System (KDS) | ✅ Complete | 4 tables | 12 endpoints | KDSManager |
| Combo/Meal Deals | ✅ Complete | 4 tables | 10 endpoints | ComboManager |
| Weighted Items | ✅ Complete | 4 tables | 10 endpoints | WeightManager |
| Offline Mode & Sync | ✅ Complete | 5 tables | 8 endpoints | OfflineManager, SyncManager |
| Split Billing | ✅ Complete | 5 tables | 12 endpoints | SplitBillManager |
| Void & Refund Workflow | ✅ Complete | 4 tables | 10 endpoints | VoidRefundManager |
| Cash Drawer Reconciliation | ✅ Complete | 5 tables | 12 endpoints | CashDrawerManager, CashReconciliationManager |
| Recipe & BOM Tracking | ✅ Complete | 5 tables | 10 endpoints | RecipeManager |
| Enhanced Tax Engine | ✅ Complete | 2 tables | 8 endpoints | TaxEngine |
| Loyalty Points System | ✅ Complete | 7 tables | 15 endpoints | LoyaltyManager |
| Online Order Integration | ✅ Complete | 4 tables | 12 endpoints | OnlineOrderManager, OnlineOrderAPI |
| Digital Receipts | ✅ Complete | 3 tables | 12 endpoints | DigitalReceiptManager, EmailService, WhatsAppService |
| Hardware Drivers | ✅ Complete | 6 tables | 15 endpoints | HardwareManager, ESCPOSDriver, CFDDriver |

## Installation

### Prerequisites
- Node.js 16.x or higher
- npm 7.x or higher
- SQLite 3 (included) or PostgreSQL (optional)

### Quick Start

#### Windows
```bat
install-mvp.bat
```

#### Linux/Mac
```bash
./install-mvp.sh
```

### Manual Installation

1. Clone the repository
2. Run `npm install` to install dependencies
3. Create a `.env` file (see Configuration section)
4. Run `npm start` to launch the application

## Quick Start Guide for New Features

### Setting Up Product Modifiers

1. **Create Modifier Groups**: Define groups like "Sauces", "Toppings", "Size"
2. **Add Modifiers**: Create individual options within each group
3. **Assign to Menu Items**: Link modifier groups to specific menu items
4. **Test in Cart**: Add items to cart and select modifiers

### Configuring Table & Buzzer Management

1. **Create Table Layouts**: Set up your restaurant floor plan
2. **Add Tables**: Define table numbers, capacities, and locations
3. **Set Up Buzzers**: Configure buzzer numbers for fast-food operations
4. **Assign Orders**: Link orders to tables or buzzers

### Enabling Kitchen Display System (KDS)

1. **Create Stations**: Set up kitchen stations (Grill, Fry, Bar, etc.)
2. **Configure Products**: Assign products to stations
3. **Submit Orders**: Send orders to KDS from POS
4. **Monitor Status**: Track order progress in real-time

### Creating Combo Deals

1. **Define Combos**: Create combo packages with items and discounts
2. **Set Pricing**: Configure combo pricing and discount types
3. **Add Restrictions**: Define combo application rules
4. **Test in Cart**: Verify auto-detection and application

### Setting Up Weighted Items

1. **Configure Items**: Set up weight-based products
2. **Define Pricing Tiers**: Create price ranges for different weights
3. **Integrate Scales**: Connect digital scales (if available)
4. **Test Checkout**: Add weighted items to cart and process

### Enabling Offline Mode

1. **Configure Sync Settings**: Set sync intervals and conflict resolution
2. **Test Offline Operations**: Try creating orders without internet
3. **Monitor Sync Queue**: Check pending operations when back online
4. **Resolve Conflicts**: Handle any data conflicts that arise

### Using Split Billing

1. **Create Split Session**: Start a split bill for an order
2. **Assign Items**: Distribute items across splits
3. **Add Payments**: Process payments for each split
4. **Generate Receipts**: Print individual receipts for each split

### Configuring Void & Refund Workflow

1. **Set Up Reasons**: Define void/refund reason codes
2. **Configure Approvals**: Define who can approve voids/refunds
3. **Process Requests**: Submit and approve void/refund requests
4. **Monitor Audit Logs**: Review all void/refund activity

### Setting Up Cash Drawer Reconciliation

1. **Define Drawers**: Create cash drawer definitions
2. **Open Drawers**: Start cash drawer sessions at shift beginning
3. **Record Transactions**: Track all cash movements
4. **Reconcile**: Close and reconcile at shift end

### Implementing Recipe & BOM Tracking

1. **Create Recipes**: Define recipes with ingredients and quantities
2. **Set Conversion Rates**: Configure ingredient unit conversions
3. **Track Usage**: Monitor ingredient usage per order
4. **Calculate Costs**: Review recipe cost reports

### Configuring Enhanced Tax Engine

1. **Define Tax Rates**: Create tax rates for different jurisdictions
2. **Set Tax Types**: Configure inclusive/exclusive tax settings
3. **Assign to Items**: Link tax rates to menu items
4. **Generate Reports**: Review tax compliance reports

### Setting Up Loyalty Points System

1. **Create Programs**: Define loyalty programs and earning rates
2. **Set Up Tiers**: Create customer tiers with benefits
3. **Define Rewards**: Create redeemable rewards
4. **Test Points**: Earn and redeem points in test orders

### Integrating Online Order Platforms

1. **Add Providers**: Configure online order providers
2. **Set Up Credentials**: Enter API keys and webhook secrets
3. **Test Webhooks**: Verify webhook reception and processing
4. **Monitor Orders**: Track online order performance

### Enabling Digital Receipts

1. **Create Templates**: Design receipt templates for each channel
2. **Set Preferences**: Configure customer communication preferences
3. **Test Sending**: Send test receipts to verify setup
4. **Automate**: Enable automatic receipt sending

### Configuring Hardware Devices

1. **Register Devices**: Add printers, CFDs, and cash drawers
2. **Test Connections**: Verify device connectivity
3. **Configure Settings**: Set device-specific parameters
4. **Test Printing**: Print test receipts and KOTs

## Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DB_TYPE=sqlite  # or postgres
DB_PATH=./data/cafe_pos.db
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=cafe_pos

# Server Configuration
PORT=3000
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1h

# Application Settings
AUTO_LOCK_TIMEOUT=2
TAX_RATE=0.18

# Email Configuration (for reports and digital receipts)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_email_password

# WhatsApp Business API Configuration
WHATSAPP_API_URL=https://api.whatsapp.com
WHATSAPP_API_KEY=your_whatsapp_api_key
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# SMS Gateway Configuration
SMS_GATEWAY_URL=https://api.smsgateway.com
SMS_API_KEY=your_sms_api_key
SMS_SENDER_ID=YourBusiness

# Hardware Configuration
PRINTER_CONNECTION=usb  # or network, serial, bluetooth
PRINTER_PORT=/dev/usb/lp0
PRINTER_PAPER_SIZE=80mm

# Online Order Integration
ONLINE_ORDER_WEBHOOK_SECRET=your_webhook_secret
ONLINE_ORDER_SYNC_INTERVAL=300  # seconds

# Loyalty Program Settings
LOYALTY_POINTS_PER_CURRENCY=1.0
LOYALTY_POINTS_EXPIRATION_DAYS=365

# Offline Mode Settings
OFFLINE_SYNC_INTERVAL=60  # seconds
MAX_OFFLINE_OPERATIONS=1000
CONFLICT_RESOLUTION_STRATEGY=local_wins
```

### Database Setup

The application supports both SQLite (default) and PostgreSQL.

#### SQLite (Default)
- No additional setup required
- Database file created automatically at `data/cafe_pos.db`

#### PostgreSQL
1. Install PostgreSQL
2. Create a database named `cafe_pos`
3. Update `.env` with PostgreSQL connection details
4. Run migrations:
   ```bash
   node config/migrations/run-migrations.js
   ```

### Hardware Configuration

#### Printer Setup
1. Connect your ESC/POS printer via USB, network, or serial
2. Configure printer settings in `.env` file
3. Test printer connection using the hardware management interface
4. Verify test prints before production use

#### Customer Facing Display (CFD)
1. Connect CFD device to network or USB
2. Configure display settings (brightness, resolution)
3. Set up content templates for order display
4. Test display functionality

#### Cash Drawer
1. Connect cash drawer to printer or USB
2. Configure drawer opening settings
3. Test drawer opening functionality
4. Set up cash drawer locations

### Online Order Integration

#### Provider Configuration
1. Register with online order platforms
2. Obtain API credentials (client ID, secret, webhook keys)
3. Configure provider settings in the POS
4. Set up webhook endpoints
5. Test webhook reception and processing

#### Webhook Setup
1. Configure webhook URL in provider dashboard
2. Set up signature verification
3. Test webhook with sample payloads
4. Monitor webhook processing logs

### Digital Receipts

#### Email Configuration
1. Set up SMTP server credentials
2. Configure email templates
3. Test email delivery
4. Set up delivery retry policies

#### WhatsApp Configuration
1. Set up WhatsApp Business API account
2. Configure API credentials
3. Test message sending
4. Set up message templates

#### SMS Configuration
1. Set up SMS gateway account
2. Configure API credentials
3. Test message delivery
4. Set up sender ID

### Loyalty Program Setup

1. Define loyalty programs with earning rates
2. Create customer tiers with benefits
3. Set up rewards and redemption rules
4. Configure points expiration policies
5. Test points earning and redemption

### Tax Configuration

1. Define tax rates for each jurisdiction
2. Configure tax types (inclusive/exclusive)
3. Set up tax reporting periods
4. Test tax calculations on sample orders
5. Generate tax compliance reports

## Migration Guide for Existing Users

### Upgrading from Previous Versions

1. **Backup Your Database**: Always create a backup before upgrading
   ```bash
   cp data/cafe_pos.db data/cafe_pos_backup.db
   ```

2. **Update Application**: Pull the latest code
   ```bash
   git pull origin main
   ```

3. **Install Dependencies**: Update npm packages
   ```bash
   npm install
   ```

4. **Run Migrations**: Apply database schema changes
   ```bash
   node config/migrations/run-migrations.js
   ```

5. **Update Configuration**: Review and update `.env` file

6. **Test Thoroughly**: Verify all features work correctly

7. **Train Staff**: Provide training on new features

8. **Monitor Performance**: Watch for any issues after deployment

### Feature-Specific Migration Notes

#### Product Modifiers
- Existing menu items will not have modifiers by default
- Review menu items and add appropriate modifier groups
- Test modifier pricing calculations

#### Table & Buzzer Management
- Existing orders will not have table/buzzer assignments
- Set up table layouts and buzzers for your restaurant
- Update order workflow to include table assignment

#### Kitchen Display System (KDS)
- Existing orders will not be in KDS
- Create KDS stations for your kitchen
- Update order completion workflow to submit to KDS

#### Combo/Meal Deals
- Existing menu items will not be part of combos
- Review menu and create appropriate combo deals
- Test combo detection and application in cart

#### Weighted Items
- Existing menu items will not be weighted
- Identify items sold by weight and configure them
- Test weight-based pricing and inventory tracking

#### Offline Mode & Sync
- Existing data will be marked as synced
- Configure sync settings for your environment
- Test offline operations and sync recovery

#### Split Billing
- Existing orders cannot be split retroactively
- Update checkout workflow to support split billing
- Train staff on split bill procedures

#### Void & Refund Workflow
- Existing orders will not have void/refund tracking
- Set up void/refund reason codes
- Configure approval workflows

#### Cash Drawer Reconciliation
- Existing payments will not have cash drawer tracking
- Set up cash drawers for each location
- Update payment workflow to track cash drawer usage

#### Recipe & BOM Tracking
- Existing menu items will not have recipes
- Create recipes for menu items with multiple ingredients
- Set up ingredient conversion rates

#### Enhanced Tax Engine
- Existing tax settings will be migrated to new schema
- Review tax configurations for accuracy
- Test tax calculations on sample orders

#### Loyalty Points System
- Existing customers will not have loyalty status
- Set up loyalty programs and tiers
- Configure points earning and redemption rules

#### Online Order Integration
- No existing orders will be marked as online
- Configure online order providers
- Set up webhook endpoints

#### Digital Receipts
- Existing orders will not have digital receipt tracking
- Set up email, WhatsApp, and SMS configurations
- Create receipt templates

#### Hardware Drivers
- Existing hardware will need to be re-registered
- Register all printers, CFDs, and cash drawers
- Test device connectivity and functionality

### Troubleshooting Migration Issues

#### Database Migration Errors
- Check migration logs for specific errors
- Verify database permissions
- Restore from backup if needed
- Run migrations one at a time to isolate issues

#### Feature Configuration Issues
- Review feature-specific documentation
- Check configuration files for required settings
- Test features in a staging environment first
- Consult logs for detailed error information

#### Performance Issues
- Monitor system resources after migration
- Review database indexes for performance
- Consider increasing sync intervals if needed
- Optimize hardware device polling intervals

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Running Tests
```bash
npm test
```

## Default Credentials

After first launch, the system will create a default admin user:
- **Username**: `admin`
- **PIN**: `1234`

**Important**: Change the default PIN immediately after first login.

## Directory Structure

```
/
├── ROOT-README.md                  # This file
├── package.json                    # Project dependencies
├── .env                            # Environment configuration
├── main.js                         # Electron main process
├── preload.js                      # Electron preload script
├── server.js                       # Express server
├── electron-launcher.js            # Application launcher
├── 
├── config/                         # Configuration files
│   ├── database.js                 # Database configuration
│   └── migrations/                 # Database migrations
│
├── js/                             # JavaScript modules
│   ├── auth.js                     # Authentication
│   ├── abilities.js                # Permissions
│   ├── cart.js                     # Cart management
│   ├── billing.js                  # Billing system
│   ├── payments.js                 # Payment processing
│   ├── kot.js                      # Kitchen Order Ticket
│   ├── inventory-manager.js        # Inventory system
│   ├── reporting-manager.js        # Reporting
│   ├── token-queue-manager.js      # Token queue
│   ├── database-manager.js         # Database operations
│   ├── ui.js                       # UI components
│   ├── app.js                      # Main application
│   └── ...                         # Other modules
│
├── client/                         # Frontend assets
│   ├── src/locales/                # Localization files
│   └── ...                         # Frontend resources
│
├── data/                           # Data files
│   ├── cafe_pos.db                 # SQLite database
│   └── logs/                       # Application logs
│
├── styles/                         # CSS styles
├── images/                         # Image assets
└── web-app/                        # Web application (optional)
```

## Usage

### First Launch
1. Launch the application
2. Log in with default credentials (admin/1234)
3. Change the default PIN in Settings
4. Add your menu items and categories
5. Set up users and permissions
6. Configure tax rates and payment methods

### Daily Operations
1. **Login**: Enter your PIN
2. **Take Orders**: Select items from the menu
3. **Process Payments**: Complete the transaction
4. **Generate Reports**: View sales and inventory data
5. **Manage Inventory**: Update stock levels

## API Endpoints

See `js/mvp-endpoints.js` for complete API documentation.

## Troubleshooting

### Common Issues

#### Database Connection Failed
- Ensure SQLite file has proper permissions
- For PostgreSQL, verify connection settings
- Check that the database server is running

#### Application Won't Launch
- Delete `node_modules` and run `npm install`
- Check console logs for errors
- Verify Node.js version

#### Login Issues
- Reset PIN using admin account
- Check audit logs for failed attempts
- Verify user account status

## Support

For issues and feature requests, please check the documentation or contact support.

## License

[MIT License](LICENSE)
