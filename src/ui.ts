import { GAME_HEIGHT, GAME_WIDTH, UI_SCALE, Vec2 } from './constants';
import {
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  getDifficultyPreset,
} from './difficulty-level';
import { font } from './font';
import { sc, ui as uiPx } from './scale';

/*
 * 화면 UI — 오락실 판.
 *
 * 글씨가 픽셀(Galmuri11)이라 옷도 거기 맞춘다. 픽셀 그림에는 **둥근 모서리도, 흐린
 * 그림자도, 반투명 유리도 없다.** 그래서 여기서는
 *   - 상자는 각지게, 테두리는 `fillRect` 넷으로(선을 그으면 반 픽셀에 걸려 흐려진다)
 *   - 그림자는 통짜로 몇 칸 밀어 한 번 더 찍고
 *   - 「누르세요」류 안내는 깜빡인다(오락실 PRESS START 의 그 리듬)
 * 는 세 가지를 지킨다.
 */

/** 기본 설계(800×600) 크기 → 판 좌표(1920×1080) */
const px = (n: number): number => uiPx(n, UI_SCALE);

/** 글씨 그림자 — 검정에 살짝 푸른 기를 남겨 배경(우주)과 붙지 않게 */
const SHADOW = '#05050c';

const COLOR = {
  fg: '#e8e8f0',
  dim: '#8b8ba4',
  faint: '#61617a',
  cyan: '#4fc3f7',
  red: '#ff5252',
  gold: '#ffd54f',
  panel: '#0b0b16',
  line: '#3a3a52',
} as const;

/**
 * 깜빡임.
 *
 * 켜진 시간을 꺼진 시간보다 길게 둔다 — 반반이면 읽으려는 순간 사라져서 답답하다.
 * OBS 송출 화면은 스냅샷이 올 때만 그리므로 스트리머 화면과 위상이 어긋나지만,
 * 한 사람이 두 화면을 같이 보는 일은 없으니 상관없다.
 */
function blink(period = 1100, duty = 0.62): boolean {
  return (performance.now() % period) / period < duty;
}

/**
 * 깜빡이되 **사라지지는 않는** 밝기.
 *
 * 「R / SPACE 로 재시작」처럼 읽어야 하는 안내를 통째로 껐다 켜면, 꺼진 동안 그 자리가
 * 뚫린 것처럼 보이고 하필 그때 눈이 가면 무엇을 눌러야 할지 알 수 없다. 흐려지기만
 * 하면 깜빡이는 느낌은 그대로면서 글자는 늘 거기 있다.
 */
function blinkAlpha(period = 1100, low = 0.3): number {
  return blink(period) ? 1 : low;
}

interface TextOptions {
  size: number;
  color: string;
  bold?: boolean;
  align?: CanvasTextAlign;
  /** 글자 사이 — 영문 제목은 띄워야 오락실 간판처럼 보인다 */
  spacing?: number;
  /** 통짜 그림자. null 이면 안 찍는다 */
  shadow?: string | null;
  alpha?: number;
}

/** 픽셀 글씨 한 줄 */
function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  o: TextOptions,
): void {
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.textAlign = o.align ?? 'center';
  ctx.font = font(o.size, o.bold);
  if (o.spacing != null && 'letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${px(o.spacing)}px`;
  }

  const shadow = o.shadow === undefined ? SHADOW : o.shadow;
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(str, x + px(2), y + px(2));
  }
  ctx.fillStyle = o.color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** 각진 상자 — 테두리는 선이 아니라 네 개의 칸으로 그린다(반 픽셀 흐림 방지) */
function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { fill?: string; border?: string; borderWidth?: number },
): void {
  if (o.fill) {
    ctx.fillStyle = o.fill;
    ctx.fillRect(x, y, w, h);
  }
  if (o.border) {
    const b = px(o.borderWidth ?? 2);
    ctx.fillStyle = o.border;
    ctx.fillRect(x, y, w, b);
    ctx.fillRect(x, y + h - b, w, b);
    ctx.fillRect(x, y, b, h);
    ctx.fillRect(x + w - b, y, b, h);
  }
}

/** 네 귀퉁이 꺾쇠 — 「지금 고른 것」을 테두리 색만으로 말하면 약하다 */
function corners(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  const len = px(16);
  const b = px(3);
  // 테두리 **바깥으로** 물려 놓는다 — 안쪽에 그리면 같은 색 테두리에 묻혀 안 보인다
  const out = px(5);
  const [x0, y0, x1, y1] = [x - out, y - out, x + w + out, y + h + out];
  ctx.fillStyle = color;
  for (const [cx, right] of [
    [x0, false],
    [x1, true],
  ] as const) {
    for (const [cy, bottom] of [
      [y0, false],
      [y1, true],
    ] as const) {
      ctx.fillRect(right ? cx - len : cx, bottom ? cy - b : cy, len, b);
      ctx.fillRect(right ? cx - b : cx, bottom ? cy - len : cy, b, len);
    }
  }
}

