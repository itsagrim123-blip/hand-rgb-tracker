import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm';

const video=document.querySelector('#camera'), root=document.querySelector('#three-root');
const status=document.querySelector('#status'), notice=document.querySelector('#notice'), debug=document.querySelector('#debug');
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

// The video is CSS-mirrored, so X is inverted exactly once here.
function mediaPipeToWorld(landmark,camera){
  const distance=camera.position.z;
  const height=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*distance;
  const width=height*camera.aspect;
  return new THREE.Vector3((.5-landmark.x)*width,(.5-landmark.y)*height,clamp(-landmark.z*4,-1.4,1.4));
}

class HandTracker {
  constructor(camera){this.camera=camera;this.hands={left:this.makeHand('LEFT'),right:this.makeHand('RIGHT')};}
  makeHand(label){return {label,visible:false,confidence:0,pinch:false,wasPinching:false,pinchDistance:1,index:new THREE.Vector3(),pinchPoint:new THREE.Vector3(),targetIndex:new THREE.Vector3(),targetPinch:new THREE.Vector3(),lastSeen:0};}
  update(result,now){
    const seen=new Set();
    (result.landmarks||[]).forEach((landmarks,i)=>{
      const modelLabel=(result.handednesses?.[i]?.[0]?.categoryName||'').toLowerCase();
      const key=modelLabel.includes('left')?'left':modelLabel.includes('right')?'right':(landmarks[0].x<.5?'right':'left');
      const hand=this.hands[key], thumb=landmarks[4], index=landmarks[8]; seen.add(key);
      hand.visible=true; hand.lastSeen=now; hand.confidence=result.handednesses?.[i]?.[0]?.score||0;
      hand.targetIndex.copy(mediaPipeToWorld(index,this.camera));
      hand.targetPinch.copy(mediaPipeToWorld(thumb,this.camera)).lerp(hand.targetIndex,.5);
      hand.index.lerp(hand.targetIndex,.38); hand.pinchPoint.lerp(hand.targetPinch,.38);
      hand.pinchDistance=Math.hypot(thumb.x-index.x,thumb.y-index.y,thumb.z-index.z);
      hand.wasPinching=hand.pinch;
      hand.pinch=hand.pinch ? hand.pinchDistance<.075 : hand.pinchDistance<.055;
    });
    Object.entries(this.hands).forEach(([key,hand])=>{if(!seen.has(key)&&now-hand.lastSeen>250){hand.visible=false;hand.wasPinching=hand.pinch;hand.pinch=false;}});
  }
}

class ThreeWorld {
  constructor(){
    this.scene=new THREE.Scene(); this.camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,30); this.camera.position.z=5.5;
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true}); this.renderer.setPixelRatio(Math.min(devicePixelRatio,2)); this.renderer.setSize(innerWidth,innerHeight); root.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xb8edff,0x11051b,2)); const key=new THREE.DirectionalLight(0xffffff,2); key.position.set(2,3,4); this.scene.add(key);
    this.cube=new THREE.Mesh(new THREE.BoxGeometry(.7,.7,.7),new THREE.MeshStandardMaterial({color:0x43dffa,emissive:0x083b54,metalness:.45,roughness:.28})); this.cube.position.set(0,.15,0); this.scene.add(this.cube);
    this.pointers={left:this.pointer(0xff87c8),right:this.pointer(0x63efff)}; this.grabbedBy=null;
    addEventListener('resize',()=>this.resize());
  }
  pointer(color){const p=new THREE.Mesh(new THREE.SphereGeometry(.075,18,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9})); p.visible=false; this.scene.add(p); return p;}
  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);}
  update(tracker,dt){
    for(const [key,hand] of Object.entries(tracker.hands)){const pointer=this.pointers[key];pointer.visible=hand.visible;if(!hand.visible)continue;pointer.position.copy(hand.index);pointer.scale.setScalar(hand.pinch?1.55:1);}
    const hands=tracker.hands;
    for(const hand of Object.values(hands)){
      if(hand.pinch&&!hand.wasPinching&&!this.grabbedBy&&hand.pinchPoint.distanceTo(this.cube.position)<.72)this.grabbedBy=hand.label;
      if(hand.wasPinching&&!hand.pinch&&this.grabbedBy===hand.label)this.grabbedBy=null;
    }
    if(this.grabbedBy){const hand=hands[this.grabbedBy.toLowerCase()];if(hand?.visible&&hand.pinch)this.cube.position.lerp(hand.pinchPoint,.18);else this.grabbedBy=null;}
    else this.cube.rotation.y+=dt*.45;
    this.renderer.render(this.scene,this.camera);
  }
}

let landmarker,lastVideoTime=-1,lastDetectAt=0,debugMode=false,frames=0,fps=0,fpsAt=performance.now();
const world=new ThreeWorld(), tracker=new HandTracker(world.camera);
function setNotice(title,detail,error=false){notice.classList.toggle('error',error);notice.classList.remove('hidden');notice.innerHTML=`<strong>${title}</strong><span>${detail}</span>`;}
async function initialize(){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});video.srcObject=stream;await video.play();
    const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    landmarker=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.45,minHandPresenceConfidence:.45,minTrackingConfidence:.45});
    notice.classList.add('hidden');
  }catch(error){setNotice('AR UNAVAILABLE',`${error.message}. Use HTTPS or localhost and allow webcam access.`,true);}
}
document.querySelector('#debug-toggle').onclick=()=>{debugMode=!debugMode;debug.hidden=!debugMode;};
addEventListener('keydown',event=>{if(event.key.toLowerCase()==='d'&&!event.repeat)document.querySelector('#debug-toggle').click();});
let previous=performance.now();
function frame(now){
  const dt=Math.min(.05,(now-previous)/1000);previous=now;
  if(landmarker&&video.readyState>=2&&video.currentTime!==lastVideoTime&&now-lastDetectAt>30){lastDetectAt=now;lastVideoTime=video.currentTime;tracker.update(landmarker.detectForVideo(video,now),now);}
  world.update(tracker,dt); const hands=Object.values(tracker.hands); status.textContent=`HANDS: ${hands.filter(hand=>hand.visible).length} · CUBE: ${world.grabbedBy?'GRABBED':'READY'}`;
  frames++;if(now-fpsAt>600){fps=Math.round(frames*1000/(now-fpsAt));frames=0;fpsAt=now;}
  if(debugMode)debug.textContent=`DEBUG MODE\nRENDER FPS: ${fps}\nHANDS: ${hands.filter(hand=>hand.visible).length}\nLEFT confidence: ${tracker.hands.left.confidence.toFixed(2)}  pinch: ${tracker.hands.left.pinch}\nRIGHT confidence: ${tracker.hands.right.confidence.toFixed(2)}  pinch: ${tracker.hands.right.pinch}\nCUBE: ${world.cube.position.toArray().map(n=>n.toFixed(2)).join(', ')}\nGRABBED BY: ${world.grabbedBy||'none'}`;
  requestAnimationFrame(frame);
}
initialize();requestAnimationFrame(frame);
