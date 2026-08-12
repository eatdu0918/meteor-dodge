export type DifficultyLevel = 'easy' | 'normal' | 'hard';

export interface DifficultyPreset {
  id: DifficultyLevel;
  label: string;
  description: string;
  /** >1 = slower spawns */
  spawnIntervalMult: number;
  /** <1 = fewer meteors on screen */
  maxMeteorsMult: number;
  /** meteor speed multiplier */
  speedMult: number;
  /** >1 = new meteor types unlock later */
  unlockTimeMult: number;
  /** score multiplier */
  scoreMult: number;
}

export const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  {
    id: 'easy',
    label: '쉬움',
    description: '느린 운석 · 적은 수',
    spawnIntervalMult: 1.45,
    maxMeteorsMult: 0.65,
    speedMult: 0.8,
    unlockTimeMult: 1.6,
    scoreMult: 0.8,
  },
  {
    id: 'normal',
    label: '보통',
    description: '기본 난이도',
    spawnIntervalMult: 1.0,
    maxMeteorsMult: 1.0,
    speedMult: 1.0,
    unlockTimeMult: 1.0,
    scoreMult: 1.0,
  },
  {
    id: 'hard',
    label: '어려움',
    description: '빠른 운석 · 많은 수',
    spawnIntervalMult: 0.72,
    maxMeteorsMult: 1.35,
    speedMult: 1.25,
    unlockTimeMult: 0.65,
    scoreMult: 1.5,
  },
];

export function getDifficultyPreset(level: DifficultyLevel): DifficultyPreset {
  return DIFFICULTY_PRESETS.find((p) => p.id === level) ?? DIFFICULTY_PRESETS[1];
}

export function cycleDifficulty(current: DifficultyLevel, dir: -1 | 1): DifficultyLevel {
  const idx = DIFFICULTY_PRESETS.findIndex((p) => p.id === current);
  const next = (idx + dir + DIFFICULTY_PRESETS.length) % DIFFICULTY_PRESETS.length;
  return DIFFICULTY_PRESETS[next].id;
}

export function difficultyFromKey(key: string): DifficultyLevel | null {
  if (key === '1') return 'easy';
  if (key === '2') return 'normal';
  if (key === '3') return 'hard';
  return null;
}

export function highScoreKey(level: DifficultyLevel): string {
  return `meteor-dodge-high-score-${level}`;
}
