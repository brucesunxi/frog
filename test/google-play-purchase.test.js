import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeQaSchema} from './qa-schema.js';
import express from 'express';
import pg from 'pg';
import {createWalletService,WalletError} from '../lib/wallet-service.js';
import {createGooglePlayPurchaseHandler} from '../lib/google-play-purchase.js';

const databaseUrl=process.env.FROG_QA_DATABASE_URL;
test('Google purchase HTTP route with isolated PostgreSQL and a simulated publisher',{skip:!databaseUrl},async t=>{
  const url=new URL(databaseUrl);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname.endsWith('_qa'));
  const pool=new pg.Pool({connectionString:databaseUrl});
  const sql=async(strings,...values)=>(await pool.query(strings.reduce((q,s,i)=>q+(i?'$'+i:'')+s,''),values)).rows;
  const wallet=createWalletService(sql),players=[];
  let receipt,verifyFailure=false,consumeFailure=false,credentials=true,gets=0,consumes=0;
  const publisher={purchases:{products:{
    get:async request=>{gets++;assert.equal(request.packageName,'com.frogfrenzy.game');if(verifyFailure)throw new Error('provider token SECRET');return {data:receipt};},
    consume:async()=>{consumes++;if(consumeFailure)throw new Error('retry later');}
  }}};
  const app=express();app.use(express.json());
  app.post('/verify',(req,res,next)=>{req.playerId=req.headers['x-player'];next();},(req,res,next)=>
    createGooglePlayPurchaseHandler({sql,walletService:wallet,getPlayerState:id=>wallet.financialState(id),
      getAndroidPublisher:async()=>credentials?publisher:null,packageName:'com.frogfrenzy.game',
      products:{coins_starter:{kind:'coins',coins:300,bonus:0},coins_5500:{kind:'coins',coins:5500,bonus:500}}
    })(req,res).catch(next));
  app.use((error,req,res,next)=>res.status(error instanceof WalletError?error.status:503).json({error:error.message}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const endpoint=`http://127.0.0.1:${server.address().port}/verify`;
  async function player(){const rows=await sql`insert into players(install_id) values(${randomUUID()}) returning id`;const id=rows[0].id;players.push(id);await sql`insert into wallets(player_id,coin_balance) values(${id},300)`;return id;}
  async function post(id,token=randomUUID(),productId='coins_starter'){
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-player':id},body:JSON.stringify({productId,purchaseToken:token})});
    return {status:response.status,body:await response.json()};
  }
  const balance=async id=>(await wallet.financialState(id)).wallet.coin_balance;
  const reset=()=>{receipt={purchaseState:0,consumptionState:0,quantity:1};verifyFailure=false;consumeFailure=false;credentials=true;gets=0;consumes=0;};
  try {
    await initializeQaSchema(pool);
    await t.test('invalid inputs and missing credentials never credit a wallet',async()=>{
      reset();const id=await player();
      assert.equal((await post(id,'receipt','unknown')).status,400);
      assert.equal((await post(id,'')).body.error,'missing_purchase_token');
      assert.equal((await post(id,'x'.repeat(4097))).body.error,'invalid_purchase_token');
      credentials=false;assert.equal((await post(id)).status,503);
      assert.equal(gets,0);assert.equal(await balance(id),300);
    });
    await t.test('provider failure is bounded to an error response without disclosing receipt details',async()=>{
      reset();const id=await player();verifyFailure=true;
      const response=await post(id);assert.equal(response.status,502);
      assert.deepEqual(response.body,{error:'google_play_verification_failed'});
      assert.equal(await balance(id),300);assert.equal(consumes,0);
    });
    await t.test('pending and cancelled purchases cannot grant coins',async()=>{
      for(const state of [1,2]){reset();receipt.purchaseState=state;const id=await player();
        assert.equal((await post(id)).status,409);assert.equal(await balance(id),300);assert.equal(consumes,0);}
    });
    await t.test('verified quantity and bonus credit once; replay returns the same response shape',async()=>{
      reset();const id=await player(),token=randomUUID();receipt.quantity=2;
      const first=await post(id,token,'coins_5500');assert.equal(first.status,200);
      assert.equal(first.body.purchase.coinsGranted,12000);assert.equal(await balance(id),12300);
      const replay=await post(id,token,'coins_5500');assert.equal(replay.body.duplicate,true);
      assert.deepEqual(replay.body.purchase,first.body.purchase);assert.equal(gets,1);assert.equal(consumes,1);
      assert.equal((await sql`select count(*)::int n from coin_ledger where player_id=${id}`)[0].n,1);
      const other=await player();assert.equal((await post(other,token,'coins_5500')).status,409);
      assert.equal((await post(id,token,'coins_starter')).status,409);
    });
    await t.test('consume failure preserves the credit and retries without issuing it twice',async()=>{
      reset();const id=await player(),token=randomUUID();consumeFailure=true;
      const first=await post(id,token);assert.equal(first.body.consumptionPending,true);
      assert.equal(await balance(id),600);
      consumeFailure=false;const retry=await post(id,token);
      assert.equal(retry.body.duplicate,true);assert.equal(retry.body.consumptionPending,false);
      assert.equal(await balance(id),600);assert.equal(consumes,2);
      assert.ok((await sql`select consumed_at from google_play_purchases where purchase_token=${token}`)[0].consumed_at);
    });
    await t.test('pending receipt can later complete and a lost response can safely replay',async()=>{
      reset();const id=await player(),token=randomUUID();receipt.purchaseState=2;
      assert.equal((await post(id,token)).status,409);
      receipt.purchaseState=0;assert.equal((await post(id,token)).body.duplicate,false);
      assert.equal((await post(id,token)).body.duplicate,true);assert.equal(await balance(id),600);
    });
    await t.test('consumed receipt with no prior local credit cannot be reused as new money',async()=>{
      reset();receipt.consumptionState=1;const id=await player();
      assert.equal((await post(id)).body.error,'purchase_already_consumed');assert.equal(await balance(id),300);
    });
    await t.test('concurrent receipt submissions produce exactly one credit',async()=>{
      reset();const id=await player(),token=randomUUID();
      const responses=await Promise.all(Array.from({length:8},()=>post(id,token)));
      assert.ok(responses.every(r=>r.status===200));assert.equal(await balance(id),600);
      assert.equal((await sql`select count(*)::int n from coin_ledger where player_id=${id}`)[0].n,1);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));
    for(const id of players)await sql`delete from players where id=${id}`;
    await pool.end();
  }
});
