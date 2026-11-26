const villagers=[
  {name:'Лёня · студент',x:407,z:-28,model:drawLenya,
    lines:()=>waffles?['Лёня: Узнаю сколы на крышке. И резинка моя! Так кто их всё-таки взял?',
      'Ронин: Демон Амир. Гончая носила ему добычу в восточный храм. Держи, я даже крышку не открывал.',
      'Лёня: Открывай теперь. Вон та, угловая, твоя. А потом пойдём в зал? У меня сегодня жим, подстрахуешь.']:
      ['Лёня: Только с пар пришёл. Кинул в сумку кеды, полотенце… Полез за любимыми вафельками — карман пустой.',
       'Ронин: Может, в аудитории оставил?',
       'Лёня: Я тоже так подумал. А потом смотрю — по тракту гончая шпарит, и моя коробка у неё в зубах! Даже синяя резинка болтается.',
       'Лёня: Вот тебе и перекус перед залом. Поможешь вернуть? Арсений у северной развилки стоял, может, видел, куда она свернула.']},
  {name:'Арсений · одногруппник',x:2540,z:-890,model:drawArseniy,
    lines:()=>['Арсений: Если ищешь чёрную псину — она чуть меня с ног не сшибла. До сих пор конспект по листку собираю.',
      'Ронин: Она пробежала мимо обители?',
      'Арсений: До поворота, а потом вниз, к восточным воротам. Там железо о камень звякнуло. Тоня у ворот рисует — спроси у неё, с какой стороны донеслось.']},
  {name:'Тоня · художница',x:5220,z:56,model:drawTonya,
    lines:()=>['Тоня: Видишь размазанную сосну на рисунке? Это я вздрогнула, когда у ворот жестянка грохнулась.',
      'Ронин: Куда побежала гончая?',
      'Тоня: В бамбук. Из-за деревьев кто-то свистнул два раза. Она сразу подобрала коробку и помчалась на звук.',
      'Тоня: Дальше я её не видела. За рощей есть двор храма. Если бы я звала собаку так, чтобы с дороги меня не заметили, я бы встала там.']}
];
const metVillagers=new Set();
let conversation=null;
function nearVillager(){
  return villagers.find(n=>Math.hypot(pos-n.x,roadZ(depth)-n.z)<78);
}
function beginTalk(n){
  conversation={npc:n,lines:n.lines(),at:0};
  paused=true;windAt=null;keys.clear();travelIntent={x:0,y:0};
  $('#talk').hidden=false;showLine();$('#nextLine').focus();
}
function showLine(){
  const {npc,lines,at}=conversation;
  const [speaker,...words]=lines[at].split(': ');
  setText('#speaker',speaker==='Ронин'?speaker:npc.name);
  setText('#line',words.join(': '));setText('#nextLine',at===lines.length-1?'Завершить':'Далее');
}
function advanceTalk(){
  if(!conversation)return;
  if(++conversation.at>=conversation.lines.length){const returned=conversation.npc===villagers[0]&&waffles;metVillagers.add(conversation.npc);endTalk();if(returned){won=true;ui();modal(true)}}
  else showLine();
}
function endTalk(){
  conversation=null;$('#talk').hidden=true;paused=false;keys.clear();ui();
}
function drawLenya(bob){
  // Local axes are forward, up, and sideways. Head and shoulders share the breath.
  const chest=74+bob,chin=81+bob,blink=phase%4.3<.13;
  for(const side of [-1,1]){
    const z=side*6,step=side*2;
    sculpt([[0,45,z,7,6.2],[2,32,z*1.1,6.5,6],[step+2,23,z*1.18,5.8,5.4],
      [step,11,z*1.25,3.8,3.6],[step,7,z*1.25,3.2,3.1]],15,10);
    ovalMesh(step+2.1,3.6,z*1.25,7.2,3.2,3.8,21);
    hull([[step,5,z*1.25,4.4,4],[step,10,z*1.25,4,3.8]],21,10,true);
  }
  hull([[0,43,0,8,11],[0,52,0,7.8,10],[1,64+bob,0,9,13.2],
    [1,chest-3,0,9.2,15.2],[1,chest+1,0,7.6,13.8],[2,chest+4,0,4.6,7]],19,16,true);
  hull([[2,chest+1,0,4.8,5],[3,chin+3,0,4,4.2]],16,12,true);
  for(const side of [-1,1]){
    const gesture=side>0?1:0,hand=[8+gesture*5,47+bob+gesture*5,side*(15-gesture*6)];
    sculpt([[1,chest-2,side*12,5.7],[1,chest-6,side*15.5,6],[2,chest-11,side*16,5.2]],19,12);
    sculpt([[2,chest-9.5,side*16,5.55],[2,chest-12,side*16,5.3]],29,12);
    sculpt([[2,chest-12,side*16,4.7],[2,chest-16,side*17,4.8],
      [3,55+bob,side*17,3.55],[6,53+bob,side*16,3.85],[...hand,2.5]],16,12);
    ovalMesh(...hand,3,3.6,2.5,16);
  }
  // A gym bag hangs from the far shoulder and rests against the opposite hip.
  rod([3,chest+2,-9],[10,64,0],1.7,0,true);
  rod([10,64,0],[7,49,12],1.7,0,true);
  ovalMesh(0,43,14,10,6,5.5,14);
  rod([6,46,18],[-5,46,18],.8,29,true);
  hull([[5,chin,0,3.4,3.5],[4.3,chin+2.4,0,5.1,5],[3.4,chin+7,0,6.6,6.1],
    [2.7,chin+12,0,6.7,6.3],[2,chin+15,0,5.5,5.2]],16,16,true);
  sculpt([[9.1,chin+9.8,0,1],[10.8,chin+6.4,0,1.2]],16,8);
  rod([9.1,chin+3.5,-1.4],[9.3,chin+3.65,1.5],.4,26,true);
  for(const side of [-1,1]){
    ovalMesh(2.2,chin+7,side*6.2,1.5,2.3,.95,26);
    rod([9.4,chin+10.8,side*1.7],[8,chin+11.3,side*4.6],.66,12,true);
    ovalMesh(9.1,chin+9.3,side*2.9,.76,blink?.25:.72,1.05,33);
  }
  ovalMesh(2,chin+13.7,0,7.2,5.3,7.1,32);
  // Sweep uneven locks from the crown towards one temple, breaking the outline.
  for(let j=0;j<14;j++){
    const a=j*Math.PI/7,dx=Math.cos(a),dz=Math.sin(a),lift=Math.sin(3*a+.6)*1.25;
    sculpt([[2+dx*3,chin+17+lift,dz*3,2.7],
      [2+dx*5.8,chin+16+lift,dz*5.5+1.1,3.1],
      [2+dx*7.3,chin+12.5+lift,dz*6.6+1.7,2.1],
      [3+dx*7.6,chin+10+lift+dx,dz*6.9+2,.18]],j%5===0?17:32,6);
  }
  sculpt([[0,chin+16,-1,2.8],[1,chin+19,1,2.8],[4,chin+20.6,2,.25]],32,7);
}
function drawArseniy(bob){
  for(const k of [-1,1]){
    sculpt([[0,46,k*6,7],[2,25,k*6.5,5.4],[0,6,k*7,3.9]],15,10);
    ovalMesh(2,3,k*7,6.8,3,4,29);
  }
  hull([[0,42,0,9,11],[0,51,0,9.6,12],[1,71+bob,0,9,14],
    [1,76+bob,0,5.8,10]],14,14,true);
  ovalMesh(-4,72+bob,0,6,5,10,15);
  for(const k of [-1,1]){
    const wrist=k>0?[12,54+bob,8]:[6,47+bob,-15];
    sculpt([[1,70+bob,k*12,5.5],[2,57,k*16,4.8],[...wrist,3.3]],14,10);
    ovalMesh(...wrist,3,3,2.8,16);
  }
  panel([[12,62,3],[13,60,14],[14,47,14],[13,49,3]],17,true);
  rod([12,62,3],[13,49,3],.85,4,true);
  ovalMesh(3,84+bob,0,6.7,8.6,6.3,16);
  for(const k of [-1,1])ovalMesh(8.7,85+bob,k*3,.8,.85,1,0);
  ovalMesh(1,91+bob,0,8.3,6.6,8,33);
  for(let i=0;i<16;i++){
    const a=i*2.4,h=Math.sin(i*1.7)*1.8;
    ovalMesh(1+6.5*Math.cos(a),91+bob+h,6.6*Math.sin(a),3.7,4.6,3.9,i%3?33:0);
  }
}
function drawTonya(bob){
  for(const k of [-1,1]){
    sculpt([[0,38,6*k,5.5],[1,18,6*k,4],[0,6,7*k,3.5]],8,10);
    ovalMesh(2,3,7*k,6.2,3,4,21);
  }
  hull([[0,27,0,12,15],[0,42,0,10,13],[0,52,0,8.5,10],
    [0,66+bob,0,9,12],[1,70+bob,0,6,8]],6,14,true);
  hull([[0,47,0,9.8,11.5],[0,50,0,9,11]],12,14,true);
  ovalMesh(2,78+bob,0,8.2,9,8.4,9);
  for(const k of [-1,1]){
    sculpt([[0,83+bob,k*6,3.1],[1,88+bob,k*8.5,3.6],[3,90+bob,k*11,1]],9,8);
    ovalMesh(8.9,80+bob,k*3.7,1,1.2,1,0);
    sculpt([[0,65+bob,k*10,4.6],[4,53,k*13,4],[12,54+bob,k*7,3]],6,10);
    ovalMesh(12,54+bob,k*7,2.7,2.8,2.6,9);
  }
  ovalMesh(9.2,76+bob,0,3.8,3.1,4.7,18);
  for(const k of [-1,1])ovalMesh(12.4,76.6+bob,k*1.75,.55,.8,.65,33);
  ovalMesh(-1,86+bob,0,7.8,3.4,8.4,4);
  panel([[13,60,-9],[14,59,5],[15,49,5],[14,50,-9]],17,true);
  for(let i=0;i<3;i++)rod([14,53+i*1.2,-7+i],[14.5,55+i*1.2,-2+i],.4,1,true);
  rod([12,52+bob,8],[16,63+bob,6],.65,12,true);
}
function drawVillagers(){
  for(const n of villagers){
    if(Math.hypot(n.x-pos,n.z-roadZ(depth))>1250)continue;
    const angle=Math.atan2(roadZ(depth)-n.z,pos-n.x);
    shadows(n.x,n.z,19,12);place(n.x,n.z,angle);
    n.model(Math.sin(phase*2+n.x)*.45);
  }
}
for(const n of villagers)addPost(n.x,n.z,13);
