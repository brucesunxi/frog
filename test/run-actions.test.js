import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../game.html',import.meta.url),'utf8');
function production(name){const start=html.indexOf(`async function ${name}(`);return html.slice(start,html.indexOf('\n}',start)+2);}
function harness(){
  let resolve,calls=0,grants=0,revives=0;
  const c=vm.createContext({runActionInFlight:false,levelStartInFlight:false,levelRunId:'run_a',state:4,STATE:{GAME_OVER:4},
    inventory:{shield:1,revive:1},pendingWalletOperations:{},lives:0,powerups:{shield:0},frog:{},
    hasInventoryItem:type=>c.inventory[type]>0||!!c.pendingWalletOperations['use_'+type],
    consumeInventoryItem:()=>{calls++;return new Promise(done=>{resolve=done;});},
    spendCoinsForItem:async()=>true,isNativeAndroid:()=>true,
    grantPowerup:()=>{grants++;},findReviveSpot:()=>({row:14,col:9}),
    playSound(){},continuePlayingAfterAd:()=>{revives++;},
    briefingLevel:1,selectedLoadout:'shield',startLevel:()=>{calls++;return new Promise(done=>{resolve=done;});}
  });
  for(const name of ['useCoinPowerup','reviveWithCoins','launchBriefedLevel'])vm.runInContext(production(name),c);
  return {c,finish:value=>resolve(value),stats:()=>({calls,grants,revives})};
}
test('duplicate start taps launch only one expedition and unlock after failure',async()=>{
  const h=harness(),first=h.c.launchBriefedLevel();
  await h.c.launchBriefedLevel();assert.equal(h.stats().calls,1);
  h.finish(false);await first;assert.equal(h.c.levelStartInFlight,false);assert.equal(h.c.briefingLevel,1);
});
test('late tool confirmation cannot boost another run',async()=>{
  const h=harness(),first=h.c.useCoinPowerup('shield','continue');
  await h.c.useCoinPowerup('shield','continue');assert.equal(h.stats().calls,1);
  h.c.levelRunId='run_b';h.finish(true);await first;
  assert.equal(h.stats().grants,0);assert.equal(h.stats().revives,0);assert.equal(h.c.runActionInFlight,false);
});
test('late revive confirmation cannot resurrect a different screen',async()=>{
  const h=harness(),first=h.c.reviveWithCoins();
  await h.c.reviveWithCoins();assert.equal(h.stats().calls,1);
  h.c.state=0;h.finish(true);await first;
  assert.equal(h.c.lives,0);assert.equal(h.stats().revives,0);assert.equal(h.c.runActionInFlight,false);
});
test('confirmed revive still grants exactly one life and shield in its failed run',async()=>{
  const h=harness(),first=h.c.reviveWithCoins();h.finish(true);await first;
  assert.equal(h.c.lives,1);assert.equal(h.c.powerups.shield,1);assert.equal(h.stats().revives,1);
});
test('pending tool and revive confirmations retry without purchasing another item',async()=>{
  for(const type of ['shield','revive']) {
    const h=harness();h.c.inventory[type]=0;h.c.pendingWalletOperations['use_'+type]='lost_reply_001';
    h.c.spendCoinsForItem=()=>{throw new Error('Unexpected second purchase');};
    const action=type==='revive'?h.c.reviveWithCoins():h.c.useCoinPowerup('shield','continue');
    assert.equal(h.stats().calls,1);h.finish(true);await action;
    assert.equal(h.stats().revives,1);
  }
});
