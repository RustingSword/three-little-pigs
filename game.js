import * as THREE from 'three';
import { GLTFLoader } from './lib/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from './lib/addons/utils/SkeletonUtils.js';

const $=s=>document.querySelector(s);
const IS_MOBILE=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)||Math.min(innerWidth,innerHeight)<700;
const SHADOW=IS_MOBILE?1024:2048;

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,IS_MOBILE?1.75:2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
document.body.prepend(renderer.domElement);

const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x9ed4f0,0.018);

const camera=new THREE.PerspectiveCamera(45,1,0.1,200);

// —— sky gradient ——
const skyGeo=new THREE.SphereGeometry(90,32,16);
const skyMat=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,
  uniforms:{top:{value:new THREE.Color(0x4fa8e8)},mid:{value:new THREE.Color(0xa8d8f5)},bot:{value:new THREE.Color(0xe8f6c8)}},
  vertexShader:`varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec3 top,mid,bot;varying vec3 vP;void main(){float h=clamp(vP.y*.5+.5,0.,1.);vec3 c=mix(bot,mid,smoothstep(0.,.45,h));c=mix(c,top,smoothstep(.4,1.,h));gl_FragColor=vec4(c,1.);}`
});
scene.add(new THREE.Mesh(skyGeo,skyMat));

scene.add(new THREE.HemisphereLight(0xe8f4ff,0x7cb342,1.15));
const sun=new THREE.DirectionalLight(0xfff1d6,2.4);
sun.position.set(10,18,8);
sun.castShadow=true;
sun.shadow.mapSize.set(SHADOW,SHADOW);
sun.shadow.bias=-0.00025;
sun.shadow.normalBias=0.04;
Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:50});
scene.add(sun);
scene.add(new THREE.AmbientLight(0xfff8e7,0.28));

const M=(c,extra={})=>new THREE.MeshStandardMaterial({color:c,roughness:.82,metalness:0,...extra});
function mesh(g,c,p=[0,0,0],par){
  const m=new THREE.Mesh(g,typeof c==='number'?M(c):c);
  m.position.set(...p);m.castShadow=m.receiveShadow=true;
  if(par)par.add(m);return m;
}
function hash2(x,z){return Math.sin(x*127.1+z*311.7)*43758.5453%1;}
function noise2(x,z){
  const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
  const a=hash2(xi,zi),b=hash2(xi+1,zi),c=hash2(xi,zi+1),d=hash2(xi+1,zi+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}

// —— terrain ——
// CircleGeometry is XY; height written to Z; mesh Rx=-90° → world Y = height, world Z = -circleY
function groundH(x,z){
  const cx=x, cy=-z, r=Math.hypot(cx,cy);
  return (noise2(cx*.35,cy*.35)*.35+noise2(cx*.9,cy*.9)*.12)*(r<16?1:.3);
}
const groundGeo=new THREE.CircleGeometry(20,96);
{const pos=groundGeo.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getY(i);
  pos.setZ(i,groundH(x,-z));
 }
 groundGeo.computeVertexNormals();
}
const ground=new THREE.Mesh(groundGeo,M(0x7ec85a,{roughness:.95}));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.castShadow=false;scene.add(ground);
const dirt=mesh(new THREE.CylinderGeometry(20.5,19,2.2,48),0xc4a06a,[0,-1.4,0],scene);dirt.receiveShadow=true;

// winding dirt path
const pathMat=M(0xd2b48c,{roughness:.95});
for(let i=0;i<18;i++){
  const t=i/17,a=-.35+t*1.1,r=1.2+t*6.5;
  const x=Math.sin(a)*r,z=Math.cos(a)*r-1;
  const p=mesh(new THREE.CylinderGeometry(.55+t*.15,.5,.06,10),pathMat,[x,.03,z],scene);
  p.castShadow=false;p.rotation.y=a;
}

// grass tufts
const blade=new THREE.ConeGeometry(0.05,0.35,4);
blade.translate(0,0.175,0);
const grassMat=M(0x66bb6a);
const GRASS_N=IS_MOBILE?220:480;
const grass=new THREE.InstancedMesh(blade,grassMat,GRASS_N);
const dummy=new THREE.Object3D();
for(let i=0;i<GRASS_N;i++){
  const a=Math.random()*Math.PI*2,r=2+Math.random()*14;
  if(r<3.2&&Math.abs(Math.sin(a))<.4) continue;
  dummy.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
  dummy.rotation.y=Math.random()*Math.PI;
  dummy.rotation.z=(Math.random()-.5)*.25;
  dummy.scale.setScalar(.7+Math.random()*.9);
  dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
}
grass.castShadow=false;grass.receiveShadow=true;scene.add(grass);

