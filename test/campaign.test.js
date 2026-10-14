import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html=read('../game.html'), server=read('../server.js');
const campaignContext=vm.createContext({});
vm.runInContext(read('../assets/campaign.js'),campaignContext);
const campaign=campaignContext.FrogCampaign;
const levels=Array.from({length:100},(_,i)=>campaign.getLevel(i+1));
function production(name,source=html) {
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,name);
    const line=source.slice(start,source.indexOf('\n',start));
    return line.endsWith('}')?line:source.slice(start,source.indexOf('\n}',start)+2);
}

test('100 deterministic levels span 10 distinct worlds with bounded progressive difficulty',()=>{
    assert.equal(campaign.COUNT,100);
    assert.equal(campaign.WORLDS.length,10);
    assert.equal(new Set(levels.map(l=>l.name)).size,100);
    assert.equal(new Set(campaign.WORLDS.map(w=>w.motif)).size,10);
    for(const cfg of levels) {
        assert.equal(JSON.stringify(cfg),JSON.stringify(campaign.getLevel(cfg.id)));
        assert.equal(cfg.chapter,Math.ceil(cfg.id/10));
        assert.equal(cfg.milestone,cfg.id%10===0);
        assert.equal(cfg.lanes.length,11);
        assert.equal(new Set(cfg.lanes.map(l=>l.row)).size,11);
        assert.equal(cfg.lanes.find(l=>l.row===8).type,'grass');
        assert.ok(cfg.timeLimit>=72 && cfg.timeLimit<=120);
        assert.ok(cfg.homesNeeded>=3 && cfg.homesNeeded<=5);
        for(const lane of cfg.lanes) {
            if(lane.type==='road') { assert.ok(lane.gap-lane.width>=110);assert.ok(lane.speed<=2.6); }
            if(lane.type==='river') { assert.ok(lane.width>=94);assert.ok(lane.speed<=1.93); }
        }
        if(cfg.id>1) {
            const previous=levels[cfg.id-2];
            assert.ok(cfg.difficulty>previous.difficulty);
            assert.ok(cfg.timeLimit<=previous.timeLimit);
            assert.ok(cfg.homesNeeded>=previous.homesNeeded);
            for(const type of ['road','river']) {
                const a=cfg.lanes.filter(l=>l.type===type),b=previous.lanes.filter(l=>l.type===type);
                assert.ok(a.length>=b.length);
                assert.ok(Math.min(...a.map(l=>l.speed))>=Math.min(...b.map(l=>l.speed)));
            }
        }
    }
    assert.equal(campaign.getLevel(101).id,100);
    assert.equal(campaign.getLevel(-10).id,1);
});

// A time-expanded search uses the game's seven-frame hops and landing hitboxes.
// Waiting is restricted to grass: every returned path is a no-tool route.
function crossingFrames(cfg,initialFrame) {
    const rowLanes=new Map(cfg.lanes.map(l=>[l.row,l]));
    let reachable=new Set([14*20+9]);
    for(let step=1;step<600;step++) {
        const tick=step*7, safe=new Set(), next=new Set();
        for(let row=2;row<=14;row++)for(let col=0;col<20;col++) {
            const lane=rowLanes.get(row),x=col*40+20;
            if(!lane||lane.type==='grass') { safe.add(row*20+col);continue; }
            const count=Math.ceil(800/lane.gap)+2,period=count*lane.gap;
            let supported=false,hit=false;
            for(let i=0;i<count;i++) {
                const left=((i*lane.gap+lane.phase+lane.speed*lane.dir*tick)%period+period)%period-lane.gap;
                if(lane.type==='road' && x+10>left && x-10<left+lane.width)hit=true;
                if(lane.type==='river' && x>=left && x<=left+lane.width)supported=true;
            }
            if(lane.type==='road'?!hit:supported&&campaign.turtleState(lane,initialFrame+tick)!=='submerged')safe.add(row*20+col);
        }
        for(const cell of reachable) {
            const row=Math.floor(cell/20),col=cell%20;
            for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1],[0,0]]) {
                if(dr===0&&dc===0&&rowLanes.get(row)?.type!=='grass'&&row!==14)continue;
                const r=row+dr,c=col+dc,key=r*20+c;
                if(r>=2&&r<=14&&c>=0&&c<20&&safe.has(key)) {
                    if(r===2)return tick;
                    next.add(key);
                }
            }
        }
        reachable=next;
    }
    return Infinity;
}
test('every level has a no-tool crossing within its time limit at three turtle-cycle offsets',()=>{
    for(const cfg of levels)for(const frame of [0,137,1000]) {
        assert.ok(crossingFrames(cfg,frame)<cfg.timeLimit*60,`Level ${cfg.id}, frame ${frame}`);
    }
});

