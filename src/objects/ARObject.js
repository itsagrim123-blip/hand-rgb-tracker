/**
 * ARObject represents a physical 3D interactive object in the AR world.
 * Simulates true 3D Newtonian physics: velocity, angular velocity, gravity,
 * air drag, floor bounces, restitution, and boundary containment.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class ARObject {
  constructor(meshGroup, initialPos = new THREE.Vector3(0, 0, 0)) {
    this.mesh = meshGroup;
    this.mesh.position.copy(initialPos);

    // Physical state
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.angularVelocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 0.8
    );
    this.scale = new THREE.Vector3(1, 1, 1);
    this.targetScale = new THREE.Vector3(1, 1, 1);

    // Physics parameters
    this.gravity = new THREE.Vector3(0, -6.8, 0); // Snappy AR gravity
    this.drag = 0.986;         // Linear air resistance per frame (60fps baseline)
    this.angularDrag = 0.982;  // Rotational damping
    this.restitution = 0.62;   // Bounciness coefficient
    this.radius = this.mesh.userData.radius || 0.45;
    this.mass = 1.0;

    // Interaction state
    this.state = 'IDLE'; // 'IDLE' | 'GRABBED' | 'MANIPULATED' | 'THROWN' | 'SETTLED'
    this.grabbedBy = []; // Hand labels holding this object: ['LEFT'], ['RIGHT'], or both
    this.lastGrabTime = 0;
    this.timeSinceInteraction = 0;

    // Visual animation clock
    this.age = 0;
  }

  get position() {
    return this.mesh.position;
  }

  isGrabbed() {
    return this.grabbedBy.length > 0;
  }

  isGrabbedByBoth() {
    return this.grabbedBy.length >= 2;
  }

  grab(handLabel) {
    if (!this.grabbedBy.includes(handLabel)) {
      this.grabbedBy.push(handLabel);
    }
    this.velocity.set(0, 0, 0);
    this.angularVelocity.multiplyScalar(0.2);
    this.state = this.isGrabbedByBoth() ? 'MANIPULATED' : 'GRABBED';
    this.timeSinceInteraction = 0;
    this.targetScale.set(1.12, 1.12, 1.12);
  }

  release(handLabel) {
    this.grabbedBy = this.grabbedBy.filter(label => label !== handLabel);
    if (this.grabbedBy.length === 0) {
      this.state = 'THROWN';
      this.targetScale.set(1.0, 1.0, 1.0);
    } else {
      this.state = 'GRABBED';
    }
    this.timeSinceInteraction = 0;
  }

  /**
   * Applies thrown impulse velocity and rotational momentum.
   */
  throwWithVelocity(linearVelocity, angularImpulse) {
    this.velocity.copy(linearVelocity);
    if (angularImpulse) {
      this.angularVelocity.copy(angularImpulse);
    }
    this.state = 'THROWN';
    this.timeSinceInteraction = 0;
    this.targetScale.set(1.0, 1.0, 1.0);
  }

  updatePhysics(dt, floorY, bounds) {
    this.age += dt;
    this.timeSinceInteraction += dt;

    // 1. Smooth scale animation
    this.scale.lerp(this.targetScale, Math.min(1.0, dt * 10.0));
    this.mesh.scale.copy(this.scale);

    // 2. Pulse inner core if present
    if (this.mesh.userData.coreMesh) {
      const pulse = 1.0 + 0.15 * Math.sin(this.age * (this.mesh.userData.pulseSpeed || 3.0));
      this.mesh.userData.coreMesh.scale.setScalar(pulse);
    }

    // 3. Skip free physics integration if currently grabbed
    if (this.isGrabbed()) {
      return;
    }

    // 4. Free flight physics integration
    const frameDrag = Math.pow(this.drag, dt * 60.0);
    const frameAngDrag = Math.pow(this.angularDrag, dt * 60.0);

    // Apply gravity
    this.velocity.addScaledVector(this.gravity, dt);

    // Apply linear air drag
    this.velocity.multiplyScalar(frameDrag);

    // Integrate linear position
    this.mesh.position.addScaledVector(this.velocity, dt);

    // Integrate rotation
    this.mesh.rotation.x += this.angularVelocity.x * dt;
    this.mesh.rotation.y += this.angularVelocity.y * dt;
    this.mesh.rotation.z += this.angularVelocity.z * dt;
    this.angularVelocity.multiplyScalar(frameAngDrag);

    // 5. Floor Collision & Bounce
    const minEffectiveFloor = (floorY !== undefined) ? floorY : -2.1;
    if (this.mesh.position.y - this.radius < minEffectiveFloor) {
      this.mesh.position.y = minEffectiveFloor + this.radius;

      // Invert Y velocity with restitution loss
      if (this.velocity.y < 0) {
        this.velocity.y = -this.velocity.y * this.restitution;

        // Ground friction on X and Z
        this.velocity.x *= 0.82;
        this.velocity.z *= 0.82;

        // Roll momentum on bounce
        this.angularVelocity.z -= this.velocity.x * 1.8;
        this.angularVelocity.x += this.velocity.z * 1.8;

        // Settle when energy is depleted
        if (Math.abs(this.velocity.y) < 0.25 && Math.hypot(this.velocity.x, this.velocity.z) < 0.25) {
          this.velocity.set(0, 0, 0);
          this.angularVelocity.multiplyScalar(0.85);
          this.state = 'SETTLED';
        }
      }
    }

    // 6. Camera View Boundaries (Soft Bounce back into view)
    if (bounds) {
      const boundMargin = this.radius * 0.8;
      if (this.mesh.position.x - boundMargin < bounds.left) {
        this.mesh.position.x = bounds.left + boundMargin;
        this.velocity.x = Math.abs(this.velocity.x) * 0.65;
      } else if (this.mesh.position.x + boundMargin > bounds.right) {
        this.mesh.position.x = bounds.right - boundMargin;
        this.velocity.x = -Math.abs(this.velocity.x) * 0.65;
      }

      // Depth soft containment (-1.8 to 1.8)
      if (this.mesh.position.z < -2.2) {
        this.mesh.position.z = -2.2;
        this.velocity.z = Math.abs(this.velocity.z) * 0.65;
      } else if (this.mesh.position.z > 2.0) {
        this.mesh.position.z = 2.0;
        this.velocity.z = -Math.abs(this.velocity.z) * 0.65;
      }
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