// procedural flowers (lightweight)
const flowerColors=[0xff8a80,0xfff176,0xffffff,0xce93d8,0xffab91];
for(let i=0;i<36;i++){
  const a=Math.random()*6.28,r=3.5+Math.random()*10;
  const g=new THREE.Group();g.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
  mesh(new THREE.CylinderGeometry(.02,.03,.22,5),0x81c784,[0,.11,0],g);
  const bud=mesh(new THREE.SphereGeometry(.09,8,6),flowerColors[i%5],[0,.26,0],g);
  bud.scale.set(1,.7,1);scene.add(g);
}

const clouds=[];
for(let i=0;i<6;i++){
  const c=new THREE.Group();
  for(let j=0;j<4;j++){
    const s=mesh(new THREE.SphereGeometry(.9+Math.random()*.7,10,8),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,transparent:true,opacity:.92}),
      [j*1.1-1.2,Math.random()*.4,(Math.random()-.5)*.8],c);
    s.castShadow=false;
  }
  c.position.set(-22+i*9,12+Math.random()*3,-16-Math.random()*8);scene.add(c);clouds.push(c);
}
mesh(new THREE.SphereGeometry(2.2,20,14),new THREE.MeshBasicMaterial({color:0xffe082}),[16,17,-28],scene);

// —— storybook procedural characters (glTF skins use Armature×100 and collapse to hairlines) ——
function eye(par,x,y,z){
  const w=mesh(new THREE.SphereGeometry(.1,12,10),0xffffff,[x,y,z],par);
  mesh(new THREE.SphereGeometry(.05,10,8),0x3e2723,[x+.01,y,z+.045],par);
  mesh(new THREE.SphereGeometry(.022,6,4),0xffffff,[x+.035,y+.03,z+.08],par);
  return w;
}
function procPig(shirt,{overalls=true}={}){
  const g=new THREE.Group(),pink=0xf8bbd0,blush=0xff8a80;
  // soft body + overalls
  const body=mesh(new THREE.SphereGeometry(.7,32,24),pink,[0,.95,0],g);body.scale.set(1.08,1.12,1);g.userData.body=body;
  if(overalls){
    const bib=mesh(new THREE.SphereGeometry(.72,28,20),shirt,[0,.88,0],g);bib.scale.set(1.05,.85,.98);
    mesh(new THREE.BoxGeometry(.55,.22,.12),shirt,[0,1.35,.55],g); // bib flap
    mesh(new THREE.SphereGeometry(.05,8,6),0xfff59d,[-.12,1.35,.62],g);
    mesh(new THREE.SphereGeometry(.05,8,6),0xfff59d,[.12,1.35,.62],g);
  }else{
    body.material=M(shirt);
  }
  const head=mesh(new THREE.SphereGeometry(.62,32,24),pink,[0,1.85,0],g);g.userData.head=head;
  const snout=mesh(new THREE.CylinderGeometry(.22,.28,.28,18),0xf48fb1,[0,1.72,.58],g);snout.rotation.x=Math.PI/2;
  mesh(new THREE.SphereGeometry(.045,8,6),0x6d4c41,[-.08,1.72,.74],g);
  mesh(new THREE.SphereGeometry(.045,8,6),0x6d4c41,[.08,1.72,.74],g);
  for(const s of[-1,1]){
    eye(g,s*.24,2.0,.48);
    const ear=mesh(new THREE.SphereGeometry(.18,12,10),pink,[s*.42,2.32,.02],g);ear.scale.set(1,.75,.45);
    mesh(new THREE.SphereGeometry(.1,10,8),0xffc0cb,[s*.42,2.32,.06],g).scale.set(.7,.55,.3);
    mesh(new THREE.SphereGeometry(.11,10,8),blush,[s*.4,1.7,.42],g);
    // stubby legs + feet
    mesh(new THREE.CylinderGeometry(.13,.16,.48,12),pink,[s*.32,.28,.12],g);
    mesh(new THREE.SphereGeometry(.17,12,8),pink,[s*.32,.05,.2],g).scale.set(1.15,.45,1.3);
  }
  // curly tail
  const tail=mesh(new THREE.TorusGeometry(.14,.04,8,14,Math.PI*1.6),pink,[0,1.05,-.72],g);
  tail.rotation.y=Math.PI/2;tail.rotation.z=.4;
  g.userData={...g.userData,kind:'pig',hop:0,mixer:null,actions:{}};return g;
}
function procWolf(){
  const g=new THREE.Group(),fur=0x78909c,belly=0xeceff1,muzzle=0xb0bec5;
  const body=mesh(new THREE.SphereGeometry(.82,28,22),fur,[0,1.15,0],g);body.scale.set(1.15,1.25,1.05);g.userData.body=body;
  mesh(new THREE.SphereGeometry(.48,18,14),belly,[0,1.0,.5],g).scale.set(1.1,1.15,.9);
  const head=mesh(new THREE.SphereGeometry(.64,26,20),fur,[0,2.25,0],g);g.userData.head=head;
  const sn=mesh(new THREE.CylinderGeometry(.16,.3,.55,14),muzzle,[0,2.08,.7],g);sn.rotation.x=Math.PI/2;
  mesh(new THREE.SphereGeometry(.1,10,8),0x37474f,[0,2.02,1.02],g);
  // brow ridge
  mesh(new THREE.BoxGeometry(.55,.08,.2),0x607d8b,[0,2.48,.35],g);
  const cheeks=[];
  for(const s of[-1,1]){
    const ear=mesh(new THREE.ConeGeometry(.16,.48,8),fur,[s*.36,2.78,.05],g);ear.rotation.z=s*-.25;
    mesh(new THREE.ConeGeometry(.08,.28,6),0xffcdd2,[s*.36,2.7,.08],g).rotation.z=s*-.25;
    eye(g,s*.24,2.38,.5);
    const ch=mesh(new THREE.SphereGeometry(.13,10,8),0xffab91,[s*.42,2.1,.45],g);cheeks.push(ch);
    mesh(new THREE.CylinderGeometry(.15,.18,.55,12),fur,[s*.4,.28,.1],g);
    mesh(new THREE.SphereGeometry(.19,12,8),fur,[s*.4,.05,.22],g).scale.set(1.2,.45,1.35);
  }
  // bushy tail
  const tail=mesh(new THREE.ConeGeometry(.28,1.25,12),fur,[0,1.15,-.95],g);tail.rotation.x=-2.05;
  mesh(new THREE.SphereGeometry(.22,12,10),0x90a4ae,[0,1.55,-1.45],g);
  g.userData={...g.userData,kind:'wolf',cheeks,mixer:null,actions:{},idleName:'',walkName:''};return g;
}
function addScarf(root,color){
  const scarf=mesh(new THREE.TorusGeometry(.42,.08,8,18,Math.PI*1.35),color,[0,1.4,.12],root);
  scarf.rotation.x=.55;scarf.rotation.z=.15;
  const end=mesh(new THREE.BoxGeometry(.14,.4,.07),color,[.28,1.05,.28],root);end.rotation.z=.45;
  return scarf;
}
function addBow(root,y=2.45){
  const bow=new THREE.Group();bow.position.set(0,y,.15);root.add(bow);
  mesh(new THREE.SphereGeometry(.14,12,10),0xe91e63,[-.18,0,0],bow).scale.set(1.25,.85,.5);
  mesh(new THREE.SphereGeometry(.14,12,10),0xe91e63,[.18,0,0],bow).scale.set(1.25,.85,.5);
  mesh(new THREE.SphereGeometry(.08,10,8),0xc2185b,[0,0,.06],bow);
  return bow;
}
function picketFence(len=10,h=.85){
  const g=new THREE.Group();
  const wood=0xc4a484,woodDark=0xa67c52,post=0x8d6e63;
  const n=Math.max(4,Math.round(len/.55));
  for(let i=0;i<=n;i++){
    const x=-len/2+i*(len/n);
    const p=mesh(new THREE.BoxGeometry(.1,h,.1),post,[x,h/2,0],g);
    // pointed picket top
    mesh(new THREE.ConeGeometry(.08,.16,4),post,[x,h+.06,0],g);
    p.castShadow=true;
  }
  mesh(new THREE.BoxGeometry(len,.07,.06),wood,[0,h*.38,0],g);
  mesh(new THREE.BoxGeometry(len,.07,.06),woodDark,[0,h*.68,0],g);
  return g;
}

