import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";

const video = document.querySelector('#camera');
const canvas = document.querySelector('#overlay');
const ctx = canvas.getContext('2d');
const cameraStatus = document.querySelector('#camera-status');
const visionStatus = document.querySelector('#vision-status');
const handsStatus = document.querySelector('#hands-status');
const modeStatus = document.querySelector('#mode-status');
const gestureStatus = document.querySelector('#gesture-status');
const fpsElement = document.querySelector('#fps');
const notice = document.querySelector('#notice');
const debugButton = document.querySelector('#debug-toggle');

const HAND_CONNECTIONS = [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20],[5,9,13,17,0]];
const PANEL_ASPECT = 16 / 9;
const state = {
  left: makeHandState('LEFT', '#ff54c8'),
  right: makeHandState('RIGHT', '#44f5ff'),
  panel: { x: innerWidth / 2, y: innerHeight / 2, width: 250, height: 155, angle: 0, intensity: 0, mode: 'SEARCHING', distance: 0, burst: 0 },
  particles: [], debug: false, bothPinching: false,
};
let landmarker, lastVideoTime = -1, lastDetectAt = 0;
let lastFrameAt = performance.now(), fpsClock = lastFrameAt, frameCount = 0;

function makeHandState(label, color) {
  return { label, color, points: [], targetPoints: [], palm: null, targetPalm: null, gesture: 'NONE', previousGesture: 'NONE', visible: false, intensity: 0, lastSeen: 0, anchorLock: null };
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
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .5, minTrackingConfidence: .5,
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
    return { x: (innerWidth - shownWidth) / 2 + (1 - landmark.x) * shownWidth, y: landmark.y * innerHeight };
  }
  const shownHeight = innerWidth / videoRatio;
  return { x: (1 - landmark.x) * innerWidth, y: (innerHeight - shownHeight) / 2 + landmark.y * shownHeight };
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function palmCenter(points) {
  return [0, 5, 9, 13, 17].reduce((sum, index) => ({ x: sum.x + points[index].x / 5, y: sum.y + points[index].y / 5 }), { x: 0, y: 0 });
}
function detectGesture(points) {
  const wrist = points[0], palmSize = Math.max(distance(wrist, points[9]), 1);
  if (distance(points[4], points[8]) / palmSize < .52) return 'PINCH';
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
function processHands(result, now) {
  const seen = new Set();
  (result.landmarks || []).forEach((landmarks, index) => {
    const points = landmarks.map(canvasPoint);
    let key = classifyHand(result.handedness?.[index], points[8].x);
    // Avoid overwriting one physical hand if MediaPipe momentarily reports duplicate handedness.
    if (seen.has(key)) key = key === 'left' ? 'right' : 'left';
    seen.add(key);
    const hand = state[key];
    hand.targetPoints = points; hand.targetPalm = palmCenter(points); hand.visible = true; hand.lastSeen = now;
    hand.previousGesture = hand.gesture; hand.gesture = detectGesture(points);
    if (hand.gesture === 'PINCH' && hand.previousGesture !== 'PINCH') hand.anchorLock = { ...points[8] };
    if (hand.gesture !== 'PINCH') hand.anchorLock = null;
  });
  ['left', 'right'].forEach(key => { if (!seen.has(key)) state[key].visible = false; });
}
function smoothHands(dt, now) {
  const follow = 1 - Math.pow(.003, dt);
  for (const hand of [state.left, state.right]) {
    const fresh = now - hand.lastSeen < 450;
    hand.intensity = lerp(hand.intensity, fresh && hand.targetPoints.length ? 1 : 0, follow);
    if (!hand.targetPoints.length) continue;
    if (!hand.points.length) hand.points = hand.targetPoints.map(p => ({ ...p }));
    else hand.points.forEach((p, i) => { p.x = lerp(p.x, hand.targetPoints[i].x, follow); p.y = lerp(p.y, hand.targetPoints[i].y, follow); });
    hand.palm = hand.palm ? { x: lerp(hand.palm.x, hand.targetPalm.x, follow), y: lerp(hand.palm.y, hand.targetPalm.y, follow) } : { ...hand.targetPalm };
    if (hand.anchorLock) hand.anchorLock = { x: lerp(hand.anchorLock.x, hand.targetPoints[8].x, .035), y: lerp(hand.anchorLock.y, hand.targetPoints[8].y, .035) };
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
  if (bothPinching && !state.bothPinching) { panel.burst = 1; emitBurst(panel.x, panel.y, 44); }
  state.bothPinching = bothPinching;
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
function renderEnergyConnection(now) {
  const { left, right } = state;
  if (state.panel.mode !== 'TWO HANDS' && state.panel.mode !== 'CONTROL MODE') return;
  const a = handAnchor(left), b = handAnchor(right); ctx.save(); ctx.globalCompositeOperation = 'screen';
  const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y); gradient.addColorStop(0, left.color); gradient.addColorStop(.5, '#edfff9'); gradient.addColorStop(1, right.color);
  ctx.strokeStyle = gradient; ctx.globalAlpha = .75 + state.panel.burst * .25; ctx.shadowBlur = 15 + state.panel.burst * 20; ctx.shadowColor = '#22ecff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  for (let i = 0; i < 10; i++) { const t = (i / 10 + now * .00022) % 1; ctx.fillStyle = i % 2 ? '#ff4dd1' : '#5bffff'; ctx.beginPath(); ctx.arc(lerp(a.x,b.x,t), lerp(a.y,b.y,t), 1.2 + state.panel.burst * 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function renderHandSkeleton(hand) {
  if (hand.intensity < .025 || !hand.points.length) return;
  ctx.save(); ctx.globalAlpha = hand.intensity * .7; ctx.strokeStyle = hand.color; ctx.fillStyle = hand.color; ctx.lineWidth = 1;
  HAND_CONNECTIONS.forEach(chain => { ctx.beginPath(); chain.forEach((id, i) => i ? ctx.lineTo(hand.points[id].x, hand.points[id].y) : ctx.moveTo(hand.points[id].x, hand.points[id].y)); ctx.stroke(); });
  hand.points.forEach((p, id) => { ctx.globalAlpha = hand.intensity * (id === 8 ? 1 : .55); ctx.beginPath(); ctx.arc(p.x, p.y, id === 8 ? 5 : 1.7, 0, Math.PI * 2); ctx.fill(); });
  if (state.debug) { ctx.globalAlpha = .9; ctx.font = '10px "Share Tech Mono", monospace'; hand.points.forEach((p, id) => ctx.fillText(id, p.x + 5, p.y - 5)); ctx.fillText(`${hand.label} ${hand.gesture}`, hand.points[8].x + 10, hand.points[8].y + 18); }
  ctx.restore();
}
function renderRGBPanel(now) {
  const p = state.panel; if (p.intensity < .015) return;
  const burst = p.burst, distortion = burst * 34 + (state.left.gesture === 'FIST' || state.right.gesture === 'FIST' ? 12 : 0);
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
  ctx.fillText('VISION OBJECT // HOLOGRAM', -p.width * .4, -p.height * .28); ctx.fillText(`HAND LINK: ${p.mode === 'TWO HANDS' || p.mode === 'CONTROL MODE' ? 'ACTIVE' : 'SINGLE'}`, -p.width * .4, -p.height * .08); ctx.fillText(`DISTANCE: ${Math.round(p.distance)} PX`, -p.width * .4, p.height * .12); ctx.fillText(`ROTATION: ${Math.round((p.angle * 180 / Math.PI + 360) % 360)} DEG`, -p.width * .4, p.height * .27);
  ctx.strokeStyle = '#81fff0'; ctx.globalAlpha = p.intensity * .65; ctx.beginPath(); ctx.moveTo(-p.width * .4, p.height * .37); ctx.lineTo(p.width * .4, p.height * .37); ctx.moveTo(-p.width * .4, -p.height * .35); ctx.lineTo(-p.width * .4, p.height * .37); ctx.stroke(); ctx.restore();
}
function updateParticles(dt) {
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  state.particles = state.particles.filter(p => { p.life -= dt; if (p.life <= 0) return false; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .978; p.vy *= .978; ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 + p.life * 2, 0, Math.PI * 2); ctx.fill(); return true; }); ctx.restore();
}
function updateHUD() {
  const visible = [state.left, state.right].filter(hand => hand.intensity > .12).length;
  handsStatus.textContent = `${visible} / 2`; modeStatus.textContent = state.panel.mode;
  const gestures = [state.left, state.right].filter(h => h.intensity > .12).map(h => `${h.label[0]}:${h.gesture}`).join(' ') || 'NONE'; gestureStatus.textContent = gestures;
}
function renderDebugReadout() {
  if (!state.debug) return;
  const p = state.panel, lines = [
    'DEBUG // TWO-HAND TRANSFORM',
    `PANEL: ${Math.round(p.width)} x ${Math.round(p.height)} PX`,
    `ROTATION: ${Math.round((p.angle * 180 / Math.PI + 360) % 360)} DEG`,
    `DISTANCE: ${Math.round(p.distance)} PX`,
    `FPS: ${fpsElement.textContent}`,
  ];
  for (const hand of [state.left, state.right]) {
    if (hand.points.length && hand.intensity > .06) lines.push(`${hand.label} INDEX: ${Math.round(hand.points[8].x)}, ${Math.round(hand.points[8].y)}`);
  }
  ctx.save(); ctx.fillStyle = '#affff8'; ctx.globalAlpha = .9; ctx.font = '11px "Share Tech Mono", monospace';
  const width = 255, x = innerWidth - width - 22, y = 26;
  ctx.fillStyle = 'rgba(2, 8, 20, .7)'; ctx.fillRect(x - 10, y - 15, width + 20, lines.length * 16 + 18);
  ctx.strokeStyle = 'rgba(81, 255, 238, .45)'; ctx.strokeRect(x - 10, y - 15, width + 20, lines.length * 16 + 18);
  ctx.fillStyle = '#affff8'; lines.forEach((line, i) => ctx.fillText(line, x, y + i * 16)); ctx.restore();
}
function render(now) {
  const dt = Math.min(.08, (now - lastFrameAt) / 1000); lastFrameAt = now; ctx.clearRect(0, 0, innerWidth, innerHeight);
  smoothHands(dt, now); calculatePanelTransform(dt, now); renderEnergyConnection(now); renderRGBPanel(now); renderHandSkeleton(state.left); renderHandSkeleton(state.right); updateParticles(dt); updateHUD(); renderDebugReadout();
  frameCount++; if (now - fpsClock > 700) { fpsElement.textContent = String(Math.round(frameCount * 1000 / (now - fpsClock))); fpsClock = now; frameCount = 0; }
}
function loop(now) {
  if (landmarker && video.readyState >= 2 && now - lastDetectAt > 30 && video.currentTime !== lastVideoTime) { lastDetectAt = now; lastVideoTime = video.currentTime; processHands(landmarker.detectForVideo(video, now), now); }
  render(now); requestAnimationFrame(loop);
}
function toggleDebug() { state.debug = !state.debug; debugButton.textContent = `DEBUG: ${state.debug ? 'ON' : 'OFF'} [D]`; }
debugButton.addEventListener('click', toggleDebug);
addEventListener('keydown', event => { if (event.key.toLowerCase() === 'd' && !event.repeat) toggleDebug(); });
addEventListener('resize', resize);

resize();
await Promise.all([initializeCamera(), initializeHandTracking()]);
if (video.srcObject && landmarker) hideNotice();
requestAnimationFrame(loop);
