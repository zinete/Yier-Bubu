import Phaser from 'phaser';
import { SCENE } from '../config/constants';
import characterSheet from '../assets/start-screen/characters/characters-sheet.png';
import startBackground from '../assets/start-screen/background/start-background.png';
import gameLogo from '../assets/start-screen/logo/game-logo.png';
import cardYierIdle from '../assets/start-screen/cards/card-yier-idle.png';
import cardBubuIdle from '../assets/start-screen/cards/card-bubu-idle.png';
import startButton from '../assets/start-screen/buttons/button-start.png';
import secondaryButton from '../assets/start-screen/buttons/button-secondary.png';
import startSoundOn from '../assets/start-screen/buttons/button-sound-on.png';
import startSoundOff from '../assets/start-screen/buttons/button-sound-off.png';
import settingsButton from '../assets/start-screen/buttons/button-settings.png';
import selectedCheck from '../assets/start-screen/icons/selected-check.png';
import doubleHeart from '../assets/start-screen/icons/double-heart.png';
import daisy from '../assets/start-screen/icons/daisy.png';
import yierThumb from '../assets/start-screen/characters/yier-thumb.png';
import bubuThumb from '../assets/start-screen/characters/bubu-thumb.png';
import hudPanel from '../assets/ui/hud-panel.png';
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
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENE.PRELOAD);
  }
  preload(): void {
    for (const [key, url] of Object.entries(generatedAudio())) this.load.audio(key, url);
    ViewportManager.attach(this);
    const label = this.add
      .text(480, 270, '正在加载冒险素材…', { fontSize: '22px', color: '#1d2b3a' })
      .setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      label.setText(file.type === 'audio' ? '声音暂不可用，继续加载游戏…' : `资源加载失败：${file.key}`);
    });
    this.load.spritesheet('characters', characterSheet, { frameWidth: 128, frameHeight: 142 });
    this.load.image('start-background', startBackground);
    this.load.image('start-logo', gameLogo);
    this.load.image('start-card-yier-idle', cardYierIdle);
    this.load.image('start-card-bubu-idle', cardBubuIdle);
    this.load.image('start-button-primary', startButton);
    this.load.image('start-button-secondary', secondaryButton);
    this.load.image('start-button-sound-on', startSoundOn);
    this.load.image('start-button-sound-off', startSoundOff);
    this.load.image('start-button-settings', settingsButton);
    this.load.image('start-selected-check', selectedCheck);
    this.load.image('start-double-heart', doubleHeart);
    this.load.image('start-daisy', daisy);
    this.load.image('start-yier-thumb', yierThumb);
    this.load.image('start-bubu-thumb', bubuThumb);
    this.load.image('ui-hud-panel', hudPanel);
    this.load.image('ui-portrait-frame', portraitFrame);
    this.load.image('ui-heart-full', iconHeartFull);
    this.load.image('ui-heart-empty', iconHeartEmpty);
    this.load.image('ui-star', iconStar);
    this.load.image('ui-coin', iconCoin);
    this.load.image('ui-timer', iconTimer);
    this.load.image('ui-joystick-idle', joystickIdle);
    this.load.image('ui-button-jump', buttonJump);
    this.load.image('ui-button-throw', buttonThrow);
    this.load.image('ui-button-sound-on', buttonSoundOn);
    this.load.image('ui-button-sound-off', buttonSoundOff);
    this.load.image('ui-button-pause', buttonPause);
    this.load.image('ui-button-play', buttonPlay);
  }
  create(): void {
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
