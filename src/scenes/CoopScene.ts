import Phaser from 'phaser';
import { SCENE, WORLD_HEIGHT } from '../config/constants';
import { Player } from '../entities/Player';
import { COOP_BRIDGE, COOP_CHECKPOINT, COOP_CHECKPOINT_SPAWNS, COOP_GATE, COOP_GATHER_GATE, COOP_GOAL, COOP_LEVER, COOP_PLATES, COOP_SPAWNS, coopTutorial } from '../levels/coopTutorial';
import { AudioManager } from '../systems/AudioManager';
import { buildForest } from '../systems/ForestArt';
import { canLandOnPlatform } from '../systems/PlatformPhysics';
import { CoopKeyboard, editableTarget } from '../systems/CoopKeyboard';
import { CoopOverlay, type CoopPhase } from '../systems/CoopOverlay';
import { CoopRules, COOP_DISTANCE, inside, interactionTarget, intersects, outwardLimit, type CoopFact, type Rect } from '../systems/CoopRules';
import { LiftSupport } from '../systems/LiftSupport';
import { CoopCamera } from '../systems/CoopCamera';
import type { PlayerId } from '../types/commands';
import { openEffectPanel } from '../systems/EffectPanel';
import { openFeedback } from '../systems/ReleaseSupport';

interface Partner {
  id: PlayerId; actor: Player; label: Phaser.GameObjects.Text;
  life: 'normal' | 'respawning'; reviveAt: number; spawn: { x: number; y: number };
  moved: boolean; jumped: boolean; falls: number;
}
interface Terrain { rect: Rect; image: Phaser.Physics.Arcade.Image; oneWay: boolean }
const ids: PlayerId[] = ['p1', 'p2'];

export class CoopScene extends Phaser.Scene {
  private phase: CoopPhase = 'ready';
  private ready = [false, false];
  private partners!: Record<PlayerId, Partner>;
  private controls!: CoopKeyboard;
  private overlay!: CoopOverlay;
  private audio!: AudioManager;
  private lift!: LiftSupport;
  private sharedCamera!: CoopCamera;
  private rules = new CoopRules();
  private terrain = new Map<string, Terrain>();
  private clock = 0;
  private frameDelta = 16;
  private leaving = false;
  private previousCapture = true;
  private lever!: Phaser.GameObjects.Rectangle;
  private plates: Phaser.GameObjects.Rectangle[] = [];
  private camp!: Phaser.GameObjects.Rectangle;
  private notice = '';
  private noticeUntil = 0;
  constructor() { super(SCENE.COOP); }

