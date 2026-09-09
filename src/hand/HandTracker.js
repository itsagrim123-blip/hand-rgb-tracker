/**
 * HandTracker orchestrates MediaPipe HandLandmarker neural detection
 * and decouples 30 FPS camera frames from 60+ FPS continuous smooth hand updates.
 */

import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
import { HandState } from "./HandState.js";
import { HandSmoother } from "./HandSmoother.js";
import { GestureEngine } from "./GestureEngine.js";

export class HandTracker {
  constructor(videoElement, coordinateMapper) {
    this.video = videoElement;
    this.coordinateMapper = coordinateMapper;

    this.landmarker = null;
    this.isReady = false;
    this.isDetecting = false;
    this.detectedCount = 0;
    this.lastVideoTime = -1;
    this.lastDetectTime = 0;

    // Hand states
    this.left = new HandState('LEFT', '#ff3ea5');   // Neon Magenta
    this.right = new HandState('RIGHT', '#00f2fe'); // Neon Cyan
    this.hands = { LEFT: this.left, RIGHT: this.right };

    // Raw targets from latest neural detection
    this.rawTargets = {
      LEFT: { screenPoints: [], rawLandmarks: [], confidence: 0, updated: false },
      RIGHT: { screenPoints: [], rawLandmarks: [], confidence: 0, updated: false },
    };

    // Continuous 60fps smoothers
    this.smoothers = {
      LEFT: new HandSmoother(),
      RIGHT: new HandSmoother(),
    };
    this.gestureEngine = new GestureEngine();

    // Diagnostics
    this.detectionFps = 0;
    this._detectFrames = 0;
    this._lastFpsTimer = performance.now();
  }

  async initialize() {
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });

    this.isReady = true;
  }

  _resolveHandKey(classification, screenPoints, confidence, seenKeys) {
    const rawName = classification?.[0]?.categoryName || classification?.[0]?.displayName || '';
    let candidate = /left/i.test(rawName) ? 'LEFT' : /right/i.test(rawName) ? 'RIGHT' : (screenPoints[8].x < window.innerWidth * 0.5 ? 'LEFT' : 'RIGHT');

    // Continuity protection to prevent identity flipping when hands cross
    if (confidence < 0.72 && this.left.visible && this.right.visible) {
      const palmX = screenPoints[9].x;
      const palmY = screenPoints[9].y;
      const distL = Math.hypot(palmX - this.left.palmCenter.screen.x, palmY - this.left.palmCenter.screen.y);
      const distR = Math.hypot(palmX - this.right.palmCenter.screen.x, palmY - this.right.palmCenter.screen.y);
      const nearest = distL <= distR ? 'LEFT' : 'RIGHT';
      if (!seenKeys.has(nearest)) {
        return nearest;
      }
    }

    if (seenKeys.has(candidate)) {
      return candidate === 'LEFT' ? 'RIGHT' : 'LEFT';
    }
    return candidate;
  }

  /**
   * Triggers synchronous neural detection when a new video frame is available.
   */
  _runDetection(now) {
    if (!this.isReady || !this.landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime || (now - this.lastDetectTime < 24)) return;

    this.lastVideoTime = this.video.currentTime;
    this.lastDetectTime = now;

    const result = this.landmarker.detectForVideo(this.video, now);
    const handedness = result.handednesses || result.handedness || [];
    const landmarksList = result.landmarks || [];
    this.detectedCount = landmarksList.length;

    const seenKeys = new Set();

    landmarksList.forEach((rawLandmarks, index) => {
      const screenPoints = rawLandmarks.map(lm => this.coordinateMapper.landmarkToScreen(lm));
      const confidence = handedness[index]?.[0]?.score ?? 0.5;

      const key = this._resolveHandKey(handedness[index], screenPoints, confidence, seenKeys);
      seenKeys.add(key);

      this.rawTargets[key].screenPoints = screenPoints;
      this.rawTargets[key].rawLandmarks = rawLandmarks;
      this.rawTargets[key].confidence = confidence;
      this.rawTargets[key].updated = true;
      this.hands[key].lastSeen = now;
    });

    ['LEFT', 'RIGHT'].forEach(key => {
      if (!seenKeys.has(key)) {
        this.rawTargets[key].updated = false;
        const hand = this.hands[key];
        if (now - hand.lastSeen > 350) {
          hand.reset();
          this.smoothers[key].reset();
          this.gestureEngine.reset(key);
        }
      }
    });

    this._detectFrames++;
    if (now - this._lastFpsTimer >= 1000) {
      this.detectionFps = Math.round((this._detectFrames * 1000) / (now - this._lastFpsTimer));
      this._detectFrames = 0;
      this._lastFpsTimer = now;
    }
  }

  /**
   * Runs EVERY render frame (60+ FPS) to smoothly interpolate hands towards raw targets.
   */
  update(now, dt) {
    // 1. Process new video frame detection if ready
    this._runDetection(now);

    // 2. Continuous 60fps smoothing across both hands
    ['LEFT', 'RIGHT'].forEach(key => {
      const hand = this.hands[key];
      const target = this.rawTargets[key];
      const smoother = this.smoothers[key];

      if (target.updated && target.screenPoints.length >= 21) {
        // Continuous smooth interpolation
        const smoothedPts = smoother.smooth(target.screenPoints, dt);
        hand.updateLandmarks(smoothedPts, target.rawLandmarks, target.confidence, now);

        // Smooth pinch distance
        hand.pinchDistance = smoother.smoothPinchDistance(hand.rawPinchDistance, dt);

        // Update gestures
        this.gestureEngine.update(hand, dt);
      }

      // Smooth intensity fade
      const isFresh = hand.visible && (now - hand.lastSeen < 350);
      const targetIntensity = isFresh ? 1.0 : 0.0;
      hand.intensity += (targetIntensity - hand.intensity) * Math.min(1.0, dt * 14.0);
    });
  }
}
