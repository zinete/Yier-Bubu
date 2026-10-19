import Phaser from 'phaser';
import { REGISTRY, SCENE } from '../config/constants';
import {
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from '../systems/AudioManager';

import { ViewportManager } from '../systems/ViewportManager';

import type { CharacterId } from '../types/game';
import { levels } from '../levels';
import { loadProgress } from '../systems/ProgressStore';
import { openFeedback } from '../systems/ReleaseSupport';

const WIDTH = 1920;
const HEIGHT = 1080;
const FONT = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif";
const TEXT_RESOLUTION = Math.min(window.devicePixelRatio || 1, 2);
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
  private audioLabels: Phaser.GameObjects.Text[] = [];
  private navigating = false;
  private entryGeneration = 0;
  private editorEntry!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE.START);
  }

  create(): void {
    this.navigating = false;
    this.entryGeneration += 1;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.entryGeneration += 1; });
    this.audioLabels = [];
    ViewportManager.attach(this, 0x9bd8ff, WIDTH, HEIGHT);
    this.selected = (this.registry.get(REGISTRY.CHARACTER) as CharacterId | undefined) ?? 'yier';

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
    this.editorEntry = this.add.text(WIDTH / 2, 975, '✦ 地图工坊 · 创建自己的冒险', {
      fontFamily: FONT, fontSize: '28px', color: '#416b59', backgroundColor: '#fff7e5', padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerup', () => { void this.openEditor(); });
    const progress = loadProgress();
    levels.forEach((level, index) => {
      const unlocked = progress.unlocked.includes(level.id);
      const record = progress.records[level.id];
      const entry = this.add.text(680 + index * 560, 1030,
        unlocked ? `${level.id}  ${record ? `最佳 ${record.bestScore}${record.allCollected ? ' · 全收集' : ''}` : '开始挑战'}` : `${level.id}  通关首关解锁`,
        { fontFamily: FONT, fontSize: '24px', color: unlocked ? '#77512d' : '#888888' },
      ).setOrigin(0.5).setResolution(TEXT_RESOLUTION);
      if (unlocked) entry.setInteractive({ useHandCursor: true }).on('pointerup', () => this.startGame(level.id));
    });
    this.bindKeyboard();
    this.add.text(WIDTH / 2, 780, '← / → 选角色 · Enter 开始 · S 设置 · 1 / 2 选关', {
      fontFamily: FONT, fontSize: '24px', color: '#604320',
    }).setOrigin(0.5).setResolution(TEXT_RESOLUTION);
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
        .text(0, -4, loadProgress().started ? '继续游戏' : '开始游戏', {
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
      .setInteractive(
        new Phaser.Geom.Rectangle(-255, -78, 510, 157),
        Phaser.Geom.Rectangle.Contains,
      )
      .on('pointerover', () => this.tweens.add({ targets: button, scale: 1.035, duration: 120 }))
      .on('pointerout', () => this.tweens.add({ targets: button, scale: 1, duration: 120 }))
      .on('pointerdown', () =>
        this.tweens.add({ targets: button, scale: 0.97, yoyo: true, duration: 80 }),
      )
      .on('pointerup', () => this.startGame());

  }

  private createUtilityButtons(): void {
    this.soundButton = this.add.image(WIDTH - 216, 88, 'ui-button-sound-on').setDisplaySize(88, 88);
    const settingsButton = this.add.image(WIDTH - 104, 88, 'start-settings-clean').setDisplaySize(88, 88);
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
      .rectangle(0, 0, 760, 590, 0xfffbeb, 0.98)
      .setStrokeStyle(5, 0xe7bd72)
      .setOrigin(0.5);
    const title = this.add
      .text(0, -240, '设置', {
        fontFamily: FONT,
        fontSize: '42px',
        fontStyle: 'bold',
        color: '#77512d',
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    const soundLabel = this.add
      .text(-92, -170, '音效', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#6e5a45',
      })
      .setOrigin(1, 0.5)
      .setResolution(TEXT_RESOLUTION);
    this.settingsSoundButton = this.add
      .image(28, -170, 'ui-button-sound-on')
      .setDisplaySize(88, 88);
    this.bindImageButton(this.settingsSoundButton, () => this.toggleSound());

    const close = this.add.container(0, 215);
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
      .setInteractive(
        new Phaser.Geom.Rectangle(-130, -52, 260, 104),
        Phaser.Geom.Rectangle.Contains,
      )
      .on('pointerup', () => this.setSettingsVisible(false));

    this.settingsModal = this.add
      .container(WIDTH / 2, HEIGHT / 2, [
        backdrop,
        panel,
        title,
        soundLabel,
        this.settingsSoundButton,
        close,
      ])
      .setDepth(100)
      .setVisible(false);
    const rows = [
      { y: -85, action: () => this.changeAudio('music'), label: 'music' },
      { y: 0, action: () => this.changeAudio('soundVolume', 0.1), label: 'soundVolume' },
      { y: 85, action: () => this.changeAudio('musicVolume', 0.1), label: 'musicVolume' },
    ] as const;
    for (const row of rows) {
      const label = this.add.text(0, row.y, '', {
        fontFamily: FONT, fontSize: '27px', color: '#604320',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerup', row.action);
      this.audioLabels.push(label);
      this.settingsModal.add(label);
      if (row.label !== 'music') {
        for (const direction of [-1, 1]) {
          const button = this.add.text(direction * 265, row.y, direction < 0 ? '−' : '+', {
            fontSize: '36px', color: '#2776c9', backgroundColor: '#eee6d3', padding: { x: 18, y: 5 },
          }).setOrigin(0.5).setInteractive({ useHandCursor: true })
            .on('pointerup', () => this.changeAudio(row.label, direction * 0.1));
          this.settingsModal.add(button);
        }
      }
    }
    this.settingsModal.add(this.add.text(0, 145, '0.1 试玩版 · 问题反馈与版本', {
      fontFamily: FONT, fontSize: '24px', color: '#2776c9', padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerup', openFeedback));
    this.renderAudioLabels();
  }

  private changeAudio(key: 'music' | 'soundVolume' | 'musicVolume', delta = 0): void {
    const settings = loadAudioSettings();
    if (key === 'music') settings.music = !settings.music;
    else settings[key] = Phaser.Math.Clamp(Math.round((settings[key] + delta) * 10) / 10, 0, 1);
    saveAudioSettings(settings);
    this.registry.set(REGISTRY.AUDIO, settings);
    this.renderAudioLabels();
  }
  private renderAudioLabels(): void {
    const settings = loadAudioSettings();
    this.audioLabels[0]?.setText(`音乐：${settings.music ? '开启' : '关闭'}（点击切换）`);
    this.audioLabels[1]?.setText(`音效音量：${Math.round(settings.soundVolume * 100)}%`);
    this.audioLabels[2]?.setText(`音乐音量：${Math.round(settings.musicVolume * 100)}%`);
  }

  private bindKeyboard(): void {
    this.input.keyboard?.on('keydown-LEFT', () => this.settingsModal.visible ? this.changeAudio('soundVolume', -0.1) : this.selectCharacter('yier'));
    this.input.keyboard?.on('keydown-A', () => this.selectCharacter('yier'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.settingsModal.visible ? this.changeAudio('soundVolume', 0.1) : this.selectCharacter('bubu'));
    this.input.keyboard?.on('keydown-D', () => this.selectCharacter('bubu'));
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.settingsModal.visible) this.startGame();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.setSettingsVisible(false));
    this.input.keyboard?.on('keydown-S', () => this.setSettingsVisible(!this.settingsModal.visible));
    this.input.keyboard?.on('keydown-M', () => this.toggleSound());
    this.input.keyboard?.on('keydown-N', () => { if (this.settingsModal.visible) this.changeAudio('music'); });
    this.input.keyboard?.on('keydown-UP', () => { if (this.settingsModal.visible) this.changeAudio('musicVolume', 0.1); });
    this.input.keyboard?.on('keydown-DOWN', () => { if (this.settingsModal.visible) this.changeAudio('musicVolume', -0.1); });
    this.input.keyboard?.on('keydown-ONE', () => this.startGame(levels[0].id));
    this.input.keyboard?.on('keydown-TWO', () => {
      if (loadProgress().unlocked.includes(levels[1].id)) this.startGame(levels[1].id);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllListeners());
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
    const texture = settings?.sound === false ? 'ui-button-sound-off' : 'ui-button-sound-on';
    this.soundButton?.setTexture(texture).setDisplaySize(88, 88);
    this.settingsSoundButton?.setTexture(texture).setDisplaySize(88, 88);
  }

  private setSettingsVisible(visible: boolean): void {
    this.settingsModal.setVisible(visible);
  }

  private startGame(levelId?: string): void {
    if (this.settingsModal.visible || this.navigating) return;
    this.navigating = true;
    this.registry.set(REGISTRY.CHARACTER, this.selected);
    try {
      localStorage.setItem(REGISTRY.CHARACTER, this.selected);
    } catch {
      // Starting the game does not depend on storage access.
    }
    const progress = loadProgress();
    this.scene.start(SCENE.GAME, {
      levelId: levelId ?? (progress.started ? progress.currentLevel : levels[0].id),
    });
  }

  private async openEditor(): Promise<void> {
    if (this.settingsModal.visible || this.navigating) return;
    this.navigating = true;
    const generation = this.entryGeneration;
    this.editorEntry.setText('正在打开地图工坊…');
    try {
      if (!this.scene.get(SCENE.EDITOR)) {
        const { EditorScene } = await import('./EditorScene');
        if (generation !== this.entryGeneration) return;
        this.scene.add(SCENE.EDITOR, EditorScene, false);
      }
      if (generation === this.entryGeneration) this.scene.start(SCENE.EDITOR);
    } catch {
      if (generation !== this.entryGeneration) return;
      this.navigating = false;
      this.editorEntry.setText('工坊加载失败 · 点击重试，或刷新页面');
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