test('turtle warnings precede every dive and never exceed the platform cycle',()=>{
    for(const cfg of levels)for(const lane of cfg.lanes.filter(l=>l.objType==='turtle')) {
        const states=Array.from({length:lane.divePeriod},(_,i)=>campaign.turtleState(lane,i));
        assert.ok(states.includes('surface'));assert.ok(states.includes('warning'));assert.ok(states.includes('submerged'));
        for(let i=0;i<states.length;i++)if(states[i]==='submerged'&&states[(i+states.length-1)%states.length]!=='submerged')assert.equal(states[(i+states.length-1)%states.length],'warning');
    }
});

test('rewards scale gently, chapter bonuses pay only on first clear, and stars rate the whole run',()=>{
    let previous=0;
    for(const cfg of levels) {
        const contract=campaign.getContract(cfg.id,5),reward=campaign.getReward(cfg.id,3,true,true);
        assert.ok(reward.clear>=previous);previous=reward.clear;
        assert.equal(reward.total,reward.clear+reward.contract+reward.milestone);
        assert.equal(reward.contract,contract.reward);
        assert.equal(campaign.getReward(cfg.id,3,true,false).milestone,0);
        assert.ok(contract.type!=='combo'||contract.target<=cfg.homesNeeded);
        assert.equal(reward.milestone>0,cfg.milestone);
    }
    assert.equal(campaign.getStars(600,120,3,0),3);
    assert.equal(campaign.getStars(600,120,3,1),2);
    assert.equal(campaign.getStars(600,120,3,3),1);
    assert.equal(campaign.getStars(20000,120,3,0),1);
});

