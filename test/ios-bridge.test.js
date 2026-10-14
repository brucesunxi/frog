import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('iOS native bridge permits only its explicit game API routes', {skip:process.platform !== 'darwin'}, () => {
  const source = readFileSync(new URL('../ios-native/FrogRiverPortal/Web/WebBridge.swift', import.meta.url),'utf8');
  const start = source.indexOf('    static func permitsRequest(');
  const end = source.indexOf('\n    static let platformJavaScript', start);
  assert.ok(start >= 0 && end > start);
  const cases = [
    ['/api/play/session','POST',true], ['/api/progress','PUT',true],
    ['/api/challenge-rooms/abc_DEF-123/status','GET',true],
    ['/api/challenge-attempts/1234-abcd/finish','POST',true],
    ['/api/wallet/spend','POST',false], ['/api/inventory/use','POST',false],
    ['/api/purchases/google-play/verify','POST',false],
    ['/api/a/../wallet/spend','POST',false], ['/api/%2e%2e/api/wallet/spend','POST',false],
    ['//attacker.example/api/play/session','POST',false],
    ['/api/play/session?redirect=evil','POST',false], ['/api/play/session','GET',false],
    ['/api/events','DELETE',false], ['/api/challenge-rooms/../../wallet/spend','POST',false]
  ];
  const checks = cases.map(([path,method,expected]) =>
    `precondition(Bridge.permitsRequest(path: ${JSON.stringify(path)}, method: ${JSON.stringify(method)}) == ${expected}, ${JSON.stringify(path+' '+method)})`).join('\n');
  const output = execFileSync('xcrun', ['swift','-module-cache-path','/tmp/FrogBridgeTestModules','-e',
    `import Foundation\nenum Bridge {\n${source.slice(start,end)}\n}\n${checks}\nprint("bridge-routes-passed")`], {encoding:'utf8',timeout:60000});
  assert.match(output,/bridge-routes-passed/);
});
