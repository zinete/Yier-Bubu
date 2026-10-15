import platform from '../assets/editor/moss-platform.png';
import star from '../assets/editor/gold-star.png';
import slime from '../assets/editor/leaf-slime.png';
import lantern from '../assets/editor/lantern-marker.png';
import flowers from '../assets/editor/flower-bush.png';
import type { CustomMap, MapAsset } from './CustomMap';

export const DEFAULT_ASSETS: MapAsset[] = [
  { id: 'builtin-moss-platform', name: '苔藓花园平台', data: platform, width: 512, height: 160 },
  { id: 'builtin-gold-star', name: '蜂蜜金星', data: star, width: 256, height: 256 },
  { id: 'builtin-leaf-slime', name: '叶芽史莱姆', data: slime, width: 256, height: 256 },
  { id: 'builtin-lantern-marker', name: '星灯路标', data: lantern, width: 160, height: 320 },
  { id: 'builtin-flower-bush', name: '雏菊花丛', data: flowers, width: 320, height: 224 },
];
export function mapAssets(map?: CustomMap): MapAsset[] { return [...DEFAULT_ASSETS, ...(map?.assets ?? [])]; }
export const DEFAULT_OBJECT_SKINS: Record<string, string> = {
  platform: 'builtin-moss-platform', coin: 'builtin-gold-star', enemy: 'builtin-leaf-slime',
  spawn: 'builtin-lantern-marker', checkpoint: 'builtin-lantern-marker', flag: 'builtin-lantern-marker',
};
