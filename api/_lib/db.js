/**
 * Database connection helper for Vercel serverless functions.
 * Uses @vercel/postgres for connection pooling.
 * Supports Neon URL format (postgresql:// → postgres:// conversion).
 */

import { createPool } from '@vercel/postgres';

let pool = null;

/**
 * Normalize DATABASE_URL for Vercel Neon compatibility.
 * Neon uses postgresql:// but @vercel/postgres expects postgres://.
 */
function normalizeConnectionString(url) {
  if (!url) return url;
  let normalized = url;
  if (normalized.startsWith('postgresql://')) {
    normalized = 'postgres://' + normalized.slice('postgresql://'.length);
  }
  if (!normalized.includes('-pooler')) {
    console.warn('[DB] WARNING: DATABASE_URL does not contain "-pooler". Use Neon pooled URL.');
  }
  return normalized;
}

export async function getDb() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not set');
    pool = createPool({ connectionString: normalizeConnectionString(connectionString) });
  }
  return pool;
}

export async function query(text, params = []) {
  const db = await getDb();
  return await db.query(text, params);
}

export default { getDb, query };