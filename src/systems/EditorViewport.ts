export const MIN_EDITOR_ZOOM = 0.05;
export const MAX_EDITOR_ZOOM = 3;
/** 高度自适应不受手动 300% 上限限制，以便大屏仍可用满高度。 */
export function heightFillZoom(height: number, worldHeight = 540, padding = 40): number {
  return Number.isFinite(height) && height > padding && worldHeight > 0 ? (height - padding) / worldHeight : 1;
}
export function editorZoom(value: number): number {
  return Number.isFinite(value) ? Math.max(MIN_EDITOR_ZOOM, Math.min(MAX_EDITOR_ZOOM, value)) : 1;
}
/** CSS 视口变化只改变显示，不写入地图坐标或碰撞尺寸。 */
export function anchoredZoomScroll(world: { x: number; y: number }, previousZoom: number, nextZoom: number,
  scroll: { left: number; top: number }): { left: number; top: number } {
  return { left: Math.max(0, scroll.left + world.x * (nextZoom - previousZoom)),
    top: Math.max(0, scroll.top + world.y * (nextZoom - previousZoom)) };
}
export function centeredObjectScroll(bounds: { x: number; y: number; width: number; height: number },
  zoom: number, viewport: { width: number; height: number }): { left: number; top: number } {
  return { left: Math.max(0, 20 + (bounds.x + bounds.width / 2) * zoom - viewport.width / 2),
    top: Math.max(0, 20 + (bounds.y + bounds.height / 2) * zoom - viewport.height / 2) };
}
