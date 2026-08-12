import { GAME_HEIGHT, GAME_WIDTH, UI_SCALE, Vec2 } from './constants';
import {
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  getDifficultyPreset,
} from './difficulty-level';
import { sc, ui as uiPx } from './scale';

export interface DifficultyCardLayout {
  level: DifficultyLevel;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getDifficultyCardLayouts(): DifficultyCardLayout[] {
  const u = UI_SCALE;
  const cardW = uiPx(200, u);
  const cardH = uiPx(110, u);
  const gap = uiPx(28, u);
  const totalW = cardW * 3 + gap * 2;
  const startX = (GAME_WIDTH - totalW) / 2;
  const y = GAME_HEIGHT / 2 + uiPx(10, u);

  return DIFFICULTY_PRESETS.map((preset, i) => ({
    level: preset.id,
    x: startX + i * (cardW + gap),
    y,
    w: cardW,
    h: cardH,
  }));
}

export function hitTestDifficultyCard(x: number, y: number): DifficultyLevel | null {
  for (const card of getDifficultyCardLayouts()) {
    if (x >= card.x && x <= card.x + card.w && y >= card.y && y <= card.y + card.h) {
      return card.level;
    }
  }
  return null;
}

/**
 * 게임오버 화면 좌상단의 '난이도 선택' 버튼.
 * ESC 를 누를 수 없는 터치 기기에서 난이도를 다시 고를 유일한 통로다.
 */
export function getBackButtonRect(): { x: number; y: number; w: number; h: number } {
  const u = UI_SCALE;
  return { x: uiPx(20, u), y: uiPx(20, u), w: uiPx(150, u), h: uiPx(48, u) };
}

export function hitTestBackButton(x: number, y: number): boolean {
  const r = getBackButtonRect();
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function drawDifficultyCard(
  ctx: CanvasRenderingContext2D,
  card: DifficultyCardLayout,
  selected: boolean,
  bestScore: number,
): void {
  const u = UI_SCALE;
  const preset = getDifficultyPreset(card.level);
  const pad = uiPx(12, u);

  ctx.fillStyle = selected ? 'rgba(79, 195, 247, 0.18)' : 'rgba(255, 255, 255, 0.05)';
  ctx.strokeStyle = selected ? '#4fc3f7' : '#44445a';
  ctx.lineWidth = selected ? uiPx(3, u) : uiPx(1.5, u);

  const r = uiPx(10, u);
  ctx.beginPath();
  ctx.roundRect(card.x, card.y, card.w, card.h, r);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = selected ? '#4fc3f7' : '#e8e8f0';
  ctx.font = 'bold ' + uiPx(22, u) + 'px system-ui, sans-serif';
  ctx.fillText(preset.label, card.x + card.w / 2, card.y + pad + uiPx(24, u));

  ctx.fillStyle = '#8888a0';
  ctx.font = uiPx(14, u) + 'px system-ui, sans-serif';
  ctx.fillText(preset.description, card.x + card.w / 2, card.y + pad + uiPx(50, u));

  if (bestScore > 0) {
    ctx.fillStyle = '#666680';
    ctx.font = uiPx(12, u) + 'px system-ui, sans-serif';
    ctx.fillText('최고 ' + bestScore.toFixed(1) + 's', card.x + card.w / 2, card.y + card.h - pad);
  }
}

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  selectedLevel: DifficultyLevel,
  highScores: Record<DifficultyLevel, number>,
  touch: boolean,
): void {
  const u = UI_SCALE;
  ctx.textAlign = 'center';

  ctx.fillStyle = '#e8e8f0';
  ctx.font = 'bold ' + uiPx(48, u) + 'px system-ui, sans-serif';
  ctx.fillText('운석피하기', GAME_WIDTH / 2, GAME_HEIGHT / 2 - uiPx(200, u));

  ctx.font = uiPx(18, u) + 'px system-ui, sans-serif';
  ctx.fillStyle = '#8888a0';
  ctx.fillText(
    '우주에서 운석을 피하며 최대한 오래 생존하세요',
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2 - uiPx(155, u),
  );

  ctx.fillStyle = '#c8c8d8';
  ctx.font = 'bold ' + uiPx(16, u) + 'px system-ui, sans-serif';
  ctx.fillText('난이도 선택', GAME_WIDTH / 2, GAME_HEIGHT / 2 - uiPx(115, u));

  for (const card of getDifficultyCardLayouts()) {
    drawDifficultyCard(ctx, card, card.level === selectedLevel, highScores[card.level]);
  }

  ctx.fillStyle = '#4fc3f7';
  ctx.font = uiPx(18, u) + 'px system-ui, sans-serif';
  ctx.fillText(
    touch ? '난이도 카드를 눌러 시작' : '← → 또는 1·2·3 · SPACE로 시작',
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2 + uiPx(160, u),
  );

  ctx.fillStyle = '#8888a0';
  ctx.font = uiPx(16, u) + 'px system-ui, sans-serif';
  ctx.fillText(
    touch ? '화면을 손가락으로 끌어 조종' : '방향키 / WASD — 이동',
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2 + uiPx(195, u),
  );
}

/** 조종 중인 가상 스틱 — 손가락이 잡은 자리와 기운 방향을 보여 준다 */
export function drawTouchStick(
  ctx: CanvasRenderingContext2D,
  anchor: Vec2,
  knob: Vec2,
  radius: number,
): void {
  ctx.save();

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#4fc3f7';
  ctx.lineWidth = sc(2);
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, sc(24), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  elapsed: number,
  highScore: number,
  sector: number,
  shower: boolean,
  level: DifficultyLevel,
): void {
  const u = UI_SCALE;
  const preset = getDifficultyPreset(level);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8e8f0';
  ctx.font = 'bold ' + uiPx(32, u) + 'px monospace';
  ctx.fillText(elapsed.toFixed(1), GAME_WIDTH / 2, uiPx(40, u));

  ctx.textAlign = 'right';
  ctx.font = uiPx(14, u) + 'px system-ui, sans-serif';
  ctx.fillStyle = '#8888a0';
  ctx.fillText('BEST ' + highScore.toFixed(1) + 's', GAME_WIDTH - uiPx(16, u), uiPx(24, u));

  ctx.textAlign = 'left';
  ctx.fillText('SECTOR ' + sector, uiPx(16, u), uiPx(24, u));
  ctx.fillStyle = '#666680';
  ctx.fillText(preset.label, uiPx(16, u), uiPx(44, u));

  if (shower) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5252';
    ctx.font = 'bold ' + uiPx(14, u) + 'px system-ui, sans-serif';
    ctx.fillText('METEOR SHOWER', GAME_WIDTH / 2, uiPx(64, u));
  }
}

