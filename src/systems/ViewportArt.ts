import type Phaser from 'phaser';
import type { AssetGeometry } from './AssetGeometry';
import { platformGeometry, type PlatformMaterial, type PlatformSlice } from './PlatformMaterial';

export interface HorizontalView { x: number; width: number }
interface CameraView { scrollX: number; width: number; zoom: number }

/** Graphics with a scroll factor still share the camera's zoom origin. */
export function horizontalViewport(camera: CameraView, scrollFactor = 1, padding = 0): HorizontalView {
  const width = camera.width / camera.zoom;
  return { x: camera.scrollX * scrollFactor + (camera.width - width) / 2 - padding, width: width + padding * 2 };
}

export function visibleSequence(start: number, end: number, step: number, view: HorizontalView): number[] {
  if (step <= 0 || end <= start || view.width <= 0) return [];
  const first = Math.max(0, Math.ceil((view.x - start) / step));
  const last = Math.min(Math.ceil((end - start) / step) - 1, Math.floor((view.x + view.width - start) / step));
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => start + (first + index) * step);
}

/** Visit only repeat cells intersecting a viewport, including shapes crossing cell edges. */
export function visibleRepeats(view: HorizontalView, repeat: number, minX: number, maxX: number): number[] {
  if (!repeat) return [0];
  const first = Math.ceil((view.x - maxX) / repeat);
  const last = Math.floor((view.x + view.width - minX) / repeat);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => (first + index) * repeat);
}

/** Redraw only when entering another buffered chunk or changing zoom/viewport size. */
export function mountViewportDrawing(scene: Phaser.Scene, scrollFactor: number,
  draw: (graphics: Phaser.GameObjects.Graphics, view: HorizontalView) => void): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics().setScrollFactor(scrollFactor);
  const camera = scene.cameras.main;
  let signature = '', disposed = false;
  const sync = (): void => {
    if (disposed) return;
    const view = horizontalViewport(camera, scrollFactor, 256);
    const left = Math.floor(view.x / 256) * 256;
    const right = Math.ceil((view.x + view.width) / 256) * 256;
    const next = `${left}:${right}`;
    if (next === signature) return;
    signature = next; graphics.clear(); draw(graphics, { x: left, width: right - left });
  };
  camera.on('followupdate', sync); scene.events.on('prerender', sync);
  scene.events.once('shutdown', () => { disposed = true; camera.off('followupdate', sync); scene.events.off('prerender', sync); });
  sync(); return graphics;
}

/**
 * The same cap sizing, odd middle count, alternating mirroring and half-pixel
 * sampling as platformSlices. Compute the visible middle indices directly;
 * never enumerate the offscreen length of a million-pixel platform first.
 */
export function platformSlicesInView(g: AssetGeometry, material: PlatformMaterial,
  x: number, y: number, width: number, height: number, view: HorizontalView, padding = 96): PlatformSlice[] {
  if (width <= 0 || height <= 0 || view.width <= 0) return [];
  const min = view.x - padding, max = view.x + view.width + padding;
  if (x > max || x + width < min) return [];
  const surface = platformGeometry(g, material).surfaceY;
  const scale = height / Math.max(1, g.y + g.height - surface);
  const top = y - (surface - g.y) * scale;
  const displayHeight = g.height * scale;
  const part = (sx: number, sw: number, dx: number, dw: number, flipX = false, nextWidth = 0): PlatformSlice =>
    ({ sx, sy: g.y, sw, sh: g.height, x: dx, y: top, width: dw,
      drawWidth: dw + Math.min(0.5, nextWidth), height: displayHeight, flipX });
  if (material.mode === 'stretch') return [part(g.x, g.width, x, width)];
  const left = Math.floor(g.width * material.leftCap), right = Math.floor(g.width * material.rightCap);
  const middle = g.width - left - right;
  if (middle <= 0) return [];
  const capScale = Math.min(scale, width * 0.4 / Math.max(1, left + right));
  const leftWidth = left * capScale, rightWidth = right * capScale;
  const middleWidth = width - leftWidth - rightWidth;
  const count = Math.max(1, 2 * Math.round((middleWidth / (middle * scale) - 1) / 2) + 1);
  const cellWidth = middleWidth / count, middleX = x + leftWidth;
  const visible = (piece: PlatformSlice) => piece.x + piece.drawWidth >= min && piece.x <= max;
  const pieces: PlatformSlice[] = [];
  if (left) {
    const cap = part(g.x, left, x, leftWidth, false, cellWidth);
    if (visible(cap)) pieces.push(cap);
  }
  // Include the preceding half-pixel seam if the visible edge falls on it.
  const first = Math.max(0, Math.floor((min - middleX - 0.5) / cellWidth));
  const last = Math.min(count - 1, Math.floor((max - middleX) / cellWidth));
  for (let index = first; index <= last; index++) {
    const start = leftWidth + middleWidth * index / count;
    const end = leftWidth + middleWidth * (index + 1) / count;
    const nextWidth = index + 1 < count ? middleWidth * (index + 2) / count - middleWidth * (index + 1) / count : rightWidth;
    const piece = part(g.x + left, middle, x + start, end - start, index % 2 === 1, nextWidth);
    if (visible(piece)) pieces.push(piece);
  }
  if (right) {
    const cap = part(g.x + g.width - right, right, x + width - rightWidth, rightWidth);
    if (visible(cap)) pieces.push(cap);
  }
  return pieces;
}

