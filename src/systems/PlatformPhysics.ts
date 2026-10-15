/** 单向浮台：上升时穿过，只有从台面上方下落时承接角色。 */
export function canLandOnPlatform(velocityY: number, previousBottom: number, platformTop: number): boolean {
  return velocityY >= 0 && previousBottom <= platformTop + 4;
}
