import Phaser from 'phaser';
import { SCENE } from '../config/constants';
import { ViewportManager } from '../systems/ViewportManager';
interface ResultData {
  won: boolean;
  message: string;
  score: number;
}

const FONT = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif";
const TEXT_RESOLUTION = Math.min(window.devicePixelRatio || 1, 2);
export class ResultScene extends Phaser.Scene {
  private restarting = false;

  constructor() {
    super(SCENE.RESULT);
  }
  create(data: ResultData): void {
    this.restarting = false;
    ViewportManager.attach(this, 0x1d2b3a);

    this.add.rectangle(480, 270, 6000, 6000, 0x1d2b3a, 0.62);

    const accent = data.won ? 0x34a853 : 0xe04f5f;
    this.add.rectangle(487, 282, 500, 316, 0x000000, 0.32);
    const panel = this.add.container(480, 270);
    panel.add(this.add.rectangle(0, 0, 500, 316, 0xfff8ec, 0.98).setStrokeStyle(4, accent));
    panel.add(
      this.add
        .text(0, -102, data.won ? '通关成功！' : '挑战失败', {
          fontFamily: FONT,
          fontSize: '42px',
          fontStyle: 'bold',
          color: data.won ? '#24813e' : '#c7374b',
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION),
    );
    panel.add(
      this.add
        .text(0, -28, data.message, {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#40566b',
          align: 'center',
          wordWrap: { width: 400 },
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION),
    );
    panel.add(
      this.add
        .text(0, 32, `本次分数：${data.score}`, {
          fontFamily: FONT,
          fontSize: '23px',
          fontStyle: 'bold',
          color: '#1d2b3a',
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION),
    );

    const restart = this.add.container(0, 110);
    restart.add(this.add.image(0, 0, 'start-button-secondary').setDisplaySize(250, 100));
    restart.add(
      this.add
        .text(0, 6, '再玩一次', {
          fontFamily: FONT,
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#77512d',
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION),
    );
    restart
      .setSize(250, 100)
      .setInteractive(
        new Phaser.Geom.Rectangle(-125, -50, 250, 100),
        Phaser.Geom.Rectangle.Contains,
      )
      .on('pointerover', () => this.tweens.add({ targets: restart, scale: 1.04, duration: 120 }))
      .on('pointerout', () => this.tweens.add({ targets: restart, scale: 1, duration: 120 }))
      .on('pointerdown', () =>
        this.tweens.add({ targets: restart, scale: 0.96, yoyo: true, duration: 80 }),
      )
      .on('pointerup', () => this.restartGame());
    panel.add(restart);

    this.input.keyboard?.once('keydown-ENTER', this.restartGame, this);
    this.input.keyboard?.once('keydown-SPACE', this.restartGame, this);
  }

  private restartGame(): void {
    if (this.restarting) return;
    this.restarting = true;
    this.input.keyboard?.off('keydown-ENTER', this.restartGame, this);
    this.input.keyboard?.off('keydown-SPACE', this.restartGame, this);
    this.time.delayedCall(0, () => {
      this.scene.stop(SCENE.UI);
      this.scene.stop(SCENE.GAME);
      this.scene.start(SCENE.GAME);
      this.scene.stop(SCENE.RESULT);
    });
  }
}
