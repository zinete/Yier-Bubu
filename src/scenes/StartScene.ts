import Phaser from 'phaser';
import { REGISTRY, SCENE } from '../config/constants';
import {
  DEFAULT_AUDIO_SETTINGS,
  saveAudioSettings,
  type AudioSettings,
} from '../systems/AudioManager';
import type { CharacterId } from '../types/game';

const WIDTH = 1920;
const HEIGHT = 1080;
const FONT = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif";
const TEXT_RESOLUTION = Math.min(window.devicePixelRatio || 1, 2);
const STARTED_KEY = 'yierBubuHasStarted';
const CARD_CENTER_Y = 558;

export class StartScene extends Phaser.Scene {
  private selected: CharacterId = 'yier';
  private yierCard!: Phaser.GameObjects.Image;
  private bubuCard!: Phaser.GameObjects.Image;
  private yierCheck!: Phaser.GameObjects.Image;
  private bubuCheck!: Phaser.GameObjects.Image;
  private soundButton!: Phaser.GameObjects.Image;
  private settingsSoundButton!: Phaser.GameObjects.Image;
  private settingsModal!: Phaser.GameObjects.Container;
  private selectionTween?: Phaser.Tweens.Tween;

  constructor() {
    super(SCENE.START);
  }

  create(): void {
    this.selected = (this.registry.get(REGISTRY.CHARACTER) as CharacterId | undefined) ?? 'yier';
    this.cameras.main.setBackgroundColor('#9bd8ff');

    this.add.image(WIDTH / 2, HEIGHT / 2, 'start-background').setDisplaySize(WIDTH, HEIGHT);
    this.add.image(WIDTH / 2, 138, 'start-logo').setDisplaySize(760, 276);
    this.add
      .text(WIDTH / 2, 248, '两只小熊，一段关于相遇、成长与陪伴的冒险', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#77512d',
        stroke: '#fff8e8',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);

    this.createCharacterCards();
    this.createStartButton();
    this.createUtilityButtons();
    this.createSettingsModal();
    this.bindKeyboard();
  }

  private createCharacterCards(): void {
    const cardY = CARD_CENTER_Y;

    this.yierCard = this.add
      .image(680, cardY, 'start-card-yier')
      .setDisplaySize(430, 410)
      .setInteractive({ useHandCursor: true });
    this.bubuCard = this.add
      .image(1240, cardY, 'start-card-bubu')
      .setDisplaySize(430, 410)
      .setInteractive({ useHandCursor: true });

    // The supplied thumb filenames are reversed relative to the story names.
    this.add.image(680, cardY - 38, 'start-bubu-thumb').setDisplaySize(215, 215);
    this.add.image(1240, cardY - 38, 'start-yier-thumb').setDisplaySize(215, 215);
    this.add.image(WIDTH / 2, cardY - 2, 'start-double-heart').setDisplaySize(150, 87);
    this.yierCheck = this.add
      .image(895, cardY - 226, 'start-selected-check')
      .setDisplaySize(64, 64);
    this.bubuCheck = this.add
      .image(1455, cardY - 226, 'start-selected-check')
      .setDisplaySize(64, 64);

    this.add
      .text(680, cardY + 133, '一二', this.nameStyle('#2776c9'))
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    this.add
      .text(1240, cardY + 133, '布布', this.nameStyle('#a86216'))
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    this.add
      .text(680, cardY + 181, '勇敢好奇 · 喜欢发现新世界', this.tagStyle())
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    this.add
      .text(1240, cardY + 181, '温柔可靠 · 总是在身边支持', this.tagStyle())
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);

