import { level1 } from './level1';
import { level2 } from './level2';
export const levels = [level1, level2];
export function getLevel(id: string) {
  return levels.find((level) => level.id === id) ?? levels[0];
}
export function nextLevelId(id: string): string | undefined {
  return levels[levels.findIndex((level) => level.id === id) + 1]?.id;
}
