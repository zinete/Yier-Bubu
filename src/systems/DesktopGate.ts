export function isMobileDevice(device: { userAgent: string; platform: string; maxTouchPoints: number; mobile?: boolean }): boolean {
  return device.mobile === true || /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(device.userAgent)
    || (/Mac/.test(device.platform) && device.maxTouchPoints > 1);
}
export function desktopAllowed(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return !isMobileDevice({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints, mobile: nav.userAgentData?.mobile });
}
export function showDesktopRequired(root: HTMLElement): void {
  const panel = document.createElement('section');
  panel.className = 'desktop-required'; panel.setAttribute('role', 'status');
  const title = document.createElement('h1'); title.textContent = '一二布布冒险记';
  const message = document.createElement('p');
  message.textContent = '当前版本仅支持电脑，请使用电脑浏览器并连接键盘游玩。';
  panel.append(title, message); root.replaceChildren(panel);
}
