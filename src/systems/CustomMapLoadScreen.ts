/** DOM recovery UI stays available before the playable scene and its camera exist. */
export class CustomMapLoadScreen {
  private readonly root = document.createElement('section');
  private readonly panel = document.createElement('div');
  private readonly title = document.createElement('h2');
  private readonly detail = document.createElement('p');
  private readonly retry = document.createElement('button');
  private readonly back = document.createElement('button');
  private readonly actions = document.createElement('div');
  private readonly close = document.createElement('button');
  constructor(onRetry: () => void, onBack: () => void) {
    this.root.className = 'custom-map-load';
    Object.assign(this.root.style, { position: 'absolute', inset: '0', zIndex: '80', display: 'grid', placeItems: 'center', background: '#183e37cc', padding: '18px', boxSizing: 'border-box' });
    Object.assign(this.panel.style, { maxWidth: '620px', maxHeight: '100%', overflow: 'auto', boxSizing: 'border-box', padding: '24px', border: '2px solid #d3bc8b', borderRadius: '22px', background: '#fff7e5', color: '#416b59', font: '16px/1.6 sans-serif' });
    Object.assign(this.title.style, { margin: '0 0 12px', fontSize: 'clamp(18px, 3vw, 26px)' });
    Object.assign(this.detail.style, { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    Object.assign(this.actions.style, { display: 'flex', gap: '12px', flexWrap: 'wrap' });
    for (const button of [this.retry, this.back, this.close]) {
      button.type = 'button';
      Object.assign(button.style, { minHeight: '44px', padding: '10px 18px', color: '#fff7e5', background: '#416b59', border: '0', borderRadius: '12px', cursor: 'pointer', font: 'inherit' });
    }
    this.retry.textContent = '重试失败素材'; this.back.textContent = '返回地图工坊'; this.close.textContent = '知道了';
    this.retry.addEventListener('click', onRetry); this.back.addEventListener('click', onBack);
    this.close.addEventListener('click', () => this.destroy());
    this.actions.append(this.retry, this.back, this.close);
    this.panel.append(this.title, this.detail, this.actions); this.root.append(this.panel);
    (document.getElementById('app') ?? document.body).append(this.root);
  }
  loading(): void {
    this.root.setAttribute('role', 'status'); this.root.setAttribute('aria-live', 'polite');
    this.title.textContent = '正在加载地图素材…'; this.detail.textContent = '已加载成功的素材会保留，请稍候。';
    this.retry.hidden = true; this.back.hidden = false; this.back.disabled = true; this.close.hidden = true;
  }
  failed(required: string[], optional: string[]): void {
    this.root.setAttribute('role', 'alert');
    this.title.textContent = '地图还不能开始试玩';
    this.detail.textContent = `以下玩法素材加载或读取失败：\n${required.join('、')}\n\n请重试，或返回工坊更换素材。${optional.length ? `\n另有装饰素材不可用：${optional.join('、')}` : ''}`;
    this.retry.hidden = false; this.back.hidden = false; this.back.disabled = false; this.close.hidden = true;
  }
  degraded(names: string[]): void {
    this.root.setAttribute('role', 'status'); this.root.setAttribute('aria-live', 'polite');
    Object.assign(this.root.style, { background: 'transparent', pointerEvents: 'none', display: 'block' });
    Object.assign(this.panel.style, { position: 'absolute', left: '16px', bottom: '16px', maxWidth: 'min(620px, calc(100% - 32px))', maxHeight: '45%', padding: '12px 18px', fontSize: '14px', pointerEvents: 'auto' });
    this.title.textContent = '部分场景装饰未加载';
    this.detail.textContent = `${names.join('、')}。已略过这些装饰，关卡可以正常试玩。`;
    this.retry.hidden = true; this.back.hidden = true; this.close.hidden = false;
  }
  destroy(): void { this.root.remove(); }
}
