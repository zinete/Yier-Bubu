import { COOP_CHECKPOINT, COOP_GOAL, COOP_PLATES, COOP_CHECKPOINT_SPAWNS } from '../levels/coopTutorial';
import type { PlayerId } from '../types/commands';

export interface Rect { x: number; y: number; width: number; height: number }
export interface CoopFact { id: PlayerId; x: number; feet: number; grounded: boolean; normal: boolean }
export interface InteractionTarget { id: string; x: number; y: number; radius: number; priority: number }
export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export const inside = (p: CoopFact, area: Rect): boolean => p.normal && p.grounded && p.x >= area.x && p.x <= area.x + area.width && p.feet >= area.y && p.feet <= area.y + area.height;
export function interactionTarget(player: CoopFact, targets: InteractionTarget[]): InteractionTarget | undefined {
  if (!player.normal || !player.grounded) return;
  return targets.filter((t) => Math.abs(player.feet - t.y) <= 24 && Math.abs(player.x - t.x) <= t.radius)
    .sort((a, b) => b.priority - a.priority || Math.abs(player.x - a.x) - Math.abs(player.x - b.x) || a.id.localeCompare(b.id))[0];
}
export class CoopRules {
  bridgeOpen = false;
  gateOpen = false;
  checkpointActive = false;
  complete = false;
  plates = [false, false];
  interact(targetId: string): boolean {
    if (targetId !== 'coop-high-lever' || this.bridgeOpen || this.complete) return false;
    this.bridgeOpen = true; return true;
  }
  update(players: CoopFact[]): boolean {
    if (this.complete) return false;
    const onPlate = (p: CoopFact, index: number) => p.normal && p.grounded
      && Math.abs(p.x - COOP_PLATES[index].x) <= 28 && Math.abs(p.feet - COOP_PLATES[index].y) <= 6;
    this.plates = COOP_PLATES.map((_, index) => players.some((p) => onPlate(p, index)));
    if (this.bridgeOpen && players.some((a) => onPlate(a, 0) && players.some((b) => b.id !== a.id && onPlate(b, 1))))
      this.gateOpen = true;
    if (players.length === 2 && this.gateOpen && players.every((p) => inside(p, COOP_CHECKPOINT))) this.checkpointActive = true;
    if (players.length === 2 && this.checkpointActive && players.every((p) => inside(p, COOP_GOAL))) {
      this.complete = true; return true;
    }
    return false;
  }
}
export const COOP_DISTANCE = { WARNING: 440, LIMIT: 560, RESPAWN_REACH: 600 };
/** Restrict only safe grounded outward motion; never change an airborne velocity. */
export function outwardLimit(x: number, otherX: number, safeGrounded: boolean, checkpoint: boolean): number {
  if (!safeGrounded) return 0;
  if (checkpoint && x >= COOP_CHECKPOINT_SPAWNS.p1.x + COOP_DISTANCE.RESPAWN_REACH) return 1;
  return Math.abs(x - otherX) >= COOP_DISTANCE.LIMIT ? Math.sign(x - otherX) : 0;
}
export interface LiftCatchOptions {
  horizontalTolerance?: number;
  topSlop?: number;
  minFallSpeed?: number;
  maxFallSpeed?: number;
}
export function canCatchLift(
  rider: Rect & { previousBottom: number; velocityY: number },
  support: Rect,
  solids: Rect[],
  options: LiftCatchOptions = {},
): boolean {
  const horizontalTolerance = options.horizontalTolerance ?? 26;
  const topSlop = options.topSlop ?? 3;
  const minFallSpeed = options.minFallSpeed ?? 0;
  const maxFallSpeed = options.maxFallSpeed ?? Infinity;
  const center = rider.x + rider.width / 2;
  const currentBottom = rider.y + rider.height;
  if (rider.velocityY < minFallSpeed || rider.velocityY > maxFallSpeed
    || rider.previousBottom > support.y + topSlop
    || currentBottom < support.y - topSlop
    || Math.abs(center - (support.x + support.width / 2)) > horizontalTolerance) return false;
  const standing = {
    x: support.x + support.width / 2 - rider.width / 2,
    y: support.y - rider.height,
    width: rider.width,
    height: rider.height - 0.5,
  };
  return !solids.some((solid) => intersects(standing, solid));
}
export function coopCameraPlan(width: number, height: number, left: number, right: number): { zoom: number; center: number } {
  const base = Math.min(width / 960, height / 540);
  const zoom = Math.max(base * 0.72, Math.min(base, width / (right - left + 300)));
  return { zoom, center: (left + right) / 2 };
}
