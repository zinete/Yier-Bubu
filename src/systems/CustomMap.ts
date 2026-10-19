import type { LevelData } from '../types/game';
import type { PlatformMaterial } from './PlatformMaterial';

export interface MapAsset { id: string; name: string; data: string; width: number; height: number }
export type SceneTheme = 'forest' | 'snow' | 'desert' | 'night';
export interface SceneLayer {
  id: string; name: string; assetId: string; group: 'background' | 'foreground';
  mode: 'image' | 'repeat'; x: number; y: number; width: number; height: number;
  parallax: number; opacity: number; visible: boolean; locked: boolean;
}
export interface SceneSettings {
  theme: SceneTheme; backgroundAssetId?: string; backgroundMode: 'stretch' | 'repeat'; parallax: number;
  /** 缺省时保留旧地图的主题图形；sky 仅保留渐变天空。 */
  baseMode?: 'theme' | 'sky'; layers?: SceneLayer[];
}
export interface Decoration { objectId?: string; assetId: string; x: number; y: number; width: number; height: number; layer?: 'back' | 'front'; solid?: boolean }
export interface CustomMap { version: 1; title: string; level: LevelData; assets?: MapAsset[]; decorations?: Decoration[]; scene?: SceneSettings; platformMaterials?: Record<string, PlatformMaterial> }
export const DRAFT_KEY = 'yierBubuEditorDraftV1';
export const BUILTIN_ASSET_IDS = ['builtin-moss-platform', 'builtin-gold-star', 'builtin-leaf-slime', 'builtin-lantern-marker', 'builtin-flower-bush',
  'builtin-scene-sky', 'builtin-scene-mountains', 'builtin-scene-trees', 'builtin-scene-foliage'];
