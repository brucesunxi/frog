import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped functions, not a second implementation of navigation.
const html = readFileSync(new URL('../game.html', import.meta.url), 'utf8');
function productionFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const firstLine = html.slice(start, html.indexOf('\n', start));
  if (firstLine.endsWith('}')) return firstLine;
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
function harness({ native = true, buyCoins, api } = {}) {
  const elements = new Map();
  function element() {
    const classes = new Set();
    return {
      children: [], style: {}, dataset: {}, textContent: '', scrollTop: 0,
      classList: {
        add: v => classes.add(v), remove: v => classes.delete(v),
        contains: v => classes.has(v),
        toggle: (v, enabled) => enabled ? classes.add(v) : classes.delete(v)
      },
      set innerHTML(value) { this.markup = value; this.children = []; },
      get innerHTML() { return this.markup || ''; },
      appendChild(child) { this.children.push(child); },
      querySelector() { return this.content ||= element(); }
    };
  }
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    document: { getElementById: get, createElement: element },
    window: { Capacitor: { Plugins: buyCoins ? { FrogBilling: { buyCoins } } : {} } },
    AbortController, console,
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearInterval: id => timers.delete(id),
    isNativeAndroid: () => native,
    state: 0, _shopReturnState: 0, _coinStoreReturnState: 0, _adReturnState: 0,
    adInterval: null, _adCallback: null, inventory: {},
    coinBalance: 5, previewCoinBalance: 0, totalCoinsSpent: 0, level: 1,
    rewardedAdsThisExpedition: 0, totalRewardAds: 0,
    challengeActive: false, challengePauseStartedAt: 0,
    saveProgress() {}, playSound() {}, addPopup() {}, updateAdCount() {},
    showCoinPurchaseConfirmation: amount => { context.confirmedAmount = amount; },
    apiFetch: (...args) => api ? api(...args) : Promise.reject(new Error('offline')),
    applyPlayerState: value => { context.coinBalance = value.coins; if (value.inventory) context.inventory = value.inventory; }
  });
  vm.runInContext(html.match(/const STATE = .*;/)[0], context);
  vm.runInContext(html.slice(html.indexOf('const COIN_PACKS ='), html.indexOf('\n\nfunction isNativeAndroid')), context);
  vm.runInContext(html.slice(html.indexOf('const ITEM_PRICES ='), html.indexOf('\n// UI')), context);
  for (const name of ['setStoreStatus', 'setWalletStatus', 'updateWalletUI', 'getAvailableCoins', 'updateShopExitButton', 'showShop', 'renderShopContents', 'closeShop', 'resumeGame']) {
    vm.runInContext(productionFunction(name), context);
  }
  return { c: context, get, timers };
}

test('Android Buy Coins opens a separate real-product page and Back returns to the shop', () => {
  const { c, get } = harness();
  c.showShop();
  assert.equal(get('shopPowerups').children.length, 4);
  c.showCoinStore();
  assert.equal(c.state, 8);
  assert.equal(get('shopScreen').classList.contains('show'), false);
  assert.equal(get('coinStoreScreen').classList.contains('show'), true);
  assert.equal(get('coinPackGrid').children.length, 5);
  assert.match(get('coinPackGrid').children[0].innerHTML, /Starter Pack/);
  c.closeCoinStore();
  assert.equal(c.state, 7);
  c.closeShop();
  assert.equal(c.state, 0);
  assert.equal(get('startScreen').classList.contains('show'), true);
});

test('insufficient-coins overlay cannot block packs or leave the run frozen', async () => {
  const { c, get } = harness();
  c.state = 5;
  get('pauseScreen').classList.add('show');
  c.showShop();
  await c.buyInventoryItem('shield');
  assert.equal(c.state, 6);
  assert.equal(get('adScreen').classList.contains('show'), true);
  c.showCoinStore();
  assert.equal(get('adScreen').classList.contains('show'), false);
  assert.equal(c._coinStoreReturnState, 7);
  assert.equal(c._shopReturnState, 5);
  c.closeCoinStore();
  c.closeShop();
  assert.equal(c.state, 1);
  for (const id of ['adScreen', 'pauseScreen', 'shopScreen', 'coinStoreScreen']) {
    assert.equal(get(id).classList.contains('show'), false, id);
  }
});

