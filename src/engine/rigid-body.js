// Game distances are world units. Linear and angular velocities are per second.
export const gravity = 560;
export const physicsStep = 1 / 90;

const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scaled = (v,n) => v.map(x=>x*n);
const add = (a,b) => a.map((x,i)=>x+b[i]);

function rotated(q,v) {
  const t=scaled(cross(q,v),2);
  return add(add(v,scaled(t,q[3])),cross(q,t));
}

export function createRigidBody(points,center,velocity,spin) {
  const offsets=points.map(p=>p.map((v,k)=>v-center[k]));
  const supports=new Set();
  // Extreme points retain the shape of the piece without testing its render mesh each tick.
  for (const x of [-1,0,1]) for (const y of [-1,0,1]) for (const z of [-1,0,1]) {
    if (!(x||y||z)) continue;
    const direction=[x,y,z];
    let best=-Infinity, vertex;
    for (const p of offsets) {
      const projection=dot(p,direction);
      if (projection>best) { best=projection; vertex=p; }
    }
    supports.add(vertex);
  }
  const inertia=[0,0,0];
  for (const p of offsets) for (let k=0;k<3;k++) inertia[k]+=dot(p,p)-p[k]*p[k];
  return {center:[...center],velocity,spin,q:[0,0,0,1],supports:[...supports],
    inverseInertia:inertia.map(i=>1/Math.max(1,i/points.length)),quiet:0,sleeping:false};
}

export function rigidPoint(body,p,origin) {
  return add(body.center,rotated(body.q,p.map((v,k)=>v-origin[k])));
}

export function pointVelocity(body,point) {
  return add(body.velocity,cross(body.spin,point.map((v,k)=>v-body.center[k])));
}

function inverseInertia(body,v) {
  const q=body.q;
  const local=rotated([-q[0],-q[1],-q[2],q[3]],v);
  return rotated(q,local.map((x,k)=>x*body.inverseInertia[k]));
}

export function stepRigidBody(body,dt,heightAt,gripAt) {
  if (body.sleeping) return;
  body.velocity[1]-=gravity*dt;
  body.center=add(body.center,scaled(body.velocity,dt));
  const q=body.q,w=body.spin;
  const dq=[...add(scaled(w,q[3]),cross(w,q)),-dot(w,q)];
  const next=q.map((v,k)=>v+.5*dt*dq[k]);
  body.q=scaled(next,1/Math.hypot(...next));
  const contacts=[];
  let deepest=0;
  for (const vertex of body.supports) {
    const r=rotated(body.q,vertex), [x,y,z]=add(body.center,r);
    const penetration=heightAt(x,z)-y;
    if (penetration < -.05) continue;
    const n=[(heightAt(x-1,z)-heightAt(x+1,z))*.5,1,(heightAt(x,z-1)-heightAt(x,z+1))*.5];
    contacts.push({r,n:scaled(n,1/Math.hypot(...n)),penetration});
    deepest=Math.max(deepest,penetration);
  }
  body.center[1]+=deepest;
  contacts.sort((a,b)=>b.penetration-a.penetration);
  const friction=contacts.length?gripAt(body.center[0],body.center[2]):0;
  for (let pass=0;pass<3;pass++) for (const {r,n} of contacts) {
    function impulse(axis,speed) {
      const turn=inverseInertia(body,cross(r,axis));
      const magnitude=speed/(1+dot(axis,cross(turn,r)));
      body.velocity=add(body.velocity,scaled(axis,magnitude));
      body.spin=add(body.spin,scaled(turn,magnitude));
      return magnitude;
    }
    const velocity=add(body.velocity,cross(body.spin,r)), inward=-dot(velocity,n);
    if (inward<=0) continue;
    const force=impulse(n,inward*(inward>65 && pass===0?1.13:1));
    const after=add(body.velocity,cross(body.spin,r));
    const tangent=add(after,scaled(n,-dot(after,n))), slip=Math.hypot(...tangent);
    if (slip>.001) {
      const axis=scaled(tangent,-1/slip);
      const massFactor=1+dot(axis,cross(inverseInertia(body,cross(r,axis)),r));
      impulse(axis,Math.min(slip,friction*force*massFactor));
    }
  }
  if (contacts.length) body.spin=scaled(body.spin,Math.exp(-dt*1.8));
  body.quiet=contacts.length && Math.hypot(...body.velocity)<3 && Math.hypot(...body.spin)<.14 ? body.quiet+dt : 0;
  body.sleeping=body.quiet>.3;
}
