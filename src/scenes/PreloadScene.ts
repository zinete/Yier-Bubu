import Phaser from 'phaser';
import { SCENE } from '../config/constants';
import characterSheet from '../assets/start-screen/characters/characters-sheet.png';
import startBackground from '../assets/start-screen/background/start-background.png';
import gameLogo from '../assets/start-screen/logo/game-logo.png';
import cardYierIdle from '../assets/start-screen/cards/card-yier-idle.png';
import cardBubuIdle from '../assets/start-screen/cards/card-bubu-idle.png';
import startButton from '../assets/start-screen/buttons/button-start.png';
import secondaryButton from '../assets/start-screen/buttons/button-secondary.png';
import selectedCheck from '../assets/start-screen/icons/selected-check.png';
import doubleHeart from '../assets/start-screen/icons/double-heart.png';
import yierThumb from '../assets/start-screen/characters/yier-thumb.png';
import bubuThumb from '../assets/start-screen/characters/bubu-thumb.png';
import portraitFrame from '../assets/ui/portrait-frame.png';
import iconHeartFull from '../assets/ui/icon-heart-full.png';
import iconHeartEmpty from '../assets/ui/icon-heart-empty.png';
import iconStar from '../assets/ui/icon-star.png';
import iconCoin from '../assets/ui/icon-coin.png';
import iconTimer from '../assets/ui/icon-timer.png';
import joystickIdle from '../assets/ui/joystick-idle.png';
import buttonJump from '../assets/ui/button-jump.png';
import buttonThrow from '../assets/ui/button-throw.png';
import buttonSoundOn from '../assets/ui/button-sound-on.png';
import buttonSoundOff from '../assets/ui/button-sound-off.png';
import buttonPause from '../assets/ui/button-pause.png';
import buttonPlay from '../assets/ui/button-play.png';
import { ViewportManager } from '../systems/ViewportManager';
import { generatedAudio } from '../systems/GeneratedAudio';

const IMAGES = [
  ['start-background', startBackground], ['start-logo', gameLogo],
  ['start-card-yier-idle', cardYierIdle], ['start-card-bubu-idle', cardBubuIdle],
  ['start-button-primary', startButton], ['start-button-secondary', secondaryButton],
  ['start-selected-check', selectedCheck], ['start-double-heart', doubleHeart],
  ['start-yier-thumb', yierThumb], ['start-bubu-thumb', bubuThumb],
  ['ui-portrait-frame', portraitFrame], ['ui-heart-full', iconHeartFull], ['ui-heart-empty', iconHeartEmpty],
  ['ui-star', iconStar], ['ui-coin', iconCoin], ['ui-timer', iconTimer],
  ['ui-joystick-idle', joystickIdle], ['ui-button-jump', buttonJump], ['ui-button-throw', buttonThrow],
  ['ui-button-sound-on', buttonSoundOn], ['ui-button-sound-off', buttonSoundOff],
  ['ui-button-pause', buttonPause], ['ui-button-play', buttonPlay],
] as const;