// —— houses (every piece a direct child) ——
function strawHouse(){
  const g=new THREE.Group();
  mesh(new THREE.CylinderGeometry(1.55,1.85,2.1,14),0xf0d078,[0,1.05,0],g);
  for(let i=0;i<18;i++){
    const a=(i/18)*Math.PI*2,r=1.7;
    const b=mesh(new THREE.CylinderGeometry(.08,.1,2.05,6),0xe8c86a,[Math.cos(a)*r,1.05,Math.sin(a)*r],g);
    b.rotation.y=-a;
  }
  mesh(new THREE.ConeGeometry(2.5,1.9,14),0xe0b04a,[0,3.0,0],g);
  for(let i=0;i<70;i++){
    const a=Math.random()*Math.PI*2,r=.3+Math.random()*2.1,y=2.15+Math.random()*1.5-(r*.35);
    const s=mesh(new THREE.CylinderGeometry(.02,.045,.55+Math.random()*.4,4),
      [0xd4a537,0xe6b84a,0xc9952e][i%3],[Math.cos(a)*r,y,Math.sin(a)*r],g);
    s.rotation.z=(Math.random()-.5)*.7;s.rotation.x=(Math.random()-.5)*.5;
  }
  for(let i=0;i<12;i++){
    const a=-.6+i*.12;
    mesh(new THREE.BoxGeometry(.08,.08,1.1),0xd4a537,[Math.sin(a)*1.9,2.05+Math.abs(a)*.3,Math.cos(a)*1.9],g);
  }
  mesh(new THREE.BoxGeometry(.85,1.25,.12),0x8d6e63,[0,.65,1.82],g);
  mesh(new THREE.BoxGeometry(.15,.15,.08),0x5d4037,[.28,.9,1.9],g);
  return g;
}
function woodHouse(){
  const g=new THREE.Group();
  const woods=[0xa1887f,0xbc8f6a,0x8d6e63];
  for(let y=0;y<6;y++){
    for(const [x,z,ry] of [[0,1.55,0],[0,-1.55,0],[1.55,0,Math.PI/2],[-1.55,0,Math.PI/2]]){
      const log=mesh(new THREE.CylinderGeometry(.2,.2,3.25,10),woods[y%3],[x,.22+y*.42,z],g);
      log.rotation.z=Math.PI/2;log.rotation.y=ry;
    }
  }
  for(const s of[-1,1]){
    const r=mesh(new THREE.BoxGeometry(3.8,.18,2.4),0x6d4c41,[0,3.15,s*.85],g);r.rotation.x=s*.55;
  }
  mesh(new THREE.BoxGeometry(.35,.35,3.5),0x5d4037,[0,3.55,0],g); // ridge
  // plank door
  for(let i=0;i<4;i++)mesh(new THREE.BoxGeometry(.2,1.45,.08),0x5d4037,[-.3+i*.2,.75,1.72],g);
  mesh(new THREE.SphereGeometry(.06,8,6),0xffd54f,[.28,.85,1.78],g);
  // window
  mesh(new THREE.BoxGeometry(.7,.7,.1),0xfff59d,[1.05,1.55,1.72],g);
  mesh(new THREE.BoxGeometry(.75,.08,.12),0x4e342e,[1.05,1.9,1.76],g);
  mesh(new THREE.BoxGeometry(.75,.08,.12),0x4e342e,[1.05,1.2,1.76],g);
  mesh(new THREE.BoxGeometry(.08,.7,.12),0x4e342e,[.7,1.55,1.76],g);
  mesh(new THREE.BoxGeometry(.08,.7,.12),0x4e342e,[1.4,1.55,1.76],g);
  mesh(new THREE.BoxGeometry(.08,.7,.08),0x4e342e,[1.05,1.55,1.76],g);
  return g;
}
function brickHouse(){
  const g=new THREE.Group();
  const reds=[0xd84315,0xbf360c,0xe64a19,0xc62828];
  // mortar shell
  mesh(new THREE.BoxGeometry(3.4,2.7,3.4),0xbcaaa4,[0,1.35,0],g);
  for(let y=0;y<8;y++)for(let i=0;i<7;i++){
    const off=(y%2)*.28;
    for(const [ax,s] of [['x',1],['x',-1],['z',1],['z',-1]]){
      const t=-1.55+off+i*.52;if(t>1.65)continue;
      const pos=ax==='x'?[t,.18+y*.34,s*1.68]:[s*1.68,.18+y*.34,t];
      mesh(new THREE.BoxGeometry(ax==='x'?.48:.28,.3,ax==='x'?.28:.48),reds[(i+y)%4],pos,g);
    }
  }
  // gabled roof
  for(const s of[-1,1]){
    const r=mesh(new THREE.BoxGeometry(3.9,.16,2.5),0x5d4037,[0,3.55,s*.9],g);r.rotation.x=s*.5;
  }
  mesh(new THREE.BoxGeometry(.4,.4,3.6),0x4e342e,[0,3.95,0],g);
  // chimney + bricks
  mesh(new THREE.BoxGeometry(.55,1.3,.55),0x8d6e63,[1.1,4.2,-.2],g);
  for(let i=0;i<3;i++)mesh(new THREE.BoxGeometry(.5,.18,.5),reds[i],[1.1,3.7+i*.28,-.2],g);
  mesh(new THREE.BoxGeometry(.62,.1,.62),0x6d4c41,[1.1,4.85,-.2],g);
  // door with frame
  mesh(new THREE.BoxGeometry(1.05,1.6,.1),0x3e2723,[0,.8,1.78],g);
  mesh(new THREE.BoxGeometry(1.15,.1,.12),0x4e342e,[0,1.6,1.82],g);
  mesh(new THREE.BoxGeometry(.1,1.6,.12),0x4e342e,[-.52,.8,1.82],g);
  mesh(new THREE.BoxGeometry(.1,1.6,.12),0x4e342e,[.52,.8,1.82],g);
  mesh(new THREE.SphereGeometry(.06,8,6),0xffc107,[.32,.85,1.86],g);
  for(const s of[-1,1]){
    mesh(new THREE.BoxGeometry(.65,.65,.08),0xfff9c4,[s*1.05,1.7,1.78],g);
    mesh(new THREE.BoxGeometry(.72,.08,.1),0x5d4037,[s*1.05,2.02,1.82],g);
    mesh(new THREE.BoxGeometry(.72,.08,.1),0x5d4037,[s*1.05,1.38,1.82],g);
    mesh(new THREE.BoxGeometry(.08,.65,.1),0x5d4037,[s*1.05-.32,1.7,1.82],g);
    mesh(new THREE.BoxGeometry(.08,.65,.1),0x5d4037,[s*1.05+.32,1.7,1.82],g);
    mesh(new THREE.BoxGeometry(.08,.65,.08),0x5d4037,[s*1.05,1.7,1.82],g);
  }
  return g;
}

