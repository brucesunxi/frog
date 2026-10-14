import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const [envFile,backupDirectory]=process.argv.slice(2);
if(!envFile||!backupDirectory)throw new Error('A private configuration and verified backup directory are required');
const manifest=JSON.parse(await readFile(path.join(backupDirectory,'manifest.json'),'utf8'));
const dump=await readFile(path.join(backupDirectory,'frog-pre-migration.dump'));
if(createHash('sha256').update(dump).digest('hex')!==manifest.sha256)throw new Error('Backup checksum mismatch');
const {DATABASE_URL}=dotenv.parse(await readFile(envFile));
if(!new URL(DATABASE_URL).hostname.endsWith('.neon.tech'))throw new Error('Expected the authorized Neon database');
const client=new pg.Client({connectionString:DATABASE_URL,connectionTimeoutMillis:15000});
try {
  await client.connect();await client.query('begin');
  await client.query("set local lock_timeout='3s'");await client.query("set local statement_timeout='15s'");
  await client.query('select pg_advisory_xact_lock(71310002)');
  await client.query('lock table wallets in share row exclusive mode');
  const signature=async()=>(await client.query("select md5(coalesce(string_agg((to_jsonb(w)-'financial_revision')::text,'|' order by player_id),'')) hash from wallets w")).rows[0].hash;
  const before=await signature();
  await client.query(await readFile(new URL('../db/migrations/2026-10-13-wallet-idempotency.sql',import.meta.url),'utf8'));
  if(await signature()!==before)throw new Error('Wallet data changed unexpectedly');
  await client.query('commit');
  console.log(JSON.stringify({migration:'2026-10-13-wallet-idempotency',committed:true,walletDataPreserved:true}));
} catch(error) {
  await client.query('rollback').catch(()=>{});
  console.error('Migration failed; rolled back:',error.code||error.name);process.exitCode=1;
} finally {await client.end();}
