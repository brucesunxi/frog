import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const server = readFileSync(new URL('../server.js',import.meta.url),'utf8');
const factory = server.slice(server.indexOf('function getAndroidPublisher()'),server.indexOf('function signSession('));

test('Google authentication and purchase requests have bounded timeouts without SDK retry loops', async () => {
  let authOptions, apiOptions, authCount=0;
  const publisher={purchases:{}};
  const context=vm.createContext({
    getGooglePlayCredentials:()=>({type:'service_account'}),
    google:{auth:{GoogleAuth:class {constructor(options){authOptions=options;authCount++;}}},
      androidpublisher:options=>{apiOptions=options;return publisher;}}
  });
  vm.runInContext(`let androidPublisherPromise=null; ${factory}`,context);
  assert.equal(await context.getAndroidPublisher(),publisher);
  assert.equal(await context.getAndroidPublisher(),publisher);
  assert.equal(authCount,1);
  assert.equal(authOptions.clientOptions.transporterOptions.timeout,10000);
  assert.equal(authOptions.clientOptions.transporterOptions.retry,false);
  assert.equal(apiOptions.timeout,10000);
  assert.equal(apiOptions.retry,false);
});

test('missing Google credentials do not create a pretend purchase verifier', async () => {
  const context=vm.createContext({getGooglePlayCredentials:()=>null,google:{}});
  vm.runInContext(`let androidPublisherPromise=null; ${factory}`,context);
  assert.equal(await context.getAndroidPublisher(),null);
});
