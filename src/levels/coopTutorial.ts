import { PLAYER } from '../config/constants';
import type { LevelData, PlatformData } from '../types/game';

export const NORMAL_JUMP_HEIGHT = PLAYER.JUMP_VELOCITY ** 2 / (2 * PLAYER.NORMAL_GRAVITY);
// 176px: beyond a normal 120px jump, within the head support + normal jump.
export const COOP_HIGH_RISE = Math.ceil(NORMAL_JUMP_HEIGHT) + 55;
export const COOP_SPAWNS = { p1: { x: 120, y: 444 }, p2: { x: 220, y: 444 } };
export const COOP_CHECKPOINT_SPAWNS = { p1: { x: 1500, y: 444 }, p2: { x: 1590, y: 444 } };
export const COOP_BRIDGE: PlatformData = { id: 'coop-bridge', x: 510, y: 372, width: 150, height: 24, kind: 'platform' };
export const COOP_GATE = { id: 'coop-door', x: 1390, y: 0, width: 24, height: 444 };
export const COOP_GATHER_GATE = { id: 'coop-gather-door', x: 1680, y: 0, width: 24, height: 444 };
export const COOP_LEVER = { id: 'coop-high-lever', x: 740, y: 444 - COOP_HIGH_RISE, priority: 1, radius: 64 };
export const COOP_PLATES = [
  { id: 'coop-plate-a', x: 1160, y: 444 },
  { id: 'coop-plate-b', x: 1290, y: 444 },
];
export const COOP_CHECKPOINT = { id: 'coop-camp', x: 1450, y: 330, width: 200, height: 120 };
export const COOP_GOAL = { id: 'coop-goal', x: 2000, y: 330, width: 190, height: 120 };
export const coopTutorial: LevelData = {
  id: 'coop-tutorial', width: 2260, timeLimit: 0,
  spawn: COOP_SPAWNS.p1, checkpoint: COOP_CHECKPOINT_SPAWNS.p1, flag: COOP_GOAL,
  platforms: [
    { id: 'coop-floor', x: 0, y: 444, width: 1740, height: 96, kind: 'ground' },
    { id: 'coop-practice', x: 270, y: 400, width: 80, height: 24, kind: 'platform' },
    { id: 'coop-high-landing', x: 620, y: 444 - COOP_HIGH_RISE, width: 240, height: 24, kind: 'platform' },
    { id: 'coop-high-wall', x: 840, y: 444 - COOP_HIGH_RISE, width: 200, height: 96 + COOP_HIGH_RISE, kind: 'ground' },
    { id: 'coop-final-floor', x: 1840, y: 444, width: 420, height: 96, kind: 'ground' },
  ], coins: [], enemies: [],
};
