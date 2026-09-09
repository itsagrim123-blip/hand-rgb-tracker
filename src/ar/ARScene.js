/**
 * ARScene manages the transparent WebGL renderer, Three.js scene graph,
 * balanced holographic lighting, and world boundaries.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";
import { ARCamera } from "./ARCamera.js";

export class ARScene {
  constructor(containerElement) {
    this.container = containerElement;
    this.scene = new THREE.Scene();
    this.arCamera = new ARCamera();
    this.camera = this.arCamera.instance;

    // High performance transparent WebGL renderer (capped DPR at 1.5 for buttery 60 FPS)
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    this._setupLighting();
    this.floorY = -2.1;
  }

  _setupLighting() {
    // Ambient sci-fi gradient fill
    const hemiLight = new THREE.HemisphereLight(0x95eaff, 0x160a2c, 2.2);
    this.scene.add(hemiLight);

    // Directional key light for holographic specular sheen
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);

    // Rim light for silhouette glow
    const rimLight = new THREE.DirectionalLight(0x00f0ff, 1.8);
    rimLight.position.set(-3, -2, -2);
    this.scene.add(rimLight);
  }

  getWorldBoundsAtZ(z = 0) {
    const dist = this.camera.position.z - z;
    const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const height = 2.0 * Math.tan(vFovRad * 0.5) * dist;
    const width = height * this.camera.aspect;

    return {
      left: -width * 0.5,
      right: width * 0.5,
      top: height * 0.5,
      bottom: -height * 0.5,
      width,
      height,
    };
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.arCamera.resize(w, h);
    this.renderer.setSize(w, h);
    this.floorY = this.getWorldBoundsAtZ(0).bottom + 0.35;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
