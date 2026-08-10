import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";

const video = document.querySelector('#camera');
const canvas = document.querySelector('#overlay');
const ctx = canvas.getContext('2d');
const cameraStatus = document.querySelector('#camera-status');
const visionStatus = document.querySelector('#vision-status');
const handsStatus = document.querySelector('#hands-status');
const linkStatus = document.querySelector('#link-status');
const modeStatus = document.querySelector('#mode-status');
const gestureStatus = document.querySelector('#gesture-status');
const objectStatus = document.querySelector('#object-status');
const velocityStatus = document.querySelector('#velocity-status');
const energyStatus = document.querySelector('#energy-status');
const fpsElement = document.querySelector('#fps');
const notice = document.querySelector('#notice');
const debugButton = document.querySelector('#debug-toggle');
const shieldButton = document.querySelector('#shield-toggle');

const HAND_CONNECTIONS = [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20],[5,9,13,17,0]];
const PANEL_ASPECT = 16 / 9;
const state = {
  left: makeHandState('LEFT', '#ff54c8'),
  right: makeHandState('RIGHT', '#44f5ff'),
  panel: { x: innerWidth / 2, y: innerHeight / 2, width: 250, height: 155, angle: 0, intensity: 0, mode: 'SEARCHING', distance: 0, burst: 0 },
  particles: [], objects: [], shockwaves: [], debug: false, bothPinching: false, detectedHands: [], detectedCount: 0,
  glitchIntensity: .1, powerCooldown: 0, closeHandsAt: 0, previousHandDistance: 0, magicShield: false, shieldPinchLatch: false,
};
let landmarker, lastVideoTime = -1, lastDetectAt = 0;
let lastFrameAt = performance.now(), fpsClock = lastFrameAt, frameCount = 0, detectionClock = lastFrameAt, detectionFrames = 0;

function makeHandState(label, color) {
  return { label, color, points: [], rawPoints: [], palm: null, previousPalm: null, targetPalm: null, velocity: { x: 0, y: 0, speed: 0 }, trail: [], rotation: 0, shieldScale: 0, confidence: 0, gesture: 'NONE', candidateGesture: 'NONE', candidateFrames: 0, previousGesture: 'NONE', pinching: false, pinchFrames: 0, releaseFrames: 0, pinchDistance: 1, rawPinchDistance: 1, visible: false, intensity: 0, lastSeen: 0, anchorLock: null };
}
function setNotice(title, detail, error = false) {
  notice.classList.toggle('error', error); notice.classList.remove('hidden');
  notice.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
}
function hideNotice() { notice.classList.add('hidden'); }
function resize() {
  canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio;
  canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

async function initializeCamera() {
  cameraStatus.textContent = 'REQUESTING';
  setNotice('REQUESTING CAMERA...', 'Please allow webcam access. Footage is processed locally and is never uploaded.');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs localhost or HTTPS. Do not open this page using file://.');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; await video.play(); cameraStatus.textContent = 'ONLINE';
    if (landmarker) hideNotice();
  } catch (error) {
    cameraStatus.textContent = 'UNAVAILABLE';
    const help = error.name === 'NotAllowedError' ? 'Allow camera access in the browser address bar and Windows Camera Privacy settings.' : 'Use VS Code Live Server / localhost, then connect or enable a webcam.';
    setNotice('CAMERA UNAVAILABLE', `${help} (${error.name || 'Error'}: ${error.message})`, true);
  }
}
async function initializeHandTracking() {
  try {
    const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
      // The Tasks Vision Hand Landmarker supports up to two independently detected real hands.
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .4,
    });
    visionStatus.textContent = 'ACTIVE'; if (video.srcObject) hideNotice();
  } catch (error) {
    visionStatus.textContent = 'FAILED';
    setNotice('VISION SYSTEM FAILED', `MediaPipe could not load. Check your internet connection. ${error.message}`, true);
  }
}