// —— glTF helpers ——
const loader=new GLTFLoader();
function loadGltf(url){
  return new Promise((resolve,reject)=>loader.load(url,resolve,undefined,reject));
}
function prepModel(root,{scale=1,groundY=true}={}){
  root.traverse(o=>{
    if(o.isMesh){
      o.castShadow=o.receiveShadow=true;
      if(o.material){
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(m=>{if(m.map)m.map.colorSpace=THREE.SRGBColorSpace;m.side=THREE.FrontSide;});
      }
    }
  });
  if(scale!==1)root.scale.setScalar(scale);
  if(groundY){
    const box=new THREE.Box3().setFromObject(root);
    root.position.y-=box.min.y;
  }
  return root;
}
function fitHeight(root,targetH){
  const box=new THREE.Box3().setFromObject(root);
  const h=box.max.y-box.min.y||1;
  root.scale.multiplyScalar(targetH/h);
  box.setFromObject(root);root.position.y-=box.min.y;
}

function makeDecor(gltf,height){
  const root=cloneSkinned(gltf.scene);
  prepModel(root,{groundY:true});
  fitHeight(root,height);
  return root;
}

const scarfColors=[0xffeb3b,0x42a5f5,0x66bb6a];
let pigs,mom,wolfG,houses;
const props=[];
const mixers=[];

