#!/usr/bin/env node

/**
 * Database migration script for Earthquake Alert System.
 *
 * Usage:
 *   node db/migrate.js
 *
 * Requires DATABASE_URL environment variable to be set.
 * Alternatively, you can run the SQL manually:
 *   psql $DATABASE_URL -f db/migrations.sql
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    console.error('Usage: DATABASE_URL="postgres://..." node db/migrate.js');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require' });

  try {
    console.log('⏳ Running database migrations...');

    const migrationPath = join(__dirname, 'migrations.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split by semicolons and execute each statement
    // Filter out empty statements and comments-only blocks
    const statements = migrationSQL
      .split(';\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));

    for (const stmt of statements) {
      if (stmt.length > 5) {
        // Skip very short fragments
        try {
          await sql.unsafe(stmt);
          console.log(`  ✓ Executed: ${stmt.substring(0, 80)}...`);
        } catch (err) {
          // If it's a "already exists" error, that's fine
          if (err.code === '42710' || err.message?.includes('already exists')) {
            console.log(`  - Skipped (already exists): ${stmt.substring(0, 60)}...`);
          } else {
            throw err;
          }
        }
      }
    }

    console.log('✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();