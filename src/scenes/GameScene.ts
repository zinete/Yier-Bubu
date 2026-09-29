import Phaser from 'phaser';
import { REGISTRY, SCENE, WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { level1 } from '../levels/level1';
import { AudioManager } from '../systems/AudioManager';
import { InputManager } from '../systems/InputManager';
import { LevelValidator } from '../systems/LevelValidator';
import type { CharacterId, GameStatus, HudState } from '../types/game';
import { CameraManager } from '../systems/CameraManager';
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private inputManager!: InputManager;
  private audioManager!: AudioManager;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private goal!: Phaser.Physics.Arcade.Image;
  private status: GameStatus = 'playing';
  private health = 3;
  private score = 0;
  private collected = 0;
  private seconds = level1.timeLimit;
  private checkpoint = level1.spawn;
  private lastAttack = 0;
  constructor() {
    super(SCENE.GAME);
  }
  create(): void {
    LevelValidator.validate(level1.platforms);
    this.status = 'playing';
    this.health = 3;
    this.score = 0;
    this.collected = 0;
    this.seconds = level1.timeLimit;
    this.checkpoint = level1.spawn;
    this.inputManager = new InputManager(this);
    this.audioManager = new AudioManager(this);
    this.createBackground();
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.platforms = this.physics.add.staticGroup();
    for (const data of level1.platforms)
      this.platforms
        .create(data.x, data.y, 'platform')
        .setOrigin(0, 0)
        .setDisplaySize(data.width, data.height)
        .refreshBody();
    const character = this.registry.get(REGISTRY.CHARACTER) as CharacterId;
    this.player = new Player(this, level1.spawn.x, level1.spawn.y, character);
    this.physics.add.collider(this.player, this.platforms);
    this.createCoins();
    this.createEnemies();
    this.createProjectiles();
    this.goal = this.physics.add
      .staticImage(level1.flag.x, level1.flag.y, 'platform')
      .setOrigin(0, 0)
      .setDisplaySize(level1.flag.width, level1.flag.height)
      .setTint(0xffffff)
      .refreshBody();
    this.add.rectangle(level1.flag.x + 7, level1.flag.y + 15, 24, 48, 0xf2b705);
    this.add.text(level1.flag.x - 20, level1.flag.y - 24, '终点', {
      fontSize: '16px',
      color: '#1d2b3a',
    });
    this.physics.add.overlap(this.player, this.coins, (_, coin) =>
      this.collect(coin as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.overlap(this.player, this.enemies, (_, enemy) =>
      this.hitEnemy(enemy as Enemy),
    );
    this.physics.add.overlap(this.projectiles, this.enemies, (projectile, enemy) => {
      const shot = projectile as Projectile;
      const target = enemy as Enemy;
      if (target.defeat()) {
        shot.disableBody(true, true);
        this.score += 200;
        this.audioManager.play('enemy-hit');
      }
    });
    this.physics.add.overlap(this.player, this.goal, () => this.finish(true));
    CameraManager.attach(this, this.player);
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
      (child as Enemy).patrol();
      return false;
    });
    this.projectiles.children.each((child) => {
      const projectile = child as Projectile;
      if (projectile.active) projectile.updateProjectile(time);
      return false;
    });
    if (this.inputManager.consumeAttack() && time - this.lastAttack > 350) {
      this.lastAttack = time;
      const shot = this.projectiles.getFirstDead(false) as Projectile | null;
      if (shot) {
        shot.fire(
          this.player.x + this.player.direction * 28,
          this.player.y - 46,
          this.player.direction,
          time,
        );
        this.audioManager.play('throw');
      }
    }
    if (this.player.y > WORLD_HEIGHT + 65) this.damage(true);
    if (this.player.x > level1.checkpoint.x) this.checkpoint = level1.checkpoint;
    this.publishHud();
  }
  private createBackground(): void {
    this.add.rectangle(WORLD_WIDTH / 2, 0, WORLD_WIDTH, WORLD_HEIGHT * 3, 0x9ed8ff);
    for (let x = 80; x < WORLD_WIDTH; x += 220) {
      this.add.circle(x, 120 + (x % 3) * 20, 46, 0xffffff, 0.36).setScrollFactor(0.25);
      this.add.triangle(x, 444, x + 100, 286, x + 200, 444, 0x82bc75, 0.65);
    }
  }
  private createCoins(): void {
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    for (const point of level1.coins) {
      const position = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
      const coin = this.coins.create(position.x, position.y, 'coin') as Phaser.Physics.Arcade.Image;
      coin.setCircle(12).setData('taken', false);
      this.tweens.add({ targets: coin, y: position.y - 5, duration: 700, yoyo: true, repeat: -1 });
    }
  }
  private createEnemies(): void {
    this.enemies = this.physics.add.group({ classType: Enemy, runChildUpdate: false });
    for (const data of level1.enemies) this.enemies.add(new Enemy(this, data), true);
    this.physics.add.collider(this.enemies, this.platforms);
  }
  private createProjectiles(): void {
    this.projectiles = this.physics.add.group({
      classType: Projectile,
      maxSize: 10,
      runChildUpdate: false,
    });
    for (let index = 0; index < 10; index += 1) this.projectiles.add(new Projectile(this), true);
    this.physics.add.collider(this.projectiles, this.platforms, (object) =>
      (object as Projectile).disableBody(true, true),
    );
  }
  private collect(coin: Phaser.Physics.Arcade.Image): void {
    if (coin.getData('taken')) return;
    coin.setData('taken', true).disableBody(true, true);
    this.collected += 1;
    this.score += 100;
    this.audioManager.play('coin');
  }
  private hitEnemy(enemy: Enemy): void {
    if (!enemy.isAlive) return;
    const stomping =
      this.player.arcadeBody.velocity.y > 80 &&
      this.player.arcadeBody.bottom < enemy.arcadeBody.center.y;
    if (stomping) {
      if (enemy.defeat()) {
        this.player.stomp();
        this.score += 250;
        this.audioManager.play('enemy-hit');
      }
    } else this.damage(false, enemy.x);
  }
  private damage(fall: boolean, sourceX = this.player.x): void {
    if (!this.player.hurt(this.time.now, sourceX)) return;
    this.health -= 1;
    this.audioManager.play('hurt');
    if (this.health <= 0) {
      this.finish(false, '生命耗尽，点击重新开始。');
      return;
    }
    if (fall) {
      this.player.setPosition(this.checkpoint.x, this.checkpoint.y);
      this.player.setVelocity(0, 0);
    }
  }
  private finish(won: boolean, message?: string): void {
    if (this.status !== 'playing') return;
    this.status = won ? 'won' : 'lost';
    this.audioManager.play(won ? 'win' : 'lose');
    this.scene.pause(SCENE.UI);
    this.scene.launch(SCENE.RESULT, {
      won,
      message:
        message ??
        (this.collected === level1.coins.length
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
    this.physics.world.isPaused = this.status === 'paused';
    this.publishHud();
  }
  private publishHud(): void {
    const state: HudState = {
      health: this.health,
      score: this.score,
      coins: this.collected,
      totalCoins: level1.coins.length,
      seconds: this.seconds,
      character: this.player.character,
      paused: this.status === 'paused',
    };
    this.registry.set('hud', state);
  }
  private destroyGameScene(): void {
    this.game.events.off('game-action', this.handleAction, this);
  }
}
