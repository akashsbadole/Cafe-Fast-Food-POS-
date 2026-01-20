# Database Documentation

## Overview

The Cafe POS system supports both SQLite (default) and PostgreSQL databases. The database layer provides robust data management with schema validation, health checks, and automatic retry logic.

## Database Structure

### Database Files

- **database-manager.js**: Core database operations
  - Connection management
  - Schema validation
  - Health checks
  - Retry logic

- **database.js**: Database operations
  - CRUD operations
  - Query building
  - Transaction management

- **database-postgres.js**: PostgreSQL adapter
  - PostgreSQL-specific operations
  - Connection pooling
  - Migration support

- **config/database.js**: Database configuration
  - Connection settings
  - Environment-based configuration
  - Database initialization

### Database Schema

The system uses the following tables:

#### Core Tables
- **users**: User accounts and credentials
- **roles**: Role definitions and permissions
- **categories**: Menu item categories
- **menu_items**: Menu items with pricing
- **orders**: Order headers
- **order_items**: Order line items
- **kot_tickets**: Kitchen Order Tickets
- **tax_settings**: Tax rate configurations
- **settings**: System-wide settings

#### Inventory Tables
- **suppliers**: Supplier information
- **purchase_orders**: Purchase order headers
- **purchase_order_items**: Purchase order line items
- **reorder_levels**: Reorder point configurations
- **inventory_alerts**: Low stock alerts
- **inventory_transfers**: Stock transfer records

#### Token Queue Tables
- **token_queues**: Active token queue
- **token_history**: Historical token data
- **token_settings**: Queue configuration

#### Reporting Tables
- **scheduled_reports**: Scheduled report definitions
- **report_templates**: Custom report templates
- **backup_schedules**: Backup schedule configurations
- **backup_history**: Backup execution history

#### System Tables
- **audit_logs**: System activity audit trail
- **system_health**: System health metrics

## Database Configuration

### Environment Variables

```env
# Database Type
DB_TYPE=sqlite  # or postgres

# SQLite Configuration
DB_PATH=./data/cafe_pos.db

# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=cafe_pos

# Connection Pooling (PostgreSQL)
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_IDLE=10000
DB_POOL_REAP=10000
```

### Configuration File

The `config/database.js` file provides database configuration:

```javascript
module.exports = {
  getConfig: () => {
    return {
      type: process.env.DB_TYPE || 'sqlite',
      connection: {
        filename: process.env.DB_PATH || './data/cafe_pos.db'
      },
      // PostgreSQL configuration
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    };
  },
  initialize: async () => {
    // Initialize database connection
  }
};
```

## Database Operations

### Connection Management

The system provides automatic connection management with:
- Connection pooling (PostgreSQL)
- Automatic reconnection
- Exponential backoff for retries
- Health checks

### Schema Management

Database migrations are stored in `config/migrations/`:
- **001_initial_schema.sql**: Initial database schema
- **002_enterprise_features.sql**: Enterprise features

To run migrations:
```bash
node config/migrations/run-migrations.js
```

### Query Examples

#### Basic Query

```javascript
const db = require('./database');

// Get all menu items
const menuItems = await db.all('SELECT * FROM menu_items WHERE active = 1');

// Get menu items by category
const categoryItems = await db.all(
  'SELECT * FROM menu_items WHERE category_id = ?',
  [categoryId]
);
```

#### Transaction

```javascript
const db = require('./database');

try {
  await db.transaction(async (tx) => {
    // Create order
    const orderId = await tx.run(
      'INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)',
      [userId, total, 'pending']
    );

    // Add order items
    for (const item of orderItems) {
      await tx.run(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.menuItemId, item.quantity, item.price]
      );
    }
  });
} catch (error) {
  console.error('Transaction failed:', error);
}
```

#### Prepared Statements

```javascript
const db = require('./database');

// Create a prepared statement
const stmt = await db.prepare(
  'SELECT * FROM menu_items WHERE id = ?'
);

// Execute with parameters
const item = await stmt.get([menuItemId]);

// Finalize the statement
await stmt.finalize();
```

## Database Migrations

### Creating a Migration

1. Create a new SQL file in `config/migrations/` with a sequential number prefix
2. Define the schema changes
3. Run the migration script

Example migration:
```sql
-- config/migrations/003_new_feature.sql

-- Add new column to menu_items table
ALTER TABLE menu_items ADD COLUMN is_vegetarian BOOLEAN DEFAULT 0;

-- Create new table for customer preferences
CREATE TABLE customer_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  preference_type TEXT,
  preference_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

### Running Migrations

```bash
# Run all pending migrations
node config/migrations/run-migrations.js

# Run specific migration
node config/migrations/run-migrations.js --migration=002_enterprise_features.sql
```

## Backup and Restore

### Automatic Backups

The system supports scheduled backups:
- Configure backup schedules in the database
- Backups are stored in the `data/backups/` directory
- Backup history is tracked in the `backup_history` table

### Manual Backup

```javascript
const db = require('./database');

// Create backup
await db.backup('manual_backup_2023-01-01.sql');

// Restore from backup
await db.restore('manual_backup_2023-01-01.sql');
```

### Export Data

```javascript
const db = require('./database');

// Export menu items to CSV
const menuItems = await db.all('SELECT * FROM menu_items');
const csv = convertToCSV(menuItems);
fs.writeFileSync('menu_items.csv', csv);
```

## Performance Considerations

### Indexing

Key tables have indexes on frequently queried columns:
- `menu_items`: `category_id`, `active`, `name`
- `orders`: `status`, `created_at`, `user_id`
- `order_items`: `order_id`, `menu_item_id`

### Query Optimization

1. Use prepared statements for repeated queries
2. Limit result sets with `LIMIT` clause
3. Use pagination for large datasets
4. Avoid SELECT * - specify only needed columns

### Connection Pooling

For PostgreSQL, connection pooling is configured with:
- Minimum pool size: 2 connections
- Maximum pool size: 10 connections
- Idle timeout: 10 seconds
- Reap timeout: 10 seconds

## Troubleshooting

### Common Database Issues

#### Connection Failed
- Verify database file permissions (SQLite)
- Check PostgreSQL server is running
- Verify connection credentials
- Check network connectivity (PostgreSQL)

#### Schema Validation Failed
- Run database migrations
- Check for missing tables
- Verify column definitions

#### Slow Queries
- Add appropriate indexes
- Review query execution plan
- Check for missing WHERE clauses
- Consider query optimization

#### Locking Issues
- Reduce transaction duration
- Use appropriate isolation levels
- Implement retry logic for conflicts

## Best Practices

### Data Integrity
1. Always use transactions for related operations
2. Implement foreign key constraints
3. Validate data before insertion
4. Use proper error handling

### Security
1. Never store plaintext passwords
2. Use parameterized queries to prevent SQL injection
3. Implement proper access controls
4. Encrypt sensitive data

### Maintainability
1. Document schema changes
2. Use meaningful table and column names
3. Implement proper indexing
4. Keep migrations small and focused

## See Also

- [Configuration Documentation](../CONFIGURATION/README.md)
- [Business Logic Documentation](../BUSINESS-LOGIC/README.md)
- [Testing Documentation](../TESTING/README.md)

## Additional Resources

- [Database Schema Details](../plans/architecture.md#database-schema-sqlite) - Complete database schema documentation
- [Migration Guide](../config/migrations/) - Database migration scripts and instructions
