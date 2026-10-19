import assert from 'node:assert/strict';
import { log } from 'node:console';
import { runtime, Events } from './helpers/runtime.mjs';
class Shape {
  active = true; scene = true;
  setTint() { return this; } setScale() { return this; } setDepth() { return this; }
  setVisible(value) { this.visible = value; return this; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setAlpha(value) { this.alpha = value; return this; }
  fillStyle() { return this; } fillCircle() { return this; } fillPoints() { return this; }
  fillEllipse() { return this; } lineStyle() { return this; } strokeCircle() { return this; }
  clear() { return this; } generateTexture() { return this; }
  destroy() { this.active = false; }
}
class Pipeline {
  constructor(config) { this.renderer = config.game.renderer; this.fragment = config.fragShader; this.uniforms = {}; }
  set2f(key, x, y) { this.uniforms[key] = [x, y]; } set1f(key, value) { this.uniforms[key] = value; }
  bootFX() { if (this.renderer.failBoot) throw new Error('shader unsupported'); this.hasBooted = true; }
}
const values = new Map();
let coarse = false;
const load = runtime({
  localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
  window: { matchMedia: (query) => ({ matches: query === '(pointer: coarse)' && coarse }) },
}, { phaser: { default: { WEBGL: 2, Renderer: { WebGL: { Pipelines: { PostFXPipeline: Pipeline } } }, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } } });
const { SkillEffects } = load('src/systems/SkillEffects.ts');
const prefs = load('src/systems/EffectPreferences.ts');
function scene(webgl = true) {
  const camera = {
    x: 0, y: 0, zoom: 1, worldView: { x: 1000, y: 0, contains: (x, y) => x >= 1000 && x <= 1960 && y >= 0 && y <= 540 },
    postPipelines: [{ unrelated: true }],
    setPostPipeline(Type) { if ([...instance.game.renderer.pipelines.classes.values()].includes(Type)) this.postPipelines.push(new Type(instance.game)); },
    getPostPipeline(Type) { return this.postPipelines.find((item) => item instanceof Type); },
    removePostPipeline(item) { this.postPipelines = this.postPipelines.filter((value) => value !== item); },
  };
  const instance = {
    game: { renderer: { type: webgl ? 2 : 1, width: 960, height: 540, pipelines: {
      classes: new Map(), addPostPipeline(name, Type) { if (!this.classes.has(name)) this.classes.set(name, Type); },
    } } },
    events: new Events(), cameras: { main: camera }, scale: { width: 960, height: 540 },
    textures: { exists: () => false }, make: { graphics: () => new Shape() },
    particles: [], images: [], tweens: { items: [], add(config) {
      const tween = { config, stopped: false, stop() { this.stopped = true; } };
      this.items.push(tween); return tween;
    } },
    add: {
      image() { const image = new Shape(); instance.images.push(image); return image; },
      particles() { const emitter = new Shape(); emitter.emits = []; emitter.emitParticleAt = (x, y, count) => emitter.emits.push(count); instance.particles.push(emitter); return emitter; },
    },
  };
  return instance;
}
prefs.setEffectPreferences({ quality: 'auto', reducedMotion: false });
assert.equal(prefs.effectProfile(true, false).ripple, true);
assert.equal(prefs.effectProfile(true, true).ripple, false, '手机自动档不启用全屏冲击波');
assert.equal(prefs.effectProfile(false, false).glow, false);
let instance = scene(); let effects = new SkillEffects(instance);
effects.syncShield(1200, 300, true, 1);
assert.equal(effects.shieldBubble.visible, true); assert.equal(effects.shieldBubble.x, 1200);
effects.syncShield(1300, 250, true, 0.1);
assert.equal(effects.shieldBubble.y, 250); assert.ok(effects.shieldBubble.alpha < 0.95);
const sprite = { scene: true, preFX: { items: [], addGlow() { const glow = {}; this.items.push(glow); return glow; }, remove(item) { this.items = this.items.filter((value) => value !== item); } } };
effects.decorateProjectile(sprite); effects.decorateProjectile(sprite);
assert.equal(sprite.preFX.items.length, 1, '弹体对象池反复使用不重复附加辉光');
effects.charge(1200, 100); effects.impact(1200, 100); effects.impact(1300, 100);
assert.equal(instance.cameras.main.postPipelines.length, 2, '最多一个冲击波，不影响其他管线');
assert.equal(instance.game.renderer.pipelines.classes.size, 1, '先注册自定义管线类再挂载到相机');
effects.update(160);
const pipeline = effects.ripple; assert.equal(pipeline.progress, 0.5);
assert.ok(Math.abs(pipeline.centerX - 200 / 960) < 1e-8, '相机滚动后的屏幕坐标');
assert.ok(Math.abs(pipeline.centerY - (1 - 100 / 540)) < 1e-8);
pipeline.onPreRender(); assert.equal(pipeline.uniforms.uProgress, 0.5);
effects.update(160); assert.equal(instance.cameras.main.postPipelines.length, 1, '320ms 后移除临时后处理');
effects.impact(100, 100); assert.equal(instance.cameras.main.postPipelines.length, 1, '屏幕外命中不生成全屏管线');
for (let i = 0; i < 100; i++) effects.charge(1200, 100);
assert.ok(effects.temporary.size <= 16, '瞬态对象预算有上限');
prefs.setEffectPreferences({ quality: 'low', reducedMotion: true });
assert.equal(effects.allowMotion, false); assert.equal(effects.temporary.size, 0);
assert.equal(sprite.preFX.items.length, 0, '精简档移除旧辉光控制器');
assert.equal(effects.shieldBubble.visible, true, '精简/减少动态效果不隐藏必要的护盾轮廓');
effects.impact(1200, 100); effects.awaken(1200, 100);
assert.equal(instance.cameras.main.postPipelines.length, 1);
instance.events.emit('shutdown');
assert.equal(effects.shieldBubble.active, false, '退出回收唯一的常驻护盾图像');
assert.equal(effects.temporary.size, 0); assert.ok(instance.particles.every((emitter) => !emitter.active));
prefs.setEffectPreferences({ quality: 'high', reducedMotion: false });
instance = scene(false); effects = new SkillEffects(instance);
effects.syncShield(1200, 300, true, 1); effects.shieldPulse(1200, 300, true);
assert.equal(effects.shieldBubble.visible, true, 'Canvas 也有护盾轮廓');
effects.syncShield(1200, 300, false, 0); assert.equal(effects.shieldBubble.visible, false);
effects.impact(1200, 100); effects.decorateProjectile(sprite);
assert.equal(instance.cameras.main.postPipelines.length, 1); assert.equal(sprite.preFX.items.length, 0, 'Canvas 不调用任何 GPU 特效');
effects.setPaused(true); assert.ok(instance.particles.every((emitter) => !emitter.active));
effects.setPaused(false); assert.ok(instance.particles.every((emitter) => emitter.active));
instance.events.emit('shutdown');
coarse = true; prefs.setEffectPreferences({ quality: 'auto', reducedMotion: false });
instance = scene(); effects = new SkillEffects(instance); effects.awaken(1200, 100);
assert.equal(instance.cameras.main.postPipelines.length, 1); instance.events.emit('shutdown');
prefs.setEffectPreferences({ quality: 'high', reducedMotion: false });
instance = scene(); effects = new SkillEffects(instance); effects.impact(1200, 100);
instance.cameras.main.postPipelines = []; instance.cameras.main = undefined;
instance.events.emit('shutdown'); effects.destroy();
instance = scene(); instance.game.renderer.failBoot = true; effects = new SkillEffects(instance);
effects.impact(1200, 100);
assert.equal(effects.rippleSupported, false); assert.equal(instance.cameras.main.postPipelines.length, 1, 'GPU 初始化失败退回普通粒子，不留下坏管线');
effects.impact(1200, 100); instance.events.emit('shutdown');
log('skill effects: profile fallback, budgets, pool reuse, ripple coordinates/lifecycle and cleanup passed (GPU adapters, not shader execution)');