test('return preserves game-over and level-complete screens', () => {
  for (const [state, id] of [[4, 'gameOverScreen'], [3, 'levelCompleteScreen']]) {
    const { c, get } = harness();
    c.state = state;
    get(id).classList.add('show');
    c.showCoinStore();
    assert.equal(get(id).classList.contains('show'), false);
    c.closeCoinStore();
    assert.equal(c.state, state);
    assert.equal(get(id).classList.contains('show'), true);
    c.showShop(); c.showCoinStore(); c.closeCoinStore(); c.closeShop();
    assert.equal(c.state, state);
    assert.equal(get(id).classList.contains('show'), true);
  }
});

test('web preview credits its exact amount and can return to gameplay', () => {
  const { c, get, timers } = harness({ native: false });
  c.state = 5; c.showShop(); c.showCoinStore();
  assert.equal(get('coinPackGrid').children.length, 3);
  assert.match(get('coinStoreDescription').textContent, /no real money/);
  get('coinPackGrid').children[0].onclick();
  const tick = [...timers.values()].find(timer => timer.ms === 1000).fn;
  tick(); tick(); tick();
  assert.equal(c.confirmedAmount, 120);
  assert.equal(c.getAvailableCoins(), 125);
  assert.match(get('shopStatus').textContent, /\+120.*125/);
  c.closeShop();
  assert.equal(c.state, 1);
});

test('missing billing, cancellation and checkout errors remain visible and unlock cards', async () => {
  for (const message of [null, 'Purchase cancelled', 'Google Play unavailable', 'Connection failed']) {
    const { c, get, timers } = harness({ buyCoins: message ? async () => { throw new Error(message); } : undefined });
    c.showShop(); c.showCoinStore();
    await c.buyCoinPack('coins_starter', 300);
    assert.equal(get('coinStoreStatus').dataset.kind, 'error');
    assert.ok(get('coinStoreStatus').textContent.length > 0);
    assert.ok(get('coinPackGrid').children.every(card => !card.disabled));
    assert.equal(timers.size, 0);
    c.closeCoinStore(); c.closeShop();
    assert.equal(c.state, 0);
  }
});

test('unresolved checkout is single-flight but Back and Close still work', async () => {
  let settle, calls = 0;
  const { c, get } = harness({ buyCoins: () => { calls++; return new Promise(resolve => { settle = resolve; }); } });
  c.showShop(); c.showCoinStore();
  const purchase = c.buyCoinPack('coins_starter', 300);
  await c.buyCoinPack('coins_starter', 300);
  assert.equal(calls, 1);
  assert.ok(get('coinPackGrid').children.every(card => card.disabled));
  c.closeCoinStore(); c.closeShop();
  assert.equal(c.state, 0);
  settle({ purchaseState: 2 });
  await purchase;
  assert.match(get('coinStoreStatus').textContent, /pending/);
  assert.equal(c.confirmedAmount, undefined);
});

test('verified purchases use the server amount and final wallet; duplicates do not re-toast', async () => {
  for (const duplicate of [false, true]) {
    const { c, get } = harness({
      buyCoins: async () => ({ purchaseToken: 'mock-token', productId: 'coins_starter', purchaseState: 1 }),
      api: async () => ({ state: { coins: 305 }, purchase: { coinsGranted: 300 }, duplicate })
    });
    c.showShop(); c.showCoinStore();
    await c.buyCoinPack('coins_starter', 9999);
    assert.match(get('coinStoreStatus').textContent, /305 coins/);
    assert.equal(c.confirmedAmount, duplicate ? undefined : 300);
    assert.equal(get('coinStoreStatus').dataset.kind, 'success');
  }
});

test('verification timeout aborts and gives receipt advice instead of a false success', async () => {
  const { c, get, timers } = harness({
    buyCoins: async () => ({ purchaseToken: 'mock-token', purchaseState: 1 }),
    api: (_path, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))
  });
  c.showShop(); c.showCoinStore();
  const purchase = c.buyCoinPack('coins_starter', 300);
  await new Promise(resolve => setImmediate(resolve));
  [...timers.values()].find(timer => timer.ms === 20000).fn();
  await purchase;
  assert.match(get('coinStoreStatus').textContent, /do not buy again.*receipt/);
  assert.equal(c.confirmedAmount, undefined);
  assert.ok(get('coinPackGrid').children.every(card => !card.disabled));
});

test('server-applied inventory is not credited twice and repeated taps spend once', async () => {
  let finish, calls = 0;
  const { c } = harness({ api: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  c.coinBalance = 100; c.showShop();
  const purchase = c.buyInventoryItem('shield');
  await c.buyInventoryItem('shield');
  assert.equal(calls, 1);
  finish({ state: { coins: 40, inventory: { shield: 1 } } });
  await purchase;
  assert.equal(c.inventory.shield, 1);
  assert.equal(c.getAvailableCoins(), 40);
});
