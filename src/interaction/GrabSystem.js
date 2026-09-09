/**
 * GrabSystem handles natural 3D pinch-grabbing of holographic objects.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class GrabSystem {
  constructor(objectManager, particleSystem) {
    this.objectManager = objectManager;
    this.particleSystem = particleSystem;
    this.grabThreshold = 0.85; // Generous 3D world grab radius
    this.offsets = { LEFT: new THREE.Vector3(), RIGHT: new THREE.Vector3() };
  }

  checkGrab(hand) {
    if (!hand.pinching || !hand.pinchPoint.world) return null;

    // Check if hand is already holding an object
    const alreadyHolding = this.objectManager.objects.some(obj => obj.grabbedBy.includes(hand.label));
    if (alreadyHolding) return null;

    const pinchPos = new THREE.Vector3(
      hand.pinchPoint.world.x,
      hand.pinchPoint.world.y,
      hand.pinchPoint.world.z
    );

    let closestObj = null;
    let closestDist = this.grabThreshold;

    for (const obj of this.objectManager.objects) {
      const dist = obj.position.distanceTo(pinchPos);
      const effectiveThreshold = this.grabThreshold + obj.radius * 0.6;
      if (dist < effectiveThreshold && dist < closestDist) {
        closestDist = dist;
        closestObj = obj;
      }
    }

    if (closestObj) {
      closestObj.grab(hand.label);
      this.offsets[hand.label].copy(closestObj.position).sub(pinchPos);

      if (this.particleSystem) {
        this.particleSystem.emitBurst(closestObj.position, 18, hand.color);
      }
      return closestObj;
    }

    return null;
  }

  updateGrabbed(hand, dt) {
    if (!hand.pinching || !hand.pinchPoint.world) return;

    const pinchPos = new THREE.Vector3(
      hand.pinchPoint.world.x,
      hand.pinchPoint.world.y,
      hand.pinchPoint.world.z
    );

    const held = this.objectManager.objects.find(
      obj => obj.grabbedBy.length === 1 && obj.grabbedBy[0] === hand.label
    );

    if (held) {
      const targetPos = pinchPos.clone().add(this.offsets[hand.label]);
      const followSpeed = 1.0 - Math.pow(0.0001, dt);
      held.position.lerp(targetPos, followSpeed);

      // Subtle tilt aligned with hand orientation
      held.mesh.rotation.z = THREE.MathUtils.lerp(held.mesh.rotation.z, hand.rotation * 0.5, 0.2);
    }
  }
}
