import {readFile,mkdir,chmod,writeFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const [envFile,outputDir]=process.argv.slice(2);
if(!envFile||!outputDir||!path.isAbsolute(outputDir))throw new Error('Usage: node scripts/backup-database.js /private/config.env /private/backup-directory');
const config=dotenv.parse(await readFile(envFile));
const url=new URL(config.DATABASE_URL);
if(!url.hostname.endsWith('.neon.tech'))throw new Error('Expected the authorized Neon database');
await mkdir(outputDir,{recursive:true,mode:0o700});await chmod(outputDir,0o700);
const filename=path.join(outputDir,'frog-pre-migration.dump');
const client=new pg.Client({connectionString:config.DATABASE_URL,connectionTimeoutMillis:15000});
try {
  await client.connect();
  await client.query('begin isolation level repeatable read read only');
  const snapshot=(await client.query('select pg_export_snapshot() as id')).rows[0].id;
  const tables=(await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(row=>row.tablename);
  if(!tables.includes('players')||!tables.includes('wallets'))throw new Error('Unexpected database: Frog tables missing');
  const rowCounts={};
  for(const table of tables)rowCounts[table]=(await client.query(`select count(*)::text as count from public."${table.replaceAll('"','""')}"`)).rows[0].count;
  const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),
    PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:url.searchParams.get('sslmode')||'require',
    PGCHANNELBINDING:url.searchParams.get('channel_binding')||'prefer',PGCONNECT_TIMEOUT:'15'};
  await new Promise((resolve,reject)=>{
    const child=spawn('pg_dump',['--format=custom','--no-owner','--no-acl',`--snapshot=${snapshot}`,`--file=${filename}`],{env,stdio:['ignore','ignore','pipe'],timeout:300000});
    child.stderr.resume();
    child.on('error',()=>reject(new Error('Unable to start pg_dump')));
    child.on('exit',code=>code===0?resolve():reject(new Error(`pg_dump failed (${code}); credentials and provider output withheld`)));
  });
  await chmod(filename,0o600);
  const sha256=createHash('sha256').update(await readFile(filename)).digest('hex');
  await writeFile(path.join(outputDir,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),sha256,rowCounts},null,2),{mode:0o600});
  await client.query('commit');
  console.log(JSON.stringify({backup:filename,bytes:(await stat(filename)).size,sha256,tableCount:tables.length}));
} catch(error) {
  console.error('Backup failed:',error.code||error.name);process.exitCode=1;
} finally {await client.end();}
