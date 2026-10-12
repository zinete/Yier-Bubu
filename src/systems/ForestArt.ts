import Phaser from 'phaser';
import type { LevelData } from '../types/game';

/** 绘本森林：代码绘制的分层场景，碰撞仍由关卡数据管理。 */
export function buildForest(scene: Phaser.Scene, level: LevelData): void {
  if (!scene.textures.exists('forest-sky')) {
    const texture = scene.textures.createCanvas('forest-sky', 32, 540)!;
    const gradient = texture.context.createLinearGradient(0, 0, 0, 540);
    gradient.addColorStop(0, '#a5dcd6');
    gradient.addColorStop(0.55, '#d7e9bc');
    gradient.addColorStop(1, '#fff0c8');
    texture.context.fillStyle = gradient;
    texture.context.fillRect(0, 0, 32, 540);
    texture.refresh();
  }
  scene.add.image(0, 0, 'forest-sky').setOrigin(0).setDisplaySize(level.width + 2000, 700).setScrollFactor(0).setDepth(-30);
  scene.add.circle(780, 105, 74, 0xfff4ca, 0.3).setScrollFactor(0.1).setDepth(-29);
  scene.add.circle(780, 105, 48, 0xfff8dc, 0.8).setScrollFactor(0.1).setDepth(-29);
  const far = scene.add.graphics().setScrollFactor(0.18).setDepth(-25);
  const middle = scene.add.graphics().setScrollFactor(0.42).setDepth(-20);
  for (let x = -200; x < level.width + 1800; x += 260) {
    far.fillStyle(0x97c8a8, 0.65).fillEllipse(x, 460, 520, 380);
    far.fillStyle(0xb9d6ad, 0.75).fillEllipse(x + 90, 430, 360, 260);
    middle.fillStyle(0x81b894, 0.45).fillRoundedRect(x + 90, 140, 24, 330, 12);
    middle.fillStyle(0x87ba94, 0.45).fillEllipse(x + 100, 170, 160, 240);
    middle.fillStyle(0xa1c7a0, 0.5).fillEllipse(x + 45, 210, 135, 170);
  }
  const art = scene.add.graphics().setDepth(-2);
  for (const platform of level.platforms) {
    const { x, y, width, height, kind } = platform;
    art.fillStyle(0x715847).fillRoundedRect(x, y + 5, width, height, 10);
    art.fillStyle(0xb18963).fillRoundedRect(x, y + 8, width, height - 8, 10);
    art.fillStyle(0xdeb587).fillRoundedRect(x + 5, y + 10, width - 10, 10, 4);
    art.fillStyle(0x71964e).fillRoundedRect(x - 2, y, width + 4, 13, 6);
    art.fillStyle(0xb4cd72).fillRoundedRect(x, y, width, 5, 3);
    if (kind === 'ground') {
      for (let px = x + 16; px < x + width - 10; px += 55) {
        art.fillStyle(0xa17a56, 0.5).fillEllipse(px, y + 43 + (px % 23), 18, 10);
        art.lineStyle(2, 0x71964e).lineBetween(px, y, px - 4, y - 8);
        art.lineBetween(px, y, px + 5, y - 11);
      }
      for (let px = x + 45; px < x + width - 20; px += 145) {
        art.fillStyle(0x80a75a).fillEllipse(px, y - 7, 36, 17);
        for (let petal = 0; petal < 5; petal += 1)
          art.fillStyle(0xfff5d7).fillCircle(px + Math.cos(petal * 1.256) * 5, y - 15 + Math.sin(petal * 1.256) * 5, 4);
        art.fillStyle(0xefbc69).fillCircle(px, y - 15, 3);
      }
    }
  }
  // 首屏树与路牌属于装饰，不改变主线路径。
  for (const x of [25, 695, 1470, 2330, 3065, 3910]) {
    const tree = scene.add.graphics().setDepth(-3);
    tree.fillStyle(0x927451).fillRoundedRect(x, 225, 38, 219, 15);
    tree.lineStyle(3, 0xb39765).lineBetween(x + 12, 270, x + 10, 415);
    tree.fillStyle(0x679466).fillCircle(x + 18, 212, 80);
    tree.fillStyle(0x80ac74).fillCircle(x - 20, 180, 64);
    tree.fillStyle(0x9cbd7d).fillCircle(x + 42, 162, 62);
    tree.fillStyle(0xc2d795, 0.5).fillEllipse(x + 30, 139, 58, 26);
  }
  const sign = scene.add.graphics().setDepth(1);
  sign.fillStyle(0x8d7452).fillRoundedRect(170, 364, 8, 80, 3);
  sign.fillStyle(0xfff1cc).fillRoundedRect(125, 350, 100, 37, 8);
  sign.lineStyle(2, 0xb29264).strokeRoundedRect(125, 350, 100, 37, 8);
  scene.add.text(175, 368, '星光森林 →', { fontSize: '14px', color: '#72563b', fontStyle: 'bold' }).setOrigin(0.5).setDepth(2);
  scene.add.text(105, 225, 'CHAPTER ' + level.id, { fontSize: '12px', color: '#557960', letterSpacing: 3 }).setDepth(1);
  scene.add.text(103, 247, level.id === '1-1' ? '星光森林' : '林间的约定', { fontSize: '30px', color: '#3b654d', fontStyle: 'bold' }).setDepth(1);
  scene.add.text(105, 286, '拾起星光，和你一起向前', { fontSize: '13px', color: '#69806a' }).setDepth(1);
}