export class PreloadScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;
  private retryButton!: Phaser.GameObjects.Text;
  private retrying = false;
  constructor() {
    super(SCENE.PRELOAD);
  }
  preload(): void {
    this.retrying = false;
    ViewportManager.attach(this);
    this.label = this.add
      .text(480, 240, '正在加载冒险素材…', { fontSize: '22px', color: '#1d2b3a', align: 'center', wordWrap: { width: 820 } })
      .setOrigin(0.5);
    this.retryButton = this.add.text(480, 350, '重试加载 · Enter', {
      fontSize: '24px', color: '#ffffff', backgroundColor: '#416b59', padding: { x: 24, y: 16 },
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true })
      .on('pointerup', this.retry, this);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onFileError, this);
    this.load.on(Phaser.Loader.Events.PROGRESS, this.onProgress, this);
    this.input.keyboard?.on('keydown-ENTER', this.retry, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onFileError, this);
      this.load.off(Phaser.Loader.Events.PROGRESS, this.onProgress, this);
      this.input.keyboard?.off('keydown-ENTER', this.retry, this);
    });
    for (const [key, url] of Object.entries(generatedAudio()))
      if (!this.cache.audio.exists(key)) this.load.audio(key, url);
    if (!this.textures.exists('characters'))
      this.load.spritesheet('characters', characterSheet, { frameWidth: 128, frameHeight: 142 });
    for (const [key, url] of IMAGES) if (!this.textures.exists(key)) this.load.image(key, url);
  }
  create(): void {
    const missing = ['characters', ...IMAGES.map(([key]) => key)].filter((key) => !this.textures.exists(key));
    if (missing.length) {
      this.label.setText(`有 ${missing.length} 项必要素材未能加载。\n请检查网络后重试；已加载的素材不会重复下载。\n${missing.slice(0, 3).join('、')}`);
      this.retryButton.setVisible(true);
      return;
    }
    this.makeTextures();
    this.trimStartCardTextures();
    const frames = {
      idle: [0, 1, 2, 3],
      run: [4, 5, 6, 7, 8, 9],
      jump: [10, 11],
      fall: [12, 13],
      hurt: [14, 15],
    };
    for (const [character, row] of [
      ['yier', 0],
      ['bubu', 1],
    ] as const)
      for (const [state, indexes] of Object.entries(frames)) {
        const key = `${character}-${state}`;
        if (!this.anims.exists(key))
          this.anims.create({
            key,
            frames: indexes.map((index) => ({ key: 'characters', frame: row * 16 + index })),
            frameRate: state === 'run' ? 12 : 7,
            repeat: state === 'hurt' ? 0 : -1,
          });
      }
    this.scene.start(SCENE.START);
  }
  private onFileError(file: Phaser.Loader.File): void {
    this.label.setText(file.type === 'audio' ? '声音暂不可用，继续加载游戏…' : `资源加载失败：${file.key}，加载结束后可重试`);
  }
  private onProgress(progress: number): void { this.label.setText(`正在加载冒险素材… ${Math.round(progress * 100)}%`); }
  private retry(event?: KeyboardEvent): void {
    if (this.retrying || !this.retryButton.visible || event?.repeat) return;
    this.retrying = true;
    this.retryButton.setVisible(false);
    this.scene.restart();
  }
  private makeTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    const texture = (key: string, draw: () => void, width: number, height: number): void => {
      if (this.textures.exists(key)) return;
      draw();
      graphics.generateTexture(key, width, height);
      graphics.clear();
    };
    texture('start-settings-clean', () => {
      graphics.fillStyle(0xc99c51).fillCircle(50, 52, 46);
      graphics.fillStyle(0xfff5d8).fillCircle(50, 49, 44);
      graphics.lineStyle(2, 0xe8c989).strokeCircle(50, 49, 42);
      graphics.lineStyle(3, 0xffffff, 0.9).strokeCircle(50, 49, 37);
      // 完整绘制齿轮，避免源图裁切及相邻按钮残片。
      const teeth: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < 40; i += 1) {
        const angle = i * Math.PI / 20;
        const radius = i % 5 < 3 ? 24 : 18;
        teeth.push({ x: 50 + Math.cos(angle) * radius, y: 49 + Math.sin(angle) * radius });
      }
      graphics.fillStyle(0x355b8e).fillPoints(teeth, true);
      graphics.fillStyle(0xfff5d8).fillCircle(50, 49, 8);
    }, 100, 100);
    texture(
      'platform',
      () => {
        graphics
          .fillStyle(0x7b5b3c)
          .fillRoundedRect(0, 0, 64, 32, 7)
          .fillStyle(0xa87b52)
          .fillRect(4, 4, 56, 9)
          .fillStyle(0x5b9b45)
          .fillRect(0, 0, 64, 7);
      },
      64,
      32,
    );
    texture(
      'coin',
      () => {
        graphics
          .fillStyle(0xf2b705)
          .fillCircle(14, 14, 14)
          .fillStyle(0xffe581)
          .fillCircle(11, 10, 5)
          .lineStyle(2, 0xc48600)
          .strokeCircle(14, 14, 12);
      },
      28,
      28,
    );
    texture(
      'fruit',
      () => {
        graphics
          .fillStyle(0xff5b64)
          .fillCircle(9, 9, 9)
          .fillStyle(0x44a65a)
          .fillTriangle(9, 2, 16, 0, 13, 7);
      },
      20,
      20,
    );
    texture(
      'enemy',
      () => {
        graphics
          .fillStyle(0x64aa5e)
          .fillRoundedRect(0, 0, 40, 34, 11)
          .fillStyle(0xffffff)
          .fillCircle(13, 13, 5)
          .fillCircle(27, 13, 5)
          .fillStyle(0x1d2b3a)
          .fillCircle(14, 14, 2)
          .fillCircle(28, 14, 2);
      },
      40,
      34,
    );
  }

  private trimStartCardTextures(): void {
    this.trimTexture('start-card-yier', 'start-card-yier-idle', 7, 49, 449, 442);
    this.trimTexture('start-card-bubu', 'start-card-bubu-idle', 8, 9, 449, 438);
  }

  private trimTexture(
    key: string,
    sourceKey: string,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number,
  ): void {
    if (this.textures.exists(key)) return;
    const source = this.textures.get(sourceKey).getSourceImage() as CanvasImageSource;
    const texture = this.textures.createCanvas(key, cropWidth, cropHeight);
    if (!texture) return;
    texture.context.clearRect(0, 0, cropWidth, cropHeight);
    texture.context.drawImage(
      source,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );
    texture.refresh();
  }
}