function footOffset(o){
  if(o.userData.footOff!=null)return o.userData.footOff;
  const prev=o.position.y;o.position.y=0;o.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(o);
  o.userData.footOff=-box.min.y;o.position.y=prev;
  return o.userData.footOff;
}
function placeOnGround(o,x,z,yOff=0){
  o.position.set(x,groundH(x,z)+footOffset(o)+yOff,z);
}
function standY(o,x=o.position.x,z=o.position.z){
  return groundH(x,z)+footOffset(o);
}
async function loadWorld(){
  const msg=$('#loadmsg');
  const assets={};
  // nature props only — Quaternius pig/wolf Armature×100 skins render as hairlines
  const jobs=[
    ['pine','assets/pine.glb'],['plant','assets/plant.glb'],['rock','assets/rock.glb']
  ];
  for(const [k,url] of jobs){
    try{assets[k]=await loadGltf(url);msg.textContent=`装好了 ${k}…`;}
    catch(e){console.warn('asset fail',url,e);assets[k]=null;}
  }

  // cute storybook pigs (~1.9–2.5 tall) with colored overalls + scarves
  pigs=scarfColors.map(c=>{
    const p=procPig(c,{overalls:true});
    addScarf(p,c);
    p.scale.setScalar(1.05);
    return p;
  });
  pigs.forEach(p=>scene.add(p));

  mom=procPig(0xffcc80,{overalls:false});
  mom.scale.setScalar(1.28);
  addBow(mom,2.55);addScarf(mom,0xffcc80);
  scene.add(mom);

  wolfG=procWolf();
  wolfG.scale.setScalar(1.05);
  scene.add(wolfG);

  // nature props
  const place=(factory,n,r0,r1,yScale)=>{
    if(!factory)return;
    for(let i=0;i<n;i++){
      const a=Math.PI*(.75+i/n*1.5)+Math.random()*.1,r=r0+Math.random()*(r1-r0);
      try{
        const o=factory();
        const x=Math.cos(a)*r,z=Math.sin(a)*r;
        placeOnGround(o,x,z);
        o.rotation.y=Math.random()*Math.PI*2;
        if(yScale)o.scale.multiplyScalar(yScale*(.85+Math.random()*.3));
        scene.add(o);props.push(o);
      }catch(e){console.warn(e);}
    }
  };
  if(assets.pine)place(()=>makeDecor(assets.pine,3.8+Math.random()*1.5),IS_MOBILE?7:10,12,16,1);
  else{
    for(let i=0;i<10;i++){
      const a=Math.PI*(.85+i/9*1.3),r=13+Math.random()*3,t=new THREE.Group();
      placeOnGround(t,Math.cos(a)*r,Math.sin(a)*r);
      mesh(new THREE.CylinderGeometry(.22,.32,1.5,8),0x8d6e63,[0,.75,0],t);
      mesh(new THREE.IcosahedronGeometry(1.3+Math.random()*.4,1),[0x66bb6a,0x81c784,0x4caf50][i%3],[0,2.2,0],t);
      scene.add(t);
    }
  }
  if(assets.plant)place(()=>makeDecor(assets.plant,.7+Math.random()*.5),IS_MOBILE?8:14,5,12,1);
  if(assets.rock)place(()=>makeDecor(assets.rock,.35+Math.random()*.45),6,6,14,1);

  // short warm wooden picket fence behind the stage (not the grey Kenney slab)
  const fence=picketFence(9,.9);
  placeOnGround(fence,-1.5,-7.2);
  fence.rotation.y=0.05;
  scene.add(fence);props.push(fence);

  houses=[strawHouse(),woodHouse(),brickHouse()];
  houses.forEach(h=>{h.visible=false;scene.add(h);});
  msg.textContent='点一点开始吧！';
}

