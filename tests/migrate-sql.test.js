import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSqlStatements } from '../db/migrate.js';

test('splits SQL on statement terminators but preserves quoted semicolons', () => {
  const sql = "CREATE TABLE a (value TEXT); INSERT INTO a VALUES ('one;two');";
  assert.deepEqual(splitSqlStatements(sql), [
    'CREATE TABLE a (value TEXT)',
    "INSERT INTO a VALUES ('one;two')",
  ]);
});

test('preserves PL/pgSQL function bodies with internal semicolons', () => {
  const sql = `CREATE FUNCTION example() RETURNS void AS $$
  BEGIN
    PERFORM 1;
    PERFORM 2;
  END;
  $$ LANGUAGE plpgsql;
  SELECT 1;`;
  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /PERFORM 1;[\s\S]*PERFORM 2;/);
  assert.equal(statements[1], 'SELECT 1');
});

test('preserves comments and ignores semicolons inside comments', () => {
  const sql = `-- header; comment
  SELECT 1; /* block; comment */ SELECT 2;`;
  assert.deepEqual(splitSqlStatements(sql), [
    '-- header; comment\n  SELECT 1',
    '/* block; comment */ SELECT 2',
  ]);
});

test('rejects an unterminated quoted SQL body', () => {
  assert.throws(() => splitSqlStatements("SELECT 'unfinished"), /Unterminated SQL token/);
});
