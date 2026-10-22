import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { canCatchLift, intersects, type Rect } from './CoopRules';

/** One stationary, one-way Arcade support. The rider is never manually positioned. */
export class LiftSupport {
  readonly surface: Phaser.Physics.Arcade.Image;
  private collider: Phaser.Physics.Arcade.Collider;
  active = false;
  supported = false;
  blockedAbove = false;
  constructor(scene: Phaser.Scene, private rider: Player, private carrier: Player, private solids: () => Rect[]) {
    this.surface = scene.physics.add.staticImage(0, 0, 'platform').setOrigin(0).setDisplaySize(56, 8).setTint(0xffde91).setDepth(5).refreshBody();
    const body = this.surface.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
    this.stop();
    this.collider = scene.physics.add.collider(rider, this.surface, () => { this.supported = true; }, () => {
      const b = rider.arcadeBody, s = this.surface.body as Phaser.Physics.Arcade.StaticBody;
      return this.active && canCatchLift({ x: b.x, y: b.y, width: b.width, height: b.height,
        previousBottom: b.prev.y + b.height, velocityY: b.velocity.y }, s, this.solids());
    });
  }
  prepare(held: boolean, safeCarrier: boolean, bothNormal: boolean): void {
    const c = this.carrier.arcadeBody, r = this.rider.arcadeBody;
    const top = c.top - 2;
    const standing = { x: c.center.x - r.width / 2, y: top - r.height, width: r.width, height: r.height - 0.5 };
    this.blockedAbove = held && safeCarrier && this.solids().some((s) => intersects(standing, s));
    if (!held || !safeCarrier || !bothNormal || this.blockedAbove) { this.stop(); return; }
    this.active = true;
    this.surface.setPosition(c.center.x - 28, top).setVisible(true).refreshBody();
    (this.surface.body as Phaser.Physics.Arcade.StaticBody).enable = true;
    if (r.velocity.y < 0 || Math.abs(r.bottom - top) > 5 || Math.abs(r.center.x - c.center.x) > 26) this.supported = false;
  }
  takeOff(): void { this.supported = false; }
  stop(): void {
    if (this.supported) this.rider.clearJumpMemory();
    this.active = this.supported = false;
    if (this.surface.body) this.surface.body.enable = false;
    if (this.surface.scene) this.surface.setVisible(false);
  }
  destroy(): void {
    this.stop();
    if (this.collider?.world) this.collider.destroy();
    if (this.surface.scene) this.surface.destroy();
  }
}
