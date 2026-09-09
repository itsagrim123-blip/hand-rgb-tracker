/**
 * ARObject represents an interactive 3D object in AR space.
 * Features zero-gravity holographic hover when idle, physical spring grab attachment,
 * true projectile physics when thrown, floor bounces, and automatic return levitation.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class ARObject {
  constructor(meshGroup, initialPos = new THREE.Vector3(0, 0, 0)) {
    this.mesh = meshGroup;
    this.mesh.position.copy(initialPos);

    // Initial base position for idle hover bobbing
    this.basePos = initialPos.clone();

    // Physics
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.angularVelocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      0.4 + (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.4
    );

    this.scale = new THREE.Vector3(1, 1, 1);
    this.targetScale = new THREE.Vector3(1, 1, 1);

    this.gravity = new THREE.Vector3(0, -5.8, 0);
    this.drag = 0.988;
    this.angularDrag = 0.985;
    this.restitution = 0.65;
    this.radius = this.mesh.userData.radius || 0.45;

    // State: 'FLOATING' | 'GRABBED' | 'MANIPULATED' | 'THROWN' | 'SETTLED'
    this.state = 'FLOATING';
    this.grabbedBy = [];
    this.timeSinceInteraction = 0;
    this.settledTimer = 0;
    this.age = Math.random() * 10;
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
    this.state = this.isGrabbedByBoth() ? 'MANIPULATED' : 'GRABBED';
    this.timeSinceInteraction = 0;
    this.settledTimer = 0;
    this.targetScale.set(1.15, 1.15, 1.15);
  }

  release(handLabel) {
    this.grabbedBy = this.grabbedBy.filter(label => label !== handLabel);
    if (this.grabbedBy.length === 0) {
      this.targetScale.set(1.0, 1.0, 1.0);
    } else {
      this.state = 'GRABBED';
    }
    this.timeSinceInteraction = 0;
  }

  throwWithVelocity(linearVelocity, angularImpulse) {
    this.velocity.copy(linearVelocity);
    if (angularImpulse) {
      this.angularVelocity.copy(angularImpulse);
    }
    this.state = 'THROWN';
    this.timeSinceInteraction = 0;
    this.settledTimer = 0;
    this.targetScale.set(1.0, 1.0, 1.0);
  }

  updatePhysics(dt, floorY, bounds) {
    this.age += dt;
    this.timeSinceInteraction += dt;

    // 1. Smooth scale lerp
    this.scale.lerp(this.targetScale, Math.min(1.0, dt * 10.0));
    this.mesh.scale.copy(this.scale);

    // 2. Pulse inner core
    if (this.mesh.userData.coreMesh) {
      const pulse = 1.0 + 0.15 * Math.sin(this.age * (this.mesh.userData.pulseSpeed || 2.5));
      this.mesh.userData.coreMesh.scale.setScalar(pulse);
      this.mesh.userData.coreMesh.rotation.y += dt * 1.5;
      this.mesh.userData.coreMesh.rotation.x += dt * 0.8;
    }

    // 3. If currently grabbed, physics is driven by GrabSystem / ManipulationSystem
    if (this.isGrabbed()) {
      return;
    }

    // 4. Idle Floating Levitation Mode
    if (this.state === 'FLOATING') {
      const bob = Math.sin(this.age * 2.2) * 0.06;
      this.mesh.position.y = this.basePos.y + bob;

      // Gentle floating spin
      this.mesh.rotation.y += dt * 0.5;
      this.mesh.rotation.x += dt * 0.2;
      return;
    }

    // 5. Thrown / Projectile Physics Mode
    const frameDrag = Math.pow(this.drag, dt * 60.0);
    const frameAngDrag = Math.pow(this.angularDrag, dt * 60.0);

    // Apply gravity
    this.velocity.addScaledVector(this.gravity, dt);
    this.velocity.multiplyScalar(frameDrag);

    // Apply linear position
    this.mesh.position.addScaledVector(this.velocity, dt);

    // Apply spin
    this.mesh.rotation.x += this.angularVelocity.x * dt;
    this.mesh.rotation.y += this.angularVelocity.y * dt;
    this.mesh.rotation.z += this.angularVelocity.z * dt;
    this.angularVelocity.multiplyScalar(frameAngDrag);

    // Floor collision
    const effectiveFloor = (floorY !== undefined) ? floorY : -2.1;
    if (this.mesh.position.y - this.radius < effectiveFloor) {
      this.mesh.position.y = effectiveFloor + this.radius;

      if (this.velocity.y < 0) {
        this.velocity.y = -this.velocity.y * this.restitution;
        this.velocity.x *= 0.82;
        this.velocity.z *= 0.82;
        this.angularVelocity.z -= this.velocity.x * 1.8;

        // Settling threshold
        if (Math.abs(this.velocity.y) < 0.3 && Math.hypot(this.velocity.x, this.velocity.z) < 0.3) {
          this.velocity.set(0, 0, 0);
          this.state = 'SETTLED';
        }
      }
    }

    // If settled on floor for > 3.5 seconds, gently levitate back up into view!
    if (this.state === 'SETTLED') {
      this.settledTimer += dt;
      if (this.settledTimer > 3.5) {
        // Return to floating at comfortable height
        this.basePos.set(
          THREE.MathUtils.clamp(this.mesh.position.x, -1.2, 1.2),
          0.3 + Math.random() * 0.3,
          THREE.MathUtils.clamp(this.mesh.position.z, -0.4, 0.4)
        );
        this.state = 'FLOATING';
        this.settledTimer = 0;
      }
    }

    // Boundary containment
    if (bounds) {
      const boundMargin = this.radius * 0.8;
      if (this.mesh.position.x - boundMargin < bounds.left) {
        this.mesh.position.x = bounds.left + boundMargin;
        this.velocity.x = Math.abs(this.velocity.x) * 0.6;
      } else if (this.mesh.position.x + boundMargin > bounds.right) {
        this.mesh.position.x = bounds.right - boundMargin;
        this.velocity.x = -Math.abs(this.velocity.x) * 0.6;
      }

      if (this.mesh.position.z < -2.0) {
        this.mesh.position.z = -2.0;
        this.velocity.z = Math.abs(this.velocity.z) * 0.6;
      } else if (this.mesh.position.z > 1.5) {
        this.mesh.position.z = 1.5;
        this.velocity.z = -Math.abs(this.velocity.z) * 0.6;
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
