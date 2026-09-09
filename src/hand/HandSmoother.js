/**
 * One Euro Filter implementation for high-precision, low-latency hand landmark smoothing.
 * Paper: Casiez, Roussel, Vogel (CHI 2012)
 * Eliminates jitter at rest while preserving instant responsiveness during fast movements.
 */

class LowPassFilter {
  constructor() {
    this.s = 0;
    this.initialized = false;
  }

  filter(value, alpha) {
    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
      return value;
    }
    this.s = alpha * value + (1.0 - alpha) * this.s;
    return this.s;
  }

  reset() {
    this.s = 0;
    this.initialized = false;
  }
}

export class OneEuroFilter {
  constructor(minCutoff = 1.2, beta = 0.015, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  alpha(cutoff, dt) {
    const tau = 1.0 / (2.0 * Math.PI * Math.max(cutoff, 0.001));
    return 1.0 / (1.0 + tau / Math.max(dt, 0.0001));
  }

  filter(value, dt) {
    if (!this.xFilter.initialized) {
      this.xFilter.filter(value, 1.0);
      this.dxFilter.filter(0, 1.0);
      return value;
    }
    const prevX = this.xFilter.s;
    const dx = (value - prevX) / Math.max(dt, 0.0001);
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(value, this.alpha(cutoff, dt));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
  }
}

export class Point3DSmoother {
  constructor(minCutoff = 1.2, beta = 0.02) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
    this.fz = new OneEuroFilter(minCutoff, beta);
  }

  filter(point, dt) {
    return {
      x: this.fx.filter(point.x, dt),
      y: this.fy.filter(point.y, dt),
      z: this.fz.filter(point.z ?? 0, dt),
    };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

export class AngleSmoother {
  constructor(minCutoff = 1.0, beta = 0.01) {
    this.fCos = new OneEuroFilter(minCutoff, beta);
    this.fSin = new OneEuroFilter(minCutoff, beta);
  }

  filter(angle, dt) {
    const cos = this.fCos.filter(Math.cos(angle), dt);
    const sin = this.fSin.filter(Math.sin(angle), dt);
    return Math.atan2(sin, cos);
  }

  reset() {
    this.fCos.reset();
    this.fSin.reset();
  }
}

export class HandSmoother {
  constructor() {
    // 21 landmark smoothers
    this.landmarks = Array.from({ length: 21 }, () => new Point3DSmoother(1.2, 0.018));
    this.palmCenter = new Point3DSmoother(1.5, 0.025);
    this.rotation = new AngleSmoother(1.0, 0.012);
    this.pinch = new OneEuroFilter(1.8, 0.02);
  }

  smoothLandmarks(points, dt) {
    return points.map((p, i) => this.landmarks[i].filter(p, dt));
  }

  smoothPalm(palm, dt) {
    return this.palmCenter.filter(palm, dt);
  }

  smoothRotation(angle, dt) {
    return this.rotation.filter(angle, dt);
  }

  smoothPinchDistance(dist, dt) {
    return this.pinch.filter(dist, dt);
  }

  reset() {
    this.landmarks.forEach(l => l.reset());
    this.palmCenter.reset();
    this.rotation.reset();
    this.pinch.reset();
  }
}
