import './font.css';

import { drawBackground, Starfield } from './background';
import { GAME_HEIGHT, GAME_WIDTH, GameState } from './constants';
import { clientToGame, setupDisplay } from './display';
import { redrawWhenFontsReady } from './font';
import {
  computeScore,
  getDifficulty,
  getSpawnIntervalMultiplier,
  isMeteorShower,
} from './difficulty';
import {
  cycleDifficulty,
  DifficultyLevel,
  difficultyFromKey,
  highScoreKey,
} from './difficulty-level';
import {
  drawExplosion,
  drawMeteor,
  getCollisionRadius,
  isOffScreen,
  Meteor,
  Spawner,
  updateMeteor,
} from './meteor';
import { circleCollision, Player } from './player';
import {
  installMirrorBridge,
  isSpectateMode,
  packMeteor,
  unpackMeteor,
  r1,
  r3,
  type MeteorDodgeSnapshot,
} from './mirror';
import { VirtualStick } from './touch';
import {
  drawGameOver,
  drawHUD,
  drawSectorNotice,
  drawTitle,
  drawTouchStick,
  hitTestBackButton,
  hitTestDifficultyCard,
} from './ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

setupDisplay(canvas, ctx);

function loadHighScore(level: DifficultyLevel): number {
  const v = localStorage.getItem(highScoreKey(level));
  if (v) return parseFloat(v);
  // migrate legacy single high score to normal
  if (level === 'normal') {
    const legacy = localStorage.getItem('meteor-dodge-high-score');
    if (legacy) return parseFloat(legacy);
  }
  return 0;
}

function saveHighScore(level: DifficultyLevel, value: number): void {
  localStorage.setItem(highScoreKey(level), value.toString());
}

function loadAllHighScores(): Record<DifficultyLevel, number> {
  return {
    easy: loadHighScore('easy'),
    normal: loadHighScore('normal'),
    hard: loadHighScore('hard'),
  };
}

const keys = new Set<string>();
const stick = new VirtualStick();

/**
 * OBS 송출 화면으로 뜬 것인가 (mirror.ts 참고).
 *
 * 켜져 있으면 **그리기만** 남긴다 — 조종도 운석 생성도 없다. 방송 화면이 자기 판을
 * 따로 돌리면 스트리머 화면과 어긋나므로, 여기 판은 오직 apply() 로만 바뀐다.
 */
const spectate = isSpectateMode();

if (!spectate) stick.attach(canvas);

/** 터치가 주 입력인 기기 — 화면 안내를 키보드 대신 손가락 기준으로 바꾼다 */
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

const player = new Player();
const spawner = new Spawner();
const starfield = new Starfield(280, GAME_WIDTH, GAME_HEIGHT);

let state: GameState = 'title';
let selectedLevel: DifficultyLevel = 'normal';
let highScores = loadAllHighScores();
let meteors: Meteor[] = [];
let elapsed = 0;
let explosionTime = 0;
let explosionX = 0;
let explosionY = 0;
let lastSector = 1;
let sectorNoticeAlpha = 0;
let finalScore = 0;
let isNewRecord = false;

function currentHighScore(): number {
  return highScores[selectedLevel];
}

function resetGame(): void {
  player.reset();
  spawner.reset();
  stick.reset();
  meteors = [];
  elapsed = 0;
  explosionTime = 0;
  lastSector = 1;
  sectorNoticeAlpha = 0;
  finalScore = 0;
  isNewRecord = false;
}

function startGame(): void {
  resetGame();
  state = 'playing';
}

function goToTitle(): void {
  state = 'title';
  resetGame();
}

function endGame(): void {
  state = 'gameover';
  explosionTime = 0.001;
  explosionX = player.x;
  explosionY = player.y;
  const config = getDifficulty(elapsed, selectedLevel);
  finalScore = computeScore(elapsed, config);
  isNewRecord = elapsed > currentHighScore();
  if (isNewRecord) {
    highScores[selectedLevel] = elapsed;
    saveHighScore(selectedLevel, elapsed);
  }
  notifyParentGameOver(elapsed, selectedLevel, finalScore);
}

