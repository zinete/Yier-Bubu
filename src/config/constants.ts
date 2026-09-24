export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;
// 游戏设计坐标：不同屏幕通过相机缩放保持该基准下的角色和地图比例。
// Gameplay keeps its original coordinate system while the canvas uses a 1920x1080 UI canvas.
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
  WIDTH: 34,
  HEIGHT: 46,
  SAFE_LANDING: 34,
  HURT_COOLDOWN: 1100,
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
