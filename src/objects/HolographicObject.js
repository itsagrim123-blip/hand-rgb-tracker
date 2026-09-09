/**
 * HolographicObject generates visually stunning sci-fi holographic meshes
 * with layered geometry, edge glows, emissive pulses, and transparent cores.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const PALETTES = [
  { main: 0x00f2fe, emissive: 0x033b47, edge: 0x8affff }, // Cyan
  { main: 0xff3ea5, emissive: 0x47032d, edge: 0xffb3e5 }, // Magenta
  { main: 0xffb834, emissive: 0x472d03, edge: 0xffe299 }, // Amber
  { main: 0x3dff88, emissive: 0x04471b, edge: 0xb5ffce }, // Emerald
  { main: 0xa855f7, emissive: 0x2e064d, edge: 0xe9c8ff }, // Violet
];

export class HolographicObject {
  /**
   * Creates a holographic mesh composite (solid translucent core + edge lines + inner accent).
   */
  static create(type = 'CUBE', colorIndex = 0) {
    const palette = PALETTES[colorIndex % PALETTES.length];
    const group = new THREE.Group();

    let geom;
    let radius = 0.4;

    switch (type) {
      case 'CUBE':
        geom = new THREE.BoxGeometry(0.72, 0.72, 0.72);
        radius = 0.5;
        break;
      case 'SPHERE':
        geom = new THREE.SphereGeometry(0.45, 24, 24);
        radius = 0.45;
        break;
      case 'TORUS':
        geom = new THREE.TorusGeometry(0.42, 0.14, 16, 32);
        radius = 0.52;
        break;
      case 'ICOSAHEDRON':
        geom = new THREE.IcosahedronGeometry(0.48, 0);
        radius = 0.48;
        break;
      case 'PRISM':
        geom = new THREE.CylinderGeometry(0.48, 0.48, 0.72, 3);
        radius = 0.5;
        break;
      case 'BEAM':
        geom = new THREE.CylinderGeometry(0.09, 0.09, 1.3, 16);
        radius = 0.65;
        break;
      case 'ENERGY_ORB':
      default:
        geom = new THREE.IcosahedronGeometry(0.42, 1);
        radius = 0.45;
        break;
    }

    // 1. Translucent holographic body
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: palette.main,
      emissive: palette.emissive,
      emissiveIntensity: 0.8,
      metalness: 0.2,
      roughness: 0.15,
      transmission: 0.55,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const bodyMesh = new THREE.Mesh(geom, bodyMat);
    group.add(bodyMesh);

    // 2. High-contrast edge lines for holographic wireframe aesthetic
    if (type !== 'SPHERE') {
      const edgesGeom = new THREE.EdgesGeometry(geom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: palette.edge,
        transparent: true,
        opacity: 0.95,
        linewidth: 2,
        blending: THREE.AdditiveBlending,
      });
      const edgeLines = new THREE.LineSegments(edgesGeom, edgeMat);
      group.add(edgeLines);
    } else {
      // Sphere latitude/longitude rings
      const ringGeom = new THREE.TorusGeometry(0.46, 0.012, 8, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: palette.edge,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.85,
      });
      const ring1 = new THREE.Mesh(ringGeom, ringMat);
      const ring2 = new THREE.Mesh(ringGeom, ringMat);
      ring2.rotation.x = Math.PI * 0.5;
      group.add(ring1);
      group.add(ring2);
    }

    // 3. Inner glowing core
    const coreGeom = new THREE.SphereGeometry(0.16, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    group.add(coreMesh);

    group.userData = {
      type,
      radius,
      bodyMat,
      coreMesh,
      pulseSpeed: 2.5 + Math.random() * 2.0,
      palette,
    };

    return group;
  }

  /**
   * Creates an interactive 3D object from a drawn CatmullRom curve.
   */
  static createFromCurve(curve, colorIndex = 0) {
    const palette = PALETTES[colorIndex % PALETTES.length];
    const group = new THREE.Group();

    const tubeGeom = new THREE.TubeGeometry(curve, 64, 0.05, 8, false);
    const mat = new THREE.MeshStandardMaterial({
      color: palette.main,
      emissive: palette.emissive,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.5,
      transparent: true,
      opacity: 0.9,
    });
    const tubeMesh = new THREE.Mesh(tubeGeom, mat);
    group.add(tubeMesh);

    // Add glowing inner line
    const points = curve.getPoints(64);
    const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      linewidth: 2,
    });
    const line = new THREE.Line(lineGeom, lineMat);
    group.add(line);

    group.userData = {
      type: 'CUSTOM_DRAWN',
      radius: 0.45,
      bodyMat: mat,
      palette,
    };

    return group;
  }
}
