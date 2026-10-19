import Phaser from 'phaser';
import { SCENE } from '../config/constants';
import { DRAFT_KEY, newMap, parseCustomMap, playablePlatforms, validateMapWidth, type CustomMap, type MapAsset, type SceneSettings, type SceneLayer } from '../systems/CustomMap';
import { PLAYER } from '../config/constants';
import type { EnemyData } from '../types/game';
import { mapAssets, DEFAULT_ASSETS, DEFAULT_OBJECT_SKINS } from '../systems/DefaultAssets';
import { assetLayout, cachedAssetGeometry, ensureAssetGeometry } from '../systems/AssetGeometry';
import { materialFor, platformSvg } from '../systems/PlatformMaterial';
import { EDITOR_GRID, objectBounds, visualBounds, snapObjectToGrid, resizeObjectOnGrid, type GridObject } from '../systems/ObjectGeometry';
import { DEFAULT_SCENE, SCENE_PALETTES, backdropLayers, sceneBackdropSvg } from '../systems/SceneBackdrop';
import { forestLayerPreset, sceneLayersSvg } from '../systems/SceneLayers';
import { EditorDraftStore, RECOVERY_KEY } from '../systems/EditorDraftStore';
import { editorZoom, heightFillZoom, anchoredZoomScroll, centeredObjectScroll } from '../systems/EditorViewport';
import { worldCameraView } from '../systems/CameraViewport';
import { allSelections, boxSelections, selectionItems, itemsBounds, translatedSelection, writeSelection, type SelectionItem } from '../systems/EditorSelection';
import { EditorDocument } from '../systems/EditorDocument';
import { createEditorCommand, applyEditorCommand, trimEditorHistory, type EditorCommand } from '../systems/EditorHistory';
import './editor.css';