// click marker
const marker=mesh(new THREE.RingGeometry(.3,.45,24),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0}),[0,.02,0],scene);
marker.rotation.x=-Math.PI/2;

// story
const S=[
 {a:'s0',t:'从前，有三只小猪。猪妈妈说：“孩子们，去盖自己的小房子吧！”',h:'👆 点一点小猪，跟它们说再见'},
 {a:'s1',t:'猪老大用<b>稻草</b>盖了一座小房子。大灰狼来了！',h:'👆 点一点大灰狼',b:'s1b',bt:'呼——！稻草房子飞走啦！猪老大赶紧跑去找猪老二。'},
 {a:'s2',t:'猪老二用<b>木头</b>盖了一座房子。大灰狼又来了！',h:'👆 点一点大灰狼',b:'s2b',bt:'呼——呼——！木头房子也散啦！小猪们跑去找猪老三。'},
 {a:'s3',t:'猪老三一块一块地，用<b>砖头</b>盖了结实的房子。',h:'👆 点一点大灰狼',b:'s3b',bt:'呼呼呼！砖房子一动也不动！大灰狼累坏了，灰溜溜地走掉啦。'},
 {a:'end',t:'三只小猪在砖房子里开开心心地生活。认真做事，不怕辛苦，才能把事情做好哦！',h:'👆 点小猪跳一跳 · ▶ 再玩一次'}];

let snap=true,cur=0,done=false,huffT=-1,audio=new Audio(),started=false;
const camT=new THREE.Vector3(),camP=new THREE.Vector3();
let walker=null,walkTo=null;
const puffs=[],debris=[];

