import Phaser from 'phaser';
import { SCENE } from '../config/constants';
import { ViewportManager } from '../systems/ViewportManager';
interface ResultData {
  won: boolean;
  message: string;
  score: number;
}
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SCENE.RESULT);
  }
  create(data: ResultData): void {
    ViewportManager.attach(this, 0x1d2b3a);
    this.add.rectangle(480, 270, 960, 540, 0x1d2b3a, 0.48);
    this.add
      .rectangle(480, 270, 480, 280, 0xffffff, 0.95)
      .setStrokeStyle(2, data.won ? 0x34a853 : 0xe04f5f);
    this.add
      .text(480, 180, data.won ? '通关成功！' : '挑战失败', {
        fontSize: '34px',
        color: data.won ? '#24813e' : '#c7374b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(480, 245, data.message, {
        fontSize: '18px',
        color: '#40566b',
        align: 'center',
        wordWrap: { width: 400 },
      })
      .setOrigin(0.5);
    this.add
      .text(480, 305, `本次分数：${data.score}`, { fontSize: '21px', color: '#1d2b3a' })
      .setOrigin(0.5);
    const restart = this.add
      .text(480, 375, '再玩一次', {
        fontSize: '22px',
        color: '#fff',
        backgroundColor: '#2f80ed',
        padding: { x: 26, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    restart.on('pointerdown', () => {
      this.scene.stop(SCENE.UI);
      this.scene.stop();
      this.scene.start(SCENE.GAME);
    });
  }
}
