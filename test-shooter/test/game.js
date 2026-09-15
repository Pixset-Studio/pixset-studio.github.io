'use strict';
const canvas=document.getElementById('gl');
const gl=canvas.getContext('webgl',{antialias:false,alpha:false});
if(!gl){document.getElementById('start').innerHTML='<div class="panel"><h1>WebGL не поддерживается</h1><p>Открой игру в браузере с поддержкой WebGL.</p></div>';throw new Error('WebGL unavailable');}

let dpr=Math.min(devicePixelRatio||1,2);
function resize(){canvas.width=Math.max(1,Math.floor(innerWidth*dpr));canvas.height=Math.max(1,Math.floor(innerHeight*dpr));gl.viewport(0,0,canvas.width,canvas.height);}
addEventListener('resize',resize);resize();

const VS=`attribute vec3 aPos; attribute vec3 aNormal; uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vNormal; varying vec3 vWorld; void main(){ vNormal=aNormal; vWorld=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uMVP*vec4(aPos,1.0); }`;
const FS=`precision mediump float; uniform vec4 uColor; varying vec3 vNormal; varying vec3 vWorld; void main(){ float light=0.28+0.62*max(dot(normalize(vNormal),normalize(vec3(-0.45,1.0,0.28))),0.0); float fog=clamp(length(vWorld)/58.0,0.0,1.0); vec3 c=uColor.rgb*light; c=mix(c,vec3(0.02,0.03,0.05),fog*0.62); gl_FragColor=vec4(c,uColor.a); }`;
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s)||'shader compile failed';console.error(log);throw new Error(log);}return s;}
function createProgram(){const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,VS));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,FS));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const log=gl.getProgramInfoLog(p)||'program link failed';console.error(log);throw new Error(log);}return p;}
const program=createProgram();gl.useProgram(program);
const loc={pos:gl.getAttribLocation(program,'aPos'),normal:gl.getAttribLocation(program,'aNormal'),mvp:gl.getUniformLocation(program,'uMVP'),model:gl.getUniformLocation(program,'uModel'),color:gl.getUniformLocation(program,'uColor')};

const cubeV=new Float32Array([
-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5,
-.5,-.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,-.5,-.5,
.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,
-.5,-.5,.5,-.5,.5,.5,-.5,.5,-.5,-.5,-.5,-.5,
-.5,.5,.5,.5,.5,.5,.5,.5,-.5,-.5,.5,-.5,
-.5,-.5,-.5,.5,-.5,-.5,.5,-.5,.5,-.5,-.5,.5
]);
const cubeN=new Float32Array([
0,0,1,0,0,1,0,0,1,0,0,1,
0,0,-1,0,0,-1,0,0,-1,0,0,-1,
1,0,0,1,0,0,1,0,0,1,0,0,
-1,0,0,-1,0,0,-1,0,0,-1,0,0,
0,1,0,0,1,0,0,1,0,0,1,0,
0,-1,0,0,-1,0,0,-1,0,0,-1,0
]);
const cubeI=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]);
const mesh={vb:gl.createBuffer(),nb:gl.createBuffer(),ib:gl.createBuffer(),cnt:cubeI.length};
gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vb);gl.bufferData(gl.ARRAY_BUFFER,cubeV,gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER,mesh.nb);gl.bufferData(gl.ARRAY_BUFFER,cubeN,gl.STATIC_DRAW);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,cubeI,gl.STATIC_DRAW);

function I(){const m=new Float32Array(16);m[0]=m[5]=m[10]=m[15]=1;return m;}
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3];return o;}
function T(x,y,z){const m=I();m[12]=x;m[13]=y;m[14]=z;return m;}
function S(x,y,z){const m=I();m[0]=x;m[5]=y;m[10]=z;return m;}
function persp(fovy,asp,n,f){const t=1/Math.tan(fovy/2),m=new Float32Array(16);m[0]=t/asp;m[5]=t;m[10]=(f+n)/(n-f);m[11]=-1;m[14]=2*f*n/(n-f);return m;}
function lookAt(ex,ey,ez,cx,cy,cz){let z=[ex-cx,ey-cy,ez-cz],zl=Math.hypot(z[0],z[1],z[2]);z=z.map(v=>v/zl);let x=[z[2],0,-z[0]],xl=Math.hypot(x[0],x[1],x[2]);x=x.map(v=>v/xl);const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]],m=I();m[0]=x[0];m[1]=y[0];m[2]=z[0];m[4]=x[1];m[5]=y[1];m[6]=z[1];m[8]=x[2];m[9]=y[2];m[10]=z[2];m[12]=-(x[0]*ex+x[1]*ey+x[2]*ez);m[13]=-(y[0]*ex+y[1]*ey+y[2]*ez);m[14]=-(z[0]*ex+z[1]*ey+z[2]*ez);return m;}
function draw(x,y,z,sx,sy,sz,color,VP){const M=mul(T(x,y,z),S(sx,sy,sz));const MVP=mul(VP,M);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vb);gl.enableVertexAttribArray(loc.pos);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.nb);gl.enableVertexAttribArray(loc.normal);gl.vertexAttribPointer(loc.normal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.uniformMatrix4fv(loc.mvp,false,MVP);gl.uniformMatrix4fv(loc.model,false,M);gl.uniform4f(loc.color,color[0],color[1],color[2],color[3]);gl.drawElements(gl.TRIANGLES,mesh.cnt,gl.UNSIGNED_SHORT,0);}

