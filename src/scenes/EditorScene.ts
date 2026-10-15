import Phaser from 'phaser';
import { SCENE } from '../config/constants';
import { DRAFT_KEY, newMap, parseCustomMap, playablePlatforms, validateMapWidth, type CustomMap, type MapAsset, type SceneSettings } from '../systems/CustomMap';
import { PLAYER } from '../config/constants';
import type { EnemyData } from '../types/game';
import { mapAssets, DEFAULT_ASSETS, DEFAULT_OBJECT_SKINS } from '../systems/DefaultAssets';
import { assetLayout, cachedAssetGeometry, ensureAssetGeometry } from '../systems/AssetGeometry';
import { materialFor, platformSvg } from '../systems/PlatformMaterial';
import { EDITOR_GRID, objectBounds, visualBounds, snapObjectToGrid, resizeObjectOnGrid, type GridObject } from '../systems/ObjectGeometry';
import { DEFAULT_SCENE, SCENE_PALETTES, backdropLayers, sceneBackdropSvg } from '../systems/SceneBackdrop';
import './editor.css';

type Tool = 'select' | 'platform' | 'coin' | 'enemy' | 'spawn' | 'checkpoint' | 'flag' | 'decoration';
type Selection = { kind: Exclude<Tool, 'select'>; index: number };
type CopyableKind = 'platform' | 'coin' | 'enemy' | 'decoration';
type ObjectCopy = { kind: CopyableKind; value: Record<string, unknown> };
const DEFAULT_PLATFORM_SIZE = { width: 160, height: 32 };
export class EditorScene extends Phaser.Scene {
  private root!: HTMLDivElement;
  private map: CustomMap = newMap();
  private tool: Tool = 'select';
  private selected?: Selection;
  private assetId?: string;
  private refreshGeometry = (): void => {
    if (this.root?.isConnected && !this.drag) {
      this.renderCanvas();
      if (!this.root.querySelector('[data-material]:focus')) this.renderMaterialSettings();
    }
  };
  private undo: string[] = [];
  private redo: string[] = [];
  private eventsAbort!: AbortController;
  private drag?: { x: number; y: number; initialX: number; initialY: number; before: string; resize?: boolean; width: number; height: number; resized?: boolean };
  private preview?: { x: number; y: number };
  private paintWidth = DEFAULT_PLATFORM_SIZE.width;
  private paintHeight = DEFAULT_PLATFORM_SIZE.height;
  private renderFrame = 0;
  private spaceHeld = false;
  private pan?: { x: number; y: number; left: number; top: number };
  private librarySnapshot: MapAsset[] = [];
  private previewFrame = 0;
  private showCollisions = false;
  private materialAssetId = 'builtin-moss-platform';
  private backgroundFrame = 0;
  private sceneEditBefore?: string;
  private clipboard?: ObjectCopy & { pastes: number };
  private objectSerial = 0;
  constructor() { super(SCENE.EDITOR); }
  create(): void {
    this.selected = undefined; this.tool = 'select';
    this.preview = undefined; this.spaceHeld = false; this.drag = undefined; this.pan = undefined; this.librarySnapshot = [];
    this.sceneEditBefore = undefined; this.backgroundFrame = 0;
    this.clipboard = undefined;
    this.resetPlatformBrush();
    // 保留内存中的草稿，存储不可用时仍能从试玩返回。
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) this.map = parseCustomMap(JSON.parse(raw), false);
    } catch { /* 不覆盖上次内存草稿。 */ }
    this.eventsAbort = new AbortController();
    this.root = document.createElement('div');
    this.root.className = 'map-editor';
    this.root.innerHTML = `<header><h1>✦ 星光地图工坊</h1>
      <button data-action="home">返回主页</button><button data-action="undo">撤销</button><button data-action="redo">重做</button>
      <button data-action="save">保存草稿</button><button data-action="export">导出地图</button><button data-action="import">导入地图</button>
      <button data-action="collisions" aria-pressed="false">碰撞辅助线</button>
      <button data-action="play">▶ 试玩</button></header>
      <main><aside><h2>放置对象</h2><div class="tools">
      <button data-tool="select">选择 / 拖动</button><button data-tool="platform">跳跃平台</button>
      <button data-tool="coin">星星</button><button data-tool="enemy">敌人</button>
      <button data-tool="spawn">出生点</button><button data-tool="checkpoint">检查点</button><button data-tool="flag">终点</button></div>
      <p class="tool-status" aria-live="polite"></p>
      <button data-action="reset-platform-size" title="只重置后续跳台的放置尺寸，不修改任何已有对象">恢复跳台尺寸 · 160×32</button>
      <p class="hint">地面与新建跳台尺寸独立。调整跳台尺寸后可连续放置；复制已有地面请使用 Ctrl+C/V。</p>
      <label>素材放置用途<select data-placement-kind><option value="decoration">装饰（无碰撞）</option><option value="platform">可站立平台</option><option value="coin">可收集星星</option><option value="enemy">敌人</option><option value="checkpoint">检查点</option></select></label>
      <p class="hint">点击连续放置 · Esc/右键切回选择 · Alt 点击快速选择 · 拖动右下角调尺寸 · 空格拖动画布</p>
      <h2>默认素材</h2><div class="default-assets assets"></div>
      <h2>自定义素材</h2><button data-action="upload">上传图片</button><div class="uploaded-assets assets"></div>
      <p class="hint">PNG / JPEG / WebP。上传后选择素材，连续点击放置装饰，可在属性中调整尺寸。装饰不参与碰撞。</p>
      <h2>平台材质</h2>
      <label>要调整的素材<select data-material="asset"></select></label>
      <label>铺设方式<select data-material="mode"><option value="repeat">收边＋镜像重复中段</option><option value="stretch">整图拉伸（兼容旧素材）</option></select></label>
      <label>站立线（原图高度 %）<input data-material="surfaceY" type="number" min="0" max="99" step="0.1"></label>
      <label>左收边（内容宽度 %）<input data-material="leftCap" type="number" min="0" max="40" step="1"></label>
      <label>右收边（内容宽度 %）<input data-material="rightCap" type="number" min="0" max="40" step="1"></label>
      <button data-action="material">应用材质</button><button data-action="material-reset">恢复默认材质</button>
      <p class="hint">对使用此素材的所有平台生效。先开启顶部「碰撞辅助线」校准站立面。宽度控制拼接长度，高度控制平台厚度；装饰不受影响。</p>
      <h2>场景设置</h2>
      <label>场景主题<select data-scene="theme"><option value="forest">绘本森林</option><option value="snow">雪地</option><option value="desert">沙漠</option><option value="night">星空夜晚</option></select></label>
      <label>自定义背景<select data-scene="background"><option value="">使用主题背景</option></select></label>
      <label>背景显示<select data-scene="mode"><option value="stretch">拉伸覆盖地图</option><option value="repeat">按高度适配并横向平铺</option></select></label>
      <label>背景视差（0 固定 / 1 随地图）<input data-scene="parallax" type="number" min="0" max="1" step="0.05"></label>
      <input data-parallax-slider type="range" min="0" max="1" step="0.05" aria-label="实时调整背景视差">
      <p class="scene-preview-status" role="status" aria-live="polite"></p>
      <button data-action="scene-pan">演示横向视差</button><button data-action="scene">保存场景设置</button>
      <p class="hint">选择即预览，无需点击应用。横向滚动或空格拖动画布可查看视差；铺设方式仅对自定义背景生效。背景不改变平台材质。</p>
      <p class="hint">放置、拖动和尺寸调整均按碰撞/操作框的四边吸附 16px 网格。Shift 不会取消吸附。横向滚动查看地图。</p>
      <h2>地图设置</h2><label>标题<input data-meta="title" maxlength="60"></label>
      <label>地图宽度<input data-meta="width" type="number" min="960" step="16"></label>
      <p class="hint">宽度至少 960px，不设固定上限。超长地图仍受浏览器编辑与试玩性能影响。</p>
      <label>时间限制（秒）<input data-meta="timeLimit" type="number" min="30" max="600"></label>
      <button data-action="meta">应用地图设置</button><hr><button data-action="new">新建空白地图</button>
      <p class="hint">Ctrl+C 复制 · Ctrl+V 粘贴 · Delete 删除 · Ctrl+Z 撤销 · Ctrl+Shift+Z 重做。试玩前需通过结构校验。</p>
      </aside><div class="workspace"><svg xmlns="http://www.w3.org/2000/svg" aria-label="地图编辑画布，选择对象后可复制、粘贴和删除" role="img" tabindex="0"></svg></div>
      <aside class="property-sidebar" aria-label="对象属性面板"><h2>对象属性</h2><div class="inspector"></div>
      <button data-action="copy">复制对象 · Ctrl+C</button><button data-action="paste">粘贴对象 · Ctrl+V</button>
      <button data-action="duplicate">快速创建副本 · Ctrl+D</button><button data-action="delete" class="danger">删除选中对象 · Delete</button>
      <p class="hint">先切换「选择 / 拖动」或按 Alt 点击选中对象。复制保留对象属性，粘贴后自动选中副本；删除和粘贴均可撤销。出生点、检查点和终点为唯一标记，仅可移动。</p>
      <p class="hint">方向键移动 1 格，Shift+方向键移动 4 格。星星和敌人的碰撞框为 32×32；出生/检查点为操作标记。辅助线只在编辑中显示。</p></aside></main>
      <footer role="status" aria-live="polite">欢迎创作：先放平台，再设置出生点与终点。</footer>
      <input class="file" type="file" accept=".json,application/json" hidden>
      <input class="asset-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
    document.body.append(this.root);
    const options = { signal: this.eventsAbort.signal };
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button');
      if (!button) return;
      this.commitSceneEdit();
      if (button.dataset.asset) {
        this.assetId = button.dataset.asset;
        this.materialAssetId = this.assetId;
        this.tool = ({ 'builtin-moss-platform': 'platform', 'builtin-gold-star': 'coin', 'builtin-leaf-slime': 'enemy', 'builtin-lantern-marker': 'checkpoint' } as Record<string, Tool>)[this.assetId] ?? 'decoration';
        this.render();
      }
      else if (button.dataset.tool) { this.tool = button.dataset.tool as Tool; this.assetId = undefined; this.render(); }
      else this.action(button.dataset.action ?? '');
    }, options);
    const svg = this.svg();
    this.root.querySelectorAll<HTMLElement>('[data-scene],[data-parallax-slider]').forEach((control) => {
      control.addEventListener('input', () => this.applySceneSettings(control), options);
      control.addEventListener('change', () => {
        this.applySceneSettings(control); this.commitSceneEdit(); this.renderSceneControls();
      }, options);
      control.addEventListener('blur', () => { this.commitSceneEdit(); this.renderSceneControls(); }, options);
    });
    this.root.querySelector('.workspace')!.addEventListener('scroll', () => {
      if (this.backgroundFrame) return;
      this.backgroundFrame = requestAnimationFrame(() => {
        this.backgroundFrame = 0;
        if (!this.root.isConnected) return;
        this.updateSceneParallax();
        if (!this.drag) { this.preview = undefined; this.drawPreview(); }
      });
    }, options);
    this.root.querySelector<HTMLSelectElement>('[data-material="asset"]')!.addEventListener('change', (event) => {
      this.materialAssetId = (event.target as HTMLSelectElement).value; this.renderMaterialSettings();
    }, options);
    svg.addEventListener('pointerdown', (event) => this.pointerDown(event), options);
    svg.addEventListener('pointermove', (event) => this.pointerMove(event), options);
    svg.addEventListener('pointerup', () => this.endDrag(), options);
    svg.addEventListener('pointercancel', () => this.endDrag(true), options);
    svg.addEventListener('pointerleave', () => { if (!this.drag && !this.pan) { this.preview = undefined; this.drawPreview(); } }, options);
    svg.addEventListener('contextmenu', (event) => { event.preventDefault(); this.tool = 'select'; this.preview = undefined; this.render(); }, options);
    this.root.querySelector<HTMLSelectElement>('[data-placement-kind]')!.addEventListener('change', (event) => {
      this.tool = (event.target as HTMLSelectElement).value as Tool; this.render();
    }, options);
    document.addEventListener('keydown', (event) => this.handleKeyDown(event), options);
    document.addEventListener('keyup', (event) => { if (event.code === 'Space') this.spaceHeld = false; }, options);
    window.addEventListener('blur', () => { this.spaceHeld = false; this.endDrag(true); this.commitSceneEdit(); }, options);
    this.root.querySelector<HTMLInputElement>('.file')!.addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 3 * 1024 * 1024) throw new Error('地图文件不能超过 3MB');
        const parsed = parseCustomMap(JSON.parse(await file.text()));
        if (!this.root.isConnected) return;
        this.remember(); this.map = parsed; this.selected = undefined;
        this.clipboard = undefined;
        this.resetPlatformBrush();
        this.render(); this.message('地图已导入，可编辑或试玩。');
      } catch (error) { this.message(error instanceof Error ? error.message : '导入失败'); }
      input.value = '';
    }, options);
    this.root.querySelector<HTMLInputElement>('.asset-file')!.addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement; const file = input.files?.[0];
      if (!file) return;
      try {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)
          throw new Error('请选择不超过 2MB 的 PNG、JPEG 或 WebP 图片');
        if ((this.map.assets?.length ?? 0) >= 20) throw new Error('最多上传 20 张素材');
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 512 / bitmap.width, 512 / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const data = canvas.toDataURL('image/png');
        if (data.length > 350000) throw new Error('图片细节过多，请压缩或使用更小图片');
        if ((this.map.assets ?? []).reduce((sum, asset) => sum + asset.data.length, data.length) > 2000000)
          throw new Error('地图素材总量不能超过 2MB');
        if (!this.root.isConnected) return;
        this.remember(); this.assetId = `asset-${Date.now()}`;
        (this.map.assets ??= []).push({ id: this.assetId, name: file.name.slice(0, 100), data, width: canvas.width, height: canvas.height });
        this.tool = 'decoration'; this.render(); this.message('素材已上传，点击地图可连续放置；Esc 返回选择模式。');
      } catch (error) { this.message(error instanceof Error ? error.message : '上传失败'); }
      input.value = '';
    }, options);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.eventsAbort.abort(); cancelAnimationFrame(this.renderFrame); cancelAnimationFrame(this.previewFrame);
      cancelAnimationFrame(this.backgroundFrame); this.backgroundFrame = 0;
      this.renderFrame = 0; this.previewFrame = 0; this.root.remove();
    });
    this.render();
  }
  private svg(): SVGSVGElement { return this.root.querySelector('svg')!; }
  private message(text: string): void { this.root.querySelector('footer')!.textContent = text; }
  private remember(before = JSON.stringify(this.map)): void {
    this.undo.push(before); if (this.undo.length > (this.map.assets?.length ? 10 : 50)) this.undo.shift(); this.redo = [];
  }
  private object(): Record<string, unknown> | undefined {
    if (!this.selected) return;
    const { kind, index } = this.selected;
    const l = this.map.level;
    const value = kind === 'platform' ? l.platforms[index] : kind === 'coin' ? l.coins[index]
      : kind === 'enemy' ? l.enemies[index] : kind === 'decoration' ? this.map.decorations?.[index] : kind === 'flag' ? l.flag : l[kind];
    return value as unknown as Record<string, unknown>;
  }
  private action(action: string): void {
    this.commitSceneEdit();
    try {
      if (action === 'reset-platform-size') {
        this.resetPlatformBrush(); this.render();
        this.message('后续跳跃平台已恢复为 160×32，已有地面和平台不会改变。'); return;
      }
      if (action === 'collisions') {
        this.showCollisions = !this.showCollisions; this.render();
        this.message(this.showCollisions ? '绿色虚线＝实际站立面，浅绿色框＝物理范围；仅用于编辑检查。' : '碰撞辅助线已隐藏，不影响实际碰撞。'); return;
      }
      if (action === 'material' || action === 'material-reset') {
        const id = this.materialAssetId;
        const candidate = structuredClone(this.map);
        if (action === 'material-reset') delete candidate.platformMaterials?.[id];
        else {
          const field = (name: string) => (this.root.querySelector(`[data-material="${name}"]`) as HTMLInputElement).value;
          const surfaceY = Number(field('surfaceY')) / 100;
          const asset = mapAssets(this.map).find((a) => a.id === id);
          const g = asset && cachedAssetGeometry(asset.data);
          if (g && (surfaceY * g.sourceHeight < g.y || surfaceY * g.sourceHeight >= g.y + g.height))
            throw new Error('站立线应位于素材的可见内容内，请对照原图高度调整百分比');
          candidate.platformMaterials = { ...candidate.platformMaterials, [id]: { mode: field('mode') as 'repeat' | 'stretch',
            surfaceY, leftCap: Number(field('leftCap')) / 100, rightCap: Number(field('rightCap')) / 100 } };
        }
        parseCustomMap(candidate, false); this.remember(); this.map = candidate; this.render();
        this.message('平台材质已更新，预览和试玩使用同一站立线与拼接规则。保存草稿可保留设置。'); return;
      }
      if (action === 'undo' || action === 'redo') {
        const source = action === 'undo' ? this.undo : this.redo;
        const target = action === 'undo' ? this.redo : this.undo;
        const value = source.pop(); if (!value) return;
        target.push(JSON.stringify(this.map)); this.map = JSON.parse(value); this.selected = undefined;
      } else if (action === 'home') { if (this.save()) this.scene.start(SCENE.START); return; }
      else if (action === 'save') { this.save(); return; }
      else if (action === 'new') { this.remember(); this.map = newMap(); this.selected = undefined; this.clipboard = undefined; this.resetPlatformBrush(); }
      else if (action === 'import') { this.root.querySelector<HTMLInputElement>('.file')!.click(); return; }
      else if (action === 'upload') { this.root.querySelector<HTMLInputElement>('.asset-file')!.click(); return; }
      else if (action === 'copy') {
        this.clipboard = { ...this.selectionCopy(), pastes: 0 };
        this.renderClipboardControls(); this.message('已复制对象；按 Ctrl+V 粘贴，原对象不会移动。'); return;
      }
      else if (action === 'paste' || action === 'duplicate') {
        const source = action === 'paste' ? this.clipboard : this.selectionCopy();
        if (!source) throw new Error('请先选中对象并按 Ctrl+C 复制');
        this.insertCopy(source, action === 'paste' ? this.clipboard!.pastes + 1 : 1);
        if (action === 'paste') this.clipboard!.pastes += 1;
        this.render(); this.message('已创建并选中副本，可继续拖动；Ctrl+Z 撤销。'); return;
      }
      else if (action === 'export' || action === 'play') {
        const valid = parseCustomMap(this.map);
        if (action === 'play') {
          this.save(); this.scene.start(SCENE.GAME, { customMap: valid }); return;
        }
        const url = URL.createObjectURL(new Blob([JSON.stringify(valid, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'star-map.json'; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.message('地图已导出，别人可在工坊中导入试玩。'); return;
      } else if (action === 'delete') {
        if (!this.selected || !this.object()) { this.message('请先选中要删除的对象'); return; }
        if (['spawn', 'checkpoint', 'flag'].includes(this.selected.kind)) {
          this.message('出生点、检查点、终点必须保留，可拖动修改位置。'); return;
        }
        this.remember(); const { kind, index } = this.selected;
        if (kind === 'platform') this.map.level.platforms.splice(index, 1);
        else if (kind === 'coin') this.map.level.coins.splice(index, 1);
        else if (kind === 'decoration') this.map.decorations?.splice(index, 1);
        else this.map.level.enemies.splice(index, 1);
        this.selected = undefined;
        this.render(); this.message('选中对象已删除；Ctrl+Z 可恢复。'); return;
      } else if (action === 'meta') {
        const title = this.root.querySelector<HTMLInputElement>('[data-meta="title"]')!.value.trim();
        const width = validateMapWidth(Number(this.root.querySelector<HTMLInputElement>('[data-meta="width"]')!.value));
        const time = Number(this.root.querySelector<HTMLInputElement>('[data-meta="timeLimit"]')!.value);
        if (!title || time < 30 || time > 600 || !Number.isFinite(time))
          throw new Error('标题不能为空，时间应为 30～600 秒');
        this.remember(); this.map.title = title; this.map.level.width = width; this.map.level.timeLimit = time;
      } else if (action === 'scene') {
        if (this.applySceneSettings()) { this.commitSceneEdit(); this.save(); } return;
      } else if (action === 'scene-pan') {
        const workspace = this.root.querySelector<HTMLElement>('.workspace')!;
        const max = workspace.scrollWidth - workspace.clientWidth;
        if (max <= 0) { this.message('当前画布已完整显示；加宽地图后可演示横向视差。'); return; }
        const step = Math.min(320, max);
        workspace.scrollTo({ left: workspace.scrollLeft + step > max ? Math.max(0, workspace.scrollLeft - step) : workspace.scrollLeft + step,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        this.message('正在移动编辑视口演示背景视差，不会修改对象位置。'); return;
      } else if (action === 'properties') {
        const value = this.object(); if (!value) return;
        const previousKind = value.kind;
        const changes: Record<string, number> = {};
        this.root.querySelectorAll<HTMLInputElement>('[data-prop]').forEach((input) => {
          const number = Number(input.value); if (!Number.isFinite(number)) throw new Error('属性需为有效数字');
          changes[input.dataset.prop!] = number;
        });
        this.remember(); Object.assign(value, changes);
        const kind = this.root.querySelector<HTMLSelectElement>('[data-kind]');
        if (kind) value.kind = kind.value;
        if (this.selected?.kind === 'platform' && previousKind === 'platform' && value.kind === 'ground') this.resetPlatformBrush();
        const appearance = this.root.querySelector<HTMLSelectElement>('[data-appearance]');
        if (appearance) {
          if (appearance.value) value.assetId = appearance.value;
          else delete value.assetId;
        }
        const layer = this.root.querySelector<HTMLSelectElement>('[data-layer]');
        if (layer) value.layer = layer.value;
        const solid = this.root.querySelector<HTMLInputElement>('[data-solid]');
        if (solid) value.solid = solid.checked;
        const remote = this.root.querySelector<HTMLInputElement>('[data-remote]');
        if (remote) {
          const enemy = value as unknown as EnemyData;
          enemy.attack = remote.checked ? enemy.attack ?? {
            range: 340, cooldown: 1600, projectileSpeed: 440, projectileArc: -120, projectileGravity: 700, projectileLifetime: 1450,
          } : undefined;
        }
        Object.assign(value, snapObjectToGrid(this.selected!.kind, value as unknown as GridObject, this.map.level.width));
        if (this.selected?.kind === 'enemy') {
          value.min = Math.max(0, Math.min(Number(value.min), Number(value.x)));
          value.max = Math.min(this.map.level.width, Math.max(Number(value.max), Number(value.x)));
        }
      }
      if (action === 'properties') this.rememberPlatformBrush();
      this.render(); this.message('修改已应用。试玩或导出时会检查地图。');
    } catch (error) { this.message(error instanceof Error ? error.message : '操作失败'); }
  }
  private save(): boolean {
    try { parseCustomMap(this.map, false); }
    catch (error) { this.message(error instanceof Error ? error.message : '地图格式无效'); return false; }
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(this.map)); this.message('草稿已保存到当前浏览器。'); }
    catch { this.message('浏览器存储不可用，请导出文件保留地图。'); }
    return true;
  }
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || !this.root.isConnected) return;
    const target = event.target as Element | null;
    if (target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
    const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    let action: string | undefined;
    if (command && !event.altKey && (!event.shiftKey || key === 'z')) {
      action = ({ c: 'copy', v: 'paste', d: 'duplicate', y: 'redo', z: event.shiftKey ? 'redo' : 'undo' } as Record<string, string>)[key];
    } else if (!command && event.key === 'Delete') action = 'delete';
    if (action) {
      event.preventDefault();
      if (this.drag || this.pan) { this.message('请先松开鼠标结束拖动，再执行复制、粘贴或删除操作。'); return; }
      this.action(action); return;
    }
    if (event.key === 'Escape') {
      event.preventDefault(); this.endDrag(true); this.tool = 'select'; this.preview = undefined; this.render();
    } else if (event.code === 'Space' && !target?.closest?.('button,a')) {
      event.preventDefault(); this.spaceHeld = true;
    } else if (!command && !this.drag && !this.pan && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && this.selected) {
      event.preventDefault(); this.nudge(event.key, event.shiftKey ? EDITOR_GRID * 4 : EDITOR_GRID);
    }
  }
  private selectionCopy(): ObjectCopy {
    const value = this.object();
    if (!this.selected || !value) throw new Error('请先选中平台、星星、敌人或装饰对象');
    if (!['platform', 'coin', 'enemy', 'decoration'].includes(this.selected.kind))
      throw new Error('出生点、检查点和终点是唯一标记，不可复制；可直接拖动修改位置。');
    const kind = this.selected.kind as CopyableKind;
    const snapshot = kind === 'coin' && Array.isArray(value) ? { x: value[0], y: value[1] } : value;
    return { kind, value: structuredClone(snapshot) };
  }
  private insertCopy(source: ObjectCopy, sequence: number): void {
    const { kind } = source;
    const array = kind === 'platform' ? this.map.level.platforms : kind === 'coin' ? this.map.level.coins
      : kind === 'enemy' ? this.map.level.enemies : this.map.decorations ?? [];
    const limit = kind === 'coin' ? 300 : kind === 'enemy' ? 40 : 200;
    if (array.length >= limit) throw new Error('已达到该类对象数量上限，无法继续粘贴');
    const copy = structuredClone(source.value);
    if (copy.assetId && !mapAssets(this.map).some((asset) => asset.id === copy.assetId))
      throw new Error('复制对象的素材已不存在，请重新选择对象复制');
    const oldX = Number(copy.x), oldY = Number(copy.y);
    if (!Number.isFinite(oldX + oldY)) throw new Error('复制对象的坐标无效');
    const original = snapObjectToGrid(kind, copy as unknown as GridObject, this.map.level.width);
    let placed = snapObjectToGrid(kind, { ...copy, x: oldX + EDITOR_GRID * 2 * sequence,
      y: oldY + EDITOR_GRID * sequence } as GridObject, this.map.level.width);
    if (placed.x === original.x && placed.y === original.y) {
      // 右下角无法继续偏移时向左上尝试，避免副本完全藏在源对象下面。
      placed = snapObjectToGrid(kind, { ...copy, x: original.x - EDITOR_GRID * 2 * sequence,
        y: original.y - EDITOR_GRID * sequence } as GridObject, this.map.level.width);
    }
    Object.assign(copy, placed);
    if (kind === 'enemy') {
      const delta = Number(copy.x) - oldX;
      copy.min = Math.max(0, Math.min(Number(copy.x), Number(copy.min) + delta));
      copy.max = Math.min(this.map.level.width, Math.max(Number(copy.x), Number(copy.max) + delta));
    }
    if (kind === 'platform') copy.id = this.nextObjectId();
    this.remember();
    if (kind === 'decoration' && !this.map.decorations) this.map.decorations = array as NonNullable<CustomMap['decorations']>;
    (array as unknown[]).push(copy);
    this.selected = { kind, index: array.length - 1 };
    this.tool = 'select'; this.preview = undefined;
  }
  private nextObjectId(): string {
    let id: string;
    do {
      this.objectSerial = (this.objectSerial ?? 0) + 1;
      id = `p-${Date.now()}-${this.objectSerial}`;
    } while (this.map.level.platforms.some((platform) => platform.id === id));
    return id;
  }
  private renderClipboardControls(): void {
    const editable = !!this.selected && ['platform', 'coin', 'enemy', 'decoration'].includes(this.selected.kind) && !!this.object();
    for (const action of ['copy', 'duplicate', 'delete', 'paste']) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (button) button.disabled = action === 'paste' ? !this.clipboard : !editable;
    }
  }
  private position(event: PointerEvent): { x: number; y: number } {
    const box = this.svg().getBoundingClientRect();
    // 保留原始指针偏移，只对对象最终边界吸附，不能对按下/移动的鼠标位置分别取整。
    return { x: (event.clientX - box.left) * this.map.level.width / box.width,
      y: (event.clientY - box.top) * 540 / box.height };
  }
  private moveObject(dx: number, dy: number): void {
    const value = this.object(); if (!value || !this.selected) return;
    const oldX = Number(value.x);
    Object.assign(value, snapObjectToGrid(this.selected.kind, { ...value, x: oldX + dx, y: Number(value.y) + dy } as GridObject, this.map.level.width));
    if (this.selected?.kind === 'enemy') {
      value.min = Math.max(0, Number(value.min) + Number(value.x) - oldX);
      value.max = Math.min(this.map.level.width, Number(value.max) + Number(value.x) - oldX);
    }
  }
  private nudge(key: string, amount: number): void {
    this.remember(); this.moveObject(key === 'ArrowLeft' ? -amount : key === 'ArrowRight' ? amount : 0,
      key === 'ArrowUp' ? -amount : key === 'ArrowDown' ? amount : 0); this.render();
  }
  private resetPlatformBrush(): void {
    this.paintWidth = DEFAULT_PLATFORM_SIZE.width; this.paintHeight = DEFAULT_PLATFORM_SIZE.height;
  }
  private rememberPlatformBrush(): void {
    const value = this.object();
    // 地面、选择/移动和复制均不能覆盖跳台笔刷；仅显式编辑浮台时记住其尺寸。
    if (this.selected?.kind !== 'platform' || value?.kind !== 'platform') return;
    const size = snapObjectToGrid('platform', { x: 0, y: 0, width: Number(value.width), height: Number(value.height) }, this.map.level.width);
    this.paintWidth = size.width!; this.paintHeight = size.height!;
  }
  private placement(p: { x: number; y: number }): GridObject {
    const kind = this.tool;
    if (kind === 'select') return p;
    const asset = mapAssets(this.map).find((a) => a.id === this.assetId);
    const scale = asset ? Math.min(1, 128 / Math.max(asset.width, asset.height)) : 1;
    const rectangle = kind === 'platform' || kind === 'flag' || kind === 'decoration';
    const width = kind === 'platform' ? this.paintWidth : kind === 'flag' ? this.map.level.flag.width : (asset?.width ?? 16) * scale;
    const height = kind === 'platform' ? this.paintHeight : kind === 'flag' ? this.map.level.flag.height : (asset?.height ?? 16) * scale;
    return snapObjectToGrid(kind, { ...p, ...(rectangle ? { width, height } : {}) }, this.map.level.width);
  }
  private scheduleCanvas(): void {
    if (this.renderFrame) return;
    this.renderFrame = requestAnimationFrame(() => { this.renderFrame = 0; if (this.root.isConnected) this.renderDrag(); });
  }
  private renderDrag(): void {
    const value = this.object(); if (!this.drag || !this.selected || !value) return;
    const element = this.svg().querySelector(`[data-object="${this.selected.kind}"][data-index="${this.selected.index}"]`);
    const x = Number(value.x), y = Number(value.y);
    if (this.drag.resize || this.drag.resized) {
      const asset = mapAssets(this.map).find((a) => a.id === (value.assetId ?? DEFAULT_OBJECT_SKINS[this.selected!.kind]));
      const g = asset && cachedAssetGeometry(asset.data);
      if (element && asset && g && (this.selected.kind === 'platform' || value.solid)) {
        element.removeAttribute('transform');
        element.innerHTML = platformSvg(asset.data, g, materialFor(asset.id, this.map.platformMaterials), x, y, Number(value.width), Number(value.height))
          + this.platformOutline(x, y, Number(value.width), Number(value.height), true);
      } else if (element && asset) {
        element.removeAttribute('transform');
        const width = Number(value.width), height = Number(value.height);
        const picture = g && this.selected.kind !== 'decoration' ? `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${g.x} ${g.y} ${g.width} ${g.height}" preserveAspectRatio="none"><image href="${asset.data}" width="${g.sourceWidth}" height="${g.sourceHeight}"/></svg>`
          : `<image href="${asset.data}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;
        element.innerHTML = `<g pointer-events="none">${picture}</g>`
          + this.objectOutline(x, y, Number(value.width), Number(value.height), true);
      }
    } else element?.setAttribute('transform', `translate(${x - this.drag.initialX} ${y - this.drag.initialY})`);
    const handle = this.svg().querySelector('[data-resize]');
    handle?.setAttribute('x', String(x + Number(value.width ?? 0) - 8));
    handle?.setAttribute('y', String(y + Number(value.height ?? 0) - 8));
    this.root.querySelector('.tool-status')!.textContent = `${this.drag.resize ? '调整尺寸' : '拖动中'} · X ${x} / Y ${y}${value.width ? ` · ${value.width}×${value.height}` : ''}`;
  }
  private pointerDown(event: PointerEvent): void {
    this.commitSceneEdit();
    if (event.button === 2) return;
    this.svg().focus({ preventScroll: true });
    if (this.spaceHeld || event.button === 1) {
      event.preventDefault(); const workspace = this.root.querySelector('.workspace')!;
      this.pan = { x: event.clientX, y: event.clientY, left: workspace.scrollLeft, top: workspace.scrollTop };
      this.svg().setPointerCapture(event.pointerId); return;
    }
    const p = this.position(event); const l = this.map.level;
    if ((event.target as Element).closest('[data-resize]')) {
      const value = this.object(); if (!value) return;
      this.drag = { ...p, initialX: Number(value.x), initialY: Number(value.y), before: JSON.stringify(this.map),
        resize: true, width: Number(value.width), height: Number(value.height) };
      this.svg().setPointerCapture(event.pointerId); return;
    }
    if (event.altKey) this.tool = 'select';
    if (this.tool === 'select') {
      const target = (event.target as Element).closest('[data-object]');
      this.selected = target ? { kind: target.getAttribute('data-object') as Selection['kind'], index: Number(target.getAttribute('data-index')) } : undefined;
      const value = this.object();
      if (value) {
        if (this.selected?.kind === 'platform' || value.solid) this.materialAssetId = String(value.assetId ?? DEFAULT_OBJECT_SKINS.platform);
        this.drag = { ...p, initialX: Number(value.x), initialY: Number(value.y), before: JSON.stringify(this.map),
          width: Number(value.width ?? 0), height: Number(value.height ?? 0) };
        this.svg().setPointerCapture(event.pointerId);
      }
    } else {
      if ((this.tool === 'platform' && l.platforms.length >= 200) || (this.tool === 'coin' && l.coins.length >= 300) || (this.tool === 'enemy' && l.enemies.length >= 40) || (this.tool === 'decoration' && (this.map.decorations?.length ?? 0) >= 200)) {
        this.message('已达到该类对象数量上限。'); return;
      }
      if (this.tool === 'decoration') {
        const asset = mapAssets(this.map).find((item) => item.id === this.assetId);
        if (!asset) { this.message('请先上传或选择素材'); return; }
        this.remember();
        const placed = this.placement(p);
        (this.map.decorations ??= []).push({ assetId: asset.id, x: placed.x, y: placed.y,
          width: placed.width!, height: placed.height!, solid: false });
        this.selected = { kind: 'decoration', index: this.map.decorations.length - 1 };
        this.render(); return;
      }
      this.remember();
      const placed = this.placement(p); const { x, y } = placed;
      if (this.tool === 'platform') { l.platforms.push({ id: this.nextObjectId(), x, y, width: placed.width!, height: placed.height!, kind: 'platform', assetId: this.assetId }); this.selected = { kind: 'platform', index: l.platforms.length - 1 }; }
      else if (this.tool === 'coin') { l.coins.push({ x, y, assetId: this.assetId }); this.selected = { kind: 'coin', index: l.coins.length - 1 }; }
      else if (this.tool === 'enemy') { l.enemies.push({ x, y, min: Math.max(0, x - 80), max: Math.min(l.width, x + 80), speed: 70, assetId: this.assetId }); this.selected = { kind: 'enemy', index: l.enemies.length - 1 }; }
      else { Object.assign(l[this.tool], { ...placed, assetId: this.assetId }); this.selected = { kind: this.tool, index: 0 }; }
    }
    this.render();
  }
  private pointerMove(event: PointerEvent): void {
    if (this.pan) {
      const workspace = this.root.querySelector('.workspace')!;
      workspace.scrollLeft = this.pan.left + this.pan.x - event.clientX;
      workspace.scrollTop = this.pan.top + this.pan.y - event.clientY; return;
    }
    if (!this.drag) {
      this.preview = this.position(event);
      if (!this.previewFrame) this.previewFrame = requestAnimationFrame(() => { this.previewFrame = 0; if (this.root.isConnected) this.drawPreview(); });
      return;
    }
    const value = this.object(); if (!value || !this.selected) return;
    const p = this.position(event);
    if (this.drag.resize) {
      Object.assign(value, resizeObjectOnGrid(this.selected.kind, { x: this.drag.initialX, y: this.drag.initialY,
        width: this.drag.width, height: this.drag.height }, p.x - this.drag.x, p.y - this.drag.y, this.map.level.width));
      this.scheduleCanvas(); return;
    }
    const oldX = Number(value.x);
    Object.assign(value, snapObjectToGrid(this.selected.kind, { ...value,
      x: this.drag.initialX + p.x - this.drag.x, y: this.drag.initialY + p.y - this.drag.y } as GridObject, this.map.level.width));
    this.drag.resized = Number(value.width ?? 0) !== this.drag.width || Number(value.height ?? 0) !== this.drag.height;
    if (this.selected?.kind === 'enemy') {
      const dx = Number(value.x) - oldX;
      value.min = Math.max(0, Number(value.min) + dx);
      value.max = Math.min(this.map.level.width, Number(value.max) + dx);
    }
    this.scheduleCanvas();
  }
  private endDrag(cancel = false): void {
    this.pan = undefined;
    if (!this.drag) return;
    cancelAnimationFrame(this.renderFrame); this.renderFrame = 0;
    const changed = this.drag.before !== JSON.stringify(this.map);
    if (cancel) this.map = JSON.parse(this.drag.before);
    else if (changed) this.remember(this.drag.before);
    if (!cancel && changed && this.drag.resize) this.rememberPlatformBrush();
    this.drag = undefined; this.render();
  }
  private renderCanvas(): void {
    const l = this.map.level;
    const svg = this.svg(); svg.setAttribute('viewBox', `0 0 ${l.width} 540`);
    svg.setAttribute('width', String(l.width)); svg.setAttribute('height', '540');
    let html = `<defs><pattern id="map-grid" width="${EDITOR_GRID}" height="${EDITOR_GRID}" patternUnits="userSpaceOnUse"><path d="M${EDITOR_GRID} 0H0V${EDITOR_GRID}" fill="none" stroke="#9abb9a" stroke-width=".5"/></pattern></defs>`;
    svg.style.background = SCENE_PALETTES[this.map.scene?.theme ?? 'forest'].sky[0];
    const library = mapAssets(this.map);
    for (const asset of library) ensureAssetGeometry(asset.data, this.refreshGeometry);
    html += `<g data-scene-background pointer-events="none">${this.sceneBackgroundMarkup()}</g>`;
    html += `<rect width="${l.width}" height="540" fill="url(#map-grid)" opacity="0.65" pointer-events="none"/>`;
    const selected = (kind: string, index: number) => this.selected?.kind === kind && this.selected.index === index ? '#e69c31' : '#416b59';
    const decorations = (layer: 'back' | 'front'): string => (this.map.decorations ?? []).map((p, i) => {
      if ((p.solid ? 'back' : p.layer ?? 'back') !== layer) return '';
      if (p.solid) return skin('decoration', i, p, p.x, p.y, p.width, p.height, true);
      const asset = library.find((item) => item.id === p.assetId); if (!asset) return '';
      return `<g data-object="decoration" data-index="${i}"><image href="${asset.data}" x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" preserveAspectRatio="none"/><rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="transparent" stroke="${selected('decoration', i)}" stroke-width="1"/></g>`;
    }).join('');
    const skin = (kind: string, index: number, value: { assetId?: string; x: number; y: number }, x: number, y: number, width: number, height: number, solid = kind === 'platform'): string => {
      const asset = library.find((item) => item.id === (value.assetId ?? DEFAULT_OBJECT_SKINS[kind]));
      if (!asset) return '';
      const geometry = cachedAssetGeometry(asset.data);
      const layout = geometry ? assetLayout(geometry, x, y, width, height, solid) : { x, y, width, height };
      const picture = geometry && solid ? platformSvg(asset.data, geometry, materialFor(asset.id, this.map.platformMaterials), x, y, width, height) : geometry
        ? `<svg x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" viewBox="${geometry.x} ${geometry.y} ${geometry.width} ${geometry.height}" preserveAspectRatio="none"><image href="${asset.data}" width="${geometry.sourceWidth}" height="${geometry.sourceHeight}"/></svg>`
        : `<image href="${asset.data}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;
      const isSelected = this.selected?.kind === kind && this.selected.index === index;
      const hit = objectBounds(kind as Selection['kind'], { ...value, width, height });
      return `<g data-object="${kind}" data-index="${index}"><g pointer-events="none">${picture}</g>${solid ? this.platformOutline(x, y, width, height, isSelected) : this.objectOutline(hit.x, hit.y, hit.width, hit.height, isSelected)}</g>`;
    };
    html += decorations('back');
    l.platforms.forEach((p, i) => { html += skin('platform', i, p, p.x, p.y, Math.max(1, p.width), Math.max(1, p.height)); });
    l.coins.forEach((coin, i) => {
      const p = Array.isArray(coin) ? { x: coin[0], y: coin[1] } : coin;
      const r = visualBounds('coin', p); html += skin('coin', i, p, r.x, r.y, r.width, r.height);
    });
    l.enemies.forEach((p, i) => { const r = visualBounds('enemy', p); html += `<path d="M${p.min} ${p.y - 10}H${p.max}" stroke="#e19c85" stroke-dasharray="6 4"/>` + skin('enemy', i, p, r.x, r.y, r.width, r.height); });
    html += decorations('front');
    for (const [kind, label, color] of [['spawn', '出生', '#68bddd'], ['checkpoint', '检查点', '#b6a0d7'], ['flag', '终点', '#ecb84f']] as const) {
      const p = l[kind]; const flag = kind === 'flag';
      html += skin(kind, 0, p, p.x, p.y - (flag ? 0 : 64), flag ? l.flag.width : 32, flag ? l.flag.height : 64);
      html += `<text x="${p.x + 3}" y="${p.y - (flag ? 8 : 72)}" font-size="14" fill="${color}" stroke="#284d3c" stroke-width=".3">${label}</text>`;
    }
    const selectedObject = this.object();
    if (selectedObject && typeof selectedObject.width === 'number' && typeof selectedObject.height === 'number') {
      const x = Number(selectedObject.x), y = Number(selectedObject.y), width = Number(selectedObject.width), height = Number(selectedObject.height);
      html += `<rect data-resize="true" x="${x + width - 8}" y="${y + height - 8}" width="16" height="16" rx="3" fill="#fff2be" stroke="#b47c24" stroke-width="2" style="cursor:nwse-resize"/>`;
    }
    svg.innerHTML = html;
    this.updateSceneParallax();
    this.drawPreview();
  }
  private drawPreview(): void {
    const svg = this.svg();
    svg.querySelector('[data-placement-preview]')?.remove();
    if (!this.preview || this.tool === 'select' || this.drag || this.pan) return;
    const asset = mapAssets(this.map).find((p) => p.id === (this.assetId ?? DEFAULT_OBJECT_SKINS[this.tool]));
    if (!asset) return;
    const placed = this.placement(this.preview);
    const { x, y, width, height } = visualBounds(this.tool, placed);
    const hit = objectBounds(this.tool, placed);
    const bounds = cachedAssetGeometry(asset.data);
    const layout = bounds ? assetLayout(bounds, x, y, width, height, this.tool === 'platform') : { x, y, width, height };
    const picture = bounds && this.tool === 'platform' ? platformSvg(asset.data, bounds, materialFor(asset.id, this.map.platformMaterials), x, y, width, height) : bounds
      ? `<svg x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" preserveAspectRatio="none"><image href="${asset.data}" width="${bounds.sourceWidth}" height="${bounds.sourceHeight}"/></svg>`
      : `<image href="${asset.data}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.placementPreview = ''; g.setAttribute('pointer-events', 'none'); g.setAttribute('opacity', '0.55');
    g.innerHTML = `${picture}<rect x="${hit.x}" y="${hit.y}" width="${hit.width}" height="${hit.height}" fill="none" stroke="#307c63" stroke-dasharray="5 4"/>`;
    svg.append(g);
    if (this.tool === 'platform') {
      const maxJump = Math.floor(PLAYER.JUMP_VELOCITY ** 2 / (2 * PLAYER.NORMAL_GRAVITY));
      const lower = playablePlatforms(this.map).filter((p) => p.y > y && p.x < x + width && p.x + p.width > x).sort((a, b) => a.y - b.y)[0];
      const rise = lower ? Math.round(lower.y - y) : 0;
      this.message(`平台预览 ${Math.round(x)}, ${Math.round(y)} · ${width}×${height}${rise ? ` · 距下方台面 ${rise}px${rise > maxJump ? `，超过最大跳高 ${maxJump}px，请增加台阶` : ''}` : ''}`);
    }
  }
  private render(): void {
    this.renderCanvas();
    this.renderClipboardControls();
    const library = mapAssets(this.map);
    const backgroundSelect = this.root.querySelector<HTMLSelectElement>('[data-scene="background"]')!;
    const libraryChanged = library.length !== this.librarySnapshot.length || library.some((asset, i) =>
      asset.id !== this.librarySnapshot[i]?.id || asset.name !== this.librarySnapshot[i]?.name || asset.data !== this.librarySnapshot[i]?.data);
    if (libraryChanged) {
    const defaults = this.root.querySelector('.default-assets')!; defaults.replaceChildren();
    const uploads = this.root.querySelector('.uploaded-assets')!; uploads.replaceChildren();
    backgroundSelect.replaceChildren(new Option('使用主题背景', ''));
    for (const asset of library) {
      const button = document.createElement('button'); button.dataset.asset = asset.id;
      button.title = asset.id === 'builtin-moss-platform' ? '连续放置可站立平台' : '选择素材并设置放置用途';
      const image = document.createElement('img'); image.src = asset.data; image.width = 40; image.height = 40; image.style.objectFit = 'contain'; image.alt = '';
      const label = document.createElement('span'); label.textContent = asset.name + (asset.id === 'builtin-moss-platform' ? ' · 可站立' : '');
      button.append(image, label); (DEFAULT_ASSETS.some((item) => item.id === asset.id) ? defaults : uploads).append(button);
      backgroundSelect.add(new Option(asset.name, asset.id));
    }
    this.librarySnapshot = library;
    }
    this.root.querySelector<HTMLButtonElement>('[data-action="collisions"]')!.setAttribute('aria-pressed', String(this.showCollisions));
    this.renderMaterialSettings();
    this.root.querySelectorAll<HTMLButtonElement>('[data-asset]').forEach((button) => button.setAttribute('aria-pressed', String(this.assetId === button.dataset.asset)));
    const toolNames: Record<Tool, string> = { select: '选择 / 拖动', platform: '跳跃平台（可站立）', coin: '星星（可收集）', enemy: '敌人', spawn: '出生点', checkpoint: '检查点', flag: '终点', decoration: '装饰（无碰撞）' };
    this.root.querySelector('.tool-status')!.textContent = `当前：${toolNames[this.tool]}${this.tool === 'platform' ? ` · ${this.paintWidth}×${this.paintHeight}` : ''}`;
    this.root.querySelector<HTMLSelectElement>('[data-placement-kind]')!.value = this.tool;
    this.renderSceneControls();
    this.root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tool === this.tool)));
    this.root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = !this.undo.length;
    this.root.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled = !this.redo.length;
    this.root.querySelector<HTMLInputElement>('[data-meta="title"]')!.value = this.map.title;
    this.root.querySelector<HTMLInputElement>('[data-meta="width"]')!.value = String(this.map.level.width);
    this.root.querySelector<HTMLInputElement>('[data-meta="timeLimit"]')!.value = String(this.map.level.timeLimit);
    const inspector = this.root.querySelector<HTMLDivElement>('.inspector')!;
    inspector.replaceChildren(); const value = this.object();
    if (!value) { inspector.textContent = '点击对象查看和编辑属性'; return; }
    const summary = document.createElement('p'); summary.className = 'object-type';
    summary.textContent = this.selected?.kind === 'decoration' ? (value.solid ? '可站立图片平台' : '图片装饰 · 无碰撞') : toolNames[this.selected!.kind];
    if (this.selected?.kind === 'coin' || this.selected?.kind === 'enemy') summary.textContent += ' · 碰撞框 32×32';
    inspector.append(summary);
    const appearanceLabel = document.createElement('label'); appearanceLabel.textContent = '对象外观素材';
    const appearance = document.createElement('select'); appearance.dataset.appearance = '';
    if (this.selected?.kind !== 'decoration') appearance.add(new Option('默认外观', ''));
    for (const asset of mapAssets(this.map)) appearance.add(new Option(asset.name, asset.id));
    appearance.value = String(value.assetId ?? ''); appearanceLabel.append(appearance); inspector.append(appearanceLabel);
    for (const key of ['x', 'y', 'width', 'height', 'min', 'max', 'speed']) {
      if (typeof value[key] !== 'number') continue;
      const label = document.createElement('label');
      const solid = this.selected?.kind === 'platform' || value.solid;
      label.textContent = ({ x: 'X 坐标', y: solid ? 'Y 坐标（站立面）' : 'Y 坐标', width: solid ? '宽度（材质自动拼接）' : '宽度', height: solid ? '厚度（站立面以下）' : '高度', min: '巡逻左边界', max: '巡逻右边界', speed: '移动速度' } as Record<string, string>)[key];
      const input = document.createElement('input'); input.type = 'number'; input.dataset.prop = key; input.value = String(value[key]);
      if (['x', 'y', 'width', 'height'].includes(key)) input.step = String(EDITOR_GRID);
      label.append(input); inspector.append(label);
    }
    if (this.selected?.kind === 'platform') {
      const select = document.createElement('select'); select.dataset.kind = '';
      select.innerHTML = '<option value="platform">浮空平台</option><option value="ground">地面</option>';
      select.value = String(value.kind); inspector.append(select);
    }
    if (this.selected?.kind === 'decoration') {
      const collisionLabel = document.createElement('label'); collisionLabel.textContent = '作为可站立平台';
      const solid = document.createElement('input'); solid.type = 'checkbox'; solid.dataset.solid = ''; solid.checked = value.solid === true;
      collisionLabel.append(solid); inspector.append(collisionLabel);
      const label = document.createElement('label'); label.textContent = '显示图层';
      const select = document.createElement('select'); select.dataset.layer = '';
      select.innerHTML = '<option value="back">后景（角色后方）</option><option value="front">前景（角色前方）</option>';
      select.value = String(value.layer ?? 'back'); label.append(select); inspector.append(label);
    }
    if (this.selected?.kind === 'enemy') {
      const label = document.createElement('label'); label.textContent = '远程攻击';
      const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.remote = ''; input.checked = !!value.attack;
      label.append(input); inspector.append(label);
    }
    const button = document.createElement('button'); button.dataset.action = 'properties'; button.textContent = '应用对象属性'; inspector.append(button);
  }
  private sameScene(a: SceneSettings = DEFAULT_SCENE, b: SceneSettings = DEFAULT_SCENE): boolean {
    return a.theme === b.theme && a.backgroundAssetId === b.backgroundAssetId
      && a.backgroundMode === b.backgroundMode && a.parallax === b.parallax;
  }
  private applySceneSettings(source?: HTMLElement): boolean {
    const field = (name: string) => this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-scene="${name}"]`)!;
    const slider = this.root.querySelector<HTMLInputElement>('[data-parallax-slider]')!;
    const fromSlider = source?.dataset.parallaxSlider !== undefined;
    const raw = fromSlider ? slider.value : field('parallax').value;
    const parallax = Number(raw);
    const theme = field('theme').value as SceneSettings['theme'];
    const backgroundMode = field('mode').value as SceneSettings['backgroundMode'];
    const backgroundAssetId = field('background').value || undefined;
    try {
      if (!raw.trim() || !Number.isFinite(parallax) || parallax < 0 || parallax > 1)
        throw new Error('背景视差需为 0～1 的数值；无效输入不会覆盖当前预览。');
      if (!Object.hasOwn(SCENE_PALETTES, theme) || !['stretch', 'repeat'].includes(backgroundMode))
        throw new Error('场景主题或背景显示模式无效');
      if (backgroundAssetId && !mapAssets(this.map).some((asset) => asset.id === backgroundAssetId))
        throw new Error('背景素材不存在，请重新选择');
      const settings: SceneSettings = { theme, backgroundAssetId, backgroundMode, parallax };
      if (!this.sameScene(this.map.scene, settings)) {
        const previous = this.map.scene ?? DEFAULT_SCENE;
        const parallaxOnly = previous.theme === theme && previous.backgroundAssetId === backgroundAssetId && previous.backgroundMode === backgroundMode;
        this.sceneEditBefore ??= JSON.stringify(this.map);
        this.map.scene = settings;
        // 只更新背景节点，避免重建对象、丢失选中状态、表单焦点或画布滚动位置。
        this.renderSceneBackground(parallaxOnly);
      }
      slider.value = String(parallax);
      if (fromSlider) field('parallax').value = String(parallax);
      field('mode').disabled = !backgroundAssetId;
      this.sceneStatus(`实时预览 · ${SCENE_PALETTES[theme].name}${backgroundAssetId ? ' / 自定义背景' : ''} · 视差 ${parallax}`);
      return true;
    } catch (error) {
      const text = error instanceof Error ? error.message : '场景设置无效';
      this.sceneStatus(text, true); this.message(text); return false;
    }
  }
  private sceneStatus(text: string, invalid = false): void {
    const status = this.root.querySelector<HTMLElement>('.scene-preview-status')!;
    status.textContent = text; status.classList.toggle('invalid', invalid);
  }
  private commitSceneEdit(): void {
    if (!this.sceneEditBefore) return;
    const before = this.sceneEditBefore; this.sceneEditBefore = undefined;
    const previous = JSON.parse(before) as CustomMap;
    if (this.sameScene(previous.scene, this.map.scene)) {
      if (previous.scene) this.map.scene = previous.scene;
      else delete this.map.scene;
      return;
    }
    this.remember(before);
    const undo = this.root.querySelector<HTMLButtonElement>('[data-action="undo"]');
    const redo = this.root.querySelector<HTMLButtonElement>('[data-action="redo"]');
    if (undo) undo.disabled = false;
    if (redo) redo.disabled = true;
  }
  private renderSceneControls(): void {
    const scene = this.map.scene ?? DEFAULT_SCENE;
    for (const [name, value] of Object.entries({ theme: scene.theme, background: scene.backgroundAssetId ?? '', mode: scene.backgroundMode, parallax: scene.parallax })) {
      this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-scene="${name}"]`)!.value = String(value);
    }
    this.root.querySelector<HTMLInputElement>('[data-parallax-slider]')!.value = String(scene.parallax);
    this.root.querySelector<HTMLSelectElement>('[data-scene="mode"]')!.disabled = !scene.backgroundAssetId;
    this.sceneStatus(`实时预览 · ${SCENE_PALETTES[scene.theme].name}${scene.backgroundAssetId ? ' / 自定义背景' : ''} · 视差 ${scene.parallax}`);
  }
  private sceneBackgroundMarkup(): string {
    const settings = this.map.scene ?? DEFAULT_SCENE;
    const background = mapAssets(this.map).find((asset) => asset.id === settings.backgroundAssetId);
    const measured = background && cachedAssetGeometry(background.data);
    const image = background && measured ? { ...background, width: measured.sourceWidth, height: measured.sourceHeight } : background;
    return sceneBackdropSvg(settings, this.map.level.width, image);
  }
  private renderSceneBackground(parallaxOnly = false): void {
    const svg = this.svg(); const background = svg.querySelector('[data-scene-background]');
    const settings = this.map.scene ?? DEFAULT_SCENE;
    const layers = svg.querySelectorAll<SVGGElement>('[data-preview-parallax]');
    const factors = settings.backgroundAssetId ? [settings.parallax] : backdropLayers(settings.theme, settings.parallax).map((l) => l.parallax);
    if (parallaxOnly && layers.length === factors.length) {
      layers.forEach((layer, i) => layer.setAttribute('data-preview-parallax', String(factors[i])));
    } else if (background) background.innerHTML = this.sceneBackgroundMarkup();
    svg.style.background = SCENE_PALETTES[this.map.scene?.theme ?? 'forest'].sky[0];
    this.updateSceneParallax();
  }
  private updateSceneParallax(): void {
    const svg = this.svg();
    const box = svg.getBoundingClientRect();
    if (box.width <= 0) return;
    const viewport = this.root.querySelector('.workspace')!.getBoundingClientRect();
    const cameraX = Math.max(0, (viewport.left - box.left) * this.map.level.width / box.width);
    svg.querySelectorAll<SVGGElement>('[data-preview-parallax]').forEach((layer) => {
      const factor = Number(layer.getAttribute('data-preview-parallax'));
      layer.setAttribute('transform', `translate(${cameraX * (1 - factor)} 0)`);
    });
  }
  private platformOutline(x: number, y: number, width: number, height: number, selected: boolean): string {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${this.showCollisions ? '#42a38418' : 'transparent'}" stroke="${selected ? '#e69c31' : this.showCollisions ? '#42a384' : 'none'}" stroke-width="1.5"/>`
      + (this.showCollisions ? `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="#249172" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>` : '');
  }
  private objectOutline(x: number, y: number, width: number, height: number, selected: boolean): string {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="transparent" stroke="${selected ? '#e69c31' : this.showCollisions ? '#42a384' : 'none'}" stroke-width="2"/>`;
  }
  private renderMaterialSettings(): void {
    const library = mapAssets(this.map);
    if (!library.some((a) => a.id === this.materialAssetId)) this.materialAssetId = DEFAULT_OBJECT_SKINS.platform;
    const select = this.root.querySelector<HTMLSelectElement>('[data-material="asset"]')!;
    if (select.options.length !== library.length || library.some((a, i) => select.options[i]?.value !== a.id)) {
      select.replaceChildren(...library.map((a) => new Option(a.name, a.id)));
    }
    select.value = this.materialAssetId;
    const material = materialFor(this.materialAssetId, this.map.platformMaterials);
    const asset = library.find((a) => a.id === this.materialAssetId)!;
    const g = cachedAssetGeometry(asset.data);
    this.root.querySelector<HTMLSelectElement>('[data-material="mode"]')!.value = material.mode;
    for (const field of ['surfaceY', 'leftCap', 'rightCap'] as const) {
      const value = material[field] ?? (g ? g.surfaceY / g.sourceHeight : 0);
      this.root.querySelector<HTMLInputElement>(`[data-material="${field}"]`)!.value = String(Math.round(value * 1000) / 10);
    }
  }
}
