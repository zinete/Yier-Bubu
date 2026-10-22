import { desktopAllowed, showDesktopRequired } from './systems/DesktopGate';
import './style.css';
const root = document.getElementById('app')!;
let disposed = false;
let dispose: (() => void) | undefined;
if (!desktopAllowed()) showDesktopRequired(root);
else {
  root.textContent = '正在打开冒险…';
  void import('./GameApp').then(({ bootGame }) => {
    if (!disposed) { root.replaceChildren(); dispose = bootGame(); }
  }).catch(() => {
    if (!disposed) root.textContent = '游戏加载失败，请刷新页面重试。';
  });
}
import.meta.hot?.dispose(() => { disposed = true; dispose?.(); });
