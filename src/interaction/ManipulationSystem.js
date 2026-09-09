/**
 * ManipulationSystem implements dual-hand simultaneous scale, rotation, and translation
 * when both hands pinch the same 3D holographic object.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class ManipulationSystem {
  constructor(objectManager, particleSystem) {
    this.objectManager = objectManager;
    this.particleSystem = particleSystem;

    // Dual-hand state tracking
    this.initialHandsDist = 0;
    this.initialObjectScale = new THREE.Vector3(1, 1, 1);
    this.activeObject = null;
  }

  /**
   * Updates two-hand manipulation if both hands are pinching the same object.
   */
  update(leftHand, rightHand, dt) {
    if (!leftHand.pinching || !rightHand.pinching || !leftHand.pinchPoint.world || !rightHand.pinchPoint.world) {
      if (this.activeObject) {
        this.activeObject = null;
        this.initialHandsDist = 0;
      }
      return null;
    }

    // Find object held by both hands
    const dualObj = this.objectManager.objects.find(obj =>
      obj.grabbedBy.includes('LEFT') && obj.grabbedBy.includes('RIGHT')
    );

    if (!dualObj) {
      this.activeObject = null;
      this.initialHandsDist = 0;
      return null;
    }

    const pLeft = new THREE.Vector3(
      leftHand.pinchPoint.world.x,
      leftHand.pinchPoint.world.y,
      leftHand.pinchPoint.world.z
    );
    const pRight = new THREE.Vector3(
      rightHand.pinchPoint.world.x,
      rightHand.pinchPoint.world.y,
      rightHand.pinchPoint.world.z
    );

    const currentDist = pLeft.distanceTo(pRight);

    // Initialize baseline distance and scale upon entering dual manipulation
    if (this.activeObject !== dualObj || this.initialHandsDist <= 0.001) {
      this.activeObject = dualObj;
      this.initialHandsDist = Math.max(0.15, currentDist);
      this.initialObjectScale.copy(dualObj.scale);
    }

    // 1. Position -> Midpoint between hands
    const midpoint = new THREE.Vector3().addVectors(pLeft, pRight).multiplyScalar(0.5);
    const followFactor = 1.0 - Math.pow(0.0008, dt);
    dualObj.position.lerp(midpoint, followFactor);

    // 2. Scale -> Relative hand separation distance (clamped between 0.35x and 3.5x)
    const scaleRatio = THREE.MathUtils.clamp(currentDist / this.initialHandsDist, 0.35, 3.5);
    const targetScale = this.initialObjectScale.clone().multiplyScalar(scaleRatio);
    dualObj.targetScale.copy(targetScale);

    // 3. Rotation -> Angle of the vector connecting both hands in the XY view plane
    const delta = new THREE.Vector3().subVectors(pRight, pLeft);
    const angleXY = Math.atan2(delta.y, delta.x);
    dualObj.mesh.rotation.z = THREE.MathUtils.lerp(dualObj.mesh.rotation.z, angleXY, Math.min(1.0, dt * 12.0));

    // Also tilt in 3D around X based on depth difference
    const angleXZ = Math.atan2(delta.z, delta.x);
    dualObj.mesh.rotation.y = THREE.MathUtils.lerp(dualObj.mesh.rotation.y, -angleXZ * 0.8, Math.min(1.0, dt * 8.0));

    return {
      object: dualObj,
      pLeft,
      pRight,
      midpoint,
      scaleRatio,
    };
  }
}
