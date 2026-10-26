import { COOP_LIFT, type CoopLiftConfig } from '../config/coopLift';
import { PLAYER } from '../config/constants';
import type { Player } from '../entities/Player';
import type { PlayerCommand, PlayerId } from '../types/commands';
import { canCatchLift, intersects, type Rect } from './CoopRules';

export type CooperationState =
  | 'NORMAL'
  | 'LIFT_READY'
  | 'CARRYING'
  | 'RIDING'
  | 'BOOST_JUMP'
  | 'LIFT_CANCEL';

export interface LiftRelation {
  carrierId: PlayerId;
  riderId: PlayerId;
  caughtAt: number;
  lastCarrierX: number;
  lastCarrierY: number;
}

export interface CooperationControl {
  command: PlayerCommand;
  movementScale: number;
  skipPhysics: boolean;
  boosted: boolean;
}

interface CooperationEnvironment {
  solids: () => Rect[];
  isAvailable: (id: PlayerId) => boolean;
  isGrounded: (id: PlayerId) => boolean;
  isSafeGround: (id: PlayerId) => boolean;
}

type ControlMap = Record<PlayerId, CooperationControl>;

/**
 * Owns the single possible carrier/rider relationship. It deliberately has no
 * knowledge of character names or keyboard bindings, so either local player
 * can take either role and a future input source can reuse the same rules.
 */
export class PlayerCooperationController {
  private readonly ids: PlayerId[];
  private readonly config: CoopLiftConfig;
  private readonly states: Record<PlayerId, CooperationState> = { p1: 'NORMAL', p2: 'NORMAL' };
  private readonly transientUntil: Record<PlayerId, number> = { p1: -Infinity, p2: -Infinity };
  private readonly boostLockedUntil: Record<PlayerId, number> = { p1: -Infinity, p2: -Infinity };
  private relationValue: LiftRelation | null = null;
  private blocked = new Set<PlayerId>();
  private now = 0;

  constructor(
    private readonly players: Record<PlayerId, Player>,
    private readonly environment: CooperationEnvironment,
    config: Partial<CoopLiftConfig> = {},
  ) {
    this.ids = Object.keys(players) as PlayerId[];
    this.config = { ...COOP_LIFT, ...config };
  }

  prepare(time: number, commands: Record<PlayerId, PlayerCommand>): ControlMap {
    this.now = time;
    this.expireTransientStates(time);
    const consumedSkills = new Set<PlayerId>();
    const boosted = new Set<PlayerId>();

    const relation = this.relationValue;
    if (relation) {
      if (!this.relationIsUsable(relation) || !this.environment.isGrounded(relation.carrierId)) {
        this.releaseRelation('NORMAL', 'NORMAL');
      } else if (commands[relation.riderId].jumpPressed) {
        this.boostRider(time);
        boosted.add(relation.riderId);
      } else if (commands[relation.carrierId].skillPressed) {
        consumedSkills.add(relation.carrierId);
        this.releaseRelation('LIFT_CANCEL', 'NORMAL');
        this.transientUntil[relation.carrierId] = time + this.config.cancelVisualMs;
      }
    }

    if (!this.relationValue) {
      for (const id of this.ids) {
        if (consumedSkills.has(id)) continue;
        if (this.states[id] === 'LIFT_READY'
          && (!this.environment.isAvailable(id) || !this.environment.isGrounded(id))) {
          this.states[id] = 'NORMAL';
        }
        if (!commands[id].skillPressed) continue;
        if (this.states[id] === 'LIFT_READY') {
          this.states[id] = 'LIFT_CANCEL';
          this.transientUntil[id] = time + this.config.cancelVisualMs;
        } else if (this.states[id] === 'NORMAL'
          && this.environment.isAvailable(id) && this.environment.isSafeGround(id)) {
          this.states[id] = 'LIFT_READY';
          this.players[id].clearJumpMemory();
        }
      }
    }

    this.refreshBlockedHeadroom();
    return Object.fromEntries(this.ids.map((id) => {
      const command = { ...commands[id] };
      const state = this.states[id];
      let movementScale = 1;
      let skipPhysics = false;
      if (state === 'LIFT_READY' || state === 'CARRYING') {
        command.jumpPressed = command.jumpHeld = false;
        this.players[id].clearJumpMemory();
        movementScale = state === 'CARRYING'
          ? this.config.carryingSpeedScale
          : this.config.readySpeedScale;
      }
      if (state === 'RIDING') {
        command.moveX = 0;
        command.jumpPressed = command.jumpHeld = false;
        skipPhysics = true;
      } else if (state === 'BOOST_JUMP') {
        // The controller already applied the only launch impulse. Never feed
        // the same key edge into the normal grounded/coyote jump path.
        command.jumpPressed = false;
      }
      if (state === 'CARRYING') this.blockUnsafeCarrierMotion(id, command);
      return [id, { command, movementScale, skipPhysics, boosted: boosted.has(id) }];
    })) as ControlMap;
  }

