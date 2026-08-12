import { GAME_HEIGHT, GAME_WIDTH, MAX_DPR } from './constants';

export function setupDisplay(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): () => void {
  function apply(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    const fitScale = Math.min(
      window.innerWidth / GAME_WIDTH,
      window.innerHeight / GAME_HEIGHT,
    );
    canvas.style.width = `${Math.floor(GAME_WIDTH * fitScale)}px`;
    canvas.style.height = `${Math.floor(GAME_HEIGHT * fitScale)}px`;

    canvas.width = Math.round(GAME_WIDTH * dpr);
    canvas.height = Math.round(GAME_HEIGHT * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  apply();
  window.addEventListener('resize', apply);
  return apply;
}

/** Map browser pointer coords to game world coords */
export function clientToGame(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * GAME_WIDTH,
    y: ((clientY - rect.top) / rect.height) * GAME_HEIGHT,
  };
}
