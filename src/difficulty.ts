import { DifficultyConfig, METEOR_DEFS, MeteorKind } from './constants';
import { DifficultyLevel, getDifficultyPreset } from './difficulty-level';

export function getDifficulty(elapsed: number, level: DifficultyLevel = 'normal'): DifficultyConfig {
  const preset = getDifficultyPreset(level);

  let spawnInterval: number;
  let maxMeteors: number;
  let speedMultiplier: number;
  let sector: number;
  let sectorMultiplier: number;

  if (elapsed < 15) {
    spawnInterval = 1.2;
    maxMeteors = 8;
    speedMultiplier = 1.0;
    sector = 1;
    sectorMultiplier = 1.0;
  } else if (elapsed < 30) {
    spawnInterval = 1.0;
    maxMeteors = 12;
    speedMultiplier = 1.05;
    sector = 2;
    sectorMultiplier = 1.0;
  } else if (elapsed < 45) {
    spawnInterval = 0.85;
    maxMeteors = 15;
    speedMultiplier = 1.1;
    sector = 2;
    sectorMultiplier = 1.2;
  } else if (elapsed < 60) {
    spawnInterval = 0.75;
    maxMeteors = 18;
    speedMultiplier = 1.15;
    sector = 3;
    sectorMultiplier = 1.2;
  } else if (elapsed < 75) {
    spawnInterval = 0.65;
    maxMeteors = 22;
    speedMultiplier = 1.2;
    sector = 3;
    sectorMultiplier = 1.5;
  } else if (elapsed < 90) {
    spawnInterval = 0.55;
    maxMeteors = 26;
    speedMultiplier = 1.25;
    sector = 4;
    sectorMultiplier = 1.5;
  } else if (elapsed < 120) {
    spawnInterval = 0.45;
    maxMeteors = 30;
    speedMultiplier = 1.3;
    sector = 4;
    sectorMultiplier = 2.0;
  } else {
    spawnInterval = 0.35;
    maxMeteors = 40;
    speedMultiplier = 1.4;
    sector = 5;
    sectorMultiplier = 2.5;
  }

  const unlockedTypes = (Object.keys(METEOR_DEFS) as MeteorKind[]).filter(
    (k) => elapsed >= METEOR_DEFS[k].unlockTime * preset.unlockTimeMult,
  );

  return {
    spawnInterval: spawnInterval * preset.spawnIntervalMult,
    maxMeteors: Math.max(4, Math.round(maxMeteors * preset.maxMeteorsMult)),
    speedMultiplier: speedMultiplier * preset.speedMult,
    unlockedTypes,
    sector,
    sectorMultiplier: sectorMultiplier * preset.scoreMult,
  };
}

export function computeScore(elapsed: number, config: DifficultyConfig): number {
  return Math.floor(elapsed * 10 * config.sectorMultiplier);
}

/** Every 30s, 3s meteor shower at 1.5x spawn rate */
export function isMeteorShower(elapsed: number): boolean {
  const cycle = elapsed % 30;
  return cycle >= 27;
}

export function getSpawnIntervalMultiplier(elapsed: number): number {
  return isMeteorShower(elapsed) ? 0.67 : 1.0;
}
