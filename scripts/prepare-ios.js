import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
if(process.argv.includes('--file-lists')) {
    async function files(dir) {
        const entries=await readdir(dir,{withFileTypes:true}),result=[];
        for(const entry of entries) {
            const name=path.join(dir,entry.name);
            result.push(...(entry.isDirectory()?await files(name):[path.relative(root,name)]));
        }
        return result.sort();
    }
    const assets=await files(path.join(root,'assets'));
    const dir=path.join(root,'ios-native/FrogRiverPortal/Resources');
    await writeFile(path.join(dir,'OfflineGame-inputs.xcfilelist'),['$(SRCROOT)/../game.html','$(SRCROOT)/../scripts/prepare-ios.js',...assets.map(p=>'$(SRCROOT)/../'+p)].join('\n')+'\n');
    await writeFile(path.join(dir,'OfflineGame-outputs.xcfilelist'),['$(DERIVED_FILE_DIR)/Game/index.html',...assets.map(p=>'$(DERIVED_FILE_DIR)/Game/'+p)].join('\n')+'\n');
    process.exit(0);
}
const output=process.argv[2] || path.join(root,'ios-native/FrogRiverPortal/Resources/Game');
await mkdir(output,{recursive:true});
await cp(path.join(root,'game.html'),path.join(output,'index.html'));
await cp(path.join(root,'assets'),path.join(output,'assets'),{recursive:true});
console.log('iOS offline game assets prepared.');
