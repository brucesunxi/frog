import {readFile} from 'node:fs/promises';

export async function initializeQaSchema(pool) {
  const client=await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(71310001)');
    await client.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
    await client.query('commit');
  } catch(error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
