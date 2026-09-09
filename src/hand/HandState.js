/**
 * HandState encapsulates the complete physical and visual state of a tracked hand.
 * Tracks 21 landmarks, computed palm center, multi-vector orientation, velocity,
 * pinch state, gesture, and position history.
 */

export class HandState {
  constructor(label, color = '#00f2fe') {
    this.label = label; // 'LEFT' or 'RIGHT'
    this.color = color;
    this.visible = false;
    this.confidence = 0;
    this.lastSeen = 0;
    this.intensity = 0; // Smooth 0..1 fade factor for appearance/disappearance

    // Landmarks
    this.rawLandmarks = [];   // Normalized MediaPipe landmarks {x, y, z}
    this.screenPoints = [];   // CSS-mirrored screen pixel coordinates {x, y, z}
    this.worldPoints = [];    // 3D Three.js Vector3 coordinates (populated by CoordinateMapper)

    // Derived landmarks
    this.wrist = null;
    this.palmCenter = { screen: { x: 0, y: 0, z: 0 }, world: null };
    this.previousPalmWorld = null;
    
    // Fingertips
    this.thumbTip = null;
    this.indexTip = null;
    this.middleTip = null;
    this.ringTip = null;
    this.pinkyTip = null;

    // Orientation & Angle
    this.rotation = 0; // 2D rotation in screen plane (radians)
    this.normal = { x: 0, y: 0, z: 1 }; // 3D palm normal vector
    this.up = { x: 0, y: 1, z: 0 };     // 3D wrist -> middle MCP vector
    this.side = { x: 1, y: 0, z: 0 };   // 3D index MCP -> pinky MCP vector

    // Velocity (in 3D world units / second and screen px / second)
    this.velocity = { x: 0, y: 0, z: 0, speed: 0 };
    this.screenVelocity = { x: 0, y: 0, speed: 0 };

    // Pinch state
    this.pinching = false;
    this.pinchStarted = false;
    this.pinchEnded = false;
    this.pinchDistance = 1.0;
    this.rawPinchDistance = 1.0;
    this.pinchPoint = { screen: { x: 0, y: 0, z: 0 }, world: null };

    // Gesture
    this.gesture = 'NONE';
    this.previousGesture = 'NONE';

    // Position history for physical throwing velocity calculation & trail effects
    // Elements: { time, worldPos: Vector3, pinchWorld: Vector3, screenPos: {x,y} }
    this.history = [];
    this.trail = []; // Recent positions for visual rendering
  }

  /**
   * Updates landmarks and recalculates all derived physical properties.
   */
  updateLandmarks(screenPoints, rawLandmarks, confidence, now) {
    this.screenPoints = screenPoints;
    this.rawLandmarks = rawLandmarks;
    this.confidence = confidence;
    this.visible = true;
    this.lastSeen = now;

    if (screenPoints.length < 21) return;

    // Fingertips
    this.wrist = screenPoints[0];
    this.thumbTip = screenPoints[4];
    this.indexTip = screenPoints[8];
    this.middleTip = screenPoints[12];
    this.ringTip = screenPoints[16];
    this.pinkyTip = screenPoints[20];

    // Compute stable palm center from wrist (0) and 4 metacarpals (5, 9, 13, 17)
    this.palmCenter.screen = {
      x: (screenPoints[0].x + screenPoints[5].x + screenPoints[9].x + screenPoints[13].x + screenPoints[17].x) / 5,
      y: (screenPoints[0].y + screenPoints[5].y + screenPoints[9].y + screenPoints[13].y + screenPoints[17].y) / 5,
      z: (screenPoints[0].z + screenPoints[5].z + screenPoints[9].z + screenPoints[13].z + screenPoints[17].z) / 5,
    };

    // Pinch point (midpoint between thumb tip and index tip)
    this.pinchPoint.screen = {
      x: (screenPoints[4].x + screenPoints[8].x) * 0.5,
      y: (screenPoints[4].y + screenPoints[8].y) * 0.5,
      z: ((screenPoints[4].z || 0) + (screenPoints[8].z || 0)) * 0.5,
    };

    // Calculate stable screen rotation from wrist to middle MCP
    this.rotation = Math.atan2(
      screenPoints[9].y - screenPoints[0].y,
      screenPoints[9].x - screenPoints[0].x
    );
  }

