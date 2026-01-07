// Database configuration for Cafe POS
// Supports switching between SQLite and PostgreSQL

const dbType = process.env.DB_TYPE || 'sqlite';

let db = null;

// SQLite configuration (default, offline-first)
if (dbType === 'sqlite') {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  
  const dbPath = path.join(__dirname, '..', 'data', 'cafe_pos.db');
  const dataDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  console.log('Using SQLite database');
}

// PostgreSQL configuration (cloud option)
else if (dbType === 'postgres') {
  const { Pool } = require('pg');
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'cafe_pos',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  
  // Create a wrapper to make pg behave like better-sqlite3
  db = {
    prepare: (sql) => {
      return {
        run: async (...params) => {
          const client = await pool.connect();
          try {
            await client.query(sql, params);
            return { lastInsertRowid: 1 }; // Simplified for PostgreSQL
          } finally {
            client.release();
          }
        },
        get: async (...params) => {
          const client = await pool.connect();
          try {
            const result = await client.query(sql, params);
            return result.rows[0] || null;
          } finally {
            client.release();
          }
        },
        all: async (...params) => {
          const client = await pool.connect();
          try {
            const result = await client.query(sql, params);
            return result.rows;
          } finally {
            client.release();
          }
        }
      };
    },
    exec: async (sql) => {
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
    },
    close: async () => {
      await pool.end();
    }
  };
  
  console.log('Using PostgreSQL database');
}

// Export database instance
module.exports = db;
