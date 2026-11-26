const enemyLabels=[];
function makeEnemyLabels(){
  for(const guard of guards){
    const label=document.createElement('div');
    label.className='enemy-label';label.hidden=true;label.setAttribute('aria-hidden','true');
    label.append(document.createElement('span'),document.createElement('progress'));
    document.querySelector('#scene').insertBefore(label,document.querySelector('.life'));
    enemyLabels.push(label);
  }
}
spawnGuards();makeEnemyLabels();bindControls();ui();modal(true);requestAnimationFrame(frame);

