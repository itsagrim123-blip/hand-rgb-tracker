/**
 * MagicShield builds procedural multi-layered 3D concentric magical wards
 * with glowing sacred geometry, parallax, materialization animations, and dual-shield clashes.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const GOLD_PALETTE = {
  primary: 0xffa726,   // Warm magical gold
  secondary: 0xff7700, // Deep fiery amber
  highlight: 0xffffff, // White-hot glow
  accent: 0x00f2fe,    // Subtle cyan edge accent
};

export class MagicShield {
  constructor(scene, particleSystem) {
    this.scene = scene;
    this.particleSystem = particleSystem;

    this.enabled = false;
    this.shields = {
      LEFT: this._build3DShield('LEFT'),
      RIGHT: this._build3DShield('RIGHT'),
    };

    this.scene.add(this.shields.LEFT.root);
    this.scene.add(this.shields.RIGHT.root);

    this.lastClashTime = 0;
    this.clashCooldown = 1500;
  }

  _build3DShield(label) {
    const root = new THREE.Group();
    root.visible = false;

    const layers = [];

    // 1. Outer Segmented Rune Arc (Z = 0.02)
    const outerGeom = new THREE.BufferGeometry();
    const outerPoints = [];
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const aStart = (i / segments) * Math.PI * 2 + 0.04;
      const aEnd = ((i + 0.8) / segments) * Math.PI * 2;
      for (let step = 0; step <= 8; step++) {
        const a = aStart + (aEnd - aStart) * (step / 8);
        outerPoints.push(new THREE.Vector3(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.02));
      }
    }
    outerGeom.setFromPoints(outerPoints);
    const outerMat = new THREE.LineBasicMaterial({
      color: GOLD_PALETTE.primary,
      transparent: true,
      opacity: 0.9,
      linewidth: 2,
      blending: THREE.AdditiveBlending,
    });
    const outerLines = new THREE.Line(outerGeom, outerMat);
    root.add(outerLines);
    layers.push({ mesh: outerLines, rotSpeed: 0.5 });

    // 2. 24 Radial Tick Marks (Z = 0.04)
    const tickGeom = new THREE.BufferGeometry();
    const tickPoints = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      tickPoints.push(
        new THREE.Vector3(Math.cos(a) * 0.88, Math.sin(a) * 0.88, 0.04),
        new THREE.Vector3(Math.cos(a) * 0.98, Math.sin(a) * 0.98, 0.04)
      );
    }
    tickGeom.setFromPoints(tickPoints);
    const tickMat = new THREE.LineBasicMaterial({
      color: GOLD_PALETTE.highlight,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const ticks = new THREE.LineSegments(tickGeom, tickMat);
    root.add(ticks);
    layers.push({ mesh: ticks, rotSpeed: 0.5 });

    // 3. Counter-Rotating Middle Ring with 8-pointed star (Z = 0.08)
    const starGeom = new THREE.BufferGeometry();
    const starPoints = [];
    const nPoints = 8;
    for (let i = 0; i < nPoints; i++) {
      const a1 = (i / nPoints) * Math.PI * 2;
      const a2 = ((i + 3) / nPoints) * Math.PI * 2;
      starPoints.push(
        new THREE.Vector3(Math.cos(a1) * 0.65, Math.sin(a1) * 0.65, 0.08),
        new THREE.Vector3(Math.cos(a2) * 0.65, Math.sin(a2) * 0.65, 0.08)
      );
    }
    starGeom.setFromPoints(starPoints);
    const starMat = new THREE.LineBasicMaterial({
      color: GOLD_PALETTE.secondary,
      transparent: true,
      opacity: 0.88,
      linewidth: 2,
      blending: THREE.AdditiveBlending,
    });
    const star = new THREE.LineSegments(starGeom, starMat);
    root.add(star);
    layers.push({ mesh: star, rotSpeed: -0.8 });

    // 4. Inner Ring with 12 radial spokes (Z = 0.12)
    const innerGeom = new THREE.RingGeometry(0.32, 0.35, 32);
    const innerMat = new THREE.MeshBasicMaterial({
      color: GOLD_PALETTE.primary,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(innerGeom, innerMat);
    innerRing.position.z = 0.12;
    root.add(innerRing);
    layers.push({ mesh: innerRing, rotSpeed: 1.1 });

    const spokeGeom = new THREE.BufferGeometry();
    const spokePoints = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      spokePoints.push(
        new THREE.Vector3(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0.12),
        new THREE.Vector3(Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0.12)
      );
    }
    spokeGeom.setFromPoints(spokePoints);
    const spokes = new THREE.LineSegments(spokeGeom, starMat);
    root.add(spokes);
    layers.push({ mesh: spokes, rotSpeed: 1.1 });

    // 5. Pulsing Glowing Core Disc (Z = 0.15)
    const coreGeom = new THREE.CircleGeometry(0.16, 24);
    const coreMat = new THREE.MeshBasicMaterial({
      color: GOLD_PALETTE.highlight,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.z = 0.15;
    root.add(core);
    layers.push({ mesh: core, rotSpeed: 0.3, isPulseCore: true });

    // 6. Orbiting Particle Ring (Z = 0.18)
    const pCount = 32;
    const pGeom = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const a = (i / pCount) * Math.PI * 2;
      const r = 0.45 + (i % 3) * 0.22;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = Math.sin(a) * r;
      pPos[i * 3 + 2] = 0.18 + (Math.random() - 0.5) * 0.04;
    }
    pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: GOLD_PALETTE.highlight,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(pGeom, pMat);
    root.add(particles);
    layers.push({ mesh: particles, rotSpeed: 1.6 });

    return {
      label,
      root,
      layers,
      core,
      progress: 0,
      targetProgress: 0,
    };
  }

  toggle(force = null) {
    this.enabled = force !== null ? force : !this.enabled;
    return this.enabled;
  }

  update(leftHand, rightHand, now, dt) {
    const hands = [leftHand, rightHand];

    hands.forEach(hand => {
      const shield = this.shields[hand.label];
      const shouldBeActive = this.enabled && hand.visible && hand.intensity > 0.12 && hand.palmCenter.world;
      shield.targetProgress = shouldBeActive ? 1.0 : 0.0;

      // Snappy materialization transition
      const speed = shouldBeActive ? 5.5 : 6.5;
      shield.progress = THREE.MathUtils.lerp(shield.progress, shield.targetProgress, Math.min(1.0, dt * speed));

      if (shield.progress < 0.01) {
        shield.root.visible = false;
        return;
      }

      shield.root.visible = true;

      // Position shield slightly in front of palm
      const palmW = hand.palmCenter.world;
      shield.root.position.set(palmW.x, palmW.y, (palmW.z || 0) + 0.15);

      // Keep shield facing forward towards camera, with subtle tilt from hand normal
      const tiltX = THREE.MathUtils.clamp(-hand.normal.y * 0.45, -0.4, 0.4);
      const tiltY = THREE.MathUtils.clamp(hand.normal.x * 0.45, -0.4, 0.4);
      shield.root.rotation.set(tiltX, tiltY, hand.rotation || 0);

      // Materialization scale ease
      const scale = Math.sin(shield.progress * Math.PI * 0.5) * 1.05;
      shield.root.scale.setScalar(scale);

      // Spin layers
      shield.layers.forEach(l => {
        l.mesh.rotation.z += l.rotSpeed * dt;
        if (l.isPulseCore) {
          const pulse = 1.0 + 0.18 * Math.sin(now * 0.008);
          l.mesh.scale.setScalar(pulse);
        }
      });
    });

    this._checkDualShieldClash(now);
  }

  _checkDualShieldClash(now) {
    const left = this.shields.LEFT;
    const right = this.shields.RIGHT;

    if (!left.root.visible || !right.root.visible) return;
    if (left.progress < 0.75 || right.progress < 0.75) return;

    const dist = left.root.position.distanceTo(right.root.position);
    if (dist < 0.85 && (now - this.lastClashTime > this.clashCooldown)) {
      this.lastClashTime = now;

      const clashPos = new THREE.Vector3()
        .addVectors(left.root.position, right.root.position)
        .multiplyScalar(0.5);

      if (this.particleSystem) {
        this.particleSystem.emitShockwave(clashPos, 2.0, GOLD_PALETTE.primary);
        this.particleSystem.emitShockwave(clashPos, 1.4, 0x00f2fe);
        this.particleSystem.emitShockwave(clashPos, 0.8, 0xff3ea5);
        this.particleSystem.emitBurst(clashPos, 55, GOLD_PALETTE.highlight);
      }
    }
  }
}
