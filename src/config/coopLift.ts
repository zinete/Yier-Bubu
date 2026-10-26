export interface CoopLiftConfig {
  /** Horizontal speed while waiting for a partner. */
  readySpeedScale: number;
  /** Horizontal speed while carrying a partner. */
  carryingSpeedScale: number;
  /** Gap between the carrier body top and the rider body bottom. */
  headGap: number;
  /** Maximum horizontal centre offset accepted when landing. */
  horizontalTolerance: number;
  /** Small swept-contact tolerance around the carrier's head. */
  catchTopSlop: number;
  minCatchFallSpeed: number;
  maxCatchFallSpeed: number;
  /** Extra height comes from one stronger launch, never from repeated impulses. */
  boostJumpMultiplier: number;
  boostCooldownMs: number;
  boostVisualMs: number;
  cancelVisualMs: number;
  movementLookAhead: number;
  /** Treat larger one-frame carrier displacement as a teleport and detach. */
  maxCarrierFrameTravel: number;
}

export const COOP_LIFT: Readonly<CoopLiftConfig> = {
  readySpeedScale: 0.72,
  carryingSpeedScale: 0.62,
  headGap: 2,
  horizontalTolerance: 28,
  catchTopSlop: 5,
  minCatchFallSpeed: 18,
  maxCatchFallSpeed: 780,
  boostJumpMultiplier: 1.12,
  boostCooldownMs: 360,
  boostVisualMs: 180,
  cancelVisualMs: 170,
  movementLookAhead: 12,
  maxCarrierFrameTravel: 96,
};