S.forEach(()=>$('#dots').appendChild(document.createElement('i')));
function play(k){window.__audioLog&&__audioLog.push([k,performance.now()]);audio.pause();audio=new Audio(`audio/${k}.mp3`);if(started)audio.play().catch(()=>{});}
function setText(t,h){$('#text').innerHTML=t;$('#hint').textContent=h||'';}
function resetHouse(h){
  h.visible=true;h.position.set(0,0,0);
  h.children.forEach(c=>{
    if(c.userData.o){c.position.copy(c.userData.o);c.rotation.copy(c.userData.r);c.visible=true;}
    else{c.userData.o=c.position.clone();c.userData.r=c.rotation.clone();}
  });
}
function setWolfAnim(name){
  const u=wolfG.userData,acts=u.actions||{};
  if(!acts[name])return;
  Object.keys(acts).forEach(k=>{if(k!==name&&acts[k].isRunning())acts[k].fadeOut(.25);});
  acts[name].reset().fadeIn(.25).play();
}
function hopPig(p){
  p.userData.hop=1;
  const acts=p.userData.actions||{};
  if(acts.Jump){acts.Jump.reset().setLoop(THREE.LoopOnce,1);acts.Jump.clampWhenFinished=true;acts.Jump.play();}
}
function frameCam(eye,look){
  // portrait: pull back enough for house+cast; raise look so stage sits above the story box
  if(camera.aspect<1){
    camP.set(eye.x*0.55, eye.y+0.3, eye.z*1.22);
    camT.set(look.x*0.5, look.y+0.55, look.z);
  }else{
    camP.copy(eye);camT.copy(look);
  }
}
function go(n){
  snap=true;cur=(n+S.length)%S.length;done=false;huffT=-1;debris.length=0;
  puffs.forEach(p=>scene.remove(p));puffs.length=0;
  const s=S[cur];setText(s.t,s.h);play(s.a);
  [...$('#dots').children].forEach((d,i)=>d.className=i===cur?'on':'');
  $('#next').classList.toggle('glow',cur===0||cur===4);
  houses.forEach(h=>h.visible=false);
  const portrait=camera.aspect<1;
  mom.visible=cur===0;wolfG.visible=cur>=1&&cur<=3;
  placeOnGround(wolfG,portrait?2.35:4.6,portrait?1.5:2.2);wolfG.rotation.set(0,-Math.PI/2,0);
  if(wolfG.userData.cheeks)wolfG.userData.cheeks.forEach(c=>c.material.color.set(0xffab91));
  if(wolfG.userData.head?.scale)wolfG.userData.head.scale.setScalar(1);
  setWolfAnim(wolfG.userData.idleName||'Idle');
  pigs.forEach(p=>p.visible=false);walker=null;walkTo=null;
  if(cur===0){
    placeOnGround(mom,portrait?-1.5:-2.2,0.2);mom.rotation.y=.45;
    const gap=portrait?1.25:1.55,x0=portrait?-0.1:-0.2;
    pigs.forEach((p,i)=>{p.visible=true;placeOnGround(p,x0+i*gap,1.15);p.rotation.y=-.15;});
    frameCam(new THREE.Vector3(0,4.6,10.5),new THREE.Vector3(0.4,1.6,0.4));
  }else if(cur<=3){
    const h=houses[cur-1];resetHouse(h);
    const hx=portrait?-0.6:-1.2,hz=-0.6;placeOnGround(h,hx,hz);
    const gap=portrait?1.0:1.15,x0=portrait?-1.6:-2.4;
    for(let i=0;i<cur;i++){pigs[i].visible=true;placeOnGround(pigs[i],x0+i*gap,1.85);pigs[i].rotation.y=0;}
    walker=pigs[cur-1];
    frameCam(new THREE.Vector3(portrait?0.6:1.2,4.8,10.5),new THREE.Vector3(portrait?0.4:0.3,1.7,0.2));
  }else{
    const h=houses[2];resetHouse(h);placeOnGround(h,0,-1.5);
    const gap=portrait?1.25:1.6,x0=portrait?-1.25:-1.6;
    pigs.forEach((p,i)=>{p.visible=true;placeOnGround(p,x0+i*gap,1.5);p.rotation.y=0;});
    frameCam(new THREE.Vector3(0,4.6,11),new THREE.Vector3(0,1.8,-0.2));
  }
}
function huff(){if(huffT>=0||done)return;huffT=0;const s=S[cur];setTimeout(()=>{play(s.b);setText(s.bt,'▶ 点右上角，下一页');$('#next').classList.add('glow');},200);}

const ray=new THREE.Raycaster(),ptr=new THREE.Vector2();
function hit(o){let x=o;while(x){if(x===wolfG)return 'wolf';if(pigs.includes(x)||x===mom)return x;x=x.parent;}return null;}
renderer.domElement.addEventListener('pointerdown',e=>{
  ptr.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(ptr,camera);
  const objs=ray.intersectObjects(scene.children,true);
  for(const o of objs){
    if(!o.object.visible)continue;const h=hit(o.object);
    if(h==='wolf'&&wolfG.visible){huff();return;}
    if(h&&h.userData){hopPig(h);squeak();return;}
    if(o.object===ground&&walker&&huffT<0){
      walkTo=o.point.clone();walkTo.y=0;walkTo.clampLength(0,8);
      marker.position.set(walkTo.x,.03,walkTo.z);marker.material.opacity=1;return;
    }
    if(o.object===ground)return;
  }
});
let ac;function squeak(){try{ac=ac||new AudioContext();const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(700,ac.currentTime);o.frequency.exponentialRampToValueAtTime(1200,ac.currentTime+.12);g.gain.setValueAtTime(.15,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.2);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.2);}catch(e){}}

$('#next').onclick=()=>go(cur+1);
$('#prev').onclick=()=>go(cur-1);
$('#replay').onclick=()=>play(done?S[cur].b:S[cur].a);
$('#start').onclick=()=>{if(!ready)return;started=true;$('#start').style.display='none';go(0);};

window.__game={go,huff,hop:i=>{hopPig(pigs[i]);},start:()=>{$('#start').onclick();},get cur(){return cur}};