const keys=Object.create(null);addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyR')reload();if(e.code==='Enter'&&state==='dead')reset();});addEventListener('keyup',e=>keys[e.code]=false);
let player={x:0,y:1.7,z:8,yaw:Math.PI,pitch:0,hp:100,ammo:30,reserve:120,reloading:false};
let enemies=[],bullets=[],pickups=[],wave=1,kills=0,state='menu',spawnPending=false,lastShot=0,shootHeld=false;
const walls=[[-12,1.5,0,1,3,28],[12,1.5,0,1,3,28],[-6,1.5,-12,12,3,1],[6,1.5,0,8,3,1],[0,1.5,12,24,3,1],[-3,1.5,-4,1,3,8],[3,1.5,-4,1,3,8]];
function message(t){const el=document.getElementById('msg');el.textContent=t;clearTimeout(message.timer);message.timer=setTimeout(()=>el.textContent='',1300);}
function spawnWave(){spawnPending=false;for(let i=0;i<wave+3;i++){let x=(Math.random()*18)-9;let z=-15-Math.random()*17;enemies.push({x,z,hp:55+wave*8,cd:Math.random(),speed:1.35+wave*.05});}message('ВОЛНА '+wave);}
function reload(){if(state!=='play'||player.reloading||player.ammo>=30||player.reserve<=0)return;player.reloading=true;message('ПЕРЕЗАРЯДКА');setTimeout(()=>{if(state!=='play')return;const n=Math.min(30-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;player.reloading=false;},750);}
function fire(){if(state!=='play'||player.reloading)return;if(player.ammo<=0){reload();return}player.ammo--;const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch),sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);bullets.push({x:player.x+sy*.45,y:player.y+sp*.3,z:player.z+cy*.45,vx:sy*30*cp,vy:sp*30,vz:cy*30*cp,life:1});}
function collide(x,z){for(const w of walls){if(Math.abs(x-w[0])<w[3]/2+.35&&Math.abs(z-w[2])<w[5]/2+.35)return true;}return false;}
function mobile(){return matchMedia('(pointer:coarse)').matches||innerWidth<800;}
function enemyHit(b){let best=null,bd=1e9;for(const e of enemies){const d=Math.hypot(b.x-e.x,b.z-e.z);if(d<1.3&&Math.abs(b.y-1.2)<1.35&&d<bd){bd=d;best=e;}}return best;}

const joy=document.getElementById('joy'),knob=document.getElementById('knob'),look=document.getElementById('look');let jt=null,jx=0,jy=0,lt=null,lx=0,ly=0;
joy.addEventListener('pointerdown',e=>{jt=e.pointerId;joy.setPointerCapture(jt);});
joy.addEventListener('pointermove',e=>{if(e.pointerId!==jt)return;const r=joy.getBoundingClientRect();let x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),d=Math.hypot(x,y),m=45;if(d>m){x*=m/d;y*=m/d;}jx=x/m;jy=y/m;knob.style.transform=`translate(${x}px,${y}px)`;});


