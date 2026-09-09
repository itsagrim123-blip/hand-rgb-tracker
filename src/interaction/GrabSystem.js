/**
 * GrabSystem handles natural 3D pinch-grabbing of holographic objects.
 * Calculates true 3D Euclidean distances and attaches objects to pinch points
 * with smooth spring dynamics.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class GrabSystem {
  constructor(objectManager, particleSystem) {
    this.objectManager = objectManager;
    this.particleSystem = particleSystem;
    this.grabThreshold = 0.72; // Maximum 3D world distance to initiate grab
    this.offsets = { LEFT: new THREE.Vector3(), RIGHT: new THREE.Vector3() };
  }

  /**
   * Attempts to grab the nearest interactive object with the pinching hand.
   */
  checkGrab(hand) {
    if (!hand.pinchStarted || !hand.pinchPoint.world) return null;

    const pinchPos = new THREE.Vector3(
      hand.pinchPoint.world.x,
      hand.pinchPoint.world.y,
      hand.pinchPoint.world.z
    );

    // Find closest object within 3D grab threshold
    let closestObj = null;
    let closestDist = this.grabThreshold;

    for (const obj of this.objectManager.objects) {
      const dist = obj.position.distanceTo(pinchPos);
      const effectiveThreshold = this.grabThreshold + obj.radius * 0.5;
      if (dist < effectiveThreshold && dist < closestDist) {
        closestDist = dist;
        closestObj = obj;
      }
    }

    if (closestObj) {
      closestObj.grab(hand.label);
      // Store relative grab offset
      this.offsets[hand.label].copy(closestObj.position).sub(pinchPos);

      // Emit subtle grab energy sparks
      if (this.particleSystem) {
        this.particleSystem.emitBurst(closestObj.position, 16, hand.color);
      }
      return closestObj;
    }

    return null;
  }

  /**
   * Updates position of single-hand grabbed objects.
   */
  updateGrabbed(hand, dt) {
    if (!hand.pinching || !hand.pinchPoint.world) return;

    const pinchPos = new THREE.Vector3(
      hand.pinchPoint.world.x,
      hand.pinchPoint.world.y,
      hand.pinchPoint.world.z
    );

    // Find object held solely by this hand
    const held = this.objectManager.objects.find(
      obj => obj.grabbedBy.length === 1 && obj.grabbedBy[0] === hand.label
    );

    if (held) {
      // Damped spring-follow motion
      const targetPos = pinchPos.clone().add(this.offsets[hand.label]);
      const followSpeed = 1.0 - Math.pow(0.0005, dt);
      held.position.lerp(targetPos, followSpeed);

      // Subtle tilt aligned with hand rotation
      held.mesh.rotation.z = THREE.MathUtils.lerp(held.mesh.rotation.z, hand.rotation * 0.5, 0.15);
    }
  }
}
