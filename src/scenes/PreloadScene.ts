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
import yierLiftSource from '../assets/start-screen/characters/yier-lift-source.png';
import bubuLiftSource from '../assets/start-screen/characters/bubu-lift-source.png';
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
import { isTouchPrimaryDevice } from '../systems/UILayout';

const IMAGES = [
  ['start-background', startBackground], ['start-logo', gameLogo],
  ['start-card-yier-idle', cardYierIdle], ['start-card-bubu-idle', cardBubuIdle],
  ['start-button-primary', startButton], ['start-button-secondary', secondaryButton],
  ['start-selected-check', selectedCheck], ['start-double-heart', doubleHeart],
  ['start-yier-thumb', yierThumb], ['start-bubu-thumb', bubuThumb],
  ['coop-lift-yier-source', yierLiftSource], ['coop-lift-bubu-source', bubuLiftSource],
  ['ui-portrait-frame', portraitFrame], ['ui-heart-full', iconHeartFull], ['ui-heart-empty', iconHeartEmpty],
  ['ui-star', iconStar], ['ui-coin', iconCoin], ['ui-timer', iconTimer],
  ['ui-button-sound-on', buttonSoundOn], ['ui-button-sound-off', buttonSoundOff],
  ['ui-button-pause', buttonPause], ['ui-button-play', buttonPlay],
] as const;
const TOUCH_IMAGES = [['ui-joystick-idle', joystickIdle], ['ui-button-jump', buttonJump], ['ui-button-throw', buttonThrow]] as const;

export class PreloadScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;
  private retryButton!: Phaser.GameObjects.Text;
  private retrying = false;
  private touchAssets = false;
  constructor() {
    super(SCENE.PRELOAD);
  }
  preload(): void {
    this.retrying = false;
    this.touchAssets = isTouchPrimaryDevice();
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
    if (this.touchAssets) for (const [key, url] of TOUCH_IMAGES) if (!this.textures.exists(key)) this.load.image(key, url);
  }
  create(): void {
    const missing = ['characters', ...IMAGES.map(([key]) => key), ...(this.touchAssets ? TOUCH_IMAGES.map(([key]) => key) : [])].filter((key) => !this.textures.exists(key));
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
    const liftFrames = {
      'lift-ready': { frames: [0, 1], frameRate: 6, repeat: -1 },
      'lift-catch': { frames: [2, 3], frameRate: 10, repeat: 0 },
      'lift-hold': { frames: [4, 5], frameRate: 4, repeat: -1 },
      'lift-takeoff': { frames: [6], frameRate: 8, repeat: 0 },
      'lift-release': { frames: [7], frameRate: 8, repeat: 0 },
      // Role-specific semantic aliases. Both characters register every role so
      // the same cooperation state machine also works in the reverse direction.
      'lift-carrying': { frames: [4, 5], frameRate: 4, repeat: -1 },
      'lift-riding': { frames: [4, 5], frameRate: 4, repeat: -1 },
      'lift-boost-jump': { frames: [6], frameRate: 8, repeat: 0 },
      'lift-cancel': { frames: [7], frameRate: 8, repeat: 0 },
    } as const;
    for (const character of ['yier', 'bubu'] as const)
      for (const [state, spec] of Object.entries(liftFrames)) {
        const key = `${character}-${state}`;
        if (!this.anims.exists(key))
          this.anims.create({
            key,
            frames: spec.frames.map((frame) => ({ key: `${character}-lift-sheet`, frame })),
            frameRate: spec.frameRate,
            repeat: spec.repeat,
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
    this.makeLiftSheet('yier-lift-sheet', 'coop-lift-yier-source');
    this.makeLiftSheet('bubu-lift-sheet', 'coop-lift-bubu-source');
  }

  /**
   * Image generation keeps the eight poses in a 4×2 contact sheet. Normalize
   * those cells into the game's existing 128×142 frame contract at load time,
   * without changing the Player display size, origin or physics body.
   */
  private makeLiftSheet(outputKey: string, sourceKey: string): void {
    if (this.textures.exists(outputKey)) return;
    const source = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
    const scratch = document.createElement('canvas');
    scratch.width = source.naturalWidth || source.width;
    scratch.height = source.naturalHeight || source.height;
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
    if (!scratchContext || !scratch.width || !scratch.height) return;
    scratchContext.drawImage(source, 0, 0);
    const pixels = scratchContext.getImageData(0, 0, scratch.width, scratch.height).data;
    const columns = 4, rows = 2, frameWidth = 128, frameHeight = 142;
    const bounds = Array.from({ length: columns * rows }, (_, index) => {
      const column = index % columns, row = Math.floor(index / columns);
      const cellX = Math.round(column * scratch.width / columns);
      const cellY = Math.round(row * scratch.height / rows);
      const cellRight = Math.round((column + 1) * scratch.width / columns);
      const cellBottom = Math.round((row + 1) * scratch.height / rows);
      let left = cellRight, top = cellBottom, right = cellX, bottom = cellY;
      for (let y = cellY; y < cellBottom; y += 1)
        for (let x = cellX; x < cellRight; x += 1)
          if (pixels[(y * scratch.width + x) * 4 + 3] > 12) {
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
          }
      if (right <= left || bottom <= top)
        return { x: cellX, y: cellY, width: cellRight - cellX, height: cellBottom - cellY };
      return { x: left, y: top, width: right - left, height: bottom - top };
    });
    const maxWidth = Math.max(...bounds.map((box) => box.width));
    const maxHeight = Math.max(...bounds.map((box) => box.height));
    const scale = Math.min(118 / maxWidth, 136 / maxHeight);
    const texture = this.textures.createCanvas(outputKey, frameWidth * bounds.length, frameHeight);
    if (!texture) return;
    texture.context.clearRect(0, 0, frameWidth * bounds.length, frameHeight);
    texture.context.imageSmoothingEnabled = true;
    bounds.forEach((box, index) => {
      const width = box.width * scale, height = box.height * scale;
      const x = index * frameWidth + (frameWidth - width) / 2;
      const y = frameHeight - height - 2;
      texture.context.drawImage(source, box.x, box.y, box.width, box.height, x, y, width, height);
      texture.add(index, 0, index * frameWidth, 0, frameWidth, frameHeight);
    });
    texture.refresh();
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
