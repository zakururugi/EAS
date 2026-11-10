/**
 * PostgreSQL connection helper for Vercel serverless functions.
 *
 * Supabase is accessed through its PostgreSQL connection URI, not through
 * Supabase publishable/secret API keys. Use the Supabase transaction-pooler
 * URI for serverless deployments and keep SSL enabled.
 */

import postgres from 'postgres';

let client = null;

export function getDb() {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured. Add the Supabase PostgreSQL connection URI.');
  }

  client = postgres(connectionString, {
    ssl: 'require',
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
  });

  return client;
}

/**
 * Preserve the { rows, rowCount } shape expected by existing API handlers.
 */
export async function query(statement, parameters = []) {
  if (typeof statement !== 'string' || !statement.trim()) {
    throw new TypeError('SQL statement must be a non-empty string.');
  }
  if (!Array.isArray(parameters)) {
    throw new TypeError('SQL parameters must be an array.');
  }

  const result = await getDb().unsafe(statement, parameters);
  return {
    rows: result,
    rowCount: Number.isInteger(result.count) ? result.count : result.length,
  };
}

export default { getDb, query };
