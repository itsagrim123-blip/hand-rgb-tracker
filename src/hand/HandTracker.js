/**
 * HandTracker orchestrates MediaPipe HandLandmarker initialization, frame detection,
 * stable dual-hand identity resolution, smoothing, and gesture updates.
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
    this.detectedCount = 0;
    this.lastVideoTime = -1;
    this.lastDetectTime = 0;

    // Hand states
    this.left = new HandState('LEFT', '#ff3ea5');   // Neon Magenta / Pink accent
    this.right = new HandState('RIGHT', '#00f2fe'); // Neon Cyan / Blue accent
    this.hands = { LEFT: this.left, RIGHT: this.right };

    // Smoothing & Gestures
    this.smoothers = {
      LEFT: new HandSmoother(),
      RIGHT: new HandSmoother(),
    };
    this.gestureEngine = new GestureEngine();

    // Diagnostics
    this.fps = 0;
    this.detectionFps = 0;
    this._frameCount = 0;
    this._lastFpsTime = performance.now();
  }

  /**
   * Initializes MediaPipe HandLandmarker with GPU delegate and dual hand support.
   */
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

  /**
   * Identifies whether a hand detection corresponds to LEFT or RIGHT with continuity protection.
   */
  _resolveHandKey(classification, rawPoints, confidence, seenKeys) {
    const rawName = classification?.[0]?.categoryName || classification?.[0]?.displayName || '';
    let candidate = /left/i.test(rawName) ? 'LEFT' : /right/i.test(rawName) ? 'RIGHT' : (rawPoints[8].x < window.innerWidth * 0.5 ? 'LEFT' : 'RIGHT');

    // Continuity protection: if confidence is moderate and both hands were previously tracked,
    // prevent rapid label flipping by matching proximity to previous palm
    if (confidence < 0.75 && this.left.visible && this.right.visible) {
      const palmX = (rawPoints[0].x + rawPoints[5].x + rawPoints[17].x) / 3;
      const palmY = (rawPoints[0].y + rawPoints[5].y + rawPoints[17].y) / 3;
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
   * Processes a video frame and updates hand landmarks, smoothing, and gestures.
   */
  update(now, dt) {
    if (!this.isReady || !this.landmarker || this.video.readyState < 2) return;

    // Detect once per new video frame (approx 30-60Hz)
    if (this.video.currentTime !== this.lastVideoTime && now - this.lastDetectTime >= 24) {
      this.lastVideoTime = this.video.currentTime;
      this.lastDetectTime = now;

      const result = this.landmarker.detectForVideo(this.video, now);
      const handedness = result.handednesses || result.handedness || [];
      const landmarksList = result.landmarks || [];
      this.detectedCount = landmarksList.length;

      const seenKeys = new Set();

      landmarksList.forEach((rawLandmarks, index) => {
        // 1. Convert normalized MediaPipe landmarks to screen coordinates
        const screenPoints = rawLandmarks.map(lm => this.coordinateMapper.landmarkToScreen(lm));
        const confidence = handedness[index]?.[0]?.score ?? 0.5;

        // 2. Resolve hand identity (LEFT vs RIGHT)
        const key = this._resolveHandKey(handedness[index], screenPoints, confidence, seenKeys);
        seenKeys.add(key);
        const hand = this.hands[key];
        const smoother = this.smoothers[key];

        // 3. Smooth screen points using One Euro Filter
        const smoothedScreenPoints = smoother.smoothLandmarks(screenPoints, dt);
        hand.updateLandmarks(smoothedScreenPoints, rawLandmarks, confidence, now);

        // 4. Smooth pinch distance
        hand.pinchDistance = smoother.smoothPinchDistance(hand.rawPinchDistance, dt);

        // 5. Update gestures
        this.gestureEngine.update(hand, dt);
      });

      // Handle hands that were lost in this frame
      ['LEFT', 'RIGHT'].forEach(key => {
        if (!seenKeys.has(key)) {
          const hand = this.hands[key];
          if (now - hand.lastSeen > 350) {
            hand.reset();
            this.smoothers[key].reset();
            this.gestureEngine.reset(key);
          } else {
            hand.pinching = false;
            hand.pinchStarted = false;
          }
        }
      });

      this._frameCount++;
      if (now - this._lastFpsTime >= 1000) {
        this.detectionFps = Math.round((this._frameCount * 1000) / (now - this._lastFpsTime));
        this._frameCount = 0;
        this._lastFpsTime = now;
      }
    }

    // Smooth intensity fade for appearance/disappearance
    ['LEFT', 'RIGHT'].forEach(key => {
      const hand = this.hands[key];
      const targetIntensity = hand.visible && (now - hand.lastSeen < 350) ? 1.0 : 0.0;
      hand.intensity += (targetIntensity - hand.intensity) * Math.min(1.0, dt * 14.0);
    });
  }
}
