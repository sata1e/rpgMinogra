// Outside to inside: bark, sapwood and heartwood; shell, tissue and core.
export const woodSection = [21,39,40,39,41];
export const demonSection = [35,34,35,17];
export const spiritSection = [8,24,37,3];
export function isTimber(material) {
  return material===0 || material===1 || woodSection.includes(material);
}
// Faces use world coordinates [x, height, z] followed by their material and shading.
export function splitFaces(faces, distance, capMaterial, eligible = () => true, local = null) {
  const base = [], top = [], seams = [];
  let woodRings=0, rings=0;
  let woodBelow=false, woodAbove=false;
  for (const face of faces) {
    if (!eligible(face)) { base.push(face); continue; }
    const points = face.slice(0,3), d = points.map(p=>{
      const v=distance(p);
      return Math.abs(v)<1e-7 ? 0 : v;
    });
    if (capMaterial===woodSection && isTimber(face[3])) {
      woodBelow ||= d.some(v=>v<-.001);
      woodAbove ||= d.some(v=>v>.001);
    }
    if (d.filter(v=>v===0).length===2 && d.some(v=>v<0))
      seams.push([...points.filter((_,i)=>d[i]===0),face[3]]);
    if (d.every(v=>v<=0)) { base.push(face); continue; }
    if (d.every(v=>v>=0)) { top.push(face); continue; }
    const lower = [], upper = [], seam = [];
    for (let i=0;i<3;i++) {
      const j=(i+1)%3, p=points[i];
      if (d[i]<=0) lower.push(p);
      if (d[i]>=0) upper.push(p);
      if (d[i]===0) seam.push(p);
      if (d[i]*d[j]<0) {
        const t=d[i]/(d[i]-d[j]);
        const q=p.map((v,k)=>v+t*(points[j][k]-v));
        if (local) local.set(q,local.get(p).map((v,k)=>v+t*(local.get(points[j])[k]-v)));
        lower.push(q); upper.push(q); seam.push(q);
      }
    }
    for (const [poly,out] of [[lower,base],[upper,top]])
      for (let j=1;j+1<poly.length;j++) out.push([poly[0],poly[j],poly[j+1],...face.slice(3)]);
    if (seam.length===2) seams.push([...seam,face[3]]);
  }
  if (!base.length || !top.length || (capMaterial===woodSection && !(woodBelow && woodAbove)))
    return {base,top,woodRings,rings};
  // Close each ring independently, including when the same plane crosses both arms.
  const key = p=>p.map(v=>Math.round(v*1000)).join(',');
  const links = new Map();
  for (const edge of seams) for (const p of edge.slice(0,2)) {
    const k=key(p);
    if (!links.has(k)) links.set(k,[]);
    links.get(k).push(edge);
  }
  const used = new Set();
  for (const first of seams) {
    if (used.has(first)) continue;
    used.add(first);
    const ring=[first[0]], start=key(first[0]);
    let p=first[1];
    while (key(p)!==start) {
      ring.push(p);
      const edge=links.get(key(p)).find(e=>!used.has(e));
      if (!edge) break;
      used.add(edge);
      p=key(edge[0])===key(p)?edge[1]:edge[0];
    }
    if (key(p)!==start || ring.length<3) continue;
    const layers=capMaterial===woodSection && !isTimber(first[2]) ? [first[2]] :
      Array.isArray(capMaterial) ? capMaterial : [capMaterial];
    // Discard collinear intersections from previous triangulations before making new rings.
    const corners=ring.filter((p,i)=>{
      const a=ring[(i+ring.length-1)%ring.length], b=ring[(i+1)%ring.length];
      const u=p.map((x,k)=>x-a[k]), v=b.map((x,k)=>x-p[k]);
      return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-6;
    });
    if (corners.length<3) continue;
    rings++;
    if (layers===woodSection) woodRings++;
    const center=[0,1,2].map(k=>corners.reduce((s,v)=>s+v[k],0)/corners.length);
    if (local) local.set(center,[0,1,2].map(k=>corners.reduce((sum,v)=>sum+local.get(v)[k],0)/corners.length));
    const add=(a,b,c,m)=>{
      base.push([a,b,c,m,5,true]);
      top.push([c,b,a,m,5,true]);
    };
    let outer=corners;
    layers.forEach((material,j)=>{
      const radius=(layers.length-1-j)/layers.length;
      const inner=corners.map(p=>p.map((v,k)=>center[k]+(v-center[k])*radius));
      if (local) inner.forEach((v,i)=>local.set(v,local.get(center).map((c,k)=>c+(local.get(corners[i])[k]-c)*radius)));
      outer.forEach((a,i)=>{
        const k=(i+1)%outer.length;
        add(a,outer[k],radius?inner[k]:center,material);
        if (radius) add(a,inner[k],inner[i],material);
      });
      outer=inner;
    });
  }
  return {base,top,woodRings,rings};
}

export function swingNormal(segment, neighbor, heading, t=1) {
  const [a,b]=segment;
  const edge=b.map((v,i)=>v-a[i]);
  // The local swept surface is spanned by the edge and its motion between samples.
  const motions=[];
  if (neighbor) motions.push(a.map((v,k)=>(1-t)*(v-neighbor[0][k])+t*(b[k]-neighbor[1][k])),b.map((v,i)=>v-neighbor[1][i]),a.map((v,i)=>v-neighbor[0][i]));
  motions.push([-heading.y,0,heading.x],[0,1,0],[1,0,0]);
  for (const [x,y,z] of motions) {
    const n=[edge[1]*z-edge[2]*y,edge[2]*x-edge[0]*z,edge[0]*y-edge[1]*x];
    const len=Math.hypot(...n);
    if (len>1e-6) return n.map(v=>v/len);
  }
  return [0,1,0];
}

// Intersection of the blade segment and a plant triangle, in segment order.
export function bladeIntersection(a,b,face) {
  const [p,q,r]=face;
  const sub=(u,v)=>u.map((n,i)=>n-v[i]);
  const dot=(u,v)=>u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
  const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const dir=sub(b,a), ab=sub(q,p), ac=sub(r,p), h=cross(dir,ac);
  const det=dot(ab,h);
  if (Math.abs(det)<1e-7) return null;
  const s=sub(a,p), u=dot(s,h)/det;
  if (u<0 || u>1) return null;
  const k=cross(s,ab), v=dot(dir,k)/det;
  if (v<0 || u+v>1) return null;
  const t=dot(ac,k)/det;
  return t<0 || t>1 ? null : a.map((n,i)=>n+t*dir[i]);
}
