export interface BuildInfo { version: string; revision: string; builtAt: string; channel: string }
interface PlayerContext { levelId?: string; character?: string; health?: number; seconds?: number; customMap?: boolean;
  mode?: 'local-coop'; phase?: string; checkpointActive?: boolean }
let openPanel: (() => void) | undefined;
export function openFeedback(): void { openPanel?.(); }

/** Deliberately excludes local saves, uploaded assets, map titles and URL/query. */
export function feedbackReport(info: BuildInfo, context: PlayerContext, description: string): string {
  return JSON.stringify({
    build: info, description: description.slice(0, 2000),
    device: { browser: navigator.userAgent.slice(0, 200), viewport: [window.innerWidth, window.innerHeight], pixelRatio: window.devicePixelRatio },
    game: {
      level: context.customMap ? 'custom' : ['1-1', '1-2', 'awakening-demo', 'coop-tutorial'].includes(context.levelId ?? '') ? context.levelId : 'menu',
      character: context.mode === 'local-coop' ? 'yier+bubu' : context.character === 'bubu' ? 'bubu' : 'yier',
      mode: context.mode === 'local-coop' ? 'local-coop' : undefined,
      phase: context.mode === 'local-coop' && ['ready', 'playing', 'paused', 'won'].includes(context.phase ?? '') ? context.phase : undefined,
      checkpointActive: context.mode === 'local-coop' ? context.checkpointActive === true : undefined,
      health: Number.isFinite(context.health) ? context.health : undefined,
      seconds: Number.isFinite(context.seconds) ? context.seconds : undefined,
    },
  }, null, 2);
}

export function mountReleaseSupport(info: BuildInfo, getContext: () => PlayerContext, onOpen: () => void, onClose: () => void): () => void {
  const dialog = document.createElement('dialog');
  dialog.className = 'release-support';
  dialog.setAttribute('aria-labelledby', 'release-title');
  dialog.innerHTML = `<h2 id="release-title">0.1 试玩反馈</h2>
    <p data-build></p>
    <p>请描述操作步骤、期望结果和实际结果。当前没有在线提交渠道，复制后可发送给游戏开发者。</p>
    <label>问题描述<textarea data-description maxlength="2000" rows="4" placeholder="例如：1-1 关，横屏跳跃时…"></textarea></label>
    <p class="privacy-note">仅在你点击时生成本地报告，不自动上传。包含版本、浏览器、屏幕与当前关卡状态，不含存档、地图素材和网址。可先检查再发送。</p>
    <label>报告预览<textarea data-report rows="5" readonly></textarea></label>
    <div><button type="button" data-copy>生成并复制报告</button><button type="button" data-close>返回游戏</button></div>
    <p data-status role="status" aria-live="polite"></p>`;
  const build = dialog.querySelector<HTMLElement>('[data-build]')!;
  build.textContent = `v${info.version} · ${info.revision}`;
  const description = dialog.querySelector<HTMLTextAreaElement>('[data-description]')!;
  const report = dialog.querySelector<HTMLTextAreaElement>('[data-report]')!;
  const status = dialog.querySelector<HTMLElement>('[data-status]')!;
  const copy = dialog.querySelector<HTMLButtonElement>('[data-copy]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-close]')!;
  document.body.append(dialog);
  let previousFocus: HTMLElement | null = null;
  let visible = false;
  const show = () => {
    if (visible) return;
    previousFocus = document.activeElement as HTMLElement | null;
    report.value = ''; status.textContent = '';
    onOpen();
    visible = true;
    dialog.showModal();
    description.focus();
  };
  const finish = () => {
    if (!visible) return;
    visible = false;
    onClose();
    previousFocus?.focus();
  };
  const hide = () => dialog.close();
  const copyReport = async () => {
    report.value = feedbackReport(info, getContext(), description.value);
    try {
      await navigator.clipboard.writeText(report.value);
      status.textContent = '已复制。请将报告发送给开发者；尚未在线提交。';
    } catch {
      report.focus(); report.select();
      status.textContent = '无法自动复制，请长按或使用 Ctrl/Cmd+C 复制已选中的报告。';
    }
  };
  copy.addEventListener('click', copyReport);
  close.addEventListener('click', hide);
  dialog.addEventListener('close', finish);
  openPanel = show;
  return () => {
    if (openPanel === show) openPanel = undefined;
    if (visible) { dialog.close(); finish(); }
    copy.removeEventListener('click', copyReport);
    close.removeEventListener('click', hide);
    dialog.removeEventListener('close', finish);
    dialog.remove();
  };
}
