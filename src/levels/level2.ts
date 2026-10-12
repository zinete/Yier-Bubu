import type { LevelData } from '../types/game';

export const level2: LevelData = {
  id: '1-2', width: 4600, timeLimit: 150,
  spawn: { x: 100, y: 330 }, checkpoint: { x: 2500, y: 330 },
  flag: { x: 4450, y: 236, width: 34, height: 176 },
  platforms: [
    { id: 'ground-0', x: 0, y: 444, width: 800, height: 96, kind: 'ground' },
    { id: 'ground-1', x: 900, y: 444, width: 650, height: 96, kind: 'ground' },
    { id: 'ground-2', x: 1680, y: 444, width: 680, height: 96, kind: 'ground' },
    { id: 'ground-3', x: 2470, y: 444, width: 700, height: 96, kind: 'ground' },
    { id: 'ground-4', x: 3300, y: 444, width: 1300, height: 96, kind: 'ground' },
    ...[350, 1100, 1800, 2700, 3450, 4050].map((x, i) => ({
      id: `reward-${i}`, x, y: 344, width: 200, height: 26, kind: 'platform' as const,
    })),
    ...[790, 1540, 2350, 3160].map((x, i) => ({
      id: `bridge-${i}`, x, y: 394, width: 140, height: 20, kind: 'platform' as const,
    })),
  ],
  coins: [
    [250, 390], [410, 300], [480, 300], [850, 350], [1170, 300], [1240, 300],
    [1610, 350], [1860, 300], [1930, 300], [2210, 390], [2410, 350],
    [2560, 390], [2760, 300], [2830, 300], [3230, 350], [3510, 300],
    [3580, 300], [3820, 390], [4110, 300], [4180, 300], [4350, 390],
  ],
  enemies: [550, 1350, 2110, 2930, 3730, 4250].map((x, i) => ({
    x, y: 410, min: x - 100, max: x + 100, speed: 75 + i * 5,
    // 首个敌人仅接触伤害，后续逐渐增加远程威胁。
    attack: i === 0 ? undefined : {
      range: 340, cooldown: 1700 - i * 70, projectileSpeed: 440,
      projectileArc: -120, projectileGravity: 700, projectileLifetime: 1450,
    },
  })),
};
