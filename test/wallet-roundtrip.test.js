import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import vm from 'node:vm';
import pg from 'pg';
import {initializeQaSchema} from './qa-schema.js';

const html=readFileSync(new URL('../game.html',import.meta.url),'utf8');
function production(name) {
  const start=html.indexOf(`function ${name}(`),line=html.slice(start,html.indexOf('\n',start));
  assert.ok(start>=0,name);
  const code=line.endsWith('}')?line:html.slice(start,html.indexOf('\n}',start)+2);
  return (html.slice(start-6,start)==='async '?'async ':'')+code;
}

test('shipped wallet client against real session, progress and inventory HTTP routes',
  {skip:!process.env.FROG_QA_DATABASE_URL,timeout:45000},async t=>{
  const databaseUrl=process.env.FROG_QA_DATABASE_URL,url=new URL(databaseUrl);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname.endsWith('_qa'));
  const pool=new pg.Pool({connectionString:databaseUrl});
  let child,endpoint;const installs=[];
  try {
    await initializeQaSchema(pool);
    // Only test configuration is inherited: never pull production credentials into QA.
    child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),
      env:{PATH:process.env.PATH,HOME:process.env.HOME,PORT:'0',DATABASE_URL:'',
        FROG_QA_DATABASE_URL:databaseUrl,JWT_SECRET:'isolated-wallet-roundtrip-qa-only',
        DOTENV_CONFIG_PATH:'/dev/null'},stdio:['ignore','pipe','pipe']});
    endpoint=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('QA server startup timed out')),15000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('QA server exited during startup'));});
      child.stdout.on('data',chunk=>{
        const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
        if(match){clearTimeout(timer);resolve(match[0]);}
      });
    });
    async function request(path,options={},token) {
      const response=await fetch(endpoint+path,{...options,signal:AbortSignal.timeout(5000),
        headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}});
      const result=await response.json();
      if(!response.ok)throw Object.assign(new Error(result.error),{status:response.status});
      return result;
    }
    async function player() {
      const installId='qa_'+randomUUID();installs.push(installId);
      return request('/api/play/session',{method:'POST',body:JSON.stringify({installId,platform:'android',appVersion:'qa-wallet'})});
    }
    function client(session,{android=true,ios=false,saved}={}) {
      let stored=saved,dropReply;
      const c=vm.createContext({isNativeAndroid:()=>android,isNativeIOS:()=>ios,
        coinBalance:300,previewCoinBalance:0,inventory:{},totalCoinsSpent:0,pendingRewardClaims:[],pendingWalletOperations:{},
        walletActionInFlight:false,lastFinancialRevision:-1,level:1,itemPurchaseInFlight:false,
        clientEventId:()=>randomUUID(),getItemPrice:()=>60,syncRewardClaims:async()=>true,
        updateWalletUI(){},applyProgressPayload(){},setWalletStatus(){},setStoreStatus(){},showNotEnoughCoins(){},
        renderShopContents(){},playSound(){},
        saveProgress:()=>{stored=JSON.stringify({coinBalance:c.coinBalance,inventory:c.inventory,pendingWalletOperations:c.pendingWalletOperations});},
        storeApiFetch:async(path,options)=>{
          const result=await request(path,options,session.token);
          if(dropReply===path){dropReply=null;throw new Error('Reply lost after server commit');}
          return result;
        }
      });
      if(saved)Object.assign(c,JSON.parse(saved));
      for(const name of ['getAvailableCoins','applyPlayerState','spendCoinsForItem','hasInventoryItem','consumeInventoryItem','buyInventoryItem'])vm.runInContext(production(name),c);
      return {c,saved:()=>stored,loseNextReply:path=>{dropReply=path;},
        sync:async()=>c.applyPlayerState((await request('/api/player/state',{},session.token)).state)};
    }
    await t.test('buy, consume and relaunch retain zero inventory; legacy progress cannot resurrect it',async()=>{
      const session=await player(),h=client(session);await h.sync();
      await h.c.buyInventoryItem('shield');assert.equal(h.c.coinBalance,240);assert.equal(h.c.inventory.shield,1);
      assert.equal(await h.c.consumeInventoryItem('shield'),true);assert.equal(h.c.inventory.shield,0);
      const reloaded=client(session,{saved:h.saved()});await reloaded.sync();
      assert.equal(reloaded.c.inventory.shield,0);assert.equal(reloaded.c.coinBalance,240);
      const legacy=await request('/api/progress',{method:'PUT',body:JSON.stringify({progress:{coinBalance:99999,inventory:{shield:99},levelsBeaten:0}})},session.token);
      reloaded.c.applyPlayerState(legacy.state);
      assert.equal(reloaded.c.inventory.shield,0);assert.equal(reloaded.c.coinBalance,240);
    });
    await t.test('lost purchase reply and relaunch recover one item even when the synced balance is zero',async()=>{
      const session=await player(),h=client(session);
      await request('/api/wallet/spend',{method:'POST',body:JSON.stringify({itemId:'shield',quantity:4,requestId:randomUUID()})},session.token);
      await h.sync();assert.equal(h.c.coinBalance,60);
      h.loseNextReply('/api/wallet/spend');assert.equal(await h.c.spendCoinsForItem('shield',1),false);
      const reloaded=client(session,{saved:h.saved()});await reloaded.sync();
      assert.equal(reloaded.c.coinBalance,0);assert.equal(await reloaded.c.spendCoinsForItem('shield',1),true);
      await reloaded.sync();assert.equal(reloaded.c.coinBalance,0);assert.equal(reloaded.c.inventory.shield,5);
    });
    await t.test('lost use reply and relaunch confirm the same operation without consuming twice',async()=>{
      const session=await player(),h=client(session);await h.sync();await h.c.buyInventoryItem('shield');
      h.loseNextReply('/api/inventory/use');assert.equal(await h.c.consumeInventoryItem('shield'),false);
      const reloaded=client(session,{saved:h.saved()});await reloaded.sync();
      assert.equal(reloaded.c.inventory.shield,0);assert.equal(reloaded.c.hasInventoryItem('shield'),true);
      assert.equal(await reloaded.c.consumeInventoryItem('shield'),true);await reloaded.sync();
      assert.equal(reloaded.c.hasInventoryItem('shield'),false);assert.equal(reloaded.c.coinBalance,240);
    });
    await t.test('web preview and iOS local tools stay consumed when cloud progress returns',async()=>{
      const session=await player();
      await request('/api/wallet/spend',{method:'POST',body:JSON.stringify({itemId:'shield',requestId:randomUUID()})},session.token);
      for(const ios of [false,true]) {
        const h=client(session,{android:false,ios});await h.c.buyInventoryItem('shield');
        assert.equal(await h.c.consumeInventoryItem('shield'),true);await h.sync();
        const reload=client(session,{android:false,ios,saved:h.saved()});await reload.sync();
        assert.equal(reload.c.inventory.shield,0);assert.equal(reload.c.coinBalance,240);
      }
    });
  } finally {
    if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
    for(const install of installs)await pool.query('delete from players where install_id=$1',[install]);
    await pool.end();
  }
});
