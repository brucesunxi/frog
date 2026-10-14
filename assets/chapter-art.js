(function (root) {
    'use strict';
    function paint(c,world,w,h,tick) {
        c.save();
        const sky=c.createLinearGradient(0,0,0,h);
        sky.addColorStop(0,world.sky[0]); sky.addColorStop(1,world.sky[1]);
        c.fillStyle=sky; c.fillRect(0,0,w,h);
        const oval=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
        const triangle=(x,y,size,color)=>{c.fillStyle=color;c.beginPath();c.moveTo(x,y-size);c.lineTo(x+size,y+size*.5);c.lineTo(x-size,y+size*.5);c.closePath();c.fill();};
        c.fillStyle=world.night?'#fff6d0':'#fff1bb';
        c.beginPath(); c.arc(w*.76,h*.24,h*.105,0,Math.PI*2); c.fill();
        if (world.night) {
            c.fillStyle='#ffffffa0';
            for(let i=0;i<35;i++) c.fillRect((i*97+41)%w,(i*19+11)%(h*.52),i%3===0?2:1,1);
        } else {
            for(let i=0;i<5;i++) {
                const x=(i*w*.23+(tick||0)*.05)%(w+100)-40;
                oval(x,h*(.15+i%2*.1),h*.25,h*.025,'#ffffff45');
            }
        }
        for(let i=0;i<7;i++) oval(i*w/5,h*.82,w*.25,h*(.2+i%3*.07),world.foliage+'70');
        c.fillStyle=world.grass; c.fillRect(0,h*.78,w,h*.22);
        if (world.motif==='city') {
            for(let i=0;i<16;i++) {
                const x=i*w/15, bh=h*(.22+(i*7%5)*.05),bw=w/21;
                c.fillStyle=i%2?'#364155':'#4b4c65';c.fillRect(x,h*.78-bh,bw,bh);
                c.fillStyle=world.accent+'aa';
                for(let y=h*.8-bh;y<h*.72;y+=9)for(let j=0;j<3;j++)if((i+j+Math.floor(y))%3)c.fillRect(x+5+j*8,y,3,4);
            }
        } else if (world.motif==='snow'||world.motif==='summit') {
            for(let i=0;i<8;i++) {
                const x=i*w/6, size=h*(.45+i%3*.15),y=h*.65;
                triangle(x,y,size,world.motif==='snow'?'#7699ad':'#647896');
                triangle(x,y-size*.68,size*.32,'#e5eff1');
            }
        } else if (world.motif==='harbor') {
            c.fillStyle='#43647b';c.fillRect(w*.68,h*.65,w*.31,h*.07);
            for(let i=0;i<3;i++){const x=w*(.7+i*.12);c.fillRect(x,h*.25,4,h*.43);c.fillRect(x-h*.17,h*.25,h*.4,3);}
            c.fillStyle='#f7edcf';c.fillRect(w*.56,h*.32,h*.08,h*.42);
            c.fillStyle='#d76c65';c.fillRect(w*.56,h*.47,h*.08,h*.06);triangle(w*.56+h*.04,h*.3,h*.065,'#bd5f59');
        } else if (world.motif==='harvest') {
            c.strokeStyle='#eac46c';c.lineWidth=2;
            for(let i=0;i<60;i++){const x=i*w/59,y=h*.81+(i%3)*6;c.beginPath();c.moveTo(x,y+15);c.lineTo(x+2,y-5);c.moveTo(x+2,y);c.lineTo(x-3,y-4);c.stroke();}
            const x=w*.73,y=h*.5;
            c.fillStyle='#ead6a2';c.fillRect(x-8,y,16,h*.27);triangle(x,y-4,18,'#906c6e');
            c.strokeStyle='#f9ebc7';c.lineWidth=5;c.beginPath();c.moveTo(x-25,y-24);c.lineTo(x+25,y+24);c.moveTo(x+25,y-24);c.lineTo(x-25,y+24);c.stroke();
        } else {
            for(let i=0;i<13;i++) {
                const x=i*w/12+8,y=h*(.68+(i%2)*.1),size=h*(.1+i%3*.025);
                c.fillStyle='#34524d';c.fillRect(x-2,y-size*.2,4,size*1.5);
                if(world.motif==='coral') {
                    c.strokeStyle=world.foliage;c.lineWidth=5;
                    for(let j=0;j<5;j++){c.beginPath();c.moveTo(x,y-size);c.quadraticCurveTo(x+(j-2)*12,y-size*2,x+(j-2)*18,y-size*.4);c.stroke();}
                } else {
                    oval(x,y-size,size,size*.8,world.foliage);
                    oval(x-size*.4,y-size*1.3,size*.7,size*.6,world.motif==='petals'?'#f3bad0':world.accent+'90');
                    if(world.motif==='willow'){c.strokeStyle=world.foliage;c.lineWidth=3;for(let j=-2;j<=2;j++){c.beginPath();c.moveTo(x+j*5,y-size);c.quadraticCurveTo(x+j*8,y,x+j*10,y+size*.5);c.stroke();}}
                }
            }
        }
        const river=c.createLinearGradient(0,h*.8,0,h);
        river.addColorStop(0,world.river[0]);river.addColorStop(1,world.river[1]);
        c.fillStyle=river;c.beginPath();c.moveTo(w*.4,h*.8);c.bezierCurveTo(w*.88,h*.73,w*.7,h*.92,w,h*.87);c.lineTo(w,h);c.lineTo(w*.14,h);c.bezierCurveTo(w*.62,h*.87,w*.23,h*.85,w*.4,h*.8);c.fill();
        c.fillStyle='#ffffff38';for(let i=0;i<20;i++)c.fillRect(w*(.4+i*.027),h*(.86+(i%4)*.028),12+i%3*6,1);
        if(world.motif==='petals'||world.motif==='snow'||world.motif==='fireflies'||world.motif==='city') {
            for(let i=0;i<24;i++) {
                const x=(i*83+(tick||0)*.2)%w,y=(i*31+(tick||0)*.1)%h;
                c.fillStyle=world.motif==='petals'?'#ffe1ebaa':world.motif==='fireflies'?'#edf997bb':'#e7f2f580';
                if(world.motif==='city') c.fillRect(x,y,1,7);else oval(x,y,world.motif==='petals'?3:1.5,world.motif==='petals'?1.6:1.5,c.fillStyle);
            }
        }
        c.restore();
    }
    root.FrogChapterArt=Object.freeze({paint});
})(globalThis);
