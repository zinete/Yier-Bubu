import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../config/constants';

/** 试玩和编辑器的游玩视野参考共用同一套相机比例，不拉伸世界坐标。 */
export function worldCameraView(width: number, height: number): { zoom: number; width: number; height: number } {
  const w = Number.isFinite(width) && width > 0 ? width : DESIGN_WIDTH;
  const h = Number.isFinite(height) && height > 0 ? height : DESIGN_HEIGHT;
  const zoom = Math.min(h / DESIGN_HEIGHT, w / DESIGN_WIDTH);
  return { zoom, width: w / zoom, height: h / zoom };
}
