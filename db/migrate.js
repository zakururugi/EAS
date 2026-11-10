#!/usr/bin/env node

/**
 * Idempotent PostgreSQL migration runner.
 *
 * DATABASE_URL must be a PostgreSQL connection URI. For Supabase serverless
 * deployments, prefer the transaction pooler URI and keep SSL enabled.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_VERSION = '20261110_eas_canonical_archive_v1';

export function splitSqlStatements(source) {
  const statements = [];
  let statement = '';
  let state = 'normal';
  let dollarTag = '';

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (state === 'single') {
      statement += char;
      if (char === "'" && next === "'") {
        statement += next;
        i++;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'double') {
      statement += char;
      if (char === '"' && next === '"') {
        statement += next;
        i++;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'line-comment') {
      statement += char;
      if (char === '\n') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      statement += char;
      if (char === '*' && next === '/') {
        statement += next;
        i++;
        state = 'normal';
      }
      continue;
    }

    if (state === 'dollar') {
      if (source.startsWith(dollarTag, i)) {
        statement += dollarTag;
        i += dollarTag.length - 1;
        state = 'normal';
      } else {
        statement += char;
      }
      continue;
    }

    if (char === "'" ) {
      statement += char;
      state = 'single';
      continue;
    }
    if (char === '"') {
      statement += char;
      state = 'double';
      continue;
    }
    if (char === '-' && next === '-') {
      statement += '--';
      i++;
      state = 'line-comment';
      continue;
    }
    if (char === '/' && next === '*') {
      statement += '/*';
      i++;
      state = 'block-comment';
      continue;
    }
    if (char === '$') {
      const match = source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        statement += dollarTag;
        i += dollarTag.length - 1;
        state = 'dollar';
        continue;
      }
    }
    if (char === ';') {
      if (statement.trim()) statements.push(statement.trim());
      statement = '';
      continue;
    }

    statement += char;
  }

  if (state === 'single' || state === 'double' || state === 'dollar' || state === 'block-comment') {
    throw new Error(`Unterminated SQL token while splitting migration (state: ${state}).`);
  }
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is required (Supabase PostgreSQL connection URI).');
    process.exitCode = 1;
    return;
  }

  const sql = postgres(databaseUrl, {
    ssl: 'require',
    prepare: false,
    max: 1,
    connect_timeout: 15,
    idle_timeout: 20,
  });

  try {
    const migrationPath = join(__dirname, 'migrations.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    const statements = splitSqlStatements(migrationSQL);

    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(128) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    const applied = await sql`SELECT version FROM schema_migrations WHERE version = ${MIGRATION_VERSION}`;
    if (applied.length > 0) {
      console.log(`Migration ${MIGRATION_VERSION} is already applied; nothing to do.`);
      return;
    }

    console.log(`Applying ${statements.length} SQL statements for ${MIGRATION_VERSION}...`);
    await sql.begin(async (tx) => {
      for (let index = 0; index < statements.length; index++) {
        await tx.unsafe(statements[index]);
      }
      await tx`INSERT INTO schema_migrations (version)
        VALUES (${MIGRATION_VERSION})
        ON CONFLICT (version) DO NOTHING`;
    });

    console.log('Database migration completed successfully.');
  } catch (error) {
    console.error('Database migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await migrate();
}