  /** Runs after Arcade has resolved terrain so catch tests use swept body data. */
  afterPhysics(time: number): void {
    this.now = time;
    const relation = this.relationValue;
    if (relation) {
      if (!this.relationIsUsable(relation) || !this.environment.isGrounded(relation.carrierId)) {
        this.releaseRelation('NORMAL', 'NORMAL');
      } else if (this.carrierTeleported(relation)) {
        this.releaseRelation('NORMAL', 'NORMAL');
      } else if (this.riderTargetBlocked(relation.carrierId, relation.riderId)) {
        // The rider is still at the last safe pose because synchronization has
        // not happened for this frame. Restore physics there instead of ever
        // forcing the character through a low ceiling.
        this.releaseRelation('LIFT_CANCEL', 'NORMAL');
        this.transientUntil[relation.carrierId] = time + this.config.cancelVisualMs;
      } else {
        this.syncRider(relation);
      }
    } else {
      this.tryCatch(time);
    }
    this.refreshBlockedHeadroom();
  }

  stateOf(id: PlayerId): CooperationState { return this.states[id]; }
  roleOf(id: PlayerId): 'carrier' | 'rider' | null {
    if (this.relationValue?.carrierId === id) return 'carrier';
    if (this.relationValue?.riderId === id) return 'rider';
    return null;
  }
  get relation(): Readonly<LiftRelation> | null { return this.relationValue; }
  get carrierId(): PlayerId | null { return this.relationValue?.carrierId ?? null; }
  get riderId(): PlayerId | null { return this.relationValue?.riderId ?? null; }
  get active(): boolean {
    return !!this.relationValue || this.ids.some((id) => this.states[id] === 'LIFT_READY');
  }
  get supported(): boolean { return !!this.relationValue; }
  get blockedAbove(): boolean { return this.blocked.size > 0; }
  blockedFor(id: PlayerId): boolean { return this.blocked.has(id); }
  canUseWorldTrigger(id: PlayerId): boolean { return this.states[id] !== 'RIDING'; }
  movementScaleFor(id: PlayerId): number {
    return this.states[id] === 'CARRYING' ? this.config.carryingSpeedScale
      : this.states[id] === 'LIFT_READY' ? this.config.readySpeedScale : 1;
  }
  get boostJumpVelocity(): number { return PLAYER.JUMP_VELOCITY * this.config.boostJumpMultiplier; }

  releasePlayer(id: PlayerId): void {
    if (this.relationValue
      && (this.relationValue.carrierId === id || this.relationValue.riderId === id))
      this.releaseRelation('NORMAL', 'NORMAL');
    this.states[id] = 'NORMAL';
    this.transientUntil[id] = this.boostLockedUntil[id] = -Infinity;
    this.blocked.delete(id);
  }

  reset(): void {
    if (this.relationValue) this.releaseRelation('NORMAL', 'NORMAL');
    for (const id of this.ids) {
      this.states[id] = 'NORMAL';
      this.transientUntil[id] = this.boostLockedUntil[id] = -Infinity;
      this.players[id].clearJumpMemory();
    }
    this.blocked.clear();
  }

  stop(): void { this.reset(); }
  destroy(): void { this.reset(); }

  private expireTransientStates(time: number): void {
    for (const id of this.ids)
      if ((this.states[id] === 'BOOST_JUMP' || this.states[id] === 'LIFT_CANCEL')
        && time >= this.transientUntil[id])
        this.states[id] = 'NORMAL';
  }

  private relationIsUsable(relation: LiftRelation): boolean {
    const carrierBody = this.players[relation.carrierId].body;
    const riderBody = this.players[relation.riderId].body;
    return this.environment.isAvailable(relation.carrierId)
      && this.environment.isAvailable(relation.riderId)
      && !!carrierBody && carrierBody.enable
      && !!riderBody && !riderBody.enable;
  }

  private tryCatch(time: number): void {
    for (const carrierId of this.ids) {
      if (this.states[carrierId] !== 'LIFT_READY'
        || !this.environment.isAvailable(carrierId)
        || !this.environment.isSafeGround(carrierId)) continue;
      const riderId = this.ids.find((id) => id !== carrierId);
      if (!riderId || this.states[riderId] !== 'NORMAL'
        || !this.environment.isAvailable(riderId)
        || time < this.boostLockedUntil[riderId]) continue;
      const carrier = this.players[carrierId].arcadeBody;
      const rider = this.players[riderId].arcadeBody;
      if (!carrier.enable || !rider.enable) continue;
      const support = this.supportRect(carrierId);
      if (!canCatchLift({
        x: rider.x, y: rider.y, width: rider.width, height: rider.height,
        previousBottom: rider.prev.y + rider.height,
        velocityY: rider.velocity.y - carrier.velocity.y,
      }, support, this.environment.solids(), {
        horizontalTolerance: this.config.horizontalTolerance,
        topSlop: this.config.catchTopSlop,
        minFallSpeed: this.config.minCatchFallSpeed,
        maxFallSpeed: this.config.maxCatchFallSpeed,
      })) continue;
      this.beginRelation(carrierId, riderId, time);
      return;
    }
  }

