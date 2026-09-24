export type CharacterId = 'yier' | 'bubu';
export type GameStatus = 'playing' | 'paused' | 'won' | 'lost';
export interface PlatformData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'ground' | 'platform';
}
export interface EnemyData {
  x: number;
  y: number;
  min: number;
  max: number;
  speed: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface LevelData {
  id: string;
  width: number;
  timeLimit: number;
  spawn: Point;
  checkpoint: Point;
  flag: { x: number; y: number; width: number; height: number };
  platforms: PlatformData[];
  coins: Array<Point | [number, number]>;
  enemies: EnemyData[];
}
export interface HudState {
  health: number;
  score: number;
  coins: number;
  totalCoins: number;
  seconds: number;
  character: CharacterId;
  paused: boolean;
}
