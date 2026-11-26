const trackY=416;
const regions=[
  {name:'Кедровый тракт',color:'#303c32',camps:[[790,45,0,0],[1580,-410,1,0],[2240,820,0,2],[2680,-900,1,1],[3200,100,2,0]]},
  {name:'Каменные сады',color:'#423639',camps:[[3890,-40,2,1],[4430,900,2,2],[4810,-1030,1,5],[5330,5,0,4],[6180,-300,4,4],[6900,35,3,2]]},
  {name:'Тростниковый край',color:'#304344',camps:[[7690,350,1,4],[8150,-700,4,4],[8650,1380,1,1],[9240,40,5,1],[9870,-1550,4,0],[10540,760,5,4]]},
  {name:'Пепельный кряж',color:'#493c32',camps:[[11390,150,2,5],[12100,-840,4,5],[12460,1220,2,2],[13120,10,3,4],[13650,-1150,5,5],[14310,330,3,5,4]]}
];
const regionIndex=x=>Math.min(regions.length-1,Math.floor(Math.max(x,0)*regions.length/W));
const keys=new Set(),guards=[];
const $=s=>document.querySelector(s);
let pos=350,cam=0,face=1,velocity=0,paused=false,won=false,dead=false,sound=false,audio,phase=0,last=0;
let health=100,attackAt=-10,dodgeAt=-10,hurtAt=-10,dodgeFace=1,attackFace=1,spent=false;
let depth=trackY,depthVelocity=0,heading={x:1,y:0},attackDir={x:1,y:0},dashDir={x:1,y:0};
const depthRatio=.60;
const species=[
  {name:'Пепельная гончая',speed:147,range:55,windup:.37,damage:14,rest:.65},
  {name:'Плакальщица',speed:95,range:118,windup:.9,damage:21,rest:1.15},
  {name:'Костяной рыцарь',speed:64,range:84,windup:.76,damage:32,rest:1.0},
  {name:'Алый воевода',speed:139,range:99,windup:.62,damage:28,rest:.8}
];
function distanceTo(x,y){return Math.hypot(pos-x,(depth-y)/depthRatio)}
function depthScale(y){return .90+(y-374)*.0025}
let spirit=100, guardAt=-10, riposteUntil=-10, combo=0, feedback='', feedbackUntil=0;
const difficulties={
  easy:{incoming:.25,outgoing:3,windup:1.7,rest:1.7,speed:.72,breath:38,heal:20,chain:0,
    hint:'Слабые удары врагов. Победы восстанавливают здоровье.'},
  medium:{incoming:1,outgoing:1,windup:1,rest:1,speed:1,breath:23,heal:0,chain:1,
    hint:'Обычный темп боя. Следите за замахом противника.'},
  hard:{incoming:1.5,outgoing:1,windup:.77,rest:.72,speed:1.14,breath:18,heal:0,chain:2,
    hint:'Опасные удары, короткие передышки и длинные серии воеводы.'}
};
let difficulty=difficulties.medium,starting=true;
function chooseDifficulty(key){
  difficulty=difficulties[key]||difficulties.medium;
  setText('#difficultyHint',difficulty.hint);
}
const cuts=[
  {duration:.76,start:.19,end:.36,cost:12,step:4,damage:1},
  {duration:1.09,start:.36,end:.64,cost:27,step:7,damage:3}
];
const readyCuts=[{...cuts[0],duration:.49,start:.115,end:.275},{...cuts[1],duration:.83,start:.23,end:.51}];
let fromSheath=true,slashSide=1,cleanAt=-10;
const cut=()=>(fromSheath?cuts:readyCuts)[combo];
const activeGuard=d=>Math.abs(d.x-pos)<1400&&Math.abs(d.y-depth)<850;
const enemies=[...species,
  {...species[0],name:'Тростниковый ловец',speed:187,windup:.31,rest:.85},
  {...species[2],name:'Страж обсидиана',damage:38,speed:52,windup:1.02,rest:1.3}
];
let windAt=null,releaseLift=0;
const struck=new Set();
let opponent=null, travelIntent={x:0,y:0};
function combatFacing(fallback){
  if(mouseLook){opponent=null;return {x:-Math.sin(cameraYaw),y:-Math.cos(cameraYaw)}}
  const eligible=d=>d.hp>0&&activeGuard(d);
  if(!opponent||!eligible(opponent)||distanceTo(opponent.x,opponent.y)>305){
    opponent=null;
    let nearest=225;
    for(const d of guards){
      const distance=distanceTo(d.x,d.y);
      if(eligible(d)&&distance<nearest){nearest=distance;opponent=d}
    }
  }
  if(!opponent)return fallback;
  const x=opponent.x-pos,y=(opponent.y-depth)/depthRatio,d=Math.hypot(x,y);
  return d>.01?{x:x/d,y:y/d}:fallback;
}
let bladeOut=false,bladeChanged=-10;
function toggleBlade(){
  if(paused||phase-bladeChanged<.48||windAt!==null||phase-attackAt<cut().duration||phase-Math.max(guardAt,dodgeAt,bladeChanged)<.48)return;
  cleanAt=-10;bladeOut=!bladeOut;bladeChanged=phase;ping(bladeOut?440:250);ui();
}
function drawSword(){
  if(paused||phase-bladeChanged<.48||windAt!==null||phase-attackAt<cut().duration||phase-dodgeAt<.26||phase-guardAt<.24)return;
  windAt=phase;
}
function whisper(message){feedback=message;feedbackUntil=phase+1.15}
function parry(){
  if(paused||phase-bladeChanged<.48||phase-guardAt<.68||phase-attackAt<cut().end||phase-dodgeAt<.25||spirit<9)return;
  cleanAt=-10;windAt=null;guardAt=phase;spirit-=9;ping(390);
}
function spawnGuards(){
  guards.length=0;
  regions.forEach((region,index)=>{
    for(const [x,z,...pack] of region.camps)pack.forEach((kind,i)=>{
      const type=kind===4?0:kind===5?2:kind,hp=[4,5,6,12,3,8][kind];
      const body={x:x+i*62,z:z+(i%2)*38,r:bodySizes[type][0]};
      confine(body);
      const homeY=trackY+body.z*depthRatio;
      guards.push({home:body.x,homeY,type,kind,region:index,x:body.x,y:homeY,hp,max:hp,
        aimX:0,aimY:0,kickX:0,kickZ:0,stunned:0,wind:-10,ready:.18*i,flash:-10,dir:-1,exposed:0,chain:0});
    });
  });
}
function ping(hz){if(!sound||!audio)return;const o=audio.createOscillator(),v=audio.createGain();o.frequency.value=hz;v.gain.setValueAtTime(.055,audio.currentTime);v.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.42);o.connect(v);v.connect(audio.destination);o.start();o.stop(audio.currentTime+.43)}
function setText(selector,value){let el=$(selector);if(el.textContent!==value)el.textContent=value}
function ui(){
  const index=regionIndex(pos),region=regions[index],locals=guards.filter(d=>d.region===index);
  const alive=guards.filter(d=>d.hp),near=locals.filter(d=>d.hp);
  const targetGuard=(near.length?near:alive).reduce((a,b)=>!a||distanceTo(b.x,b.y)<distanceTo(a.x,a.y)?b:a,null);
  const target=targetGuard?.x??pos,targetY=targetGuard?.y??depth;
  chapterTitle(region.name);setText('#act','РЕГИОН '+(index+1)+' / '+regions.length);
  setText('#zone',region.name.toUpperCase());$('#spirit').value=spirit;
  setText('#count',String(guards.length-alive.length));setText('#total',String(guards.length));
  setText('#hp',health+' / 100');$('#life').value=health;
  setText('#quest',near.length?'Противники в регионе · '+near.length+' / '+locals.length:'Регион зачищен');
  setText('#dots',regions.map((r,i)=>guards.some(d=>d.region===i&&d.hp)?'◇':'◆').join(' '));
  const wx=target-pos,wz=(targetY-depth)/depthRatio;
  const horizontal=wx*Math.cos(cameraYaw)-wz*Math.sin(cameraYaw),vertical=wx*Math.sin(cameraYaw)+wz*Math.cos(cameraYaw);
  const arrow=['→','↘','↓','↙','←','↖','↑','↗'][(Math.round(Math.atan2(vertical,horizontal)*4/Math.PI)+8)%8];
  setText('#bearing',Math.round(Math.hypot(wx,wz)/10)+' м '+arrow);
  setText('#bladeState',bladeOut?'Клинок обнажён':'Клинок в ножнах');
  setText('#notice',phase<feedbackUntil?feedback:windAt!==null&&phase-windAt>=.48?'Отпустите · сильный разрез':bellHint());
}
function interact(){
  if(paused)return;
  ringNearbyBell();
  ui();
}
function attack(){
  if(windAt===null)return;
  const held=phase-windAt;
  releaseLift=Math.min(1,held/.48);windAt=null;
  if(paused)return;
  const style=held>=.48?1:0;
  if(spirit<cuts[style].cost){whisper('Дайте дыханию восстановиться');return}
  fromSheath=!bladeOut;bladeOut=true;bladeChanged=-10;slashSide=-slashSide;cleanAt=-10;combo=style;struck.clear();spirit-=cut().cost;attackDir=combatFacing(heading);heading=attackDir;attackFace=Math.sign(attackDir.x)||face;attackAt=phase;spent=false;
  ping(style?165:225);
}
function dodge(){
  if(paused||phase-dodgeAt<.84||phase-attackAt<cut().end||phase-guardAt<.25||spirit<19)return;
  windAt=null;spirit-=19;dodgeAt=phase;dodgeFace=face;dashDir=Math.hypot(travelIntent.x,travelIntent.y)>.1?{...travelIntent}:{...heading};ping(170);
}
function modal(open){
  resetMouse();windAt=null;paused=open;keys.clear();$('.overlay').hidden=!open;
  setText('#modalTitle',won?'Все регионы зачищены':dead?'Клинок пал':starting?'Перед дорогой':'Пауза');
  setText('#resume',won?'Пройти снова':dead?'Вернуться на тракт':starting?'Начать игру':'Продолжить');setText('#pause',open?'▷':'Ⅱ');
}
function resume(){
  starting=false;
  if(won||dead){
    const fallen=won?[]:guards.map(d=>d.hp===0);
    cleanAt=-10;fromSheath=true;impactPause=0;heroMotion.recoil=null;
    bladeOut=false;bladeChanged=-10;

    opponent=null;travelIntent={x:0,y:0};resetScenery();spawnGuards();fallen.forEach((dead,i)=>{if(dead)guards[i].hp=0});
    pos=350;cam=Math.max(0,pos-350);
    depth=trackY;heading={x:1,y:0};depthVelocity=0;health=100;velocity=0;stride=0;gait=0;face=1;
    spirit=100;combo=0;guardAt=riposteUntil=attackAt=dodgeAt=hurtAt=lastPick=-10;feedbackUntil=0;spent=true;won=dead=false;
  }
  travelIntent={x:0,y:0};modal(false);ui();
}
let impactPause=0;
function bodyImpact(actor,x,z,strength){
  const length=Math.hypot(x,z)||1;
  x/=length;z/=length;
  actor.kickX+=x*strength;actor.kickZ+=z*strength;
  const recoil=actor.recoil??={x:0,z:0,vx:0,vz:0};
  recoil.vx+=x*strength*.037;recoil.vz+=z*strength*.037;
  impactPause=Math.max(impactPause,strength>160?.045:.027);
}
function settleRecoil(actor,dt){
  const r=actor.recoil;if(!r)return;
  // Damped angular spring: the chest lags the shove, then settles over the feet.
  for(const [angle,rate] of [['x','vx'],['z','vz']]){
    r[rate]-=(110*r[angle]+13*r[rate])*dt;
    r[angle]=Math.max(-.52,Math.min(.52,r[angle]+r[rate]*dt));
  }
  if(Math.hypot(r.x,r.z,r.vx,r.vz)<.007)actor.recoil=null;
}
function unbalance(d,x,z,strength,level,torque=0){
  const airborne=d.feet?.feet.some(f=>f.h>2);
  const leg=level<.44,high=level>.84;
  const debt=(d.balanceDebt||0)*Math.exp(-3*(phase-(d.balanceAt??phase)));
  d.balanceDebt=debt+strength*(leg?1.65:high?1.38:1)*(airborne?1.18:1);
  d.balanceAt=phase;
  if(d.hp&&d.fellAt!==undefined)return;
  const down=!d.hp||d.balanceDebt>210;
  const duration=down?1.12:leg?.48:.25;
  d.stunned=Math.max(d.stunned,phase+duration);d.wind=-10;d.chain=0;
  d.ready=Math.max(d.ready,d.stunned+.12);
  d.turnAt=phase;d.hitTwist=Math.max(-.65,Math.min(.65,torque));
  if(down){
    d.fellAt=phase;d.fallAngle=Math.atan2(z,x)+(leg?.37*torque:0);
    d.fallTime=leg?.32:high?.49:.42;d.balanceDebt=0;
  }
}
function update(dt){
  expireCombatFx();
  const bodies=startMotion(dt);
  if(phase-Math.max(attackAt,dodgeAt,guardAt)>.52)spirit=Math.min(100,spirit+dt*difficulty.breath);
  const move=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  const dash=phase-dodgeAt<.26,swing=phase-attackAt<cut().end;

  const vertical=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
  const norm=Math.hypot(move,vertical);
  const travel={x:(move*Math.cos(cameraYaw)+vertical*Math.sin(cameraYaw))/(norm||1),y:(vertical*Math.cos(cameraYaw)-move*Math.sin(cameraYaw))/(norm||1)};
  travelIntent=travel;
  const previousAim=attackDir;
  heading=combatFacing(norm&&!dash&&!swing?travel:heading);
  face=Math.sign(heading.x)||face;
  if(phase-attackAt<cut().duration)attackDir=heading;
  const direction=dash?dashDir:swing?attackDir:travel;
  const age=phase-attackAt;
  const push=swing?Math.max(0,Math.sin(Math.PI*Math.max(0,(age-cut().start)/(cut().end-cut().start)))):0;
  const speed=dash?920*(1-ease((phase-dodgeAt)/.26)):swing?push*cut().step*Math.PI/(2*(cut().end-cut().start)):windAt!==null?72:196;
  const facingDot=direction.x*heading.x+direction.y*heading.y;
  const travelSpeed=(opponent||mouseLook)&&!dash&&!swing?speed*(.84+.16*facingDot):speed;
  const vx=direction.x*travelSpeed,vz=direction.y*travelSpeed;
  const reversing=velocity*vx+depthVelocity*vz<0;
  const rate=!norm&&!swing?2300:reversing?2700:swing?1850:1560;
  const fraction=Math.min(1,rate*dt/(Math.hypot(vx-velocity,vz-depthVelocity)||1));
  velocity=dash?vx:velocity+(vx-velocity)*fraction;
  depthVelocity=dash?vz:depthVelocity+(vz-depthVelocity)*fraction;
  const drag=terrainSpeed(pos,roadZ(depth));
  const old=pos,oldY=depth;
  pos=Math.max(20,Math.min(W-20,pos+velocity*dt*drag));
  depth=depth+depthVelocity*dt*depthRatio*drag;

  if(pos===20&&velocity<0||pos===W-20&&velocity>0)velocity=0;
  sampleBladeTrace(age);
  const sweep=bladeSweep(phase-attackAt,dt,old,oldY,previousAim);
  strikePots(sweep);
  for(const d of guards){
    if(!d.hp||!activeGuard(d))continue;
    const traits=enemies[d.kind],dx=d.x-pos,dy=(d.y-depth)/depthRatio,dist=Math.hypot(dx,dy);
    const contact=!spent&&!struck.has(d)&&sweep.length?swordContact(sweep,d):null;
    if(contact){
      struck.add(d);if(combo===1)spent=true;
      const counter=phase<riposteUntil;
      const blocked=difficulty!==difficulties.easy&&d.type===2&&phase>d.exposed&&d.wind<0&&(-dx*d.dir)>0&&!counter;
      if(blocked){impactFx(null,contact,attackDir.x,attackDir.y);whisper('Щит · зайдите со спины или парируйте');ping(130)}
      else{
        const damage=(counter?3:cut().damage)*difficulty.outgoing;
        d.hp=Math.max(0,d.hp-damage);d.flash=phase;riposteUntil=-10;
        // Compare the same point along the blade in adjacent sweep samples.
        const i=contact.i,t=contact.t;
        const earlier=sweep[i>=2?i-2:i],later=sweep[i>=2?i:i+2];
        const sx=mix(later[0].x-earlier[0].x,later[1].x-earlier[1].x,t);
        const sz=mix(later[0].y-earlier[0].y,later[1].y-earlier[1].y,t);
        const travel=Math.hypot(sx,sz)||1;
        const pushX=attackDir.x*.74+.55*sx/travel,pushZ=attackDir.y*.74+.55*sz/travel;
        const force=(counter?320:combo===1?275:150)*bodySizes[d.type][1];
        impactFx(d,contact,pushX,pushZ);
        bodyImpact(d,pushX,pushZ,force);
        const torque=((contact.x-d.x)*pushZ-(contact.y-d.y/depthRatio)*pushX)/22;
        unbalance(d,pushX,pushZ,force,contact.level,torque);

        if(combo===1&&d.type!==3){d.wind=-10;d.ready=phase+.42;d.exposed=d.ready}
        ping(d.hp?185:95);
        if(!d.hp){
          health=Math.min(100,health+difficulty.heal);
          cleanAt=attackAt+cut().duration;
          if(guards.every(enemy=>!enemy.hp)){won=true;modal(true)}
          continue;
        }
      }
    }
    if(phase<d.stunned)continue;
    if(d.wind>=0){
      const windup=enemyWindup(d);
      if(d.type===0&&phase-d.wind>windup*.52){
        d.x+=d.aimX*dt*215/difficulty.windup;d.y=d.y+d.aimY*dt*215/difficulty.windup*depthRatio;
      }
      if(phase-d.wind>=windup){
        const inStrike=d.type===1?distanceTo(d.aimX,d.aimY)<47:dist<traits.range+20&&(-dx*d.aimX-dy*d.aimY)>-10;
        const canParry=d.type!==1&&phase-guardAt<.23&&(dx*heading.x+dy*heading.y)>-15;
        if(inStrike&&canParry){
          impactFx(null,{x:pos+heading.x*18,y:depth/depthRatio+heading.y*18,z:65},heading.x,heading.y);
          d.wind=-10;d.chain=0;d.exposed=phase+1.1;d.ready=d.exposed;spirit=Math.min(100,spirit+23);
          riposteUntil=phase+.88;whisper('Парирование · ответьте катаной');ping(780);continue;
        }
        if(inStrike&&!dash&&phase-hurtAt>.42){
          impactFx(heroMotion,{x:pos+dx/(dist||1)*9,y:depth/depthRatio+dy/(dist||1)*9,z:[38,66,73,79][d.type]},-dx,-dy);
          health=Math.max(0,health-Math.round(traits.damage*difficulty.incoming));bodyImpact(heroMotion,-dx,-dy,traits.damage*4+55);windAt=null;spent=true;hurtAt=phase;ping(88);
          if(!health){dead=true;modal(true);break}
        }
        d.wind=-10;d.exposed=phase+traits.rest*difficulty.rest;d.ready=d.exposed;
        if(d.type===3&&d.chain>0){
          d.chain--;d.wind=phase;d.aimX=-dx/(dist||1);d.aimY=-dy/(dist||1);
        }
      }
    }else if(dist<traits.range&&phase>=d.ready){
      d.dir=Math.sign(-dx)||d.dir;d.wind=phase;d.chain=d.type===3&&difficulty.chain?difficulty.chain+Number(d.hp<=6):0;
      d.aimX=d.type===1?pos:-dx/(dist||1);d.aimY=d.type===1?depth:-dy/(dist||1);
    }else if(phase-d.flash>.22){
      const chase=distanceTo(d.home,d.homeY)<350;
      let tx=chase?pos:d.home-50+Math.sin(phase*.8)*26,ty=chase?depth:d.homeY;
      if(chase&&dist<traits.range*.84)continue;
      const vx=tx-d.x,vy=(ty-d.y)/depthRatio,length=Math.hypot(vx,vy)||1;
      const step=Math.min(length,dt*terrainSpeed(d.x,roadZ(d.y))*(chase?traits.speed*difficulty.speed:32));
      d.dir=Math.sign(vx)||d.dir;d.x+=step*vx/length;d.y+=step*vy/length*depthRatio;
    }
  }
  resolveContacts(bodies,dt);
  const distance=Math.hypot(pos-old,(depth-oldY)/depthRatio);
  stride+=(Math.min(1,distance/(dt*180))-stride)*(1-Math.exp(-dt*14));
  if(!dash)gait+=distance*Math.PI/48;
  settleRecoil(heroMotion,dt);
  for(const d of guards){
    settleRecoil(d,dt);
    if(d.hp&&d.fellAt!==undefined&&phase-d.fellAt>=1.12){delete d.fellAt;d.feet=null}
  }
  ui();
}
function enemyWindup(d){
  const base=d.type===3?(d.hp<=6?.43:.58):enemies[d.kind].windup;
  return base*difficulty.windup;
}
