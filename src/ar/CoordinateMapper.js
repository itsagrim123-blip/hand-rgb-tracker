/**
 * CoordinateMapper provides a unified, single source of truth for:
 * 1. Normalized MediaPipe coordinates -> CSS-mirrored screen coordinates (accounting for object-fit: cover)
 * 2. MediaPipe / Screen coordinates -> Three.js 3D World coordinates (mediaPipeToWorld)
 * 3. Three.js 3D World coordinates -> Screen coordinates (worldToScreen)
 *
 * Prevents double-mirroring and coordinate discrepancies across all subsystems.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

export class CoordinateMapper {
  constructor(videoElement) {
    this.video = videoElement;
    this.depthScale = 3.2; // Scaling factor for landmark.z into 3D world space
    this.interactionPlaneZ = 0.0; // Base Z-depth for 3D interactions
  }

  /**
   * Converts normalized MediaPipe landmark (0..1) to screen pixel coordinates,
   * factoring in camera aspect ratio (object-fit: cover) and single CSS horizontal mirror (scaleX(-1)).
   */
  landmarkToScreen(landmark) {
    const videoRatio = (this.video.videoWidth && this.video.videoHeight)
      ? this.video.videoWidth / this.video.videoHeight
      : 16 / 9;
    const screenRatio = window.innerWidth / window.innerHeight;

    let x, y, z;
    if (videoRatio > screenRatio) {
      // Video is wider than screen -> horizontal cropping
      const renderedWidth = window.innerHeight * videoRatio;
      const xOffset = (window.innerWidth - renderedWidth) * 0.5;
      // Single horizontal flip for CSS-mirrored feed: (1 - landmark.x)
      x = xOffset + (1.0 - landmark.x) * renderedWidth;
      y = landmark.y * window.innerHeight;
      z = (landmark.z || 0) * renderedWidth;
    } else {
      // Video is taller than screen -> vertical cropping
      const renderedHeight = window.innerWidth / videoRatio;
      const yOffset = (window.innerHeight - renderedHeight) * 0.5;
      x = (1.0 - landmark.x) * window.innerWidth;
      y = yOffset + landmark.y * renderedHeight;
      z = (landmark.z || 0) * renderedHeight;
    }

    return { x, y, z };
  }

  /**
   * Converts a screen point or MediaPipe landmark into Three.js 3D World coordinates.
   * Can accept either a screen point {x, y, z} or a raw landmark {x, y, z}.
   */
  mediaPipeToWorld(point, camera, customZ = null) {
    // If normalized point (0 <= x <= 1 && 0 <= y <= 1), convert to screen first
    const screen = (point.x <= 1.0 && point.y <= 1.0 && !point.isScreen)
      ? this.landmarkToScreen(point)
      : point;

    // Target Z in world space
    const targetZ = customZ !== null
      ? customZ
      : this.interactionPlaneZ - Math.min(1.8, Math.max(-1.8, (screen.z || 0) / Math.max(window.innerWidth, 1) * this.depthScale));

    const distance = camera.position.z - targetZ;
    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2.0 * Math.tan(vFovRad * 0.5) * distance;
    const visibleWidth = visibleHeight * camera.aspect;

    const worldX = (screen.x / window.innerWidth - 0.5) * visibleWidth;
    const worldY = (0.5 - screen.y / window.innerHeight) * visibleHeight;

    return new THREE.Vector3(worldX, worldY, targetZ);
  }

  /**
   * Converts a Three.js 3D World coordinate back into screen coordinates {x, y, depth}.
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
