#!/usr/bin/env node

// PostgreSQL Migration Runner for Neon DB
// Executes SQL migration files from config/migrations/ directory

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  let poolConfig;
  if (databaseUrl) {
    poolConfig = {
      connectionString: databaseUrl,
    };
  } else {
    poolConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'cafe_pos',
      port: process.env.DB_PORT || 5432,
    };
  }

  const pool = new Pool(poolConfig);

  try {
    console.log('Connecting to PostgreSQL database...');

    // Test connection
    await pool.query('SELECT 1');
    console.log('Connected successfully.');

    // Create schema_migrations table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Migration tracking table ready.');

    // Get migration files
    const migrationsDir = path.join(__dirname, 'config', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort by filename (001, 002, etc.)

    console.log(`Found ${files.length} migration files.`);

    // Execute each migration if not already applied
    for (const file of files) {
      // Check if migration already applied
      const checkResult = await pool.query(
        'SELECT id FROM schema_migrations WHERE migration_name = $1',
        [file]
      );

      if (checkResult.rows.length > 0) {
        console.log(`✓ Migration ${file} already applied, skipping.`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      console.log(`Executing migration: ${file}`);

      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await pool.query(sql);
        // Record the migration as applied
        await pool.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [file]
        );
        console.log(`✓ Migration ${file} executed successfully.`);
      } catch (error) {
        console.error(`✗ Error executing migration ${file}:`, error.message);
        throw error;
      }
    }

    console.log('All migrations executed successfully.');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('Database connection closed.');
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };