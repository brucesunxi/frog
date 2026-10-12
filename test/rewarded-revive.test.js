import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../game.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('async function watchRewardAdForRevive()'), html.indexOf('function simulateCoinPurchase('));

function harness({ plugin, native = true, ios = false, timeLeft = 60 } = {}) {
  const status = { textContent: '' };
  const buttons = [{ disabled: false }, { disabled: true }, { disabled: false }];
  const c = vm.createContext({
    STATE: { GAME_OVER: 4, AD: 6, PLAYING: 1 }, state: 4, challengeActive: false,
    rewardReviveInFlight: false, timeLeft, levelTimer: 59,
    frog: { row: 14, col: 9 }, lives: 0, powerups: { shield: 0 }, totalRewardAds: 0,
    soundMuted: true, isNativeAndroid: () => native, isNativeIOS: () => ios, getFrogAdsPlugin: () => plugin,
    document: { getElementById: () => status, querySelectorAll: () => buttons },
    findReviveSpot: () => ({ row: 8, col: 4 }),
    saveProgress() { c.saves = (c.saves || 0) + 1; }, playSound() {}, startMusic() {},
    continuePlayingAfterAd() { c.state = 1; c.revives = (c.revives || 0) + 1; },
    startMockAd(title, message, callback) { c.preview = { title, message, callback }; }
  });
  vm.runInContext(source, c);
  return { c, status, buttons };
}

test('SDK earned result grants one revive, Shield and usable time after a timeout', async () => {
  const { c, buttons } = harness({ timeLeft: 0, plugin: { async showRewarded() { return { earned: true }; } } });
  await c.watchRewardAdForRevive();
  assert.equal(c.revives, 1);
  assert.equal(c.totalRewardAds, 1);
  assert.equal(c.lives, 1);
  assert.equal(c.powerups.shield, 1);
  assert.equal(c.frog.row, 8);
  assert.equal(c.timeLeft, 30);
  assert.equal(c.levelTimer, 0);
  assert.equal(c.rewardReviveInFlight, false);
  assert.deepEqual(buttons.map(b => b.disabled), [false, true, false]);
});

test('closing without an earned reward preserves the failed run and grants nothing', async () => {
  const { c, status } = harness({ plugin: { async showRewarded() { return { earned: false }; } } });
  await c.watchRewardAdForRevive();
  assert.equal(c.state, 4);
  assert.equal(c.totalRewardAds, 0);
  assert.equal(c.lives, 0);
  assert.equal(c.powerups.shield, 0);
  assert.match(status.textContent, /without a reward/);
});

test('no fill or show failure unlocks controls, preserves the run and permits retry', async () => {
  let calls = 0;
  const { c, status, buttons } = harness({ plugin: { async showRewarded() { calls++; throw new Error('No ad is ready'); } } });
  await c.watchRewardAdForRevive();
  assert.equal(c.state, 4);
  assert.equal(c.rewardReviveInFlight, false);
  assert.equal(c.totalRewardAds, 0);
  assert.deepEqual(buttons.map(b => b.disabled), [false, true, false]);
  assert.equal(status.textContent, 'No ad is ready');
  await c.watchRewardAdForRevive();
  assert.equal(calls, 2);
});

test('repeated taps open one ad and award exactly once after it closes', async () => {
  let finish, calls = 0;
  const { c, buttons } = harness({ plugin: { showRewarded() { calls++; return new Promise(resolve => { finish = resolve; }); } } });
  const watching = c.watchRewardAdForRevive();
  await c.watchRewardAdForRevive();
  assert.equal(calls, 1);
  assert.ok(buttons.every(b => b.disabled));
  assert.equal(c.state, 6);
  assert.equal(c.totalRewardAds, 0);
  finish({ earned: true });
  await watching;
  await c.watchRewardAdForRevive();
  assert.equal(calls, 1);
  assert.equal(c.revives, 1);
  assert.equal(c.timeLeft, 60);
});

test('Android with a missing bridge never falls back to a simulated reward', async () => {
  const { c, status } = harness();
  await c.watchRewardAdForRevive();
  assert.equal(c.preview, undefined);
  assert.equal(c.totalRewardAds, 0);
  assert.match(status.textContent, /unavailable/);
});

test('a stale ad result cannot revive a different screen or a friend challenge', async () => {
  let finish;
  const { c } = harness({ plugin: { showRewarded() { return new Promise(resolve => { finish = resolve; }); } } });
  const watching = c.watchRewardAdForRevive();
  c.state = 0;
  finish({ earned: true });
  await watching;
  assert.equal(c.totalRewardAds, 0);
  assert.equal(c.state, 0);
  c.state = 4;
  c.challengeActive = true;
  await c.watchRewardAdForRevive();
  assert.equal(c.rewardReviveInFlight, false);
});

test('web preview keeps its separate simulated flow', async () => {
  const { c } = harness({ native: false });
  await c.watchRewardAdForRevive();
  assert.match(c.preview.message, /3-second preview/);
  assert.equal(c.totalRewardAds, 0);
  c.preview.callback();
  assert.equal(c.revives, 1);
});

test('iOS premium edition never opens a rewarded ad or preview', async () => {
  const { c } = harness({ native: false, ios: true });
  await c.watchRewardAdForRevive();
  assert.equal(c.preview, undefined);
  assert.equal(c.totalRewardAds, 0);
  assert.equal(c.state, 4);
});
