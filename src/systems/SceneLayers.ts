import type Phaser from 'phaser';
import type { MapAsset, SceneLayer } from './CustomMap';

/** 数组从后向前绘制；前景分区始终位于玩法对象上方。 */
export function layerDepth(layer: SceneLayer, index: number): number {
  return (layer.group === 'foreground' ? 7 : -18) + index / 100;
}
export function layerScreenX(layer: SceneLayer, cameraX: number): number {
  return layer.x - cameraX * layer.parallax;
}
export function repeatLayerViewport(layer: SceneLayer, camera: { scrollX: number; width: number; zoom: number; worldView: { x: number } }, sourceWidth: number) {
  // scrollFactor=0 仍受相机缩放中心影响，不能简单固定在世界 x=0。
  const x = camera.worldView.x - camera.scrollX;
  return { x, width: camera.width / camera.zoom, tileX: (x - layerScreenX(layer, camera.scrollX)) / (layer.width / sourceWidth) };
}
/** 固定数量的绘制节点，不因地图长度增加图片副本。 */
export function sceneLayersSvg(layers: SceneLayer[], assets: MapAsset[], mapWidth: number, group: SceneLayer['group'],
  picture?: (asset: MapAsset, width: number, height: number) => string): string {
  return layers.filter((p) => p.group === group && p.visible).map((p) => {
    const asset = assets.find((a) => a.id === p.assetId); if (!asset) return '';
    const id = `scene-layer-${p.id}`;
    const image = picture ? picture(asset, p.width, p.height)
      : `<image href="${asset.data}" width="${p.width}" height="${p.height}" preserveAspectRatio="none"/>`;
    const markup = p.mode === 'repeat'
      ? `<defs><pattern id="${id}" x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" patternUnits="userSpaceOnUse">${image}</pattern></defs><rect data-layer-repeat="true" x="0" y="${p.y}" width="${mapWidth}" height="${p.height}" fill="url(#${id})"/>`
      : `<g transform="translate(${p.x} ${p.y})">${image}</g>`;
    return `<g data-scene-layer="${p.id}" data-preview-parallax="${p.parallax}" opacity="${p.opacity}" pointer-events="none">${markup}</g>`;
  }).join('');
}

export function forestLayerPreset(): SceneLayer[] {
  const layer = (id: string, name: string, assetId: string, y: number, width: number, height: number,
    parallax: number, opacity: number, group: SceneLayer['group'] = 'background'): SceneLayer =>
    ({ id, name, assetId, group, mode: 'repeat', x: 0, y, width, height, parallax, opacity, visible: true, locked: false });
  return [layer('forest-sky', '柔光天空', 'builtin-scene-sky', 0, 1088, 544, 0, 1),
    layer('forest-mountains', '远山与薄雾', 'builtin-scene-mountains', 0, 1280, 512, 0.16, 0.75),
    layer('forest-trees', '林间树群', 'builtin-scene-trees', 48, 896, 400, 0.45, 0.65),
    layer('forest-foliage', '低矮前景枝叶', 'builtin-scene-foliage', 256, 768, 288, 1, 0.72, 'foreground')];
}

/** SVG 与 Phaser 共用矩形与视差定义；平铺只覆盖相机可视区域。 */
export function mountSceneLayers(scene: Phaser.Scene, layers: SceneLayer[], keys: Map<string, string>, depthOffset = 0): void {
  // CameraManager 的 shutdown 先于场景应用回调执行，会清空 main。
  // 注册和解绑必须使用同一实例，不能在退出时重新查找主相机。
  const camera = scene.cameras.main;
  const events = scene.events;
  let disposed = false;
  const updates: (() => void)[] = [];
  layers.forEach((layer, index) => {
    const key = keys.get(layer.assetId);
    if (!layer.visible || !key || !scene.textures.exists(key)) return;
    const depth = layerDepth(layer, index) + depthOffset;
    if (layer.mode === 'image') {
      scene.add.image(layer.x, layer.y, key).setOrigin(0).setDisplaySize(layer.width, layer.height)
        .setScrollFactor(layer.parallax, 1).setAlpha(layer.opacity).setDepth(depth);
      return;
    }
    const frame = scene.textures.get(key).get();
    const sprite = scene.add.tileSprite(0, layer.y, 1, layer.height, key).setOrigin(0)
      .setScrollFactor(0, 1).setAlpha(layer.opacity).setDepth(depth);
    const scaleX = layer.width / frame.cutWidth;
    sprite.setTileScale(scaleX, layer.height / frame.cutHeight);
    const sync = () => {
      if (disposed) return;
      const viewport = repeatLayerViewport(layer, camera, frame.cutWidth);
      sprite.setPosition(viewport.x, layer.y);
      sprite.setSize(viewport.width, layer.height);
      // TileSprite tilePosition 使用原纹理像素；先消除显示缩放。
      sprite.setTilePosition(viewport.tileX, 0);
    };
    sync(); updates.push(sync);
  });
  if (updates.length) {
    const sync = () => updates.forEach((update) => update());
    // followupdate 在 Camera.preRender 更新跟随位置之后，避免一帧视差滞后。
    camera.on('followupdate', sync);
    events.on('prerender', sync);
    events.once('shutdown', () => {
      disposed = true;
      events.off('prerender', sync); camera.off('followupdate', sync);
    });
  }
}
