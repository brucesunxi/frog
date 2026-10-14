import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareRelease} from '../scripts/prepare-release.js';

test('release packages current game and backend together without stale files or private configuration',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'frog-package-'));
  try {
    const source=path.join(root,'source'),dest=path.join(root,'release');await mkdir(source);
    for(const dir of ['api','assets','lib','store-assets','android'])await mkdir(path.join(source,dir));
    const files=['api/index.js','assets/campaign.js','lib/wallet-service.js','store-assets/icon.png','server.js',
      'game.html','privacy.html','app-ads.txt','package.json','package-lock.json','vercel.json'];
    for(const file of files)await writeFile(path.join(source,file),'current '+file);
    await writeFile(path.join(source,'.env'),'not a real credential');
    await writeFile(path.join(source,'android','release-signing.env'),'not a real signing key');
    await writeFile(path.join(source,'assets','.private'),'not public');
    const manifest=await prepareRelease(source,dest);
    assert.deepEqual(Object.keys(manifest.files).sort(),files.sort());
    for(const file of files) {
      const content=await readFile(path.join(source,file));
      assert.equal(manifest.files[file],createHash('sha256').update(content).digest('hex'));
      assert.deepEqual(await readFile(path.join(dest,file)),content);
    }
    await assert.rejects(prepareRelease(source,dest),{code:'EEXIST'});
    await assert.rejects(prepareRelease(source,path.join(source,'nested')),/outside/);
    await symlink(path.join(source,'.env'),path.join(source,'assets','credential.txt'));
    await assert.rejects(prepareRelease(source,path.join(root,'unsafe')),/symlink/);
  } finally {await rm(root,{recursive:true,force:true});}
});
