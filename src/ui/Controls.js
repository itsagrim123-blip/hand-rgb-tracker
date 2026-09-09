/**
 * Controls handles floating UI action buttons, keyboard shortcuts,
 * quality presets, and touchless fingertip hovering/pinching on virtual buttons.
 */

export class Controls {
  constructor(options) {
    this.onSpawn = options.onSpawn;
    this.onToggleShield = options.onToggleShield;
    this.onToggleDraw = options.onToggleDraw;
    this.onToggleDebug = options.onToggleDebug;
    this.onQualityChange = options.onQualityChange;

    // DOM button references
    this.spawnBtn = document.querySelector('#spawn-btn');
    this.shieldBtn = document.querySelector('#shield-toggle');
    this.drawBtn = document.querySelector('#draw-toggle');
    this.debugBtn = document.querySelector('#debug-toggle');
    this.qualitySelect = document.querySelector('#quality-select');

    this.shieldPinchLatch = false;

    this._bindEvents();
  }

  _bindEvents() {
    if (this.spawnBtn) {
      this.spawnBtn.addEventListener('click', () => this.onSpawn && this.onSpawn());
    }

    if (this.shieldBtn) {
      this.shieldBtn.addEventListener('click', () => {
        const active = this.onToggleShield && this.onToggleShield();
        this.updateShieldUI(active);
      });
    }

    if (this.drawBtn) {
      this.drawBtn.addEventListener('click', () => {
        const active = this.onToggleDraw && this.onToggleDraw();
        this.updateDrawUI(active);
      });
    }

    if (this.debugBtn) {
      this.debugBtn.addEventListener('click', () => {
        const debug = this.onToggleDebug && this.onToggleDebug();
        this.updateDebugUI(debug);
      });
    }

    if (this.qualitySelect) {
      this.qualitySelect.addEventListener('change', (e) => {
        this.onQualityChange && this.onQualityChange(e.target.value);
      });
    }

    // Keyboard shortcut 'D' for debug
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'd' && !e.repeat) {
        const debug = this.onToggleDebug && this.onToggleDebug();
        this.updateDebugUI(debug);
      }
      if (e.key.toLowerCase() === 's' && !e.repeat) {
        this.onSpawn && this.onSpawn();
      }
      if (e.key.toLowerCase() === 'm' && !e.repeat) {
        const active = this.onToggleShield && this.onToggleShield();
        this.updateShieldUI(active);
      }
    });
  }

  updateShieldUI(active) {
    if (!this.shieldBtn) return;
    this.shieldBtn.classList.toggle('active', active);
    const span = this.shieldBtn.querySelector('span');
    if (span) span.textContent = active ? 'ON' : 'OFF';
  }

  updateDrawUI(active) {
    if (!this.drawBtn) return;
    this.drawBtn.classList.toggle('active', active);
    const span = this.drawBtn.querySelector('span');
    if (span) span.textContent = active ? 'ACTIVE' : 'READY';
  }

  updateDebugUI(debug) {
    if (!this.debugBtn) return;
    this.debugBtn.textContent = `DEBUG: ${debug ? 'ON' : 'OFF'} [D]`;
  }

  /**
   * Checks if any hand is hovering over virtual floating buttons and pinching.
   */
  checkFingertipInteraction(leftHand, rightHand) {
    if (!this.shieldBtn) return;
    const rect = this.shieldBtn.getBoundingClientRect();
    let hovering = false;
    let pinching = false;

    [leftHand, rightHand].forEach(hand => {
      if (!hand.visible || hand.intensity < 0.2 || !hand.screenPoints.length) return;
      const tip = hand.screenPoints[8]; // Index tip
      if (tip.x >= rect.left && tip.x <= rect.right && tip.y >= rect.top && tip.y <= rect.bottom) {
        hovering = true;
        if (hand.pinching) pinching = true;
      }
    });

    this.shieldBtn.classList.toggle('hand-hover', hovering);

    if (hovering && pinching && !this.shieldPinchLatch) {
      this.shieldPinchLatch = true;
      const active = this.onToggleShield && this.onToggleShield();
      this.updateShieldUI(active);
    } else if (!pinching) {
      this.shieldPinchLatch = false;
    }
  }
}
