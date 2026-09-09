/**
 * HandSmoother provides adaptive velocity-scaled interpolation for 60/120 FPS
 * zero-lag, jitter-free hand tracking.
 */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export class HandSmoother {
  constructor() {
    this.smoothedPoints = [];
    this.smoothedPalm = null;
    this.smoothedRotation = 0;
    this.smoothedPinchDist = 1.0;
  }

  /**
   * Smooths 21 screen points towards raw detection targets.
   * Runs EVERY render frame (60 FPS) regardless of video camera frame rate.
   */
  smooth(rawPoints, dt) {
    if (!rawPoints || rawPoints.length < 21) return this.smoothedPoints;

    if (!this.smoothedPoints.length) {
      this.smoothedPoints = rawPoints.map(p => ({ ...p }));
      return this.smoothedPoints;
    }

    // Measure overall hand speed
    const wristTarget = rawPoints[0];
    const wristCurr = this.smoothedPoints[0];
    const handSpeed = Math.hypot(wristTarget.x - wristCurr.x, wristTarget.y - wristCurr.y) / Math.max(dt, 0.001);

    // Adaptive alpha: higher speed -> higher responsiveness (zero lag)
    const baseAlpha = clamp(0.24 + (handSpeed / 1400.0) * 0.46, 0.24, 0.78);

    for (let i = 0; i < 21; i++) {
      const target = rawPoints[i];
      const curr = this.smoothedPoints[i];

      const ptSpeed = Math.hypot(target.x - curr.x, target.y - curr.y) / Math.max(dt, 0.001);
      const alpha = clamp(baseAlpha + (ptSpeed / 1800.0) * 0.25, 0.24, 0.85);

      curr.x = lerp(curr.x, target.x, alpha);
      curr.y = lerp(curr.y, target.y, alpha);
      curr.z = lerp(curr.z || 0, target.z || 0, alpha);
    }

    return this.smoothedPoints;
  }

  smoothPinchDistance(rawDist, dt) {
    const alpha = clamp(0.35 + Math.abs(rawDist - this.smoothedPinchDist) * 3.0, 0.35, 0.85);
    this.smoothedPinchDist = lerp(this.smoothedPinchDist, rawDist, alpha);
    return this.smoothedPinchDist;
  }

  smoothRotation(rawRotation, dt) {
    this.smoothedRotation = lerpAngle(this.smoothedRotation, rawRotation, 0.32);
    return this.smoothedRotation;
  }

  reset() {
    this.smoothedPoints = [];
    this.smoothedPalm = null;
    this.smoothedRotation = 0;
    this.smoothedPinchDist = 1.0;
  }
}
