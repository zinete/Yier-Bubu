import type { PlatformData } from '../types/game';
export const budPosition = (platform: PlatformData): { x: number; y: number } => ({
  x: platform.x + platform.awakening!.budOffsetX, y: platform.y + platform.awakening!.budOffsetY,
});
/** Simulation time is supplied by GameScene: pause/background never consume life. */
export class AwakeningController {
  private nodes = new Map<string, { platform: PlatformData; until: number; lit: boolean }>();
  constructor(platforms: PlatformData[], private required = false) {
    for (const platform of platforms) if (platform.awakening) this.nodes.set(platform.id, { platform, until: 0, lit: false });
  }
  activate(id: string, time: number): boolean {
    const node = this.nodes.get(id);
    if (!node || !Number.isFinite(time) || time < 0) return false;
    node.until = time + node.platform.awakening!.durationMs; node.lit = true;
    return true;
  }
  state(id: string, time: number): { active: boolean; remaining: number; lit: boolean } {
    const node = this.nodes.get(id);
    const remaining = node ? Math.max(0, node.until - time) : 0;
    return { active: !!node?.lit && remaining > 0, remaining, lit: node?.lit ?? false };
  }
  get summary(): { lit: number; total: number; goalLocked: boolean } {
    const lit = [...this.nodes.values()].filter((node) => node.lit).length;
    return { lit, total: this.nodes.size, goalLocked: this.required && lit < this.nodes.size };
  }
}
