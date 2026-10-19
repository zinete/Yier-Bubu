// c:\Users\gyc\Documents\trae_projects\ss\Yier&Bubu\src\systems\UILayout.ts
import { DESIGN_HEIGHT } from '../config/constants';

export interface ControlLayout {
  x: number;
  y: number;
  size: number;
}

export interface UILayoutSpec {
  margin: number;
  hud: { x: number; y: number; width: number; height: number; scale: number };
  topButtonSize: number;
  joystick: ControlLayout & { hitSize: number };
  jump: ControlLayout;
  attack: ControlLayout;
  shield: ControlLayout;
}

const VISUAL_MARGIN = 14;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// 画布 = 安全区域（CSS body padding 已排除刘海），VISUAL_MARGIN 保证 UI 不贴安全区边缘。
export const computeUILayout = (width: number, height: number): UILayoutSpec => {
  const uiScale = clamp(height / DESIGN_HEIGHT, 0.85, 1.6);
  const compact = width < 760;
  const margin = VISUAL_MARGIN + (compact ? 0 : 6);

  const topButtonSize = clamp(uiScale * 44, 40, 92);
  const reserve = topButtonSize * 2 + 28;
  const availableHudWidth = width - margin * 2 - reserve - 12;
  const hudWidth = Math.min(availableHudWidth, Math.max(240, Math.min(width * 0.36, 620)));
  const hudHeight = Math.round((hudWidth * 353) / 1268);
  const hudScale = hudWidth / 420;

  const joystickSize = clamp(uiScale * (compact ? 96 : 118), 88, 190);
  const jumpSize = clamp(uiScale * 88, 64, 168);
  const attackSize = clamp(uiScale * 74, 56, 148);
  const gap = Math.round(clamp(uiScale * 10, 8, 18));

  const jumpX = width - margin - jumpSize / 2;
  const jumpY = height - margin - jumpSize / 2;
  const attackX = jumpX - jumpSize / 2 - gap - attackSize / 2;
  const attackY = height - margin - attackSize / 2 - Math.round(attackSize * 0.18);
  const shieldSize = clamp(uiScale * 66, 56, 120);

  return {
    margin,
    hud: {
      x: margin + 24 * hudScale,
      y: margin,
      width: hudWidth,
      height: hudHeight,
      scale: hudScale,
    },
    topButtonSize,
    joystick: {
      x: margin + joystickSize / 2,
      y: height - margin - joystickSize / 2,
      size: joystickSize,
      hitSize: Math.round(joystickSize * 1.6),
    },
    jump: { x: jumpX, y: jumpY, size: jumpSize },
    attack: { x: attackX, y: attackY, size: attackSize },
    shield: { x: attackX, y: attackY - attackSize / 2 - gap - shieldSize / 2, size: shieldSize },
  };
};

export const isTouchPrimaryDevice = (): boolean => {
  if (typeof window.matchMedia !== 'function') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  if (coarse && noHover) return true;
  if (window.matchMedia('(pointer: fine)').matches) return false;
  return coarse || noHover;
};
