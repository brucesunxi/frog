import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function catalog(file, name) {
  const source=readFileSync(new URL(file,import.meta.url),'utf8');
  const start=source.indexOf(`const ${name} = [`);
  assert.ok(start>=0,`${name} exists`);
  const end=source.indexOf('\n];',start)+3;
  return vm.runInNewContext(`${source.slice(start,end)}\n${name}`);
}

test('all five Play product IDs map to the same base, bonus and delivered coins in client and server',()=>{
  const frontend=catalog('../game.html','COIN_PACKS');
  const backend=catalog('../server.js','STORE_PRODUCTS');
  const expected=[
    ['coins_starter',300,0,300],
    ['coins_1000',1000,0,1000],
    ['coins_5500',5500,500,6000],
    ['coins_12000',12000,2000,14000],
    ['coins_26000',26000,6000,32000]
  ];
  assert.equal(frontend.length,expected.length);assert.equal(backend.length,expected.length);
  assert.equal(new Set(frontend.map(p=>p.productId)).size,expected.length);
  for(const [id,coins,bonus,total] of expected) {
    const client=frontend.find(p=>p.productId===id),server=backend.find(p=>p.googlePlayProductId===id);
    assert.ok(client&&server,id);
    for(const pack of [client,server]) {
      assert.equal(pack.coins,coins,id);assert.equal(pack.bonus,bonus,id);
      assert.equal(pack.coins+pack.bonus,total,id);
    }
  }
});