  /**
   * Sets world points mapped by CoordinateMapper and calculates 3D orientation & velocity.
   */
  setWorldPoints(worldPoints, dt, now) {
    this.worldPoints = worldPoints;
    if (worldPoints.length < 21) return;

    // Palm center in 3D world space
    const p0 = worldPoints[0];
    const p5 = worldPoints[5];
    const p9 = worldPoints[9];
    const p13 = worldPoints[13];
    const p17 = worldPoints[17];

    const currentPalmWorld = {
      x: (p0.x + p5.x + p9.x + p13.x + p17.x) / 5,
      y: (p0.y + p5.y + p9.y + p13.y + p17.y) / 5,
      z: (p0.z + p5.z + p9.z + p13.z + p17.z) / 5,
    };
    this.palmCenter.world = currentPalmWorld;

    // Pinch point in 3D
    const thumbW = worldPoints[4];
    const indexW = worldPoints[8];
    this.pinchPoint.world = {
      x: (thumbW.x + indexW.x) * 0.5,
      y: (thumbW.y + indexW.y) * 0.5,
      z: (thumbW.z + indexW.z) * 0.5,
    };

    // Orientation vectors in 3D:
    // Up vector: wrist -> middle MCP
    const upX = p9.x - p0.x;
    const upY = p9.y - p0.y;
    const upZ = p9.z - p0.z;
    const upLen = Math.hypot(upX, upY, upZ) || 1;
    this.up = { x: upX / upLen, y: upY / upLen, z: upZ / upLen };

    // Side vector: index MCP -> pinky MCP
    const sideX = p17.x - p5.x;
    const sideY = p17.y - p5.y;
    const sideZ = p17.z - p5.z;
    const sideLen = Math.hypot(sideX, sideY, sideZ) || 1;
    this.side = { x: sideX / sideLen, y: sideY / sideLen, z: sideZ / sideLen };

    // Normal vector: cross product (side x up)
    let normX = this.side.y * this.up.z - this.side.z * this.up.y;
    let normY = this.side.z * this.up.x - this.side.x * this.up.z;
    let normZ = this.side.x * this.up.y - this.side.y * this.up.x;
    const normLen = Math.hypot(normX, normY, normZ) || 1;
    this.normal = { x: normX / normLen, y: normY / normLen, z: normZ / normLen };

    // 3D Velocity calculation
    if (this.previousPalmWorld && dt > 0.0001) {
      const vx = (currentPalmWorld.x - this.previousPalmWorld.x) / dt;
      const vy = (currentPalmWorld.y - this.previousPalmWorld.y) / dt;
      const vz = (currentPalmWorld.z - this.previousPalmWorld.z) / dt;
      const speed = Math.hypot(vx, vy, vz);

      // Low-pass smooth the velocity vector
      const alpha = Math.min(1.0, dt * 18.0);
      this.velocity.x += (vx - this.velocity.x) * alpha;
      this.velocity.y += (vy - this.velocity.y) * alpha;
      this.velocity.z += (vz - this.velocity.z) * alpha;
      this.velocity.speed = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
    }
    this.previousPalmWorld = { ...currentPalmWorld };

    // Record to history buffer (sliding window of last 10 frames)
    this.history.unshift({
      time: now,
      palmWorld: { ...currentPalmWorld },
      pinchWorld: { ...this.pinchPoint.world },
      screenPos: { ...this.palmCenter.screen },
    });
    if (this.history.length > 15) this.history.pop();

    // Trail buffer
    this.trail.unshift({
      x: currentPalmWorld.x,
      y: currentPalmWorld.y,
      z: currentPalmWorld.z,
      time: now,
      speed: this.velocity.speed,
    });
    if (this.trail.length > 24) this.trail.pop();
  }

  /**
   * Resets hand tracking state when lost.
   */
  reset() {
    this.visible = false;
    this.pinching = false;
    this.pinchStarted = false;
    this.pinchEnded = false;
    this.gesture = 'NONE';
    this.rawLandmarks = [];
    this.screenPoints = [];
    this.worldPoints = [];
    this.previousPalmWorld = null;
    this.velocity = { x: 0, y: 0, z: 0, speed: 0 };
    this.history = [];
    this.trail = [];
  }
}
