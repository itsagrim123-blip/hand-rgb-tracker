/**
 * EnergySystem manages fingertip energy nodes, dual-hand interaction tethers,
 * and grab connection arcs.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class EnergySystem {
  constructor(scene) {
    this.scene = scene;

    // 1. Precise Fingertip Energy Nodes for Left & Right index fingers
    this.fingertipNodes = {
      LEFT: this._createFingertipNode(0xff3ea5),
      RIGHT: this._createFingertipNode(0x00f2fe),
    };
    this.scene.add(this.fingertipNodes.LEFT.group);
    this.scene.add(this.fingertipNodes.RIGHT.group);

    // 2. Dual-hand connection arc line
    const tetherGeom = new THREE.BufferGeometry();
    const tetherMat = new THREE.LineBasicMaterial({
      color: 0x6effe8,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    this.tetherLine = new THREE.Line(tetherGeom, tetherMat);
    this.tetherLine.visible = false;
    this.scene.add(this.tetherLine);

    // 3. Grab tether line (between pinch and held object)
    const grabGeom = new THREE.BufferGeometry();
    const grabMat = new THREE.LineBasicMaterial({
      color: 0x8affff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    this.grabLine = new THREE.Line(grabGeom, grabMat);
    this.grabLine.visible = false;
    this.scene.add(this.grabLine);
  }

  _createFingertipNode(hexColor) {
    const group = new THREE.Group();

    // Core point
    const coreGeom = new THREE.SphereGeometry(0.045, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    group.add(core);

    // Outer glowing halo ring
    const ringGeom = new THREE.RingGeometry(0.05, 0.09, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: hexColor,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    group.add(ring);

    group.visible = false;
    return { group, core, ring, baseColor: hexColor };
  }

  /**
   * Updates fingertip nodes following the user's index fingertips.
   */
  updateFingertips(leftHand, rightHand, now, dt) {
    [leftHand, rightHand].forEach(hand => {
      const node = this.fingertipNodes[hand.label];
      if (!hand.visible || hand.intensity < 0.1 || hand.worldPoints.length < 21) {
        node.group.visible = false;
        return;
      }

      node.group.visible = true;
      const tipPos = hand.worldPoints[8];
      node.group.position.set(tipPos.x, tipPos.y, tipPos.z);

      // Pulse rate scales with movement speed
      const speed = hand.velocity.speed;
      const pulse = 1.0 + 0.25 * Math.sin(now * 0.008 + speed * 0.005);
      node.ring.scale.set(pulse, pulse, 1);
      node.ring.rotation.z += (2.0 + speed * 0.01) * dt;

      // Glow intensity increases when pointing or fast
      const glowBoost = hand.gesture === 'POINT' ? 1.4 : 1.0;
      node.core.scale.setScalar(Math.min(1.8, 1.0 + speed * 0.08) * glowBoost);
    });
  }

  /**
   * Renders electric tether arc when both hands manipulate an object.
   */
  renderDualTether(pLeft, pRight, midpoint) {
    this.tetherLine.visible = true;
    const curve = new THREE.QuadraticBezierCurve3(
      pLeft,
      new THREE.Vector3(midpoint.x, midpoint.y + 0.15, midpoint.z),
      pRight
    );
    const points = curve.getPoints(20);
    this.tetherLine.geometry.setFromPoints(points);
  }

  hideDualTether() {
    this.tetherLine.visible = false;
  }

  /**
   * Renders tether between pinch point and grabbed object.
   */
  renderGrabTether(pinchPoint, objPos) {
    this.grabLine.visible = true;
    this.grabLine.geometry.setFromPoints([pinchPoint, objPos]);
  }

  hideGrabTether() {
    this.grabLine.visible = false;
  }
}
