/**
 * HolographicObject builds high-performance, vibrant sci-fi holographic 3D meshes
 * with layered glowing wireframes, emissive geometric facets, and pulsing cores.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const PALETTES = [
  { main: 0x00f2fe, emissive: 0x004d5a, edge: 0x8affff, core: 0xffffff }, // Cyan
  { main: 0xff3ea5, emissive: 0x5a0038, edge: 0xffb5e6, core: 0xffffff }, // Magenta
  { main: 0xffa726, emissive: 0x5a3300, edge: 0xffe6b3, core: 0xffffff }, // Solar Gold
  { main: 0x00ff88, emissive: 0x005a2b, edge: 0xb5ffda, core: 0xffffff }, // Emerald
  { main: 0xa855f7, emissive: 0x3d0066, edge: 0xe8c7ff, core: 0xffffff }, // Violet
];

export class HolographicObject {
  static create(type = 'CUBE', colorIndex = 0) {
    const palette = PALETTES[colorIndex % PALETTES.length];
    const group = new THREE.Group();

    let geom;
    let radius = 0.45;

    switch (type) {
      case 'CUBE':
        geom = new THREE.BoxGeometry(0.75, 0.75, 0.75);
        radius = 0.52;
        break;
      case 'SPHERE':
        geom = new THREE.SphereGeometry(0.46, 20, 20);
        radius = 0.46;
        break;
      case 'TORUS':
        geom = new THREE.TorusGeometry(0.44, 0.15, 16, 32);
        radius = 0.54;
        break;
      case 'ICOSAHEDRON':
        geom = new THREE.IcosahedronGeometry(0.48, 0);
        radius = 0.48;
        break;
      case 'PRISM':
        geom = new THREE.CylinderGeometry(0.46, 0.46, 0.75, 3);
        radius = 0.5;
        break;
      case 'BEAM':
        geom = new THREE.CylinderGeometry(0.1, 0.1, 1.3, 16);
        radius = 0.65;
        break;
      case 'ENERGY_ORB':
      default:
        geom = new THREE.IcosahedronGeometry(0.45, 1);
        radius = 0.45;
        break;
    }

    // 1. Faceted translucent holographic body (fast MeshStandardMaterial)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: palette.main,
      emissive: palette.emissive,
      emissiveIntensity: 0.9,
      metalness: 0.35,
      roughness: 0.15,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const bodyMesh = new THREE.Mesh(geom, bodyMat);
    group.add(bodyMesh);

    // 2. High-contrast glowing wireframe edges
    if (type !== 'SPHERE') {
      const edgesGeom = new THREE.EdgesGeometry(geom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: palette.edge,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
      });
      const edgeLines = new THREE.LineSegments(edgesGeom, edgeMat);
      group.add(edgeLines);
    } else {
      const ringGeom = new THREE.TorusGeometry(0.47, 0.015, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: palette.edge,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.88,
      });
      const r1 = new THREE.Mesh(ringGeom, ringMat);
      const r2 = new THREE.Mesh(ringGeom, ringMat);
      r2.rotation.x = Math.PI * 0.5;
      group.add(r1);
      group.add(r2);
    }

    // 3. Inner spinning glowing energy core
    const coreGeom = new THREE.OctahedronGeometry(0.18, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: palette.core,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    group.add(coreMesh);

    group.userData = {
      type,
      radius,
      bodyMat,
      coreMesh,
      palette,
      pulseSpeed: 2.2 + Math.random() * 1.5,
    };

    return group;
  }

  static createFromCurve(curve, colorIndex = 0) {
    const palette = PALETTES[colorIndex % PALETTES.length];
    const group = new THREE.Group();

    const tubeGeom = new THREE.TubeGeometry(curve, 64, 0.055, 8, false);
    const mat = new THREE.MeshStandardMaterial({
      color: palette.main,
      emissive: palette.emissive,
      emissiveIntensity: 1.1,
      roughness: 0.2,
      metalness: 0.4,
      transparent: true,
      opacity: 0.88,
    });
    const tubeMesh = new THREE.Mesh(tubeGeom, mat);
    group.add(tubeMesh);

    const points = curve.getPoints(48);
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