type Tool = 'select' | 'platform' | 'coin' | 'enemy' | 'spawn' | 'checkpoint' | 'flag' | 'decoration';
type Selection = { kind: Exclude<Tool, 'select'>; index: number };
type CopyableKind = 'platform' | 'coin' | 'enemy' | 'decoration';
type ObjectCopy = { kind: CopyableKind; value: Record<string, unknown> };
type SelectionCopy = ObjectCopy | { kind: 'batch'; items: ObjectCopy[] };
type FormGroup = 'properties' | 'meta' | 'material';
type SidebarPanel = 'place' | 'assets' | 'scene' | 'map';
type EditorViewMode = 'height' | 'manual' | 'overview' | 'game';
const DEFAULT_PLATFORM_SIZE = { width: 160, height: 32 };
export class EditorScene extends Phaser.Scene {
  private root!: HTMLDivElement;
  private map: CustomMap = newMap();
  private tool: Tool = 'select';
  private selected?: Selection;
  private selections?: Selection[];
  private marquee?: { x: number; y: number; endX: number; endY: number; previous: Selection[]; additive: boolean; moved: boolean };
  private assetId?: string;
  private refreshGeometry = (): void => {
    if (this.root?.isConnected && !this.drag && !this.marquee) {
      this.renderCanvas();
      if (!this.root.querySelector('[data-material]:focus') && !this.pendingForms?.has('material')) this.renderMaterialSettings();
    }
  };
  private undo: EditorCommand[] = [];
  private redo: EditorCommand[] = [];
  private document?: EditorDocument;
  private historyBefore?: string;
  private eventsAbort!: AbortController;
  private drag?: { x: number; y: number; initialX: number; initialY: number; before: string; resize?: boolean; width: number; height: number; resized?: boolean; batch?: SelectionItem[] };
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
  private clipboard?: SelectionCopy & { pastes: number };
  private objectSerial = 0;
  private selectedLayerId?: string;
  private draftStore?: EditorDraftStore;
  private draftReady = false;
  private savedSnapshot?: string;
  private savedRevision: string | null = null;
  private hasSavedDraft = false;
  private backupSnapshot?: string;
  private observedSnapshot?: string;
  private backupTimer?: ReturnType<typeof setTimeout>;
  private saveError?: string;
  private backupError?: string;
  private saving = false;
  private pendingForms = new Set<FormGroup>();
  private editorZoom = 1;
  private editorViewMode: EditorViewMode = 'height';
  private canvasFullscreen = false;
  private normalViewport?: { mode: EditorViewMode; zoom: number; left: number; top: number };
  private viewportFrame = 0;
  private viewportResizePending = false;
  private sidebarPanel: SidebarPanel = 'place';
  private inspectorMode: 'object' | 'layer' = 'object';
  constructor() { super(SCENE.EDITOR); }
  create(): void {
    this.selected = undefined; this.selections = undefined; this.marquee = undefined; this.tool = 'select';
    this.preview = undefined; this.spaceHeld = false; this.drag = undefined; this.pan = undefined; this.librarySnapshot = [];
    this.sceneEditBefore = undefined; this.backgroundFrame = 0;
    this.clipboard = undefined;
    this.sidebarPanel = 'place'; this.inspectorMode = 'object';
    this.editorViewMode = 'height'; this.canvasFullscreen = false; this.normalViewport = undefined;
    this.viewportFrame = 0; this.viewportResizePending = false;
    this.resetPlatformBrush();
    const notice = this.loadDraft();
    this.pendingForms = new Set();
    this.eventsAbort = new AbortController();
    this.root = document.createElement('div');
    this.root.className = 'map-editor';
    this.root.innerHTML = `<header><h1>✦ 星光地图工坊</h1>
      <button data-action="home">返回主页</button><button data-action="undo">撤销</button><button data-action="redo">重做</button>
      <button data-action="save">保存草稿</button><button data-action="export">导出地图</button><button data-action="import">导入地图</button>
      <button data-action="collisions" aria-pressed="false">碰撞辅助线</button>
      <button data-action="play">▶ 试玩</button><span class="draft-status" data-draft-status role="status" aria-live="polite"></span>
      <span class="history-status" data-history-status></span>
      <div class="viewport-tools" role="group" aria-label="画布视图">
      <button data-action="view-out" aria-label="缩小画布">−</button><output data-editor-zoom aria-label="画布缩放比例">100%</output>
      <button data-action="view-in" aria-label="放大画布">＋</button><button data-action="view-reset">100%</button>
      <button data-action="view-height" title="等比铺满可用高度，长地图横向浏览" aria-pressed="true">铺满高度</button>
      <button data-action="view-game" title="按照当前窗口实际游玩相机的可视范围等比显示" aria-pressed="false">游玩视野</button>
      <button data-action="view-fit" title="缩小查看整张地图" aria-pressed="false">整图总览</button><button data-action="view-focus">定位对象</button><button data-action="view-start">回到出生点</button>
      <button data-action="view-fullscreen" aria-pressed="false" title="收起菜单，铺满应用内画布；Esc 退出">全屏画布</button></div></header>
      <div class="draft-warning" data-draft-warning role="status" hidden></div>
      <div class="pending-notice" data-pending-notice hidden>有未应用的属性；请先应用或取消，再切换对象、保存或离开。
      <button data-action="apply-pending">应用全部待提交设置</button><button data-action="discard-fields">取消待提交设置</button></div>
      <main><aside class="left-sidebar" aria-label="编辑工具">
      <div class="tool-dock"><div class="tools" role="group" aria-label="常用工具">
      <button data-tool="select" title="选择与拖动对象">↖ 选择</button><button data-tool="platform" title="连续放置可站立跳台">▰ 平台</button>
      <button data-tool="coin" title="连续放置可收集星星">✦ 星星</button><button data-tool="enemy" title="连续放置敌人">◉ 敌人</button></div>
      <p class="tool-status" aria-live="polite"></p>
      <button class="brush-reset" data-action="reset-platform-size" title="仅恢复后续跳台为 160×32，不修改已放置对象" hidden>重置跳台尺寸</button></div>
      <div class="sidebar-tabs" role="tablist" aria-label="编辑分类">
      ${(['place', 'assets', 'scene', 'map'] as const).map((panel, index) => `<button role="tab" id="editor-tab-${panel}" data-editor-tab="${panel}" aria-controls="editor-panel-${panel}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${['放置', '素材', '场景', '地图'][index]}</button>`).join('')}
      </div><div class="sidebar-panels">
      <section class="editor-panel" id="editor-panel-place" data-editor-panel="place" role="tabpanel" aria-labelledby="editor-tab-place">
      <h2>关卡标记</h2><div class="marker-tools" role="group" aria-label="关卡标记">
      <button data-tool="spawn">出生点</button><button data-tool="checkpoint">检查点</button><button data-tool="flag">终点</button></div>
      <p class="hint">选择工具后点击画布，支持连续放置。</p>
      <button class="panel-link" data-editor-tab="assets" data-panel-shortcut>＋ 添加装饰 / 上传素材</button>
      <details class="editor-details"><summary>操作帮助</summary>
      <p class="hint">空白拖框多选，Shift 点选增减；拖动已选对象整体移动。Esc 结束放置，空格拖动画布，Ctrl＋滚轮缩放。</p>
      <p class="hint">Ctrl+C/V 复制粘贴，Delete 删除，Ctrl+Z 撤销；方向键移动，Shift＋方向键移动四格。操作框按 16px 网格吸附。</p></details>
      </section>
      <section class="editor-panel" id="editor-panel-assets" data-editor-panel="assets" role="tabpanel" aria-labelledby="editor-tab-assets" hidden>
      <div class="panel-heading"><h2>装饰与自定义素材</h2><button data-action="upload">＋ 上传</button></div>
      <div class="default-assets assets" aria-label="默认装饰"></div><div class="uploaded-assets assets" aria-label="上传素材"></div>
      <p class="hint" data-assets-empty>上传 PNG / JPEG / WebP，即可连续放置。</p>
      <label data-asset-purpose hidden>选中素材的用途<select data-placement-kind><option value="decoration">装饰（无碰撞）</option><option value="platform">可站立平台</option><option value="coin">可收集星星</option><option value="enemy">敌人</option><option value="checkpoint">检查点</option></select></label>
      <details class="editor-details"><summary>高级 · 平台材质校准</summary>
      <p class="hint">仅当素材站立面不匹配时调整；使用顶部碰撞辅助线检查。</p>
      <label>要调整的素材<select data-material="asset"></select></label>
      <label>铺设方式<select data-material="mode"><option value="repeat">收边＋镜像重复中段</option><option value="stretch">整图拉伸（兼容旧素材）</option></select></label>
      <label>站立线（原图高度 %）<input data-material="surfaceY" type="number" min="0" max="99" step="0.1"></label>
      <label>左收边（内容宽度 %）<input data-material="leftCap" type="number" min="0" max="40" step="1"></label>
      <label>右收边（内容宽度 %）<input data-material="rightCap" type="number" min="0" max="40" step="1"></label>
      <button data-action="material">应用材质</button><button data-action="material-reset">恢复默认材质</button>
      <p class="hint">对使用此素材的所有平台生效，不影响装饰。</p></details>
      </section>
      <section class="editor-panel" id="editor-panel-scene" data-editor-panel="scene" role="tabpanel" aria-labelledby="editor-tab-scene" hidden>
      <h2>背景与图层</h2>
      <label>场景主题<select data-scene="theme"><option value="forest">绘本森林</option><option value="snow">雪地</option><option value="desert">沙漠</option><option value="night">星空夜晚</option></select></label>
      <p class="scene-preview-status" role="status" aria-live="polite"></p>
      <section class="scene-layer-panel" aria-label="场景图层">
      <div class="layer-actions"><button data-action="layer-add">＋ 图层</button><button data-action="layer-preset" title="替换视觉图层，不改变关卡对象">森林预设</button></div>
      <div class="scene-layer-list" role="list" aria-label="图层列表"></div>
      <p class="hint">点选图层在右侧编辑；拖动列表调整顺序。</p>
      </section><details class="editor-details"><summary>添加背景素材</summary><div class="scene-assets assets"></div></details>
      <details class="editor-details"><summary>高级 · 基础背景</summary>
      <label>基础背景<select data-scene="baseMode"><option value="theme">保留主题图形</option><option value="sky">仅渐变天空（适合分层素材）</option></select></label>
      <label>自定义背景<select data-scene="background"><option value="">使用主题背景</option></select></label>
      <label>背景显示<select data-scene="mode"><option value="stretch">拉伸覆盖地图</option><option value="repeat">按高度适配并横向平铺</option></select></label>
      <label>背景视差 <output data-parallax-value></output><input data-parallax-slider type="range" min="0" max="1" step="0.05" aria-label="背景视差，0 固定，1 跟随地图"></label>
      <input data-scene="parallax" type="hidden">
      <p class="hint">背景修改即时预览，统一用顶部「保存草稿」保存。主题不自动替换已添加的图片图层。</p></details>
      </section>
      <section class="editor-panel" id="editor-panel-map" data-editor-panel="map" role="tabpanel" aria-labelledby="editor-tab-map" hidden>
      <h2>地图设置</h2><label>标题<input data-meta="title" maxlength="60"></label>
      <label>地图宽度<input data-meta="width" type="number" min="960" step="16"></label>
      <p class="hint">至少 960px，不设固定上限。</p>
      <label>时间限制（秒）<input data-meta="timeLimit" type="number" min="30" max="600"></label>
      <button data-action="meta">应用设置</button><details class="editor-details"><summary>新建地图</summary><p class="hint">替换当前地图，可撤销。建议先保存或导出。</p><button data-action="new" class="danger">新建空白地图</button></details>
      </section></div></aside><div class="workspace"><svg xmlns="http://www.w3.org/2000/svg" aria-label="地图编辑画布，选择对象后可复制、粘贴和删除" role="img" tabindex="0"></svg></div>
      <aside class="property-sidebar" aria-label="属性面板">
      <section data-inspector="layer" hidden><h2>图层属性 · 实时预览</h2><div class="layer-inspector"></div></section>
      <section data-inspector="object"><h2>对象属性</h2><div class="inspector"></div>
      <div class="object-actions"><button data-action="copy" title="Ctrl+C">复制</button><button data-action="paste" title="Ctrl+V">粘贴</button><button data-action="delete" class="danger" title="Delete">删除</button></div>
      <details class="editor-details"><summary>更多选择操作</summary><button data-action="select-all">全选 · Ctrl+A</button><button data-action="clear-selection">取消选择 · Esc</button><button data-action="duplicate">创建副本 · Ctrl+D</button></details>
      </section></aside></main>
      <footer role="status" aria-live="polite">欢迎创作：先放平台，再设置出生点与终点。</footer>
      <input class="file" type="file" accept=".json,application/json" hidden>
      <input class="asset-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
    document.body.append(this.root);
    const options = { signal: this.eventsAbort.signal };
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button');
      if (!button) return;
      if (this.drag || this.marquee || this.pan) { this.message('请先结束当前拖动或框选。'); return; }
      this.commitSceneEdit();
      if (button.dataset.editorTab) { this.switchSidebar(button.dataset.editorTab as SidebarPanel); return; }
      if (this.pendingForms.size && !button.dataset.action) { this.pendingMessage(); return; }
      if (button.dataset.layerSelect) {
        this.showInspector('layer');
        this.selectedLayerId = button.dataset.layerSelect; this.renderSceneLayerControls(); this.focusSceneLayer();
      }
      else if (button.dataset.sceneAsset) {
        try { this.editSceneLayer('layer-add', button.dataset.sceneAsset); }
        catch (error) { this.message(error instanceof Error ? error.message : '添加图层失败'); }
      }
      else if (button.dataset.asset) {
        this.showInspector('object');
        this.assetId = button.dataset.asset;
        this.materialAssetId = this.assetId;
        this.tool = ({ 'builtin-moss-platform': 'platform', 'builtin-gold-star': 'coin', 'builtin-leaf-slime': 'enemy', 'builtin-lantern-marker': 'checkpoint' } as Record<string, Tool>)[this.assetId] ?? 'decoration';
        this.render();
      }
      else if (button.dataset.tool) { this.showInspector('object'); this.tool = button.dataset.tool as Tool; this.assetId = undefined; this.render(); }
      else {
        if (button.dataset.layerTarget) this.selectedLayerId = button.dataset.layerTarget;
        this.action(button.dataset.action ?? '');
      }
    }, options);
    this.root.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      this.noteFormInput(input);
      if (input.dataset.layerField) this.applyLayerField(input);
    }, options);
    this.root.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      this.noteFormInput(input);
      if (!input.dataset.layerField) return;
      this.applyLayerField(input); this.commitSceneEdit(); this.renderSceneLayerControls();
    }, options);
    this.root.addEventListener('focusout', (event) => {
      if ((event.target as HTMLElement).dataset.layerField) this.commitSceneEdit();
    }, options);
    this.root.addEventListener('dragstart', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-row]');
      if (!row || row.draggable === false) return;
      event.dataTransfer?.setData('application/x-star-scene-layer', row.dataset.layerRow!);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }, options);
    this.root.addEventListener('dragover', (event) => {
      if ((event.target as HTMLElement).closest('[data-layer-row]') && event.dataTransfer?.types.includes('application/x-star-scene-layer')) event.preventDefault();
    }, options);
    this.root.addEventListener('drop', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-row]');
      const source = event.dataTransfer?.getData('application/x-star-scene-layer');
      if (!row || !source) return;
      event.preventDefault(); this.commitSceneEdit(); this.reorderSceneLayer(source, row.dataset.layerRow!);
    }, options);
    const svg = this.svg();
    const layoutRoot = this.root;
    const viewportObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(() => this.scheduleViewportRefresh(layoutRoot)) : undefined;
    viewportObserver?.observe(this.root.querySelector('.workspace')!);
    window.addEventListener('resize', () => this.scheduleViewportRefresh(layoutRoot), options);
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
    this.root.querySelector('.workspace')!.addEventListener('wheel', (raw) => {
      const event = raw as WheelEvent;
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (this.drag || this.pan || this.marquee) return;
      this.setEditorZoom(this.editorZoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), { x: event.clientX, y: event.clientY });
    }, { ...options, passive: false });
    this.root.querySelector<HTMLSelectElement>('[data-material="asset"]')!.addEventListener('change', (event) => {
      if (this.pendingForms.size) {
        (event.target as HTMLSelectElement).value = this.materialAssetId; this.pendingMessage(); return;
      }
      this.materialAssetId = (event.target as HTMLSelectElement).value; this.renderMaterialSettings();
    }, options);
    svg.addEventListener('pointerdown', (event) => this.pointerDown(event), options);
    svg.addEventListener('pointermove', (event) => this.pointerMove(event), options);
    svg.addEventListener('pointerup', () => this.endDrag(), options);
    svg.addEventListener('pointercancel', () => this.endDrag(true), options);
    svg.addEventListener('pointerleave', () => { if (!this.drag && !this.pan && !this.marquee) { this.preview = undefined; this.drawPreview(); } }, options);
    svg.addEventListener('contextmenu', (event) => { event.preventDefault(); if (this.pendingForms.size) { this.pendingMessage(); return; } this.endDrag(true); this.tool = 'select'; this.preview = undefined; this.render(); }, options);
    this.root.querySelector<HTMLSelectElement>('[data-placement-kind]')!.addEventListener('change', (event) => {
      if (this.pendingForms.size) { (event.target as HTMLSelectElement).value = this.tool; this.pendingMessage(); return; }
      this.tool = (event.target as HTMLSelectElement).value as Tool; this.render();
    }, options);
    document.addEventListener('keydown', (event) => this.handleKeyDown(event), options);
    document.addEventListener('keyup', (event) => { if (event.code === 'Space') this.spaceHeld = false; }, options);
    window.addEventListener('blur', () => { this.spaceHeld = false; this.endDrag(true); this.commitSceneEdit(); this.flushRecovery(); }, options);
    window.addEventListener('beforeunload', (event) => {
      this.flushRecovery();
      if (this.hasUnsavedChanges() || this.pendingForms.size || this.saveError || this.backupError) { event.preventDefault(); event.returnValue = ''; }
    }, options);
    window.addEventListener('storage', (event) => {
      if (event.key !== null && event.key !== DRAFT_KEY && event.key !== RECOVERY_KEY) return;
      if (event.oldValue === event.newValue) return;
      this.backupSnapshot = undefined;
      this.backupError = '其他页面更新了草稿或备份。当前地图未被替换，请导出后刷新核对。';
      this.renderDraftStatus(); this.message(this.backupError);
    }, options);
    window.addEventListener('pagehide', () => this.flushRecovery(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flushRecovery(); }, options);
    this.root.querySelector<HTMLInputElement>('.file')!.addEventListener('change', async (event) => {
      const editorRoot = this.root;
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 3 * 1024 * 1024) throw new Error('地图文件不能超过 3MB');
        const parsed = parseCustomMap(JSON.parse(await file.text()), false);
        if (this.root !== editorRoot || !editorRoot.isConnected) return;
        if (!this.confirmReplacement()) return;
        this.endDrag(true);
        this.remember(); this.map = parsed; this.setSelection([]);
        this.clipboard = undefined;
        this.resetPlatformBrush();
        this.render(); this.message('地图已导入，可继续编辑；试玩前会检查出生点、平台和终点。');
      } catch (error) { if (this.root === editorRoot && editorRoot.isConnected) this.message(error instanceof Error ? error.message : '导入失败'); }
      input.value = '';
    }, options);
    this.root.querySelector<HTMLInputElement>('.asset-file')!.addEventListener('change', async (event) => {
      const editorRoot = this.root;
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
        if (this.root !== editorRoot || !editorRoot.isConnected) return;
        if (this.pendingForms.size) { this.pendingMessage(); return; }
        this.endDrag(true);
        this.remember(); this.assetId = `asset-${Date.now()}`;
        (this.map.assets ??= []).push({ id: this.assetId, name: file.name.slice(0, 100), data, width: canvas.width, height: canvas.height });
        this.tool = 'decoration'; this.sidebarPanel = 'assets'; this.showInspector('object');
        this.render(); this.message('素材已上传，点击地图可连续放置；Esc 返回选择模式。');
      } catch (error) { if (this.root === editorRoot && editorRoot.isConnected) this.message(error instanceof Error ? error.message : '上传失败'); }
      input.value = '';
    }, options);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.endDrag(true);
      this.commitSceneEdit(); this.flushRecovery();
      if (this.backupTimer) clearTimeout(this.backupTimer); this.backupTimer = undefined;
      this.eventsAbort.abort(); cancelAnimationFrame(this.renderFrame); cancelAnimationFrame(this.previewFrame);
      viewportObserver?.disconnect(); cancelAnimationFrame(this.viewportFrame); this.viewportFrame = 0;
      cancelAnimationFrame(this.backgroundFrame); this.backgroundFrame = 0;
      this.renderFrame = 0; this.previewFrame = 0; this.root.remove();
    });
    this.render();
    this.refreshEditorViewport();
    const initialWorkspace = this.root.querySelector<HTMLElement>('.workspace')!;
    initialWorkspace.scrollLeft = 0; initialWorkspace.scrollTop = 0; this.updateSceneParallax();
    if (notice) {
      const warning = this.root.querySelector<HTMLElement>('[data-draft-warning]')!;
      warning.hidden = false; warning.textContent = notice;
    }
  }
  private svg(): SVGSVGElement { return this.root.querySelector('svg')!; }
  private message(text: string): void { this.root.querySelector('footer')!.textContent = text; }
  private switchSidebar(panel: SidebarPanel, focus = false): void {
    if (!['place', 'assets', 'scene', 'map'].includes(panel)) return;
    if (this.pendingForms.size) { this.pendingMessage(); return; }
    if (this.drag || this.marquee || this.pan) { this.message('请先结束当前拖动或框选。'); return; }
    this.commitSceneEdit(); this.sidebarPanel = panel; this.renderSidebar();
    this.showInspector(panel === 'scene' ? 'layer' : 'object');
    if (focus) this.root.querySelector<HTMLElement>(`[role="tab"][data-editor-tab="${panel}"]`)?.focus({ preventScroll: true });
  }
  private renderSidebar(): void {
    this.root.querySelectorAll<HTMLElement>('[data-editor-panel]').forEach((panel) => { panel.hidden = panel.dataset.editorPanel !== this.sidebarPanel; });
    this.root.querySelectorAll<HTMLButtonElement>('[role="tab"][data-editor-tab]').forEach((tab) => {
      const active = tab.dataset.editorTab === this.sidebarPanel;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    });
    this.root.querySelector<HTMLElement>('[data-action="reset-platform-size"]')!.hidden = this.tool !== 'platform';
    this.root.querySelector<HTMLElement>('[data-asset-purpose]')!.hidden = !this.assetId || !['decoration', 'platform', 'coin', 'enemy', 'checkpoint'].includes(this.tool);
    this.root.querySelector<HTMLElement>('[data-assets-empty]')!.hidden = !!this.map.assets?.length;
    this.showInspector(this.inspectorMode);
  }
  private showInspector(mode: 'object' | 'layer'): void {
    this.inspectorMode = mode;
    for (const name of ['object', 'layer']) {
      const section = this.root?.querySelector<HTMLElement>(`[data-inspector="${name}"]`);
      if (section) section.hidden = mode !== name;
    }
  }
  private snapshot(map = this.map): string {
    return (this.document ??= new EditorDocument()).capture(map);
  }
  private cloneMap(): CustomMap {
    return (this.document ??= new EditorDocument()).clone(this.map);
  }
  private remember(before = this.snapshot()): void {
    this.commitHistory(); this.historyBefore = before;
  }
  private commitHistory(): void {
    if (this.historyBefore !== undefined) {
      const command = createEditorCommand(this.historyBefore, this.snapshot());
      this.historyBefore = undefined;
      if (command) { this.undo.push(command); trimEditorHistory(this.undo); this.redo = []; }
    }
  }
  private collectHistoryAssets(): void {
    if (!this.document) return;
    const collect = () => this.document!.collect([this.snapshot(), this.savedSnapshot, this.backupSnapshot, this.observedSnapshot,
      this.historyBefore, this.drag?.before, this.sceneEditBefore, JSON.stringify(this.undo), JSON.stringify(this.redo)]);
    collect();
    // 16MiB 图片字符串软预算，保留当前/保存/恢复基线及最近的一次可撤销操作。
    while (this.document.stats().payloadChars * 2 > 16 * 1024 * 1024 && this.undo.length > 1) { this.undo.shift(); collect(); }
    while (this.document.stats().payloadChars * 2 > 16 * 1024 * 1024 && this.redo.length > 1) { this.redo.shift(); collect(); }
  }
  private renderHistoryStatus(): void {
    const status = this.root?.querySelector<HTMLElement>('[data-history-status]'); if (!status) return;
    const images = this.document?.stats() ?? { images: 0, payloadChars: 0 };
    const bytes = [...this.undo, ...this.redo].reduce((sum, command) => sum + command.bytes, 0);
    status.textContent = `撤销 ${this.undo.length} · 重做 ${this.redo.length} · 共享图片 ${images.images}`;
    status.title = `最多 50 步；历史差量约 ${(bytes / 1024).toFixed(1)} KiB，图片字符串约 ${(images.payloadChars * 2 / 1024).toFixed(1)} KiB。仅为编辑数据估算，不含纹理、解码图片和浏览器运行内存。`;
  }
  private object(map = this.map, selection = this.selected): Record<string, unknown> | undefined {
    if (!selection) return;
    const { kind, index } = selection;
    const l = map.level;
    const value = kind === 'platform' ? l.platforms[index] : kind === 'coin' ? l.coins[index]
      : kind === 'enemy' ? l.enemies[index] : kind === 'decoration' ? map.decorations?.[index] : kind === 'flag' ? l.flag : l[kind];
    return value as unknown as Record<string, unknown>;
  }
  private activeSelections(): Selection[] {
    if (!this.selected) return [];
    const last = this.selections?.at(-1);
    const refs = last?.kind === this.selected.kind && last.index === this.selected.index ? this.selections! : [this.selected];
    return refs.filter((ref) => !!this.object(this.map, ref));
  }
  private setSelection(refs: Selection[]): void {
    const seen = new Set<string>();
    const valid = refs.filter((ref) => {
      const key = `${ref.kind}:${ref.index}`;
      if (seen.has(key) || !this.object(this.map, ref)) return false;
      seen.add(key); return true;
    });
    this.selected = valid.at(-1); this.selections = valid.length > 1 ? valid : undefined;
  }
  private action(action: string): void {
    this.commitSceneEdit();
    try {
      if (action.startsWith('view-')) { this.viewportAction(action); return; }
      if (action === 'discard-fields') {
        if (this.pendingForms?.size && !window.confirm('取消所有尚未应用的表单设置？已经放置的地图对象不会改变。')) return;
        this.pendingForms?.clear(); this.render(); this.message('待提交设置已取消，地图不变。'); return;
      }
      if (action === 'apply-pending') {
        if (this.pendingForms?.size) this.applyFormChanges([...this.pendingForms]); return;
      }
      if (this.pendingForms?.size && (!['properties', 'meta', 'material', 'material-reset'].includes(action) ||
        [...this.pendingForms].some((group) => group !== (action === 'material-reset' ? 'material' : action)))) {
        this.pendingMessage(); return;
      }
      if (this.drag || this.marquee || this.pan) { this.message('请先结束当前拖动或框选。'); return; }
      if (['select-all', 'clear-selection', 'paste', 'duplicate', 'delete', 'new'].includes(action)) this.showInspector('object');
      if (action === 'select-all' || action === 'clear-selection') {
        this.setSelection(action === 'select-all' ? allSelections(this.map) : []);
        this.tool = 'select'; this.preview = undefined; this.render();
        this.message(action === 'select-all' ? `已选择 ${this.activeSelections().length} 个玩法对象；背景图层不参与。` : '已取消选择。'); return;
      }
      if (action.startsWith('move-')) {
        const key = ({ 'move-left': 'ArrowLeft', 'move-right': 'ArrowRight', 'move-up': 'ArrowUp', 'move-down': 'ArrowDown' } as Record<string, string>)[action];
        if (key) this.nudge(key, EDITOR_GRID); return;
      }
      if (action.startsWith('layer-')) { this.editSceneLayer(action); return; }
      if (action === 'reset-platform-size') {
        this.resetPlatformBrush(); this.render();
        this.message('后续跳跃平台已恢复为 160×32，已有地面和平台不会改变。'); return;
      }
      if (action === 'collisions') {
        this.showCollisions = !this.showCollisions; this.render();
        this.message(this.showCollisions ? '绿色虚线＝实际站立面，浅绿色框＝物理范围；仅用于编辑检查。' : '碰撞辅助线已隐藏，不影响实际碰撞。'); return;
      }
      if (action === 'material' || action === 'material-reset') {
        this.applyFormChanges(['material'], action === 'material-reset'); return;
      }
      if (action === 'undo' || action === 'redo') {
        this.commitHistory();
        const source = action === 'undo' ? this.undo : this.redo;
        const target = action === 'undo' ? this.redo : this.undo;
        const command = source.at(-1); if (!command) return;
        const candidate = this.document!.restore(applyEditorCommand(this.snapshot(), command, action === 'undo'));
        source.pop(); target.push(command); this.map = candidate; this.setSelection([]);
      } else if (action === 'home') { if (this.save()) this.scene.start(SCENE.START); return; }
      else if (action === 'save') { this.save(); return; }
      else if (action === 'new') { if (!this.confirmReplacement()) return; this.remember(); this.map = newMap(); this.setSelection([]); this.clipboard = undefined; this.resetPlatformBrush(); }
      else if (action === 'import') { this.root.querySelector<HTMLInputElement>('.file')!.click(); return; }
      else if (action === 'upload') { this.root.querySelector<HTMLInputElement>('.asset-file')!.click(); return; }
      else if (action === 'copy') {
        this.clipboard = { ...this.selectionCopy(), pastes: 0 };
        this.renderClipboardControls();
        this.message(this.clipboard.kind === 'batch' ? `已复制 ${this.clipboard.items.length} 个对象（唯一标记不复制）；Ctrl+V 保持布局粘贴。` : '已复制对象；按 Ctrl+V 粘贴，原对象不会移动。'); return;
      }
      else if (action === 'paste' || action === 'duplicate') {
        const source = action === 'paste' ? this.clipboard : this.selectionCopy();
        if (!source) throw new Error('请先选中对象并按 Ctrl+C 复制');
        this.insertCopy(source, action === 'paste' ? this.clipboard!.pastes + 1 : 1);
        if (action === 'paste') this.clipboard!.pastes += 1;
        this.render(); this.message('已创建并选中副本，可继续拖动；Ctrl+Z 撤销。'); return;
      }
      else if (action === 'export' || action === 'play') {
        const valid = parseCustomMap(this.map, action === 'play');
        if (action === 'play') {
          if (this.save()) this.scene.start(SCENE.GAME, { customMap: valid }); return;
        }
        let playable = true; try { parseCustomMap(valid); } catch { playable = false; }
        const url = URL.createObjectURL(new Blob([JSON.stringify(valid, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = playable ? 'star-map.json' : 'star-map-draft.json'; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.message(playable ? '地图已导出，别人可在工坊中导入试玩。' : '未完成的地图草稿已导出，可重新导入继续编辑；当前还不能试玩。'); return;
      } else if (action === 'delete') {
        if (this.activeSelections().length > 1) { this.deleteSelectedBatch(); return; }
        if (!this.selected || !this.object()) { this.message('请先选中要删除的对象'); return; }
        if (['spawn', 'checkpoint', 'flag'].includes(this.selected.kind)) {
          this.message('出生点、检查点、终点必须保留，可拖动修改位置。'); return;
        }
        this.remember(); const { kind, index } = this.selected;
        if (kind === 'platform') this.map.level.platforms.splice(index, 1);
        else if (kind === 'coin') this.map.level.coins.splice(index, 1);
        else if (kind === 'decoration') this.map.decorations?.splice(index, 1);
        else this.map.level.enemies.splice(index, 1);
        this.setSelection([]);
        this.render(); this.message('选中对象已删除；Ctrl+Z 可恢复。'); return;
      } else if (action === 'meta') {
        this.applyFormChanges(['meta']); return;
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
        this.applyFormChanges(['properties']); return;
      }
      this.render(); this.message('修改已应用。试玩或导出时会检查地图。');
    } catch (error) { this.message(error instanceof Error ? error.message : '操作失败'); }
  }
  private save(): boolean {
    if (this.pendingForms?.size) { this.pendingMessage(); return false; }
    this.commitSceneEdit(); this.commitHistory(); this.saving = true; this.renderDraftStatus();
    this.draftStore ??= new EditorDraftStore(() => localStorage);
    const result = this.draftStore.save(this.map, this.savedRevision ?? null);
    this.saving = false;
    if (!result.ok) {
      this.saveError = result.error; this.renderDraftStatus(); this.message(result.error); return false;
    }
    this.savedRevision = result.revision; this.savedSnapshot = this.snapshot();
    this.hasSavedDraft = true;
    this.observedSnapshot = this.savedSnapshot; this.backupSnapshot = undefined;
    this.saveError = undefined; this.backupError = undefined;
    this.collectHistoryAssets(); this.renderHistoryStatus();
    const warning = this.root?.querySelector<HTMLElement>('[data-draft-warning]');
    if (warning) warning.hidden = true;
    if (this.backupTimer) clearTimeout(this.backupTimer); this.backupTimer = undefined;
    this.renderDraftStatus(); this.message('草稿已保存到当前浏览器。'); return true;
  }
  private scaleEditorCanvas(): void {
    const zoom = this.editorZoom ?? 1, svg = this.svg();
    svg.style.width = `${this.map.level.width * zoom}px`; svg.style.height = `${540 * zoom}px`;
    const workspace = this.root.querySelector<HTMLElement>('.workspace')!;
    svg.style.marginTop = this.editorViewMode === 'game' ? `${Math.max(0, (workspace.clientHeight - 40 - 540 * zoom) / 2)}px` : '0px';
    const output = this.root.querySelector<HTMLOutputElement>('[data-editor-zoom]');
    if (output) output.value = `${Math.round(zoom * 100)}%`;
  }
  private setEditorZoom(value: number, point?: { x: number; y: number }, mode: EditorViewMode = 'manual'): void {
    const svg = this.svg(), box = svg.getBoundingClientRect();
    const workspace = this.root.querySelector<HTMLElement>('.workspace')!;
    if (box.width <= 0 || this.drag || this.pan || this.marquee) return;
    const viewport = workspace.getBoundingClientRect();
    const anchor = point ?? { x: viewport.left + workspace.clientWidth / 2, y: viewport.top + workspace.clientHeight / 2 };
    const previous = box.width / this.map.level.width;
    const previousMargin = parseFloat(svg.style.marginTop || '0');
    const previousScroll = { left: workspace.scrollLeft, top: workspace.scrollTop };
    const world = { x: (anchor.x - box.left) / previous, y: (anchor.y - box.top) / previous };
    this.editorViewMode = mode;
    this.editorZoom = mode === 'height' && Number.isFinite(value) && value > 0 ? value : editorZoom(value);
    this.scaleEditorCanvas(); this.renderViewportControls();
    const scroll = anchoredZoomScroll(world, previous, this.editorZoom, previousScroll);
    workspace.scrollLeft = scroll.left;
    workspace.scrollTop = Math.max(0, previousScroll.top + world.y * (this.editorZoom - previous) + parseFloat(svg.style.marginTop || '0') - previousMargin);
    this.preview = undefined; this.drawPreview(); this.updateSceneParallax();
  }
  private scheduleViewportRefresh(root: HTMLElement): void {
    if (this.root !== root || !root.isConnected || this.viewportFrame) return;
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = 0;
      if (this.root === root && root.isConnected) this.refreshEditorViewport();
    });
  }
  private refreshEditorViewport(): void {
    if (this.drag || this.pan || this.marquee) { this.viewportResizePending = true; return; }
    this.viewportResizePending = false;
    const workspace = this.root.querySelector<HTMLElement>('.workspace')!;
    const width = workspace.clientWidth - 40, height = workspace.clientHeight - 40;
    if (width <= 0 || height <= 0) return;
    const mode = this.editorViewMode;
    if (mode === 'height') this.setEditorZoom(heightFillZoom(workspace.clientHeight), undefined, mode);
    else if (mode === 'overview') this.setEditorZoom(Math.min(width / this.map.level.width, height / 540), undefined, mode);
    else if (mode === 'game') {
      const game = this.playViewport(); this.setEditorZoom(Math.min(width / game.width, height / game.height), undefined, mode);
    } else { this.scaleEditorCanvas(); this.updateSceneParallax(); }
    if (mode !== 'manual') workspace.scrollTop = 0;
    this.renderViewportControls();
  }
  private playViewport(): { zoom: number; width: number; height: number } {
    return worldCameraView(this.scale?.width ?? window.innerWidth, this.scale?.height ?? window.innerHeight);
  }
  private renderViewportControls(): void {
    for (const [action, mode] of [['view-height', 'height'], ['view-game', 'game'], ['view-fit', 'overview']])
      this.root.querySelector(`[data-action="${action}"]`)?.setAttribute('aria-pressed', String(this.editorViewMode === mode));
    const button = this.root.querySelector<HTMLButtonElement>('[data-action="view-fullscreen"]');
    if (button) { button.textContent = this.canvasFullscreen ? '退出全屏 · Esc' : '全屏画布'; button.setAttribute('aria-pressed', String(this.canvasFullscreen)); }
  }
  private toggleCanvasFullscreen(): void {
    if (!this.canvasFullscreen && this.pendingForms.size) { this.pendingMessage(); return; }
    const workspace = this.root.querySelector<HTMLElement>('.workspace')!;
    const centerX = (workspace.scrollLeft + workspace.clientWidth / 2 - 20) / this.editorZoom;
    if (!this.canvasFullscreen) this.normalViewport = { mode: this.editorViewMode, zoom: this.editorZoom, left: workspace.scrollLeft, top: workspace.scrollTop };
    this.canvasFullscreen = !this.canvasFullscreen;
    this.root.classList.toggle('canvas-fullscreen', this.canvasFullscreen);
    if (this.canvasFullscreen) {
      this.editorViewMode = 'height'; this.refreshEditorViewport();
      workspace.scrollLeft = Math.max(0, 20 + centerX * this.editorZoom - workspace.clientWidth / 2);
    }
    else {
      const previous = this.normalViewport; this.normalViewport = undefined;
      if (previous) {
        this.setEditorZoom(previous.zoom, undefined, previous.mode);
        this.refreshEditorViewport(); workspace.scrollLeft = previous.left;
        workspace.scrollTop = previous.mode === 'height' || previous.mode === 'overview' ? 0 : previous.top;
      }
    }
    this.updateSceneParallax(); this.renderViewportControls(); this.svg().focus({ preventScroll: true });
    this.message(this.canvasFullscreen ? '全屏画布 · 菜单已收起；Esc 或右上角按钮退出。' : '已恢复菜单与原视图。');
  }
  private viewportAction(action: string): void {
    const workspace = this.root.querySelector<HTMLElement>('.workspace')!;
    if (this.drag || this.pan || this.marquee) { this.message('请先结束拖动或框选再调整视图。'); return; }
    if (action === 'view-fullscreen') { this.toggleCanvasFullscreen(); return; }
    if (action === 'view-height' || action === 'view-game') {
      this.editorViewMode = action === 'view-height' ? 'height' : 'game'; this.refreshEditorViewport();
      this.message(action === 'view-height' ? '按高度等比铺满；长地图横向浏览，不改变对象比例。'
        : '蓝色虚线为当前窗口的游玩相机范围；保持比例，窄编辑区可能留白。'); return;
    }
    if (action === 'view-in' || action === 'view-out' || action === 'view-reset') {
      this.setEditorZoom(action === 'view-reset' ? 1 : this.editorZoom * (action === 'view-in' ? 1.25 : 0.8));
    } else if (action === 'view-fit') {
      const fit = Math.min(Math.max(1, workspace.clientWidth - 40) / this.map.level.width, Math.max(1, workspace.clientHeight - 40) / 540);
      this.setEditorZoom(fit, undefined, 'overview');
      workspace.scrollLeft = 0; workspace.scrollTop = 0; this.updateSceneParallax();
      if (this.editorZoom > fit + 1e-8) { this.message('已缩小至最小 5%。超长地图仍需横向浏览，或选择对象后点击定位。'); return; }
    } else if (action === 'view-focus' || action === 'view-start') {
      const value = action === 'view-focus' ? this.object() : this.map.level.spawn;
      if (!value) { this.message('先在画布上选择一个玩法对象，再点击定位。背景图层请在右侧设置位置。'); return; }
      const refs = this.activeSelections();
      const bounds = action === 'view-focus' && refs.length > 1 ? itemsBounds(selectionItems(this.map, refs))!
        : objectBounds(action === 'view-start' ? 'spawn' : this.selected!.kind, value as unknown as GridObject);
      const scroll = centeredObjectScroll(bounds, this.editorZoom, { width: workspace.clientWidth, height: workspace.clientHeight });
      workspace.scrollLeft = scroll.left; workspace.scrollTop = scroll.top; this.updateSceneParallax();
    }
    this.message('视图已调整；Ctrl/⌘＋滚轮以鼠标位置缩放，不改变地图坐标、碰撞或撤销记录。');
  }
  private loadDraft(): string {
    this.draftStore = new EditorDraftStore(() => localStorage);
    const loaded = this.draftStore.load();
    const keepMemory = this.draftReady && (this.hasUnsavedChanges() || this.savedRevision === loaded.revision || loaded.readFailed);
    if (!keepMemory) {
      this.document = new EditorDocument(); this.historyBefore = undefined;
      this.map = loaded.map ?? newMap();
      this.savedSnapshot = this.snapshot(loaded.savedMap ?? newMap());
      this.savedRevision = loaded.revision;
      this.hasSavedDraft = !!loaded.savedMap;
      this.backupSnapshot = loaded.restored ? this.snapshot() : undefined;
      this.undo = []; this.redo = [];
    }
    this.observedSnapshot = this.snapshot(); this.draftReady = true;
    return [loaded.restored && !keepMemory ? '已恢复上次未手动保存的编辑；请检查后保存草稿。' : '', ...loaded.warnings].filter(Boolean).join(' ');
  }
  private hasUnsavedChanges(): boolean {
    return this.draftReady && this.snapshot() !== this.savedSnapshot;
  }
  private updateDraftState(): void {
    if (!this.draftReady) return;
    const snapshot = this.snapshot();
    if (snapshot !== this.observedSnapshot) {
      this.observedSnapshot = snapshot; this.saveError = undefined; this.backupError = undefined;
      if (this.backupTimer) clearTimeout(this.backupTimer); this.backupTimer = undefined;
      if (snapshot !== this.savedSnapshot && snapshot !== this.backupSnapshot) {
        this.backupTimer = setTimeout(() => { this.backupTimer = undefined; this.flushRecovery(); }, 1000);
      } else if (snapshot === this.savedSnapshot && this.backupSnapshot) {
        const cleared = this.draftStore?.clearRecovery(this.savedRevision);
        if (cleared?.ok) this.backupSnapshot = undefined;
        else if (cleared?.error) this.backupError = cleared.error;
      }
    }
    this.renderDraftStatus();
  }
  private renderDraftStatus(): void {
    const status = this.root?.querySelector<HTMLElement>('[data-draft-status]');
    const pending = this.root?.querySelector<HTMLElement>('[data-pending-notice]');
    if (pending) pending.hidden = !this.pendingForms?.size;
    if (!status) return;
    const dirty = this.hasUnsavedChanges();
    status.textContent = this.saving ? '保存中…' : this.saveError ? '保存失败 · 请导出备份'
      : this.backupError ? '自动备份失败 · 请保存或导出' : this.pendingForms?.size ? '有未应用设置'
      : dirty ? (this.backupSnapshot === this.snapshot() ? '未手动保存 · 已自动备份' : '未保存 · 等待备份')
      : this.hasSavedDraft ? '已保存' : '新地图 · 尚未保存';
    status.dataset.state = this.saveError || this.backupError ? 'error' : dirty || this.pendingForms?.size ? 'dirty' : 'saved';
    status.title = this.saveError ?? this.backupError ?? '自动备份只包含已应用的地图修改；未应用的表单请先点击应用。';
  }
  private flushRecovery(): boolean {
    if (!this.draftReady || !this.draftStore || this.drag || this.marquee) return false;
    const snapshot = this.snapshot();
    if (snapshot === this.savedSnapshot || snapshot === this.backupSnapshot) return true;
    const result = this.draftStore.backup(this.map, this.savedRevision);
    if (result.ok) { this.backupSnapshot = snapshot; this.backupError = undefined; }
    else { this.backupError = result.error; this.message(result.error); }
    this.renderDraftStatus(); return result.ok;
  }
  private confirmReplacement(): boolean {
    if (!this.hasUnsavedChanges() && !this.pendingForms?.size) return true;
    if (!window.confirm('当前地图有未保存的修改。确定替换？替换后可撤销，但未应用的表单设置会丢弃。建议先保存或导出。')) return false;
    this.pendingForms?.clear(); return true;
  }
  private noteFormInput(input: HTMLInputElement): void {
    const data = input.dataset;
    const group: FormGroup | undefined = data.meta ? 'meta' : data.material && data.material !== 'asset' ? 'material'
      : ['prop', 'kind', 'appearance', 'layer', 'solid', 'remote'].some((key) => Object.hasOwn(data, key)) ? 'properties' : undefined;
    if (group) { this.pendingForms.add(group); this.renderDraftStatus(); }
  }
  private pendingMessage(): void {
    this.message('有尚未应用的属性。请点击「应用全部待提交设置」或「取消待提交设置」，避免丢失输入。');
  }
  private applyFormChanges(groups: FormGroup[], resetMaterial = false): void {
    const candidate = this.cloneMap();
    const previousKind = this.object()?.kind;
    const field = (selector: string): string => {
      const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
      if (!input || !input.value.trim()) throw new Error('属性不能为空'); return input.value;
    };
    if (groups.includes('meta')) {
      candidate.title = field('[data-meta="title"]').trim();
      candidate.level.width = validateMapWidth(Number(field('[data-meta="width"]')));
      candidate.level.timeLimit = Number(field('[data-meta="timeLimit"]'));
    }
    if (groups.includes('material')) {
      const id = this.materialAssetId;
      if (resetMaterial) delete candidate.platformMaterials?.[id];
      else {
        const surfaceY = Number(field('[data-material="surfaceY"]')) / 100;
        const asset = mapAssets(this.map).find((a) => a.id === id);
        const g = asset && cachedAssetGeometry(asset.data);
        if (g && (surfaceY * g.sourceHeight < g.y || surfaceY * g.sourceHeight >= g.y + g.height))
          throw new Error('站立线应位于素材的可见内容内，请对照原图高度调整百分比');
        candidate.platformMaterials = { ...candidate.platformMaterials, [id]: {
          mode: field('[data-material="mode"]') as 'repeat' | 'stretch', surfaceY,
          leftCap: Number(field('[data-material="leftCap"]')) / 100, rightCap: Number(field('[data-material="rightCap"]')) / 100 } };
      }
    }
    if (groups.includes('properties')) {
      if (this.activeSelections().length > 1) throw new Error('多选时只支持整体移动、复制和删除；请只选一个对象后调整具体属性');
      const value = this.object(candidate); if (!value || !this.selected) throw new Error('请先选择对象');
      this.root.querySelectorAll<HTMLInputElement>('[data-prop]').forEach((input) => {
        const number = Number(input.value);
        if (!input.value.trim() || !Number.isFinite(number)) throw new Error('属性需为有效数字');
        if (['width', 'height'].includes(input.dataset.prop!) && number <= 0) throw new Error('尺寸必须大于 0');
        value[input.dataset.prop!] = number;
      });
      const kind = this.root.querySelector<HTMLSelectElement>('[data-kind]'); if (kind) value.kind = kind.value;
      const appearance = this.root.querySelector<HTMLSelectElement>('[data-appearance]');
      if (appearance) { if (appearance.value) value.assetId = appearance.value; else delete value.assetId; }
      const layer = this.root.querySelector<HTMLSelectElement>('[data-layer]'); if (layer) value.layer = layer.value;
      const solid = this.root.querySelector<HTMLInputElement>('[data-solid]'); if (solid) value.solid = solid.checked;
      const remote = this.root.querySelector<HTMLInputElement>('[data-remote]');
      if (remote) {
        const enemy = value as unknown as EnemyData;
        enemy.attack = remote.checked ? enemy.attack ?? { range: 340, cooldown: 1600, projectileSpeed: 440,
          projectileArc: -120, projectileGravity: 700, projectileLifetime: 1450 } : undefined;
      }
      Object.assign(value, snapObjectToGrid(this.selected.kind, value as unknown as GridObject, candidate.level.width));
      if (this.selected.kind === 'enemy') {
        value.min = Math.max(0, Math.min(Number(value.min), Number(value.x)));
        value.max = Math.min(candidate.level.width, Math.max(Number(value.max), Number(value.x)));
      }
    }
    // 先完整验证候选地图：失败不修改模型、撤销栈、笔刷或其他表单。
    parseCustomMap(candidate, false);
    if (this.snapshot(candidate) !== this.snapshot()) { this.remember(); this.map = candidate; }
    if (groups.includes('properties')) {
      if (this.selected?.kind === 'platform' && previousKind === 'platform' && this.object()?.kind === 'ground') this.resetPlatformBrush();
      this.rememberPlatformBrush();
    }
    groups.forEach((group) => this.pendingForms?.delete(group));
    this.render(); this.message('设置已整体验证并应用；可撤销。自动备份不会替代手动保存。');
  }
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || !this.root.isConnected) return;
    if (event.key === 'Escape' && this.canvasFullscreen && !this.drag && !this.pan && !this.marquee) {
      event.preventDefault(); this.toggleCanvasFullscreen(); return;
    }
    const target = event.target as Element | null;
    if (target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
    const tab = target?.closest?.<HTMLElement>('[role="tab"][data-editor-tab]');
    if (tab) {
      const panels: SidebarPanel[] = ['place', 'assets', 'scene', 'map'];
      const index = panels.indexOf(tab.dataset.editorTab as SidebarPanel);
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + panels.length) % panels.length;
        this.switchSidebar(panels[next], true);
      }
      return;
    }
    const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (this.pendingForms?.size && (event.key === 'Escape' || event.key.startsWith('Arrow'))) { this.pendingMessage(); return; }
    if (target?.closest?.('.scene-layer-panel,.layer-inspector')) {
      if (event.key === 'Delete') { event.preventDefault(); this.action('layer-delete'); return; }
      if (command && ['c', 'v', 'd'].includes(key)) {
        event.preventDefault();
        if (key === 'd') this.action('layer-duplicate');
        else this.message('图层使用「复制图层」创建副本；对象 Ctrl+C/V 请回到地图画布。');
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    }
    let action: string | undefined;
    if (command && key === 'a' && !event.altKey && target?.closest?.('.workspace')) action = 'select-all';
    else if (command && !event.altKey && (!event.shiftKey || key === 'z')) {
      action = ({ c: 'copy', v: 'paste', d: 'duplicate', y: 'redo', z: event.shiftKey ? 'redo' : 'undo' } as Record<string, string>)[key];
    } else if (!command && event.key === 'Delete') action = 'delete';
    if (action) {
      event.preventDefault();
      if (this.drag || this.pan || this.marquee) { this.message('请先松开鼠标结束拖动或框选，再执行复制、粘贴或删除操作。'); return; }
      this.action(action); return;
    }
    if (event.key === 'Escape') {
      const interacting = !!this.drag || !!this.marquee || !!this.pan;
      event.preventDefault(); this.endDrag(true); this.tool = 'select'; this.preview = undefined;
      if (!interacting) this.setSelection([]); this.render();
    } else if (event.code === 'Space' && !target?.closest?.('button,a')) {
      event.preventDefault(); this.spaceHeld = true;
    } else if (!command && !this.drag && !this.pan && !this.marquee && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && this.selected) {
      event.preventDefault(); this.nudge(event.key, event.shiftKey ? EDITOR_GRID * 4 : EDITOR_GRID);
    }
  }
  private selectionCopy(): SelectionCopy {
    const refs = this.activeSelections();
    if (refs.length > 1) {
      const items = refs.filter((ref) => ['platform', 'coin', 'enemy', 'decoration'].includes(ref.kind)).map((ref) => {
        const value = this.object(this.map, ref)!;
        return { kind: ref.kind as CopyableKind, value: structuredClone(ref.kind === 'coin' && Array.isArray(value) ? { x: value[0], y: value[1] } : value) };
      });
      if (!items.length) throw new Error('唯一标记只能移动，不可复制');
      return { kind: 'batch', items };
    }
    const value = this.object();
    if (!this.selected || !value) throw new Error('请先选中平台、星星、敌人或装饰对象');
    if (!['platform', 'coin', 'enemy', 'decoration'].includes(this.selected.kind))
      throw new Error('出生点、检查点和终点是唯一标记，不可复制；可直接拖动修改位置。');
    const kind = this.selected.kind as CopyableKind;
    const snapshot = kind === 'coin' && Array.isArray(value) ? { x: value[0], y: value[1] } : value;
    return { kind, value: structuredClone(snapshot) };
  }
  private insertCopy(source: SelectionCopy, sequence: number): void {
    if (source.kind === 'batch') { this.insertBatchCopy(source.items, sequence); return; }
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
    copy.objectId = this.nextObjectId();
    if (kind === 'platform') copy.id = copy.objectId;
    this.remember();
    if (kind === 'decoration' && !this.map.decorations) this.map.decorations = array as NonNullable<CustomMap['decorations']>;
    (array as unknown[]).push(copy);
    this.setSelection([{ kind, index: array.length - 1 }]);
    this.tool = 'select'; this.preview = undefined;
  }
  private nextObjectId(): string {
    let id: string;
    do {
      this.objectSerial = (this.objectSerial ?? 0) + 1;
      id = `p-${Date.now()}-${this.objectSerial}`;
    } while ([...this.map.level.platforms, ...this.map.level.enemies, ...this.map.level.coins,
      ...(this.map.decorations ?? []), this.map.level.spawn, this.map.level.checkpoint, this.map.level.flag]
      .some((value) => !Array.isArray(value) && (value.objectId === id || ('id' in value && value.id === id))));
    return id;
  }
  private insertBatchCopy(source: ObjectCopy[], sequence: number): void {
    const candidate = this.cloneMap();
    const limits = { platform: 200, coin: 300, enemy: 40, decoration: 200 };
    const arrays = { platform: candidate.level.platforms, coin: candidate.level.coins,
      enemy: candidate.level.enemies, decoration: candidate.decorations ??= [] };
    const library = mapAssets(this.map);
    const items: SelectionItem[] = source.map(({ kind, value }, index) => {
      if (value.assetId && !library.some((asset) => asset.id === value.assetId)) throw new Error('复制对象的素材已不存在，请重新复制');
      if (!Number.isFinite(Number(value.x) + Number(value.y))) throw new Error('复制对象的坐标无效');
      return { ref: { kind, index }, value: structuredClone(value) };
    });
    for (const kind of Object.keys(limits) as CopyableKind[]) {
      if (arrays[kind].length + source.filter((p) => p.kind === kind).length > limits[kind])
        throw new Error('批量粘贴将超过对象数量上限；本次没有放置任何副本');
    }
    const normalized = translatedSelection(items, 0, 0, candidate.level.width);
    let placed = translatedSelection(items, EDITOR_GRID * 2 * sequence, EDITOR_GRID * sequence, candidate.level.width);
    const unchanged = () => placed.every((p, i) => p.value.x === normalized[i].value.x && p.value.y === normalized[i].value.y);
    if (unchanged()) placed = translatedSelection(items, -EDITOR_GRID * 2 * sequence, -EDITOR_GRID * sequence, candidate.level.width);
    if (unchanged()) throw new Error('选区已占满可用空间，无法偏移粘贴；请缩小复制范围');
    const refs: Selection[] = [];
    for (const item of placed) {
      const kind = item.ref.kind as CopyableKind, array = arrays[kind];
      item.value.objectId = this.nextObjectId();
      if (kind === 'platform') item.value.id = item.value.objectId;
      refs.push({ kind, index: array.length }); (array as unknown[]).push(item.value);
    }
    parseCustomMap(candidate, false);
    this.remember(); this.map = candidate; this.setSelection(refs); this.tool = 'select'; this.preview = undefined;
  }
  private deleteSelectedBatch(): void {
    const refs = this.activeSelections();
    const editable = refs.filter((ref) => ['platform', 'coin', 'enemy', 'decoration'].includes(ref.kind));
    if (!editable.length) { this.message('出生点、检查点和终点必须保留，仅可整体移动。'); return; }
    const candidate = this.cloneMap();
    for (const kind of ['platform', 'coin', 'enemy', 'decoration'] as const) {
      const array = kind === 'platform' ? candidate.level.platforms : kind === 'coin' ? candidate.level.coins
        : kind === 'enemy' ? candidate.level.enemies : candidate.decorations;
      editable.filter((ref) => ref.kind === kind).sort((a, b) => b.index - a.index).forEach((ref) => array?.splice(ref.index, 1));
    }
    parseCustomMap(candidate, false);
    this.remember(); this.map = candidate; this.setSelection(refs.filter((ref) => !editable.includes(ref)));
    this.render(); this.message(`已删除 ${editable.length} 个对象，保留 ${refs.length - editable.length} 个唯一标记；Ctrl+Z 一次恢复。`);
  }
  private renderClipboardControls(): void {
    const editable = this.activeSelections().some((ref) => ['platform', 'coin', 'enemy', 'decoration'].includes(ref.kind));
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
    const refs = this.activeSelections();
    if (refs.length > 1) {
      const candidate = this.cloneMap();
      try {
        writeSelection(candidate, translatedSelection(selectionItems(this.map, refs), key === 'ArrowLeft' ? -amount : key === 'ArrowRight' ? amount : 0,
          key === 'ArrowUp' ? -amount : key === 'ArrowDown' ? amount : 0, this.map.level.width));
        parseCustomMap(candidate, false);
        if (this.snapshot(candidate) !== this.snapshot()) { this.remember(); this.map = candidate; }
        this.render();
      } catch (error) { this.message(error instanceof Error ? error.message : '批量移动失败'); }
      return;
    }
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
    if (this.marquee) { this.renderMarquee(); return; }
    if (this.drag?.batch) {
      // 旧地图尺寸首次吸附时，不能只平移原图而留下过期的操作边界。
      if (this.drag.batch.some((item) => {
        const value = this.object(this.map, item.ref);
        return value && (value.width !== item.value.width || value.height !== item.value.height);
      })) { this.renderCanvas(); return; }
      for (const item of this.drag.batch) {
        const value = this.object(this.map, item.ref); if (!value) continue;
        const node = this.svg().querySelector(`[data-object="${item.ref.kind}"][data-index="${item.ref.index}"]`);
        node?.setAttribute('transform', `translate(${Number(value.x) - Number(item.value.x)} ${Number(value.y) - Number(item.value.y)})`);
        this.svg().querySelector(`[data-marker-label="${item.ref.kind}"]`)?.setAttribute('transform', `translate(${Number(value.x) - Number(item.value.x)} ${Number(value.y) - Number(item.value.y)})`);
        if (item.ref.kind === 'enemy') this.svg().querySelector(`[data-enemy-patrol="${item.ref.index}"]`)?.setAttribute('d', `M${value.min} ${Number(value.y) - 10}H${value.max}`);
      }
      const bounds = itemsBounds(selectionItems(this.map, this.activeSelections()));
      if (bounds) for (const [key, value] of Object.entries(bounds)) this.svg().querySelector('[data-selection-bounds]')?.setAttribute(key, String(value));
      this.root.querySelector('.tool-status')!.textContent = `整体拖动 · ${this.activeSelections().length} 个对象 · 16px 网格`;
      return;
    }
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
    if (this.drag || this.marquee || this.pan) return;
    if (this.pendingForms?.size && !this.spaceHeld && event.button !== 1) { this.pendingMessage(); return; }
    this.commitSceneEdit();
    if (event.button === 2) return;
    this.svg().focus({ preventScroll: true });
    if (this.spaceHeld || event.button === 1) {
      event.preventDefault(); const workspace = this.root.querySelector('.workspace')!;
      this.pan = { x: event.clientX, y: event.clientY, left: workspace.scrollLeft, top: workspace.scrollTop };
      this.svg().setPointerCapture(event.pointerId); return;
    }
    this.showInspector('object');
    const p = this.position(event); const l = this.map.level;
    if ((event.target as Element).closest('[data-resize]')) {
      if (this.activeSelections().length > 1) return;
      const value = this.object(); if (!value) return;
      this.drag = { ...p, initialX: Number(value.x), initialY: Number(value.y), before: this.snapshot(),
        resize: true, width: Number(value.width), height: Number(value.height) };
      this.svg().setPointerCapture(event.pointerId); return;
    }
    if (event.altKey) this.tool = 'select';
    if (this.tool === 'select') {
      const target = (event.target as Element).closest('[data-object]');
      const hit = target ? { kind: target.getAttribute('data-object') as Selection['kind'], index: Number(target.getAttribute('data-index')) } : undefined;
      const previous = this.activeSelections();
      const has = (ref: Selection) => hit && ref.kind === hit.kind && ref.index === hit.index;
      if (!hit) {
        this.marquee = { ...p, endX: p.x, endY: p.y, previous, additive: event.shiftKey, moved: false };
        if (!event.shiftKey) this.setSelection([]);
        this.preview = undefined; this.svg().setPointerCapture(event.pointerId); this.render(); return;
      }
      if (event.shiftKey && !event.altKey) {
        this.setSelection(previous.some(has) ? previous.filter((ref) => !has(ref)) : [...previous, hit]);
        this.render(); this.message(`已选择 ${this.activeSelections().length} 个对象；可整体拖动或用方向键移动。`); return;
      }
      if (event.altKey || !previous.some(has)) this.setSelection([hit]);
      const value = this.object();
      if (value) {
        if (this.selected?.kind === 'platform' || value.solid) this.materialAssetId = String(value.assetId ?? DEFAULT_OBJECT_SKINS.platform);
        this.drag = { ...p, initialX: Number(value.x), initialY: Number(value.y), before: this.snapshot(),
          width: Number(value.width ?? 0), height: Number(value.height ?? 0),
          ...(this.activeSelections().length > 1 ? { batch: selectionItems(this.map, this.activeSelections()) } : {}) };
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
        (this.map.decorations ??= []).push({ objectId: this.nextObjectId(), assetId: asset.id, x: placed.x, y: placed.y,
          width: placed.width!, height: placed.height!, solid: false });
        this.setSelection([{ kind: 'decoration', index: this.map.decorations.length - 1 }]);
        this.render(); return;
      }
      this.remember();
      const placed = this.placement(p); const { x, y } = placed;
      if (this.tool === 'platform') { const id = this.nextObjectId(); l.platforms.push({ objectId: id, id, x, y, width: placed.width!, height: placed.height!, kind: 'platform', assetId: this.assetId }); this.setSelection([{ kind: 'platform', index: l.platforms.length - 1 }]); }
      else if (this.tool === 'coin') { l.coins.push({ objectId: this.nextObjectId(), x, y, assetId: this.assetId }); this.setSelection([{ kind: 'coin', index: l.coins.length - 1 }]); }
      else if (this.tool === 'enemy') { l.enemies.push({ objectId: this.nextObjectId(), x, y, min: Math.max(0, x - 80), max: Math.min(l.width, x + 80), speed: 70, assetId: this.assetId }); this.setSelection([{ kind: 'enemy', index: l.enemies.length - 1 }]); }
      else { Object.assign(l[this.tool], { ...placed, assetId: this.assetId }); this.setSelection([{ kind: this.tool, index: 0 }]); }
    }
    this.render();
  }
  private pointerMove(event: PointerEvent): void {
    if (this.pan) {
      const workspace = this.root.querySelector('.workspace')!;
      workspace.scrollLeft = this.pan.left + this.pan.x - event.clientX;
      workspace.scrollTop = this.pan.top + this.pan.y - event.clientY; return;
    }
    if (this.marquee) {
      const p = this.position(event);
      this.marquee.endX = Math.max(0, Math.min(this.map.level.width, p.x));
      this.marquee.endY = Math.max(0, Math.min(540, p.y));
      if (Math.hypot(p.x - this.marquee.x, p.y - this.marquee.y) * this.svg().getBoundingClientRect().width / this.map.level.width > 3) this.marquee.moved = true;
      if (this.marquee.moved) {
        const found = boxSelections(this.map, this.marqueeBounds()!);
        this.setSelection([...(this.marquee.additive ? this.marquee.previous : []), ...found]);
      }
      this.scheduleCanvas(); return;
    }
    if (!this.drag) {
      this.preview = this.position(event);
      if (!this.previewFrame) this.previewFrame = requestAnimationFrame(() => { this.previewFrame = 0; if (this.root.isConnected) this.drawPreview(); });
      return;
    }
    const value = this.object(); if (!value || !this.selected) return;
    const p = this.position(event);
    if (this.drag.batch) {
      try { writeSelection(this.map, translatedSelection(this.drag.batch, p.x - this.drag.x, p.y - this.drag.y, this.map.level.width)); }
      catch (error) { this.message(error instanceof Error ? error.message : '批量移动失败'); }
      this.scheduleCanvas(); return;
    }
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
    if (this.marquee) {
      if (cancel) this.setSelection(this.marquee.previous);
      this.marquee = undefined; this.render();
      if (this.viewportResizePending) this.refreshEditorViewport();
      this.message(`已选择 ${this.activeSelections().length} 个对象。`); return;
    }
    if (!this.drag) { if (this.viewportResizePending) this.refreshEditorViewport(); return; }
    cancelAnimationFrame(this.renderFrame); this.renderFrame = 0;
    const changed = this.drag.before !== this.snapshot();
    let failure: string | undefined;
    if (!cancel && changed && this.drag.batch) {
      try { parseCustomMap(this.map, false); }
      catch (error) { cancel = true; failure = error instanceof Error ? error.message : '选区移动失败，已还原'; }
    }
    if (cancel) this.map = this.document!.restore(this.drag.before);
    else if (changed) this.remember(this.drag.before);
    if (!cancel && changed && this.drag.resize) this.rememberPlatformBrush();
    this.drag = undefined; this.render();
    if (this.viewportResizePending) this.refreshEditorViewport();
    if (failure) this.message(failure);
  }
  private marqueeBounds(): { x: number; y: number; width: number; height: number } | undefined {
    const m = this.marquee; if (!m) return;
    return { x: Math.min(m.x, m.endX), y: Math.min(m.y, m.endY), width: Math.abs(m.endX - m.x), height: Math.abs(m.endY - m.y) };
  }
  private renderMarquee(): void {
    const svg = this.svg(); svg.querySelector('[data-selection-marquee]')?.remove();
    const bounds = this.marqueeBounds(); if (!bounds || !this.marquee?.moved) return;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.dataset.selectionMarquee = ''; rect.setAttribute('pointer-events', 'none');
    for (const [key, value] of Object.entries(bounds)) rect.setAttribute(key, String(value));
    rect.setAttribute('fill', '#63adcf22'); rect.setAttribute('stroke', '#2589ad');
    rect.setAttribute('stroke-width', '1.5'); rect.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(rect);
    const keys = new Set(this.activeSelections().map((ref) => `${ref.kind}:${ref.index}`));
    svg.querySelectorAll<SVGGElement>('[data-object]').forEach((node) => {
      node.querySelectorAll<SVGElement>('[data-selection-outline]').forEach((outline) =>
        outline.setAttribute('stroke', keys.has(`${node.dataset.object}:${node.dataset.index}`) ? '#e69c31' : this.showCollisions ? '#42a384' : 'none'));
    });
    this.root.querySelector('.tool-status')!.textContent = `框选中 · ${this.activeSelections().length} 个对象（完全包含）`;
  }
  private renderCanvas(): void {
    const l = this.map.level;
    const svg = this.svg(); svg.setAttribute('viewBox', `0 0 ${l.width} 540`);
    svg.setAttribute('width', String(l.width)); svg.setAttribute('height', '540');
    this.scaleEditorCanvas();
    let html = `<defs><pattern id="map-grid" width="${EDITOR_GRID}" height="${EDITOR_GRID}" patternUnits="userSpaceOnUse"><path d="M${EDITOR_GRID} 0H0V${EDITOR_GRID}" fill="none" stroke="#9abb9a" stroke-width=".5"/></pattern></defs>`;
    svg.style.background = SCENE_PALETTES[this.map.scene?.theme ?? 'forest'].sky[0];
    const library = mapAssets(this.map);
    for (const asset of library) ensureAssetGeometry(asset.data, this.refreshGeometry);
    html += `<g data-scene-background pointer-events="none">${this.sceneBackgroundMarkup()}</g>`;
    html += `<g data-scene-layer-zone="background">${this.sceneLayerMarkup('background')}</g>`;
    html += `<rect width="${l.width}" height="540" fill="url(#map-grid)" opacity="0.65" pointer-events="none"/>`;
    const refs = this.activeSelections();
    const selectionKeys = new Set(refs.map((ref) => `${ref.kind}:${ref.index}`));
    const selected = (kind: string, index: number) => selectionKeys.has(`${kind}:${index}`) ? '#e69c31' : '#416b59';
    const decorations = (layer: 'back' | 'front'): string => (this.map.decorations ?? []).map((p, i) => {
      if ((p.solid ? 'back' : p.layer ?? 'back') !== layer) return '';
      if (p.solid) return skin('decoration', i, p, p.x, p.y, p.width, p.height, true);
      const asset = library.find((item) => item.id === p.assetId); if (!asset) return '';
      return `<g data-object="decoration" data-index="${i}"><image href="${asset.data}" x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" preserveAspectRatio="none"/><rect data-selection-outline x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="transparent" stroke="${selected('decoration', i)}" stroke-width="1"/></g>`;
    }).join('');
    const skin = (kind: string, index: number, value: { assetId?: string; x: number; y: number }, x: number, y: number, width: number, height: number, solid = kind === 'platform'): string => {
      const asset = library.find((item) => item.id === (value.assetId ?? DEFAULT_OBJECT_SKINS[kind]));
      if (!asset) return '';
      const geometry = cachedAssetGeometry(asset.data);
      const layout = geometry ? assetLayout(geometry, x, y, width, height, solid) : { x, y, width, height };
      const picture = geometry && solid ? platformSvg(asset.data, geometry, materialFor(asset.id, this.map.platformMaterials), x, y, width, height) : geometry
        ? `<svg x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" viewBox="${geometry.x} ${geometry.y} ${geometry.width} ${geometry.height}" preserveAspectRatio="none"><image href="${asset.data}" width="${geometry.sourceWidth}" height="${geometry.sourceHeight}"/></svg>`
        : `<image href="${asset.data}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;
      const isSelected = selectionKeys.has(`${kind}:${index}`);
      const hit = objectBounds(kind as Selection['kind'], { ...value, width, height });
      return `<g data-object="${kind}" data-index="${index}"><g pointer-events="none">${picture}</g>${solid ? this.platformOutline(x, y, width, height, isSelected) : this.objectOutline(hit.x, hit.y, hit.width, hit.height, isSelected)}</g>`;
    };
    html += decorations('back');
    l.platforms.forEach((p, i) => { html += skin('platform', i, p, p.x, p.y, Math.max(1, p.width), Math.max(1, p.height)); });
    l.coins.forEach((coin, i) => {
      const p = Array.isArray(coin) ? { x: coin[0], y: coin[1] } : coin;
      const r = visualBounds('coin', p); html += skin('coin', i, p, r.x, r.y, r.width, r.height);
    });
    l.enemies.forEach((p, i) => { const r = visualBounds('enemy', p); html += `<path data-enemy-patrol="${i}" d="M${p.min} ${p.y - 10}H${p.max}" stroke="#e19c85" stroke-dasharray="6 4" pointer-events="none"/>` + skin('enemy', i, p, r.x, r.y, r.width, r.height); });
    html += decorations('front');
    for (const [kind, label, color] of [['spawn', '出生', '#68bddd'], ['checkpoint', '检查点', '#b6a0d7'], ['flag', '终点', '#ecb84f']] as const) {
      const p = l[kind]; const flag = kind === 'flag';
      html += skin(kind, 0, p, p.x, p.y - (flag ? 0 : 64), flag ? l.flag.width : 32, flag ? l.flag.height : 64);
      html += `<text data-marker-label="${kind}" x="${p.x + 3}" y="${p.y - (flag ? 8 : 72)}" font-size="14" fill="${color}" stroke="#284d3c" stroke-width=".3" pointer-events="none">${label}</text>`;
    }
    html += `<g data-scene-layer-zone="foreground">${this.sceneLayerMarkup('foreground')}</g>`;
    const selectedObject = this.object();
    if (refs.length === 1 && selectedObject && typeof selectedObject.width === 'number' && typeof selectedObject.height === 'number') {
      const x = Number(selectedObject.x), y = Number(selectedObject.y), width = Number(selectedObject.width), height = Number(selectedObject.height);
      html += `<rect data-resize="true" x="${x + width - 8}" y="${y + height - 8}" width="16" height="16" rx="3" fill="#fff2be" stroke="#b47c24" stroke-width="2" style="cursor:nwse-resize"/>`;
    }
    if (refs.length > 1) {
      const bounds = itemsBounds(selectionItems(this.map, refs))!;
      html += `<rect data-selection-bounds x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="none" stroke="#e69c31" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
    }
    svg.innerHTML = html;
    this.updateSceneParallax();
    this.drawPreview();
  }
  private drawPreview(): void {
    const svg = this.svg();
    svg.querySelector('[data-placement-preview]')?.remove();
    if (!this.preview || this.tool === 'select' || this.drag || this.pan || this.marquee) return;
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
    this.commitHistory();
    this.updateDraftState();
    this.collectHistoryAssets();
    this.renderHistoryStatus();
    this.renderViewportControls();
    this.renderSidebar();
    this.renderCanvas();
    this.renderSceneLayerControls();
    this.renderClipboardControls();
    const library = mapAssets(this.map);
    const backgroundSelect = this.root.querySelector<HTMLSelectElement>('[data-scene="background"]')!;
    const libraryChanged = library.length !== this.librarySnapshot.length || library.some((asset, i) =>
      asset.id !== this.librarySnapshot[i]?.id || asset.name !== this.librarySnapshot[i]?.name || asset.data !== this.librarySnapshot[i]?.data);
    if (libraryChanged) {
    const defaults = this.root.querySelector('.default-assets')!; defaults.replaceChildren();
    const uploads = this.root.querySelector('.uploaded-assets')!; uploads.replaceChildren();
    const sceneryAssets = this.root.querySelector('.scene-assets')!; sceneryAssets.replaceChildren();
    backgroundSelect.replaceChildren(new Option('使用主题背景', ''));
    for (const asset of library) {
      backgroundSelect.add(new Option(asset.name, asset.id));
      // 常用对象已有固定工具，不再以素材卡重复列出；场景素材归到场景分类。
      if (Object.values(DEFAULT_OBJECT_SKINS).includes(asset.id)) continue;
      const button = document.createElement('button');
      const scenery = asset.id.startsWith('builtin-scene-');
      if (scenery) button.dataset.sceneAsset = asset.id;
      else button.dataset.asset = asset.id;
      button.title = scenery ? '新增独立场景图层，在右侧调整位置与视差' : asset.id === 'builtin-moss-platform' ? '连续放置可站立平台' : '选择素材并设置放置用途';
      const image = document.createElement('img'); image.src = asset.data; image.width = 40; image.height = 40; image.style.objectFit = 'contain'; image.alt = '';
      const label = document.createElement('span'); label.textContent = asset.name + (asset.id === 'builtin-moss-platform' ? ' · 可站立' : '');
      button.append(image, label); (scenery ? sceneryAssets : DEFAULT_ASSETS.some((item) => item.id === asset.id) ? defaults : uploads).append(button);
    }
    this.librarySnapshot = library;
    }
    this.root.querySelector<HTMLButtonElement>('[data-action="collisions"]')!.setAttribute('aria-pressed', String(this.showCollisions));
    this.renderMaterialSettings();
    this.root.querySelectorAll<HTMLButtonElement>('[data-asset]').forEach((button) => button.setAttribute('aria-pressed', String(this.assetId === button.dataset.asset)));
    const toolNames: Record<Tool, string> = { select: '选择 / 拖动', platform: '跳跃平台（可站立）', coin: '星星（可收集）', enemy: '敌人', spawn: '出生点', checkpoint: '检查点', flag: '终点', decoration: '装饰（无碰撞）' };
    const toolStatus = this.root.querySelector<HTMLElement>('.tool-status')!;
    toolStatus.textContent = `${toolNames[this.tool]}${this.tool === 'platform' ? ` · ${this.paintWidth}×${this.paintHeight}` : ''}`;
    toolStatus.title = toolStatus.textContent;
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
    const refs = this.activeSelections();
    if (refs.length > 1) {
      const summary = document.createElement('p'); summary.className = 'object-type';
      const protectedCount = refs.filter((ref) => ['spawn', 'checkpoint', 'flag'].includes(ref.kind)).length;
      summary.textContent = `已选择 ${refs.length} 个对象${protectedCount ? `，含 ${protectedCount} 个仅可移动的唯一标记` : ''}`; inspector.append(summary);
      const counts = document.createElement('p'); counts.className = 'hint';
      counts.textContent = [...new Set(refs.map((ref) => ref.kind))].map((kind) => `${toolNames[kind]} × ${refs.filter((ref) => ref.kind === kind).length}`).join('；'); inspector.append(counts);
      const moves = document.createElement('div'); moves.className = 'batch-move';
      for (const [direction, text] of [['left', '←'], ['right', '→'], ['up', '↑'], ['down', '↓']]) {
        const button = document.createElement('button'); button.dataset.action = `move-${direction}`; button.textContent = text;
        button.setAttribute('aria-label', `整体向${({ left: '左', right: '右', up: '上', down: '下' } as Record<string, string>)[direction]}移动一格`); moves.append(button);
      }
      inspector.append(moves);
      const hint = document.createElement('p'); hint.className = 'hint';
      hint.textContent = '拖动已选对象可整体移动；方向键移动一格，Shift＋方向键四格。复制/删除跳过唯一标记，一次操作一次撤销。Alt 点击只选一个，再调整尺寸或具体属性。'; inspector.append(hint); return;
    }
    if (!value) { inspector.textContent = '点击对象查看和编辑属性'; return; }
    const summary = document.createElement('p'); summary.className = 'object-type';
    if (typeof value.objectId === 'string') summary.title = `稳定对象编号：${value.objectId}`;
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
  private sceneLayerMarkup(group: SceneLayer['group']): string {
    const layers = this.map.scene?.layers;
    return layers?.length ? sceneLayersSvg(layers, mapAssets(this.map), this.map.level.width, group) : '';
  }
  private renderLayerArtwork(): void {
    this.updateDraftState();
    for (const group of ['background', 'foreground'] as const) {
      const zone = this.svg().querySelector(`[data-scene-layer-zone="${group}"]`);
      if (zone) zone.innerHTML = this.sceneLayerMarkup(group);
    }
    this.updateSceneParallax();
  }
  private currentSceneLayer(): SceneLayer | undefined {
    return this.map.scene?.layers?.find((layer) => layer.id === this.selectedLayerId);
  }
  private nextLayerId(): string {
    let id: string;
    do { id = `layer-${Date.now()}-${++this.objectSerial}`; }
    while (this.map.scene?.layers?.some((layer) => layer.id === id));
    return id;
  }
  private editSceneLayer(action: string, assetId?: string): void {
    const layers = this.map.scene?.layers ?? [];
    const selected = this.currentSceneLayer();
    if (action === 'layer-preset') {
      if (layers.length && !window.confirm('替换现有视觉图层为绘本森林？平台、敌人和收集物不变，可撤销。')) return;
      this.remember();
      this.map.scene = { ...this.map.scene ?? DEFAULT_SCENE, theme: 'forest', baseMode: 'sky', backgroundAssetId: undefined, layers: forestLayerPreset() };
      this.selectedLayerId = this.map.scene.layers![0].id;
    } else if (action === 'layer-add' || action === 'layer-duplicate') {
      if (layers.length >= 16) throw new Error('最多 16 个场景图层，请复用平铺图层');
      if (action === 'layer-duplicate' && !selected) throw new Error('请先选择图层');
      const layer: SceneLayer = selected && action === 'layer-duplicate'
        ? { ...selected, id: this.nextLayerId(), name: `${selected.name.slice(0, 36)} 副本`, locked: false }
        : { id: this.nextLayerId(), name: '新场景图层', assetId: 'builtin-scene-trees', group: 'background',
          mode: 'repeat', x: 0, y: 48, width: 896, height: 400, parallax: 0.45, opacity: 0.65, visible: true, locked: false };
      if (assetId) {
        const defaults = forestLayerPreset().find((p) => p.assetId === assetId);
        if (defaults) Object.assign(layer, defaults, { id: layer.id });
      }
      this.remember(); this.map.scene ??= { ...DEFAULT_SCENE };
      (this.map.scene.layers ??= []).push(layer); this.selectedLayerId = layer.id;
    } else {
      if (!selected) throw new Error('请先选择场景图层');
      if (action === 'layer-visible' || action === 'layer-lock') {
        this.remember();
        if (action === 'layer-visible') selected.visible = !selected.visible;
        else selected.locked = !selected.locked;
      } else {
        if (selected.locked) throw new Error('图层已锁定，请先解锁后修改');
        if (action === 'layer-delete') {
          this.remember(); layers.splice(layers.indexOf(selected), 1); this.selectedLayerId = undefined;
        } else if (action === 'layer-back' || action === 'layer-forward') {
          const siblings = layers.filter((p) => p.group === selected.group);
          const target = siblings[siblings.indexOf(selected) + (action === 'layer-back' ? -1 : 1)];
          if (target) { this.reorderSceneLayer(selected.id, target.id); return; }
          return;
        } else return;
      }
    }
    this.render(); this.focusSceneLayer(); this.message('场景图层已更新，不改变碰撞；Ctrl+Z 可撤销，保存草稿后保留。');
  }
  private reorderSceneLayer(id: string, targetId: string): void {
    const layers = this.map.scene?.layers ?? [];
    const from = layers.findIndex((p) => p.id === id), to = layers.findIndex((p) => p.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    if (layers[from].locked) { this.message('图层已锁定，请先解锁后排序。'); return; }
    if (layers[from].group !== layers[to].group) { this.message('只能在同一分区排序；跨越玩法层请修改「分区」。'); return; }
    this.remember(); layers.splice(to, 0, layers.splice(from, 1)[0]); this.selectedLayerId = id;
    this.render(); this.focusSceneLayer(); this.message('图层顺序已更新；列表从后向前绘制，可撤销。');
  }
  private focusSceneLayer(): void {
    this.showInspector('layer');
    const button = this.root.querySelector<HTMLElement>(`[data-layer-select="${this.selectedLayerId}"]`)
      ?? this.root.querySelector<HTMLElement>('[data-action="layer-add"]');
    button?.focus({ preventScroll: true });
  }
  private applyLayerField(input: HTMLInputElement | HTMLSelectElement): boolean {
    const selected = this.currentSceneLayer(); if (!selected || selected.locked) return false;
    const key = input.dataset.layerField!;
    if (!['name', 'assetId', 'group', 'mode', 'x', 'y', 'width', 'height', 'parallax', 'opacity'].includes(key)) return false;
    try {
      const numeric = ['x', 'y', 'width', 'height', 'parallax', 'opacity'].includes(key);
      if (numeric && !input.value.trim()) throw new Error('图层数值不能为空，保留上次有效预览');
      const value = numeric ? Number(input.value) : input.value;
      const candidate = this.cloneMap();
      Object.assign(candidate.scene!.layers!.find((p) => p.id === selected.id)!, { [key]: value });
      // 与导入/试玩共享白名单与数值校验，外部数据不能注入 SVG 标识或链接。
      const valid = parseCustomMap(candidate, false).scene!.layers!.find((p) => p.id === selected.id)!;
      if (JSON.stringify(selected) === JSON.stringify(valid)) return true;
      this.sceneEditBefore ??= this.snapshot();
      Object.assign(selected, valid); this.renderLayerArtwork();
      this.message(`实时预览：${selected.name}；离开输入框提交一次撤销记录。`); return true;
    } catch (error) {
      this.message(error instanceof Error ? error.message : '图层设置无效'); return false;
    }
  }
  private renderSceneLayerControls(): void {
    const list = this.root.querySelector<HTMLElement>('.scene-layer-list');
    const inspector = this.root.querySelector<HTMLElement>('.layer-inspector');
    if (!list || !inspector) return;
    const focusedField = document.activeElement?.getAttribute('data-layer-field');
    const layers = this.map.scene?.layers ?? [];
    if (!this.currentSceneLayer()) this.selectedLayerId = layers[0]?.id;
    list.replaceChildren(); inspector.replaceChildren();
    for (const group of ['background', 'foreground'] as const) {
      const label = document.createElement('p'); label.className = 'layer-group-label';
      label.textContent = group === 'background' ? '背景 · 玩法后方' : '前景 · 玩法前方'; list.append(label);
      for (const layer of layers.filter((p) => p.group === group)) {
        const row = document.createElement('div'); row.className = 'scene-layer-row'; row.dataset.layerRow = layer.id;
        row.draggable = !layer.locked; row.setAttribute('role', 'listitem');
        const select = document.createElement('button'); select.dataset.layerSelect = layer.id;
        select.textContent = layer.name; select.title = `${layer.mode === 'repeat' ? '横向平铺' : '单幅图片'} · 视差 ${layer.parallax}`;
        select.setAttribute('aria-pressed', String(layer.id === this.selectedLayerId)); row.append(select);
        for (const [action, text, title] of [['layer-visible', layer.visible ? '显' : '隐', layer.visible ? '隐藏图层' : '显示图层'],
          ['layer-lock', layer.locked ? '锁' : '开', layer.locked ? '解锁图层' : '锁定图层']]) {
          const button = document.createElement('button'); button.dataset.action = action; button.dataset.layerTarget = layer.id;
          button.textContent = text; button.title = `${title}：${layer.name}`; button.setAttribute('aria-label', button.title);
          button.setAttribute('aria-pressed', String(action === 'layer-lock' ? layer.locked : layer.visible)); row.append(button);
        }
        list.append(row);
      }
    }
    const selected = this.currentSceneLayer();
    if (!selected) { inspector.textContent = '新增图层，或点击「绘本森林预设」一键搭建。'; return; }
    const library = mapAssets(this.map);
    const fields: [string, string, [string, string][]?][] = [
      ['name', '名称'], ['assetId', '素材（含上传图片）', library.map((a) => [a.id, a.name])],
      ['group', '分区', [['background', '背景 · 玩法后方'], ['foreground', '前景 · 玩法前方']]],
      ['mode', '铺设', [['repeat', '横向平铺（宽度＝单块宽度）'], ['image', '单幅图片（宽高＝显示尺寸）']]],
      ['x', 'X 偏移 / 平铺起点'], ['y', 'Y 坐标'], ['width', '单幅宽度'], ['height', '高度'],
      ['parallax', '视差（0 固定 / 1 随地图）'], ['opacity', '透明度（0～1）']];
    for (const [key, title, options] of fields) {
      const label = document.createElement('label'); label.textContent = title;
      const input = options ? document.createElement('select') : document.createElement('input');
      if (options) for (const [value, text] of options) (input as HTMLSelectElement).add(new Option(text, value));
      else {
        const field = input as HTMLInputElement;
        field.type = key === 'name' ? 'text' : 'number';
        if (key === 'name') field.maxLength = 40;
        else if (key === 'opacity' || key === 'parallax') { field.min = '0'; field.max = '1'; field.step = '0.05'; }
        else { field.step = '16'; if (key === 'width' || key === 'height') { field.min = '16'; field.max = key === 'width' ? '16384' : '4096'; } }
      }
      input.dataset.layerField = key; input.value = String(selected[key as keyof SceneLayer]); input.disabled = selected.locked;
      label.append(input); inspector.append(label);
    }
    const actions = document.createElement('div'); actions.className = 'layer-actions';
    for (const [action, text] of [['layer-back', '向后移'], ['layer-forward', '向前移'], ['layer-duplicate', '复制图层'], ['layer-delete', '删除图层']]) {
      const button = document.createElement('button'); button.dataset.action = action; button.textContent = text;
      button.disabled = selected.locked && action !== 'layer-duplicate'; actions.append(button);
    }
    inspector.append(actions);
    const hint = document.createElement('p'); hint.className = 'hint';
    hint.textContent = selected.locked ? '图层已锁定。点击列表中的「锁」解锁。' : '修改即预览。图层尺寸包含图片透明边缘，不参与碰撞；单幅图片不自动延伸整张地图。'; inspector.append(hint);
    if (focusedField) inspector.querySelector<HTMLElement>(`[data-layer-field="${focusedField}"]`)?.focus({ preventScroll: true });
  }
  private sameScene(a: SceneSettings = DEFAULT_SCENE, b: SceneSettings = DEFAULT_SCENE): boolean {
    return a.theme === b.theme && a.backgroundAssetId === b.backgroundAssetId
      && a.backgroundMode === b.backgroundMode && a.parallax === b.parallax
      && (a.baseMode ?? 'theme') === (b.baseMode ?? 'theme') && JSON.stringify(a.layers ?? []) === JSON.stringify(b.layers ?? []);
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
      const baseMode = this.root.querySelector<HTMLSelectElement>('[data-scene="baseMode"]')?.value as SceneSettings['baseMode'];
      const settings: SceneSettings = { ...this.map.scene, theme, backgroundAssetId, backgroundMode, parallax,
        ...(baseMode ? { baseMode } : {}) };
      if (!this.sameScene(this.map.scene, settings)) {
        const previous = this.map.scene ?? DEFAULT_SCENE;
        const parallaxOnly = previous.theme === theme && previous.backgroundAssetId === backgroundAssetId && previous.backgroundMode === backgroundMode && previous.baseMode === settings.baseMode;
        this.sceneEditBefore ??= this.snapshot();
        this.map.scene = settings;
        this.updateDraftState();
        // 只更新背景节点，避免重建对象、丢失选中状态、表单焦点或画布滚动位置。
        this.renderSceneBackground(parallaxOnly);
      }
      slider.value = String(parallax);
      if (fromSlider) field('parallax').value = String(parallax);
      const output = this.root.querySelector<HTMLOutputElement>('[data-parallax-value]');
      if (output) output.value = String(parallax);
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
    const previous = this.document!.restore(before);
    if (this.sameScene(previous.scene, this.map.scene)) {
      if (previous.scene) this.map.scene = previous.scene;
      else delete this.map.scene;
      return;
    }
    this.remember(before);
    this.commitHistory();
    this.collectHistoryAssets(); this.renderHistoryStatus();
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
    const output = this.root.querySelector<HTMLOutputElement>('[data-parallax-value]');
    if (output) output.value = String(scene.parallax);
    this.root.querySelector<HTMLSelectElement>('[data-scene="mode"]')!.disabled = !scene.backgroundAssetId;
    const base = this.root.querySelector<HTMLSelectElement>('[data-scene="baseMode"]');
    if (base) base.value = scene.baseMode ?? 'theme';
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
    const layers = svg.querySelectorAll<SVGGElement>('[data-scene-background] [data-preview-parallax]');
    const factors = settings.backgroundAssetId ? [settings.parallax] : settings.baseMode === 'sky' ? [] : backdropLayers(settings.theme, settings.parallax).map((l) => l.parallax);
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
    this.renderGameGuide();
  }
  private renderGameGuide(): void {
    const svg = this.svg(); svg.querySelector('[data-game-view-guide]')?.remove?.();
    if (this.editorViewMode !== 'game') return;
    const game = this.playViewport(), workspace = this.root.querySelector<HTMLElement>('.workspace')!;
    const center = (workspace.scrollLeft + workspace.clientWidth / 2 - 20) / this.editorZoom;
    const x = this.map.level.width >= game.width ? Math.max(0, Math.min(this.map.level.width - game.width, center - game.width / 2)) : (this.map.level.width - game.width) / 2;
    const y = (540 - game.height) / 2;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.gameViewGuide = ''; group.setAttribute('pointer-events', 'none');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [key, value] of Object.entries({ x, y, width: game.width, height: game.height })) rect.setAttribute(key, String(value));
    rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', '#167eaf'); rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '8 5'); rect.setAttribute('vector-effect', 'non-scaling-stroke');
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(Math.max(8, x + 8))); label.setAttribute('y', String(Math.max(20, y + 20)));
    label.setAttribute('fill', '#165877'); label.setAttribute('font-size', '14');
    label.textContent = `游玩视野 ${Math.round(game.width)} × ${Math.round(game.height)}（世界单位）`;
    group.append(rect, label); svg.append(group);
  }
  private platformOutline(x: number, y: number, width: number, height: number, selected: boolean): string {
    return `<rect data-selection-outline x="${x}" y="${y}" width="${width}" height="${height}" fill="${this.showCollisions ? '#42a38418' : 'transparent'}" stroke="${selected ? '#e69c31' : this.showCollisions ? '#42a384' : 'none'}" stroke-width="1.5"/>`
      + (this.showCollisions ? `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="#249172" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>` : '');
  }
  private objectOutline(x: number, y: number, width: number, height: number, selected: boolean): string {
    return `<rect data-selection-outline x="${x}" y="${y}" width="${width}" height="${height}" fill="transparent" stroke="${selected ? '#e69c31' : this.showCollisions ? '#42a384' : 'none'}" stroke-width="2"/>`;
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