export interface DifficultyCardLayout {
  level: DifficultyLevel;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getDifficultyCardLayouts(): DifficultyCardLayout[] {
  const cardW = px(200);
  const cardH = px(112);
  const gap = px(28);
  const totalW = cardW * 3 + gap * 2;
  const startX = (GAME_WIDTH - totalW) / 2;
  const y = GAME_HEIGHT / 2 + px(10);

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
  return { x: px(20), y: px(20), w: px(150), h: px(46) };
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
  const preset = getDifficultyPreset(card.level);
  const cx = card.x + card.w / 2;

  box(ctx, card.x, card.y, card.w, card.h, {
    fill: selected ? 'rgba(21, 61, 82, 0.85)' : 'rgba(10, 10, 22, 0.72)',
    border: selected ? COLOR.cyan : COLOR.line,
    borderWidth: selected ? 3 : 2,
  });
  if (selected) corners(ctx, card.x, card.y, card.w, card.h, COLOR.cyan);

  text(ctx, preset.label, cx, card.y + px(38), {
    size: 21,
    bold: true,
    color: selected ? COLOR.cyan : COLOR.fg,
  });
  text(ctx, preset.description, cx, card.y + px(64), {
    size: 12,
    color: selected ? '#9fd8f2' : COLOR.dim,
  });

  if (bestScore > 0) {
    text(ctx, `BEST ${bestScore.toFixed(1)}`, cx, card.y + card.h - px(16), {
      size: 11,
      color: selected ? '#7fb9d6' : COLOR.faint,
      spacing: 1,
    });
  }
}

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  selectedLevel: DifficultyLevel,
  highScores: Record<DifficultyLevel, number>,
  touch: boolean,
): void {
  const cx = GAME_WIDTH / 2;
  const mid = GAME_HEIGHT / 2;

  text(ctx, '운석피하기', cx, mid - px(196), {
    size: 44,
    bold: true,
    color: COLOR.fg,
    spacing: 4,
  });
  // 제목 밑 밑줄 두 줄 — 오락실 간판의 그 장식
  ctx.fillStyle = COLOR.cyan;
  ctx.fillRect(cx - px(120), mid - px(178), px(240), px(3));
  ctx.fillStyle = COLOR.line;
  ctx.fillRect(cx - px(160), mid - px(170), px(320), px(2));

  text(ctx, '우주에서 운석을 피하며 최대한 오래 생존하세요', cx, mid - px(140), {
    size: 13,
    color: COLOR.dim,
  });

  text(ctx, '- 난이도 선택 -', cx, mid - px(104), {
    size: 13,
    bold: true,
    color: '#c8c8d8',
    spacing: 3,
  });

  for (const card of getDifficultyCardLayouts()) {
    drawDifficultyCard(ctx, card, card.level === selectedLevel, highScores[card.level]);
  }

  text(ctx, touch ? '난이도 카드를 눌러 시작' : 'PRESS SPACE', cx, mid + px(164), {
    size: 18,
    bold: true,
    color: COLOR.cyan,
    spacing: 3,
    alpha: blinkAlpha(),
  });

  text(
    ctx,
    touch ? '화면을 손가락으로 끌어 조종' : '← → 1 2 3 난이도 · 방향키 / WASD 이동',
    cx,
    mid + px(198),
    { size: 12, color: COLOR.faint },
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
  ctx.strokeStyle = COLOR.cyan;
  ctx.lineWidth = sc(2);
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.28;
  ctx.fillStyle = COLOR.cyan;
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
  const preset = getDifficultyPreset(level);

  text(ctx, elapsed.toFixed(1), GAME_WIDTH / 2, px(42), {
    size: 30,
    bold: true,
    color: COLOR.fg,
    spacing: 2,
  });

  text(ctx, `BEST ${highScore.toFixed(1)}`, GAME_WIDTH - px(16), px(26), {
    size: 12,
    color: COLOR.dim,
    align: 'right',
    spacing: 1,
  });

  text(ctx, `SECTOR ${sector}`, px(16), px(26), {
    size: 12,
    color: COLOR.dim,
    align: 'left',
    spacing: 1,
  });
  text(ctx, preset.label, px(16), px(46), {
    size: 12,
    color: COLOR.faint,
    align: 'left',
  });

  if (shower && blink(700, 0.7)) {
    text(ctx, 'METEOR SHOWER', GAME_WIDTH / 2, px(70), {
      size: 13,
      bold: true,
      color: COLOR.red,
      spacing: 3,
    });
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
  const preset = getDifficultyPreset(level);
  const cx = GAME_WIDTH / 2;

  ctx.fillStyle = 'rgba(4, 4, 10, 0.72)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  /*
   * 결과는 판 위에 흩어 놓지 않고 **한 상자**에 담는다.
   * 오락실 결과창의 그 모양이기도 하고, 뒤에서 별밭이 흐르는 판에서 글씨만 떠 있으면
   * 어디까지가 결과인지 눈이 못 잡는다.
   */
  const panelW = px(400);
  const panelH = px(286);
  const panelX = cx - panelW / 2;
  const panelY = GAME_HEIGHT / 2 - px(126);

  // 통짜 그림자 — 상자도 픽셀이라 흐린 그림자를 쓰지 않는다
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(panelX + px(7), panelY + px(7), panelW, panelH);
  box(ctx, panelX, panelY, panelW, panelH, {
    fill: COLOR.panel,
    border: COLOR.fg,
    borderWidth: 3,
  });
  box(ctx, panelX + px(7), panelY + px(7), panelW - px(14), panelH - px(14), {
    border: '#2a2a40',
    borderWidth: 1,
  });

  text(ctx, 'GAME OVER', cx, panelY + px(58), {
    size: 34,
    bold: true,
    color: COLOR.red,
    spacing: 4,
    shadow: '#3a0a0a',
  });

  text(ctx, `난이도 ${preset.label}`, cx, panelY + px(84), {
    size: 12,
    color: COLOR.dim,
  });

  ctx.fillStyle = COLOR.line;
  ctx.fillRect(panelX + px(28), panelY + px(100), panelW - px(56), px(2));

  /** 결과 한 줄 — 왼쪽에 이름, 오른쪽에 값(오락실 점수판) */
  const rowX = panelX + px(32);
  const rowW = panelW - px(64);
  function row(label: string, value: string, y: number, color: string, size = 18): void {
    text(ctx, label, rowX, y, { size: 12, color: COLOR.dim, align: 'left' });
    text(ctx, value, rowX + rowW, y, { size, bold: true, color, align: 'right' });
  }

  row('생존', `${elapsed.toFixed(1)}초`, panelY + px(134), COLOR.fg, 20);
  row('점수', `${score}`, panelY + px(168), COLOR.fg);

  if (isNewRecord) {
    text(ctx, '★ NEW RECORD ★', cx, panelY + px(204), {
      size: 15,
      bold: true,
      color: COLOR.gold,
      spacing: 2,
      alpha: blinkAlpha(620, 0.45),
    });
  } else {
    row('최고 기록', `${highScore.toFixed(1)}초`, panelY + px(202), COLOR.dim, 14);
  }

  ctx.fillStyle = COLOR.line;
  ctx.fillRect(panelX + px(28), panelY + px(224), panelW - px(56), px(2));

  text(ctx, touch ? '화면을 눌러 재시작' : 'R / SPACE 로 재시작', cx, panelY + px(256), {
    size: 15,
    bold: true,
    color: COLOR.cyan,
    spacing: 1,
    alpha: blinkAlpha(),
  });

  if (!touch) {
    text(ctx, 'ESC 로 난이도 선택', cx, panelY + panelH + px(30), {
      size: 12,
      color: COLOR.faint,
    });
  }

  drawBackButton(ctx);
}

function drawBackButton(ctx: CanvasRenderingContext2D): void {
  const r = getBackButtonRect();

  box(ctx, r.x, r.y, r.w, r.h, {
    fill: 'rgba(12, 12, 24, 0.9)',
    border: COLOR.line,
    borderWidth: 2,
  });
  text(ctx, '◀ 난이도 선택', r.x + r.w / 2, r.y + r.h / 2 + px(5), {
    size: 13,
    color: '#c8c8d8',
  });
}

export function drawSectorNotice(
  ctx: CanvasRenderingContext2D,
  sector: number,
  alpha: number,
): void {
  if (alpha <= 0) return;
  const cx = GAME_WIDTH / 2;
  const y = GAME_HEIGHT / 2;
  const a = Math.min(1, alpha);

  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = COLOR.cyan;
  ctx.fillRect(cx - px(90), y - px(30), px(180), px(2));
  ctx.fillRect(cx - px(90), y + px(12), px(180), px(2));
  ctx.restore();

  text(ctx, `SECTOR ${sector}`, cx, y, {
    size: 26,
    bold: true,
    color: COLOR.cyan,
    spacing: 6,
    alpha: a,
  });
}
