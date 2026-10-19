export const SHIELD = { DURATION: 5000, COOLDOWN: 12000, HIT_GRACE: 450 } as const;

export interface ShieldState { active: boolean; activeMs: number; cooldownMs: number; ready: boolean }

// Uses the scene's combat clock: pauses never spend duration or cooldown.
export class BubbleShield {
  private activeUntil = 0;
  private readyAt = 0;
  private graceUntil = 0;

  state(time: number): ShieldState {
    const activeMs = Math.max(0, this.activeUntil - time);
    const cooldownMs = Math.max(0, this.readyAt - time);
    return { active: activeMs > 0, activeMs, cooldownMs, ready: cooldownMs === 0 };
  }
  activate(time: number): boolean {
    if (!this.state(time).ready) return false;
    this.activeUntil = time + SHIELD.DURATION;
    this.readyAt = time + SHIELD.COOLDOWN;
    return true;
  }
  blocksFollowup(time: number): boolean { return time < this.graceUntil; }
  absorb(time: number): boolean {
    if (!this.state(time).active) return false;
    this.activeUntil = 0;
    this.graceUntil = time + SHIELD.HIT_GRACE;
    return true;
  }
  cancel(): void { this.activeUntil = 0; this.graceUntil = 0; }
}