// Converts normalized MediaPipe coordinates into the visible, CSS-mirrored object-fit: cover video rectangle.
function canvasPoint(landmark) {
  const videoRatio = video.videoWidth / video.videoHeight || 16 / 9;
  const screenRatio = innerWidth / innerHeight;
  if (videoRatio > screenRatio) {
    const shownWidth = innerHeight * videoRatio;
    return { x: (innerWidth - shownWidth) / 2 + (1 - landmark.x) * shownWidth, y: landmark.y * innerHeight, z: landmark.z * shownWidth };
  }
  const shownHeight = innerWidth / videoRatio;
  return { x: (1 - landmark.x) * innerWidth, y: (innerHeight - shownHeight) / 2 + landmark.y * shownHeight, z: landmark.z * shownHeight };
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function palmCenter(points) {
  return [0, 5, 9, 13, 17].reduce((sum, index) => ({ x: sum.x + points[index].x / 5, y: sum.y + points[index].y / 5, z: sum.z + (points[index].z || 0) / 5 }), { x: 0, y: 0, z: 0 });
}
function detectGesture(points) {
  const wrist = points[0], palmSize = Math.max(distance(wrist, points[9]), 1);
  const extended = [8, 12, 16, 20].filter(i => distance(points[i], wrist) / palmSize > 1.7).length;
  return extended >= 4 ? 'OPEN' : extended <= 1 ? 'FIST' : 'HAND';
}
function classifyHand(classification, fallbackX) {
  const raw = classification?.[0]?.categoryName || classification?.[0]?.displayName || '';
  if (/left/i.test(raw)) return 'left';
  if (/right/i.test(raw)) return 'right';
  // Only used if a classification is unexpectedly absent; this is not array-index based.
  return fallbackX < innerWidth / 2 ? 'left' : 'right';
}
function chooseStableIdentity(modelKey, confidence, points, seen) {
  const nextPalm = palmCenter(points);
  // The MediaPipe label is primary. At low confidence, continuity prevents a brief label flip from swapping hands.
  if (confidence < .72 && state.left.palm && state.right.palm) {
    const nearest = distance(nextPalm, state.left.palm) <= distance(nextPalm, state.right.palm) ? 'left' : 'right';
    if (!seen.has(nearest)) return nearest;
  }
  return seen.has(modelKey) ? (modelKey === 'left' ? 'right' : 'left') : modelKey;
}
function processHands(result, now) {
  const seen = new Set();
  const handedness = result.handednesses || result.handedness || [];
  state.detectedCount = result.landmarks?.length || 0;
  state.detectedHands = [];
  (result.landmarks || []).forEach((landmarks, index) => {
    const points = landmarks.map(canvasPoint);
    // Use MediaPipe's per-result label; never infer left/right from array order.
    const confidence = handedness[index]?.[0]?.score ?? 0;
    let key = chooseStableIdentity(classifyHand(handedness[index], points[8].x), confidence, points, seen);
    seen.add(key);
    const hand = state[key];
    hand.rawPoints = points; hand.targetPalm = palmCenter(points); hand.visible = true; hand.lastSeen = now; hand.confidence = confidence;
    hand.rawPinchDistance = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y, landmarks[4].z - landmarks[8].z);
    hand.pinchDistance = lerp(hand.pinchDistance, hand.rawPinchDistance, .32);
    const wasPinching = hand.pinching;
    if (!hand.pinching && hand.pinchDistance < .055) { hand.pinchFrames++; hand.releaseFrames = 0; if (hand.pinchFrames >= 2) hand.pinching = true; }
    else if (hand.pinching && hand.pinchDistance > .075) { hand.releaseFrames++; hand.pinchFrames = 0; if (hand.releaseFrames >= 2) hand.pinching = false; }
    else { hand.pinchFrames = 0; hand.releaseFrames = 0; }
    const observedGesture = hand.pinching ? 'PINCH' : detectGesture(points);
    if (observedGesture === hand.candidateGesture) hand.candidateFrames++; else { hand.candidateGesture = observedGesture; hand.candidateFrames = 1; }
    hand.previousGesture = hand.gesture;
    if (hand.candidateFrames >= 3) hand.gesture = hand.candidateGesture;
    if (hand.pinching && !wasPinching) beginGrab(hand, points[8]);
    if (!hand.pinching && wasPinching) releaseGrab(hand);
    state.detectedHands.push({ order: index + 1, label: hand.label, index: { ...points[8] } });
  });
  ['left', 'right'].forEach(key => { if (!seen.has(key)) state[key].visible = false; });
}
function smoothHands(dt, now) {
  for (const hand of [state.left, state.right]) {
    const fresh = now - hand.lastSeen < 450;
    const fade = 1 - Math.pow(.003, dt);
    hand.intensity = lerp(hand.intensity, fresh && hand.rawPoints.length ? 1 : 0, fade);
    if (!fresh) hand.pinching = false;
    if (!hand.rawPoints.length) continue;
    if (!hand.points.length) hand.points = hand.rawPoints.map(p => ({ ...p }));
    else hand.points.forEach((p, i) => {
      const target = hand.rawPoints[i], speed = Math.hypot(target.x - p.x, target.y - p.y) / Math.max(dt, .001);
      // Adaptive low-pass: removes tremor at rest while allowing fast deliberate movements through.
      const alpha = clamp(.13 + speed / 1900 * .29, .13, .42);
      p.x = lerp(p.x, target.x, alpha); p.y = lerp(p.y, target.y, alpha); p.z = lerp(p.z || 0, target.z || 0, alpha);
    });
    const rawPalm = palmCenter(hand.points);
    hand.palm = hand.palm ? { x: lerp(hand.palm.x, rawPalm.x, .24), y: lerp(hand.palm.y, rawPalm.y, .24), z: lerp(hand.palm.z || 0, rawPalm.z || 0, .24) } : { ...rawPalm };
    if (hand.previousPalm) {
      hand.velocity.x = (hand.palm.x - hand.previousPalm.x) / Math.max(dt, .001);
      hand.velocity.y = (hand.palm.y - hand.previousPalm.y) / Math.max(dt, .001);
      hand.velocity.speed = Math.hypot(hand.velocity.x, hand.velocity.y);
    }
    hand.previousPalm = { ...hand.palm };
    const rawRotation = Math.atan2(hand.points[9].y - hand.points[0].y, hand.points[9].x - hand.points[0].x);
    hand.rotation = hand.rotation ? lerpAngle(hand.rotation, rawRotation, .22) : rawRotation;
    hand.trail.unshift({ ...hand.palm, life: 1 }); hand.trail = hand.trail.slice(0, 22); hand.trail.forEach(point => point.life -= dt * 2.2);
    hand.trail = hand.trail.filter(point => point.life > 0);
    if (hand.anchorLock) hand.anchorLock = { x: lerp(hand.anchorLock.x, hand.rawPoints[8].x, .035), y: lerp(hand.anchorLock.y, hand.rawPoints[8].y, .035) };
  }
}
function handAnchor(hand) { return hand.anchorLock || hand.points[8]; }
function calculatePanelTransform(dt, now) {
  const left = state.left, right = state.right;
  const active = [left, right].filter(h => h.intensity > .08 && h.points.length);
  const panel = state.panel;
  let target = { x: panel.x, y: panel.y, width: panel.width, height: panel.height, angle: panel.angle, intensity: 0, mode: 'SEARCHING', distance: 0 };
  if (active.length === 2) {
    const a = handAnchor(left), b = handAnchor(right), d = distance(a, b), openBoost = left.gesture === 'OPEN' && right.gesture === 'OPEN' ? 1.12 : 1;
    // Hands are controllers: their midpoint drives the center and their separation drives UNIFORM scale.
    // Keep the hologram inside the two anchors, rather than treating the fingertips as panel corners.
    const width = clamp(d * .72 * openBoost, 145, Math.min(innerWidth * .78, 900));
    let handAxis = Math.atan2(b.y - a.y, b.x - a.x);
    // A panel has an undirected horizontal axis, so 180° is still horizontal rather than an extreme rotation.
    if (handAxis > Math.PI / 2) handAxis -= Math.PI;
    if (handAxis < -Math.PI / 2) handAxis += Math.PI;
    const angle = Math.abs(handAxis) < .12 ? 0 : clamp(handAxis, -.42, .42);
    target = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width, height: width / PANEL_ASPECT, angle, intensity: Math.min(left.intensity, right.intensity), mode: 'TWO HANDS', distance: d };
  } else if (active.length === 1) {
    const hand = active[0], anchor = handAnchor(hand), wrist = hand.points[0], d = distance(anchor, wrist);
    const size = clamp(d * 1.22 * (hand.gesture === 'OPEN' ? 1.2 : hand.gesture === 'FIST' ? .7 : 1), 135, Math.min(innerWidth * .58, 560));
    let handAxis = Math.atan2(anchor.y - wrist.y, anchor.x - wrist.x);
    if (handAxis > Math.PI / 2) handAxis -= Math.PI;
    if (handAxis < -Math.PI / 2) handAxis += Math.PI;
    target = { x: (anchor.x + wrist.x) / 2, y: (anchor.y + wrist.y) / 2, width: size, height: size / PANEL_ASPECT, angle: Math.abs(handAxis) < .14 ? 0 : clamp(handAxis, -.42, .42), intensity: hand.intensity, mode: 'ONE HAND', distance: d };
  }
  const bothPinching = active.length === 2 && left.gesture === 'PINCH' && right.gesture === 'PINCH';
  if (bothPinching && !state.bothPinching) panel.burst = 0;
  state.bothPinching = bothPinching;
  if (active.length === 2 && left.gesture === 'OPEN' && right.gesture === 'OPEN') target.mode = 'DUAL CONTROL';
  if (bothPinching) { target.width *= .87; target.height *= .87; target.mode = 'CONTROL MODE'; }
  const follow = 1 - Math.pow(.004, dt);
  panel.x = lerp(panel.x, target.x, follow); panel.y = lerp(panel.y, target.y, follow);
  panel.width = lerp(panel.width, target.width, follow); panel.height = lerp(panel.height, target.height, follow);
  panel.angle = lerpAngle(panel.angle, target.angle, follow); panel.intensity = lerp(panel.intensity, target.intensity, follow);
  panel.mode = target.mode; panel.distance = target.distance; panel.burst = Math.max(0, panel.burst - dt * 1.85);
}

