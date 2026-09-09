/**
 * InteractionManager coordinates GrabSystem, ThrowSystem, ManipulationSystem,
 * and DrawingSystem into a unified, conflict-free interaction lifecycle.
 */

import { GrabSystem } from "./GrabSystem.js";
import { ThrowSystem } from "./ThrowSystem.js";
import { ManipulationSystem } from "./ManipulationSystem.js";
import { DrawingSystem } from "./DrawingSystem.js";

export class InteractionManager {
  constructor(scene, objectManager, particleSystem, energySystem) {
    this.scene = scene;
    this.objectManager = objectManager;
    this.particleSystem = particleSystem;
    this.energySystem = energySystem;

    this.grabSystem = new GrabSystem(objectManager, particleSystem);
    this.throwSystem = new ThrowSystem(objectManager, particleSystem);
    this.manipulationSystem = new ManipulationSystem(objectManager, particleSystem);
    this.drawingSystem = new DrawingSystem(scene, objectManager, particleSystem);

    this.currentMode = 'IDLE'; // 'IDLE' | 'GRABBING' | 'DUAL_CONTROL' | 'DRAWING'
  }

  update(leftHand, rightHand, now, dt) {
    const hands = [leftHand, rightHand].filter(h => h.visible && h.intensity > 0.1);

    // 1. Air Drawing Updates
    hands.forEach(hand => {
      this.drawingSystem.update(hand, now, dt);
    });

    if (this.drawingSystem.isDrawing) {
      this.currentMode = 'DRAWING';
      return;
    }

    // 2. Process Pinch Starts & Releases
    hands.forEach(hand => {
      if (hand.pinchStarted) {
        this.grabSystem.checkGrab(hand);
      }
      if (hand.pinchEnded) {
        this.throwSystem.handleRelease(hand);
      }
    });

    // 3. Dual-Hand Manipulation Check
    const dualResult = (leftHand.visible && rightHand.visible)
      ? this.manipulationSystem.update(leftHand, rightHand, dt)
      : null;

    if (dualResult) {
      this.currentMode = 'DUAL_CONTROL';
      // Energy tether between hands through the object
      if (this.energySystem) {
        this.energySystem.renderDualTether(dualResult.pLeft, dualResult.pRight, dualResult.midpoint);
      }
    } else {
      // 4. Single-Hand Grab Follow
      let anyGrabbed = false;
      hands.forEach(hand => {
        this.grabSystem.updateGrabbed(hand, dt);
        const isHolding = this.objectManager.objects.some(obj => obj.grabbedBy.includes(hand.label));
        if (isHolding) anyGrabbed = true;
      });

      this.currentMode = anyGrabbed ? 'GRABBING' : 'IDLE';
    }
  }
}
