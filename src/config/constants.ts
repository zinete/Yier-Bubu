// 游戏设计坐标：World 相机保证 960x540 基准视野，宽屏仅增加横向可视范围。
// Canvas 使用设备实际尺寸（RESIZE），UI 直接使用真实屏幕坐标（UILayout）。
export const DESIGN_WIDTH = 960;
export const DESIGN_HEIGHT = 540;
export const WORLD_WIDTH = 4200;
export const WORLD_HEIGHT = 540;
export const PLAYER = {
  // 角色水平移动与空中控制参数
  SPEED: 300,
  GROUND_ACCELERATION: 2200,
  AIR_ACCELERATION: 1350,
  GROUND_DRAG: 2100,
  AIR_DRAG: 260,
  JUMP_VELOCITY: -590,
  // 上升、下落采用不同重力，令落地更干脆
  NORMAL_GRAVITY: 1450,
  FALL_GRAVITY: 2250,
  MAX_FALL_SPEED: 900,
  // 土狼时间和跳跃缓冲，单位毫秒
  COYOTE_TIME: 125,
  JUMP_BUFFER_TIME: 135,
  JUMP_CUT_MULTIPLIER: 0.45,
  HURT_COOLDOWN: 1100,
} as const;
export const COMBAT = {
  PLAYER_ATTACK_COOLDOWN: 650,
  PLAYER_PROJECTILE_SPEED: 520,
  PLAYER_PROJECTILE_ARC: -35,
  PLAYER_PROJECTILE_GRAVITY: 120,
  PLAYER_PROJECTILE_LIFETIME: 1450,
  PLAYER_PROJECTILE_POOL_SIZE: 6,
  ENEMY_PROJECTILE_POOL_SIZE: 8,
} as const;
export const REGISTRY = { CHARACTER: 'selectedCharacter', AUDIO: 'audioSettings' } as const;
export const SCENE = {
  BOOT: 'BootScene',
  PRELOAD: 'PreloadScene',
  START: 'StartScene',
  GAME: 'GameScene',
  UI: 'UIScene',
  RESULT: 'ResultScene',
} as const;
