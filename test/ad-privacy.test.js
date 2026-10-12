import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../game.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('function getFrogAdsPlugin()'), html.indexOf('function makeSeededRandom('));

function harness(plugin, native = true) {
  const button = { hidden: true, disabled: false };
  const alerts = [];
  const context = vm.createContext({
    isNativeAndroid: () => native,
    window: { Capacitor: { Plugins: { FrogAds: plugin } }, alert: text => alerts.push(text) },
    document: { getElementById: () => button },
    console: { warn() {} }
  });
  vm.runInContext(source, context);
  return { context, button, alerts };
}

test('privacy entry follows both startup state and subsequent consent changes', async () => {
  let listener;
  const { context, button } = harness({
    async addListener(name, callback) { assert.equal(name, 'privacyOptionsChanged'); listener = callback; },
    async getPrivacyOptions() { return { required: true }; }
  });
  await context.initAdPrivacyOptions();
  assert.equal(button.hidden, false);
  listener({ required: false });
  assert.equal(button.hidden, true);
  listener({ required: true });
  assert.equal(button.hidden, false);
});

test('browser and iOS do not initialize the Android ad bridge', async () => {
  const { context, button } = harness({ addListener() { throw new Error('must not run'); } }, false);
  await context.initAdPrivacyOptions();
  assert.equal(button.hidden, true);
});

test('privacy options suppress repeated taps and apply the result', async () => {
  let finish, calls = 0;
  const { context, button } = harness({
    showPrivacyOptions() { calls++; return new Promise(resolve => { finish = resolve; }); }
  });
  const opening = context.showAdPrivacyOptions();
  await context.showAdPrivacyOptions();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  finish({ required: false });
  await opening;
  assert.equal(button.disabled, false);
  assert.equal(button.hidden, true);
});

test('privacy form errors give feedback and leave the entry usable', async () => {
  const { context, button, alerts } = harness({
    async showPrivacyOptions() { throw new Error('offline'); }
  });
  button.hidden = false;
  await context.showAdPrivacyOptions();
  assert.equal(button.disabled, false);
  assert.equal(button.hidden, false);
  assert.equal(alerts.length, 1);
});
