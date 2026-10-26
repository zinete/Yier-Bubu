import Phaser from 'phaser';
import { PLAYER } from '../config/constants';
import type { CharacterId } from '../types/game';
import type { InputManager } from '../systems/InputManager';
import { characterBodyBounds } from '../systems/CharacterBody';
import type { MovementCommand, PlayerId } from '../types/commands';
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly character: CharacterId;
  private coyoteUntil = -Infinity;
  private bufferedJumpUntil = -Infinity;
  private facing = 1;
  private hurtUntil = 0;
  private lastAnimation = '';
  private actionAnimation: string | null = null;
  constructor(scene: Phaser.Scene, x: number, y: number, character: CharacterId, readonly playerId: PlayerId | 'solo' = 'solo') {
    super(scene, x, y, 'characters', 0);
    this.character = character;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1).setDisplaySize(79, 88).setCollideWorldBounds(true);
    const bounds = characterBodyBounds(this.texture, character);
    this.arcadeBody
      .setSize(bounds.width, bounds.height)
      .setOffset(bounds.x, bounds.y);
    this.setGravityY(PLAYER.NORMAL_GRAVITY).setMaxVelocity(PLAYER.SPEED, PLAYER.MAX_FALL_SPEED);
    this.playAnimation('idle');
  }
  updatePlayer(time: number, input: InputManager): void {
    this.applyCommand(time, {
      moveX: Number(input.down('right')) - Number(input.down('left')),
      jumpPressed: input.consumeJump(), jumpHeld: input.down('jump'),
    });
  }
  /** Shared movement implementation; input sources never know physics or key bindings here. */
  applyCommand(time: number, command: MovementCommand, movementScale = 1): boolean {
    const body = this.arcadeBody;
    const speedScale = Math.max(0.1, Math.min(1, movementScale));
    const maximumSpeed = PLAYER.SPEED * speedScale;
    body.setMaxVelocity(maximumSpeed, PLAYER.MAX_FALL_SPEED);
    if (Math.abs(body.velocity.x) > maximumSpeed)
      body.setVelocityX(Math.sign(body.velocity.x) * maximumSpeed);
    let jumped = false;
    // Arcade retains contact flags on render frames without a physics step.
    // An already rising body must not replenish its consumed ground jump.
    const wasGrounded = body.velocity.y >= 0 && (body.blocked.down || body.touching.down);
    if (wasGrounded) this.coyoteUntil = time + PLAYER.COYOTE_TIME;
    if (command.jumpPressed) this.bufferedJumpUntil = time + PLAYER.JUMP_BUFFER_TIME;
    if (this.bufferedJumpUntil >= time && (wasGrounded || this.coyoteUntil >= time)) {
      body.setVelocityY(PLAYER.JUMP_VELOCITY);
      this.scene.game.events.emit('player-jump');
      this.bufferedJumpUntil = -Infinity;
      this.coyoteUntil = -Infinity;
      jumped = true;
    }
    const direction = Math.max(-1, Math.min(1, command.moveX));
    body.setAccelerationX(
      direction * (wasGrounded ? PLAYER.GROUND_ACCELERATION : PLAYER.AIR_ACCELERATION) * speedScale,
    );
    body.setDragX(wasGrounded ? PLAYER.GROUND_DRAG : PLAYER.AIR_DRAG);
    if (direction !== 0) {
      this.facing = direction;
      this.setFlipX(direction < 0);
    }
    if (!command.jumpHeld && body.velocity.y < 0)
      body.setVelocityY(Math.max(body.velocity.y * PLAYER.JUMP_CUT_MULTIPLIER, -220));
    body.setGravityY(body.velocity.y > 0 ? PLAYER.FALL_GRAVITY : PLAYER.NORMAL_GRAVITY);
    this.playStateAnimation(time);
    return jumped;
  }
  get characterId(): CharacterId { return this.character; }
  clearJumpMemory(): void { this.coyoteUntil = this.bufferedJumpUntil = -Infinity; }
  /** Gives the cooperation controller sole ownership of this actor while riding. */
  suspendForRide(): void {
    const body = this.arcadeBody;
    this.clearJumpMemory();
    body.stop();
    body.setAcceleration(0, 0);
    body.setAllowGravity(false);
    body.enable = false;
  }
  /** Aligns physics feet/centre rather than assuming a sprite size or origin. */
  syncRidePosition(centerX: number, feetY: number): void {
    const body = this.arcadeBody;
    this.setPosition(this.x + centerX - body.center.x, this.y + feetY - body.bottom);
    body.updateFromGameObject();
  }
  resumeFromRide(verticalVelocity = 0): void {
    const body = this.arcadeBody;
    body.enable = true;
    body.moves = true;
    body.setAllowGravity(true);
    body.reset(this.x, this.y);
    body.setAcceleration(0, 0);
    body.setMaxVelocity(PLAYER.SPEED, PLAYER.MAX_FALL_SPEED);
    body.setGravityY(PLAYER.NORMAL_GRAVITY);
    body.setVelocity(0, verticalVelocity);
    this.clearJumpMemory();
  }
  launchFromRide(verticalVelocity: number): void {
    this.resumeFromRide(verticalVelocity);
    this.scene.game.events.emit('player-jump');
  }
  resetAt(x: number, y: number): void {
    this.clearJumpMemory(); this.hurtUntil = 0; this.clearActionAnimation();
    this.arcadeBody.reset(x, y); this.arcadeBody.stop();
    this.setGravityY(PLAYER.NORMAL_GRAVITY).setMaxVelocity(PLAYER.SPEED, PLAYER.MAX_FALL_SPEED)
      .setAlpha(1).setVisible(true).clearTint();
    this.arcadeBody.enable = true;
    this.playAnimation('idle');
  }
  hurt(time: number, sourceX: number): boolean {
    if (this.isInvulnerable(time)) return false;
    this.clearActionAnimation();
    this.hurtUntil = time + PLAYER.HURT_COOLDOWN;
    this.setVelocity((this.x < sourceX ? -1 : 1) * 280, -320);
    this.playAnimation('hurt');
    return true;
  }
  isInvulnerable(time: number): boolean { return time < this.hurtUntil; }
  stomp(): void {
    this.setVelocityY(-390);
  }
  /** A semantic action layer used by co-op without coupling Player to key bindings. */
  setActionAnimation(state: string | null): void {
    const key = state ? `${this.character}-${state}` : null;
    if (this.actionAnimation === key) return;
    this.actionAnimation = key;
    if (key) {
      this.play(key);
      this.lastAnimation = key;
    } else {
      this.lastAnimation = '';
      if (this.scene && this.body) this.playStateAnimation(Number(this.scene.time?.now ?? 0));
    }
  }
  clearActionAnimation(): void { this.setActionAnimation(null); }
  get actionAnimationKey(): string | null { return this.actionAnimation; }
  private playStateAnimation(time: number): void {
    const body = this.arcadeBody;
    this.setTint(time < this.hurtUntil ? 0xffaaaa : 0xffffff);
    if (time < this.hurtUntil) {
      this.playAnimation('hurt');
      return;
    }
    if (this.actionAnimation) return;
    if (body.velocity.y < 0 || (!body.blocked.down && !body.touching.down))
      this.playAnimation(body.velocity.y < 0 ? 'jump' : 'fall');
    else this.playAnimation(Math.abs(body.velocity.x) > 20 ? 'run' : 'idle');
  }
  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }
  private playAnimation(state: string): void {
    const key = `${this.character}-${state}`;
    if (this.lastAnimation !== key) {
      this.play(key);
      this.lastAnimation = key;
    }
  }
  get direction(): number {
    return this.facing;
  }
}