function uiHarness(ios=true) {
    const elements=new Map();
    function element() {
        const classes=new Set();
        return {children:[],attributes:{},textContent:'',style:{setProperty(){}},
            classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
            setAttribute(k,v){this.attributes[k]=v;},appendChild(c){this.children.push(c);},
            set innerHTML(v){this.markup=v;this.children=[];},get innerHTML(){return this.markup||'';}};
    }
    const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
    const arrows=[element(),element()];
    const c=vm.createContext({FrogCampaign:campaign,document:{getElementById:get,createElement:element,querySelectorAll:()=>arrows},
        CAMPAIGN_LEVELS:100,campaignChapter:null,campaignFinished:false,levelsBeaten:0,levelStars:{},totalStars:0,
        level:1,levelConfig:campaign.getLevel(1),state:1,levelElapsedFrames:600,levelDeaths:0,timeTotal:120,timeLeft:100,homesNeeded:3,
        highScore:0,score:100,maxCombo:0,coinBalance:300,previewCoinBalance:0,inventory:{},totalCoinsSpent:0,maxLives:5,lives:5,
        isNativeIOS:()=>ios,isNativeAndroid:()=>!ios,saveProgress(){},updateWalletUI(){},playSound(){},renderChapterScene(){},setWalletStatus(){},
        pendingRewardClaims:[],pendingWalletOperations:{},walletActionInFlight:false,lastFinancialRevision:-1,levelRunId:'test_run_001',
        levelNormalFlies:0,levelGoldenFlies:0,levelMaximumCombo:3,syncRewardClaims:async()=>true,
        applyProgressPayload(){},storeApiFetch(){throw new Error('Unexpected wallet request');},showNotEnoughCoins(){},
        settleContract:()=>0,initLevel:n=>{c.initialized=n;},getItemPrice:()=>60});
    vm.runInContext(html.match(/const STATE = .*;/)[0],c);
    for(const fn of ['getLevelConfig','getLevelPacing','getLevelStartPopup','getPrepPowerupForLevel','getAvailableCoins','getUnlockedLevel','isLevelUnlocked','renderLevelSelect','changeChapter','levelComplete','nextLevel','applyPlayerState','queueGameplayReward'])vm.runInContext(production(fn),c);
    vm.runInContext('async '+production('spendCoinsForItem'),c);
    return {c,get,arrows};
}
test('chapter browsing renders ten levels, preserves locks and resumes an eight-level save',()=>{
    const {c,get,arrows}=uiHarness();c.levelsBeaten=8;c.levelStars={1:3,8:2};c.totalStars=5;
    c.renderLevelSelect();
    assert.equal(get('levelGrid').children.length,10);
    assert.equal(get('continueBtn').textContent,'Continue Level 9');
    assert.equal(get('levelGrid').children[8].disabled,false);
    assert.equal(get('levelGrid').children[9].disabled,true);
    assert.equal(arrows[0].disabled,true);
    c.changeChapter(9);
    assert.equal(get('chapterName').textContent,'Crownwater Summit');
    assert.ok(get('levelGrid').children.every(b=>b.disabled));
    assert.equal(arrows[1].disabled,true);
    assert.equal(get('chapterTabs').children.length,10);
    c.levelsBeaten=99;c.renderLevelSelect();
    assert.equal(get('levelGrid').children[9].disabled,false);
});
test('level 99 unlocks 100 and final completion rewards once without creating level 101',()=>{
    const {c,get}=uiHarness();c.level=99;c.levelConfig=campaign.getLevel(99);c.levelsBeaten=98;
    c.levelComplete();assert.equal(c.getUnlockedLevel(),100);c.nextLevel();assert.equal(c.initialized,100);
    c.level=100;c.levelConfig=campaign.getLevel(100);c.campaignFinished=false;
    const before=c.coinBalance;c.levelComplete();const after=c.coinBalance;
    assert.ok(after>before);assert.equal(c.levelsBeaten,100);c.levelComplete();assert.equal(c.coinBalance,after);
    assert.equal(get('nextLevelBtn').textContent,'Finish Journey');
    c.initialized=null;c.nextLevel();assert.equal(c.initialized,null);assert.ok(get('winScreen').classList.contains('show'));
});
test('iOS earned coins and items survive remote wallet sync and spend locally; Android accepts zero',async()=>{
    const {c}=uiHarness();c.inventory={shield:2};
    c.applyPlayerState({wallet:{coin_balance:0},inventory:{shield:0}});
    assert.equal(c.coinBalance,300);assert.equal(c.inventory.shield,2);
    assert.equal(await c.spendCoinsForItem('shield',1),true);assert.equal(c.coinBalance,240);
    const android=uiHarness(false).c;android.applyPlayerState({wallet:{coin_balance:0}});assert.equal(android.coinBalance,0);
});
test('backend persists all 100 levels and 300 stars without truncating late chapters',()=>{
    const c=vm.createContext({});vm.runInContext(server.match(/const MAX_LEVELS = \d+;/)[0],c);
    for(const fn of ['clampInt','normalizeLevelStars','normalizeProgress'])vm.runInContext(production(fn,server),c);
    const result=c.normalizeProgress({levelsBeaten:100,levelStars:Object.fromEntries(levels.map(l=>[l.id,3]))});
    assert.equal(result.levelsBeaten,100);assert.equal(result.totalStars,300);assert.equal(result.levelStars[100],3);
});
test('production platform loops maintain spacing and submerged turtles cannot support a frog',()=>{
    const cfg=campaign.getLevel(100),lane=cfg.lanes.find(l=>l.objType==='turtle');
    const count=Math.ceil(800/lane.gap)+2;lane.period=count*lane.gap;
    const c=vm.createContext({FrogCampaign:campaign,challengeActive:false,lanes:[lane],laneObjects:[Array.from({length:count},(_,i)=>({x:i*lane.gap+lane.phase-lane.gap,width:lane.width}))],frog:{col:0,row:lane.row},CELL:40,frame:0,getEffectiveSpeed:l=>l.speed});
    for(const fn of ['updateLaneObjects','getObjectUnderFrog'])vm.runInContext(production(fn),c);
    for(let tick=0;tick<4000;tick++)c.updateLaneObjects();
    const xs=c.laneObjects[0].map(o=>o.x).sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++)assert.ok(Math.abs(xs[i]-xs[i-1]-lane.gap)<.0001);
    const object=c.laneObjects[0].find(o=>o.x>0&&o.x<600);c.frog.col=(object.x+object.width/2-20)/40;
    while(campaign.turtleState(lane,c.frame)!=='surface')c.frame++;
    assert.ok(c.getObjectUnderFrog());
    while(campaign.turtleState(lane,c.frame)!=='submerged')c.frame++;
    assert.equal(c.getObjectUnderFrog(),null);
});
test('friend challenges retain the prior fixed map independently of the campaign',()=>{
    const c=vm.createContext({});vm.runInContext(production('getChallengeLevelConfig'),c);
    const cfg=c.getChallengeLevelConfig();assert.equal(cfg.timeLimit,60);assert.equal(cfg.homesNeeded,999);
    assert.deepEqual(Array.from(cfg.lanes.filter(l=>l.type==='road'),l=>[l.row,l.dir,l.speed,l.gap]),[[13,1,.5,300],[12,-1,.6,280],[10,1,.7,260],[9,-1,.8,240]]);
    assert.deepEqual(Array.from(cfg.lanes.filter(l=>l.type==='river'),l=>[l.row,l.speed,l.width]),[[7,.4,95],[5,.5,85],[4,.6,105]]);
});
test('restoring a life cannot restore a perfect-run contract or its HUD label',()=>{
    const c=vm.createContext({activeContract:campaign.getContract(100,5),levelDeaths:1,lives:5,contractCoinsEarned:0});
    vm.runInContext(production('getContractProgressLabel'),c);vm.runInContext(production('settleContract'),c);
    assert.equal(c.getContractProgressLabel(c.activeContract),'Life lost');assert.equal(c.settleContract(),0);
    c.levelDeaths=0;assert.equal(c.getContractProgressLabel(c.activeContract),'Perfect run');assert.ok(c.settleContract()>0);
});

