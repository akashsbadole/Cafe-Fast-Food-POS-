# Database Schema Analysis Report

## Executive Summary

The application is failing to start due to database initialization errors affecting both PostgreSQL and SQLite implementations. The key issues are:

1. **PostgreSQL Error**: "column 'description' of relation 'settings' does not exist"
2. **SQLite Error**: "Error: near 'EXISTS': syntax error" in recipe-manager.js and inventory-manager.js

## Root Cause Analysis

### Issue 1: Missing 'description' Column in Settings Table

**Problem**: The `settings` table schema differs between the initial migration and the PostgreSQL initialization code.

**Evidence**:
- In `config/migrations/001_initial_schema.sql` (line 91-95), the settings table is defined as:
  ```sql
  CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```
  **No `description` column**

- In `js/database-postgres.js` (line 190-196), the settings table is created with:
  ```sql
  CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```
  **Includes `description` column**

- The PostgreSQL code also seeds default settings with descriptions (line 200-210):
  ```javascript
  const defaultSettings = [
    ['business_name', 'Cafe POS', 'The name of your business'],
    ['business_address', '123 Main St, City', 'The address of your business'],
    // ... more settings with descriptions
  ];
  ```

**Impact**: When the application tries to insert settings with descriptions, PostgreSQL fails because the column doesn't exist.

### Issue 2: SQL Syntax Incompatibility Between PostgreSQL and SQLite

**Problem**: The code uses PostgreSQL-specific syntax that doesn't work with SQLite.

**Evidence**:

#### A. `ON CONFLICT` Syntax (PostgreSQL-specific)
- Used in `js/database-postgres.js`:
  - Line 216: `ON CONFLICT (key) DO NOTHING`
  - Line 780: `ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`
  - Line 818: `ON CONFLICT (code, key) DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP`

- These statements are **PostgreSQL-specific** and will fail in SQLite with "Error: near 'EXISTS': syntax error"

#### B. `INSERT OR REPLACE` Syntax (SQLite-specific)
- Used in `js/database.js`:
  - Line 838: `INSERT OR REPLACE INTO settings`
  - Line 857: `INSERT OR REPLACE INTO settings`

- These statements are **SQLite-specific** and will fail in PostgreSQL

