// Physical KeyboardEvent.code distinguishes right Shift from left Shift.
export const COOP_KEYS = {
  p1: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', interact: 'KeyE', skill: 'KeyF' },
  p2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', interact: 'Enter', skill: 'ShiftRight' },
} as const;
export const COOP_PAUSE_KEY = 'Escape';
export const COOP_HELP = {
  p1: 'A / D 移动 · W 跳跃 · E 互动 · F 切换托举',
  p2: '← / → 移动 · ↑ 跳跃 · Enter 互动 · 右 Shift 切换托举',
};
