import type { LevelData } from '../types/game';
/** Optional experiment, separate from campaign unlocks and best-score records. */
export const awakeningDemo: LevelData = {
  id: 'awakening-demo', width: 2880, timeLimit: 90, awakeningGoal: true,
  spawn: { x: 112, y: 432 }, checkpoint: { x: 1728, y: 432 },
  flag: { x: 2704, y: 304, width: 32, height: 144 },
  platforms: [
    { id: 'ground-a', x: 0, y: 448, width: 512, height: 92, kind: 'ground' },
    { id: 'bloom-a', x: 608, y: 432, width: 160, height: 32, kind: 'platform', awakening: { budOffsetX: 16, budOffsetY: -32, durationMs: 8000 } },
    { id: 'ground-b', x: 832, y: 448, width: 416, height: 92, kind: 'ground' },
    { id: 'bloom-b', x: 1344, y: 432, width: 176, height: 32, kind: 'platform', awakening: { budOffsetX: 16, budOffsetY: -32, durationMs: 8000 } },
    { id: 'ground-c', x: 1616, y: 448, width: 400, height: 92, kind: 'ground' },
    { id: 'bloom-c', x: 2112, y: 432, width: 160, height: 32, kind: 'platform', awakening: { budOffsetX: 16, budOffsetY: -32, durationMs: 8000 } },
    { id: 'ground-d', x: 2368, y: 448, width: 512, height: 92, kind: 'ground' },
  ],
  coins: [[320, 400], [688, 376], [1040, 400], [1432, 376], [1824, 400], [2192, 376], [2528, 400]],
  enemies: [],
};