export interface ViewportPlatform {
  key: string; geometry: AssetGeometry; material: PlatformMaterial;
  x: number; y: number; width: number; height: number; depth: number;
  visible?: () => boolean; alpha?: () => number;
}
export interface PlatformArtHandle { setVisible(value: boolean): void; setAlpha(value: number): void; destroy(): void }

/** One scene listener and a reusable Image pool; physics bodies stay untouched. */
export class ViewportPlatformRenderer {
  private platforms: ViewportPlatform[] = [];
  private images: Phaser.GameObjects.Image[] = [];
  private camera: Phaser.Cameras.Scene2D.Camera;
  private disposed = false;
  constructor(private scene: Phaser.Scene) {
    this.camera = scene.cameras.main;
    this.camera.on('followupdate', this.sync);
    scene.events.on('prerender', this.sync);
    scene.events.once('shutdown', this.destroy, this);
  }
  add(platform: ViewportPlatform): PlatformArtHandle {
    let visible = true, alpha = 1;
    const entry = { ...platform, visible: () => visible && (platform.visible?.() ?? true), alpha: () => alpha * (platform.alpha?.() ?? 1) };
    this.platforms.push(entry);
    return { setVisible(value) { visible = value; }, setAlpha(value) { alpha = value; }, destroy: () => {
      const index = this.platforms.indexOf(entry); if (index >= 0) this.platforms.splice(index, 1);
    } };
  }
  readonly sync = (): void => {
    if (this.disposed) return;
    const view = horizontalViewport(this.camera);
    let used = 0;
    for (const platform of this.platforms) {
      if (platform.visible && !platform.visible()) continue;
      const { key, geometry, material, x, y, width, height, depth } = platform;
      const texture = this.scene.textures.get(key);
      for (const slice of platformSlicesInView(geometry, material, x, y, width, height, view)) {
        const frame = `platform-${slice.sx}-${slice.sy}-${slice.sw}-${slice.sh}`;
        if (!texture.has(frame)) texture.add(frame, 0, slice.sx, slice.sy, slice.sw, slice.sh);
        let image = this.images[used++];
        if (!image) { image = this.scene.add.image(slice.x, slice.y, key, frame).setOrigin(0); this.images.push(image); }
        image.setTexture(key, frame).setPosition(slice.x, slice.y).setDisplaySize(slice.drawWidth, slice.height)
          .setFlipX(slice.flipX).setDepth(depth).setAlpha(platform.alpha?.() ?? 1).setVisible(true);
      }
    }
    for (let index = used; index < this.images.length; index++) this.images[index].setVisible(false);
  };
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.camera.off('followupdate', this.sync);
    this.scene.events.off('prerender', this.sync);
    this.scene.events.off('shutdown', this.destroy, this);
    this.images.forEach((image) => { if (image.scene) image.destroy(); });
    this.images.length = this.platforms.length = 0;
  }
}
