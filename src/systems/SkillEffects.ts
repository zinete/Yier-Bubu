import Phaser from 'phaser';

export class SkillEffects {
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;
  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists('magic-spark')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff).fillCircle(8, 8, 4);
      g.generateTexture('magic-spark', 16, 16);
      g.clear();
      g.fillStyle(0xfff7bf).fillPoints([
        { x: 16, y: 0 }, { x: 20, y: 11 }, { x: 32, y: 12 }, { x: 23, y: 20 },
        { x: 26, y: 32 }, { x: 16, y: 25 }, { x: 6, y: 32 }, { x: 9, y: 20 },
        { x: 0, y: 12 }, { x: 12, y: 11 },
      ], true);
      g.generateTexture('magic-star', 32, 32);
      g.destroy();
    }
    this.trail = scene.add.particles(0, 0, 'magic-spark', {
      emitting: false, lifespan: 280, speed: { min: 5, max: 25 },
      scale: { start: 0.85, end: 0 }, alpha: { start: 0.8, end: 0 },
      tint: [0xffefad, 0x95f0e3, 0xffffff], maxParticles: 100,
    }).setDepth(8);
    this.burst = scene.add.particles(0, 0, 'magic-star', {
      emitting: false, lifespan: 450, speed: { min: 55, max: 160 },
      scale: { start: 0.45, end: 0 }, rotate: { min: 0, max: 180 },
      alpha: { start: 1, end: 0 }, tint: [0xffd879, 0xb3f7e8, 0xffffff], maxParticles: 80,
    }).setDepth(10);
  }
  sparkle(x: number, y: number): void { this.trail.emitParticleAt(x, y, 2); }
  charge(x: number, y: number): void {
    const ring = this.scene.add.circle(x, y, 27, 0xffeaa4, 0.12).setStrokeStyle(2, 0xfff2bf).setDepth(9);
    this.scene.tweens.add({ targets: ring, scale: 0.25, alpha: 0, duration: 140, onComplete: () => ring.destroy() });
    this.trail.emitParticleAt(x, y, 8);
  }
  impact(x: number, y: number): void {
    this.burst.emitParticleAt(x, y, 12);
    const ring = this.scene.add.circle(x, y, 7).setStrokeStyle(3, 0xffe5a2).setDepth(9);
    this.scene.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
  }
  setPaused(paused: boolean): void { this.trail.active = !paused; this.burst.active = !paused; }
}