function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h);
  camera.aspect=w/h;
  camera.fov=camera.aspect<1?52:45;
  // shift frustum so 3D stage sits in the visible band above the story card
  if(camera.aspect<1)camera.setViewOffset(w,h,0,-h*0.1,w,h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();

let t=0,lastNow=performance.now();camera.position.set(0,6,14);
const REC=location.search.includes('rec');
function tick(fdt){
  let dt;
  if(REC&&fdt!=null)dt=fdt;
  else{const now=performance.now();dt=Math.min((now-lastNow)/1000,.05);lastNow=now;}
  t+=dt;
  mixers.forEach(m=>m.update(dt));
  clouds.forEach((c,i)=>{c.position.x+=dt*(.3+i*.05);if(c.position.x>25)c.position.x=-25;});
  [...pigs,mom].forEach((p,i)=>{
    const u=p.userData;
    const baseY=standY(p);
    if(u.hop>0){
      u.hop-=dt*1.8;
      if(!u.actions?.Jump){p.position.y=baseY+Math.sin((1-Math.max(u.hop,0))*Math.PI)*1.0;p.rotation.y+=dt*8;}
      if(u.hop<=0){p.position.y=baseY;if(!u.actions?.Jump)p.rotation.y=0;}
    }else{
      p.position.y=baseY;
      if(u.body?.scale)u.body.scale.y=1.05+Math.sin(t*3+i)*.03;
    }
  });
  if(walker&&walkTo){
    const d=walkTo.clone().sub(walker.position);d.y=0;
    if(d.length()<.1){walkTo=null;marker.material.opacity=0;}
    else{
      walker.rotation.y=Math.atan2(d.x,d.z);
      walker.position.addScaledVector(d.normalize(),dt*3);
      walker.position.y=standY(walker)+Math.abs(Math.sin(t*12))*.15;
    }
  }
  if(wolfG.visible&&huffT<0){
    wolfG.position.y=standY(wolfG);
  }
  marker.material.opacity*=.98;marker.scale.setScalar(1+Math.sin(t*6)*.15);
  if(wolfG.visible&&wolfG.userData.head&&huffT<0){
    wolfG.userData.head.rotation.z=Math.sin(t*2)*.08;
  }
  if(huffT>=0){
    huffT+=dt;const hs=houses[cur-1];
    const inflate=Math.min(huffT,1.2);
    if(wolfG.userData.head)wolfG.userData.head.scale.setScalar(1+Math.sin(Math.min(inflate,1)*Math.PI/2)*.25*(huffT<1.3?1:0));
    if(huffT>1.2&&huffT<3&&Math.random()<.5){
      const p=mesh(new THREE.SphereGeometry(.25+Math.random()*.3,8,6),new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.8,roughness:1}),
        [wolfG.position.x-1,2+Math.random()*.6,wolfG.position.z],scene);
      p.userData.v=new THREE.Vector3(-6-Math.random()*2,(Math.random()-.5),(Math.random()-.5)*2-1);puffs.push(p);
    }
    if(cur<3&&huffT>1.6&&!debris.length){
      hs.children.forEach(c=>{
        c.userData.v=new THREE.Vector3(-3-Math.random()*5,3+Math.random()*5,(Math.random()-.5)*4);
        c.userData.w=new THREE.Vector3(Math.random()*4,Math.random()*4,Math.random()*4);debris.push(c);
      });
    }
    if(cur===3&&huffT>1.6&&huffT<3){
      hs.position.x=-1.5+Math.sin(t*60)*.02;
      wolfG.userData.cheeks?.forEach(c=>c.material.color.set(0xff5252));
    }
    if(cur===3&&huffT>3.6){
      if(huffT<3.7)setWolfAnim('Walk');
      wolfG.rotation.y=Math.PI/2;wolfG.position.x+=dt*3;
      wolfG.position.y=standY(wolfG)+Math.abs(Math.sin(t*10))*.2;
      if(wolfG.position.x>16)wolfG.visible=false;
    }
    if(cur<3&&huffT>3.2){
      const p=pigs[cur-1];p.rotation.y=Math.PI/2;p.position.x+=dt*4;
      p.position.y=standY(p)+Math.abs(Math.sin(t*14))*.2;
      if(p.position.x>14)p.visible=false;
    }
    if(huffT>1.2)done=true;
  }
  puffs.forEach(p=>{p.position.addScaledVector(p.userData.v,dt);p.material.opacity-=dt*.5;p.scale.multiplyScalar(1+dt);if(p.material.opacity<=0)p.visible=false;});
  debris.forEach(c=>{c.userData.v.y-=dt*4;c.position.addScaledVector(c.userData.v,dt);c.rotation.x+=c.userData.w.x*dt;c.rotation.z+=c.userData.w.z*dt;if(c.position.y<-8)c.visible=false;});
  const k=camera.aspect<1?1.12:1;
  camera.position.lerp(camP.clone().sub(camT).multiplyScalar(k).add(camT).add(new THREE.Vector3(Math.sin(t*.2)*.5,0,0)),snap?1:dt*2);
  snap=false;camera.lookAt(camT);
  renderer.render(scene,camera);if(!REC)requestAnimationFrame(tick);
}
window.__frame=tick;

let ready=false;
loadWorld().then(()=>{
  ready=true;$('#loadmsg').textContent='点一点开始吧！';
  go(0);tick();
}).catch(e=>{
  console.error(e);$('#loadmsg').textContent='加载出错，将使用备用造型';
  ready=true;go(0);tick();
});
