/**
 * OBS 송출 화면으로 판을 넘기는 창구.
 *
 * 인방모의 통합 OBS 주소(/widget/{token}/game)가 이 게임을 그릴 때, 오버레이용 화면을
 * 따로 만들지 않고 **이 임베드를 한 번 더 띄운다**(`?mode=spectate`). 그리는 코드가 한
 * 벌이라 게임을 고쳐도 방송 화면이 조용히 어긋나지 않는다.
 *
 *   스트리머 화면: capture() 로 지금 판을 뜬다 → 소켓 → 방송 화면: apply() 로 그린다
 *
 * ## 운석은 그리는 데 쓰는 것만 보낸다
 *
 * 판에는 운석이 최대 서른 개까지 뜨고, 한 개가 열네 개 값을 들고 있다(속도·궤도 중심·
 * 가속 여부 …). 그대로 20Hz 로 보내면 초당 수백 KB 가 된다.
 *
 * 그런데 그 값의 절반은 **다음 위치를 계산하는 데** 쓰이고 그리는 데는 안 쓰인다.
 * 방송 화면은 계산을 하지 않으므로(스트리머 화면이 이미 했다) 그리는 데 쓰는 일곱 개만
 * 골라 **배열로** 싣는다 — 키 이름이 값보다 긴 것들이라 배열이 훨씬 짧다.
 *
 * 소수점도 자른다. 좌표를 0.1px 까지만 보내도 눈으로는 같은 자리이고, 자릿수가 곧
 * 글자 수라 그만큼 짐이 준다.
 *
 * 별밭(starfield)은 아예 안 보낸다 — 판정에 관여하지 않는 장식이라 방송 화면이 자기
 * 별을 자기가 띄우면 된다.
 */

import type { DifficultyLevel } from './difficulty-level';
import type { Meteor } from './meteor';
import type { GameState, MeteorKind } from './constants';

/** 인방모 프론트 lib/game-mirror.ts 의 GAME_MIRROR_BRIDGE_KEY 와 같아야 한다 */
const BRIDGE_KEY = 'inbangmoMirror';

/** 배열 자리를 이름 대신 쓰기 위한 순서 — 그리기에서 갈리는 것만 */
const KINDS: MeteorKind[] = [
  'small',
  'large',
  'rotating',
  'comet',
  'accelerating',
  'orbital',
  // 뒤에만 붙인다 — 앞의 자리를 바꾸면 배포 사이에 색이 어긋난다
  'basic',
  'split',
  'belt',
];

/** [종류, x, y, 반지름, 회전, 꼬리각, 경고시간] */
export type PackedMeteor = [number, number, number, number, number, number, number];

export interface MeteorDodgeSnapshot {
  state: GameState;
  level: DifficultyLevel;
  /**
   * 난이도별 최고 기록.
   *
   * 방송 화면의 localStorage 가 아니라 **스트리머 것**을 보내야 한다 — OBS 브라우저
   * 소스는 이 게임을 한 번도 한 적이 없어서, 안 보내면 0 으로 방송에 나간다.
   */
  highScores: Record<DifficultyLevel, number>;
  elapsed: number;
  meteors: PackedMeteor[];
  /** 우주선 — [x, y, 각도] */
  player: [number, number, number];
  /** 폭발 — [경과, x, y]. 안 터졌으면 null */
  boom: [number, number, number] | null;
  sector: number;
  sectorAlpha: number;
  finalScore: number;
  isNewRecord: boolean;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function packMeteor(m: Meteor): PackedMeteor {
  return [
    Math.max(0, KINDS.indexOf(m.kind)),
    r1(m.x),
    r1(m.y),
    r1(m.radius),
    r3(m.rotation),
    r3(m.tailAngle),
    r3(m.warnTime),
  ];
}

/**
 * 그리기에 쓰이는 값만 되살린다.
 *
 * 나머지 필드는 `drawMeteor` 가 보지 않으므로 그럴듯한 기본값으로 채운다 — 방송
 * 화면에서 이 운석이 **움직일 일은 없다**(다음 장이 곧 온다).
 */
export function unpackMeteor(p: PackedMeteor): Meteor {
  return {
    id: 0,
    kind: KINDS[p[0]] ?? 'small',
    x: p[1],
    y: p[2],
    radius: p[3],
    rotation: p[4],
    tailAngle: p[5],
    warnTime: p[6],
    vx: 0,
    vy: 0,
    rotationSpeed: 0,
    accelerated: false,
    alive: true,
  };
}

export interface MirrorBridge {
  capture(): MeteorDodgeSnapshot | null;
  apply(snapshot: MeteorDodgeSnapshot): void;
}

export function installMirrorBridge(bridge: MirrorBridge): void {
  (window as unknown as Record<string, MirrorBridge>)[BRIDGE_KEY] = bridge;
}

/** `?mode=spectate` — 방송 화면으로 뜬 것인가 */
export function isSpectateMode(): boolean {
  return new URLSearchParams(window.location.search).get('mode') === 'spectate';
}

export { r1, r3 };
