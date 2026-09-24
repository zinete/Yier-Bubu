import Phaser from 'phaser';
import type { EnemyData } from '../types/game';
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private aliveEnemy = true;
  private readonly min: number;
  private readonly max: number;
  constructor(scene: Phaser.Scene, data: EnemyData) {
    super(scene, data.x, data.y, 'enemy');
    this.min = data.min;
    this.max = data.max;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.arcadeBody
      .setSize(34, 30)
      .setOffset(3, 4)
      .setVelocityX(data.speed)
      .setAllowGravity(false)
      .setImmovable(true);
  }
  patrol(): void {
    if (!this.aliveEnemy) return;
    const body = this.arcadeBody;
    if (this.x < this.min || this.x > this.max) body.setVelocityX(-body.velocity.x);
    this.setFlipX(body.velocity.x < 0);
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
