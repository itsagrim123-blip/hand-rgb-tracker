/**
 * ThrowSystem computes real physical release velocity and angular momentum
 * from timestamped hand trajectory history buffers.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class ThrowSystem {
  constructor(objectManager, particleSystem) {
    this.objectManager = objectManager;
    this.particleSystem = particleSystem;
    this.throwVelocityMultiplier = 1.35; // AR physics feel tuning
  }

  /**
   * Computes throw velocity from hand history when pinch ends.
   */
  handleRelease(hand) {
    if (!hand.pinchEnded) return;

    // Find all objects released by this hand
    const releasedObjects = this.objectManager.objects.filter(obj =>
      obj.grabbedBy.includes(hand.label)
    );

    releasedObjects.forEach(obj => {
      obj.release(hand.label);

      // Only apply throw physics if no hands are still holding it
      if (!obj.isGrabbed()) {
        const throwVel = this._calculateThrowVelocity(hand);
        const angularImpulse = this._calculateAngularImpulse(throwVel, hand);

        obj.throwWithVelocity(throwVel, angularImpulse);

        // Emit throw trail particles if thrown with significant speed
        if (throwVel.length() > 1.2 && this.particleSystem) {
          this.particleSystem.emitThrowTrail(obj.position, throwVel, obj.mesh.userData.palette?.edge || 0x00f2fe);
        }
      }
    });
  }

  /**
   * Computes robust finite-difference velocity from the sliding history window.
   */
  _calculateThrowVelocity(hand) {
    const history = hand.history;
    if (!history || history.length < 2) {
      // Fallback to current hand velocity
      return new THREE.Vector3(
        hand.velocity.x * 0.003,
        hand.velocity.y * 0.003,
        hand.velocity.z * 0.003
      );
    }

    // Look back approximately 80-120ms for stable finite-difference trajectory
    const latest = history[0];
    let anchor = history[history.length - 1];

    for (let i = 1; i < history.length; i++) {
      const dt = (latest.time - history[i].time) / 1000.0;
      if (dt >= 0.075 && dt <= 0.16) {
        anchor = history[i];
        break;
      }
    }

    const dt = Math.max(0.016, (latest.time - anchor.time) / 1000.0);
    const pEnd = latest.pinchWorld || latest.palmWorld;
    const pStart = anchor.pinchWorld || anchor.palmWorld;

    const vx = ((pEnd.x - pStart.x) / dt) * this.throwVelocityMultiplier;
    const vy = ((pEnd.y - pStart.y) / dt) * this.throwVelocityMultiplier;
    const vz = ((pEnd.z - pStart.z) / dt) * this.throwVelocityMultiplier;

    const velocity = new THREE.Vector3(vx, vy, vz);

    // Speed ceiling for sanity in AR space
    const speed = velocity.length();
    if (speed > 16.0) {
      velocity.multiplyScalar(16.0 / speed);
    }

    return velocity;
  }

  /**
   * Derives natural spin / angular momentum from throw direction and hand movement.
   */
  _calculateAngularImpulse(throwVel, hand) {
    const speed = throwVel.length();
    if (speed < 0.4) {
      return new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      );
    }

    // Spin axis perpendicular to velocity direction
    return new THREE.Vector3(
      -throwVel.y * 1.2 + (Math.random() - 0.5) * 0.5,
      throwVel.x * 1.5,
      (hand.rotation || 0) * 2.0
    );
  }
}
