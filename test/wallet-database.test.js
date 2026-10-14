import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeQaSchema } from './qa-schema.js';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createWalletService } from '../lib/wallet-service.js';
import { normalizeRunReward } from '../lib/campaign-rewards.js';

const databaseUrl=process.env.FROG_QA_DATABASE_URL;
test('wallet transactions against isolated PostgreSQL', {skip:!databaseUrl}, async t=>{
  const url=new URL(databaseUrl);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname.endsWith('_qa'),'Refusing a non-local, non-QA database');
  const pool=new pg.Pool({connectionString:databaseUrl,max:16});
  const sql=async(strings,...values)=> (await pool.query(strings.reduce((q,s,i)=>q+(i?'$'+i:'')+s,''),values)).rows;
  const wallet=createWalletService(sql),players=[];
  const player=async()=>{
    const rows=await sql`insert into players (install_id) values (${randomUUID()}) returning id`;
    const id=rows[0].id;players.push(id);await sql`insert into wallets (player_id,coin_balance) values (${id},300)`;return id;
  };
  const balance=async id=>(await sql`select coin_balance from wallets where player_id=${id}`)[0].coin_balance;
  try {
    await initializeQaSchema(pool);
    await t.test('concurrent first sessions grant the starter balance only once',async()=>{
      const id=await player();await sql`update wallets set coin_balance=0 where player_id=${id}`;
      await Promise.all(Array.from({length:12},()=>wallet.grantStarter(id,300)));
      assert.equal(await balance(id),300);
      assert.equal((await sql`select count(*)::int as n from coin_ledger where player_id=${id}`)[0].n,1);
    });
    await t.test('repeated and concurrent spend retries charge once and store one item',async()=>{
      const id=await player(),item={id:'shield',cost:60};
      await Promise.all(Array.from({length:12},()=>wallet.spendItem(id,'spend_repeat_01',item,1)));
      assert.equal(await balance(id),240);
      assert.equal((await sql`select quantity from inventory where player_id=${id}`)[0].quantity,1);
      assert.equal((await sql`select count(*)::int as n from coin_ledger where player_id=${id}`)[0].n,1);
      await assert.rejects(wallet.spendItem(id,'spend_repeat_01',{id:'slowmo',cost:80},1),/request_id_conflict/);
    });
    await t.test('concurrent distinct spends cannot overdraw the wallet',async()=>{
      const id=await player(),item={id:'shield',cost:60};
      const results=await Promise.allSettled(Array.from({length:12},(_,i)=>wallet.spendItem(id,'unique_spend_'+i,item,1)));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
      assert.equal(await balance(id),0);
      assert.equal((await sql`select quantity from inventory where player_id=${id}`)[0].quantity,5);
    });
    await t.test('inventory consumption retries do not resurrect or double-consume an item',async()=>{
      const id=await player();await wallet.spendItem(id,'buy_for_use_01',{id:'shield',cost:60},2);
      await Promise.all(Array.from({length:10},()=>wallet.useItem(id,'use_repeat_01','shield')));
      assert.equal((await sql`select quantity from inventory where player_id=${id}`)[0].quantity,1);
      await wallet.useItem(id,'use_second_01','shield');
      await assert.rejects(wallet.useItem(id,'use_empty_01','shield'),/item_not_owned/);
    });
    await t.test('purchase tokens credit once under retries, bind to their player and product',async()=>{
      const id=await player(),other=await player(),token=randomUUID();
      await Promise.all(Array.from({length:12},()=>wallet.creditPurchase(id,'coins_starter',token,{quantity:1},300)));
      assert.equal(await balance(id),600);
      assert.equal((await sql`select count(*)::int as n from coin_ledger where player_id=${id}`)[0].n,1);
      await assert.rejects(wallet.creditPurchase(other,'coins_starter',token,{quantity:1},300),/purchase_token_already_bound/);
      await assert.rejects(wallet.creditPurchase(id,'coins_1000',token,{quantity:1},1000),/purchase_token_already_bound/);
    });
    await t.test('a pending token can transition to purchased instead of getting stuck forever',async()=>{
      const id=await player(),token=randomUUID();
      await sql`insert into google_play_purchases (purchase_token,player_id,product_id,purchase_state,coins_granted) values (${token},${id},'coins_starter','2',0)`;
      const result=await wallet.creditPurchase(id,'coins_starter',token,{quantity:1},300);
      assert.equal(result.duplicate,false);assert.equal(await balance(id),600);
    });
    await t.test('database failure rolls back purchase token, wallet and ledger together',async()=>{
      const id=await player(),token=randomUUID();
      await pool.query("alter table coin_ledger add constraint qa_reject_fault check (reason <> 'google_play_coins_fault')");
      try {await assert.rejects(wallet.creditPurchase(id,'coins_fault',token,{quantity:1},300));}
      finally {await pool.query('alter table coin_ledger drop constraint qa_reject_fault');}
      assert.equal(await balance(id),300);
      assert.equal((await sql`select count(*)::int as n from google_play_purchases where purchase_token=${token}`)[0].n,0);
    });
    await t.test('run claims retry once and a chapter bonus cannot be collected twice',async()=>{
      const id=await player(),claim=normalizeRunReward({requestId:'campaign_run_01',levelId:10,durationMs:60000,deaths:0,normalFlies:2,goldenFlies:1,lives:5,combo:3,result:'complete'});
      await Promise.all(Array.from({length:12},()=>wallet.grantRun(id,claim)));
      assert.equal(await balance(id),300+claim.baseCoins+claim.chapterBonus);
      await wallet.grantRun(id,{...claim,requestId:'campaign_run_02'});
      assert.equal(await balance(id),300+claim.baseCoins*2+claim.chapterBonus);
      assert.equal((await sql`select count(*)::int as n from campaign_chapter_bonuses where player_id=${id}`)[0].n,1);
    });
    await t.test('financial snapshots advance for a spend and tool use, but not duplicate retries',async()=>{
      const id=await player();
      const initial=await wallet.financialState(id);
      await wallet.spendItem(id,'snapshot_buy_01',{id:'shield',cost:60},1);
      const bought=await wallet.financialState(id);
      assert.equal(bought.wallet.coin_balance,240);assert.equal(bought.inventory.shield,1);
      assert.equal(Number(bought.wallet.financial_revision),Number(initial.wallet.financial_revision)+1);
      await wallet.useItem(id,'snapshot_use_01','shield');
      const used=await wallet.financialState(id);
      assert.equal(used.inventory.shield,0);
      assert.equal(Number(used.wallet.financial_revision),Number(bought.wallet.financial_revision)+1);
      await wallet.useItem(id,'snapshot_use_01','shield');
      assert.deepEqual(await wallet.financialState(id),used);
    });
    await t.test('concurrent snapshots never mix the wallet and inventory from different commits',async()=>{
      const id=await player();
      await Promise.all([
        ...Array.from({length:5},(_,i)=>wallet.spendItem(id,'snapshot_spend_'+i,{id:'shield',cost:60},1)),
        ...Array.from({length:30},async()=>{
          const snapshot=await wallet.financialState(id);
          assert.equal(snapshot.wallet.coin_balance,300-60*(snapshot.inventory.shield||0));
          assert.equal(Number(snapshot.wallet.financial_revision),snapshot.inventory.shield||0);
        })
      ]);
    });
    await t.test('reward normalization rejects fabricated amounts and impossible summaries',()=>{
      const base={requestId:'campaign_run_01',levelId:100,durationMs:60000,deaths:0,normalFlies:1,goldenFlies:0,lives:5,combo:5,result:'complete'};
      assert.deepEqual(normalizeRunReward({...base,coins:1e9}),normalizeRunReward(base));
      for(const patch of [{levelId:101},{durationMs:1},{normalFlies:1000},{lives:6},{requestId:'bad'},{result:'purchase'}])assert.throws(()=>normalizeRunReward({...base,...patch}));
    });
  } finally {
    for(const id of players)await sql`delete from players where id=${id}`;
    await pool.end();
  }
});
