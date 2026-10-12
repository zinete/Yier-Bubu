import Phaser from 'phaser';
export interface ProjectileLaunch {
  speed: number;
  arc: number;
  gravity: number;
  lifetime: number;
}
export class Projectile extends Phaser.Physics.Arcade.Sprite {
  private expiresAt = 0;
  private source: 'player' | 'enemy' = 'player';
  private nextTrail = 0;
  constructor(scene: Phaser.Scene) {
    super(scene, -100, -100, 'fruit');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
    this.arcadeBody.setCircle(8).setAllowGravity(true).setGravityY(700);
  }
  fire(
    x: number,
    y: number,
    direction: number,
    time: number,
    source: 'player' | 'enemy' = 'player',
    launch: ProjectileLaunch,
  ): void {
    this.source = source;
    this.nextTrail = 0;
    this.setTexture(source === 'player' ? 'magic-star' : 'fruit');
    this.setScale(source === 'player' ? 0.8 : 1).setDepth(7);
    this.arcadeBody.setCircle(source === 'player' ? 10 : 8);
    this.enableBody(true, x, y, true, true);
    this.arcadeBody.setGravityY(launch.gravity);
    this.setVelocity(direction * launch.speed, launch.arc).setAngularVelocity(direction * 720);
    this.expiresAt = time + launch.lifetime;
  }
  get firedBy(): 'player' | 'enemy' {
    return this.source;
  }
  emitTrail(time: number): boolean {
    if (time < this.nextTrail) return false;
    this.nextTrail = time + 40;
    return true;
  }
  updateProjectile(time: number, worldWidth: number): void {
    if (time > this.expiresAt || this.x < -80 || this.x > worldWidth + 80 || this.y > 650)
      this.disableBody(true, true);
  }
  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }
}
