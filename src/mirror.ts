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

/**
 * [종류, x, y, 반지름, 회전, 꼬리각, 경고시간, **번호**]
 *
 * 번호(id)는 그리는 데 안 쓰는데도 싣는다 — 방송 화면이 **장과 장 사이를 이어 그릴 때**
 * 「지난 장의 이 운석이 이번 장의 어느 것인가」를 짚어야 하기 때문이다. 자리(배열 인덱스)로
 * 짚으면 안 된다: 화면 밖으로 나간 운석을 목록 가운데에서 걷어내면(main.ts 의 filter)
 * 뒤쪽이 전부 한 칸씩 당겨져, **운석 N 을 운석 N+1 의 자리로 끌어당긴다** — 화면을
 * 가로지르는 사선 줄무늬가 된다.
 *
 * 뒤에 붙인 이유는 KINDS 와 같다 — 앞자리를 밀면 배포 사이에 값이 어긋난다.
 */
export type PackedMeteor = [number, number, number, number, number, number, number, number];

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
    m.id,
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
    id: p[7] ?? 0,
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
  /**
   * @param hostAt 호스트가 이 장을 뜬 시각(호스트의 performance.now 기준 ms). 되재생의
   *   시간축이다 — 도착 시각으로 대신하면 망 지연의 흔들림이 그대로 판의 속도가 된다
   *   (mirror-timeline.ts 머리 주석). 부모가 봉투를 풀어 넣어 준다.
   */
  apply(snapshot: MeteorDodgeSnapshot, hostAt?: number | null): void;
  /**
   * 가려져도 판이 제 속도로 돌아야 하는가 — 중계 중인 동안 부모가 켜 준다.
   *
   * 크롬은 안 보이는 문서의 타이머를 1Hz 로 조인다. 스트리머가 OBS 로 브라우저를 덮으면
   * 이 임베드도 가려진 것이 되어 **판이 초당 한 칸씩만 나아간다.**
   */
  setKeepAlive(on: boolean): void;
}

/**
 * 두 장 사이 t(0~1) 지점의 판을 만든다 — 방송 화면이 이어 그릴 때 쓴다.
 *
 * 이어 붙이는 것은 **실제로 흐르는 값**뿐이다. 판정·표시에 쓰는 이산값(상태·난이도·
 * 최고 기록·구역 번호)은 이번 장 것을 그대로 쓴다.
 *
 * 세 가지를 조심한다:
 *   · **운석은 번호로 짚는다.** 자리로 짚으면 중간이 걷어내진 순간 엉뚱한 운석과 이어진다.
 *   · **경고 중인 운석은 안 움직인다**(warnTime > 0 이면 제자리에서 표식만 뜬다). 이어
 *     그리면 아직 오지도 않은 운석이 스르르 미끄러진다.
 *   · **우주선 각도는 ±π 에서 감긴다.** 그냥 이으면 왼쪽↔오른쪽으로 꺾을 때 한 바퀴 돈다.
 */
export function lerpMeteorDodge(
  prevState: unknown,
  nextState: unknown,
  t: number,
): MeteorDodgeSnapshot {
  const prev = prevState as MeteorDodgeSnapshot;
  const next = nextState as MeteorDodgeSnapshot;
  // 판이 갈아엎어진 장면은 이을 수 없다 — 이번 장으로 바로 짚는다
  if (!prev || prev.state !== next.state || next.elapsed < prev.elapsed) return next;

  const l = (a: number, b: number) => a + (b - a) * t;
  const prevById = new Map<number, PackedMeteor>();
  prev.meteors.forEach((m) => prevById.set(m[7], m));

  return {
    ...next,
    elapsed: l(prev.elapsed, next.elapsed),
    sectorAlpha: l(prev.sectorAlpha, next.sectorAlpha),
    meteors: next.meteors.map((m) => {
      const p = prevById.get(m[7]);
      // 경고 중이었거나 지금 경고 중이면 제자리다 — 위치를 잇지 않는다
      if (!p || p[6] > 0 || m[6] > 0) return m;
      const out = [...m] as PackedMeteor;
      out[1] = l(p[1], m[1]);
      out[2] = l(p[2], m[2]);
      out[4] = lerpAngle(p[4], m[4], t);
      out[5] = lerpAngle(p[5], m[5], t);
      out[6] = l(p[6], m[6]);
      return out;
    }),
    player: [
      l(prev.player[0], next.player[0]),
      l(prev.player[1], next.player[1]),
      lerpAngle(prev.player[2], next.player[2], t),
    ],
    boom:
      prev.boom && next.boom
        ? [l(prev.boom[0], next.boom[0]), next.boom[1], next.boom[2]]
        : next.boom,
  };
}

/** 각도를 **가까운 쪽으로** 잇는다 — ±π 에서 감기므로 그냥 이으면 먼 길로 돈다 */
function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export function installMirrorBridge(bridge: MirrorBridge): void {
  (window as unknown as Record<string, MirrorBridge>)[BRIDGE_KEY] = bridge;
}

/** `?mode=spectate` — 방송 화면으로 뜬 것인가 */
export function isSpectateMode(): boolean {
  return new URLSearchParams(window.location.search).get('mode') === 'spectate';
}

export { r1, r3 };
