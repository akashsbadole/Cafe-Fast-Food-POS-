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

# Email Configuration (for reports)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_email_password
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
