import Phaser from 'phaser';
import { PLAYER } from '../config/constants';
import type { CharacterId } from '../types/game';
import type { InputManager } from '../systems/InputManager';
import { characterBodyBounds } from '../systems/CharacterBody';
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly character: CharacterId;
  private coyoteUntil = 0;
  private bufferedJumpUntil = 0;
  private facing = 1;
  private hurtUntil = 0;
  private lastAnimation = '';
  constructor(scene: Phaser.Scene, x: number, y: number, character: CharacterId) {
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
    const body = this.arcadeBody;
    const wasGrounded = body.blocked.down || body.touching.down;
    if (wasGrounded) this.coyoteUntil = time + PLAYER.COYOTE_TIME;
    if (input.consumeJump()) this.bufferedJumpUntil = time + PLAYER.JUMP_BUFFER_TIME;
    if (this.bufferedJumpUntil >= time && (wasGrounded || this.coyoteUntil >= time)) {
      body.setVelocityY(PLAYER.JUMP_VELOCITY);
      this.scene.game.events.emit('player-jump');
      this.bufferedJumpUntil = 0;
      this.coyoteUntil = 0;
    }
    const direction = Number(input.down('right')) - Number(input.down('left'));
    body.setAccelerationX(
      direction * (wasGrounded ? PLAYER.GROUND_ACCELERATION : PLAYER.AIR_ACCELERATION),
    );
    body.setDragX(wasGrounded ? PLAYER.GROUND_DRAG : PLAYER.AIR_DRAG);
    if (direction !== 0) {
      this.facing = direction;
      this.setFlipX(direction < 0);
    }
    if (!input.down('jump') && body.velocity.y < 0)
      body.setVelocityY(Math.max(body.velocity.y * PLAYER.JUMP_CUT_MULTIPLIER, -220));
    body.setGravityY(body.velocity.y > 0 ? PLAYER.FALL_GRAVITY : PLAYER.NORMAL_GRAVITY);
    this.playStateAnimation(time);
  }
  hurt(time: number, sourceX: number): boolean {
    if (time < this.hurtUntil) return false;
    this.hurtUntil = time + PLAYER.HURT_COOLDOWN;
    this.setVelocity((this.x < sourceX ? -1 : 1) * 280, -320);
    this.playAnimation('hurt');
    return true;
  }
  stomp(): void {
    this.setVelocityY(-390);
  }
  private playStateAnimation(time: number): void {
    const body = this.arcadeBody;
    this.setTint(time < this.hurtUntil ? 0xffaaaa : 0xffffff);
    if (time < this.hurtUntil) {
      this.playAnimation('hurt');
      return;
    }
    if (!body.blocked.down && !body.touching.down)
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
