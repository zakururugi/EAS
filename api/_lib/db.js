/**
 * Database connection helper for Vercel serverless functions.
 * Uses @vercel/postgres for connection pooling.
 */

import { createPool } from '@vercel/postgres';
import { sql } from '@vercel/postgres';

let pool = null;

/**
 * Get or create a database connection pool.
 * In Vercel serverless environment, we reuse the connection across invocations.
 */
export async function getDb() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = createPool({ connectionString });
  }
  return pool;
}

/**
 * Execute a raw SQL query with parameters.
 */
export async function query(text, params = []) {
  const db = await getDb();
  const result = await db.query(text, params);
  return result;
}

/**
 * Get the @vercel/postgres sql tagged template literal helper.
 */
export function getSql() {
  return sql;
}

export default { getDb, query, getSql };