import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {publicFiles} from '../lib/public-files.js';

test('static file service publishes game assets but never project sources or private configuration',async()=>{
  const app=express();app.use(publicFiles(fileURLToPath(new URL('..',import.meta.url))));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const route of ['/game.html','/privacy','/app-ads.txt','/assets/campaign.js'])assert.equal((await fetch(base+route)).status,200,route);
    for(const route of ['/server.js','/package.json','/.env','/db/schema.sql','/scripts/init-db.js','/lib/wallet-service.js','/android/release-signing.env','/assets/%2e%2e%2fserver.js']) {
      const response=await fetch(base+route);assert.ok([403,404].includes(response.status),route);
    }
  } finally {await new Promise(resolve=>server.close(resolve));}
});
