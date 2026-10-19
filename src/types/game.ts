export type CharacterId = 'yier' | 'bubu';
export type GameStatus = 'playing' | 'paused' | 'won' | 'lost';
export interface AwakeningData { budOffsetX: number; budOffsetY: number; durationMs: number }
export interface PlatformData {
  objectId?: string;
  assetId?: string;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'ground' | 'platform';
  awakening?: AwakeningData;
}
export interface EnemyData {
  objectId?: string;
  assetId?: string;
  x: number;
  y: number;
  min: number;
  max: number;
  speed: number;
  attack?: EnemyAttackData;
}
export interface EnemyAttackData {
  range: number;
  cooldown: number;
  projectileSpeed: number;
  projectileArc: number;
  projectileGravity: number;
  projectileLifetime: number;
}
export interface Point {
  objectId?: string;
  assetId?: string;
  x: number;
  y: number;
}
export interface LevelData {
  id: string;
  width: number;
  timeLimit: number;
  spawn: Point;
  checkpoint: Point;
  flag: { x: number; y: number; width: number; height: number; assetId?: string; objectId?: string };
  platforms: PlatformData[];
  coins: Array<Point | [number, number]>;
  enemies: EnemyData[];
  awakeningGoal?: boolean;
}
export interface HudState {
  health: number;
  score: number;
  coins: number;
  totalCoins: number;
  seconds: number;
  character: CharacterId;
  paused: boolean;
  skillReady: boolean;
  skillCharge: number;
  levelId: string;
  progress: number;
  checkpointReached: boolean;
  tutorialStep: number;
  customMap: boolean;
  awakening?: { lit: number; total: number; goalLocked: boolean };
  shield?: import('../systems/BubbleShield').ShieldState;
}
