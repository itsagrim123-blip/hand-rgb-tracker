/**
 * HUD manages the minimal corner AR telemetry readout and the toggled
 * full debug visualization overlay (toggled via D key).
 */

const HAND_CONNECTIONS = [
  [0, 1, 2, 3, 4],       // Thumb
  [0, 5, 6, 7, 8],       // Index
  [0, 9, 10, 11, 12],    // Middle
  [0, 13, 14, 15, 16],   // Ring
  [0, 17, 18, 19, 20],   // Pinky
  [5, 9, 13, 17, 0],     // Palm base
];

export class HUD {
  constructor(hudElement, canvasElement) {
    this.hudElement = hudElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    // Telemetry fields in DOM
    this.statusEl = document.querySelector('#system-status');
    this.handsEl = document.querySelector('#hands-status');
    this.objectsEl = document.querySelector('#objects-status');
    this.modeEl = document.querySelector('#mode-status');
    this.fpsEl = document.querySelector('#fps-status');

    this.debug = false;
  }

  toggleDebug(force = null) {
    this.debug = force !== null ? force : !this.debug;
    return this.debug;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(leftHand, rightHand, objectCount, interactionMode, fps, detectFps, rendererInfo) {
    // 1. Update Minimal Corner Telemetry
    const visibleCount = (leftHand.visible ? 1 : 0) + (rightHand.visible ? 1 : 0);
    if (this.handsEl) this.handsEl.textContent = `${visibleCount} / 2`;
    if (this.objectsEl) this.objectsEl.textContent = `${objectCount}`;
    if (this.modeEl) this.modeEl.textContent = interactionMode;
    if (this.fpsEl) this.fpsEl.textContent = `${Math.round(fps)} FPS`;

    // 2. Clear 2D Canvas
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // 3. Render Hand Landmarks
    [leftHand, rightHand].forEach(hand => {
      if (this.debug) {
        this._renderDebugSkeleton(hand);
      } else {
        this._renderSubtleFingertips(hand);
      }
    });

    // 4. Render Full Debug Readout Panel if active
    if (this.debug) {
      this._renderDebugReadout(leftHand, rightHand, objectCount, interactionMode, fps, detectFps, rendererInfo);
    }
  }

  /**
   * Normal Mode: Clean, subtle fingertip rings on index and thumb.
   * Never covers palm with text.
   */
  _renderSubtleFingertips(hand) {
    if (!hand.visible || hand.intensity < 0.1 || hand.screenPoints.length < 21) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = hand.intensity * 0.75;
    ctx.strokeStyle = hand.color;
    ctx.lineWidth = 1.5;

    // Index tip marker (landmark 8)
    const p8 = hand.screenPoints[8];
    ctx.beginPath();
    ctx.arc(p8.x, p8.y, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    // Thumb tip marker (landmark 4)
    const p4 = hand.screenPoints[4];
    ctx.beginPath();
    ctx.arc(p4.x, p4.y, 3.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Debug Mode: Full 21-landmark skeleton with bone connections and IDs.
   */
  _renderDebugSkeleton(hand) {
    if (!hand.visible || hand.screenPoints.length < 21) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = hand.color;
    ctx.fillStyle = hand.color;
    ctx.lineWidth = 1.2;

    // Draw skeletal bone connections
    HAND_CONNECTIONS.forEach(chain => {
      ctx.beginPath();
      chain.forEach((id, i) => {
        const pt = hand.screenPoints[id];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });

    // Draw landmark joints & numeric indices
    ctx.font = '10px "Share Tech Mono", monospace';
    hand.screenPoints.forEach((pt, id) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, id === 8 || id === 4 ? 3.5 : 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(id, pt.x + 4, pt.y - 4);
    });

    // Palm center indicator
    if (hand.palmCenter.screen) {
      ctx.strokeStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(hand.palmCenter.screen.x, hand.palmCenter.screen.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Debug Readout Box on top-right of screen.
   */
  _renderDebugReadout(leftHand, rightHand, objectCount, interactionMode, fps, detectFps, rendererInfo) {
    const ctx = this.ctx;
    const lines = [
      '// DEBUG TELEMETRY [D TO CLOSE]',
      `RENDER FPS: ${Math.round(fps)}  DETECT FPS: ${detectFps || 0}`,
      `INTERACTION MODE: ${interactionMode}`,
      `OBJECT COUNT: ${objectCount}`,
      `THREE DRAWCALLS: ${rendererInfo?.render?.calls || 1}`,
    ];

    [leftHand, rightHand].forEach(h => {
      if (h.visible) {
        lines.push(
          `--- ${h.label} HAND ---`,
          `CONFIDENCE: ${(h.confidence * 100).toFixed(0)}%  GESTURE: ${h.gesture}`,
          `PINCH: ${h.pinching ? 'ACTIVE' : 'OFF'} (${h.pinchDistance.toFixed(3)})`,
          `SPEED: ${h.velocity.speed.toFixed(2)} M/S`,
          `PALM: [${h.palmCenter.screen.x.toFixed(0)}, ${h.palmCenter.screen.y.toFixed(0)}]`
        );
      }
    });

    ctx.save();
    const boxWidth = 260;
    const boxHeight = lines.length * 15 + 20;
    const x = window.innerWidth - boxWidth - 24;
    const y = 24;

    ctx.fillStyle = 'rgba(5, 8, 22, 0.82)';
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillStyle = '#8affff';
    lines.forEach((line, i) => {
      ctx.fillText(line, x + 10, y + 18 + i * 15);
    });

    ctx.restore();
  }
}
