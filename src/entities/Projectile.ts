import Phaser from 'phaser';
export class Projectile extends Phaser.Physics.Arcade.Sprite {
  private expiresAt = 0;
  constructor(scene: Phaser.Scene) {
    super(scene, -100, -100, 'fruit');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
    this.arcadeBody.setCircle(8).setAllowGravity(true).setGravityY(700);
  }
  fire(x: number, y: number, direction: number, time: number): void {
    this.enableBody(true, x, y, true, true);
    this.setVelocity(direction * 520, -130).setAngularVelocity(direction * 720);
    this.expiresAt = time + 1450;
  }
  updateProjectile(time: number): void {
    if (time > this.expiresAt || this.x < -80 || this.x > 4280 || this.y > 650)
      this.disableBody(true, true);
  }
  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }
}
