import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";

const video = document.querySelector('#camera');
const canvas = document.querySelector('#overlay');
const ctx = canvas.getContext('2d');
const cameraStatus = document.querySelector('#camera-status');
const visionStatus = document.querySelector('#vision-status');
const handStatus = document.querySelector('#hand-status');
const fpsElement = document.querySelector('#fps');
const notice = document.querySelector('#notice');
const debugButton = document.querySelector('#debug-toggle');

let landmarker, lastVideoTime = -1, lastDetectAt = 0, debugMode = false, visiblePoints = [];
let lastFrameAt = performance.now(), fpsClock = lastFrameAt, frameCount = 0;
const target = { x: innerWidth / 2, y: innerHeight / 2, angle: 0, scale: 1, intensity: 0, gesture: 'NONE' };
const smooth = { ...target };
const mouse = { x: innerWidth / 2, y: innerHeight / 2, active: false };

function setNotice(title, detail, error = false) {
  notice.classList.toggle('error', error); notice.classList.remove('hidden');
  notice.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
}
function hideNotice() { notice.classList.add('hidden'); }
function resize() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); }

async function startCamera() {
  cameraStatus.textContent = 'REQUESTING';
  setNotice('REQUESTING CAMERA...', 'Please allow webcam access. Footage never leaves your device.');
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is only available on HTTPS or localhost. Open this project using VS Code Live Server, not by double-clicking index.html.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    cameraStatus.textContent = 'ONLINE';
    if (landmarker) hideNotice();
  } catch (error) {
    cameraStatus.textContent = 'UNAVAILABLE';
    const guidance = error.name === 'NotAllowedError'
      ? 'Allow camera access in your browser address bar and Windows Settings > Privacy & security > Camera.'
      : error.name === 'NotFoundError'
        ? 'No usable camera was found. Connect or enable a webcam, then reload.'
        : 'Open this project through localhost (for example VS Code Live Server), not a file:// URL.';
    setNotice('CAMERA UNAVAILABLE', `${guidance} (${error.name || 'Error'}: ${error.message})`, true);
  }
}

async function initializeVision() {
  try {
    const resolver = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    landmarker = await HandLandmarker.createFromOptions(resolver, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .5, minTrackingConfidence: .5
    });
    visionStatus.textContent = 'ACTIVE';
  } catch (error) {
    visionStatus.textContent = 'FAILED';
    setNotice('VISION SYSTEM FAILED', `MediaPipe could not load. Check your internet connection and serve this project via localhost. ${error.message}`, true);
  }
}

