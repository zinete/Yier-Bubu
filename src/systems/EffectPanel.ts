import { getEffectPreferences, setEffectPreferences, type EffectPreferences } from './EffectPreferences';
let open: (() => void) | undefined;
export function openEffectPanel(): void { open?.(); }
export function mountEffectPanel(onOpen: () => void, onClose: () => void): () => void {
  const dialog = document.createElement('dialog');
  dialog.className = 'release-support'; dialog.setAttribute('aria-labelledby', 'effect-title');
  dialog.innerHTML = `<h2 id="effect-title">画面与特效</h2>
    <label>特效质量<select data-effect-quality><option value="auto">自动（手机减负）</option><option value="low">精简（无辉光与扭曲）</option><option value="high">丰富（WebGL 辉光与冲击波）</option></select></label>
    <label><input type="checkbox" data-reduced-motion> 减少动态效果（关闭震屏、画面扭曲与大幅缩放）</label>
    <p>立即生效。不支持 WebGL 时自动使用普通粒子与轮廓；技能、平台碰撞和机关规则不变。</p>
    <p data-effect-status role="status" aria-live="polite"></p><button type="button" data-effect-close>返回</button>`;
  document.body.append(dialog);
  const quality = dialog.querySelector<HTMLSelectElement>('[data-effect-quality]')!;
  const motion = dialog.querySelector<HTMLInputElement>('[data-reduced-motion]')!;
  const status = dialog.querySelector<HTMLElement>('[data-effect-status]')!;
  let visible = false, focus: HTMLElement | null = null;
  const show = () => {
    if (visible) return;
    const value = getEffectPreferences(); quality.value = value.quality; motion.checked = value.reducedMotion;
    status.textContent = ''; focus = document.activeElement as HTMLElement | null;
    dialog.showModal(); visible = true; onOpen(); quality.focus();
  };
  const change = () => {
    setEffectPreferences({ quality: quality.value as EffectPreferences['quality'], reducedMotion: motion.checked });
    status.textContent = '已应用；关闭窗口后手动继续游戏。';
  };
  const finish = () => { if (visible) { visible = false; onClose(); focus?.focus(); } };
  const close = () => dialog.close();
  const button = dialog.querySelector<HTMLButtonElement>('[data-effect-close]')!;
  quality.addEventListener('change', change); motion.addEventListener('change', change);
  dialog.addEventListener('close', finish); button.addEventListener('click', close); open = show;
  return () => {
    if (open === show) open = undefined;
    if (visible) { dialog.close(); finish(); }
    quality.removeEventListener('change', change); motion.removeEventListener('change', change);
    dialog.removeEventListener('close', finish); button.removeEventListener('click', close); dialog.remove();
  };
}