  private beginRelation(carrierId: PlayerId, riderId: PlayerId, time: number): void {
    if (carrierId === riderId || this.relationValue) return;
    const carrier = this.players[carrierId].arcadeBody;
    this.relationValue = {
      carrierId, riderId, caughtAt: time,
      lastCarrierX: carrier.center.x,
      lastCarrierY: carrier.center.y,
    };
    this.states[carrierId] = 'CARRYING';
    this.states[riderId] = 'RIDING';
    this.players[carrierId].clearJumpMemory();
    this.players[riderId].suspendForRide();
    this.syncRider(this.relationValue);
  }

  private boostRider(time: number): void {
    const relation = this.relationValue;
    if (!relation) return;
    const { carrierId, riderId } = relation;
    this.relationValue = null;
    this.states[carrierId] = 'LIFT_READY';
    this.states[riderId] = 'BOOST_JUMP';
    this.transientUntil[riderId] = time + this.config.boostVisualMs;
    this.boostLockedUntil[riderId] = time + this.config.boostCooldownMs;
    const rider = this.players[riderId];
    if (rider.body) rider.launchFromRide(this.boostJumpVelocity);
  }

  private releaseRelation(
    carrierState: CooperationState,
    riderState: CooperationState,
  ): void {
    const relation = this.relationValue;
    if (!relation) return;
    this.relationValue = null;
    const rider = this.players[relation.riderId];
    if (rider.body && !rider.arcadeBody.enable) rider.resumeFromRide();
    this.states[relation.carrierId] = carrierState;
    this.states[relation.riderId] = riderState;
    this.players[relation.carrierId].clearJumpMemory();
    rider.clearJumpMemory();
  }

  private syncRider(relation: LiftRelation): void {
    const carrier = this.players[relation.carrierId].arcadeBody;
    const rider = this.players[relation.riderId];
    rider.syncRidePosition(carrier.center.x, carrier.top - this.config.headGap);
    relation.lastCarrierX = carrier.center.x;
    relation.lastCarrierY = carrier.center.y;
  }

  private carrierTeleported(relation: LiftRelation): boolean {
    const carrier = this.players[relation.carrierId].arcadeBody;
    return Math.hypot(
      carrier.center.x - relation.lastCarrierX,
      carrier.center.y - relation.lastCarrierY,
    ) > this.config.maxCarrierFrameTravel;
  }

  private supportRect(carrierId: PlayerId): Rect {
    const carrier = this.players[carrierId].arcadeBody;
    return {
      x: carrier.center.x - this.config.horizontalTolerance,
      y: carrier.top - this.config.headGap,
      width: this.config.horizontalTolerance * 2,
      height: 1,
    };
  }

  private riderTargetRect(carrierId: PlayerId, riderId: PlayerId, shiftX = 0): Rect {
    const carrier = this.players[carrierId].arcadeBody;
    const rider = this.players[riderId].arcadeBody;
    return {
      x: carrier.center.x + shiftX - rider.width / 2,
      y: carrier.top - this.config.headGap - rider.height,
      width: rider.width,
      height: Math.max(1, rider.height - 0.5),
    };
  }

  private riderTargetBlocked(carrierId: PlayerId, riderId: PlayerId, shiftX = 0): boolean {
    const target = this.riderTargetRect(carrierId, riderId, shiftX);
    return this.environment.solids().some((solid) => intersects(target, solid));
  }

  private refreshBlockedHeadroom(): void {
    this.blocked.clear();
    for (const id of this.ids) {
      if (this.states[id] !== 'LIFT_READY') continue;
      const other = this.ids.find((candidate) => candidate !== id);
      if (other && this.players[id].body && this.players[other].body
        && this.riderTargetBlocked(id, other)) this.blocked.add(id);
    }
  }

  private blockUnsafeCarrierMotion(id: PlayerId, command: PlayerCommand): void {
    const relation = this.relationValue;
    if (!relation || relation.carrierId !== id || command.moveX === 0) return;
    const body = this.players[id].arcadeBody;
    const direction = Math.sign(command.moveX);
    const lookAhead = direction * Math.max(
      this.config.movementLookAhead,
      Math.abs(body.velocity.x) / 30 + 4,
    );
    if (!this.riderTargetBlocked(id, relation.riderId, lookAhead)) return;
    command.moveX = 0;
    if (Math.sign(body.velocity.x) === direction) body.setVelocityX(0);
    this.blocked.add(id);
  }
}
