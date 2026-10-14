import {readFile} from 'node:fs/promises';
import pg from 'pg';
import assert from 'node:assert/strict';

const [manifestFile]=process.argv.slice(2);
const connectionString=process.env.FROG_QA_DATABASE_URL;
const url=new URL(connectionString);
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_qa'))throw new Error('Restore verification must use an isolated local QA database');
const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
const client=new pg.Client({connectionString});
await client.connect();
try {
  const verify=async()=>{
    for(const [table,count] of Object.entries(manifest.rowCounts)) {
      const result=await client.query(`select count(*)::text as count from public."${table.replaceAll('"','""')}"`);
      assert.equal(result.rows[0].count,count,table);
    }
  };
  await verify();
  const migration=await readFile(new URL('../db/migrations/2026-10-13-wallet-idempotency.sql',import.meta.url),'utf8');
  await client.query('begin');await client.query(migration);await client.query('commit');
  await verify();
  // A repeated deployment must not reset balances or duplicate schema objects.
  await client.query(migration);await verify();
  const revision=await client.query('select count(*)::int n from wallets where financial_revision<>0');
  assert.equal(revision.rows[0].n,0);
  console.log(JSON.stringify({restored:true,migrationRehearsal:true,repeatMigration:true,preservedTables:Object.keys(manifest.rowCounts).length}));
} finally {await client.end();}
