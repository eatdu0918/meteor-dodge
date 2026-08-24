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
  lerpMeteorDodge,
  packMeteor,
  unpackMeteor,
  r1,
  r3,
  type MeteorDodgeSnapshot,
} from './mirror';
import { createMirrorTimeline, pushMirrorSample, readMirrorState } from './mirror-timeline';
import {
  holdBackgroundKeepAlive,
  integrateWithSubsteps,
  startResilientLoop,
} from './resilient-loop';
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

/**
 * 관전(방송 화면) 쪽 되재생 재료.
 *
 * 받은 장들을 **호스트가 뜬 시각**을 시간축 삼아 이어 그린다(mirror-timeline.ts). 도착
 * 시각으로 이으면 망 지연의 흔들림이 그대로 판의 속도가 된다.
 */
const specTimeline = createMirrorTimeline();
let specLastTick = 0;
/** 걸어 둔 「가려져도 계속」 — 두 번 걸지 않으려고 들고 있는다 */
let releaseKeepAlive: (() => void) | null = null;

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
  notifyParentGameStart();
  resetGame();
  state = 'playing';
}

/**
 * 인방모 iframe 호스트(MeteorDodgeGameHost)로 판 시작 알림.
 *
 * 호스트가 판 위에 띄운 「기록 저장 완료」 알림을 지우게 하는 신호다 — 다음 판을
 * 시작했는데 지난 판의 결과가 판 위에 남아 있으면 게임 화면을 가린다.
 */
function notifyParentGameStart(): void {
  if (window.parent === window) return;
  window.parent.postMessage({ type: 'inbangmo:meteor-dodge:start' }, window.location.origin);
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
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  // 탭이 숨겨져도(다른 탭·앱으로 이동) 판이 멎지 않도록, 큰 dt는 잘게 쪼개
  // update() 를 여러 번 불러 따라잡는다 — 클램프해서 버리지 않는다.
  integrateWithSubsteps(dt, update, 0.05, 3);
  draw();
}

/**
 * OBS 송출 화면과 주고받는 창구.
 *
 * **시작 화면(title)도 보낸다.** 예전에는 여기서 null 을 내 방송 화면을 비웠는데,
 * 그러면 스트리머가 게임을 열어 두고 난이도를 고르는 동안 방송에는 아무것도 안 나갔다.
 * 시청자가 보는 것이 곧 스트리머가 보고 있는 화면이어야 한다. 시작 화면도 결과 화면도
 * 캔버스에 그려지므로(drawTitle·drawGameOver) 관전 쪽은 받은 상태로 그대로 그린다.
 */
installMirrorBridge({
  capture: (): MeteorDodgeSnapshot => {
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

  setKeepAlive: (on: boolean) => {
    if (on) {
      if (!releaseKeepAlive) releaseKeepAlive = holdBackgroundKeepAlive();
    } else {
      releaseKeepAlive?.();
      releaseKeepAlive = null;
    }
  },

  /**
   * 받은 장을 타임라인에 쌓는다 — 그리는 것은 관전 루프가 한다.
   *
   * 여기서 곧바로 그리면 20Hz 끊김이 그대로 방송에 나간다. 대신 호스트가 뜬 시각을
   * 시간축 삼아, 루프가 장 사이를 이어 그린다(mirror-timeline.ts).
   */
  apply: (snapshot: MeteorDodgeSnapshot, hostAt?: number | null) => {
    const now = performance.now();
    // 시각을 모르는 장(봉투 없이 온 옛 화면)은 도착 시각으로 대신한다
    pushMirrorSample(specTimeline, snapshot, hostAt ?? now);
    // 루프가 안 돌고 있으면(첫 장이거나 rAF·타이머가 둘 다 멎은 환경) 여기서 한 번
    // 굴린다 — 최악이어도 도착하는 장마다 화면이 나간다(예전 동작).
    if (now - specLastTick > 35) specTick(now);
  },
});

/** 관전 화면이 지금 그려야 할 장을 판에 앉힌다 */
function applySnapshot(snapshot: MeteorDodgeSnapshot): void {
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
}

/**
 * 관전 루프 — 판은 굴리지 않고, 받은 장들을 호스트가 뜬 박자대로 되재생한다.
 *
 * 예전에는 장이 도착할 때만 그렸다. 그러면 OBS 가 초당 20장짜리 끊긴 판을 캡처한다 —
 * 운석은 쉬지 않고 흐르는 판이라 그 끊김이 그대로 보인다. 이제 두 장 사이를 이어
 * 그린다(lerpMeteorDodge).
 *
 * 별밭은 여기서도 굴리지 않는다 — 판정에 관여하지 않는 장식이고, 스냅샷에도 안 실린다.
 */
function specTick(now: number): void {
  if (specLastTick && now - specLastTick < 4) return;
  specLastTick = now;
  const snapshot = readMirrorState(specTimeline, now, lerpMeteorDodge) as MeteorDodgeSnapshot | null;
  if (!snapshot) return;
  applySnapshot(snapshot);
  draw();
}

/**
 * 어느 쪽이든 같은 루프를 쓴다 — rAF 가 도는 동안은 rAF 로, 창이 가려져 rAF 가 멎으면
 * 워커 시계로(resilient-loop.ts 머리 주석).
 *
 * 관전 화면은 「가려져도 계속」을 스스로 건다 — 이 화면은 존재 이유가 방송 송출이라
 * 아무도 안 보고 있을 때가 없다. 굴리는 쪽은 중계 중일 때만 부모가 켜 준다(setKeepAlive).
 */
if (spectate) holdBackgroundKeepAlive();
startResilientLoop(spectate ? specTick : tick);

/*
 * 글씨체(Galmuri11)가 도착하면 한 장 다시 그린다.
 *
 * 게임 화면은 매 프레임 다시 그리니 저절로 바뀌지만, OBS 송출 화면은 스냅샷이 올 때만
 * 그린다 — 첫 장이 폰트보다 먼저 오면 대체 글씨가 그대로 방송에 박힌다.
 */
redrawWhenFontsReady(draw);
