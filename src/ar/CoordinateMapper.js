/**
 * CoordinateMapper provides pixel-perfect alignment between:
 * 1. CSS-mirrored webcam video (object-fit: cover, scaleX(-1))
 * 2. MediaPipe normalized landmarks
 * 3. Three.js 3D perspective world space
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class CoordinateMapper {
  constructor(videoElement) {
    this.video = videoElement;
    this.depthScale = 3.5;
  }

  /**
   * Converts normalized MediaPipe landmark (0..1) to CSS-mirrored screen pixel coordinates.
   * Matches CSS: object-fit: cover and transform: scaleX(-1).
   */
  landmarkToScreen(landmark) {
    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    const videoRatio = vw / vh;
    const screenRatio = window.innerWidth / window.innerHeight;

    let x, y, z;

    if (videoRatio > screenRatio) {
      // Video is wider than screen -> horizontal cropping
      const shownWidth = window.innerHeight * videoRatio;
      const xOffset = (window.innerWidth - shownWidth) * 0.5;
      x = xOffset + (1.0 - landmark.x) * shownWidth;
      y = landmark.y * window.innerHeight;
      z = (landmark.z || 0) * shownWidth;
    } else {
      // Video is taller than screen -> vertical cropping
      const shownHeight = window.innerWidth / videoRatio;
      const yOffset = (window.innerHeight - shownHeight) * 0.5;
      x = (1.0 - landmark.x) * window.innerWidth;
      y = yOffset + landmark.y * shownHeight;
      z = (landmark.z || 0) * shownHeight;
    }

    return { x, y, z };
  }

  /**
   * Converts screen pixel coordinates {x, y, z} into Three.js 3D world space.
   * Mathematically guarantees that a 3D point at (world.x, world.y, world.z)
   * projects back to (screen.x, screen.y) on the canvas.
   */
  mediaPipeToWorld(point, camera, targetZ = null) {
    const screen = (point.x <= 1.0 && point.y <= 1.0 && !point.isScreen)
      ? this.landmarkToScreen(point)
      : point;

    // Use interaction plane at Z = 0 by default, with subtle depth offset
    const zWorld = targetZ !== null
      ? targetZ
      : THREE.MathUtils.clamp(-(screen.z || 0) / Math.max(window.innerWidth, 1) * this.depthScale, -1.0, 1.0);

    const distance = camera.position.z - zWorld;
    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2.0 * Math.tan(vFovRad * 0.5) * distance;
    const visibleWidth = visibleHeight * camera.aspect;

    const worldX = (screen.x / window.innerWidth - 0.5) * visibleWidth;
    const worldY = (0.5 - screen.y / window.innerHeight) * visibleHeight;

    return new THREE.Vector3(worldX, worldY, zWorld);
  }

  /**
   * Converts a Three.js 3D world coordinate back to screen pixel coordinates.
   */
  worldToScreen(worldPoint, camera) {
    const v = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z);
    v.project(camera);

    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      z: v.z,
    };
  }
}
