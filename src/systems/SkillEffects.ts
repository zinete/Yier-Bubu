import Phaser from 'phaser';
import { effectProfile, subscribeEffectPreferences, type EffectProfile } from './EffectPreferences';
import { StarRipplePipeline } from './StarRipplePipeline';

export class SkillEffects {
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;
  private profile: EffectProfile;
  private unsubscribe: () => void;
  private temporary = new Map<Phaser.GameObjects.Image, Phaser.Tweens.Tween>();
  private glows = new Map<Phaser.Physics.Arcade.Sprite, Phaser.FX.Glow>();
  private ripple?: StarRipplePipeline;
  private rippleCamera?: Phaser.Cameras.Scene2D.Camera;
  private rippleSupported = true;
  private ripplePoint = { x: 0, y: 0 };
  private rippleAge = 0;
  private rippleCooldown = 0;
  private destroyed = false;
  private shieldBubble: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene) {
    this.profile = effectProfile(scene.game.renderer.type === Phaser.WEBGL);
    if (scene.game.renderer.type === Phaser.WEBGL)
      (scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines.addPostPipeline('StarRipple', StarRipplePipeline);
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
      g.clear();
      g.lineStyle(2, 0xffffff, 0.9).strokeCircle(32, 32, 28);
      g.generateTexture('magic-ring', 64, 64);
      g.clear();
      g.fillStyle(0xffffff).fillEllipse(8, 8, 12, 7);
      g.generateTexture('magic-petal', 16, 16);
      g.clear();
      g.fillStyle(0x54855a).fillEllipse(16, 25, 26, 10);
      g.fillStyle(0xf0c967).fillEllipse(10, 15, 12, 22).fillEllipse(22, 15, 12, 22);
      g.fillStyle(0xffedb1).fillEllipse(16, 12, 12, 23);
      g.generateTexture('magic-bud', 32, 32);
      g.clear();
      for (let i = 0; i < 6; i++) g.fillStyle(0xfff4cf).fillCircle(16 + Math.cos(i * Math.PI / 3) * 9, 16 + Math.sin(i * Math.PI / 3) * 9, 6);
      g.fillStyle(0xffc75e).fillCircle(16, 16, 6);
      g.generateTexture('magic-flower', 32, 32);
      g.destroy();
    }
    if (!scene.textures.exists('magic-bubble')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xb1efff, 0.12).fillCircle(64, 64, 58);
      g.lineStyle(3, 0xd9faff, 0.95).strokeCircle(64, 64, 58);
      g.lineStyle(1, 0x73c9ed, 0.7).strokeCircle(64, 64, 54);
      g.fillStyle(0xffffff, 0.9).fillEllipse(40, 26, 23, 10).fillCircle(26, 43, 4);
      g.fillStyle(0xffe6b5, 0.7).fillCircle(99, 94, 5);
      g.generateTexture('magic-bubble', 128, 128); g.destroy();
    }
    this.shieldBubble = scene.add.image(0, 0, 'magic-bubble').setScale(0.94).setDepth(7).setVisible(false);
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
    this.unsubscribe = subscribeEffectPreferences(() => {
      this.profile = effectProfile(scene.game.renderer.type === Phaser.WEBGL);
      if (!this.profile.glow) {
        for (const [sprite, glow] of this.glows) if (sprite.scene) sprite.preFX?.remove(glow);
        this.glows.clear();
      }
      if (!this.profile.ripple) this.clearRipple();
      if (!this.profile.motion) this.clearTemporary();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }
  get allowMotion(): boolean { return this.profile.motion; }
  syncShield(x: number, y: number, active: boolean, remaining: number): void {
    this.shieldBubble.setPosition(x, y).setVisible(active)
      .setAlpha(remaining < 0.2 ? 0.45 + remaining * 2.5 : 0.95);
  }
  shieldPulse(x: number, y: number, broken = false): void {
    this.pulse(x, y, 0xb7f3ff, broken ? 1.5 : 0.3, broken ? 2.2 : 1.8, 280);
    this.trail.emitParticleAt(x, y, Math.ceil((broken ? 16 : 6) * this.profile.particles));
  }
  sparkle(x: number, y: number): void {
    this.trail.emitParticleAt(x, y, this.profile.particles < 0.5 ? 1 : 2);
  }
  decorateProjectile(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (!this.profile.glow || this.glows.has(sprite) || !sprite.preFX) return;
    const glow = sprite.preFX.addGlow(0xffd980, 2, 0, false, 0.08, 6);
    this.glows.set(sprite, glow);
  }
  charge(x: number, y: number): void {
    this.pulse(x, y, 0xffe6a1, 0.8, 0.2, 140);
    if (this.profile.motion) for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      this.animate(this.scene.add.image(x + Math.cos(angle) * 30, y + Math.sin(angle) * 30, 'magic-petal')
        .setTint(i % 2 ? 0xa9efe1 : 0xffdfa0).setScale(0.65).setDepth(9), { x, y, alpha: 0, scale: 0.1, duration: 140 });
    }
    this.trail.emitParticleAt(x, y, Math.ceil(8 * this.profile.particles));
  }
  impact(x: number, y: number): void {
    this.burst.emitParticleAt(x, y, Math.ceil(12 * this.profile.particles));
    this.pulse(x, y, 0xffe5a2, 0.2, 1.3, 280);
    this.startRipple(x, y);
  }
  awaken(x: number, y: number): void {
    this.burst.emitParticleAt(x, y, Math.ceil(22 * this.profile.particles));
    this.pulse(x, y, 0xffdc80, 0.4, 2.1, 600);
    this.pulse(x, y, 0xa5eddb, 0.3, 1.5, 420);
    this.startRipple(x, y);
  }
  update(delta: number): void {
    this.rippleCooldown = Math.max(0, this.rippleCooldown - delta);
    if (!this.ripple) return;
    this.rippleAge += delta;
    if (this.rippleAge >= 320) { this.clearRipple(); return; }
    const camera = this.rippleCamera;
    if (!camera) { this.clearRipple(); return; }
    this.ripple.progress = this.rippleAge / 320;
    this.ripple.centerX = ((this.ripplePoint.x - camera.worldView.x) * camera.zoom + camera.x) / this.scene.scale.width;
    this.ripple.centerY = 1 - ((this.ripplePoint.y - camera.worldView.y) * camera.zoom + camera.y) / this.scene.scale.height;
  }
  setPaused(paused: boolean): void {
    this.trail.active = !paused; this.burst.active = !paused;
    if (paused) this.clearRipple();
  }
  private pulse(x: number, y: number, color: number, start: number, end: number, duration: number): void {
    const ring = this.scene.add.image(x, y, 'magic-ring').setTint(color).setScale(this.profile.motion ? start : end * 0.6).setDepth(9);
    this.animate(ring, { scale: this.profile.motion ? end : end * 0.6, alpha: 0, duration });
  }
  private animate(image: Phaser.GameObjects.Image, config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets'>): void {
    if (this.temporary.size >= 16) { image.destroy(); return; }
    const tween = this.scene.tweens.add({ ...config, targets: image, onComplete: () => { this.temporary.delete(image); image.destroy(); } });
    this.temporary.set(image, tween);
  }
  private startRipple(x: number, y: number): void {
    if (!this.profile.ripple || !this.rippleSupported || this.ripple || this.rippleCooldown > 0) return;
    const camera = this.scene.cameras.main;
    // Never distort an offscreen impact, nor stack a pipeline per particle.
    if (!camera.worldView.contains(x, y)) return;
    try {
      camera.setPostPipeline(StarRipplePipeline);
      const pipeline = camera.getPostPipeline(StarRipplePipeline);
      if (!(pipeline instanceof StarRipplePipeline)) return;
      this.ripple = pipeline; this.rippleCamera = camera;
      if (!pipeline.hasBooted) pipeline.bootFX();
      this.ripplePoint = { x, y }; this.rippleAge = 0; this.rippleCooldown = 180;
      this.update(0);
    } catch { this.rippleSupported = false; this.clearRipple(); }
  }
  private clearRipple(): void {
    // CameraManager can have cleared `main` before our SHUTDOWN listener runs.
    if (this.ripple && this.rippleCamera?.postPipelines?.includes(this.ripple)) this.rippleCamera.removePostPipeline(this.ripple);
    this.ripple = undefined;
    this.rippleCamera = undefined;
  }
  private clearTemporary(): void {
    for (const [image, tween] of this.temporary) { tween.stop(); image.destroy(); }
    this.temporary.clear();
  }
  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.unsubscribe(); this.clearRipple(); this.clearTemporary();
    for (const [sprite, glow] of this.glows) if (sprite.scene) sprite.preFX?.remove(glow);
    this.glows.clear(); this.trail.destroy(); this.burst.destroy(); this.shieldBubble.destroy();
  }
}