/** 인방모 iframe 호스트(MeteorDodgeGameHost)로 게임 오버 알림 */
function notifyParentGameOver(
  survivalSec: number,
  difficulty: DifficultyLevel,
  score: number,
): void {
  if (window.parent === window) return;
  // API는 정수 초만 받는다(@IsInt). 황새 게임과 동일하게 반올림.
  const survivalScore = Math.max(1, Math.round(survivalSec));
  window.parent.postMessage(
    {
      type: 'inbangmo:meteor-dodge:gameover',
      difficulty,
      score: survivalScore,
      durationSec: survivalScore,
      points: score,
    },
    window.location.origin,
  );
}

function selectDifficulty(level: DifficultyLevel): void {
  selectedLevel = level;
}

/**
 * 게임이 쓰는 키의 브라우저 기본 동작(스크롤)을 막을 대상.
 * iframe 임베드(인방모 게임 페이지)에서 방향키를 누르면 iframe 문서가
 * overflow:hidden 이라 스크롤이 부모 페이지로 넘어가 페이지 자체가 움직인다.
 */
const SCROLL_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  ' ',
  'Spacebar',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

window.addEventListener(
  'keydown',
  (e) => {
    if (SCROLL_KEYS.has(e.key)) e.preventDefault();
  },
  { capture: true },
);

window.addEventListener(
  'keyup',
  (e) => {
    if (SCROLL_KEYS.has(e.key)) e.preventDefault();
  },
  { capture: true },
);

if (!spectate) attachInput();

function attachInput(): void {
window.addEventListener('keydown', (e) => {
  keys.add(e.key);

  if (state === 'title') {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      selectDifficulty(cycleDifficulty(selectedLevel, -1));
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      selectDifficulty(cycleDifficulty(selectedLevel, 1));
    } else {
      const fromKey = difficultyFromKey(e.key);
      if (fromKey) selectDifficulty(fromKey);
    }
  }

  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    if (state === 'title') startGame();
    else if (state === 'gameover') startGame();
  }

  if (e.key === 'Escape') {
    if (state === 'gameover' || state === 'playing') goToTitle();
  }

  if ((e.key === 'r' || e.key === 'R') && state === 'gameover') {
    startGame();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key);
});

canvas.addEventListener('click', (e) => {
  const { x, y } = clientToGame(canvas, e.clientX, e.clientY);

  if (state === 'title') {
    const hit = hitTestDifficultyCard(x, y);
    if (hit) {
      selectDifficulty(hit);
      startGame();
    }
    return;
  }

  if (state === 'gameover') {
    if (hitTestBackButton(x, y)) goToTitle();
    else startGame();
  }
});
}

let lastTime = performance.now();

/**
 * 판을 한 칸 굴린다.
 *
 * 방송 화면(관전 모드)은 이걸 부르지 않는다 — 판은 스트리머 화면이 굴린 결과가
 * 스냅샷으로 온다. 여기서 또 굴리면 두 화면이 어긋난다.
 */
function update(dt: number): void {
  // 별밭은 장식이라 방송 화면도 자기 것을 자기가 굴린다 (mirror.ts 주석)
  starfield.update(dt, GAME_WIDTH, GAME_HEIGHT);

  if (state === 'playing') {
    elapsed += dt;
    const config = getDifficulty(elapsed, selectedLevel);

    if (config.sector > lastSector) {
      lastSector = config.sector;
      sectorNoticeAlpha = 1.5;
    }
    if (sectorNoticeAlpha > 0) sectorNoticeAlpha -= dt * 0.8;

    player.update(dt, keys, stick.dir);

    const intervalMult = getSpawnIntervalMultiplier(elapsed);
    const effectiveInterval = config.spawnInterval * intervalMult;

    const spawned = spawner.update(
      dt,
      elapsed,
      effectiveInterval,
      config.maxMeteors,
      config.speedMultiplier,
      config.unlockedTypes,
      player.x,
      player.y,
      meteors.length,
    );
    meteors.push(...spawned);

    for (const m of meteors) {
      updateMeteor(m, dt, player.x, player.y);
    }

    meteors = meteors.filter((m) => !isOffScreen(m));

    for (const m of meteors) {
      if (m.warnTime > 0) continue;
      const hit = getCollisionRadius(m);
      if (circleCollision(player.x, player.y, player.radius, hit.x, hit.y, hit.r)) {
        endGame();
        break;
      }
    }
  }

  if (state === 'gameover' && explosionTime > 0) {
    explosionTime += dt;
  }
}

