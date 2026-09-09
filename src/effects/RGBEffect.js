/**
 * RGBEffect implements the signature RGB Hand Driver visual experience.
 * Emits dynamic velocity-reactive chromatic particles and luminous trails
 * across cyan, magenta, and electric white.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class RGBEffect {
  constructor(scene, particleSystem) {
    this.scene = scene;
    this.particleSystem = particleSystem;
    this.lastBurstTime = { LEFT: 0, RIGHT: 0 };
    this.lastEmitTime = { LEFT: 0, RIGHT: 0 };
  }

  update(leftHand, rightHand, now, dt) {
    [leftHand, rightHand].forEach(hand => {
      if (!hand.visible || hand.intensity < 0.15 || !hand.palmCenter.world) return;

      const speed = hand.velocity.speed;
      const palmW = hand.palmCenter.world;

      // 1. Motion Trail Particles (emits continuously when moving)
      if (speed > 0.4 && (now - this.lastEmitTime[hand.label] > 32)) {
        this.lastEmitTime[hand.label] = now;

        const count = speed > 2.0 ? 3 : 1;
        const colHex = hand.label === 'LEFT' ? 0xff3ea5 : 0x00f2fe;

        if (this.particleSystem) {
          for (let i = 0; i < count; i++) {
            const jitterPos = new THREE.Vector3(
              palmW.x + (Math.random() - 0.5) * 0.12,
              palmW.y + (Math.random() - 0.5) * 0.12,
              palmW.z + (Math.random() - 0.5) * 0.1
            );
            this.particleSystem.emitBurst(jitterPos, 1, (i % 2 === 0 ? colHex : 0xffffff));
          }
        }
      }

      // 2. High-speed snap burst (> 3.5 m/s)
      if (speed > 3.5 && (now - this.lastBurstTime[hand.label] > 450)) {
        this.lastBurstTime[hand.label] = now;
        if (this.particleSystem) {
          const burstPos = new THREE.Vector3(palmW.x, palmW.y, palmW.z);
          this.particleSystem.emitBurst(burstPos, 24, hand.label === 'LEFT' ? 0xff2df0 : 0x00f2fe);
          this.particleSystem.emitBurst(burstPos, 12, 0xffffff);
        }
      }
    });
  }
}
