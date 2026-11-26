'use strict';
const canvas=document.querySelector('#world'),ctx=canvas.getContext('2d',{alpha:false}),W=14800;
let cameraYaw=-.48,cameraPitch=.19,cameraRange=276;
let mouseCharge=false,mouseLook=false,hadLock=false;
function startMouseLook(){
  if(!window.matchMedia('(pointer:fine)').matches)return;
  mouseLook=true;
  // Embedded previews can deny pointer lock. Hover-look still works there.
  try{canvas.requestPointerLock?.()?.catch(()=>{})}catch{}
}
function resetMouse(){
  mouseCharge=false;
  if(document.pointerLockElement===canvas)document.exitPointerLock();
}
function resumeGame(){
  resume();startMouseLook();
}
function bindControls(){
const selector=$('#difficulty');
selector.onchange=()=>chooseDifficulty(selector.value);
chooseDifficulty(selector.value);
$('#sheathe').onclick=toggleBlade;$('#pause').onclick=()=>paused?resumeGame():modal(true);$('#resume').onclick=resumeGame;$('#pick').onclick=interact;$('#parry').onclick=parry;$('#dodge').onclick=dodge;$('#sound').onclick=()=>{audio??=new AudioContext();audio.resume();sound=!sound;$('#sound').textContent=sound?'♪':'♫';$('#sound').setAttribute('aria-pressed',sound);$('#sound').setAttribute('aria-label',sound?'Выключить звук':'Включить звук');ping(410)};
canvas.oncontextmenu=e=>e.preventDefault();
canvas.onauxclick=e=>e.preventDefault();
canvas.onmousedown=e=>{
  if(paused||e.button!==0||windAt!==null)return;
  e.preventDefault();drawSword();mouseCharge=windAt!==null;
};
window.addEventListener('mouseup',e=>{
  if(e.button===0&&mouseCharge){mouseCharge=false;if(!paused)attack()}
});
function orbit(dx,dy){
  cameraYaw-=dx*.0045;cameraPitch=Math.max(.14,Math.min(.70,cameraPitch+dy*.003));
}
window.addEventListener('mousemove',e=>{
  if(paused||(!mouseLook&&e.target!==canvas))return;
  if(document.pointerLockElement!==canvas&&e.target!==canvas)return;
  mouseLook=true;orbit(e.movementX,e.movementY);
});
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===canvas;
  if(hadLock&&!locked&&!paused)modal(true);
  hadLock=locked;
});
// Suppress touch-generated mouse commands while keeping touch camera orbit.
let touchDrag=null;
canvas.onpointerdown=e=>{
  if(e.pointerType==='mouse'||paused||touchDrag!==null)return;
  e.preventDefault();mouseLook=false;touchDrag=e.pointerId;canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove=e=>{if(e.pointerId===touchDrag&&!paused)orbit(e.movementX,e.movementY)};
canvas.onlostpointercapture=()=>touchDrag=null;

const swordKey=$('#attack');
swordKey.onpointerdown=e=>{e.preventDefault();swordKey.setPointerCapture(e.pointerId);drawSword()};
swordKey.onpointerup=e=>{e.preventDefault();attack()};
swordKey.onlostpointercapture=()=>{windAt=null};
swordKey.onclick=e=>{if(e.detail===0){drawSword();attack()}};
onkeydown=e=>{
  if(paused&&e.target===selector&&e.code!=='Escape')return;
  if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','KeyV','KeyW','KeyS','Escape','KeyA','KeyD','KeyE','KeyF','ShiftLeft','ShiftRight'].includes(e.code))return;
  e.preventDefault();
  if(e.code==='Escape'&&!e.repeat){paused?resumeGame():modal(true);return}
  if(paused)return;
  if(e.code==='KeyE'&&!e.repeat)interact();
  else if(e.code==='KeyV'&&!e.repeat)toggleBlade();
  else if(e.code==='KeyF'&&!e.repeat)parry();
  else if(e.code.startsWith('Shift')&&!e.repeat)dodge();
  else keys.add(e.code);
};onkeyup=e=>keys.delete(e.code);onblur=()=>{if(!paused)modal(true)};
document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);keys.add(b.dataset.key)};b.onlostpointercapture=()=>keys.delete(b.dataset.key)});
}

function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(!paused){
    const steps=Math.max(1,Math.ceil(dt*90));
    for(let i=0;i<steps&&!paused;i++){
      const frozen=Math.min(impactPause,dt/steps);
      impactPause-=frozen;
      const tick=dt/steps-frozen;
      if(tick>0){phase+=tick;update(tick)}
    }
  }
  renderWorld();drawMap();requestAnimationFrame(frame);
}

