import Phaser from 'phaser';
import { COMBAT, REGISTRY, SCENE, WORLD_HEIGHT } from '../config/constants';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { getLevel, nextLevelId } from '../levels';
import { beginLevel, completeLevel, loadProgress } from '../systems/ProgressStore';
import { AudioManager } from '../systems/AudioManager';
import { InputManager } from '../systems/InputManager';
import { LevelValidator } from '../systems/LevelValidator';
import type { CharacterId, GameStatus, HudState } from '../types/game';
import { CameraManager } from '../systems/CameraManager';
import { buildForest } from '../systems/ForestArt';
import { SkillEffects } from '../systems/SkillEffects';
import { parseCustomMap, playablePlatforms, type CustomMap } from '../systems/CustomMap';
import { canLandOnPlatform } from '../systems/PlatformPhysics';
import { mapAssets, runtimeMapAssets, DEFAULT_OBJECT_SKINS } from '../systems/DefaultAssets';
import { assetLayout, readAssetGeometry, type AssetGeometry } from '../systems/AssetGeometry';
import { materialFor, platformSlices } from '../systems/PlatformMaterial';
import { CUSTOM_OBJECTS } from '../systems/ObjectGeometry';
import { mountSceneLayers } from '../systems/SceneLayers';
import { AwakeningWorld } from '../systems/AwakeningWorld';
import { awakeningDemo } from '../levels/awakeningDemo';
import { BubbleShield, SHIELD } from '../systems/BubbleShield';
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private inputManager!: InputManager;
  private audioManager!: AudioManager;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerProjectiles!: Phaser.Physics.Arcade.Group;
  private enemyProjectiles!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private goal!: Phaser.Physics.Arcade.Image;
  private goalLabel!: Phaser.GameObjects.Text;
  private awakening?: AwakeningWorld;
  private demo = false;
  private goalHintAt = -2000;
  private status: GameStatus = 'playing';
  private leaving = false;
  private health = 3;
  private score = 0;
  private collected = 0;
  private level = getLevel('1-1');
  private seconds = this.level.timeLimit;
  private checkpoint = this.level.spawn;
  private lastAttack = 0;
  private effects!: SkillEffects;
  private charging = false;
  private combatTime = 0;
  private shield = new BubbleShield();
  private checkpointReached = false;
  private tutorialStep = 3;
  private customMap?: CustomMap;
  private customTextures = new Map<string, string>();
  private assetGeometry = new Map<string, AssetGeometry>();
  constructor() {
    super(SCENE.GAME);
  }
  init(data: { levelId?: string; customMap?: CustomMap; demo?: boolean }): void {
    this.customTextures.clear();
    this.assetGeometry.clear();
    this.customMap = data.customMap ? parseCustomMap(data.customMap) : undefined;
    this.demo = data.demo === true && !this.customMap;
    this.level = this.customMap ? { ...this.customMap.level, platforms: playablePlatforms(this.customMap) }
      : this.demo ? awakeningDemo : getLevel(beginLevel(data.levelId ?? loadProgress().currentLevel));
  }
  preload(): void {
    for (const [index, asset] of (this.customMap ? runtimeMapAssets(this.customMap) : []).entries()) {
      const key = `custom-asset-${Date.now()}-${index}`;
      this.customTextures.set(asset.id, key);
      this.load.image(key, asset.data);
    }
  }
  create(): void {
    for (const asset of this.customMap ? runtimeMapAssets(this.customMap) : []) {
      const key = this.customTextures.get(asset.id);
      if (!key || !this.textures.exists(key)) continue;
      const texture = this.textures.get(key);
      const frame = texture.get();
      const bounds = readAssetGeometry(asset.data, texture.getSourceImage() as CanvasImageSource, frame.cutWidth, frame.cutHeight);
      texture.add('content', 0, bounds.x, bounds.y, bounds.width, bounds.height);
      this.assetGeometry.set(key, bounds);
    }
    LevelValidator.validate(this.level.platforms);
    this.physics.world.resume();
    this.lastAttack = -COMBAT.PLAYER_ATTACK_COOLDOWN;
    this.combatTime = 0;
    this.shield = new BubbleShield();
    this.checkpointReached = false;
    this.goalHintAt = -2000;
    try { this.tutorialStep = localStorage.getItem('yierBubuTutorialV1') === 'done' ? 3 : 0; }
    catch { this.tutorialStep = 0; }
    if (this.customMap || this.demo) this.tutorialStep = 3;
    this.charging = false;
    this.time.paused = false;
    this.tweens.resumeAll();
    this.status = 'playing';
    this.leaving = false;
    this.health = 3;
    this.score = 0;
    this.collected = 0;
    this.seconds = this.level.timeLimit;
    this.checkpoint = this.level.spawn;
    this.inputManager = new InputManager(this);
    this.audioManager = new AudioManager(this);
    this.audioManager.playMusic('music');
    this.game.events.on('player-jump', this.onJump, this);
    this.input.keyboard?.on('keydown-ESC', this.pauseFromKeyboard, this);
    this.input.keyboard?.on('keydown-P', this.pauseFromKeyboard, this);
    this.input.keyboard?.on('keydown-M', this.muteFromKeyboard, this);
    this.input.keyboard?.on('keydown-R', this.restartFromKeyboard, this);
    this.input.keyboard?.on('keydown-H', this.homeFromKeyboard, this);
    this.input.keyboard?.on('keydown-T', this.skipTutorial, this);
    this.game.events.on('tutorial-skip', this.skipTutorial, this);
    this.createBackground();
    this.effects = new SkillEffects(this);
    this.physics.world.setBounds(0, 0, this.level.width, WORLD_HEIGHT + 400);
    this.platforms = this.physics.add.staticGroup();
    const platformBodies = new Map<string, Phaser.Physics.Arcade.Image>();
    for (const data of this.level.platforms) {
      const platform = this.platforms
        .create(data.x, data.y, 'platform')
        .setOrigin(0, 0)
        .setDisplaySize(data.width, data.height)
        .setVisible(false)
        .refreshBody();
      platform.setData('oneWay', data.kind === 'platform');
      platformBodies.set(data.id, platform);
      if (data.kind === 'platform') {
        const body = platform.body as Phaser.Physics.Arcade.StaticBody;
        body.checkCollision.down = false;
        body.checkCollision.left = false;
        body.checkCollision.right = false;
      }
    }
    const chosen = this.registry.get(REGISTRY.CHARACTER) as CharacterId | undefined;
    const character: CharacterId = chosen === 'bubu' ? 'bubu' : 'yier';
    this.player = new Player(this, this.level.spawn.x, this.level.spawn.y, character);
    this.physics.add.collider(this.player, this.platforms, undefined, (player, platform) => {
      if (!(platform as Phaser.GameObjects.GameObject).getData('oneWay')) return true;
      const body = (player as Player).arcadeBody;
      const surface = (platform as Phaser.Physics.Arcade.Image).body as Phaser.Physics.Arcade.StaticBody;
      return canLandOnPlatform(body.velocity.y, body.prev.y + body.height, surface.top);
    });
    this.createCoins();
    this.createEnemies();
    this.createProjectiles();
    this.awakening = this.level.platforms.some((p) => p.awakening) ? new AwakeningWorld(this, this.level, platformBodies,
      this.playerProjectiles, this.effects, () => this.status === 'playing', () => this.combatTime, (x, y) => {
        this.feedback(x, y - 65, '星光唤醒！', 0xffd97d); this.audioManager.play('coin'); this.publishHud();
      }, (p) => this.drawObjectSkin('platform', p, p.x, p.y, p.width, p.height, -1)) : undefined;
    this.goal = this.physics.add
      .staticImage(this.level.flag.x, this.level.flag.y, 'platform')
      .setOrigin(0, 0)
      .setDisplaySize(this.level.flag.width, this.level.flag.height)
      .setTint(0xffffff)
      .refreshBody();
    if (this.customMap) {
      this.goal.setVisible(false);
      this.drawObjectSkin('flag', this.level.flag, this.level.flag.x, this.level.flag.y, this.level.flag.width, this.level.flag.height);
    } else this.add.rectangle(this.level.flag.x + 7, this.level.flag.y + 15, 24, 48, 0xf2b705);
    this.goalLabel = this.add.text(this.level.flag.x - 20, this.level.flag.y - 24, '终点', {
      fontSize: '16px',
      color: '#1d2b3a',
    });
    if (this.awakening?.summary.goalLocked) this.goalLabel.setText('星门 · 唤醒所有花苞');
    this.physics.add.overlap(this.player, this.coins, (_, coin) =>
      this.collect(coin as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.overlap(this.player, this.enemies, (_, enemy) =>
      this.hitEnemy(enemy as Enemy),
    );
    this.physics.add.overlap(this.playerProjectiles, this.enemies, (projectile, enemy) => {
      const shot = projectile as Projectile;
      const target = enemy as Enemy;
      if (this.status !== 'playing' || !shot.active || !shot.arcadeBody.enable || shot.firedBy !== 'player') return;
      if (target.defeat()) {
        this.effects.impact(shot.x, shot.y);
        this.feedback(target.x, target.y - 20, '+200', 0x74cf65);
        shot.disableBody(true, true);
        this.score += 200;
        this.audioManager.play('enemy-hit');
      }
    });
    // Arcade 的 Sprite vs Group 回调始终先传 Sprite，再传组内成员。
    this.physics.add.overlap(this.player, this.enemyProjectiles, (_, projectile) => {
      const shot = projectile as Projectile;
      if (this.status !== 'playing' || !shot.active || !shot.arcadeBody.enable || shot.firedBy !== 'enemy') return;
      const sourceX = shot.x;
      shot.disableBody(true, true);
      this.damage(false, sourceX);
      this.publishHud();
    });
    this.physics.add.overlap(this.player, this.goal, () => this.tryGoal());
    CameraManager.attach(this, this.player, this.level.width);
    this.scene.launch(SCENE.UI);
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.status === 'playing' && this.tutorialStep === 3) {
          this.seconds -= 1;
          if (this.seconds <= 0) this.finish(false, '时间到！再试一次吧。');
          this.publishHud();
        }
      },
    });
    this.game.events.on('game-action', this.handleAction, this);
    this.game.events.on('blur', this.pauseWhenUnfocused, this);
    this.game.events.on('hidden', this.pauseWhenUnfocused, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyGameScene());
    this.publishHud();
    if (this.demo) this.feedback(this.level.spawn.x + 170, this.level.spawn.y - 120, '星光弹击中花苞 → 跳台亮起 8 秒\n唤醒三朵花，打开星门', 0xffd97d);
  }
  update(_time: number, delta: number): void {
    if (this.status !== 'playing') return;
    const time = this.combatTime += delta;
    this.effects.update(delta);
    this.awakening?.update(time);
    const goalLocked = this.awakening?.summary.goalLocked;
    this.goalLabel.setText(goalLocked ? '星门 · 唤醒所有花苞' : this.awakening ? '星门已开启' : '终点');
    this.inputManager.update();
    this.player.updatePlayer(time, this.inputManager);
    if (this.inputManager.consumeShield() && this.tutorialStep === 3 && this.shield.activate(time)) {
      this.audioManager.play('shield-on');
      this.effects.shieldPulse(this.player.x, this.player.y - 44);
    }
    this.syncShield();
    if (this.tutorialStep === 0 && Math.abs(this.player.x - this.level.spawn.x) >= 60) this.tutorialStep = 1;
    this.enemies.children.each((child) => {
      const enemy = child as Enemy;
      if (this.tutorialStep < 3) { enemy.setVelocityX(0); return true; }
      enemy.patrol();
      const attack = enemy.getAttack(time, this.player.x);
      if (attack) {
        const shot = this.enemyProjectiles.getFirstDead(false) as Projectile | null;
        if (shot) {
          const direction = this.player.x < enemy.x ? -1 : 1;
          shot.fire(enemy.x + direction * 18, enemy.y - 28, direction, time, 'enemy', {
            speed: attack.projectileSpeed,
            arc: attack.projectileArc,
            gravity: attack.projectileGravity,
            lifetime: attack.projectileLifetime,
          });
          this.audioManager.play('throw');
        }
      }
      return true;
    });
    this.updateProjectiles(this.playerProjectiles, time);
    this.updateProjectiles(this.enemyProjectiles, time);
    if (this.inputManager.consumeAttack() && time - this.lastAttack > COMBAT.PLAYER_ATTACK_COOLDOWN) {
      this.lastAttack = time;
      this.charging = true;
      this.effects.charge(this.player.x + this.player.direction * 30, this.player.y - 45);
      this.time.delayedCall(140, () => {
        this.charging = false;
        if (this.status !== 'playing') return;
        const shot = this.playerProjectiles.getFirstDead(false) as Projectile | null;
        if (!shot) return;
        shot.fire(this.player.x + this.player.direction * 35, this.player.y - 45,
          this.player.direction, this.combatTime, 'player', {
            speed: COMBAT.PLAYER_PROJECTILE_SPEED, arc: COMBAT.PLAYER_PROJECTILE_ARC,
            gravity: COMBAT.PLAYER_PROJECTILE_GRAVITY, lifetime: COMBAT.PLAYER_PROJECTILE_LIFETIME,
          });
        this.effects.decorateProjectile(shot);
        this.audioManager.play('throw');
        if (this.tutorialStep === 2) this.skipTutorial();
      });
    }
    if (this.player.y > WORLD_HEIGHT + 65) this.damage(true);
    if (!this.checkpointReached && this.player.x > this.level.checkpoint.x) {
      this.checkpointReached = true;
      this.checkpoint = this.level.checkpoint;
      this.feedback(this.player.x, this.player.y - 100, '检查点已激活', 0x95f0e3);
      this.effects.awaken(this.player.x, this.player.y - 40);
      this.audioManager.play('coin');
    }
    this.publishHud();
  }
  private createBackground(): void {
    const settings = this.customMap?.scene;
    const bgAsset = this.customMap ? mapAssets(this.customMap).find((asset) => asset.id === settings?.backgroundAssetId) : undefined;
    buildForest(this, this.level, this.customMap?.title, settings?.theme, !!bgAsset || settings?.baseMode === 'sky', settings?.parallax, settings?.layers !== undefined);
    if (settings?.layers) mountSceneLayers(this, settings.layers, this.customTextures);
    if (bgAsset && settings) {
      const key = this.customTextures.get(bgAsset.id);
      if (key && this.textures.exists(key)) {
        if (settings.backgroundMode === 'repeat') {
          const ratio = 540 / this.textures.get(key).get().cutHeight;
          const background = this.add.tileSprite(0, 0, this.level.width, 540, key).setOrigin(0)
            .setDepth(-26).setScrollFactor(settings.parallax);
          background.setTileScale(ratio, ratio);
        } else this.add.image(0, 0, key).setOrigin(0).setDisplaySize(this.level.width, 540)
          .setDepth(-26).setScrollFactor(settings.parallax);
      }
    }
    for (const object of this.customMap?.decorations ?? []) {
      if (object.solid) continue; // 已作为真正的平台渲染并参与碰撞，避免重复绘制。
      const key = this.customTextures.get(object.assetId);
      if (key && this.textures.exists(key))
        this.add.image(object.x, object.y, key).setOrigin(0).setDisplaySize(object.width, object.height).setDepth(object.layer === 'front' ? 6 : -1);
    }
    if (this.customMap) {
      for (const p of this.level.platforms) if (!p.awakening) this.drawObjectSkin('platform', p, p.x, p.y, p.width, p.height, -2);
      for (const kind of ['spawn', 'checkpoint'] as const) {
        const p = this.level[kind]; this.drawObjectSkin(kind, p, p.x, p.y - 64, 32, 64, -1);
      }
    }
  }
  private skinKey(kind: string, value: { assetId?: string; x: number; y: number }): string | undefined {
    return this.customMap ? this.customTextures.get(value.assetId ?? DEFAULT_OBJECT_SKINS[kind]) : undefined;
  }
  private drawObjectSkin(kind: string, value: { assetId?: string; x: number; y: number }, x: number, y: number, width: number, height: number, depth = 0): Phaser.GameObjects.Image[] {
    const images: Phaser.GameObjects.Image[] = [];
    const key = this.skinKey(kind, value);
    if (key && this.textures.exists(key)) {
      const geometry = this.assetGeometry.get(key);
      if (kind === 'platform' && geometry) {
        const material = materialFor(value.assetId ?? DEFAULT_OBJECT_SKINS.platform, this.customMap?.platformMaterials);
        const texture = this.textures.get(key);
        for (const p of platformSlices(geometry, material, x, y, width, height)) {
          const frame = `platform-${p.sx}-${p.sw}`;
          if (!texture.has(frame)) texture.add(frame, 0, p.sx, p.sy, p.sw, p.sh);
          images.push(this.add.image(p.x, p.y, key, frame).setOrigin(0).setDisplaySize(p.drawWidth, p.height).setFlipX(p.flipX).setDepth(depth));
        }
        return images;
      }
      const layout = geometry ? assetLayout(geometry, x, y, width, height, kind === 'platform') : { x, y, width, height };
      images.push(this.add.image(layout.x, layout.y, key, geometry ? 'content' : undefined).setOrigin(0).setDisplaySize(layout.width, layout.height).setDepth(depth));
    }
    return images;
  }
  private createCoins(): void {
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    for (const point of this.level.coins) {
      const position = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
      const coin = this.coins.create(position.x, position.y, 'coin') as Phaser.Physics.Arcade.Image;
      coin.setTexture('magic-star').setScale(0.7).setTint(0xffdb73);
      const key = this.skinKey('coin', position);
      const size = CUSTOM_OBJECTS.coin;
      if (key && this.textures.exists(key)) coin.setTexture(key, 'content').setDisplaySize(size.width, size.height).clearTint();
      coin.setCircle(12).setData('taken', false);
      if (key) {
        const body = coin.body as Phaser.Physics.Arcade.Body;
        const width = size.bodyWidth / coin.scaleX, height = size.bodyHeight / coin.scaleY;
        body.setSize(width, height).setOffset((coin.width - width) / 2, (coin.height - height) / 2);
      }
      this.tweens.add({ targets: coin, y: position.y - 5, duration: 700, yoyo: true, repeat: -1 });
    }
  }
  private createEnemies(): void {
    this.enemies = this.physics.add.group({ classType: Enemy, runChildUpdate: false, allowGravity: true, gravityY: 1450 });
    for (const data of this.level.enemies) {
      const enemy = new Enemy(this, data); this.enemies.add(enemy, true);
      const key = this.skinKey('enemy', data);
      if (key && this.textures.exists(key)) enemy.applySkin(key, 'content');
    }
    this.physics.add.collider(this.enemies, this.platforms);
  }
  private createProjectiles(): void {
    this.playerProjectiles = this.createProjectilePool(COMBAT.PLAYER_PROJECTILE_POOL_SIZE);
    this.enemyProjectiles = this.createProjectilePool(COMBAT.ENEMY_PROJECTILE_POOL_SIZE);
  }
  private createProjectilePool(size: number): Phaser.Physics.Arcade.Group {
    const pool = this.physics.add.group({ classType: Projectile, maxSize: size, runChildUpdate: false });
    for (let index = 0; index < size; index += 1) pool.add(new Projectile(this), true);
    this.physics.add.collider(pool, this.platforms, (object) => {
      const shot = object as Projectile;
      if (shot.firedBy === 'player') this.effects.impact(shot.x, shot.y);
      shot.disableBody(true, true);
    });
    return pool;
  }
  private updateProjectiles(pool: Phaser.Physics.Arcade.Group, time: number): void {
    pool.children.each((child) => {
      const projectile = child as Projectile;
      if (projectile.active) projectile.updateProjectile(time, this.level.width);
      if (projectile.active && projectile.firedBy === 'player' && projectile.emitTrail(time))
        this.effects.sparkle(projectile.x, projectile.y);
      return true;
    });
  }
  private collect(coin: Phaser.Physics.Arcade.Image): void {
    if (this.status !== 'playing') return;
    if (coin.getData('taken')) return;
    coin.setData('taken', true).disableBody(true, true);
    this.collected += 1;
    this.score += 100;
    this.effects.impact(coin.x, coin.y);
    this.feedback(coin.x, coin.y, '+100', 0xffcc44);
    this.audioManager.play('coin');
  }
  private hitEnemy(enemy: Enemy): void {
    if (this.status !== 'playing' || !enemy.isAlive) return;
    const stomping =
      this.player.arcadeBody.velocity.y > 80 &&
      this.player.arcadeBody.bottom < enemy.arcadeBody.center.y;
    if (stomping) {
      if (enemy.defeat()) {
        this.feedback(enemy.x, enemy.y - 20, '+250', 0x74cf65);
        this.player.stomp();
        this.score += 250;
        this.audioManager.play('enemy-hit');
      }
    } else this.damage(false, enemy.x);
  }
  private damage(fall: boolean, sourceX = this.player.x): void {
    if (this.status !== 'playing') return;
    // Falls bypass both the shield and its contact grace. Keep the existing hurt-invulnerability policy.
    if (fall) { this.shield.cancel(); this.syncShield(); }
    if (this.tutorialStep < 3) { if (fall) this.respawnAtCheckpoint(); return; }
    if (!fall && !this.player.isInvulnerable(this.combatTime)) {
      if (this.shield.blocksFollowup(this.combatTime)) return;
      if (this.shield.absorb(this.combatTime)) {
        this.syncShield();
        this.effects.shieldPulse(this.player.x, this.player.y - 44, true);
        this.feedback(this.player.x, this.player.y - 110, '守护抵挡！', 0xa5eeff);
        this.audioManager.play('shield-block');
        this.publishHud();
        return;
      }
    }
    const damaged = this.player.hurt(this.combatTime, sourceX);
    // 无敌帧只防止连续扣血；不能阻止受击后跌出场景的角色回到检查点。
    if (!damaged) {
      if (fall) this.respawnAtCheckpoint();
      return;
    }
    this.health -= 1;
    this.feedback(this.player.x, this.player.y - 80, '−1 ♥', 0xff6666);
    if (this.effects.allowMotion) this.cameras.main.shake(100, 0.003);
    this.publishHud();
    this.audioManager.play('hurt');
    if (this.health <= 0) {
      this.finish(false, '生命耗尽，点击重新开始。');
      return;
    }
    if (fall) this.respawnAtCheckpoint();
  }
  private respawnAtCheckpoint(): void {
    this.player.arcadeBody.reset(this.checkpoint.x, this.checkpoint.y);
    this.player.setVelocity(0, 0);
  }
  private finish(won: boolean, message?: string): void {
    if (this.status !== 'playing') return;
    this.status = won ? 'won' : 'lost';
    this.shield.cancel(); this.syncShield();
    this.inputManager.reset();
    this.physics.world.pause();
    this.time.paused = true;
    this.effects.setPaused(true);
    this.tweens.pauseAll();
    this.audioManager.setMusicPaused(true);
    if (won && !this.customMap && !this.demo) completeLevel(this.level.id, this.score, this.collected === this.level.coins.length);
    this.audioManager.play(won ? 'win' : 'lose');
    this.scene.pause(SCENE.UI);
    this.scene.launch(SCENE.RESULT, {
      won,
      levelId: this.level.id,
      customMap: this.customMap,
      demo: this.demo,
      nextLevelId: won && !this.customMap && !this.demo ? nextLevelId(this.level.id) : undefined,
      message:
        message ??
        (this.demo ? (won ? '三朵星花已唤醒！你让森林重新亮了起来。' : '花苞可重复击中，重新点亮限时平台。') : this.customMap ? (won ? '自定义地图通关！可以返回工坊继续完善。' : '再试一次，或返回工坊调整地图。') : won && !nextLevelId(this.level.id) ? '两关全部完成！感谢陪伴这段冒险。' : this.collected === this.level.coins.length
          ? '完美通关，星星全收集！'
          : '抵达终点，继续保持！'),
      score: this.score,
    });
  }
  private tryGoal(): void {
    if (this.status !== 'playing') return;
    if (!this.awakening?.summary.goalLocked) { this.finish(true); return; }
    if (this.combatTime - this.goalHintAt < 1500) return;
    this.goalHintAt = this.combatTime;
    const { lit, total } = this.awakening.summary;
    this.feedback(this.player.x, this.player.y - 100, `星门未开启 · 花苞 ${lit}/${total}`, 0xffd97d);
  }
  private handleAction(action: 'pause' | 'sound' | 'restart' | 'home'): void {
    if (action === 'restart' || action === 'home') {
      if (this.status !== 'paused' || this.leaving) return;
      this.leaving = true;
      this.scene.stop(SCENE.UI);
      if (action === 'restart') this.scene.restart({ levelId: this.level.id, customMap: this.customMap, demo: this.demo });
      else this.scene.start(this.customMap ? SCENE.EDITOR : SCENE.START);
      return;
    }
    if (action === 'sound') {
      this.audioManager.toggleSound();
      return;
    }
    if (action !== 'pause') return;
    if (this.status !== 'playing' && this.status !== 'paused') return;
    this.status = this.status === 'playing' ? 'paused' : 'playing';
    this.inputManager.reset();
    this.audioManager.setMusicPaused(this.status === 'paused');
    this.physics.world.isPaused = this.status === 'paused';
    this.time.paused = this.status === 'paused';
    this.effects.setPaused(this.status === 'paused');
    if (this.status === 'paused') this.tweens.pauseAll();
    else this.tweens.resumeAll();
    this.publishHud();
  }
  private publishHud(): void {
    const state: HudState = {
      health: this.health,
      score: this.score,
      coins: this.collected,
      totalCoins: this.level.coins.length,
      seconds: this.seconds,
      character: this.player.character,
      paused: this.status === 'paused',
      skillReady: !this.charging && this.combatTime - this.lastAttack >= COMBAT.PLAYER_ATTACK_COOLDOWN,
      skillCharge: Phaser.Math.Clamp((this.combatTime - this.lastAttack) / COMBAT.PLAYER_ATTACK_COOLDOWN, 0, 1),
      levelId: this.level.id,
      progress: Phaser.Math.Clamp(this.player.x / this.level.flag.x, 0, 1),
      checkpointReached: this.checkpointReached,
      tutorialStep: this.tutorialStep,
      customMap: !!this.customMap,
      awakening: this.awakening?.summary,
      shield: this.shield.state(this.combatTime),
    };
    this.registry.set('hud', state);
  }
  private syncShield(): void {
    const state = this.shield.state(this.combatTime);
    this.effects.syncShield(this.player.x, this.player.y - 44, state.active, state.activeMs / SHIELD.DURATION);
  }
  private destroyGameScene(): void {
    this.awakening?.destroy(); this.awakening = undefined;
    for (const key of this.customTextures.values()) this.textures.remove(key);
    this.customTextures.clear();
    this.assetGeometry.clear();
    this.game.events.off('game-action', this.handleAction, this);
    this.game.events.off('blur', this.pauseWhenUnfocused, this);
    this.game.events.off('hidden', this.pauseWhenUnfocused, this);
    this.game.events.off('player-jump', this.onJump, this);
    this.input.keyboard?.off('keydown-ESC', this.pauseFromKeyboard, this);
    this.input.keyboard?.off('keydown-P', this.pauseFromKeyboard, this);
    this.input.keyboard?.off('keydown-M', this.muteFromKeyboard, this);
    this.input.keyboard?.off('keydown-R', this.restartFromKeyboard, this);
    this.input.keyboard?.off('keydown-H', this.homeFromKeyboard, this);
    this.input.keyboard?.off('keydown-T', this.skipTutorial, this);
    this.game.events.off('tutorial-skip', this.skipTutorial, this);
  }
  private onJump(): void {
    this.audioManager.play('jump');
    if (this.tutorialStep === 1) this.tutorialStep = 2;
  }
  private skipTutorial(): void {
    this.tutorialStep = 3;
    try { localStorage.setItem('yierBubuTutorialV1', 'done'); } catch { /* 下次可再次引导。 */ }
    this.publishHud();
  }
  private pauseWhenUnfocused(): void { if (this.status === 'playing') this.handleAction('pause'); }
  private pauseFromKeyboard(event?: KeyboardEvent): void { if (!event?.repeat) this.handleAction('pause'); }
  private muteFromKeyboard(): void { this.handleAction('sound'); }
  private restartFromKeyboard(): void { this.handleAction('restart'); }
  private homeFromKeyboard(): void { this.handleAction('home'); }
  private feedback(x: number, y: number, text: string, color: number): void {
    const label = this.add.text(x, y, text, {
      fontSize: '20px', fontStyle: 'bold', color: '#1d2b3a', stroke: '#ffffff', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: label, y: y - 35, alpha: 0, duration: 650, onComplete: () => label.destroy() });
    for (let i = 0; i < 6; i += 1) {
      const dot = this.add.circle(x, y, 4, color).setDepth(19);
      this.tweens.add({ targets: dot, x: x + Math.cos(i * Math.PI / 3) * 30,
        y: y + Math.sin(i * Math.PI / 3) * 30, alpha: 0, duration: 350, onComplete: () => dot.destroy() });
    }
  }
}
