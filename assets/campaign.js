(function (root) {
    'use strict';
    const COUNT = 100;
    const WORLDS = [
        { name:'Dewdrop Meadow', subtitle:'The first brave hops', motif:'meadow', icon:'leaf', sky:['#83cde0','#d9f4d0'], grass:'#487546', river:['#61c5cc','#227a9b'], road:['#626d78','#515d68'], accent:'#b8e68c', foliage:'#57975b', night:false },
        { name:'Cherry Orchard', subtitle:'Through petals and country lanes', motif:'petals', icon:'flower', sky:['#e6a7c8','#f5d5c0'], grass:'#66825a', river:['#89b9d9','#4f7daa'], road:['#747180','#5b6070'], accent:'#f1a9c9', foliage:'#d28daf', night:false },
        { name:'Willow Wetlands', subtitle:'Follow the shifting stepping stones', motif:'willow', icon:'waves', sky:['#80bec0','#c3d7ae'], grass:'#386b59', river:['#4ca9ac','#246b83'], road:['#647974','#49625f'], accent:'#8cdbbd', foliage:'#5ba584', night:false },
        { name:'Amber Harvest', subtitle:'Long shadows, longer convoys', motif:'harvest', icon:'sun', sky:['#ecb36f','#f8de9f'], grass:'#8b8648', river:['#73acbf','#397d9d'], road:['#776d64','#605e59'], accent:'#f6ce74', foliage:'#cf9e53', night:false },
        { name:'Azure Harbor', subtitle:'Find a rhythm between the tides', motif:'harbor', icon:'anchor', sky:['#79b9df','#c0e8ef'], grass:'#497f73', river:['#4aafce','#22678f'], road:['#687c90','#4a6276'], accent:'#8cdbf1', foliage:'#5f9c8c', night:false },
        { name:'Rainlight City', subtitle:'A bright route through the rain', motif:'city', icon:'buildings', sky:['#555f83','#9b89aa'], grass:'#41666b', river:['#658cc5','#354c86'], road:['#535974','#3c425e'], accent:'#c4b9ef', foliage:'#628c8b', night:true },
        { name:'Frostpine Pass', subtitle:'Cool heads and precise landings', motif:'snow', icon:'snowflake', sky:['#9abed8','#dce6ed'], grass:'#799e9b', river:['#80c9d6','#4e88ab'], road:['#728596','#536779'], accent:'#d2edfa', foliage:'#487f7b', night:false },
        { name:'Firefly Bayou', subtitle:'A thousand lights, one safe path', motif:'fireflies', icon:'sparkles', sky:['#1c3651','#3b6377'], grass:'#2d605b', river:['#3d8b9b','#23526b'], road:['#425b68','#304551'], accent:'#dfeb8f', foliage:'#428a70', night:true },
        { name:'Coral Causeway', subtitle:'Every crossing counts', motif:'coral', icon:'shell', sky:['#d991a6','#f4c6ad'], grass:'#56857c', river:['#59bdc2','#307e9c'], road:['#7a7a89','#606775'], accent:'#f2ab9d', foliage:'#6faaa0', night:false },
        { name:'Crownwater Summit', subtitle:'Bring the whole journey home', motif:'summit', icon:'crown', sky:['#3a4d77','#b6a8c8'], grass:'#456a6a', river:['#748fbd','#3d5c8c'], road:['#676985','#4e546e'], accent:'#f3dd97', foliage:'#6b9b95', night:true }
    ];
    const STAGES = ['First Light','Gentle Bend','Crosswind','Stepping Stones','Switchback','Two Currents','Long Way Home','Narrow Windows','Perfect Rhythm','The Crossing'];
    // Hand-authored route orderings keep refuge rows and introduce one layer at a time.
    const ROAD_ROWS = [[13,11,9,12,10],[12,10,13,9,11],[13,10,12,9,11],[11,13,9,12,10],[13,9,11,10,12],[12,9,13,10,11],[13,11,10,12,9],[10,13,9,11,12],[13,12,9,11,10],[11,9,13,12,10]];
    const RIVER_ROWS = [[7,4,6,3,5],[6,3,7,4,5],[7,5,3,6,4],[5,7,4,6,3],[7,4,6,3,5],[6,4,7,3,5],[7,3,5,6,4],[5,7,3,4,6],[7,6,4,3,5],[6,3,7,5,4]];
    const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
    function levelNumber(value) { return clamp(Math.floor(Number(value)||1),1,COUNT); }
    function getWorld(value) { return WORLDS[Math.floor((levelNumber(value)-1)/10)]; }
    function getLevel(value) {
        const id=levelNumber(value), worldIndex=Math.floor((id-1)/10), stage=(id-1)%10, t=(id-1)/99;
        const world=WORLDS[worldIndex];
        const roads=3+(id>=21?1:0)+(id>=61?1:0);
        const rivers=2+(id>=11?1:0)+(id>=41?1:0)+(id>=81?1:0);
        const lanes=[];
        const baseSpeed=.48+1.72*t;
        for (let i=0;i<roads;i++) {
            const truck=id>=12 && (i+stage+worldIndex)%3===0;
            const width=truck?76:40;
            lanes.push({ row:ROAD_ROWS[worldIndex][i], type:'road', dir:(i+stage+worldIndex)%2?1:-1,
                speed:Number((baseSpeed*(1+i*.045)).toFixed(3)), width,
                gap:Math.round(width+Math.max(94,220-110*t)),
                objType:truck?'truck':((i+worldIndex)%2?'car2':'car1'),
                phase:(id*31+i*67)%160 });
        }
        for (let i=0;i<rivers;i++) {
            const turtle=id>=23 && (i+stage)%3===0;
            const width=Math.round(132-38*t+(i%2)*12);
            lanes.push({ row:RIVER_ROWS[worldIndex][i], type:'river', dir:(i+stage)%2?-1:1,
                speed:Number((.38+1.4*t+i*.035).toFixed(3)), width,
                gap:Math.round(width+66+26*t), objType:turtle?'turtle':(i%2?'log2':'log1'),
                phase:(id*23+i*47)%120, divePeriod:Math.round(420-100*t), diveOffset:(id*13+i*41)%180 });
        }
        for (let row=3;row<=13;row++) if (!lanes.some(l=>l.row===row)) lanes.push({row,type:'grass'});
        lanes.sort((a,b)=>b.row-a.row);
        return { id, chapter:worldIndex+1, stage:stage+1, name:world.name+' · '+STAGES[stage], shortName:STAGES[stage],
            homesNeeded:id<16?3:(id<51?4:5), timeLimit:Math.round(120-48*t), difficulty:Number((1+9*t).toFixed(2)),
            milestone:stage===9, lanes, world };
    }
    function getPacing(value) {
        const id=levelNumber(value), cfg=getLevel(id);
        const focus=id<12?'Read the traffic':id<23?'Longer convoys':id<41?'Watch the turtles':id<61?'Plan the whole route':id<81?'Link safe crossings':'Master the rhythm';
        const detail=id<12?'Use the grass between lanes and commit when the road is clear.':id<23?'Let the full truck pass before crossing behind it.':id<41?'Turtles warn before diving. Logs always remain safe to ride.':id<61?'Pause on the central bank and line up your next river landing.':id<81?'Read two lanes ahead. A calm route beats a rushed shortcut.':'Use every refuge and choose a different home for each delivery.';
        return { title:cfg.milestone?'Chapter finale · '+focus:focus, detail, goldenChance:id<11?0:Math.min(.3,.08+id*.002) };
    }
    function getContract(value, startingLives) {
        const cfg=getLevel(value), cycle=(cfg.stage-1)%4;
        let type='combo', target=Math.min(cfg.homesNeeded,2+Math.floor((cfg.id-1)/40)), title='Delivery Rhythm';
        if (cycle===1) { type='flies'; target=cfg.id>=51?2:1; title='Firefly Trail'; }
        if (cycle===2) { type='safe'; target=3; title='Steady Crossing'; }
        if (cycle===3) { type='combo'; target=cfg.homesNeeded; title='Homeward Streak'; }
        if (cfg.milestone && cfg.id>=40) { type='perfect'; target=1; title='Chapter Crown'; }
        const text=type==='flies'?'Collect '+target+' firefl'+(target===1?'y':'ies')+' and finish the level.':type==='safe'?'Finish with at least 3 lives remaining.':type==='perfect'?'Finish without losing a life.':'Deliver '+target+' frogs in one combo streak.';
        return { type,target,title,text,reward:18+Math.floor((cfg.id-1)/5)*2+(cfg.milestone?10:0),progress:0,complete:false,startingLives:startingLives||5 };
    }
    function getReward(value,stars,contractComplete,firstClear) {
        const cfg=getLevel(value);
        const clear=12+Math.floor((cfg.id-1)/5)*2+clamp(stars,1,3)*3;
        const contract=contractComplete?getContract(value).reward:0;
        const milestone=cfg.milestone&&firstClear?40+cfg.chapter*10:0;
        return {clear,contract,milestone,total:clear+contract+milestone};
    }
    function turtleState(lane,tick) {
        if (lane.objType!=='turtle') return 'surface';
        const phase=((tick+(lane.diveOffset||0))%(lane.divePeriod||400))/(lane.divePeriod||400);
        return phase>=.84?'submerged':phase>=.72?'warning':'surface';
    }
    function getStars(elapsedFrames,limitSeconds,deliveries,deaths) {
        const ratio=1-elapsedFrames/(Math.max(1,limitSeconds)*60*Math.max(1,deliveries));
        return deaths===0&&ratio>.45?3:deaths<=2&&ratio>.2?2:1;
    }
    root.FrogCampaign=Object.freeze({ COUNT,WORLDS,getWorld,getLevel,getPacing,getContract,getReward,turtleState,getStars });
})(globalThis);
