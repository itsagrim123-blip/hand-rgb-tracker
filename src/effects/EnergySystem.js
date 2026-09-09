/**
 * EnergySystem manages precision fingertip energy nodes, dual-hand interaction tethers,
 * and grab connection arcs.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class EnergySystem {
  constructor(scene) {
    this.scene = scene;

    // Precision fingertip energy nodes
    this.fingertipNodes = {
      LEFT: this._createFingertipNode(0xff3ea5),
      RIGHT: this._createFingertipNode(0x00f2fe),
    };
    this.scene.add(this.fingertipNodes.LEFT.group);
    this.scene.add(this.fingertipNodes.RIGHT.group);

    // Dual-hand connection arc line
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

    // Grab tether line
    const grabGeom = new THREE.BufferGeometry();
    const grabMat = new THREE.LineBasicMaterial({
      color: 0x8affff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    this.grabLine = new THREE.Line(grabGeom, grabMat);
    this.grabLine.visible = false;
    this.scene.add(this.grabLine);
  }

  _createFingertipNode(hexColor) {
    const group = new THREE.Group();

    // Glowing core
    const coreGeom = new THREE.SphereGeometry(0.042, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    group.add(core);

    // Halo ring
    const ringGeom = new THREE.RingGeometry(0.048, 0.082, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: hexColor,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    group.add(ring);

    group.visible = false;
    return { group, core, ring, baseColor: hexColor };
  }

  updateFingertips(leftHand, rightHand, now, dt) {
    [leftHand, rightHand].forEach(hand => {
      const node = this.fingertipNodes[hand.label];
      if (!hand.visible || hand.intensity < 0.1 || hand.worldPoints.length < 21) {
        node.group.visible = false;
        return;
      }

      node.group.visible = true;
      const tip = hand.worldPoints[8]; // Index fingertip
      node.group.position.set(tip.x, tip.y, tip.z);

      const speed = hand.velocity.speed;
      const pulse = 1.0 + 0.2 * Math.sin(now * 0.008 + speed * 0.006);
      node.ring.scale.set(pulse, pulse, 1);
      node.ring.rotation.z += (2.2 + speed * 0.01) * dt;

      // Glow intensity responds to POINT gesture or fast speed
      const isPointing = hand.gesture === 'POINT';
      node.core.scale.setScalar(isPointing ? 1.4 : 1.0);
      node.ring.material.opacity = isPointing ? 0.95 : 0.75;
    });
  }

  renderDualTether(pLeft, pRight, midpoint) {
    this.tetherLine.visible = true;
    const curve = new THREE.QuadraticBezierCurve3(
      pLeft,
      new THREE.Vector3(midpoint.x, midpoint.y + 0.18, midpoint.z),
      pRight
    );
    const points = curve.getPoints(20);
    this.tetherLine.geometry.setFromPoints(points);
  }

  hideDualTether() {
    this.tetherLine.visible = false;
  }

  renderGrabTether(pinchPoint, objPos) {
    this.grabLine.visible = true;
    this.grabLine.geometry.setFromPoints([pinchPoint, objPos]);
  }

  hideGrabTether() {
    this.grabLine.visible = false;
  }
}
