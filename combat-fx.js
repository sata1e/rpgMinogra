const hitParticles=[],bladeTrace=[];
const freshBlood=34,dryBlood=35;

function expireCombatFx(){
  for(let i=hitParticles.length-1;i>=0;i--)if(phase-hitParticles[i].at>hitParticles[i].life)hitParticles.splice(i,1);
  while(bladeTrace.length&&phase-bladeTrace[0].at>.068)bladeTrace.shift();
}
function sampleBladeTrace(age){
  if(age<cut().start||age>cut().end)return;
  const w=weaponGeometry(katanaPose(age),attackDir,pos,depth);
  const tip=[w.tip.x,w.tip.z,w.tip.y-trackY/depthRatio];
  const inner=[w.middle.x,w.middle.z,w.middle.y-trackY/depthRatio];
  bladeTrace.push({tip,inner:blend3(tip,inner,.55),at:phase});
}
function impactFx(actor,hit,dx,dz){
  const x=hit.x,y=hit.z,z=hit.y-trackY/depthRatio;
  const length=Math.hypot(dx,dz)||1;
  const direction=Math.atan2(dz/length,dx/length);
  if(actor){
    const wounds=actor.wounds??=[];
    if(wounds.length>=6)wounds.shift();
    wounds.push({at:phase,point:[x,y,z],anchor:null});
  }
  for(let i=0;i<(actor?11:7);i++){
    const angle=direction+(Math.random()-.5)*2.8;
    const speed=32+Math.random()*92,vy=26+Math.random()*68;
    const spark=!actor||i===0;
    const land=(vy+Math.sqrt(vy*vy+600*Math.max(0,y-1)))/300;
    hitParticles.push({at:phase,x,y,z,vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,vy,
      land,spark,size:1.1+Math.random()*1.2,life:spark?.13+Math.random()*.09:land+3+Math.random()*3});
  }
  if(hitParticles.length>180)hitParticles.splice(0,hitParticles.length-180);
}
function drawCombatFx(){
  place(0,0);
  for(let i=1;i<bladeTrace.length;i++){
    const a=bladeTrace[i-1],b=bladeTrace[i],m=phase-b.at<.025?7:14;
    panel([a.tip,b.tip,b.inner,a.inner],m,true,m===7?1:0);
  }
  for(const p of hitParticles){
    const age=phase-p.at,t=Math.min(age,p.land),x=p.x+p.vx*t,z=p.z+p.vz*t;
    if(age>=p.land&&!p.spark){
      const r=p.size*1.6;
      panel([[x-r,1,z],[x,1,z-r*.6],[x+r*1.4,1,z+.2],[x+.3,1,z+r*.8]],dryBlood,true);
    }else{
      const y=Math.max(1,p.y+p.vy*t-150*t*t);
      rod([x,y,z],[x-p.vx*.026,y-(p.vy-300*t)*.026,z-p.vz*.026],p.size,p.spark?5:freshBlood,true,p.spark?4:1);
    }
  }
}
// Keep the mark on an animated triangle, including when the body tips over.
function drawWounds(actor,start){
  if(!actor.wounds?.length)return;
  const end=faces.length;
  for(const w of actor.wounds){
    if(w.anchor===null){
      let best=Infinity;
      for(let i=start;i<end;i++){
        const [a,b,c]=faces[i];
        const d=w.point.reduce((sum,v,k)=>sum+(v-(a[k]+b[k]+c[k])/3)**2,0);
        if(d<best){best=d;w.anchor=i-start}
      }
    }
    if(w.anchor===null||start+w.anchor>=end)continue;
    const [a,b,c]=faces[start+w.anchor];
    const center=a.map((v,k)=>(v+b[k]+c[k])/3);
    const along=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);
    const n=[along[1]*ac[2]-along[2]*ac[1],along[2]*ac[0]-along[0]*ac[2],along[0]*ac[1]-along[1]*ac[0]];
    const normalLength=Math.hypot(...n),edgeLength=Math.hypot(...along);
    if(normalLength<.001||edgeLength<.001)continue;
    for(let k=0;k<3;k++){n[k]/=normalLength;along[k]/=edgeLength}
    const cross=[n[1]*along[2]-n[2]*along[1],n[2]*along[0]-n[0]*along[2],n[0]*along[1]-n[1]*along[0]];
    const side=n.reduce((sum,v,k)=>sum+v*(eye[k]-center[k]),0)>0?1:-1;
    const point=(u,v)=>center.map((s,k)=>s+u*along[k]+v*cross[k]+n[k]*side*.55);
    triangle(point(-3.4,-.7),point(3.8,.6),point(.4,1.8),phase-w.at<1.5?freshBlood:dryBlood,true,1);
  }
}