look.addEventListener('pointerdown',e=>{lt=e.pointerId;lx=e.clientX;ly=e.clientY;look.setPointerCapture(lt);});
look.addEventListener('pointermove',e=>{if(e.pointerId!==lt)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;player.yaw+=dx*.008;player.pitch=Math.max(-1.25,Math.min(1.25,player.pitch+dy*.006));});
look.addEventListener('pointerup',()=>lt=null);look.addEventListener('pointercancel',()=>lt=null);
document.getElementById('fire').addEventListener('pointerdown',e=>{e.preventDefault();shootHeld=true;fire();});
document.getElementById('fire').addEventListener('pointerup',()=>shootHeld=false);document.getElementById('fire').addEventListener('pointercancel',()=>shootHeld=false);
document.getElementById('reload').addEventListener('pointerdown',e=>{e.preventDefault();reload();});
addEventListener('mousedown',e=>{if(state==='play'&&e.button===0){shootHeld=true;if(!mobile())canvas.requestPointerLock?.();fire();}});
addEventListener('mouseup',e=>{if(e.button===0)shootHeld=false;});
addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){player.yaw+=e.movementX*.0022;player.pitch=Math.max(-1.25,Math.min(1.25,player.pitch+e.movementY*.0022));}});
function reset(){player={x:0,y:1.7,z:8,yaw:Math.PI,pitch:0,hp:100,ammo:30,reserve:120,reloading:false};enemies=[];bullets=[];pickups=[];wave=1;kills=0;state='play';spawnPending=false;spawnWave();}
document.getElementById('startBtn').addEventListener('click',()=>{document.getElementById('start').style.display='none';reset();});
function update(dt,now){if(state!=='play')return;
  let ix=0,iz=0;if(keys.KeyW)iz-=1;if(keys.KeyS)iz+=1;if(keys.KeyA)ix-=1;if(keys.KeyD)ix+=1;if(jx||jy){ix=jx;iz=jy;}const len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len;}
  const spd=6,cy=Math.cos(player.yaw),sy=Math.sin(player.yaw),vx=ix*cy-iz*sy,vz=ix*sy+iz*cy;let nx=player.x+vx*spd*dt,nz=player.z+vz*spd*dt;if(!collide(nx,player.z))player.x=nx;if(!collide(player.x,nz))player.z=nz;player.x=Math.max(-10.6,Math.min(10.6,player.x));player.z=Math.max(-11.4,Math.min(10.4,player.z));
  if(shootHeld&&now-lastShot>=120){lastShot=now;fire();}
  for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.life-=dt;const e=enemyHit(b);if(e){e.hp-=34;b.life=0;e.flash=.08;if(e.hp<=0){kills++;if(Math.random()<.28)pickups.push({x:e.x,z:e.z,type:'ammo'});}}}
  bullets=bullets.filter(b=>b.life>0&&Math.abs(b.x)<22&&Math.abs(b.z)<42&&b.y>-2&&b.y<6);
  for(const e of enemies){const dx=player.x-e.x,dz=player.z-e.z,d=Math.hypot(dx,dz)||.001;e.cd-=dt;e.flash=Math.max(0,e.flash-dt);if(d>1.9){const ex=e.x+dx/d*e.speed*dt,ez=e.z+dz/d*e.speed*dt;if(!collide(ex,e.z))e.x=ex;if(!collide(e.x,ez))e.z=ez;}else if(e.cd<=0){e.cd=.8+Math.random()*.45;player.hp-=6;if(player.hp<=0){player.hp=0;state='dead';document.getElementById('start').style.display='flex';document.querySelector('#start h1').textContent='ТЫ ПОГИБ';document.querySelector('#start p').innerHTML='Убийств: '+kills+'<br>Нажми ИГРАТЬ, чтобы начать заново';document.getElementById('startBtn').textContent='ИГРАТЬ СНОВА';}}}
  enemies=enemies.filter(e=>e.hp>0);
  for(const p of pickups){if(Math.hypot(player.x-p.x,player.z-p.z)<1.1){player.reserve+=40;p.dead=true;message('+40 ПАТРОНОВ');}}pickups=pickups.filter(p=>!p.dead);
  if(enemies.length===0&&!spawnPending){spawnPending=true;wave++;setTimeout(()=>{if(state==='play')spawnWave();else spawnPending=false;},1000);}
}
function render(){gl.clearColor(.015,.02,.03,1);gl.enable(gl.DEPTH_TEST);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const aspect=canvas.width/canvas.height;const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch),sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);const VP=mul(persp(Math.PI/3,aspect,.05,100),lookAt(player.x,player.y,player.z,player.x+sy*cp,player.y+sp,player.z+cy*cp));
  draw(0,-.35,0,24,.5,30,[.11,.14,.18,1],VP);
  for(const w of walls)draw(w[0],w[1],w[2],w[3],w[4],w[5],[.19,.22,.27,1],VP);
  for(const e of enemies){const c=e.flash>0?[1,.7,.2,1]:[.7,.10,.08,1];draw(e.x,1.3,e.z,1,2.2,1,c,VP);}
  for(const p of pickups)draw(p.x,.35,p.z,.5,.5,.5,[.1,.62,1,1],VP);
  for(const b of bullets)draw(b.x,b.y,b.z,.12,.12,.5,[1,.75,.12,1],VP);
  document.getElementById('hp').textContent='HP '+Math.max(0,player.hp|0);document.getElementById('ammo').textContent='AMMO '+player.ammo+' / '+player.reserve;document.getElementById('wave').textContent='WAVE '+wave;
}
let last=performance.now();function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt,now);render();requestAnimationFrame(loop);}requestAnimationFrame(loop);
