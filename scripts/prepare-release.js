import {cp, mkdir, readFile, readdir, writeFile, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const releaseFiles = ['api', 'assets', 'lib', 'store-assets', 'server.js', 'game.html',
  'privacy.html', 'app-ads.txt', 'package.json', 'package-lock.json', 'vercel.json'];

export async function prepareRelease(source, destination) {
  source=path.resolve(source);destination=path.resolve(destination);
  const relative=path.relative(source,destination);
  if (!relative || (!relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative))) {
    throw new Error('Release destination must be outside the source checkout');
  }
  // A fresh directory and an explicit allowlist prevent stale assets or local secrets.
  await mkdir(destination);
  for (const file of releaseFiles) {
    await cp(path.join(source,file),path.join(destination,file),{recursive:true,filter:async filename=>{
      if ((await lstat(filename)).isSymbolicLink()) throw new Error('Release inputs must not be symlinks');
      return !path.basename(filename).startsWith('.');
    }});
  }
  const hashes={};
  async function hashTree(directory) {
    for (const entry of await readdir(directory,{withFileTypes:true})) {
      const filename=path.join(directory,entry.name);
      if(entry.isDirectory())await hashTree(filename);
      else hashes[path.relative(destination,filename).split(path.sep).join('/')]=createHash('sha256').update(await readFile(filename)).digest('hex');
    }
  }
  await hashTree(destination);
  const manifest={format:1,files:hashes};
  await writeFile(path.join(destination,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2])throw new Error('Usage: node scripts/prepare-release.js <new-directory>');
  const manifest=await prepareRelease(fileURLToPath(new URL('..',import.meta.url)),process.argv[2]);
  console.log(`Prepared ${Object.keys(manifest.files).length} release files. Game SHA256: ${manifest.files['game.html']}`);
}
