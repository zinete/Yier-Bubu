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
  private status: GameStatus = 'playing';
  private health = 3;
  private score = 0;
  private collected = 0;
  private level = getLevel('1-1');
  private seconds = this.level.timeLimit;
  private checkpoint = this.level.spawn;
  private lastAttack = 0;
  private effects!: SkillEffects;
  private charging = false;
  constructor() {
    super(SCENE.GAME);
  }
  init(data: { levelId?: string }): void {
    this.level = getLevel(beginLevel(data.levelId ?? loadProgress().currentLevel));
  }
  create(): void {
    LevelValidator.validate(this.level.platforms);
    this.physics.world.resume();
    this.lastAttack = 0;
    this.charging = false;
    this.time.paused = false;
    this.status = 'playing';
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
    this.createBackground();
    this.effects = new SkillEffects(this);
    this.physics.world.setBounds(0, 0, this.level.width, WORLD_HEIGHT + 400);
    this.platforms = this.physics.add.staticGroup();
    for (const data of this.level.platforms)
      this.platforms
        .create(data.x, data.y, 'platform')
        .setOrigin(0, 0)
        .setDisplaySize(data.width, data.height)
        .setVisible(false)
        .refreshBody();
    const character = this.registry.get(REGISTRY.CHARACTER) as CharacterId;
    this.player = new Player(this, this.level.spawn.x, this.level.spawn.y, character);
    this.physics.add.collider(this.player, this.platforms);
    this.createCoins();
    this.createEnemies();
    this.createProjectiles();
    this.goal = this.physics.add
      .staticImage(this.level.flag.x, this.level.flag.y, 'platform')
      .setOrigin(0, 0)
      .setDisplaySize(this.level.flag.width, this.level.flag.height)
      .setTint(0xffffff)
      .refreshBody();
    this.add.rectangle(this.level.flag.x + 7, this.level.flag.y + 15, 24, 48, 0xf2b705);
    this.add.text(this.level.flag.x - 20, this.level.flag.y - 24, '终点', {
      fontSize: '16px',
      color: '#1d2b3a',
    });
    this.physics.add.overlap(this.player, this.coins, (_, coin) =>
      this.collect(coin as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.overlap(this.player, this.enemies, (_, enemy) =>
      this.hitEnemy(enemy as Enemy),
    );
    this.physics.add.overlap(this.playerProjectiles, this.enemies, (projectile, enemy) => {
      const shot = projectile as Projectile;
      const target = enemy as Enemy;
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
      if (this.status !== 'playing' || !shot.active || !shot.arcadeBody.enable) return;
      const sourceX = shot.x;
      shot.disableBody(true, true);
      this.damage(false, sourceX);
      this.publishHud();
    });
    this.physics.add.overlap(this.player, this.goal, () => this.finish(true));
    CameraManager.attach(this, this.player, this.level.width);
    this.scene.launch(SCENE.UI);
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.status === 'playing') {
          this.seconds -= 1;
          if (this.seconds <= 0) this.finish(false, '时间到！再试一次吧。');
          this.publishHud();
        }
      },
    });
    this.game.events.on('game-action', this.handleAction, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyGameScene());
    this.publishHud();
  }
  update(time: number): void {
    if (this.status !== 'playing') return;
    this.inputManager.update();
    this.player.updatePlayer(time, this.inputManager);
    this.enemies.children.each((child) => {
      const enemy = child as Enemy;
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
          this.player.direction, this.time.now, 'player', {
            speed: COMBAT.PLAYER_PROJECTILE_SPEED, arc: COMBAT.PLAYER_PROJECTILE_ARC,
            gravity: COMBAT.PLAYER_PROJECTILE_GRAVITY, lifetime: COMBAT.PLAYER_PROJECTILE_LIFETIME,
          });
        this.audioManager.play('throw');
      });
    }
    if (this.player.y > WORLD_HEIGHT + 65) this.damage(true);
    if (this.player.x > this.level.checkpoint.x) this.checkpoint = this.level.checkpoint;
    this.publishHud();
  }
  private createBackground(): void {
    buildForest(this, this.level);
  }
  private createCoins(): void {
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    for (const point of this.level.coins) {
      const position = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
      const coin = this.coins.create(position.x, position.y, 'coin') as Phaser.Physics.Arcade.Image;
      coin.setTexture('magic-star').setScale(0.7).setTint(0xffdb73);
      coin.setCircle(12).setData('taken', false);
      this.tweens.add({ targets: coin, y: position.y - 5, duration: 700, yoyo: true, repeat: -1 });
    }
  }
  private createEnemies(): void {
    this.enemies = this.physics.add.group({ classType: Enemy, runChildUpdate: false, allowGravity: true, gravityY: 1450 });
    for (const data of this.level.enemies) this.enemies.add(new Enemy(this, data), true);
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
    const damaged = this.player.hurt(this.time.now, sourceX);
    // 无敌帧只防止连续扣血；不能阻止受击后跌出场景的角色回到检查点。
    if (!damaged) {
      if (fall) this.respawnAtCheckpoint();
      return;
    }
    this.health -= 1;
    this.feedback(this.player.x, this.player.y - 80, '−1 ♥', 0xff6666);
    this.cameras.main.shake(100, 0.003);
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
    this.physics.world.pause();
    this.audioManager.setMusicPaused(true);
    if (won) completeLevel(this.level.id, this.score, this.collected === this.level.coins.length);
    this.audioManager.play(won ? 'win' : 'lose');
    this.scene.pause(SCENE.UI);
    this.scene.launch(SCENE.RESULT, {
      won,
      levelId: this.level.id,
      nextLevelId: won ? nextLevelId(this.level.id) : undefined,
      message:
        message ??
        (won && !nextLevelId(this.level.id) ? '两关全部完成！感谢陪伴这段冒险。' : this.collected === this.level.coins.length
          ? '完美通关，星星全收集！'
          : '抵达终点，继续保持！'),
      score: this.score,
    });
  }
  private handleAction(action: 'pause' | 'sound'): void {
    if (action === 'sound') {
      this.audioManager.toggleSound();
      return;
    }
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
      skillReady: !this.charging && this.time.now - this.lastAttack >= COMBAT.PLAYER_ATTACK_COOLDOWN,
    };
    this.registry.set('hud', state);
  }
  private destroyGameScene(): void {
    this.game.events.off('game-action', this.handleAction, this);
    this.game.events.off('player-jump', this.onJump, this);
    this.input.keyboard?.off('keydown-ESC', this.pauseFromKeyboard, this);
    this.input.keyboard?.off('keydown-P', this.pauseFromKeyboard, this);
    this.input.keyboard?.off('keydown-M', this.muteFromKeyboard, this);
  }
  private onJump(): void { this.audioManager.play('jump'); }
  private pauseFromKeyboard(): void { this.handleAction('pause'); }
  private muteFromKeyboard(): void { this.handleAction('sound'); }
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