function canvasPoint(landmark) {
  // Video is CSS-mirrored, so reverse x here to keep canvas effects aligned.
  const videoRatio = video.videoWidth / video.videoHeight || 1;
  const screenRatio = innerWidth / innerHeight;
  let x, y;
  if (videoRatio > screenRatio) { const displayedWidth = innerHeight * videoRatio; x = (innerWidth - displayedWidth) / 2 + (1 - landmark.x) * displayedWidth; y = landmark.y * innerHeight; }
  else { const displayedHeight = innerWidth / videoRatio; x = (1 - landmark.x) * innerWidth; y = (innerHeight - displayedHeight) / 2 + landmark.y * displayedHeight; }
  return { x, y };
}
function detectGesture(points) {
  const wrist = points[0], index = points[8], thumb = points[4];
  const palm = Math.hypot(points[5].x - wrist.x, points[5].y - wrist.y) || .001;
  const pinch = Math.hypot(index.x - thumb.x, index.y - thumb.y) / palm < .46;
  const extended = [8, 12, 16, 20].filter(i => Math.hypot(points[i].x - wrist.x, points[i].y - wrist.y) / palm > 1.65).length;
  return pinch ? 'PINCH' : extended >= 4 ? 'OPEN PALM' : extended <= 1 ? 'FIST' : 'HAND';
}
function updateHand(landmarks) {
  if (!landmarks?.length) { target.intensity = 0; target.gesture = 'NONE'; visiblePoints = []; handStatus.textContent = 'SEARCHING'; return; }
  const points = landmarks[0].map(canvasPoint); const wrist = points[0], index = points[8];
  const dx = index.x - wrist.x, dy = index.y - wrist.y;
  target.x = (index.x + wrist.x) / 2; target.y = (index.y + wrist.y) / 2;
  target.angle = Math.atan2(dy, dx); target.scale = Math.min(2.2, Math.max(.55, Math.hypot(dx, dy) / 180));
  target.gesture = detectGesture(points); target.intensity = 1;
  if (target.gesture === 'OPEN PALM') target.scale *= 1.42;
  if (target.gesture === 'FIST') target.scale *= .63;
  handStatus.textContent = target.gesture === 'HAND' ? 'TRACKING' : target.gesture;
  visiblePoints = points;
}
function drawLandmarks(points) {
  ctx.save(); ctx.fillStyle = 'rgba(107,255,235,.72)'; ctx.strokeStyle = 'rgba(107,255,235,.25)'; ctx.lineWidth = 1;
  const chains = [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20],[5,9,13,17,0]];
  chains.forEach(chain => { ctx.beginPath(); chain.forEach((n,i) => i ? ctx.lineTo(points[n].x, points[n].y) : ctx.moveTo(points[n].x, points[n].y)); ctx.stroke(); });
  points.forEach(p => { ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill(); }); ctx.restore();
}
function lerp(a,b,t) { return a + (b-a)*t; }
function renderPanel(now) {
  const dt = Math.min(.1, (now-lastFrameAt)/1000); lastFrameAt = now; ctx.clearRect(0,0,innerWidth,innerHeight);
  const follow = 1 - Math.pow(.001, dt);
  ['x','y','angle','scale','intensity'].forEach(k => smooth[k] = lerp(smooth[k], target[k], follow));
  if (visiblePoints.length && !debugMode) drawLandmarks(visiblePoints);
  if (smooth.intensity > .012) {
    const { x,y,angle,scale,intensity } = smooth, w = 330 * scale, h = 195 * scale;
    const pinchBoost = target.gesture === 'PINCH' ? 1.5 : 1;
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.globalAlpha = intensity * .8;
    ctx.globalCompositeOperation = 'screen'; ctx.shadowBlur = 30 * pinchBoost; ctx.shadowColor = '#ff27c6';
    const layers = [['#ff21c8', -10, 4], ['#00efff', 10, -4], ['#2455ff', 4, 8], ['#77ff21', -4, -7], ['#ffe83b', 1, 0]];
    layers.forEach(([color,ox,oy], i) => { ctx.fillStyle = color; ctx.globalAlpha = intensity * (.12 + i*.018) * pinchBoost; ctx.fillRect(-w/2+ox*scale, -h/2+oy*scale, w, h); });
    ctx.globalAlpha = intensity * .75; ctx.strokeStyle = '#d9ffff'; ctx.lineWidth = 1.5; ctx.strokeRect(-w/2, -h/2, w, h);
    ctx.shadowBlur = 0; ctx.globalAlpha = intensity * .22;
    for (let yy=-h/2; yy<h/2; yy+=5) { ctx.fillStyle = yy % 10 ? '#071035' : '#fff'; ctx.fillRect(-w/2, yy, w, 1.2); }
    const slices = target.gesture === 'PINCH' ? 9 : 4;
    for (let i=0;i<slices;i++) { const sy = -h/2 + Math.random()*h; const sh = 2 + Math.random()*13; const shift = (Math.random()-.5) * (target.gesture === 'PINCH' ? 65 : 25); ctx.fillStyle = i % 2 ? '#00efff' : '#ff21c8'; ctx.globalAlpha = intensity * (.08 + Math.random()*.13) * pinchBoost; ctx.fillRect(-w/2 + shift, sy, w, sh); }
    ctx.restore();
  }
  frameCount++; if (now-fpsClock > 700) { fpsElement.textContent = String(Math.round(frameCount * 1000 / (now-fpsClock))); fpsClock=now; frameCount=0; }
}
function loop(now) {
  if (debugMode && mouse.active) { target.x=mouse.x; target.y=mouse.y; target.angle=Math.sin(now*.001)*.22; target.scale=1; target.intensity=1; target.gesture='DEBUG'; handStatus.textContent='DEBUG'; }
  else if (landmarker && video.readyState >= 2 && now-lastDetectAt > 30 && video.currentTime !== lastVideoTime) {
    lastDetectAt = now; lastVideoTime = video.currentTime; const result = landmarker.detectForVideo(video, now); updateHand(result.landmarks);
  }
  renderPanel(now); requestAnimationFrame(loop);
}
debugButton.addEventListener('click', () => { debugMode = !debugMode; debugButton.textContent = `DEBUG MOUSE: ${debugMode ? 'ON' : 'OFF'}`; if (!debugMode) { mouse.active=false; target.intensity=0; } });
addEventListener('pointermove', e => { if (debugMode) { mouse.x=e.clientX; mouse.y=e.clientY; mouse.active=true; } });
addEventListener('resize', resize);

resize();
// Camera permission should never wait on the (potentially slower) model download.
const cameraPromise = startCamera();
const visionPromise = initializeVision();
await Promise.all([cameraPromise, visionPromise]);
if (video.srcObject && landmarker) hideNotice();
requestAnimationFrame(loop);
