import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../game.html',import.meta.url),'utf8');
function production(name) {
  const start=html.indexOf(`function ${name}(`),line=html.slice(start,html.indexOf('\n',start));
  const code=line.endsWith('}')?line:html.slice(start,html.indexOf('\n}',start)+2);
  return (html.slice(start-6,start)==='async '?'async ':'')+code;
}
function harness({android=true,ios=false,api,plugin}={}) {
  let sequence=0;
  const storage=new Map(),toasts=[],context=vm.createContext({
    isNativeAndroid:()=>android,isNativeIOS:()=>ios,coinBalance:300,previewCoinBalance:0,inventory:{},totalCoinsSpent:0,
    pendingRewardClaims:[],pendingWalletOperations:{},rewardSyncPromise:null,walletActionInFlight:false,lastFinancialRevision:-1,
    coinPurchaseInFlight:false,purchaseRecoveryInFlight:false,playerToken:'qa-token',level:10,levelElapsedFrames:3600,
    levelDeaths:0,levelNormalFlies:2,levelGoldenFlies:0,levelMaximumCombo:3,lives:5,
    clientEventId:()=> 'request_qa_'+(++sequence),getItemPrice:()=>60,
    localStorage:{setItem:(k,v)=>storage.set(k,v)},updateWalletUI(){},applyProgressPayload(){},showNotEnoughCoins(){},
    setStoreStatus:(text,kind)=>{context.status=text;context.kind=kind;},setWalletStatus:text=>{context.status=text;},
    saveProgress(){storage.set('frog_frenzy_save',JSON.stringify(context.getProgressPayload()));},
    getProgressPayload:()=>({coinBalance:context.coinBalance,inventory:context.inventory,pendingRewardClaims:context.pendingRewardClaims,pendingWalletOperations:context.pendingWalletOperations}),
    storeApiFetch:(...args)=>api(...args),window:{Capacitor:{Plugins:{FrogBilling:plugin}}},
    showCoinPurchaseConfirmation:amount=>toasts.push(amount)
  });
  for(const name of ['getAvailableCoins','applyPlayerState','syncRewardClaims','queueGameplayReward','spendCoinsForItem','hasInventoryItem','consumeInventoryItem','recoverGooglePurchases'])vm.runInContext(production(name),context);
  return {c:context,storage,toasts};
}
test('stale financial replies cannot overwrite newer balances or restore consumed items',()=>{
  const {c}=harness();
  c.applyPlayerState({wallet:{coin_balance:240,financial_revision:'3'},inventory:{shield:0}});
  c.applyPlayerState({wallet:{coin_balance:300,financial_revision:'2'},inventory:{shield:1}});
  assert.equal(c.coinBalance,240);assert.equal(c.inventory.shield,0);
  c.applyPlayerState({wallet:{coin_balance:999},inventory:{shield:9}});
  assert.equal(c.coinBalance,240);assert.equal(c.inventory.shield,0);
  c.applyPlayerState({wallet:{coin_balance:540,financial_revision:'4'},inventory:{}});
  assert.equal(c.coinBalance,540);assert.equal(c.inventory.shield,0);
});
test('Android failed spends grant nothing and retry the same operation after a lost response',async()=>{
  const requests=[];let fail=true;
  const {c}=harness({api:async(path,options)=>{
    requests.push(JSON.parse(options.body));if(fail)throw new Error('connection lost');
    return {state:{wallet:{coin_balance:240},inventory:{shield:1}}};
  }});
  assert.equal(await c.spendCoinsForItem('shield',1),false);assert.equal(c.coinBalance,300);assert.equal(c.inventory.shield,undefined);
  fail=false;assert.equal(await c.spendCoinsForItem('shield',1),true);
  assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(c.coinBalance,240);assert.equal(c.inventory.shield,1);
  assert.equal(Object.keys(c.pendingWalletOperations).length,0);
});
test('one wallet action runs at a time and unavailable inventory is never consumed locally',async()=>{
  let finish,calls=0;
  const {c}=harness({api:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  c.inventory.shield=1;const operation=c.consumeInventoryItem('shield');
  assert.equal(await c.consumeInventoryItem('shield'),false);assert.equal(calls,1);assert.equal(c.inventory.shield,1);
  finish({state:{wallet:{coin_balance:300},inventory:{shield:0}}});assert.equal(await operation,true);assert.equal(c.inventory.shield,0);
});
test('a lost spend reply remains retryable after sync reports an empty wallet',async()=>{
  const requests=[];let fail=true;
  const {c}=harness({api:async(path,options)=>{
    requests.push(JSON.parse(options.body));
    if(fail)throw new Error('reply lost after commit');
    return {state:{wallet:{coin_balance:0,financial_revision:1},inventory:{shield:1}},duplicate:true};
  }});
  c.coinBalance=60;
  assert.equal(await c.spendCoinsForItem('shield',1),false);
  c.applyPlayerState({wallet:{coin_balance:0,financial_revision:1},inventory:{shield:1}});
  fail=false;
  assert.equal(await c.spendCoinsForItem('shield',1),true);
  assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);
  assert.equal(c.coinBalance,0);assert.equal(c.inventory.shield,1);
  assert.equal(Object.keys(c.pendingWalletOperations).length,0);
});
test('lost tool confirmation survives relaunch with zero inventory and retries without another debit',async()=>{
  const requests=[];
  const first=harness({api:async(path,options)=>{requests.push(JSON.parse(options.body));throw new Error('reply lost after commit');}});
  first.c.inventory.shield=1;
  assert.equal(await first.c.consumeInventoryItem('shield'),false);
  const saved=JSON.parse(first.storage.get('frog_frenzy_save'));
  const reloaded=harness({api:async(path,options)=>{
    assert.equal(path,'/api/inventory/use');requests.push(JSON.parse(options.body));
    return {state:{wallet:{coin_balance:240,financial_revision:2},inventory:{shield:0}},duplicate:true};
  }}).c;
  reloaded.pendingWalletOperations=saved.pendingWalletOperations;
  reloaded.applyPlayerState({wallet:{coin_balance:240,financial_revision:2},inventory:{shield:0}});
  assert.equal(reloaded.hasInventoryItem('shield'),true);
  assert.equal(await reloaded.consumeInventoryItem('shield'),true);
  assert.equal(requests[0].requestId,requests[1].requestId);
  assert.equal(reloaded.inventory.shield,0);assert.equal(reloaded.hasInventoryItem('shield'),false);
  assert.equal(await reloaded.consumeInventoryItem('shield'),false);
});
test('a confirmed tool stays consumed after persisted reload and older sync replies',async()=>{
  const {c,storage}=harness({api:async()=>({state:{wallet:{coin_balance:240,financial_revision:2},inventory:{shield:0}}})});
  c.inventory.shield=1;
  assert.equal(await c.consumeInventoryItem('shield'),true);
  const saved=JSON.parse(storage.get('frog_frenzy_save'));
  const reload=harness().c;
  reload.inventory=saved.inventory;reload.coinBalance=saved.coinBalance;
  reload.applyPlayerState({wallet:{coin_balance:240,financial_revision:2},inventory:{shield:0}});
  reload.applyPlayerState({wallet:{coin_balance:240,financial_revision:1},inventory:{shield:1}});
  assert.equal(reload.inventory.shield,0);assert.equal(reload.coinBalance,240);
});
test('briefing permits pending confirmation at zero stock, but never treats it as a local iOS item',()=>{
  for(const android of [true,false]) {
    const {c}=harness({android,ios:!android}),buttons=[];
    c.pendingWalletOperations.use_shield='pending_use_001';c.selectedLoadout=null;
    c.document={getElementById:()=>({innerHTML:'',appendChild:button=>buttons.push(button)}),createElement:()=>({})};
    vm.runInContext(production('renderLoadoutChoices'),c);c.renderLoadoutChoices();
    assert.equal(buttons[0].disabled,!android);
    assert.equal(buttons[0].innerHTML.includes('Confirmation pending'),android);
    assert.equal(buttons[4].disabled,false);
  }
});
test('offline earned coins survive server sync, but unconfirmed coins cannot fund purchases',async()=>{
  const {c,storage}=harness({api:async()=>{throw new Error('offline');}});
  c.queueGameplayReward('complete',0,0,50,'earned_run_001');await c.rewardSyncPromise;
  c.applyPlayerState({wallet:{coin_balance:0}});assert.equal(c.getAvailableCoins(),50);
  assert.equal(c.pendingRewardClaims.length,1);assert.equal(JSON.parse(storage.get('frog_frenzy_save')).pendingRewardClaims.length,1);
  assert.equal(await c.spendCoinsForItem('shield',1),false);
  c.coinBalance=10;assert.equal(await c.spendCoinsForItem('shield',1),false);assert.equal(c.inventory.shield,undefined);
});
test('reward retry replaces pending estimates with the server balance without double-counting',async()=>{
  let fail=true,calls=0;
  const {c}=harness({api:async()=>{calls++;if(fail)throw new Error('lost reply');return{state:{wallet:{coin_balance:350}},duplicate:true};}});
  c.queueGameplayReward('complete',0,0,50,'earned_run_002');await c.rewardSyncPromise;
  assert.equal(c.getAvailableCoins(),350);
  fail=false;await c.syncRewardClaims();assert.equal(c.getAvailableCoins(),350);assert.equal(c.pendingRewardClaims.length,0);assert.equal(calls,2);
});
test('new rewards queued during a sync are drained before the sync resolves',async()=>{
  let finish,calls=0;
  const {c}=harness({api:async()=>{calls++;if(calls===1)return new Promise(resolve=>{finish=resolve;});return{state:{wallet:{coin_balance:310}}};}});
  c.queueGameplayReward('fail',1,0,5,'earned_fly_001');
  c.queueGameplayReward('fail',1,0,5,'earned_fly_002');
  finish({state:{wallet:{coin_balance:305}}});await c.rewardSyncPromise;
  assert.equal(calls,2);assert.equal(c.pendingRewardClaims.length,0);assert.equal(c.getAvailableCoins(),310);
});
test('iOS earnings and tools work locally without any Android financial endpoint',async()=>{
  const {c}=harness({android:false,ios:true,api:()=>{throw new Error('Unexpected request');}});
  c.queueGameplayReward('complete',0,0,50,'ios_run_001');assert.equal(c.getAvailableCoins(),350);
  assert.equal(await c.spendCoinsForItem('shield',1),true);c.inventory.shield=1;
  assert.equal(await c.consumeInventoryItem('shield'),true);assert.equal(c.coinBalance,290);assert.equal(c.inventory.shield,0);
});
test('recovery verifies completed purchases, leaves pending payments alone and avoids duplicate toasts',async()=>{
  let calls=0;
  const plugin={getPendingPurchases:async()=>({purchases:[
    {purchaseState:2,purchaseToken:'pending-token',productId:'coins_starter'},
    {purchaseState:1,purchaseToken:'complete-token',productId:'coins_starter'}
  ]})};
  const {c,toasts}=harness({plugin,api:async()=>{calls++;return{state:{wallet:{coin_balance:600}},purchase:{coinsGranted:300},duplicate:calls>1};}});
  await c.recoverGooglePurchases();await c.recoverGooglePurchases();
  assert.equal(calls,2);assert.equal(c.coinBalance,600);assert.deepEqual(toasts,[300]);
});
test('bundled iOS API calls use the native HTTPS bridge, not file-origin fetch',async()=>{
  const {c}=harness({android:false,ios:true});const timers=new Map();let request;
  c.AbortController=AbortController;c.setTimeout=fn=>{timers.set(1,fn);return 1;};c.clearTimeout=id=>timers.delete(id);
  c.fetch=()=>{throw new Error('Unexpected file-origin fetch');};
  c.window.NativeApp={request:async payload=>{request=payload;return{status:200,data:{state:{}}};}};
  vm.runInContext(production('apiFetch'),c);
  await c.apiFetch('/api/progress',{method:'PUT',body:'{}'});
  assert.equal(request.path,'/api/progress');assert.equal(request.headers.Authorization,'Bearer qa-token');assert.equal(timers.size,0);
  c.window.NativeApp.request=async()=>({status:503,data:{}});
  await assert.rejects(c.apiFetch('/api/progress'),error=>error.status===503);assert.equal(timers.size,0);
});