  create(): void {
    this.phase = 'ready'; this.ready = [false, false]; this.rules = new CoopRules();
    this.terrain.clear(); this.plates = []; this.clock = 0; this.leaving = false; this.notice = ''; this.noticeUntil = 0;
    this.physics.world.setBounds(0, 0, coopTutorial.width, WORLD_HEIGHT + 400).pause();
    this.audio = new AudioManager(this); this.audio.playMusic('music');
    buildForest(this, coopTutorial, '同行小径', 'forest', false, 0.2, true);
    for (const p of coopTutorial.platforms) this.addTerrain(p.id, p, p.kind === 'platform', false);
    this.addTerrain(COOP_BRIDGE.id, COOP_BRIDGE, true, true).image.setAlpha(0.25);
    this.terrain.get(COOP_BRIDGE.id)!.image.body!.enable = false;
    this.addTerrain(COOP_GATE.id, COOP_GATE, false, true).image.setTint(0xb592d0);
    this.addTerrain(COOP_GATHER_GATE.id, COOP_GATHER_GATE, false, true).image.setTint(0x6eafc6);
    this.partners = Object.fromEntries(ids.map((id, index) => {
      const spawn = { ...COOP_SPAWNS[id] };
      const actor = new Player(this, spawn.x, spawn.y, index ? 'bubu' : 'yier', id).setDepth(4);
      actor.clearJumpMemory();
      const label = this.add.text(actor.x, actor.y - 104, `${id.toUpperCase()}`, {
        fontSize: '14px', fontStyle: 'bold', color: index ? '#805019' : '#25638d',
        backgroundColor: '#fff8e9', padding: { x: 6, y: 3 },
      }).setOrigin(0.5).setDepth(10);
      for (const { image, oneWay } of this.terrain.values())
        this.physics.add.collider(actor, image, undefined, () => !oneWay || canLandOnPlatform(actor.arcadeBody.velocity.y, actor.arcadeBody.prev.y + actor.arcadeBody.height, (image.body as Phaser.Physics.Arcade.StaticBody).top));
      return [id, { id, actor, label, spawn, life: 'normal', reviveAt: 0, moved: false, jumped: false, falls: 0 }];
    })) as Record<PlayerId, Partner>;
    // No character-to-character collider: support exists only through LiftSupport.
    this.lift = new LiftSupport(this, this.partners.p1.actor, this.partners.p2.actor, () => this.solids());
    this.sharedCamera = new CoopCamera(this, ids.map((id) => this.partners[id].actor.x), coopTutorial.width);
    this.createLandmarks();
    const root = document.getElementById('app')!;
    const images = ['start-bubu-thumb', 'start-yier-thumb'].map((key) => (this.textures.get(key).getSourceImage() as HTMLImageElement).src);
    this.overlay = new CoopOverlay(root, images, { pause: () => this.togglePause(), restart: () => this.navigate(true), home: () => this.navigate(false),
      getAudio: () => this.audio.preferences, setAudio: (settings) => this.audio.setPreferences(settings),
      effects: () => { this.unfocus(); openEffectPanel(); }, feedback: () => { this.unfocus(); openFeedback(); } });
    const manager = this.game.input.keyboard;
    if (manager) { this.previousCapture = manager.preventDefault; manager.preventDefault = false; }
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    this.controls = new CoopKeyboard(window, () => {
      const focus = document.activeElement;
      return document.hasFocus() && !document.hidden && !editableTarget(focus)
        && (!focus || focus === document.body || focus === this.game.canvas || this.overlay.root.contains(focus));
    }, () => !this.leaving && (this.phase === 'ready' || this.phase === 'playing'), () => this.togglePause(), () => this.unfocus());
    this.input.on('pointerdown', this.focusCanvas, this);
    this.game.events.on('blur', this.unfocus, this);
    this.game.events.on('hidden', this.unfocus, this);
    this.game.events.on('player-jump', this.onJump, this);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.afterPhysics, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.renderOverlay();
  }
  private addTerrain(id: string, rect: Rect, oneWay: boolean, visible: boolean): Terrain {
    const image = this.physics.add.staticImage(rect.x, rect.y, 'platform').setOrigin(0).setDisplaySize(rect.width, rect.height).setVisible(visible).refreshBody();
    if (oneWay) {
      const body = image.body as Phaser.Physics.Arcade.StaticBody;
      body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
    }
    const terrain = { rect, image, oneWay }; this.terrain.set(id, terrain); return terrain;
  }
  private createLandmarks(): void {
    const sign = (x: number, y: number, label: string) => this.add.text(x, y, label, {
      fontSize: '15px', color: '#365446', backgroundColor: '#fff8e9', align: 'center',
      padding: { x: 10, y: 7 },
    }).setOrigin(0.5).setDepth(1);
    sign(220, 310, '1 · 试试各自的跑跳');
    sign(555, 210, '2 · 布布按住右 Shift\n一二跳上托举点，再按 W');
    sign(740, 200, '3 · 开桥机关');
    sign(1220, 305, '4 · 每只熊站一个开关');
    sign(1545, 310, '5 · 一起到营地');
    sign(1790, 295, '短跳试炼\n掉落只复活自己');
    sign(2095, 310, '6 · 一起到家');
    this.lever = this.add.rectangle(COOP_LEVER.x, COOP_LEVER.y - 25, 24, 46, 0xeebd63).setStrokeStyle(3, 0x785a33);
    this.plates = COOP_PLATES.map((p) => this.add.rectangle(p.x, p.y - 4, 56, 8, 0xb9a2d0).setStrokeStyle(2, 0x6c527c));
    this.camp = this.add.rectangle(COOP_CHECKPOINT.x, COOP_CHECKPOINT.y, COOP_CHECKPOINT.width, COOP_CHECKPOINT.height, 0x78b7d1, 0.18).setOrigin(0).setStrokeStyle(2, 0x78b7d1);
    this.add.rectangle(COOP_GOAL.x, COOP_GOAL.y, COOP_GOAL.width, COOP_GOAL.height, 0xf6d781, 0.2).setOrigin(0).setStrokeStyle(3, 0xe3b657);
  }
  update(_time: number, delta: number): void {
    if (this.leaving) return;
    this.frameDelta = delta;
    if (this.phase === 'ready') {
      ids.forEach((id, i) => { if (this.controls.read(id).interactPressed) this.ready[i] = true; });
      if (this.ready.every(Boolean) && this.controls.allReleased) {
        this.controls.reset(); this.phase = 'playing'; this.physics.world.resume();
      }
      this.renderOverlay(); return;
    }
    if (this.phase !== 'playing') return;
    this.clock += delta;
    for (const id of ids) {
      const p = this.partners[id];
      if (p.life === 'normal' && p.actor.arcadeBody.top > WORLD_HEIGHT + 20) this.fall(p);
      if (p.life === 'respawning' && this.clock >= p.reviveAt) this.revive(p);
    }
    const commands = { p1: this.controls.read('p1'), p2: this.controls.read('p2') };
    this.lift.prepare(commands.p2.skillHeld, this.safeGround(this.partners.p2.actor), ids.every((id) => this.partners[id].life === 'normal'));
    for (const id of ids) {
      const p = this.partners[id], other = this.partners[id === 'p1' ? 'p2' : 'p1'], command = commands[id];
      if (p.life !== 'normal') continue;
      const body = p.actor.arcadeBody;
      const restricted = outwardLimit(body.center.x, other.life === 'normal' ? other.actor.arcadeBody.center.x : other.spawn.x, this.safeGround(p.actor), this.rules.checkpointActive);
      if (restricted) {
        if (Math.sign(command.moveX) === restricted) command.moveX = 0;
        if (Math.sign(body.velocity.x) === restricted) body.setVelocityX(0);
      }
      if (id === 'p2' && this.lift.active) {
        command.moveX = 0; command.jumpPressed = command.jumpHeld = false;
        p.actor.clearJumpMemory(); body.setVelocityX(0);
      }
      if (p.actor.applyCommand(this.clock, command)) {
        p.jumped = true; if (id === 'p1') this.lift.takeOff();
      }
      p.moved ||= Math.abs(body.center.x - COOP_SPAWNS[id].x) > 50;
      const target = interactionTarget(this.fact(p), this.rules.bridgeOpen ? [] : [COOP_LEVER]);
      if (command.interactPressed && target && this.rules.interact(target.id)) {
        this.terrain.get(COOP_BRIDGE.id)!.image.body!.enable = true;
        this.terrain.get(COOP_BRIDGE.id)!.image.setAlpha(1);
        this.say('桥已打开，会一直等着你们。'); this.audio.play('coin');
      }
    }
    const wasGate = this.rules.gateOpen, wasCamp = this.rules.checkpointActive;
    const won = this.rules.update(ids.map((id) => this.fact(this.partners[id])));
    if (this.rules.gateOpen && !wasGate) {
      this.openDoor(COOP_GATE.id); this.say('双机关完成，门已永久打开。'); this.audio.play('coin');
    }
    if (this.rules.checkpointActive && !wasCamp) {
      ids.forEach((id) => { this.partners[id].spawn = { ...COOP_CHECKPOINT_SPAWNS[id] }; });
      this.openDoor(COOP_GATHER_GATE.id); this.camp.setFillStyle(0x93c968, 0.28);
      this.say('共同检查点已激活，掉落后各自回到营地。'); this.audio.play('coin');
    }
    if (won) {
      this.phase = 'won'; this.controls.reset(); this.lift.stop();
      this.physics.world.pause(); this.audio.setMusicPaused(true); this.audio.play('win');
    }
    this.plates.forEach((plate, i) => plate.setFillStyle(this.rules.plates[i] ? 0xffd56f : 0xb9a2d0));
    const target = ids.some((id) => interactionTarget(this.fact(this.partners[id]), this.rules.bridgeOpen ? [] : [COOP_LEVER]));
    this.lever.setStrokeStyle(target ? 5 : 3, target ? 0xffffff : 0x785a33).setFillStyle(this.rules.bridgeOpen ? 0x93c968 : 0xeebd63);
    this.renderOverlay();
  }
  private fact(p: Partner): CoopFact {
    const b = p.actor.arcadeBody;
    return { id: p.id, x: b.center.x, feet: b.bottom, grounded: b.blocked.down || b.touching.down,
      normal: p.life === 'normal' && !(p.id === 'p1' ? this.lift.supported : this.lift.active) };
  }
  private solids(): Rect[] { return [...this.terrain.values()].filter((t) => t.image.body?.enable).map((t) => t.rect); }
  private safeGround(player: Player): boolean {
    const b = player.arcadeBody;
    return b.enable && b.velocity.y >= 0 && (b.blocked.down || b.touching.down) && [...this.terrain.values()].some((t) =>
      t.image.body?.enable && Math.abs(b.bottom - t.rect.y) < 5 && b.center.x >= t.rect.x + 38 && b.center.x <= t.rect.x + t.rect.width - 38);
  }
  private openDoor(id: string): void { this.terrain.get(id)!.image.disableBody(true, true); }
  private fall(p: Partner): void {
    this.lift.stop(); p.life = 'respawning'; p.reviveAt = this.clock + 450; p.falls++;
    p.actor.arcadeBody.stop(); p.actor.arcadeBody.enable = false; p.actor.setVisible(false);
    p.actor.clearJumpMemory(); this.controls.reset(p.id); this.say(`${p.id.toUpperCase()} 正在回到安全营地，另一只熊可以继续。`);
  }
  private revive(p: Partner): void {
    const other = this.partners[p.id === 'p1' ? 'p2' : 'p1'], body = p.actor.arcadeBody;
    const x = [p.spawn.x, p.spawn.x - 90, p.spawn.x + 90, p.spawn.x + 180].find((candidate) => {
      if (other.life === 'normal' && Math.abs(candidate - other.actor.arcadeBody.center.x) < 85) return false;
      const box = { x: candidate - body.width / 2, y: p.spawn.y - body.height - 2, width: body.width, height: body.height };
      return this.solids().some((s) => s.y === p.spawn.y && box.x >= s.x + 4 && box.x + box.width <= s.x + s.width - 4)
        && !this.solids().some((s) => intersects(box, s));
    });
    if (x === undefined) return;
    this.controls.reset(p.id); this.lift.stop(); p.actor.resetAt(x, p.spawn.y - 2); p.life = 'normal';
  }
  private afterPhysics(): void {
    if (!this.partners || this.leaving) return;
    for (const id of ids) {
      const p = this.partners[id];
      p.label.setPosition(p.actor.x, p.actor.y - 104).setVisible(p.life === 'normal');
      p.label.setText(id === 'p1' && this.lift.supported ? 'P1 · 站稳了 · W 起跳' : id === 'p2' && this.lift.active ? 'P2 · 托举中' : id.toUpperCase());
    }
    this.sharedCamera.update(ids.map((id) => {
      const p = this.partners[id]; return p.life === 'normal' ? p.actor.x : p.spawn.x;
    }), this.frameDelta);
  }
  private say(message: string): void { this.notice = message; this.noticeUntil = this.clock + 3500; }
  getFeedbackContext() {
    return { levelId: coopTutorial.id, mode: 'local-coop' as const, phase: this.phase,
      checkpointActive: this.rules.checkpointActive, seconds: Math.floor(this.clock / 1000) };
  }
  private renderOverlay(): void {
    let status = this.noticeUntil > this.clock ? this.notice : '';
    let hint = '';
    if (this.phase === 'ready') {
      status = this.ready.every(Boolean) ? '两人已就绪，请松开按键后出发。' : '两人各按一次准备键。';
      hint = '同一键盘，共享画面 · Esc 暂停\n布布在地面按住右 Shift，一二跳到头顶后可再次正常起跳。';
    } else if (this.phase === 'paused') {
      status = '按键已清空，准备好后再继续。'; hint = '按 Esc 或点击继续冒险。';
    } else if (this.phase === 'won') {
      status = '托举、开桥、双机关与共同终点：全部完成！';
      hint = `P1 掉落 ${this.partners.p1.falls} 次 · P2 掉落 ${this.partners.p2.falls} 次`;
    } else {
      const facts = ids.map((id) => this.fact(this.partners[id]));
      const distance = Math.abs(facts[0].x - facts[1].x);
      const selected = ids.filter((id) => interactionTarget(this.fact(this.partners[id]), this.rules.bridgeOpen ? [] : [COOP_LEVER]));
      if (selected.length) hint = selected.map((id) => `${id.toUpperCase()} 按 ${id === 'p1' ? 'E' : 'Enter'} 打开桥梁`).join(' · ');
      else if (this.lift.blockedAbove) hint = '头顶空间不足，请换到开阔地面托举。';
      else if (this.lift.supported) hint = '一二已站稳：按 W 从托举点起跳。布布保持右 Shift。';
      else if (!this.rules.bridgeOpen) hint = '布布在高台左侧按住右 Shift，一二从上方落到托举点。';
      else if (!this.rules.gateOpen) hint = '每人站一个紫色压力开关，门开启后会保持开放。';
      else if (!this.rules.checkpointActive) hint = '两人同时走进蓝色营地，激活检查点后再向前。';
      else hint = '跨过小坑，两人同时进入金色终点区。';
      if (distance >= COOP_DISTANCE.WARNING) status = '等等另一只熊 · 靠近队友再一起向前';
      else if (this.rules.checkpointActive && facts.some((p) => inside(p, COOP_GOAL))) status = '终点在等另一只熊。';
      else if (!status) status = `跑跳练习 ${ids.filter((id) => this.partners[id].moved && this.partners[id].jumped).length}/2 · ${this.rules.checkpointActive ? '营地已激活 ✓' : this.rules.gateOpen ? '双机关完成 ✓' : this.rules.bridgeOpen ? '桥梁已开启 ✓' : '一起去高台开桥'}`;
    }
    this.overlay.render({ phase: this.phase, ready: this.ready, status, hint, players: ids.map((id) =>
      `${id.toUpperCase()} ${id === 'p1' ? '一二 · A/D W E' : '布布 · ←/→ ↑ Enter'}${this.partners[id].life === 'respawning' ? ' · 复活中' : ''}`) });
  }
  private togglePause(): void {
    if (this.leaving || (this.phase !== 'playing' && this.phase !== 'paused')) return;
    this.phase = this.phase === 'playing' ? 'paused' : 'playing';
    this.controls.reset(); this.lift.stop();
    ids.forEach((id) => { this.partners[id].actor.clearJumpMemory(); this.partners[id].actor.arcadeBody.setAccelerationX(0); });
    this.physics.world.isPaused = this.phase === 'paused'; this.audio.setMusicPaused(this.phase === 'paused');
    this.renderOverlay();
  }
  private unfocus(): void {
    if (this.leaving) return;
    this.controls?.reset();
    if (this.phase === 'playing') this.togglePause();
    else if (this.phase === 'ready') { this.ready = [false, false]; this.renderOverlay(); }
  }
  private focusCanvas(): void { if (this.phase === 'playing') this.overlay.root.focus({ preventScroll: true }); }
  private onJump(): void { this.audio.play('jump'); }
  private navigate(restart: boolean): void {
    if (this.leaving) return;
    this.leaving = true; this.controls.reset(); this.lift.stop();
    if (restart) this.scene.restart(); else this.scene.start(SCENE.START);
  }
  private cleanup(): void {
    this.leaving = true; this.controls?.destroy(); this.lift?.destroy(); this.overlay?.destroy();
    this.input.off('pointerdown', this.focusCanvas, this);
    this.game.events.off('blur', this.unfocus, this); this.game.events.off('hidden', this.unfocus, this);
    this.game.events.off('player-jump', this.onJump, this);
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.afterPhysics, this);
    if (this.game.input.keyboard) this.game.input.keyboard.preventDefault = this.previousCapture;
    if (this.input.keyboard) this.input.keyboard.enabled = true;
  }
}
