// Feet are stored on the ground in world coordinates. Only the swinging group
// gets a new landing point. Paired diagonals form the hound's trot.
const humanFeet=[[-4,-5.5,0],[4,5.5,1]],knightFeet=[[-10,-11,0],[10,11,1]];
const houndFeet=[[-23,-9,0],[16,-9,1],[-23,9,1],[16,9,0]];
function advanceFeet(b,dt){
  const actor=b.ref,hero=actor===heroMotion;
  if(!hero&&(actor.type===undefined||actor.type===1))return;
  if(hero&&phase-dodgeAt<.26){actor.feet=null;return}
  const pattern=hero?humanFeet:actor.type===0?houndFeet:knightFeet;
  const scale=actor.type===3?1.17:1;
  const dx=b.x-b.oldX,dz=b.z-b.oldZ,speed=Math.hypot(dx,dz)/dt;
  let angle=hero?Math.atan2(heading.y,heading.x):Math.atan2(roadZ(depth)-b.z,pos-b.x);
  if(!hero&&distanceTo(actor.home,actor.homeY)>350&&speed>4)angle=Math.atan2(dz,dx);
  if(hero&&phase-attackAt<cut().duration)angle=Math.atan2(attackDir.y,attackDir.x);
  let rig=actor.feet;
  if(rig){const delta=Math.atan2(Math.sin(angle-rig.angle),Math.cos(angle-rig.angle));
    angle=rig.angle+Math.max(-dt*10,Math.min(dt*10,delta));}
  const c=Math.cos(angle),s=Math.sin(angle);
  const braced=hero&&(windAt!==null||phase-attackAt<cut().duration);
  const homes=pattern.map(([f,z])=>{
    if(braced){f+=Math.sign(z)*9;z+=Math.sign(z)*2}
    return [b.x+scale*(f*c-z*s),b.z+scale*(f*s+z*c)];
  });
  if(!rig||Math.hypot(b.x-rig.x,b.z-rig.z)>80){
    rig=actor.feet={feet:homes.map(([x,z])=>({x,z,h:0})),group:0,time:1,duration:.15};
  }
  Object.assign(rig,{angle,x:b.x,z:b.z,scale});
  // A dash or contact correction can move the pelvis past a planted heel.
  // Recover the stance immediately after a displacement larger than one stride.
  if(hero&&Math.hypot(dx,dz)>19){
    rig.feet=homes.map(([x,z])=>({x,z,h:0}));rig.time=rig.duration;return;
  }
  if(rig.time>=rig.duration){
    let error=0;
    rig.feet.forEach((f,i)=>{error=Math.max(error,Math.hypot(f.x-homes[i][0],f.z-homes[i][1]))});
    if(error<4)return;
    if(hero){
      // Step with the foot furthest from its next support point, including pivots.
      const lead=Math.min(.09,12/Math.max(speed,1));
      const errors=rig.feet.map((f,i)=>Math.hypot(f.x-homes[i][0]-dx/dt*lead,f.z-homes[i][1]-dz/dt*lead));
      rig.group=errors[0]>errors[1]?0:1;
    }else rig.group=1-rig.group;
    rig.duration=Math.max(.075,Math.min(.21,25/(speed+55)));
    rig.time=0;
    rig.feet.forEach((f,i)=>{
      if(pattern[i][2]!==rig.group)return;
      const catchStep=!hero&&phase-(actor.balanceAt??-10)<.35?1.9:1;
      const predict=Math.min(rig.duration*(hero?1:1.3)*catchStep, (hero?18:30)*catchStep/Math.max(1,speed));
      Object.assign(f,{fromX:f.x,fromZ:f.z,toX:homes[i][0]+dx/dt*predict,toZ:homes[i][1]+dz/dt*predict});
    });
  }
  rig.time=Math.min(rig.duration,rig.time+dt);
  const t=rig.time/rig.duration,u=ease(t);
  rig.feet.forEach((f,i)=>{
    if(pattern[i][2]!==rig.group)return;
    f.x=mix(f.fromX,f.toX,u);f.z=mix(f.fromZ,f.toZ,u);
    f.h=t===1?0:Math.sin(t*Math.PI)*Math.min(10,Math.hypot(f.toX-f.fromX,f.toZ-f.fromZ)*.24);
  });
}
function localFoot(actor,i,pattern){
  const rig=actor.feet;if(!rig)return [pattern[i][0],0,pattern[i][1]];
  const f=rig.feet[i],x=f.x-rig.x,z=f.z-rig.z,c=Math.cos(rig.angle),s=Math.sin(rig.angle);
  let forward=(x*c+z*s)/rig.scale,lateral=(z*c-x*s)/rig.scale;
  if(actor===heroMotion){
    const hipZ=pattern[i][1],offset=lateral-hipZ;
    const reach=Math.min(1,19/(Math.hypot(forward,offset)||1));
    forward*=reach;lateral=hipZ+offset*reach;
  }
  return [forward,f.h/rig.scale,lateral];
}