    this.yierCard.on('pointerdown', () => this.selectCharacter('yier'));
    this.bubuCard.on('pointerdown', () => this.selectCharacter('bubu'));
    this.selectCharacter(this.selected);
  }

  private createStartButton(): void {
    const button = this.add.container(WIDTH / 2, 865);
    button.add(this.add.image(0, 0, 'start-button-primary').setDisplaySize(510, 157));
    button.add(
      this.add
        .text(0, -4, '开始旅程', {
          fontFamily: FONT,
          fontSize: '52px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#2568be',
          strokeThickness: 7,
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION),
    );
    button
      .setSize(510, 157)
      .setInteractive(new Phaser.Geom.Rectangle(-255, -78, 510, 157), Phaser.Geom.Rectangle.Contains)
      .on('pointerover', () => this.tweens.add({ targets: button, scale: 1.035, duration: 120 }))
      .on('pointerout', () => this.tweens.add({ targets: button, scale: 1, duration: 120 }))
      .on('pointerdown', () => this.tweens.add({ targets: button, scale: 0.97, yoyo: true, duration: 80 }))
      .on('pointerup', () => this.startGame());

    if (this.hasStarted()) {
      this.add
        .text(WIDTH / 2, 965, '继续上次冒险  〉', {
          fontFamily: FONT,
          fontSize: '25px',
          color: '#76512f',
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.startGame());
    }
  }

  private createUtilityButtons(): void {
    this.soundButton = this.add.image(1740, 76, 'start-button-sound-on').setDisplaySize(82, 80);
    const settingsButton = this.add
      .image(1834, 76, 'start-button-settings')
      .setDisplaySize(82, 80);
    this.bindImageButton(this.soundButton, () => this.toggleSound());
    this.bindImageButton(settingsButton, () => this.setSettingsVisible(true));
    this.renderSoundButtons();
  }

  private createSettingsModal(): void {
    const backdrop = this.add
      .rectangle(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT, 0x3c2b22, 0.45)
      .setOrigin(0)
      .setInteractive();
    const panel = this.add
      .rectangle(0, 0, 610, 390, 0xfffbeb, 0.98)
      .setStrokeStyle(5, 0xe7bd72)
      .setOrigin(0.5);
    const title = this.add
      .text(0, -132, '设置', {
        fontFamily: FONT,
        fontSize: '42px',
        fontStyle: 'bold',
        color: '#77512d',
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    const soundLabel = this.add
      .text(-92, -35, '声音', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#6e5a45',
      })
      .setOrigin(1, 0.5)
      .setResolution(TEXT_RESOLUTION);
    this.settingsSoundButton = this.add
      .image(28, -35, 'start-button-sound-on')
      .setDisplaySize(82, 80);
    this.bindImageButton(this.settingsSoundButton, () => this.toggleSound());

    const close = this.add.container(0, 105);
    close.add(this.add.image(0, 0, 'start-button-secondary').setDisplaySize(260, 104));
    close.add(
      this.add
        .text(0, -3, '返回', {
          fontFamily: FONT,
          fontSize: '31px',
          fontStyle: 'bold',
          color: '#77512d',
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION),
    );
    close
      .setSize(260, 104)
      .setInteractive(new Phaser.Geom.Rectangle(-130, -52, 260, 104), Phaser.Geom.Rectangle.Contains)
      .on('pointerup', () => this.setSettingsVisible(false));

    this.settingsModal = this.add
      .container(WIDTH / 2, HEIGHT / 2, [backdrop, panel, title, soundLabel, this.settingsSoundButton, close])
      .setDepth(100)
      .setVisible(false);
  }

  private bindKeyboard(): void {
    this.input.keyboard?.on('keydown-LEFT', () => this.selectCharacter('yier'));
    this.input.keyboard?.on('keydown-A', () => this.selectCharacter('yier'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.selectCharacter('bubu'));
    this.input.keyboard?.on('keydown-D', () => this.selectCharacter('bubu'));
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.settingsModal.visible) this.startGame();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.setSettingsVisible(false));
  }

  private selectCharacter(character: CharacterId): void {
    this.selected = character;
    // Keep both character backgrounds unchanged; selection is represented by the check animation.
    this.selectionTween?.stop();
    this.yierCheck.setVisible(character === 'yier').setAlpha(1);
    this.bubuCheck.setVisible(character === 'bubu').setAlpha(1);
    const target = character === 'yier' ? this.yierCheck : this.bubuCheck;
    this.selectionTween = this.tweens.add({
      targets: target,
      alpha: { from: 1, to: 0.78 },
      duration: 720,
      ease: 'Sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private bindImageButton(button: Phaser.GameObjects.Image, action: () => void): void {
    button
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => button.setAlpha(0.88))
      .on('pointerout', () => button.setAlpha(1))
      .on('pointerdown', () => button.setAlpha(0.7))
      .on('pointerup', () => {
        button.setAlpha(1);
        action();
      });
  }

  private toggleSound(): void {
    const current = (this.registry.get(REGISTRY.AUDIO) as AudioSettings | undefined) ?? {
      ...DEFAULT_AUDIO_SETTINGS,
    };
    const next = { ...current, sound: !current.sound };
    saveAudioSettings(next);
    this.registry.set(REGISTRY.AUDIO, next);
    this.renderSoundButtons();
  }

  private renderSoundButtons(): void {
    const settings = this.registry.get(REGISTRY.AUDIO) as AudioSettings | undefined;
    const texture = settings?.sound === false ? 'start-button-sound-off' : 'start-button-sound-on';
    this.soundButton?.setTexture(texture).setDisplaySize(82, 80);
    this.settingsSoundButton?.setTexture(texture).setDisplaySize(82, 80);
  }

  private setSettingsVisible(visible: boolean): void {
    this.settingsModal.setVisible(visible);
  }

  private startGame(): void {
    if (this.settingsModal.visible) return;
    this.registry.set(REGISTRY.CHARACTER, this.selected);
    try {
      localStorage.setItem(REGISTRY.CHARACTER, this.selected);
      localStorage.setItem(STARTED_KEY, 'true');
    } catch {
      // Starting the game does not depend on storage access.
    }
    this.scene.start(SCENE.GAME);
  }

  private hasStarted(): boolean {
    try {
      return localStorage.getItem(STARTED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private nameStyle(color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: FONT,
      fontSize: '38px',
      fontStyle: 'bold',
      color,
      stroke: '#fff8e8',
      strokeThickness: 5,
    };
  }

  private tagStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: FONT,
      fontSize: '20px',
      color: '#6e5a45',
    };
  }
}