function emitBurst(x, y, count) {
  for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2, speed = 70 + Math.random() * 280; state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .5 + Math.random() * .7, maxLife: 1, color: i % 2 ? '#ff35c8' : '#37f7ff' }); }
}
function makeObject(x, y, owner) {
  const kinds = ['CUBE', 'RING', 'SPHERE'];
  return { type: kinds[Math.floor(Math.random() * kinds.length)], x, y, vx: 0, vy: 0, angle: 0, rotationVelocity: (Math.random() - .5) * .8, scale: .8, targetScale: .8, opacity: .82, grabbedBy: owner ? [owner] : [], dual: false, idle: 0 };
}
function seedObjects() {
  if (state.objects.length) return;
  const centerX = innerWidth / 2, centerY = innerHeight / 2;
  state.objects.push(
    { ...makeObject(centerX - 120, centerY - 25), type: 'CUBE', scale: .9, targetScale: .9 },
    { ...makeObject(centerX + 105, centerY + 55), type: 'SPHERE', scale: .75, targetScale: .75 },
    { ...makeObject(centerX + 10, centerY - 135), type: 'RING', scale: .65, targetScale: .65 },
  );
}
function beginGrab(hand, point) {
  const candidate = state.objects.filter(item => item.grabbedBy.includes(hand.label) || distance(item, point) < 92).sort((a, b) => distance(a, point) - distance(b, point))[0];
  if (!candidate) return; // A pinch only grabs a real nearby object; it never creates a virtual one.
  if (!candidate.grabbedBy.includes(hand.label)) candidate.grabbedBy.push(hand.label);
  candidate.idle = 0; state.glitchIntensity = Math.max(state.glitchIntensity, .24);
}
function releaseGrab(hand) {
  state.objects.filter(item => item.grabbedBy.includes(hand.label)).forEach(item => { item.grabbedBy = item.grabbedBy.filter(label => label !== hand.label); item.dual = false; if (!item.grabbedBy.length) { item.vx = hand.velocity.x * .42; item.vy = hand.velocity.y * .42; item.rotationVelocity += hand.velocity.speed * .001; item.idle = 1; } });
}
function triggerFist(hand, point, compression) {
  state.shockwaves.push({ x: point.x, y: point.y, radius: compression ? 12 : 4, life: 1, compression }); emitBurst(point.x, point.y, compression ? 16 : 25); state.glitchIntensity = Math.max(state.glitchIntensity, compression ? .8 : 1);
}
function updateObjects(dt) {
  const left = state.left, right = state.right;
  state.objects.forEach(item => { item.grabbedBy = item.grabbedBy.filter(label => { const hand = label === 'LEFT' ? left : right; return hand.pinching && hand.intensity > .1; }); });
  let dualObject = state.objects.find(item => item.grabbedBy.includes(left.label) && item.grabbedBy.includes(right.label));
  if (dualObject) {
    const a = handAnchor(left), b = handAnchor(right), d = distance(a, b); dualObject.dual = true; dualObject.owner = 'DUAL'; dualObject.x = lerp(dualObject.x, (a.x + b.x) / 2, .3); dualObject.y = lerp(dualObject.y, (a.y + b.y) / 2, .3); dualObject.targetScale = clamp(d / 180, .35, 2.8); dualObject.angle = lerpAngle(dualObject.angle, Math.atan2(b.y - a.y, b.x - a.x), .2);
  }
  state.objects.forEach(item => {
    const grabber = item.grabbedBy.length === 1 ? (item.grabbedBy[0] === 'LEFT' ? left : right) : null;
    if (grabber && (!grabber.pinching || grabber.intensity < .1)) item.grabbedBy = [];
    if (grabber?.pinching) { const p = handAnchor(grabber); item.x = lerp(item.x, p.x, .28); item.y = lerp(item.y, p.y, .28); item.vx = grabber.velocity.x * .14; item.vy = grabber.velocity.y * .14; item.targetScale = .92; }
    else if (!item.grabbedBy.length) { item.x += item.vx * dt; item.y += item.vy * dt; item.vx *= .983; item.vy *= .983; item.idle -= dt; item.targetScale = .8; }
    item.scale = lerp(item.scale, item.targetScale, .1); item.angle += item.rotationVelocity * dt; item.opacity = lerp(item.opacity, item.grabbedBy.length ? 1 : .78, .08);
  });
  state.objects = state.objects.slice(-6);
}
function drawHolographicObject(item) {
  const size = 42 * item.scale; ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.angle); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = item.opacity * .8; ctx.strokeStyle = '#b9ffff'; ctx.fillStyle = '#39e8ff'; ctx.shadowBlur = item.grabbedBy.length ? 23 : 12; ctx.shadowColor = '#00efff'; ctx.lineWidth = 1.4;
  if (item.type === 'CUBE') drawCube(size); else if (item.type === 'RING') drawRing(size); else drawSphere(size);
  ctx.restore();
}
function drawCube(size) { ctx.strokeRect(-size/2,-size/2,size,size); ctx.strokeRect(-size/2+size*.22,-size/2-size*.22,size,size); [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([x,y])=>{ctx.beginPath();ctx.moveTo(x*size/2,y*size/2);ctx.lineTo(x*size/2+size*.22,y*size/2-size*.22);ctx.stroke();}); }
function drawRing(size) { ctx.beginPath();ctx.ellipse(0,0,size,size*.34,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(0,0,size*.65,size*.23,Math.PI/2,0,Math.PI*2);ctx.stroke(); }
function drawSphere(size) { ctx.beginPath();ctx.arc(0,0,size*.65,0,Math.PI*2);ctx.stroke();[-.5,0,.5].forEach(n=>{ctx.beginPath();ctx.ellipse(0,n*size*.34,size*.65,size*.18,0,0,Math.PI*2);ctx.stroke();}); }
function renderGrabTethers() {
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = '#7ffff4'; ctx.lineWidth = 1; ctx.globalAlpha = .42;
  state.objects.forEach(item => item.grabbedBy.forEach(label => { const hand = label === 'LEFT' ? state.left : state.right; if (!hand.points.length) return; const p = hand.points[8]; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(item.x,item.y); ctx.stroke(); })); ctx.restore();
}
function setMagicShield(enabled) {
  state.magicShield = enabled; shieldButton.classList.toggle('active', enabled); shieldButton.setAttribute('aria-pressed', String(enabled)); shieldButton.querySelector('span').textContent = enabled ? 'ON' : 'OFF';
}
function updateShieldButton() {
  const rect = shieldButton.getBoundingClientRect();
  let hovering = false, pinching = false, anyPinching = false;
  for (const hand of [state.left, state.right]) {
    if (hand.intensity < .15 || !hand.points.length) continue;
    anyPinching ||= hand.pinching;
    const index = hand.points[8];
    if (index.x >= rect.left && index.x <= rect.right && index.y >= rect.top && index.y <= rect.bottom) { hovering = true; if (hand.pinching) pinching = true; }
  }
  shieldButton.classList.toggle('hand-hover', hovering);
  if (hovering && pinching && !state.shieldPinchLatch) { setMagicShield(!state.magicShield); state.shieldPinchLatch = true; }
  if (!anyPinching) state.shieldPinchLatch = false;
}
function renderMagicShield(hand, now) {
  if (!state.magicShield || hand.intensity < .08 || !hand.palm || !hand.points.length) return;
  const handSize = distance(hand.points[0], hand.points[9]);
  hand.shieldScale = lerp(hand.shieldScale || handSize * 1.45, clamp(handSize * 1.48, 42, 125), .16);
  const r = hand.shieldScale, spin = now * .0011;
  ctx.save(); ctx.translate(hand.palm.x, hand.palm.y); ctx.rotate(hand.rotation); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = hand.intensity * .74; ctx.strokeStyle = '#ffbf58'; ctx.shadowColor = '#ff9c32'; ctx.shadowBlur = 15; ctx.lineWidth = 1.15;
  // Transparent-center procedural ward: only strokes, gaps, and small radial marks are drawn.
  [1, .78, .54].forEach((scale, index) => { ctx.save(); ctx.rotate((index % 2 ? -1 : 1) * spin * (index + 1)); ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI * 2 / 12; ctx.moveTo(Math.cos(a) * r * scale, Math.sin(a) * r * scale); ctx.arc(0, 0, r * scale, a + .06, a + .38, false); } ctx.stroke(); ctx.restore(); });
  ctx.shadowBlur = 6; for (let i = 0; i < 10; i++) { const a = i * Math.PI * 2 / 10 + spin * .35, inner = r * .58, outer = r * .94; ctx.beginPath(); ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); ctx.stroke(); ctx.beginPath(); ctx.arc(Math.cos(a) * r * .94, Math.sin(a) * r * .94, 1.6, 0, Math.PI * 2); ctx.fillStyle = '#ffe4a0'; ctx.fill(); }
  ctx.globalAlpha = hand.intensity * .45; for (let i = 0; i < 7; i++) { const a = spin * 2 + i * .9; ctx.fillStyle = '#ffcb72'; ctx.beginPath(); ctx.arc(Math.cos(a) * r * .68, Math.sin(a) * r * .68, 1.2, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
}
function renderEnergyConnection(now) {
  const { left, right } = state;
  const sharedObject = state.objects.find(item => item.grabbedBy.includes(left.label) && item.grabbedBy.includes(right.label));
  if (!sharedObject) return;
  const a = handAnchor(left), b = handAnchor(right); ctx.save(); ctx.globalCompositeOperation = 'screen';
  const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y); gradient.addColorStop(0, left.color); gradient.addColorStop(.5, '#edfff9'); gradient.addColorStop(1, right.color);
  ctx.strokeStyle = gradient; ctx.globalAlpha = .75 + state.panel.burst * .25; ctx.shadowBlur = 15 + state.panel.burst * 20; ctx.shadowColor = '#22ecff'; ctx.lineWidth = 1.1 + clamp((distance(a, b) - 90) / 220, 0, 3.2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  for (let i = 0; i < 10; i++) { const t = (i / 10 + now * .00022) % 1; ctx.fillStyle = i % 2 ? '#ff4dd1' : '#5bffff'; ctx.beginPath(); ctx.arc(lerp(a.x,b.x,t), lerp(a.y,b.y,t), 1.2 + state.panel.burst * 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function renderDualField(now) {
  if (state.panel.mode !== 'DUAL CONTROL') return;
  const p=state.panel, r=Math.max(70,p.distance*.34); ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.angle+now*.0004); ctx.globalCompositeOperation='screen'; ctx.strokeStyle='#8affff'; ctx.globalAlpha=.26; ctx.lineWidth=1; [1,.7,.42].forEach((factor,index)=>{ctx.beginPath();ctx.arc(0,0,r*factor,index,Math.PI*2-index*.55);ctx.stroke();}); for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.76,Math.sin(a)*r*.76);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke();}ctx.restore();
}
function renderHandSkeleton(hand) {
  if (hand.intensity < .025 || !hand.points.length) return;
  ctx.save(); ctx.globalAlpha = hand.intensity * .45; ctx.strokeStyle = hand.color; ctx.fillStyle = hand.color; ctx.lineWidth = 1;
  if (state.debug) {
    ctx.strokeStyle = hand.color; HAND_CONNECTIONS.forEach(chain => { ctx.beginPath(); chain.forEach((id, i) => i ? ctx.lineTo(hand.points[id].x, hand.points[id].y) : ctx.moveTo(hand.points[id].x, hand.points[id].y)); ctx.stroke(); }); hand.points.forEach((p, id) => { ctx.globalAlpha = hand.intensity * .55; ctx.beginPath(); ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#ff6edb'; hand.rawPoints.forEach(p => { ctx.globalAlpha = .32; ctx.beginPath(); ctx.arc(p.x, p.y, 1, 0, Math.PI * 2); ctx.fill(); });
  }
  [4, 8].forEach(id => { const p = hand.points[id]; ctx.globalAlpha = hand.intensity * .8; ctx.beginPath(); ctx.arc(p.x, p.y, id === 8 ? 4 : 3, 0, Math.PI * 2); ctx.fill(); });
  if (state.debug) { ctx.globalAlpha = .9; ctx.font = '10px "Share Tech Mono", monospace'; hand.points.forEach((p, id) => ctx.fillText(id, p.x + 5, p.y - 5)); ctx.fillText(`${hand.label} ${hand.gesture}`, hand.points[8].x + 10, hand.points[8].y + 18); }
  ctx.restore();
}
function renderHandTrail(hand) {
  if (hand.intensity < .05 || hand.trail.length < 2) return;
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = hand.color; ctx.lineWidth = 2; ctx.beginPath(); hand.trail.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.globalAlpha = Math.min(.55, hand.velocity.speed / 1000 + .12); ctx.stroke(); ctx.restore();
}
function renderPalmInterface(hand, now) {
  if (hand.gesture !== 'OPEN' || hand.intensity < .1 || !hand.palm) return;
  const r = 35 + Math.sin(now*.004)*4; ctx.save(); ctx.translate(hand.palm.x, hand.palm.y); ctx.rotate(hand.rotation); ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = hand.color; ctx.globalAlpha = hand.intensity*.72; ctx.lineWidth = 1;
  [r, r*.67, r*.38].forEach((radius, i) => { ctx.beginPath(); ctx.arc(0,0,radius,i,Math.PI*2-i*.7); ctx.stroke(); }); for(let i=0;i<8;i++) { const a=i*Math.PI/4; ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*.78,Math.sin(a)*r*.78); ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); ctx.stroke(); } ctx.font='9px "Share Tech Mono", monospace'; ctx.fillStyle=hand.color; ctx.fillText('PALM CORE',-24,3); ctx.restore();
}
function emitFingerParticles(hand, dt) {
  if (hand.intensity < .1 || hand.velocity.speed < 250 || state.particles.length > 240) return;
  const count = hand.velocity.speed > 900 ? 3 : 1;
  [4,8,12].forEach(id => { for (let i=0;i<count;i++) { const p=hand.points[id], a=Math.random()*Math.PI*2, speed=20+Math.random()*90; state.particles.push({ x:p.x,y:p.y,vx:Math.cos(a)*speed+hand.velocity.x*.07,vy:Math.sin(a)*speed+hand.velocity.y*.07,life:.3+Math.random()*.45,maxLife:.75,color:hand.color }); } });
}
function renderShockwaves(dt) {
  ctx.save(); ctx.globalCompositeOperation='screen'; state.shockwaves = state.shockwaves.filter(w => { w.life-=dt; if(w.life<=0)return false; w.radius+=dt*(w.compression?180:250); ctx.globalAlpha=w.life*.7; ctx.strokeStyle=w.compression?'#ff42cb':'#52ffff'; ctx.lineWidth=1+w.life*3; ctx.beginPath(); ctx.arc(w.x,w.y,w.radius,0,Math.PI*2); ctx.stroke(); return true; }); ctx.restore();
}
function detectPowerMove(now) {
  const left=state.left,right=state.right; if (left.intensity<.3 || right.intensity<.3) return;
  const d=distance(handAnchor(left),handAnchor(right)), combined=left.velocity.speed+right.velocity.speed;
  if(d<130) state.closeHandsAt=now;
  if(state.closeHandsAt && now-state.closeHandsAt<800 && d>300 && combined>1250 && now>state.powerCooldown) { state.powerCooldown=now+2000; state.closeHandsAt=0; state.glitchIntensity=1; emitBurst(state.panel.x,state.panel.y,75); state.shockwaves.push({x:state.panel.x,y:state.panel.y,radius:15,life:1.2,compression:false}); state.objects.forEach(item=>{item.owner=null;item.vx+=(Math.random()-.5)*500;item.vy+=(Math.random()-.5)*500;}); }
}
function renderRGBPanel(now) {
  const p = state.panel; if (p.intensity < .015) return;
  const burst = p.burst + state.glitchIntensity * .22, distortion = burst * 34 + (state.left.gesture === 'FIST' || state.right.gesture === 'FIST' ? 12 : 0);
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.globalCompositeOperation = 'screen';
  const layers = [['#ff2638', -9, 2], ['#00f4ff', 9, -2], ['#e63dff', 2, -7], ['#285cff', 4, 7], ['#62ff62', -3, 4], ['#ffe641', 0, 0]];
  layers.forEach(([color, ox, oy], index) => { const flutter = Math.sin(now * .008 + index) * (1 + burst * 3); ctx.globalAlpha = p.intensity * (.035 + index * .01); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 18 + burst * 30; ctx.fillRect(-p.width / 2 + ox + flutter, -p.height / 2 + oy, p.width, p.height); });
  ctx.shadowBlur = 0; ctx.globalAlpha = p.intensity * .26; ctx.fillStyle = '#071127'; ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
  ctx.globalAlpha = p.intensity * .3; for (let y = -p.height / 2; y < p.height / 2; y += 5) { ctx.fillStyle = y % 10 ? '#00040c' : '#9dfdff'; ctx.fillRect(-p.width / 2, y, p.width, 1); }
  const tears = 5 + Math.floor(burst * 13); for (let i = 0; i < tears; i++) { const y = -p.height / 2 + Math.random() * p.height, h = 1 + Math.random() * 9, shift = (Math.random() - .5) * (18 + distortion); ctx.globalAlpha = p.intensity * (.08 + Math.random() * .16); ctx.fillStyle = i % 2 ? '#00efff' : '#ff26c9'; ctx.fillRect(-p.width / 2 + shift, y, p.width, h); }
  for (let i = 0; i < 11; i++) { ctx.globalAlpha = p.intensity * .25; ctx.fillStyle = i % 2 ? '#ff45ce' : '#46fff4'; ctx.fillRect(-p.width * .42 + Math.random() * p.width * .84, -p.height * .4 + Math.random() * p.height * .8, 3 + Math.random() * 20, 1 + Math.random() * 4); }
  ctx.globalAlpha = p.intensity; ctx.shadowBlur = 18; ctx.shadowColor = '#42ffff'; ctx.strokeStyle = '#d8ffff'; ctx.lineWidth = 1.2; ctx.strokeRect(-p.width / 2, -p.height / 2, p.width, p.height); ctx.shadowBlur = 0;
  // Canvas HUD content stays physically attached to the panel's position, scale, and rotation.
  const fontSize = Math.max(8, Math.min(14, p.width / 22)); ctx.fillStyle = '#d5ffff'; ctx.font = `${fontSize}px "Share Tech Mono", monospace`; ctx.globalAlpha = p.intensity * .9;
  const link = state.detectedCount >= 2 ? 'DUAL' : state.detectedCount === 1 ? 'SINGLE' : 'NONE';
  ctx.fillText('VISION OBJECT // HOLOGRAM', -p.width * .4, -p.height * .28); ctx.fillText(`HAND LINK: ${link}`, -p.width * .4, -p.height * .08); ctx.fillText(`DISTANCE: ${Math.round(p.distance)} PX`, -p.width * .4, p.height * .12); ctx.fillText(`ROTATION: ${Math.round((p.angle * 180 / Math.PI + 360) % 360)} DEG`, -p.width * .4, p.height * .27);
  ctx.strokeStyle = '#81fff0'; ctx.globalAlpha = p.intensity * .65; ctx.beginPath(); ctx.moveTo(-p.width * .4, p.height * .37); ctx.lineTo(p.width * .4, p.height * .37); ctx.moveTo(-p.width * .4, -p.height * .35); ctx.lineTo(-p.width * .4, p.height * .37); ctx.stroke(); ctx.restore();
}
function updateParticles(dt) {
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  state.particles = state.particles.filter(p => { p.life -= dt; if (p.life <= 0) return false; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .978; p.vy = p.vy * .978 + 8 * dt; ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 + p.life * 2, 0, Math.PI * 2); ctx.fill(); return true; }).slice(-320); ctx.restore();
}
function updateHUD() {
  const visible = [state.left, state.right].filter(hand => hand.intensity > .12).length;
  const link = state.detectedCount >= 2 ? 'DUAL' : state.detectedCount === 1 ? 'SINGLE' : 'NONE';
  const grabbed = state.objects.filter(item => item.grabbedBy.length);
  handsStatus.textContent = `${state.detectedCount} / 2`; linkStatus.textContent = link; modeStatus.textContent = grabbed.some(item => item.grabbedBy.length === 2) ? 'DUAL OBJECT' : grabbed.length ? 'OBJECT' : 'NORMAL';
  const gestures = [state.left, state.right].filter(h => h.intensity > .12).map(h => `${h.label[0]}:${h.gesture}`).join(' ') || 'NONE'; gestureStatus.textContent = gestures;
  const activeObject = state.objects.at(-1); objectStatus.textContent = activeObject?.type || 'NONE';
  const velocity = Math.max(state.left.velocity.speed, state.right.velocity.speed); velocityStatus.textContent = `${Math.round(velocity)} PX/S`;
  energyStatus.textContent = `${Math.round(clamp((state.panel.distance / 450) * 100 + state.glitchIntensity * 18, 0, 100))}%`;
}
function renderDebugReadout() {
  if (!state.debug) return;
  const p = state.panel, lines = [
    'DEBUG // TWO-HAND TRANSFORM',
    `DETECTED HANDS: ${state.detectedCount}`,
    `RENDER FPS: ${fpsElement.textContent}  DETECT FPS: ${state.detectionFps || 0}`,
    `PANEL: ${Math.round(p.width)} x ${Math.round(p.height)} PX`,
    `ROTATION: ${Math.round((p.angle * 180 / Math.PI + 360) % 360)} DEG`,
    `DISTANCE: ${Math.round(p.distance)} PX`,
    `OBJECTS: ${state.objects.length}  PARTICLES: ${state.particles.length}`,
  ];
  state.detectedHands.forEach(hand => lines.push(`HAND ${hand.order}: ${hand.label}`));
  for (const hand of [state.left, state.right]) {
    if (hand.points.length && hand.intensity > .06) lines.push(`${hand.label} PALM: ${Math.round(hand.palm.x)},${Math.round(hand.palm.y)} V:${Math.round(hand.velocity.speed)} C:${hand.confidence.toFixed(2)}`, `${hand.label} PINCH: ${hand.pinchDistance.toFixed(3)} INDEX: ${Math.round(hand.points[8].x)},${Math.round(hand.points[8].y)}`);
  }
  ctx.save(); ctx.fillStyle = '#affff8'; ctx.globalAlpha = .9; ctx.font = '11px "Share Tech Mono", monospace';
  const width = 255, x = innerWidth - width - 22, y = 26;
  ctx.fillStyle = 'rgba(2, 8, 20, .7)'; ctx.fillRect(x - 10, y - 15, width + 20, lines.length * 16 + 18);
  ctx.strokeStyle = 'rgba(81, 255, 238, .45)'; ctx.strokeRect(x - 10, y - 15, width + 20, lines.length * 16 + 18);
  ctx.fillStyle = '#affff8'; lines.forEach((line, i) => ctx.fillText(line, x, y + i * 16)); ctx.restore();
}
function render(now) {
  const dt = Math.min(.08, (now - lastFrameAt) / 1000); lastFrameAt = now; ctx.clearRect(0, 0, innerWidth, innerHeight);
  smoothHands(dt, now); calculatePanelTransform(dt, now); updateObjects(dt);
  const motion = Math.max(state.left.velocity.speed, state.right.velocity.speed); state.glitchIntensity = lerp(state.glitchIntensity, clamp(.1 + motion / 4000 + (state.bothPinching ? .35 : 0), .1, .85), .06);
  updateShieldButton(); renderEnergyConnection(now); state.objects.forEach(drawHolographicObject); renderGrabTethers(); renderMagicShield(state.left, now); renderMagicShield(state.right, now); renderHandSkeleton(state.left); renderHandSkeleton(state.right); updateParticles(dt); updateHUD(); renderDebugReadout();
  frameCount++; if (now - fpsClock > 700) { fpsElement.textContent = String(Math.round(frameCount * 1000 / (now - fpsClock))); fpsClock = now; frameCount = 0; }
}
function loop(now) {
  if (landmarker && video.readyState >= 2 && now - lastDetectAt > 30 && video.currentTime !== lastVideoTime) {
    lastDetectAt = now; lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    // Temporary diagnostic: confirms MediaPipe is returning 0, 1, or 2 real detections.
    if (state.debug) console.log("Detected hands:", result.landmarks.length);
    processHands(result, now);
    detectionFrames++; if (now - detectionClock > 700) { state.detectionFps = Math.round(detectionFrames * 1000 / (now - detectionClock)); detectionClock = now; detectionFrames = 0; }
  }
  render(now); requestAnimationFrame(loop);
}
function toggleDebug() { state.debug = !state.debug; debugButton.textContent = `DEBUG: ${state.debug ? 'ON' : 'OFF'} [D]`; }
debugButton.addEventListener('click', toggleDebug);
shieldButton.addEventListener('click', () => setMagicShield(!state.magicShield));
addEventListener('keydown', event => { if (event.key.toLowerCase() === 'd' && !event.repeat) toggleDebug(); });
addEventListener('resize', resize);

resize();
seedObjects();
await Promise.all([initializeCamera(), initializeHandTracking()]);
if (video.srcObject && landmarker) hideNotice();
requestAnimationFrame(loop);
