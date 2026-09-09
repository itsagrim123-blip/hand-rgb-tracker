/**
 * ObjectManager handles the lifecycle, physics updates, spawning, and disposal
 * of all interactive 3D holographic objects.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";
import { HolographicObject } from "./HolographicObject.js";
import { ARObject } from "./ARObject.js";

const OBJECT_TYPES = ['CUBE', 'SPHERE', 'TORUS', 'ICOSAHEDRON', 'ENERGY_ORB'];

export class ObjectManager {
  constructor(scene) {
    this.scene = scene;
    this.objects = [];
    this.maxObjects = 7;
    this.colorIndex = 0;
  }

  /**
   * Initializes initial starter objects in the scene.
   */
  seedInitialObjects() {
    this.spawn('CUBE', new THREE.Vector3(-1.1, 0.4, 0));
    this.spawn('SPHERE', new THREE.Vector3(0.0, 0.7, 0));
    this.spawn('TORUS', new THREE.Vector3(1.1, 0.4, 0));
  }

  /**
   * Spawns a new holographic 3D object at target position.
   */
  spawn(type = null, position = null) {
    // If pool is at limit, recycle the oldest settled object
    if (this.objects.length >= this.maxObjects) {
      this._recycleOldestObject();
    }

    const chosenType = type || OBJECT_TYPES[this.colorIndex % OBJECT_TYPES.length];
    const mesh = HolographicObject.create(chosenType, this.colorIndex++);
    
    // Position default: center with a slight random spread
    const pos = position || new THREE.Vector3(
      (Math.random() - 0.5) * 1.2,
      0.6 + Math.random() * 0.4,
      (Math.random() - 0.5) * 0.4
    );

    const arObj = new ARObject(mesh, pos);
    // Initial gentle spawn impulse
    arObj.velocity.set(
      (Math.random() - 0.5) * 0.5,
      0.8 + Math.random() * 0.4,
      (Math.random() - 0.5) * 0.3
    );

    this.scene.add(mesh);
    this.objects.push(arObj);
    return arObj;
  }

  /**
   * Spawns an interactive 3D object from a drawn 3D curve.
   */
  spawnFromCurve(curve) {
    if (this.objects.length >= this.maxObjects) {
      this._recycleOldestObject();
    }

    const mesh = HolographicObject.createFromCurve(curve, this.colorIndex++);
    const points = curve.getPoints(10);
    // Compute center of points
    const center = new THREE.Vector3();
    points.forEach(p => center.add(p));
    center.divideScalar(points.length);

    // Center mesh geometry relative to center
    mesh.position.set(0, 0, 0);

    const arObj = new ARObject(mesh, new THREE.Vector3(0, 0, 0));
    arObj.velocity.set(0, 0.3, 0);

    this.scene.add(mesh);
    this.objects.push(arObj);
    return arObj;
  }

  _recycleOldestObject() {
    // Find oldest object that is not currently held
    const available = this.objects.filter(obj => !obj.isGrabbed());
    if (available.length > 0) {
      // Sort by idle time (highest timeSinceInteraction first)
      available.sort((a, b) => b.timeSinceInteraction - a.timeSinceInteraction);
      const target = available[0];
      target.dispose(this.scene);
      this.objects = this.objects.filter(obj => obj !== target);
    }
  }

  update(dt, floorY, bounds) {
    this.objects.forEach(obj => {
      obj.updatePhysics(dt, floorY, bounds);
    });
  }

  clearAll() {
    this.objects.forEach(obj => obj.dispose(this.scene));
    this.objects = [];
  }
}
