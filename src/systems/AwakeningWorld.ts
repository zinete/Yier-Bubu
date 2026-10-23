import Phaser from 'phaser';
import type { LevelData, PlatformData } from '../types/game';
import type { Projectile } from '../entities/Projectile';
import type { SkillEffects } from './SkillEffects';
import { AwakeningController, budPosition } from './AwakeningController';
import type { PlatformArtHandle } from './ViewportArt';

interface NodeView {
  platform: PlatformData; body: Phaser.Physics.Arcade.StaticBody;
  bud: Phaser.Physics.Arcade.Image; label: Phaser.GameObjects.Text;
  sleeping: Phaser.GameObjects.Graphics; awake: Phaser.GameObjects.Graphics;
  active: boolean; text: string;
  skin: PlatformArtHandle[];
}
/** All essential shapes/text work without a shader, including the expiry warning. */
export class AwakeningWorld {
  private controller: AwakeningController;
  private nodes: NodeView[] = [];
  private buds: Phaser.Physics.Arcade.StaticGroup;
  private overlap: Phaser.Physics.Arcade.Collider;
  private destroyed = false;
  constructor(scene: Phaser.Scene, level: LevelData, bodies: Map<string, Phaser.Physics.Arcade.Image>,
    projectiles: Phaser.Physics.Arcade.Group, effects: SkillEffects,
    playing: () => boolean, clock: () => number, onActivate: (x: number, y: number) => void,
    platformArt: (platform: PlatformData) => PlatformArtHandle[] = () => []) {
    this.controller = new AwakeningController(level.platforms, level.awakeningGoal);
    this.buds = scene.physics.add.staticGroup();
    for (const platform of level.platforms) {
      if (!platform.awakening) continue;
      const body = bodies.get(platform.id)!.body as Phaser.Physics.Arcade.StaticBody;
      body.enable = false;
      const point = budPosition(platform);
      const bud = this.buds.create(point.x, point.y, 'magic-bud').setDisplaySize(32, 32).setDepth(3).refreshBody() as Phaser.Physics.Arcade.Image;
      bud.setData('awakeningId', platform.id);
      const label = scene.add.text(point.x, point.y - 40, '击中花苞', {
        fontSize: '14px', color: '#fff4ce', backgroundColor: '#416b59', padding: { x: 6, y: 4 },
      }).setOrigin(0.5).setDepth(4);
      const sleeping = scene.add.graphics().setDepth(-1);
      sleeping.fillStyle(0xaddfcc, 0.18).fillRoundedRect(platform.x, platform.y, platform.width, platform.height, 8);
      for (let i = 0; i < Math.min(40, platform.width / 16); i++) {
        const x = platform.x + i * 16;
        sleeping.lineStyle(2, 0x67a88d, 0.85).lineBetween(x, platform.y, Math.min(x + 8, platform.x + platform.width), platform.y);
      }
      const awake = scene.add.graphics().setDepth(-1).setVisible(false);
      awake.fillStyle(0x886546).fillRoundedRect(platform.x, platform.y + 4, platform.width, platform.height - 4, 8);
      awake.fillStyle(0x7cad67).fillRoundedRect(platform.x, platform.y, platform.width, 11, 6);
      awake.fillStyle(0xffdf87).fillRoundedRect(platform.x + 3, platform.y, platform.width - 6, 4, 2);
      const skin = platformArt(platform); skin.forEach((image) => image.setVisible(false));
      this.nodes.push({ platform, body, bud, label, sleeping, awake, skin, active: false, text: '' });
    }
    this.overlap = scene.physics.add.overlap(projectiles, this.buds, (projectile, object) => {
      const shot = projectile as Projectile;
      if (!playing() || !shot.active || !shot.arcadeBody.enable || shot.firedBy !== 'player') return;
      const bud = object as Phaser.Physics.Arcade.Image;
      if (!this.controller.activate(bud.getData('awakeningId') as string, clock())) return;
      shot.disableBody(true, true);
      this.update(clock()); effects.awaken(bud.x, bud.y); onActivate(bud.x, bud.y);
    });
    this.update(0);
  }
  get summary() { return this.controller.summary; }
  update(time: number): void {
    for (const view of this.nodes) {
      const state = this.controller.state(view.platform.id, time);
      if (view.active !== state.active) {
        view.active = state.active; view.body.enable = state.active;
        view.awake.setVisible(state.active && !view.skin.length); view.sleeping.setVisible(!state.active);
        view.skin.forEach((image) => image.setVisible(state.active));
        view.bud.setTexture(state.active ? 'magic-flower' : 'magic-bud');
      }
      const text = state.active ? `${Math.ceil(state.remaining / 1000)} 秒${state.remaining <= 1500 ? ' · 即将休眠' : ' · 可站立'}` : '击中花苞 · 唤醒跳台';
      if (view.text !== text) { view.label.setText(text); view.text = text; }
      view.awake.setAlpha(state.remaining > 0 && state.remaining <= 1500 ? 0.65 : 1);
      view.skin.forEach((image) => image.setAlpha(state.remaining > 0 && state.remaining <= 1500 ? 0.65 : 1));
    }
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.overlap.world) this.overlap.destroy();
    if (this.buds.scene) this.buds.destroy(true);
    for (const view of this.nodes) { view.awake.destroy(); view.sleeping.destroy(); view.label.destroy(); view.skin.forEach((image) => image.destroy()); }
    this.nodes.length = 0;
  }
}
