/** Base design resolution (800×600) */
export const BASE_WIDTH = 800;
export const BASE_HEIGHT = 600;

/** Logical game world — Full HD */
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

/** Uniform scale from base design to world size */
export const WORLD_SCALE = GAME_WIDTH / BASE_WIDTH;

/** UI/font scale (height-based) */
export const UI_SCALE = GAME_HEIGHT / BASE_HEIGHT;

export const COLORS = {
  bg: '#0a0a12',
  star: '#ffffff',
  player: '#4fc3f7',
  playerEngine: '#ff7043',
  meteor: '#8d8d9a',
  meteorDark: '#5a5a68',
  meteorSmall: '#a0a0b0',
  meteorLarge: '#6b5b4f',
  cometTail: '#ffab40',
  ui: '#e8e8f0',
  uiDim: '#8888a0',
  warn: '#ff5252',
  explosion: '#ff9800',
} as const;

export type GameState = 'title' | 'playing' | 'gameover';

export interface Vec2 {
  x: number;
  y: number;
}

export interface DifficultyConfig {
  spawnInterval: number;
  maxMeteors: number;
  speedMultiplier: number;
  unlockedTypes: MeteorKind[];
  sector: number;
  sectorMultiplier: number;
}

export type MeteorKind =
  | 'basic'
  | 'small'
  | 'large'
  | 'rotating'
  | 'orbital'
  | 'split'
  | 'accelerating'
  | 'belt'
  | 'comet';

export interface MeteorDef {
  kind: MeteorKind;
  radius: number;
  speed: number;
  weight: number;
  unlockTime: number;
  label: string;
}

interface BaseMeteorDef {
  baseRadius: number;
  baseSpeed: number;
  weight: number;
  unlockTime: number;
  label: string;
}

const BASE_METEOR_DEFS: Record<MeteorKind, BaseMeteorDef> = {
  basic: { baseRadius: 14, baseSpeed: 180, weight: 40, unlockTime: 0, label: '일반' },
  small: { baseRadius: 7, baseSpeed: 280, weight: 30, unlockTime: 15, label: '소형' },
  large: { baseRadius: 28, baseSpeed: 120, weight: 15, unlockTime: 30, label: '대형' },
  rotating: { baseRadius: 16, baseSpeed: 200, weight: 12, unlockTime: 45, label: '회전' },
  orbital: { baseRadius: 12, baseSpeed: 160, weight: 10, unlockTime: 60, label: '궤도' },
  split: { baseRadius: 10, baseSpeed: 220, weight: 10, unlockTime: 75, label: '분열' },
  accelerating: { baseRadius: 13, baseSpeed: 100, weight: 8, unlockTime: 90, label: '가속' },
  belt: { baseRadius: 11, baseSpeed: 200, weight: 6, unlockTime: 120, label: '벨트' },
  comet: { baseRadius: 10, baseSpeed: 250, weight: 5, unlockTime: 150, label: '혜성' },
};

export const METEOR_DEFS: Record<MeteorKind, MeteorDef> = Object.fromEntries(
  (Object.entries(BASE_METEOR_DEFS) as [MeteorKind, BaseMeteorDef][]).map(([kind, def]) => [
    kind,
    {
      kind,
      radius: def.baseRadius * WORLD_SCALE,
      speed: def.baseSpeed * WORLD_SCALE,
      weight: def.weight,
      unlockTime: def.unlockTime,
      label: def.label,
    },
  ]),
) as Record<MeteorKind, MeteorDef>;

export const HIGH_SCORE_KEY = 'meteor-dodge-high-score';

/** Max device pixel ratio cap (performance vs sharpness) */
export const MAX_DPR = 2;
