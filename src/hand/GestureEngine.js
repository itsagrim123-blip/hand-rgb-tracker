/**
 * GestureEngine provides robust gesture detection with hysteresis and debouncing.
 * Detects PINCH, POINT, OPEN_PALM, FIST, and PEACE.
 */

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

export class GestureEngine {
  constructor() {
    this.candidateGestures = { LEFT: 'NONE', RIGHT: 'NONE' };
    this.candidateCounts = { LEFT: 0, RIGHT: 0 };
    this.pinchCounters = {
      LEFT: { pinchFrames: 0, releaseFrames: 0 },
      RIGHT: { pinchFrames: 0, releaseFrames: 0 },
    };
  }

  /**
   * Evaluates gesture for a hand given screen points and normalized raw landmarks.
   */
  update(hand, dt) {
    if (!hand.visible || hand.screenPoints.length < 21) {
      hand.pinching = false;
      hand.pinchStarted = false;
      hand.pinchEnded = false;
      hand.gesture = 'NONE';
      return;
    }

    const raw = hand.rawLandmarks;
    const pts = hand.screenPoints;
    const label = hand.label;

    // 1. Pinch Detection with Hysteresis & Debounce
    // Compute normalized 3D pinch distance between thumb tip (4) and index tip (8)
    const rawPinchDist = Math.hypot(
      raw[4].x - raw[8].x,
      raw[4].y - raw[8].y,
      (raw[4].z || 0) - (raw[8].z || 0)
    );
    hand.rawPinchDistance = rawPinchDist;

    const PINCH_ON = 0.058;
    const PINCH_OFF = 0.078;
    const wasPinching = hand.pinching;
    const counters = this.pinchCounters[label];

    if (!hand.pinching && hand.pinchDistance < PINCH_ON) {
      counters.pinchFrames++;
      counters.releaseFrames = 0;
      if (counters.pinchFrames >= 2) {
        hand.pinching = true;
      }
    } else if (hand.pinching && hand.pinchDistance > PINCH_OFF) {
      counters.releaseFrames++;
      counters.pinchFrames = 0;
      if (counters.releaseFrames >= 2) {
        hand.pinching = false;
      }
    } else {
      counters.pinchFrames = 0;
      counters.releaseFrames = 0;
    }

    hand.pinchStarted = hand.pinching && !wasPinching;
    hand.pinchEnded = !hand.pinching && wasPinching;

    // 2. Finger Extension Detection
    const wrist = pts[0];
    const palmScale = Math.max(distance2D(wrist, pts[9]), 20); // Wrist to middle MCP scale

    // Check if each finger is extended (distance from wrist to fingertip > 1.6 * palmScale)
    const indexExt = distance2D(pts[8], wrist) / palmScale > 1.55;
    const middleExt = distance2D(pts[12], wrist) / palmScale > 1.55;
    const ringExt = distance2D(pts[16], wrist) / palmScale > 1.50;
    const pinkyExt = distance2D(pts[20], wrist) / palmScale > 1.45;

    // 3. Gesture Classification
    let detected = 'NONE';
    if (hand.pinching) {
      detected = 'PINCH';
    } else if (indexExt && !middleExt && !ringExt && !pinkyExt) {
      detected = 'POINT'; // Air drawing trigger!
    } else if (indexExt && middleExt && !ringExt && !pinkyExt) {
      detected = 'PEACE';
    } else if (indexExt && middleExt && ringExt && pinkyExt) {
      detected = 'OPEN'; // Open palm / shield mode
    } else if (!indexExt && !middleExt && !ringExt && !pinkyExt) {
      detected = 'FIST'; // Fist / shockwave
    } else {
      detected = 'HAND';
    }

    // 4. Debounce candidate gesture across 3 consecutive frames
    if (detected === this.candidateGestures[label]) {
      this.candidateCounts[label]++;
    } else {
      this.candidateGestures[label] = detected;
      this.candidateCounts[label] = 1;
    }

    hand.previousGesture = hand.gesture;
    if (this.candidateCounts[label] >= 3) {
      hand.gesture = this.candidateGestures[label];
    }
  }

  reset(label) {
    if (label) {
      this.candidateGestures[label] = 'NONE';
      this.candidateCounts[label] = 0;
      this.pinchCounters[label] = { pinchFrames: 0, releaseFrames: 0 };
    } else {
      ['LEFT', 'RIGHT'].forEach(l => this.reset(l));
    }
  }
}