#### C. `ALTER TABLE ADD COLUMN IF NOT EXISTS` Syntax
- Used in `js/recipe-manager.js` (line 74-89):
  ```javascript
  this.db.run(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS recipe_id INTEGER`);
  this.db.run(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_recipe_based INTEGER DEFAULT 0`);
  // ... more similar statements
  ```

- Used in `js/inventory-manager.js` (line 844-861):
  ```javascript
  this.db.run(`INSERT OR REPLACE INTO inventory_items ...`);
  ```

**Impact**: When the application runs with SQLite, these PostgreSQL-specific SQL statements cause syntax errors.

### Issue 3: Schema Drift Between Initial Migration and Application Code

**Problem**: The initial migration file doesn't match the schema used in the application code.

**Evidence**:
- Initial migration creates settings table with `key` as PRIMARY KEY
- PostgreSQL initialization creates settings table with `id` as PRIMARY KEY and `key` as UNIQUE
- SQLite initialization (js/database.js) creates settings table with `key` as PRIMARY KEY (line 191-196)

## Detailed Schema Comparison

### Settings Table Schema Variations

| Source | Primary Key | Columns | Notes |
|--------|-------------|---------|-------|
| `001_initial_schema.sql` | `key` (PRIMARY KEY) | key, value, updated_at | Initial migration |
| `js/database-postgres.js` | `id` (SERIAL PRIMARY KEY) | id, key (UNIQUE), value (NOT NULL), description, updated_at | PostgreSQL implementation |
| `js/database.js` | `key` (PRIMARY KEY) | key, value, updated_at | SQLite implementation |

### SQL Syntax Compatibility Issues

| Syntax | PostgreSQL | SQLite | Notes |
|--------|------------|--------|-------|
| `ON CONFLICT ... DO UPDATE` | ✅ Supported | ❌ Not supported | PostgreSQL-specific upsert |
| `ON CONFLICT ... DO NOTHING` | ✅ Supported | ❌ Not supported | PostgreSQL-specific upsert |
| `INSERT OR REPLACE` | ❌ Not supported | ✅ Supported | SQLite-specific upsert |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | ✅ Supported | ✅ Supported | Cross-database compatible |

## Migration Requirements

### Required Fixes

#### 1. Fix Settings Table Schema Consistency

**Option A: Update Initial Migration (Recommended)**
```sql
-- In config/migrations/001_initial_schema.sql
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Option B: Add Migration for Description Column**
Create new migration: `config/migrations/00X_add_description_to_settings.sql`
```sql
ALTER TABLE settings ADD COLUMN IF NOT EXISTS description TEXT;
```

#### 2. Fix SQL Syntax Incompatibility

**For PostgreSQL code (js/database-postgres.js)**:
- Replace `ON CONFLICT` with standard SQL upsert pattern
- Use `INSERT ... ON DUPLICATE KEY UPDATE` or separate INSERT/UPDATE logic

**For SQLite code (js/database.js, js/recipe-manager.js, js/inventory-manager.js)**:
- Keep `INSERT OR REPLACE` for SQLite
- Ensure these files are only used with SQLite backend

**Database-agnostic approach**:
```javascript
// Instead of:
await query('INSERT INTO settings ... ON CONFLICT (key) DO UPDATE SET ...', [key, value]);

// Use:
try {
  await query('INSERT INTO settings (key, value, description) VALUES ($1, $2, $3)', [key, value, desc]);
} catch (err) {
  if (err.message.includes('duplicate key')) {
    await query('UPDATE settings SET value = $1, description = $2 WHERE key = $3', [value, desc, key]);
  } else {
    throw err;
  }
}
```

#### 3. Create Migration for Settings Table Structure

Create `config/migrations/00X_settings_table_structure.sql`:
```sql
-- Add description column if not exists
ALTER TABLE settings ADD COLUMN IF NOT EXISTS description TEXT;

-- Add id column if not exists (for PostgreSQL compatibility)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS id SERIAL;

-- Make key unique if it's not already a primary key
ALTER TABLE settings ADD CONSTRAINT IF NOT EXISTS unique_settings_key UNIQUE (key);

-- Update primary key if needed
-- Note: This is complex and may require data migration
```

## Implementation Plan

### Phase 1: Schema Consistency
1. Create migration to add `description` column to settings table
2. Update initial migration to match PostgreSQL schema
3. Ensure all database initialization code uses consistent schema

### Phase 2: SQL Syntax Abstraction
1. Create database abstraction layer for upsert operations
2. Replace PostgreSQL-specific `ON CONFLICT` syntax
3. Replace SQLite-specific `INSERT OR REPLACE` syntax
4. Use conditional logic based on database type

### Phase 3: Testing
1. Test PostgreSQL initialization
2. Test SQLite initialization
3. Test migration paths for existing databases
4. Verify settings CRUD operations work in both databases

## Files to Modify

1. `config/migrations/001_initial_schema.sql` - Update settings table schema
2. `js/database-postgres.js` - Replace `ON CONFLICT` syntax
3. `js/database.js` - Ensure compatibility with migration schema
4. `js/recipe-manager.js` - Fix SQL syntax for cross-database compatibility
5. `js/inventory-manager.js` - Fix SQL syntax for cross-database compatibility
6. Create new migration files for schema changes

## Recommendations

1. **Immediate Fix**: Create a migration to add the missing `description` column to the settings table
2. **Long-term Solution**: Implement a database abstraction layer to handle syntax differences
3. **Testing**: Thoroughly test both PostgreSQL and SQLite initialization paths
4. **Documentation**: Document the schema differences and migration requirements