/** 编辑身份独立于平台运行时 id；旧 v1 文件缺失时确定性补齐，之后往返保持不变。 */
export function identifyMapObjects(map: CustomMap): CustomMap {
  map.level.coins = map.level.coins.map((coin) => Array.isArray(coin) ? { x: coin[0], y: coin[1] } : coin);
  const groups = { platform: map.level.platforms, coin: map.level.coins as Array<{ objectId?: string }>,
    enemy: map.level.enemies, decoration: map.decorations ?? [], spawn: [map.level.spawn],
    checkpoint: [map.level.checkpoint], flag: [map.level.flag] };
  const used = new Set<string>();
  for (const values of Object.values(groups)) for (const value of values) {
    if (value.objectId === undefined) continue;
    if (typeof value.objectId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.objectId)) throw new Error('对象编号格式不正确');
    if (used.has(value.objectId)) throw new Error('对象编号不可重复');
    used.add(value.objectId);
  }
  for (const [kind, values] of Object.entries(groups)) values.forEach((value, index) => {
    if (value.objectId) return;
    const base = `obj-${kind}-${index}`;
    let id = base, suffix = 0;
    while (used.has(id)) id = `${base}-${++suffix}`;
    value.objectId = id; used.add(id);
  });
  return map;
}
/** 不设置业务宽度上限，仍拒绝空值、NaN 和无穷大等无效数据。 */
export function validateMapWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 960)
    throw new Error('地图宽度需为不小于 960 的有限数值，不设固定上限');
  return value;
}
export function playablePlatforms(map: CustomMap): LevelData['platforms'] {
  return [...map.level.platforms, ...(map.decorations ?? []).flatMap((p, i) =>
    p.solid === true || (p.solid === undefined && p.assetId === 'builtin-moss-platform')
      ? [{ id: `decoration-platform-${i}`, x: p.x, y: p.y, width: p.width, height: p.height,
        assetId: p.assetId, kind: 'platform' as const }] : [])];
}
export function newMap(): CustomMap {
  return identifyMapObjects({
    version: 1, title: '我的星光地图', level: {
      id: 'custom', width: 1920, timeLimit: 120,
      spawn: { x: 100, y: 330 }, checkpoint: { x: 1000, y: 330 },
      flag: { x: 1780, y: 280, width: 34, height: 164 },
      platforms: [{ id: 'ground-1', x: 0, y: 444, width: 1920, height: 96, kind: 'ground' }],
      coins: [{ x: 330, y: 390 }], enemies: [],
    },
  });
}
/** 白名单解析：外部地图只有数据，不执行代码，不接受无限对象或尺寸。 */
export function parseCustomMap(input: unknown, playable = true): CustomMap {
  const fail = (message: string): never => { throw new Error(message); };
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('地图对象格式不正确');
    return value as Record<string, unknown>;
  };
  const number = (value: unknown, min: number, max: number, label: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      return fail(`${label}应在 ${min}～${max} 范围内`);
    return value;
  };
  const root = object(input);
  if (root.version !== 1) fail('不支持的地图版本');
  if (typeof root.title !== 'string' || !root.title.trim() || root.title.length > 60) fail('标题需为 1～60 个字符');
  const raw = object(root.level);
  const width = validateMapWidth(raw.width);
  const identity = (p: Record<string, unknown>): { objectId?: string } => {
    if (p.objectId === undefined) return { objectId: undefined };
    if (typeof p.objectId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.objectId)) fail('对象编号格式不正确');
    return { objectId: p.objectId as string };
  };
  const point = (value: unknown, label: string) => {
    const p = Array.isArray(value) ? { x: value[0], y: value[1] } : object(value);
    return { ...identity(p), x: number(p.x, 0, width, `${label} X`), y: number(p.y, 0, 540, `${label} Y`) };
  };
  const rectangle = (value: unknown, label: string) => {
    const p = object(value);
    const location = point(p, label);
    return { ...location, width: number(p.width, 16, width - location.x, `${label}宽度`),
      height: number(p.height, 8, 540 - location.y, `${label}高度`) };
  };
  const list = (value: unknown, max: number, label: string): unknown[] => {
    if (!Array.isArray(value) || value.length > max) return fail(`${label}最多 ${max} 个，且必须为数组`);
    return value;
  };
  const platforms = list(raw.platforms, 200, '平台').map((value, i) => {
    const p = object(value);
    if (p.kind !== 'ground' && p.kind !== 'platform') fail('平台类型不正确');
    const rect = rectangle(p, `平台${i + 1}`);
    const awakening = p.awakening === undefined ? undefined : object(p.awakening);
    if (awakening && p.kind !== 'platform') fail('星光唤醒只支持跳跃平台，不能用于地面');
    const offsets = awakening ? {
      budOffsetX: number(awakening.budOffsetX, 16 - rect.x, width - 16 - rect.x, '花苞相对 X'),
      budOffsetY: number(awakening.budOffsetY, 24 - rect.y, 516 - rect.y, '花苞相对 Y'),
      durationMs: number(awakening.durationMs, 3000, 30000, '星光平台持续时间（毫秒）'),
    } : undefined;
    return { ...rect, id: `platform-${i}`, kind: p.kind as 'ground' | 'platform', ...(offsets ? { awakening: offsets } : {}) };
  });
  if (platforms.filter((p) => p.awakening).length > 20) fail('星光平台最多 20 个');
  if (raw.awakeningGoal !== undefined && typeof raw.awakeningGoal !== 'boolean') fail('星光终点锁定设置不正确');
  if (raw.awakeningGoal && !platforms.some((p) => p.awakening)) fail('锁定终点前至少放置一个星光平台');
  const spawn = point(raw.spawn, '出生点');
  const checkpoint = point(raw.checkpoint, '检查点');
  const flag = rectangle(raw.flag, '终点');
  const enemies = list(raw.enemies, 40, '敌人').map((value, i) => {
    const enemy = object(value);
    const location = point(enemy, `敌人${i + 1}`);
    const min = number(enemy.min, 0, location.x, '巡逻左边界');
    const max = number(enemy.max, location.x, width, '巡逻右边界');
    const speed = number(enemy.speed, 10, 200, '敌人速度');
    const attack = enemy.attack === undefined ? undefined : object(enemy.attack);
    return { ...location, min, max, speed, attack: attack ? {
      range: number(attack.range, 50, 800, '攻击射程'), cooldown: number(attack.cooldown, 500, 10000, '攻击冷却'),
      projectileSpeed: number(attack.projectileSpeed, 100, 800, '弹速'),
      projectileArc: number(attack.projectileArc, -500, 100, '抛物线速度'),
      projectileGravity: number(attack.projectileGravity, 0, 2000, '弹体重力'),
      projectileLifetime: number(attack.projectileLifetime, 200, 3000, '弹体寿命'),
    } : undefined };
  });
  const assets = list(root.assets ?? [], 20, '素材').map((value) => {
    const asset = object(value);
    if (typeof asset.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(asset.id)) fail('素材编号格式错误');
    if (typeof asset.name !== 'string' || asset.name.length > 100) fail('素材名称格式错误');
    if (typeof asset.data !== 'string' || asset.data.length > 350000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.data))
      fail('素材须为内嵌 PNG，且每张不超过 350KB');
    return { id: asset.id as string, name: asset.name as string, data: asset.data as string,
      width: number(asset.width, 1, 512, '素材宽度'), height: number(asset.height, 1, 512, '素材高度') };
  });
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) fail('素材编号不可重复');
  if (assets.reduce((sum, asset) => sum + asset.data.length, 0) > 2000000) fail('素材总量超过 2MB');
  if (assets.some((asset) => BUILTIN_ASSET_IDS.includes(asset.id))) fail('上传素材不能覆盖默认素材编号');
  const hasAsset = (id: unknown): boolean => typeof id === 'string' &&
    (BUILTIN_ASSET_IDS.includes(id) || assets.some((asset) => asset.id === id));
  const appearance = (value: unknown): { assetId?: string } => {
    const id = object(value).assetId;
    if (id === undefined) return {};
    if (!hasAsset(id)) fail('对象外观引用了不存在的素材');
    return { assetId: id as string };
  };
  const platformMaterials: Record<string, PlatformMaterial> = Object.create(null);
  for (const [id, value] of Object.entries(root.platformMaterials === undefined ? {} : object(root.platformMaterials))) {
    if (!hasAsset(id)) fail('平台材质引用了不存在的素材');
    const m = object(value);
    if (m.mode !== 'repeat' && m.mode !== 'stretch') fail('平台材质模式不正确');
    const leftCap = number(m.leftCap, 0, 0.4, '左收边比例');
    const rightCap = number(m.rightCap, 0, 0.4, '右收边比例');
    platformMaterials[id] = { mode: m.mode as 'repeat' | 'stretch', leftCap, rightCap,
      ...(m.surfaceY === undefined ? {} : { surfaceY: number(m.surfaceY, 0, 0.99, '站立线比例') }) };
  }
  platforms.forEach((p, i) => Object.assign(p, appearance((raw.platforms as unknown[])[i])));
  enemies.forEach((p, i) => Object.assign(p, appearance((raw.enemies as unknown[])[i])));
  Object.assign(spawn, appearance(raw.spawn)); Object.assign(checkpoint, appearance(raw.checkpoint));
  Object.assign(flag, appearance(raw.flag));
  const decorations = list(root.decorations ?? [], 200, '自定义对象').map((value) => {
    const p = object(value);
    if (!hasAsset(p.assetId)) fail('自定义对象引用了不存在的素材');
    if (p.layer !== undefined && p.layer !== 'back' && p.layer !== 'front') fail('装饰图层不正确');
    if (p.solid !== undefined && typeof p.solid !== 'boolean') fail('对象碰撞设置不正确');
    return { ...rectangle(p, '自定义对象'), assetId: p.assetId as string, layer: (p.layer ?? 'back') as 'back' | 'front',
      solid: p.solid === undefined ? p.assetId === 'builtin-moss-platform' : p.solid as boolean };
  });
  if (playable) {
    const surfaces = [...platforms.filter((p) => !p.awakening), ...decorations.filter((p) => p.solid)];
    if (!surfaces.length) fail('至少需要一个平台');
    for (const [label, p] of [['出生点', spawn], ['检查点', checkpoint]] as const) {
      if (!surfaces.some((surface) => p.x >= surface.x + 20 && p.x <= surface.x + surface.width - 20 && p.y <= surface.y))
        fail(`${label}下方需有平台，且距平台边缘至少 20 像素`);
    }
    if (!surfaces.some((surface) => flag.x >= surface.x && flag.x + flag.width <= surface.x + surface.width &&
      flag.y <= surface.y && flag.y + flag.height >= surface.y)) fail('终点需与可站立的平台相接');
  }
  const sceneRaw = root.scene === undefined ? {} : object(root.scene);
  const theme = sceneRaw.theme ?? 'forest';
  if (!['forest', 'snow', 'desert', 'night'].includes(String(theme))) fail('场景主题不正确');
  const backgroundMode = sceneRaw.backgroundMode ?? 'stretch';
  if (backgroundMode !== 'stretch' && backgroundMode !== 'repeat') fail('背景显示模式不正确');
  const backgroundAssetId = sceneRaw.backgroundAssetId;
  if (backgroundAssetId !== undefined && !hasAsset(backgroundAssetId)) fail('背景引用的素材不存在');
  const scene: SceneSettings = { theme: theme as SceneTheme, backgroundMode: backgroundMode as 'stretch' | 'repeat',
    parallax: number(sceneRaw.parallax ?? 0.2, 0, 1, '背景视差'), backgroundAssetId: backgroundAssetId as string | undefined };
  if (sceneRaw.baseMode !== undefined) {
    if (sceneRaw.baseMode !== 'theme' && sceneRaw.baseMode !== 'sky') fail('基础背景模式不正确');
    scene.baseMode = sceneRaw.baseMode as SceneSettings['baseMode'];
  }
  if (sceneRaw.layers !== undefined) {
    scene.layers = list(sceneRaw.layers, 16, '场景图层').map((value) => {
      const p = object(value);
      if (typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)) fail('图层编号格式不正确');
      if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40) fail('图层名称需为 1～40 个字符');
      if (!hasAsset(p.assetId)) fail('图层引用的素材不存在');
      if (p.group !== 'background' && p.group !== 'foreground') fail('图层分区不正确');
      if (p.mode !== 'image' && p.mode !== 'repeat') fail('图层铺设方式不正确');
      if (typeof p.visible !== 'boolean' || typeof p.locked !== 'boolean') fail('图层显示或锁定状态不正确');
      return { id: p.id as string, name: (p.name as string).trim(), assetId: p.assetId as string,
        group: p.group as SceneLayer['group'], mode: p.mode as SceneLayer['mode'],
        x: number(p.x, -1000000, 1000000, '图层 X'), y: number(p.y, -1000000, 1000000, '图层 Y'),
        width: number(p.width, 16, 16384, '图层单幅宽度'), height: number(p.height, 16, 4096, '图层高度'),
        parallax: number(p.parallax, 0, 1, '图层视差'), opacity: number(p.opacity, 0, 1, '图层透明度'),
        visible: p.visible as boolean, locked: p.locked as boolean };
    });
    if (new Set(scene.layers.map((p) => p.id)).size !== scene.layers.length) fail('图层编号不可重复');
  }
  return identifyMapObjects({ version: 1, title: (root.title as string).trim(), assets, decorations, scene, platformMaterials, level: {
    id: 'custom', width, timeLimit: number(raw.timeLimit, 30, 600, '时间限制'),
    spawn, checkpoint, flag, platforms, coins: list(raw.coins, 300, '星星').map((p) => ({ ...point(p, '星星'), ...(Array.isArray(p) ? {} : appearance(p)) })), enemies,
    ...(raw.awakeningGoal === undefined ? {} : { awakeningGoal: raw.awakeningGoal as boolean }),
  } });
}