/** 지금 값으로 한 장 그린다 — 굴리기와 갈라 두어 방송 화면이 이것만 부를 수 있게 */
function draw(): void {
  drawBackground(ctx, GAME_WIDTH, GAME_HEIGHT);
  starfield.draw(ctx);

  for (const m of meteors) {
    drawMeteor(ctx, m);
  }

  if (state !== 'gameover' || explosionTime < 0.6) {
    player.draw(ctx);
  }

  if (state === 'gameover' && explosionTime > 0) {
    drawExplosion(ctx, explosionX, explosionY, explosionTime);
  }

  if (state === 'title') {
    drawTitle(ctx, selectedLevel, highScores, isTouchDevice);
  } else if (state === 'playing') {
    const config = getDifficulty(elapsed, selectedLevel);
    drawHUD(
      ctx,
      elapsed,
      currentHighScore(),
      config.sector,
      isMeteorShower(elapsed),
      selectedLevel,
    );
    drawSectorNotice(ctx, lastSector, sectorNoticeAlpha);
    if (stick.anchor && stick.knob) {
      drawTouchStick(ctx, stick.anchor, stick.knob, stick.radius);
    }
  } else if (state === 'gameover') {
    drawGameOver(
      ctx,
      elapsed,
      finalScore,
      currentHighScore(),
      isNewRecord,
      selectedLevel,
      isTouchDevice,
    );
  }

}

function tick(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(tick);
}

/**
 * OBS 송출 화면과 주고받는 창구.
 *
 * `capture` 가 시작 화면(title)에서 null 을 내는 이유: 방송에 내보낼 판이 아직 없다.
 * 「송출 화면이 없는 게임」의 기본값이 「비우기」인 것과 같은 판단이다 — 방송 화면에
 * 엉뚱한 것이 떠 있는 쪽이 빈 것보다 위험하다. 끝난 판(gameover)은 결과를 보여 줘야
 * 하므로 보낸다.
 */
installMirrorBridge({
  capture: (): MeteorDodgeSnapshot | null => {
    if (state === 'title') return null;
    return {
      state,
      level: selectedLevel,
      highScores,
      elapsed: r3(elapsed),
      meteors: meteors.map(packMeteor),
      player: [r1(player.x), r1(player.y), r3(player.angle)],
      boom: explosionTime > 0 ? [r3(explosionTime), r1(explosionX), r1(explosionY)] : null,
      sector: lastSector,
      sectorAlpha: r3(sectorNoticeAlpha),
      finalScore,
      isNewRecord,
    };
  },

  apply: (snapshot: MeteorDodgeSnapshot) => {
    state = snapshot.state;
    selectedLevel = snapshot.level;
    highScores = snapshot.highScores;
    elapsed = snapshot.elapsed;
    meteors = snapshot.meteors.map(unpackMeteor);
    player.x = snapshot.player[0];
    player.y = snapshot.player[1];
    player.angle = snapshot.player[2];
    explosionTime = snapshot.boom ? snapshot.boom[0] : 0;
    explosionX = snapshot.boom ? snapshot.boom[1] : 0;
    explosionY = snapshot.boom ? snapshot.boom[2] : 0;
    lastSector = snapshot.sector;
    sectorNoticeAlpha = snapshot.sectorAlpha;
    finalScore = snapshot.finalScore;
    isNewRecord = snapshot.isNewRecord;
    // rAF 를 기다리지 않고 여기서 그린다 — 창이 안 보이면 rAF 는 멈추는데(OBS 가
    // 스로틀할 수 있다) 그릴 재료는 계속 오고 있다. 그리는 빈도가 곧 아는 만큼이다.
    draw();
  },
});

/**
 * 방송 화면은 판을 굴리지 않으므로 루프를 돌리지 않는다.
 *
 * 굴릴 것이 없는데 60Hz 로 도는 것은 OBS 안에서 그대로 낭비이고, 20Hz 로 오는 스냅샷을
 * 60Hz 로 다시 그려 봐야 같은 장면을 세 번 그릴 뿐이다.
 */
if (!spectate) requestAnimationFrame(tick);

/*
 * 글씨체(Galmuri11)가 도착하면 한 장 다시 그린다.
 *
 * 게임 화면은 매 프레임 다시 그리니 저절로 바뀌지만, OBS 송출 화면은 스냅샷이 올 때만
 * 그린다 — 첫 장이 폰트보다 먼저 오면 대체 글씨가 그대로 방송에 박힌다.
 */
redrawWhenFontsReady(draw);
