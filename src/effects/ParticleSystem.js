/**
 * ParticleSystem manages high-performance GPU particle bursts, throw trails,
 * and expanding shockwaves using pre-allocated buffer geometries and additive blending.
 */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const MAX_PARTICLES = 600;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    // Pre-allocated particle pool
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);

    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        r: 1, g: 1, b: 1,
        size: 0.1,
        life: 0,
        maxLife: 1,
        gravity: -1.5,
      });
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Custom glowing particle texture generated dynamically via canvas
    const particleTexture = this._createParticleTexture();

    this.material = new THREE.PointsMaterial({
      size: 0.22,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Active shockwaves pool
    this.shockwaves = [];
  }

  _createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(180,240,255,0.85)');
    grad.addColorStop(0.6, 'rgba(0,180,255,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  /**
   * Spawns an omnidirectional spark burst at target 3D position.
   */
  emitBurst(pos, count = 15, hexColor = 0x00f2fe) {
    const col = new THREE.Color(hexColor);
    let spawned = 0;

    for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = pos.x;
        p.y = pos.y;
        p.z = pos.z;

        const angle = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const speed = 0.8 + Math.random() * 2.8;

        p.vx = Math.sin(phi) * Math.cos(angle) * speed;
        p.vy = Math.sin(phi) * Math.sin(angle) * speed;
        p.vz = Math.cos(phi) * speed * 0.7;

        p.r = col.r;
        p.g = col.g;
        p.b = col.b;
        p.size = 0.14 + Math.random() * 0.16;
        p.life = 0.35 + Math.random() * 0.45;
        p.maxLife = p.life;
        p.gravity = -2.2;
        spawned++;
      }
    }
  }

  /**
   * Emits trailing particles behind a thrown object.
   */
  emitThrowTrail(pos, vel, hexColor = 0x00f2fe) {
    const col = new THREE.Color(hexColor);
    for (let i = 0; i < 4; i++) {
      const idx = this.particles.findIndex(p => !p.active);
      if (idx !== -1) {
        const p = this.particles[idx];
        p.active = true;
        p.x = pos.x + (Math.random() - 0.5) * 0.15;
        p.y = pos.y + (Math.random() - 0.5) * 0.15;
        p.z = pos.z + (Math.random() - 0.5) * 0.15;
        p.vx = vel.x * 0.2 + (Math.random() - 0.5) * 0.3;
        p.vy = vel.y * 0.2 + (Math.random() - 0.5) * 0.3;
        p.vz = vel.z * 0.2 + (Math.random() - 0.5) * 0.3;
        p.r = col.r; p.g = col.g; p.b = col.b;
        p.size = 0.18;
        p.life = 0.45;
        p.maxLife = 0.45;
        p.gravity = 0;
      }
    }
  }

  /**
   * Emits an expanding 3D energy shockwave ring.
   */
  emitShockwave(pos, maxRadius = 1.2, hexColor = 0xffa500) {
    const ringGeom = new THREE.RingGeometry(0.05, 0.12, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: hexColor,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(ringGeom, ringMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      mat: ringMat,
      radius: 0.1,
      maxRadius,
      life: 1.0,
      speed: 4.5,
    });
  }

  update(dt) {
    let activeCount = 0;
    const posAttr = this.geometry.attributes.position;
    const colAttr = this.geometry.attributes.color;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.active) {
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          this.positions[i * 3 + 1] = -999;
          continue;
        }

        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.vz *= 0.97;

        const progress = p.life / p.maxLife;
        this.positions[i * 3] = p.x;
        this.positions[i * 3 + 1] = p.y;
        this.positions[i * 3 + 2] = p.z;

        this.colors[i * 3] = p.r * progress;
        this.colors[i * 3 + 1] = p.g * progress;
        this.colors[i * 3 + 2] = p.b * progress;

        activeCount++;
      } else {
        this.positions[i * 3 + 1] = -999; // Park off-screen
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Update shockwaves
    this.shockwaves = this.shockwaves.filter(sw => {
      sw.life -= dt * 1.8;
      if (sw.life <= 0) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mat.dispose();
        return false;
      }
      sw.radius += sw.speed * dt;
      const scale = sw.radius;
      sw.mesh.scale.set(scale, scale, 1);
      sw.mat.opacity = sw.life * 0.85;
      return true;
    });
  }
}
