import Phaser from 'phaser';
import { coopCameraPlan } from './CoopRules';
import { getEffectPreferences } from './EffectPreferences';

export class CoopCamera {
  private tracked: number[];
  private center: number;
  private baseZoom?: number;
  constructor(private scene: Phaser.Scene, positions: number[], private width: number) {
    this.tracked = [...positions]; this.center = (positions[0] + positions[1]) / 2;
    scene.cameras.main.setBounds(0, 0, width, 540).setBackgroundColor(0xc8e8d4);
    this.update(positions, 10000);
  }
  update(positions: number[], delta: number): void {
    const blend = 1 - Math.exp(-Math.min(delta, 10000) / 180);
    this.tracked = positions.map((x, i) => this.tracked[i] + (x - this.tracked[i]) * blend);
    const camera = this.scene.cameras.main;
    const base = Math.min(this.scene.scale.width / 960, this.scene.scale.height / 540);
    // Preserve distance zoom relative to the viewport, not the old pixel size.
    if (this.baseZoom !== undefined && this.baseZoom !== base)
      camera.setZoom(Math.max(base * 0.72, Math.min(base, camera.zoom / this.baseZoom * base)));
    this.baseZoom = base;
    const plan = coopCameraPlan(this.scene.scale.width, this.scene.scale.height, Math.min(...this.tracked), Math.max(...this.tracked));
    const reducedMotion = getEffectPreferences().reducedMotion;
    camera.setZoom(reducedMotion ? base * 0.72 : Math.max(base * 0.72, Math.min(base, camera.zoom + (plan.zoom - camera.zoom) * blend)));
    this.center += (plan.center - this.center) * blend;
    const half = this.scene.scale.width / camera.zoom / 2;
    camera.centerOn(this.width < half * 2 ? this.width / 2 : Math.max(half, Math.min(this.width - half, this.center)), 270);
  }
}
