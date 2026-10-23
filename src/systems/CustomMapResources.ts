import type { CustomMap, MapAsset } from './CustomMap';
import { DEFAULT_OBJECT_SKINS, runtimeMapAssets } from './DefaultAssets';

/** Gameplay appearances must load before physics starts; scenery may degrade safely. */
export function customMapResources(map: CustomMap): { assets: MapAsset[]; required: Set<string> } {
  const required = new Set<string>();
  const optional = new Set<string>();
  const use = (kind: string, value: { assetId?: string }): void => {
    const id = value.assetId ?? DEFAULT_OBJECT_SKINS[kind];
    if (id) required.add(id);
  };
  map.level.platforms.forEach((value) => use('platform', value));
  map.level.coins.forEach((value) => use('coin', Array.isArray(value) ? {} : value));
  map.level.enemies.forEach((value) => use('enemy', value));
  use('spawn', map.level.spawn); use('checkpoint', map.level.checkpoint); use('flag', map.level.flag);
  for (const value of map.decorations ?? []) {
    if (value.solid || (value.solid === undefined && value.assetId === DEFAULT_OBJECT_SKINS.platform)) required.add(value.assetId);
    else optional.add(value.assetId);
  }
  if (map.scene?.backgroundAssetId) optional.add(map.scene.backgroundAssetId);
  map.scene?.layers?.forEach((layer) => { if (layer.visible) optional.add(layer.assetId); });
  return { assets: runtimeMapAssets(map).filter((asset) => required.has(asset.id) || optional.has(asset.id)), required };
}
