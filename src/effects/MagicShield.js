/**
 * MagicShield builds procedural multi-layer 3D concentric magical wards with true depth,
 * parallax, materialization animations, and dual-shield collision shockwaves.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const GOLD_PALETTE = {
  primary: 0xffa726,   // Warm magical gold
  secondary: 0xff6d00, // Deep ember
  highlight: 0xfff3e0, // White-hot glow
  accent: 0x00f2fe,    // Subtle cyan ethereal accent
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

    // Dual-shield clash state
    this.lastClashTime = 0;
    this.clashCooldown = 1600; // ms
  }

  _build3DShield(label) {
    const root = new THREE.Group();
    root.visible = false;

    const layers = [];

    // --- Layer 1: Outer Ornate Segmented Ring (Z = 0.02) ---
    const outerRingGeom = new THREE.RingGeometry(0.85, 0.92, 48);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: GOLD_PALETTE.primary,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerRing = new THREE.Mesh(outerRingGeom, outerRingMat);
    outerRing.position.z = 0.02;
    root.add(outerRing);
    layers.push({ mesh: outerRing, rotSpeed: 0.45 });

    // Outer tick marks (16 radial notches)
    const notchGeom = new THREE.BufferGeometry();
    const notchPoints = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      notchPoints.push(
        new THREE.Vector3(Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0.03),
        new THREE.Vector3(Math.cos(a) * 0.99, Math.sin(a) * 0.99, 0.03)
      );
    }
    notchGeom.setFromPoints(notchPoints);
    const notchMat = new THREE.LineBasicMaterial({
      color: GOLD_PALETTE.highlight,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const notches = new THREE.LineSegments(notchGeom, notchMat);
    root.add(notches);
    layers.push({ mesh: notches, rotSpeed: 0.45 });

    // --- Layer 2: Counter-Rotating Middle Rune Ring (Z = 0.06) ---
    const midRingGeom = new THREE.RingGeometry(0.62, 0.67, 36);
    const midRingMat = new THREE.MeshBasicMaterial({
      color: GOLD_PALETTE.secondary,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const midRing = new THREE.Mesh(midRingGeom, midRingMat);
    midRing.position.z = 0.06;
    root.add(midRing);
    layers.push({ mesh: midRing, rotSpeed: -0.75 });

    // --- Layer 3: Sacred Geometry Star Polygon (Hexagram / Octagram) (Z = 0.09) ---
    const starGeom = new THREE.BufferGeometry();
    const starPoints = [];
    const pointsCount = 8;
    for (let i = 0; i < pointsCount; i++) {
      const a1 = (i / pointsCount) * Math.PI * 2;
      const a2 = ((i + 3) / pointsCount) * Math.PI * 2;
      starPoints.push(
        new THREE.Vector3(Math.cos(a1) * 0.62, Math.sin(a1) * 0.62, 0.09),
        new THREE.Vector3(Math.cos(a2) * 0.62, Math.sin(a2) * 0.62, 0.09)
      );
    }
    starGeom.setFromPoints(starPoints);
    const starMat = new THREE.LineBasicMaterial({
      color: GOLD_PALETTE.primary,
      transparent: true,
      opacity: 0.85,
      linewidth: 2,
      blending: THREE.AdditiveBlending,
    });
    const star = new THREE.LineSegments(starGeom, starMat);
    root.add(star);
    layers.push({ mesh: star, rotSpeed: 0.6 });

    // --- Layer 4: Inner Core Ring & Radial Spokes (Z = 0.13) ---
    const innerRingGeom = new THREE.RingGeometry(0.28, 0.33, 24);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: GOLD_PALETTE.primary,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(innerRingGeom, innerRingMat);
    innerRing.position.z = 0.13;
    root.add(innerRing);
    layers.push({ mesh: innerRing, rotSpeed: -1.1 });

    // Radial spokes connecting inner core to middle ring
    const spokeGeom = new THREE.BufferGeometry();
    const spokePoints = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      spokePoints.push(
        new THREE.Vector3(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0.13),
        new THREE.Vector3(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.13)
      );
    }
    spokeGeom.setFromPoints(spokePoints);
    const spokes = new THREE.LineSegments(spokeGeom, starMat);
    root.add(spokes);
    layers.push({ mesh: spokes, rotSpeed: -1.1 });

    // --- Layer 5: Pulsing Glowing Core Disc (Z = 0.16) ---
    const coreGeom = new THREE.CircleGeometry(0.14, 24);
    const coreMat = new THREE.MeshBasicMaterial({
      color: GOLD_PALETTE.highlight,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.z = 0.16;
    root.add(core);
    layers.push({ mesh: core, rotSpeed: 0.3, isPulseCore: true });

    // --- Layer 6: Orbiting Particles (Z = 0.18) ---
    const particleCount = 28;
    const pGeom = new THREE.BufferGeometry();
    const pPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const a = (i / particleCount) * Math.PI * 2;
      const r = 0.45 + (i % 3) * 0.18;
      pPositions[i * 3] = Math.cos(a) * r;
      pPositions[i * 3 + 1] = Math.sin(a) * r;
      pPositions[i * 3 + 2] = 0.18 + (Math.random() - 0.5) * 0.05;
    }
    pGeom.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: GOLD_PALETTE.highlight,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const orbitingPoints = new THREE.Points(pGeom, pMat);
    root.add(orbitingPoints);
    layers.push({ mesh: orbitingPoints, rotSpeed: 1.6 });

    return {
      label,
      root,
      layers,
      core,
      progress: 0, // Materialization 0..1
      targetProgress: 0,
      scale: 0,
    };
  }

  toggle(state = null) {
    this.enabled = state !== null ? state : !this.enabled;
    return this.enabled;
  }

  update(leftHand, rightHand, now, dt) {
    const hands = [leftHand, rightHand];

    hands.forEach(hand => {
      const shield = this.shields[hand.label];
      const shouldBeActive = this.enabled && hand.visible && hand.intensity > 0.15 && hand.palmCenter.world;
      shield.targetProgress = shouldBeActive ? 1.0 : 0.0;

      // Smooth materialization progress (0 -> 1 on open, 1 -> 0 on close)
      const speed = shouldBeActive ? 4.2 : 5.0;
      shield.progress = THREE.MathUtils.lerp(shield.progress, shield.targetProgress, Math.min(1.0, dt * speed));

      if (shield.progress < 0.01) {
        shield.root.visible = false;
        return;
      }

      shield.root.visible = true;

      // Position shield slightly in front of palm along normal
      const palmW = hand.palmCenter.world;
      const norm = hand.normal;
      const offsetDistance = 0.16;

      shield.root.position.set(
        palmW.x + norm.x * offsetDistance,
        palmW.y + norm.y * offsetDistance,
        palmW.z + norm.z * offsetDistance
      );

      // Align 3D shield orientation with palm normal
      const targetLook = new THREE.Vector3(
        shield.root.position.x + norm.x,
        shield.root.position.y + norm.y,
        shield.root.position.z + norm.z
      );
      shield.root.lookAt(targetLook);

      // Materialization scale animation
      const scaleEase = Math.sin(shield.progress * Math.PI * 0.5);
      shield.root.scale.setScalar(scaleEase * 0.95);

      // Rotate individual concentric layers (some CW, some CCW)
      shield.layers.forEach(layer => {
        layer.mesh.rotation.z += layer.rotSpeed * dt;
        if (layer.isPulseCore) {
          const pulse = 1.0 + 0.18 * Math.sin(now * 0.007);
          layer.mesh.scale.setScalar(pulse);
        }
      });
    });

    // Dual Shield Clash Detection
    this._checkDualShieldClash(now);
  }

  _checkDualShieldClash(now) {
    const leftShield = this.shields.LEFT;
    const rightShield = this.shields.RIGHT;

    if (!leftShield.root.visible || !rightShield.root.visible) return;
    if (leftShield.progress < 0.8 || rightShield.progress < 0.8) return;

    const dist = leftShield.root.position.distanceTo(rightShield.root.position);
    const clashThreshold = 0.75; // Proximity required for clash

    if (dist < clashThreshold && (now - this.lastClashTime > this.clashCooldown)) {
      this.lastClashTime = now;

      // Midpoint between shields
      const clashPos = new THREE.Vector3()
        .addVectors(leftShield.root.position, rightShield.root.position)
        .multiplyScalar(0.5);

      // Trigger magical collision shockwaves and burst
      if (this.particleSystem) {
        this.particleSystem.emitShockwave(clashPos, 1.8, GOLD_PALETTE.primary);
        this.particleSystem.emitShockwave(clashPos, 1.2, 0xff3ea5);
        this.particleSystem.emitShockwave(clashPos, 0.8, 0x00f2fe);
        this.particleSystem.emitBurst(clashPos, 50, GOLD_PALETTE.highlight);
      }
    }
  }
}