test('a no-tool bot clears all 100 levels through the shipped movement, collision and completion functions',()=>{
    const {c}=uiHarness();
    Object.assign(c,{
        W:800,H:640,CELL:40,COLS:20,ROWS:16,DEFAULT_CROSSING_TIME_LIMIT:100,
        frame:0,frog:{row:14,col:9},frogTarget:{row:14,col:9},frogMoving:false,frogDir:{dr:0,dc:0},frogAnim:0,
        frogSafe:true,frogLockTimer:0,frogInvincible:0,nearMissCooldown:0,nearMissFlash:0,
        lanes:[],laneObjects:[],homes:[],homesFilled:0,levelTimer:0,levelStartFrame:0,scoreAtLevelStart:0,
        particles:[],popupTexts:[],trailParticles:[],exhaustParticles:[],flies:[],clouds:[],stars:[],
        powerups:{shield:0,slowmo:0,superJump:0,secondChance:0},comboCount:0,comboFlash:0,screenShake:0,flashOverlay:0,
        challengeActive:false,deathAnim:0,justSavedByShield:false,contractCoinsEarned:0,rewardedAdsThisExpedition:0,
        levelMaximumCombo:0,levelNormalFlies:0,levelGoldenFlies:0,levelRunId:'',_po:0,clientEventId:()=> 'engine_run_'+c.level,
        gameplayRandom:()=>.5,initAudio(){},startMusic(){},soundMuted:true,contractCoinsEarned:0
    });
    const timers=[];
    c.setTimeout=(fn,ms)=>timers.push({fn,due:c.frame+Math.ceil(ms*60/1000)});
    for(const name of ['initLevel','getLevelTimeLimit','getContractForLevel','getEffectiveSpeed','restoreCrossingTime','rememberFail','update',
        'updateLaneObjects','getObjectUnderFrog','isTurtleUnderFrog','checkNearMiss','checkFrogPosition','checkRoadCollision','frogHit',
        'moveFrog','spawnParticle','addPopup','progressContract','settleContract'])vm.runInContext(production(name),c);
    function advance(n) {
        for(let i=0;i<n;i++) {
            c.update();
            for(let j=timers.length-1;j>=0;j--)if(timers[j].due<=c.frame){const timer=timers.splice(j,1)[0];timer.fn();}
            assert.equal(c.levelDeaths,0,`Unexpected collision at level ${c.level}, frame ${c.frame}`);
        }
    }
    function route() {
        const start=Math.round(c.frog.row)*20+Math.round(c.frog.col),rowLanes=new Map(c.lanes.map((l,i)=>[l.row,{lane:l,objects:c.laneObjects[i]}]));
        let reachable=new Map([[start,null]]);const parents=[];
        for(let step=1;step<600;step++) {
            const next=new Map(),tick=step*7;
            function safe(row,col) {
                const entry=rowLanes.get(row);if(!entry||entry.lane.type==='grass')return true;
                const {lane,objects}=entry,x=col*40+20;
                const xs=objects.map(o=>((o.x+lane.speed*lane.dir*tick+lane.gap)%lane.period+lane.period)%lane.period-lane.gap);
                return lane.type==='road'?!xs.some(left=>x+10>left&&x-10<left+lane.width):
                    campaign.turtleState(lane,c.frame+tick)!=='submerged'&&xs.some(left=>x>=left&&x<=left+lane.width);
            }
            for(const cell of reachable.keys()) {
                const row=Math.floor(cell/20),col=cell%20;
                for(const [dr,dc] of [[-1,0],[0,-1],[0,1],[1,0],[0,0]]) {
                    if(dr===0&&dc===0&&rowLanes.get(row)?.lane.type!=='grass'&&row!==14)continue;
                    const r=row+dr,k=col+dc,key=r*20+k;
                    if(r<2||r>14||k<0||k>=20||next.has(key)||!safe(r,k))continue;
                    next.set(key,{cell,move:[dr,dc]});
                    if(r===2) {
                        parents.push(next);const moves=[];let current=key;
                        for(let i=parents.length-1;i>=0;i--){const p=parents[i].get(current);moves.unshift(p.move);current=p.cell;}
                        return moves;
                    }
                }
            }
            parents.push(next);reachable=next;
        }
        throw new Error('No route at level '+c.level);
    }
    const targets=[9,5,13,1,17];c.initLevel(1);c.state=1;
    for(let level=1;level<=100;level++) {
        assert.equal(c.level,level);
        const deliveries=c.homesNeeded;
        for(let delivery=0;delivery<deliveries;delivery++) {
            advance(Math.max(0,c.frogLockTimer));
            for(const [dr,dc] of route()){if(dr||dc)c.moveFrog(dr,dc);advance(7);}
            while(c.frog.col!==targets[delivery]){c.moveFrog(0,c.frog.col<targets[delivery]?1:-1);advance(7);}
            c.moveFrog(-1,0);advance(7);
            assert.equal(c.homesFilled,delivery+1);
        }
        advance(24);assert.equal(c.levelsBeaten,level);assert.equal(c.state,3);
        c.nextLevel();
    }
    assert.equal(c.level,100);assert.equal(c.levelsBeaten,100);
    assert.equal(Object.keys(c.levelStars).length,100);assert.ok(c.totalStars>=100&&c.totalStars<=300);
});
