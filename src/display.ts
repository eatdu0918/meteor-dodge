import { GAME_HEIGHT, GAME_WIDTH, MAX_DPR } from './constants';

/**
 * 판 좌표(1920×1080) → 실제 화면 픽셀 배율.
 *
 * 픽셀 글씨체가 이 값을 보고 크기를 정수로 맞춘다(font.ts).
 */
let renderScale = 0;

export function getRenderScale(): number {
  return renderScale;
}

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
    const cssWidth = Math.floor(GAME_WIDTH * fitScale);
    // 세로는 가로에서 뽑는다 — 각각 내림하면 비율이 미세하게 어긋난다
    const cssHeight = Math.round((cssWidth * GAME_HEIGHT) / GAME_WIDTH);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    /*
     * 캔버스 픽셀 수를 **화면에 나오는 크기 그대로** 잡는다.
     *
     * 예전에는 판 크기(1920×1080)로 잡아 두고 CSS 로 줄여 보여 줬는데, 그러면 그림이
     * 한 번 더 축소되면서(1920 → 1084) 글씨와 가는 선이 죄다 흐릿해진다. 픽셀 글씨체는
     * 그 흐림이 특히 도드라진다 — 그릴 때부터 최종 크기로 그리면 선이 또렷하고,
     * 덤으로 그릴 픽셀 수도 3분의 1로 준다.
     *
     * 좌표는 그대로 판 기준(1920×1080)이다. 배율만 여기서 한 번 걸어 둔다.
     */
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    renderScale = canvas.width / GAME_WIDTH;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
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
