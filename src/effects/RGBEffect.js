/**
 * RGBEffect implements the signature RGB Hand Driver visual experience.
 * Generates dynamic chromatic ribbons, additive velocity-reactive energy fields,
 * and high-speed motion energy bursts across cyan, magenta, blue, and white highlights.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const CHROMATIC_COLORS = [
  new THREE.Color(0x00f2fe), // Cyan
  new THREE.Color(0xff2df0), // Magenta
  new THREE.Color(0x285cff), // Blue
  new THREE.Color(0xffffff), // White highlight
];

export class RGBEffect {
  constructor(scene, particleSystem) {
    this.scene = scene;
    this.particleSystem = particleSystem;

    // Fast burst trigger timestamps
    this.lastBurstTime = { LEFT: 0, RIGHT: 0 };

    // Chromatic trail line geometries for Left and Right hands
    this.trailMeshes = {
      LEFT: this._createTrailGroup(0xff3ea5),
      RIGHT: this._createTrailGroup(0x00f2fe),
    };
    this.scene.add(this.trailMeshes.LEFT.group);
    this.scene.add(this.trailMeshes.RIGHT.group);
  }

  _createTrailGroup(accentColor) {
    const group = new THREE.Group();
    const maxPoints = 20;

    // Layer 1: Primary Cyan ribbon line
    const cyanGeom = new THREE.BufferGeometry();
    cyanGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPoints * 3), 3));
    const cyanMat = new THREE.LineBasicMaterial({
      color: 0x00f2fe,
      linewidth: 2,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const cyanLine = new THREE.Line(cyanGeom, cyanMat);
    group.add(cyanLine);

    // Layer 2: Offset Magenta ribbon line (chromatic separation)
    const magGeom = new THREE.BufferGeometry();
    magGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPoints * 3), 3));
    const magMat = new THREE.LineBasicMaterial({
      color: 0xff3ea5,
      linewidth: 2,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const magLine = new THREE.Line(magGeom, magMat);
    group.add(magLine);

    return { group, cyanLine, magLine, maxPoints };
  }

  update(leftHand, rightHand, now, dt) {
    [leftHand, rightHand].forEach(hand => {
      const trail = this.trailMeshes[hand.label];

      if (!hand.visible || hand.intensity < 0.1 || hand.trail.length < 3) {
        trail.group.visible = false;
        return;
      }

      trail.group.visible = true;
      const speed = hand.velocity.speed;

      // Chromatic separation distance scales with velocity
      const separation = Math.min(0.08, speed * 0.015);
      const points = hand.trail;
      const count = Math.min(trail.maxPoints, points.length);

      const cyanPos = trail.cyanLine.geometry.attributes.position.array;
      const magPos = trail.magLine.geometry.attributes.position.array;

      for (let i = 0; i < count; i++) {
        const pt = points[i];
        // Cyan shifted slightly left
        cyanPos[i * 3] = pt.x - separation;
        cyanPos[i * 3 + 1] = pt.y + separation * 0.5;
        cyanPos[i * 3 + 2] = pt.z;

        // Magenta shifted slightly right
        magPos[i * 3] = pt.x + separation;
        magPos[i * 3 + 1] = pt.y - separation * 0.5;
        magPos[i * 3 + 2] = pt.z;
      }

      trail.cyanLine.geometry.setDrawRange(0, count);
      trail.magLine.geometry.setDrawRange(0, count);
      trail.cyanLine.geometry.attributes.position.needsUpdate = true;
      trail.magLine.geometry.attributes.position.needsUpdate = true;

      // Fade opacity based on velocity (quiet at rest, vivid in motion)
      const targetOpacity = THREE.MathUtils.clamp(speed * 0.18, 0.15, 0.9);
      trail.cyanLine.material.opacity = targetOpacity;
      trail.magLine.material.opacity = targetOpacity;

      // High velocity burst trigger (> 4.5 m/s)
      if (speed > 4.5 && (now - this.lastBurstTime[hand.label] > 550) && this.particleSystem) {
        this.lastBurstTime[hand.label] = now;
        const burstPos = new THREE.Vector3(points[0].x, points[0].y, points[0].z);
        this.particleSystem.emitBurst(burstPos, 22, (hand.label === 'LEFT' ? 0xff2df0 : 0x00f2fe));
      }
    });
  }
}
