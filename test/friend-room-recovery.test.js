import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../game.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function showFriendRoomLoading()'),html.indexOf('async function loadFriendRoom('));
function harness() {
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',style:{},dataset:{},hidden:false,classList:{add(){}},removeAttribute(name){if(name==='data-kind')delete this.dataset.kind;}});return elements.get(id);};
  const c=vm.createContext({
    document:{getElementById:get,querySelector:get},STATE:{MENU:0},state:0,
    friendRoomRequestInFlight:false,friendRoomRequestGeneration:0,friendRoomRetryToken:'',
    pendingChallengeToken:'',pendingChallengeKind:'challenge',playerToken:'session',
    clearFriendRoomTimers(){},hidePrimaryOverlays(){},createLocalChallengeSeed:()=>1,
    async initPlayerSession(){},apiFetch:async()=>({room:{token:'room'},shareUrl:'https://example.com/r/room'}),
    applyFriendRoom(room){c.applied=room;},trackGrowthEvent(){},
  });
  vm.runInContext(source,c);
  return {c,get};
}
test('offline room creation offers a retry, reconnects the wallet and opens the room',async()=>{
  const {c,get}=harness();c.playerToken=null;
  await c.createFriendRoom();
  assert.equal(get('challengeLobbyTitle').textContent,'Unable to connect');
  assert.equal(get('roomRetryBtn').style.display,'inline-flex');
  assert.equal(c.friendRoomRequestInFlight,false);
  c.initPlayerSession=async()=>{c.playerToken='reconnected';};
  await c.retryFriendRoomConnection();
  assert.equal(c.applied.token,'room');
  assert.equal(get('roomRetryBtn').style.display,'none');
});
test('repeated creation taps send one request and stale replies cannot reopen a closed page',async()=>{
  const {c}=harness();let finish,calls=0;
  c.apiFetch=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  const first=c.createFriendRoom();await c.createFriendRoom();
  assert.equal(calls,1);
  c.friendRoomRequestGeneration++;
  finish({room:{token:'stale'},shareUrl:'https://example.com'});await first;
  assert.equal(c.applied,undefined);
  assert.equal(c.friendRoomRequestInFlight,false);
});
test('server failure unlocks creation and shows recovery rather than a permanent loading heading',async()=>{
  const {c,get}=harness();c.apiFetch=async()=>{throw new Error('timeout');};
  await c.createFriendRoom();
  assert.equal(get('challengeLobbyStatus').dataset.kind,'error');
  assert.match(get('challengeLobbyStatus').textContent,/retry/);
  assert.equal(get('challengeLobbyCode').textContent,'No room opened');
  assert.equal(c.friendRoomRequestInFlight,false);
});
