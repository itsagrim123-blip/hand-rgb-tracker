/**
 * ARCamera encapsulates Three.js camera configuration aligned with screen dimensions.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class ARCamera {
  constructor(fov = 50, near = 0.1, far = 50) {
    this.camera = new THREE.PerspectiveCamera(
      fov,
      window.innerWidth / window.innerHeight,
      near,
      far
    );
    this.camera.position.set(0, 0, 5.0);
    this.camera.lookAt(0, 0, 0);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  get instance() {
    return this.camera;
  }
}
