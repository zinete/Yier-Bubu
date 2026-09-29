import Phaser from 'phaser';
import { REGISTRY, SCENE } from '../config/constants';
import { computeUILayout, isTouchPrimaryDevice } from '../systems/UILayout';
import type { AudioSettings } from '../systems/AudioManager';
import type { Control } from '../systems/InputManager';
import type { HudState } from '../types/game';

const TEXT_RESOLUTION = Math.min(window.devicePixelRatio || 1, 2);
const MAX_HEALTH = 3;

interface ActionControl {
  button: Phaser.GameObjects.Image;
  control: Control;
  size: number;
}

export class UIScene extends Phaser.Scene {
  private hudPanel!: Phaser.GameObjects.Image;
  private portrait!: Phaser.GameObjects.Sprite;
  private portraitFrame!: Phaser.GameObjects.Image;
  private divider!: Phaser.GameObjects.Rectangle;
  private hearts: Phaser.GameObjects.Image[] = [];
  private starText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Image;
  private soundButton!: Phaser.GameObjects.Image;
  private joystickPointerId?: number;
  private joystickDirection = 0;
  private joystickBase?: Phaser.GameObjects.Image;
  private joystickThumb?: Phaser.GameObjects.Arc;
  private joystickHitZone?: Phaser.GameObjects.Zone;
  private readonly actionControls: ActionControl[] = [];

  constructor() {
    super(SCENE.UI);
  }

