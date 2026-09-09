/**
 * ObjectManager handles spawning, lifecycle, and recycling of 3D holographic objects.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";
import { HolographicObject } from "./HolographicObject.js";
import { ARObject } from "./ARObject.js";

const OBJECT_TYPES = ['CUBE', 'SPHERE', 'TORUS', 'ICOSAHEDRON', 'ENERGY_ORB'];

export class ObjectManager {
  constructor(scene) {
    this.scene = scene;
    this.objects = [];
    this.maxObjects = 6;
    this.colorIndex = 0;
  }

  seedInitialObjects() {
    this.spawn('CUBE', new THREE.Vector3(-0.9, 0.25, 0));
    this.spawn('SPHERE', new THREE.Vector3(0.0, 0.45, 0));
    this.spawn('TORUS', new THREE.Vector3(0.9, 0.25, 0));
  }

  spawn(type = null, position = null) {
    if (this.objects.length >= this.maxObjects) {
      this._recycleOldestObject();
    }

    const chosenType = type || OBJECT_TYPES[this.colorIndex % OBJECT_TYPES.length];
    const mesh = HolographicObject.create(chosenType, this.colorIndex++);

    const pos = position || new THREE.Vector3(
      (Math.random() - 0.5) * 1.2,
      0.35 + Math.random() * 0.25,
      (Math.random() - 0.5) * 0.3
    );

    const arObj = new ARObject(mesh, pos);
    this.scene.add(mesh);
    this.objects.push(arObj);
    return arObj;
  }

  spawnFromCurve(curve) {
    if (this.objects.length >= this.maxObjects) {
      this._recycleOldestObject();
    }

    const mesh = HolographicObject.createFromCurve(curve, this.colorIndex++);
    const points = curve.getPoints(16);
    const center = new THREE.Vector3();
    points.forEach(p => center.add(p));
    center.divideScalar(points.length);

    const arObj = new ARObject(mesh, center);
    this.scene.add(mesh);
    this.objects.push(arObj);
    return arObj;
  }

  _recycleOldestObject() {
    const available = this.objects.filter(obj => !obj.isGrabbed());
    if (available.length > 0) {
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
