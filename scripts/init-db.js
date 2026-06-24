import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl });
const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
try {
  await pool.query(schema);
  console.log('Database schema initialized');
} finally {
  await pool.end();
}
