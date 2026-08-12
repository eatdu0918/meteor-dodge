import { WORLD_SCALE } from './constants';

/** Scale a base-design pixel value to world coordinates */
export function sc(n: number): number {
  return n * WORLD_SCALE;
}

/** Scale a UI/font value */
export function ui(n: number, uiScale: number): number {
  return n * uiScale;
}