  create(): void {
    this.hudPanel = this.add.image(0, 0, 'ui-hud-panel').setOrigin(0, 0).setScrollFactor(0);
    this.portraitFrame = this.add.image(0, 0, 'ui-portrait-frame').setScrollFactor(0).setDepth(2);
    this.portrait = this.add.sprite(0, 0, 'characters', 0).setScrollFactor(0).setDepth(3);
    this.divider = this.add.rectangle(0, 0, 2, 54, 0xdcc7a3, 0.72).setScrollFactor(0);

    for (let index = 0; index < MAX_HEALTH; index += 1) {
      this.hearts.push(this.add.image(0, 0, 'ui-heart-empty').setScrollFactor(0));
    }

    this.add.image(0, 0, 'ui-star').setName('starIcon').setScrollFactor(0);
    this.add.image(0, 0, 'ui-coin').setName('coinIcon').setScrollFactor(0);
    this.add.image(0, 0, 'ui-timer').setName('timerIcon').setScrollFactor(0);
    this.starText = this.hudText();
    this.scoreText = this.hudText();
    this.timerText = this.hudText();

    this.pauseButton = this.iconButton('ui-button-pause', () =>
      this.game.events.emit('game-action', 'pause'),
    );
    this.soundButton = this.iconButton('ui-button-sound-on', () =>
      this.game.events.emit('game-action', 'sound'),
    );

    this.registry.events.on('changedata-hud', this.render, this);
    this.registry.events.on('changedata-audioSettings', this.renderAudio, this);
    if (isTouchPrimaryDevice()) this.createMobileControls();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout();
    this.render(this.registry, this.registry.get('hud') as HudState);
    this.renderAudio(this.registry, this.registry.get(REGISTRY.AUDIO) as AudioSettings);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyUi());
  }

  private hudText(color = '#1d2b3a'): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, '', {
        fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif",
        fontSize: '18px',
        fontStyle: 'bold',
        color,
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setResolution(TEXT_RESOLUTION);
  }

  private iconButton(texture: string, action: () => void): Phaser.GameObjects.Image {
    return this.add
      .image(0, 0, texture)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        action();
      });
  }

  private render(_parent: Phaser.Data.DataManager, state: HudState): void {
    if (!state) return;
    this.portrait.setFrame(state.character === 'yier' ? 0 : 16);
    this.hearts.forEach((heart, index) => {
      heart.setTexture(index < state.health ? 'ui-heart-full' : 'ui-heart-empty');
    });
    this.starText.setText(`${state.coins}/${state.totalCoins}`);
    this.scoreText.setText(String(state.score));
    this.timerText.setText(`${state.seconds}s`);
    this.pauseButton.setTexture(state.paused ? 'ui-button-play' : 'ui-button-pause');
  }

  private renderAudio(_parent: Phaser.Data.DataManager, settings?: AudioSettings): void {
    this.soundButton.setTexture(
      settings?.sound === false ? 'ui-button-sound-off' : 'ui-button-sound-on',
    );
  }

  private createMobileControls(): void {
    this.joystickHitZone = this.add.zone(0, 0, 200, 200).setOrigin(0.5).setInteractive();
    this.joystickBase = this.add.image(0, 0, 'ui-joystick-idle').setScrollFactor(0);
    this.joystickThumb = this.add
      .circle(0, 0, 22, 0xffffff, 0.72)
      .setStrokeStyle(2, 0x2f80ed, 0.7)
      .setScrollFactor(0);
    this.joystickHitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.joystickPointerId = pointer.id;
      this.updateJoystick(pointer);
    });
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.actionControls.push(this.actionButton('ui-button-throw', 'attack', 74));
    this.actionControls.push(this.actionButton('ui-button-jump', 'jump', 88));
  }

  private actionButton(texture: string, control: Control, size: number): ActionControl {
    const button = this.add.image(0, 0, texture).setScrollFactor(0).setInteractive();
    const emit = (down: boolean): void => {
      button.setAlpha(down ? 0.78 : 1);
      this.game.events.emit('virtual-control', control, down);
    };
    button
      .on('pointerdown', () => emit(true))
      .on('pointerup', () => emit(false))
      .on('pointerout', () => emit(false))
      .on('pointerupoutside', () => emit(false));
    return { button, control, size };
  }

  private layout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const layout = computeUILayout(width, height);
    const margin = layout.margin;
    const scale = layout.hud.scale;
    const panelX = layout.hud.x;
    const panelY = layout.hud.y;

    this.hudPanel.setPosition(panelX, panelY).setDisplaySize(layout.hud.width, layout.hud.height);

    const portraitSize = 104 * scale;
    const portraitX = panelX + 26 * scale;
    const portraitY = panelY + 58 * scale;
    this.portraitFrame.setPosition(portraitX, portraitY).setDisplaySize(portraitSize, portraitSize);
    this.portrait
      .setPosition(portraitX, portraitY + 5 * scale)
      .setDisplaySize(70 * scale, 78 * scale);

    this.hearts.forEach((heart, index) => {
      heart
        .setPosition(panelX + (104 + index * 29) * scale, panelY + 34 * scale)
        .setDisplaySize(24 * scale, 21 * scale);
    });

    this.divider
      .setPosition(panelX + 213 * scale, panelY + 58 * scale)
      .setDisplaySize(Math.max(2, Math.round(2 * scale)), 54 * scale);
    this.positionIcon('coinIcon', panelX + 247 * scale, panelY + 34 * scale, 25 * scale);
    this.positionIcon('starIcon', panelX + 105 * scale, panelY + 78 * scale, 25 * scale);
    this.positionIcon('timerIcon', panelX + 247 * scale, panelY + 78 * scale, 25 * scale);
    this.scoreText
      .setPosition(panelX + 271 * scale, panelY + 34 * scale)
      .setFontSize(`${Math.round(18 * scale)}px`);
    this.starText
      .setPosition(panelX + 131 * scale, panelY + 78 * scale)
      .setFontSize(`${Math.round(18 * scale)}px`);
    this.timerText
      .setPosition(panelX + 273 * scale, panelY + 78 * scale)
      .setFontSize(`${Math.round(18 * scale)}px`);

    this.pauseButton
      .setPosition(width - margin, margin)
      .setDisplaySize(layout.topButtonSize, layout.topButtonSize);
    this.soundButton
      .setPosition(width - margin - layout.topButtonSize - 10, margin)
      .setDisplaySize(layout.topButtonSize, layout.topButtonSize);

    const base = this.joystickBase;
    const thumb = this.joystickThumb;
    const hitZone = this.joystickHitZone;
    if (base && thumb && hitZone) {
      base
        .setDisplaySize(layout.joystick.size, layout.joystick.size)
        .setPosition(layout.joystick.x, layout.joystick.y);
      hitZone.setSize(layout.joystick.hitSize, layout.joystick.hitSize).setPosition(base.x, base.y);
      thumb.setPosition(base.x, base.y).setRadius(Math.round(layout.joystick.size * 0.18));
      this.setJoystickDirection(0);
      this.joystickPointerId = undefined;
    }
    for (const action of this.actionControls) {
      const spec = action.control === 'jump' ? layout.jump : layout.attack;
      action.button.setPosition(spec.x, spec.y).setDisplaySize(spec.size, spec.size);
    }
  }

  private positionIcon(name: string, x: number, y: number, size: number): void {
    const icon = this.children.getByName(name) as Phaser.GameObjects.Image | null;
    icon?.setPosition(x, y).setDisplaySize(size, size);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joystickPointerId && pointer.isDown) this.updateJoystick(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.joystickPointerId) return;
    this.joystickPointerId = undefined;
    this.setJoystickDirection(0);
    this.joystickThumb?.setPosition(this.joystickBase?.x ?? 0, this.joystickBase?.y ?? 0);
  }

  private updateJoystick(pointer: Phaser.Input.Pointer): void {
    const base = this.joystickBase;
    const thumb = this.joystickThumb;
    if (!base || !thumb) return;
    const position = new Phaser.Math.Vector2(pointer.x, pointer.y);
    const limit = base.displayWidth * 0.28;
    const offsetX = Phaser.Math.Clamp(position.x - base.x, -limit, limit);
    const offsetY = Phaser.Math.Clamp(position.y - base.y, -limit, limit);
    thumb.setPosition(base.x + offsetX, base.y + offsetY);
    this.setJoystickDirection(
      Math.abs(offsetX) < base.displayWidth * 0.08 ? 0 : Math.sign(offsetX),
    );
  }

  private setJoystickDirection(direction: number): void {
    if (direction === this.joystickDirection) return;
    this.joystickDirection = direction;
    this.game.events.emit('virtual-control', 'left', direction < 0);
    this.game.events.emit('virtual-control', 'right', direction > 0);
  }

  private destroyUi(): void {
    this.registry.events.off('changedata-hud', this.render, this);
    this.registry.events.off('changedata-audioSettings', this.renderAudio, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.input.off('pointerupoutside', this.onPointerUp, this);
  }
}
