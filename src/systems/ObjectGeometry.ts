/** 自定义关卡与工坊共享尺寸，避免编辑框与实际触发框各自定义。 */
export const EDITOR_GRID = 16;
export const CUSTOM_OBJECTS = {
  coin: { width: 24, height: 24, bodyWidth: 32, bodyHeight: 32 },
  enemy: { width: 40, height: 34, bodyWidth: 32, bodyHeight: 32 },
  marker: { width: 32, height: 64 },
};
export type EditableKind = 'platform' | 'coin' | 'enemy' | 'spawn' | 'checkpoint' | 'flag' | 'decoration';
export interface GridObject { x: number; y: number; width?: number; height?: number; awakening?: { budOffsetX: number; budOffsetY: number; durationMs: number } }
export interface ObjectRect { x: number; y: number; width: number; height: number }
export function visualBounds(kind: EditableKind, p: GridObject): ObjectRect {
  if (kind === 'coin') return { x: p.x - CUSTOM_OBJECTS.coin.width / 2, y: p.y - CUSTOM_OBJECTS.coin.height / 2,
    width: CUSTOM_OBJECTS.coin.width, height: CUSTOM_OBJECTS.coin.height };
  if (kind === 'enemy') return { x: p.x - CUSTOM_OBJECTS.enemy.width / 2, y: p.y - CUSTOM_OBJECTS.enemy.height,
    width: CUSTOM_OBJECTS.enemy.width, height: CUSTOM_OBJECTS.enemy.height };
  if (kind === 'spawn' || kind === 'checkpoint') return { x: p.x, y: p.y - CUSTOM_OBJECTS.marker.height,
    width: CUSTOM_OBJECTS.marker.width, height: CUSTOM_OBJECTS.marker.height };
  return { x: p.x, y: p.y, width: p.width ?? EDITOR_GRID, height: p.height ?? EDITOR_GRID };
}
/** 标记无物理碰撞，返回其操作框；其余返回自定义关卡中的碰撞/放置边界。 */
export function objectBounds(kind: EditableKind, p: GridObject): ObjectRect {
  if (kind === 'coin' || kind === 'enemy') {
    const size = CUSTOM_OBJECTS[kind];
    return { x: p.x - size.bodyWidth / 2, y: p.y - size.bodyHeight / (kind === 'coin' ? 2 : 1),
      width: size.bodyWidth, height: size.bodyHeight };
  }
  return visualBounds(kind, p);
}
const floorGrid = (value: number) => Math.floor(value / EDITOR_GRID) * EDITOR_GRID;
const roundGrid = (value: number) => Math.round(value / EDITOR_GRID) * EDITOR_GRID;
const gridSize = (value: number, max: number) => Math.max(EDITOR_GRID, Math.min(floorGrid(max), roundGrid(value)));
export function snapObjectToGrid(kind: EditableKind, p: GridObject, worldWidth: number, worldHeight = 540): GridObject {
  const result = { ...p };
  if (kind === 'platform' || kind === 'decoration' || kind === 'flag') {
    result.width = gridSize(p.width ?? EDITOR_GRID, worldWidth);
    result.height = gridSize(p.height ?? EDITOR_GRID, worldHeight);
  }
  const bounds = objectBounds(kind, result);
  const left = Math.max(0, Math.min(floorGrid(worldWidth - bounds.width), roundGrid(bounds.x)));
  const top = Math.max(0, Math.min(floorGrid(worldHeight - bounds.height), roundGrid(bounds.y)));
  result.x += left - bounds.x; result.y += top - bounds.y;
  if (kind === 'platform' && result.awakening) {
    const a = result.awakening;
    const minX = Math.ceil(Math.max(0, 16 - a.budOffsetX) / EDITOR_GRID) * EDITOR_GRID;
    const minY = Math.ceil(Math.max(0, 24 - a.budOffsetY) / EDITOR_GRID) * EDITOR_GRID;
    const maxX = floorGrid(Math.min(worldWidth - result.width!, worldWidth - 16 - a.budOffsetX));
    const maxY = floorGrid(Math.min(worldHeight - result.height!, worldHeight - 24 - a.budOffsetY));
    result.x = Math.max(minX, Math.min(maxX, result.x)); result.y = Math.max(minY, Math.min(maxY, result.y));
  }
  return result;
}
/** 拖右下角时锁定吸附后的左上角，尺寸向网格对齐，不因夹到地图边缘重新偏离网格。 */
export function resizeObjectOnGrid(kind: EditableKind, p: GridObject, dx: number, dy: number,
  worldWidth: number, worldHeight = 540): GridObject {
  const result = snapObjectToGrid(kind, p, worldWidth, worldHeight);
  if (kind === 'platform' || kind === 'decoration' || kind === 'flag') {
    result.width = gridSize((p.width ?? EDITOR_GRID) + dx, worldWidth - result.x);
    result.height = gridSize((p.height ?? EDITOR_GRID) + dy, worldHeight - result.y);
  }
  return result;
}