export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  elapsed: number,
  score: number,
  highScore: number,
  isNewRecord: boolean,
  level: DifficultyLevel,
  touch: boolean,
): void {
  const u = UI_SCALE;
  const preset = getDifficultyPreset(level);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5252';
  ctx.font = 'bold ' + uiPx(40, u) + 'px system-ui, sans-serif';
  ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - uiPx(90, u));

  ctx.fillStyle = '#8888a0';
  ctx.font = uiPx(16, u) + 'px system-ui, sans-serif';
  ctx.fillText('난이도: ' + preset.label, GAME_WIDTH / 2, GAME_HEIGHT / 2 - uiPx(55, u));

  ctx.fillStyle = '#e8e8f0';
  ctx.font = uiPx(24, u) + 'px system-ui, sans-serif';
  ctx.fillText('생존 ' + elapsed.toFixed(1) + '초', GAME_WIDTH / 2, GAME_HEIGHT / 2 - uiPx(15, u));

  ctx.fillStyle = '#8888a0';
  ctx.font = uiPx(18, u) + 'px system-ui, sans-serif';
  ctx.fillText('점수 ' + score, GAME_WIDTH / 2, GAME_HEIGHT / 2 + uiPx(25, u));

  if (isNewRecord) {
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold ' + uiPx(18, u) + 'px system-ui, sans-serif';
    ctx.fillText('NEW RECORD!', GAME_WIDTH / 2, GAME_HEIGHT / 2 + uiPx(60, u));
  } else {
    ctx.fillText('최고 기록 ' + highScore.toFixed(1) + '초', GAME_WIDTH / 2, GAME_HEIGHT / 2 + uiPx(60, u));
  }

  ctx.fillStyle = '#4fc3f7';
  ctx.font = uiPx(20, u) + 'px system-ui, sans-serif';
  ctx.fillText(
    touch ? '화면을 누르면 재시작' : 'R / SPACE — 재시작',
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2 + uiPx(115, u),
  );

  if (!touch) {
    ctx.fillStyle = '#8888a0';
    ctx.font = uiPx(16, u) + 'px system-ui, sans-serif';
    ctx.fillText('ESC — 난이도 선택', GAME_WIDTH / 2, GAME_HEIGHT / 2 + uiPx(150, u));
  }

  drawBackButton(ctx);
}

function drawBackButton(ctx: CanvasRenderingContext2D): void {
  const u = UI_SCALE;
  const r = getBackButtonRect();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.strokeStyle = '#44445a';
  ctx.lineWidth = uiPx(1.5, u);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, uiPx(10, u));
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c8c8d8';
  ctx.font = 'bold ' + uiPx(16, u) + 'px system-ui, sans-serif';
  ctx.fillText('← 난이도 선택', r.x + r.w / 2, r.y + r.h / 2);
  ctx.textBaseline = 'alphabetic';
}

export function drawSectorNotice(ctx: CanvasRenderingContext2D, sector: number, alpha: number): void {
  if (alpha <= 0) return;
  const u = UI_SCALE;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4fc3f7';
  ctx.font = 'bold ' + uiPx(28, u) + 'px system-ui, sans-serif';
  ctx.fillText('SECTOR ' + sector, GAME_WIDTH / 2, GAME_HEIGHT / 2);
  ctx.restore();
}
