import type { CustomMap } from './CustomMap';
import { EDITOR_GRID, objectBounds, snapObjectToGrid, type EditableKind, type GridObject, type ObjectRect } from './ObjectGeometry';

export interface ObjectSelection { kind: EditableKind; index: number }
export interface SelectionItem { ref: ObjectSelection; value: Record<string, unknown> }
export const selectionKey = (ref: ObjectSelection): string => `${ref.kind}:${ref.index}`;
export const copyableSelection = (ref: ObjectSelection): boolean => ['platform', 'coin', 'enemy', 'decoration'].includes(ref.kind);
export function selectionObject(map: CustomMap, ref: ObjectSelection): Record<string, unknown> | undefined {
  const l = map.level;
  const value = ref.kind === 'platform' ? l.platforms[ref.index] : ref.kind === 'coin' ? l.coins[ref.index]
    : ref.kind === 'enemy' ? l.enemies[ref.index] : ref.kind === 'decoration' ? map.decorations?.[ref.index] : ref.index === 0 ? l[ref.kind] : undefined;
  return (Array.isArray(value) ? { x: value[0], y: value[1] } : value) as Record<string, unknown> | undefined;
}
export function allSelections(map: CustomMap): ObjectSelection[] {
  return [...map.level.platforms.map((_, index) => ({ kind: 'platform' as const, index })),
    ...map.level.coins.map((_, index) => ({ kind: 'coin' as const, index })),
    ...map.level.enemies.map((_, index) => ({ kind: 'enemy' as const, index })),
    ...(map.decorations ?? []).map((_, index) => ({ kind: 'decoration' as const, index })),
    ...(['spawn', 'checkpoint', 'flag'] as const).map((kind) => ({ kind, index: 0 }))];
}
export function selectionItems(map: CustomMap, refs: ObjectSelection[]): SelectionItem[] {
  return refs.flatMap((ref) => { const value = selectionObject(map, ref); return value ? [{ ref, value: { ...value } }] : []; });
}
export function itemsBounds(items: SelectionItem[]): ObjectRect | undefined {
  if (!items.length) return;
  const rects = items.map(({ ref, value }) => objectBounds(ref.kind, value as unknown as GridObject));
  const x = Math.min(...rects.map((p) => p.x)), y = Math.min(...rects.map((p) => p.y));
  return { x, y, width: Math.max(...rects.map((p) => p.x + p.width)) - x,
    height: Math.max(...rects.map((p) => p.y + p.height)) - y };
}
export function boxSelections(map: CustomMap, box: ObjectRect): ObjectSelection[] {
  return allSelections(map).filter((ref) => {
    const r = objectBounds(ref.kind, selectionObject(map, ref) as unknown as GridObject);
    // 完全包含才选中，避免小框扫过地面边缘就把整段地面选进去。
    return r.x >= box.x && r.y >= box.y && r.x + r.width <= box.x + box.width && r.y + r.height <= box.y + box.height;
  });
}
const roundGrid = (n: number) => Math.round(n / EDITOR_GRID) * EDITOR_GRID;
/** 首次吸附旧对象后，共用一个边界约束位移，不能逐个夹紧导致选区变形。 */
export function translatedSelection(items: SelectionItem[], dx: number, dy: number, width: number, height = 540): SelectionItem[] {
  if (!items.length) return [];
  const raw = itemsBounds(items)!;
  const normalizationWidth = Math.max(width, raw.x + raw.width + EDITOR_GRID);
  const normalizationHeight = Math.max(height, raw.y + raw.height + EDITOR_GRID);
  const normalized = items.map(({ ref, value }) => ({ ref,
    value: { ...value, ...snapObjectToGrid(ref.kind, value as unknown as GridObject, normalizationWidth, normalizationHeight) } }));
  const bounds = itemsBounds(normalized)!;
  const minX = Math.ceil(-bounds.x / EDITOR_GRID) * EDITOR_GRID;
  const maxX = Math.floor((width - bounds.x - bounds.width) / EDITOR_GRID) * EDITOR_GRID;
  const minY = Math.ceil(-bounds.y / EDITOR_GRID) * EDITOR_GRID;
  const maxY = Math.floor((height - bounds.y - bounds.height) / EDITOR_GRID) * EDITOR_GRID;
  if (minX > maxX || minY > maxY) throw new Error('整个选区大于地图可用范围，无法保持布局放置');
  const x = Math.max(minX, Math.min(maxX, roundGrid(dx))), y = Math.max(minY, Math.min(maxY, roundGrid(dy)));
  return normalized.map(({ ref, value }, index) => {
    const moved: Record<string, unknown> = { ...value, x: Number(value.x) + x, y: Number(value.y) + y };
    if (ref.kind === 'enemy') {
      const delta = Number(moved.x) - Number(items[index].value.x);
      moved.min = Math.max(0, Math.min(Number(moved.x), Number(items[index].value.min) + delta));
      moved.max = Math.min(width, Math.max(Number(moved.x), Number(items[index].value.max) + delta));
    }
    return { ref, value: moved };
  });
}
export function writeSelection(map: CustomMap, items: SelectionItem[]): void {
  for (const { ref, value } of items) {
    if (ref.kind === 'coin' && Array.isArray(map.level.coins[ref.index]))
      map.level.coins[ref.index] = value as unknown as CustomMap['level']['coins'][number];
    else Object.assign(selectionObject(map, ref)!, value);
  }
}
