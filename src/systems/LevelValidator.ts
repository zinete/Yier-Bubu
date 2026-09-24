import { PLAYER } from '../config/constants';
import type { PlatformData } from '../types/game';
export interface JumpMetrics {
  maxHeight: number;
  maxDistance: number;
  safeGap: number;
  maxRise: number;
}
export class LevelValidator {
  static metrics(): JumpMetrics {
    const up = (PLAYER.JUMP_VELOCITY * PLAYER.JUMP_VELOCITY) / (2 * PLAYER.NORMAL_GRAVITY);
    const airTime =
      Math.abs(PLAYER.JUMP_VELOCITY) / PLAYER.NORMAL_GRAVITY +
      Math.sqrt((2 * up) / PLAYER.FALL_GRAVITY);
    const maxDistance = PLAYER.SPEED * airTime;
    return {
      maxHeight: Math.round(up),
      maxDistance: Math.round(maxDistance),
      safeGap: Math.round(maxDistance * 0.7),
      maxRise: Math.round(up * 0.72),
    };
  }
  static validate(platforms: PlatformData[]): void {
    if (!import.meta.env.DEV) return;
    const stats = this.metrics();
    for (let index = 0; index < platforms.length - 1; index += 1) {
      const start = platforms[index];
      const target = platforms[index + 1];
      const gap = target.x - (start.x + start.width);
      const rise = start.y - target.y;
      if (gap > stats.safeGap || rise > stats.maxRise)
        console.warn(
          `[LevelValidator] 疑似不可达: ${start.id} -> ${target.id}; 水平间距 ${Math.round(gap)}px, 高度差 ${Math.round(rise)}px`,
          stats,
        );
    }
  }
}
