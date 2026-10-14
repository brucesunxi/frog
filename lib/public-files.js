import express from 'express';
import path from 'node:path';

export function publicFiles(rootDir) {
  const router=express.Router();
  router.use('/assets',express.static(path.join(rootDir,'assets'),{dotfiles:'deny'}));
  router.use('/store-assets',express.static(path.join(rootDir,'store-assets'),{dotfiles:'deny'}));
  for(const [route,file] of [['/game.html','game.html'],['/privacy','privacy.html'],['/privacy.html','privacy.html'],['/app-ads.txt','app-ads.txt']]) {
    router.get(route,(req,res)=>res.sendFile(file,{root:rootDir}));
  }
  return router;
}
