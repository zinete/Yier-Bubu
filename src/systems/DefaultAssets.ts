import platform from '../assets/editor/moss-platform.png';
import star from '../assets/editor/gold-star.png';
import slime from '../assets/editor/leaf-slime.png';
import lantern from '../assets/editor/lantern-marker.png';
import flowers from '../assets/editor/flower-bush.png';
import sky from '../assets/editor/scene-sky.png';
import mountains from '../assets/editor/scene-mountains.png';
import trees from '../assets/editor/scene-trees.png';
import foliage from '../assets/editor/scene-foliage.png';
import type { CustomMap, MapAsset } from './CustomMap';

export const DEFAULT_ASSETS: MapAsset[] = [
  { id: 'builtin-moss-platform', name: '苔藓花园平台', data: platform, width: 512, height: 160 },
  { id: 'builtin-gold-star', name: '蜂蜜金星', data: star, width: 256, height: 256 },
  { id: 'builtin-leaf-slime', name: '叶芽史莱姆', data: slime, width: 256, height: 256 },
  { id: 'builtin-lantern-marker', name: '星灯路标', data: lantern, width: 160, height: 320 },
  { id: 'builtin-flower-bush', name: '雏菊花丛', data: flowers, width: 320, height: 224 },
  { id: 'builtin-scene-sky', name: '场景 · 柔光天空', data: sky, width: 512, height: 256 },
  { id: 'builtin-scene-mountains', name: '场景 · 远山薄雾', data: mountains, width: 512, height: 256 },
  { id: 'builtin-scene-trees', name: '场景 · 绘本树群', data: trees, width: 512, height: 256 },
  { id: 'builtin-scene-foliage', name: '场景 · 前景枝叶', data: foliage, width: 512, height: 256 },
];
export function mapAssets(map?: CustomMap): MapAsset[] { return [...DEFAULT_ASSETS, ...(map?.assets ?? [])]; }
export const DEFAULT_OBJECT_SKINS: Record<string, string> = {
  platform: 'builtin-moss-platform', coin: 'builtin-gold-star', enemy: 'builtin-leaf-slime',
  spawn: 'builtin-lantern-marker', checkpoint: 'builtin-lantern-marker', flag: 'builtin-lantern-marker',
};
/** 编辑库展示全部素材，试玩只加载被地图引用的素材，旧地图不额外下载新背景。 */
export function runtimeMapAssets(map: CustomMap): MapAsset[] {
  const ids = new Set(Object.values(DEFAULT_OBJECT_SKINS));
  const reference = (value: { assetId?: string }) => { if (value.assetId) ids.add(value.assetId); };
  [...map.level.platforms, ...map.level.enemies, map.level.spawn, map.level.checkpoint, map.level.flag,
    ...(map.decorations ?? [])].forEach(reference);
  map.level.coins.forEach((coin) => { if (!Array.isArray(coin)) reference(coin); });
  if (map.scene?.backgroundAssetId) ids.add(map.scene.backgroundAssetId);
  map.scene?.layers?.forEach((layer) => { if (layer.visible) ids.add(layer.assetId); });
  return mapAssets(map).filter((asset) => ids.has(asset.id));
}
