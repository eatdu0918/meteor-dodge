import { drawBackground, Starfield } from './background';
import { GAME_HEIGHT, GAME_WIDTH, GameState } from './constants';
import { clientToGame, setupDisplay } from './display';
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
  drawGameOver,
  drawHUD,
  drawSectorNotice,
  drawTitle,
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
    startGame();
  }
});

let lastTime = performance.now();

function tick(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  starfield.update(dt, GAME_WIDTH, GAME_HEIGHT);

  if (state === 'playing') {
    elapsed += dt;
    const config = getDifficulty(elapsed, selectedLevel);

    if (config.sector > lastSector) {
      lastSector = config.sector;
      sectorNoticeAlpha = 1.5;
    }
    if (sectorNoticeAlpha > 0) sectorNoticeAlpha -= dt * 0.8;

    player.update(dt, keys);

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
    drawTitle(ctx, selectedLevel, highScores);
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
  } else if (state === 'gameover') {
    drawGameOver(
      ctx,
      elapsed,
      finalScore,
      currentHighScore(),
      isNewRecord,
      selectedLevel,
    );
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
