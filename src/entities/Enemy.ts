import Phaser from 'phaser';
import type { EnemyAttackData, EnemyData } from '../types/game';
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private aliveEnemy = true;
  private readonly min: number;
  private readonly max: number;
  private readonly speed: number;
  private lastAttack = 0;
  private readonly attack?: EnemyAttackData;
  private warningUntil = 0;
  constructor(scene: Phaser.Scene, data: EnemyData) {
    super(scene, data.x, data.y, 'enemy');
    this.min = data.min;
    this.max = data.max;
    this.speed = data.speed;
    this.attack = data.attack;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.arcadeBody
      .setSize(34, 30)
      .setOffset(3, 4)
      .setVelocityX(data.speed)
      .setAllowGravity(true)
      .setGravityY(1450)
      .setCollideWorldBounds(true);
  }
  patrol(): void {
    if (!this.aliveEnemy) return;
    const body = this.arcadeBody;
    if (body.velocity.x === 0) body.setVelocityX(this.speed);
    if (this.x <= this.min) body.setVelocityX(Math.abs(this.speed));
    else if (this.x >= this.max) body.setVelocityX(-Math.abs(this.speed));
    this.setFlipX(body.velocity.x < 0);
  }
  getAttack(time: number, targetX: number): EnemyAttackData | undefined {
    if (!this.aliveEnemy || !this.attack) return undefined;
    if (Math.abs(targetX - this.x) > this.attack.range) {
      this.warningUntil = 0;
      this.clearTint();
      return undefined;
    }
    if (this.warningUntil > 0) {
      if (time < this.warningUntil) return undefined;
      this.warningUntil = 0;
      this.clearTint();
      this.lastAttack = time;
      return this.attack;
    }
    if (time - this.lastAttack < this.attack.cooldown) return undefined;
    this.warningUntil = time + 350;
    this.setTint(0xff9a55);
    return undefined;
  }
  defeat(): boolean {
    if (!this.aliveEnemy) return false;
    this.aliveEnemy = false;
    this.arcadeBody.enable = false;
    this.setScale(1, 0.35);
    this.scene.time.delayedCall(350, () => this.destroy());
    return true;
  }
  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }
  get isAlive(): boolean {
    return this.aliveEnemy;
  }
}
