/**
 * Main application entrypoint for RGB Hand Driver AR.
 * Orchestrates webcam ingestion, MediaPipe hand tracking, One Euro smoothing,
 * Three.js holographic rendering, physics, air drawing, and magical energy effects.
 */

import { CoordinateMapper } from "./ar/CoordinateMapper.js";
import { ARScene } from "./ar/ARScene.js";
import { HandTracker } from "./hand/HandTracker.js";
import { ObjectManager } from "./objects/ObjectManager.js";
import { ParticleSystem } from "./effects/ParticleSystem.js";
import { EnergySystem } from "./effects/EnergySystem.js";
import { MagicShield } from "./effects/MagicShield.js";
import { RGBEffect } from "./effects/RGBEffect.js";
import { InteractionManager } from "./interaction/InteractionManager.js";
import { HUD } from "./ui/HUD.js";
import { Controls } from "./ui/Controls.js";

class ARApplication {
  constructor() {
    this.video = document.querySelector('#camera');
    this.threeRoot = document.querySelector('#three-root');
    this.overlayCanvas = document.querySelector('#overlay');
    this.hudElement = document.querySelector('.hud');
    this.notice = document.querySelector('#notice');

    this.lastFrameTime = performance.now();
    this.fps = 60;
    this._frameCount = 0;
    this._fpsTimer = performance.now();

    this.init();
  }

  setNotice(title, message, isError = false) {
    if (!this.notice) return;
    this.notice.classList.toggle('error', isError);
    this.notice.classList.remove('hidden');
    this.notice.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  }

  hideNotice() {
    if (this.notice) this.notice.classList.add('hidden');
  }

  async init() {
    this.setNotice('INITIALIZING AR ENGINE...', 'Starting camera and loading neural hand vision...');

    // 1. AR Scene & Camera
    this.arScene = new ARScene(this.threeRoot);
    this.coordinateMapper = new CoordinateMapper(this.video);

    // 2. Visual Effects
    this.particleSystem = new ParticleSystem(this.arScene.scene);
    this.energySystem = new EnergySystem(this.arScene.scene);
    this.magicShield = new MagicShield(this.arScene.scene, this.particleSystem);
    this.rgbEffect = new RGBEffect(this.arScene.scene, this.particleSystem);

    // 3. 3D Objects & Physics
    this.objectManager = new ObjectManager(this.arScene.scene);
    this.objectManager.seedInitialObjects();

    // 4. Hand Tracking & Smoothing
    this.handTracker = new HandTracker(this.video, this.coordinateMapper);

    // 5. Interaction Manager (Grab, Throw, Dual Scale, Draw)
    this.interactionManager = new InteractionManager(
      this.arScene.scene,
      this.objectManager,
      this.particleSystem,
      this.energySystem
    );

    // 6. UI & HUD
    this.hud = new HUD(this.hudElement, this.overlayCanvas);
    this.controls = new Controls({
      onSpawn: () => {
        const obj = this.objectManager.spawn();
        this.particleSystem.emitBurst(obj.position, 20, 0x00f2fe);
      },
      onToggleShield: () => this.magicShield.toggle(),
      onToggleDraw: () => {
        const ds = this.interactionManager.drawingSystem;
        ds.enabled = !ds.enabled;
        return ds.enabled;
      },
      onToggleDebug: () => this.hud.toggleDebug(),
      onQualityChange: (level) => this.setQuality(level),
    });

    // 7. Window Event Listeners
    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    // 8. Start Camera & MediaPipe
    try {
      await this.startCamera();
      await this.handTracker.initialize();
      this.hideNotice();
      document.querySelector('#system-status').textContent = 'ONLINE';
    } catch (err) {
      console.error('Initialization error:', err);
      this.setNotice('INITIALIZATION ERROR', `${err.name || 'Error'}: ${err.message}`, true);
    }

    // 9. Start Main Render Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Webcam requires HTTPS or localhost. Ensure camera permissions are granted.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    this.video.srcObject = stream;
    await this.video.play();
  }

  setQuality(level) {
    if (level === 'LOW') {
      this.arScene.renderer.setPixelRatio(1.0);
    } else if (level === 'HIGH') {
      this.arScene.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    } else {
      this.arScene.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    }
  }

  onResize() {
    this.arScene.resize();
    this.hud.resize();
  }

  loop(timestamp) {
    const dt = Math.min(0.066, (timestamp - this.lastFrameTime) / 1000.0);
    this.lastFrameTime = timestamp;

    // 1. Hand Tracking Detection & One Euro Smoothing
    this.handTracker.update(timestamp, dt);

    const left = this.handTracker.left;
    const right = this.handTracker.right;

    // 2. Map screen points to 3D World points for both hands
    [left, right].forEach(hand => {
      if (hand.visible && hand.screenPoints.length === 21) {
        const worldPoints = hand.screenPoints.map(sp =>
          this.coordinateMapper.mediaPipeToWorld(sp, this.arScene.camera)
        );
        hand.setWorldPoints(worldPoints, dt, timestamp);
      }
    });

    // 3. Interactions: Grab, Throw, Dual Manipulation, Air Drawing
    this.interactionManager.update(left, right, timestamp, dt);

    // 4. Magic Shield Update
    this.magicShield.update(left, right, timestamp, dt);

    // 5. Visual Effects & RGB Hand Driver
    this.rgbEffect.update(left, right, timestamp, dt);
    this.energySystem.updateFingertips(left, right, timestamp, dt);
    this.particleSystem.update(dt);

    // 6. Object Physics
    const bounds = this.arScene.getWorldBoundsAtZ(0);
    this.objectManager.update(dt, this.arScene.floorY, bounds);

    // 7. Virtual Hover Button Pinch Interaction
    this.controls.checkFingertipInteraction(left, right);

    // 8. Three.js Render
    this.arScene.render();

    // 9. HUD & Debug Readout
    this._frameCount++;
    if (timestamp - this._fpsTimer >= 600) {
      this.fps = (this._frameCount * 1000) / (timestamp - this._fpsTimer);
      this._frameCount = 0;
      this._fpsTimer = timestamp;
    }

    this.hud.update(
      left,
      right,
      this.objectManager.objects.length,
      this.interactionManager.currentMode,
      this.fps,
      this.handTracker.detectionFps,
      this.arScene.renderer.info
    );

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  new ARApplication();
});
