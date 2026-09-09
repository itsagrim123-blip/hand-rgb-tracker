/**
 * InteractionManager coordinates Grab, Throw, Dual-Hand Manipulation,
 * and 3D Air Drawing with continuous state tracking and energy arcs.
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

    this.currentMode = 'IDLE';
  }

  update(leftHand, rightHand, now, dt) {
    const hands = [leftHand, rightHand].filter(h => h.visible && h.intensity > 0.1);

    // 1. Air Drawing Mode
    hands.forEach(hand => {
      this.drawingSystem.update(hand, now, dt);
    });

    if (this.drawingSystem.isDrawing) {
      this.currentMode = 'DRAWING';
      if (this.energySystem) {
        this.energySystem.hideDualTether();
        this.energySystem.hideGrabTether();
      }
      return;
    }

    // 2. Pinch Grab & Release
    hands.forEach(hand => {
      if (hand.pinching) {
        this.grabSystem.checkGrab(hand);
      }
      if (hand.pinchEnded) {
        this.throwSystem.handleRelease(hand);
      }
    });

    // 3. Dual-Hand Manipulation
    const dualResult = (leftHand.visible && rightHand.visible)
      ? this.manipulationSystem.update(leftHand, rightHand, dt)
      : null;

    if (dualResult) {
      this.currentMode = 'DUAL_CONTROL';
      if (this.energySystem) {
        this.energySystem.renderDualTether(dualResult.pLeft, dualResult.pRight, dualResult.midpoint);
        this.energySystem.hideGrabTether();
      }
    } else {
      if (this.energySystem) {
        this.energySystem.hideDualTether();
      }

      // 4. Single-Hand Grab Follow
      let activeGrabbed = null;
      let grabberHand = null;

      hands.forEach(hand => {
        this.grabSystem.updateGrabbed(hand, dt);
        const held = this.objectManager.objects.find(obj => obj.grabbedBy.length === 1 && obj.grabbedBy[0] === hand.label);
        if (held) {
          activeGrabbed = held;
          grabberHand = hand;
        }
      });

      if (activeGrabbed && grabberHand && this.energySystem && grabberHand.pinchPoint.world) {
        this.currentMode = 'GRABBING';
        this.energySystem.renderGrabTether(grabberHand.pinchPoint.world, activeGrabbed.position);
      } else {
        this.currentMode = 'IDLE';
        if (this.energySystem) {
          this.energySystem.hideGrabTether();
        }
      }
    }
  }
}
