/**
 * DrawingSystem allows the user to draw 3D holographic curves in the air using their index fingertip.
 * Recognizes geometric shapes (Circle, Triangle, Square, Line, Freeform) and materializes them
 * into interactive, physical 3D objects that can be grabbed and thrown.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class DrawingSystem {
  constructor(scene, objectManager, particleSystem) {
    this.scene = scene;
    this.objectManager = objectManager;
    this.particleSystem = particleSystem;

    this.isDrawing = false;
    this.activeHand = null;
    this.strokePoints = [];
    this.lastPointTime = 0;
    this.enabled = true; // Drawing gesture enabled

    // Live preview line
    this.previewGeom = new THREE.BufferGeometry();
    this.previewMat = new THREE.LineBasicMaterial({
      color: 0x00f2fe,
      linewidth: 3,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.9,
    });
    this.previewLine = new THREE.Line(this.previewGeom, this.previewMat);
    this.previewLine.frustumCulled = false;
    this.previewLine.visible = false;
    this.scene.add(this.previewLine);
  }

  /**
   * Updates drawing state from hand gestures.
   */
  update(hand, now, dt) {
    if (!this.enabled || !hand.visible || hand.worldPoints.length < 21) {
      if (this.isDrawing && this.activeHand === hand.label) {
        this.finishStroke(now);
      }
      return;
    }

    const indexTipWorld = hand.worldPoints[8];
    const isPointGesture = hand.gesture === 'POINT';

    // Start stroke
    if (isPointGesture && !this.isDrawing && !hand.pinching) {
      this.isDrawing = true;
      this.activeHand = hand.label;
      this.strokePoints = [indexTipWorld.clone()];
      this.lastPointTime = now;
      this.previewLine.visible = true;
      this.previewMat.color.setHex(hand.label === 'LEFT' ? 0xff3ea5 : 0x00f2fe);
      return;
    }

    // Continue stroke
    if (this.isDrawing && this.activeHand === hand.label) {
      if (!isPointGesture || hand.pinching) {
        this.finishStroke(now);
        return;
      }

      const lastPoint = this.strokePoints[this.strokePoints.length - 1];
      const dist = lastPoint.distanceTo(indexTipWorld);

      // Add point if moved significantly
      if (dist > 0.04) {
        this.strokePoints.push(indexTipWorld.clone());
        this.lastPointTime = now;
        this._updatePreviewGeometry();

        // Emit sparkles while drawing
        if (this.particleSystem && Math.random() < 0.6) {
          this.particleSystem.emitBurst(indexTipWorld, 2, hand.color);
        }
      }

      // Finish if user holds finger still for > 0.8 seconds
      if (now - this.lastPointTime > 800 && this.strokePoints.length >= 10) {
        this.finishStroke(now);
      }
    }
  }

  _updatePreviewGeometry() {
    if (this.strokePoints.length < 2) return;
    this.previewGeom.setFromPoints(this.strokePoints);
  }

  /**
   * Completes the drawn stroke, runs shape recognition, and materializes a 3D object.
   */
  finishStroke(now) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.previewLine.visible = false;

    if (this.strokePoints.length < 8) {
      this.strokePoints = [];
      return;
    }

    // Compute total path length
    let totalLength = 0;
    for (let i = 1; i < this.strokePoints.length; i++) {
      totalLength += this.strokePoints[i].distanceTo(this.strokePoints[i - 1]);
    }

    if (totalLength < 0.3) {
      this.strokePoints = [];
      return;
    }

    // Classify shape
    const shapeType = this._recognizeShape(this.strokePoints, totalLength);

    // Compute centroid of stroke
    const centroid = new THREE.Vector3();
    this.strokePoints.forEach(p => centroid.add(p));
    centroid.divideScalar(this.strokePoints.length);

    let createdObj = null;

    if (shapeType === 'FREEFORM') {
      // Fit CatmullRomCurve3
      const curve = new THREE.CatmullRomCurve3(this.strokePoints, false, 'catmullrom', 0.5);
      createdObj = this.objectManager.spawnFromCurve(curve);
    } else {
      // Recognized geometric shape
      createdObj = this.objectManager.spawn(shapeType, centroid);
    }

    // Materialization flash effect
    if (this.particleSystem && createdObj) {
      this.particleSystem.emitShockwave(centroid, 0.4, 0x00f2fe);
      this.particleSystem.emitBurst(centroid, 28, 0xffffff);
    }

    this.strokePoints = [];
  }

  /**
   * Geometric shape recognizer: Circle, Triangle, Square, Line, Freeform.
   */
  _recognizeShape(points, totalLength) {
    const start = points[0];
    const end = points[points.length - 1];
    const closureDist = start.distanceTo(end);
    const isClosed = (closureDist / totalLength) < 0.28;

    // 1. Line Check: start-to-end distance covers almost entire path
    if (closureDist / totalLength > 0.88) {
      return 'BEAM';
    }

    // Compute centroid
    const centroid = new THREE.Vector3();
    points.forEach(p => centroid.add(p));
    centroid.divideScalar(points.length);

    // Compute radial distances from centroid
    let sumR = 0;
    const radii = points.map(p => {
      const r = p.distanceTo(centroid);
      sumR += r;
      return r;
    });
    const meanR = sumR / points.length;

    let variance = 0;
    radii.forEach(r => {
      variance += Math.pow(r - meanR, 2);
    });
    const stdDev = Math.sqrt(variance / points.length);
    const circularityRatio = stdDev / Math.max(meanR, 0.001);

    // 2. Circle Check
    if (isClosed && circularityRatio < 0.22) {
      return 'TORUS'; // Materializes as magical ring
    }

    // 3. Corner Detection (angle deflection analysis)
    let sharpCorners = 0;
    const stride = Math.max(2, Math.floor(points.length / 16));

    for (let i = stride; i < points.length - stride; i += stride) {
      const v1 = new THREE.Vector3().subVectors(points[i], points[i - stride]).normalize();
      const v2 = new THREE.Vector3().subVectors(points[i + stride], points[i]).normalize();
      const dot = THREE.MathUtils.clamp(v1.dot(v2), -1, 1);
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(dot));

      if (angleDeg > 55.0) {
        sharpCorners++;
      }
    }

    if (sharpCorners === 3) {
      return 'PRISM'; // Triangular prism
    }

    if (sharpCorners >= 4 && sharpCorners <= 5) {
      return 'CUBE'; // Holographic cube
    }

    return 'FREEFORM';
  }
}
