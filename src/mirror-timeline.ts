/**
 * OBS 송출 화면이 20Hz 스냅샷을 **끊김 없이 되재생**하는 타임라인.
 *
 * 스냅샷은 초당 20장뿐이라 오는 대로 그리면 방송이 초당 20장짜리 끊긴 판이 된다. 두 장
 * 사이를 이어 그려야 하는데, **무엇을 시간축으로 삼느냐**가 매끄러움을 가른다.
 *
 * ## 도착 시각을 시간축으로 쓰면 안 된다
 *
 * 처음에는 "지난 장 도착 → 이번 장 도착" 간격으로 이었다. 그런데 그 간격은 호스트가
 * 보낸 간격이 아니라 **거기에 망 지연의 흔들림이 더해진 값**이다. 장마다 다른 폭으로
 * 흔들리니 이어 그린 판의 속도가 프레임마다 달라진다 — 「조금 끊기는 듯한」 느낌의
 * 정체가 이것이었다. 실측(참값 x(t)=t 재현 실험): 화면속도 표준편차 0.306.
 *
 * 그래서 **호스트가 그 장을 뜬 순간의 시각**을 같이 실어 보내고, 그 시각을 시간축으로 삼는다. 망이 흔들려도 장들이 놓이는 자리는 안 흔들린다
 * — 같은 실험에서 표준편차 0.005.
 *
 * ⚠ 이 파일은 인방모 프론트의 `src/lib/mirror-timeline.ts` 와 **같은 내용이다.** 임베드는
 * 레포가 달라 import 로 묶을 수가 없다 — 한쪽을 고치면 다른 쪽도 같이 고칠 것.
 *
 * ## 재생 머리는 뒤에서 따라간다
 *
 * 가장 새 장에 딱 붙어 재생하면 다음 장이 조금만 늦어도 그릴 것이 없어 멈춘다. 그래서
 * 도착 간격의 두 배만큼(대개 100~130ms) **뒤에서** 재생한다 — 그 사이에 다음 장이
 * 도착할 시간을 벌어 준다. 방송이 그만큼 늦지만, 견줄 대상이 없는 화면이라 보이지 않는다.
 *
 * 재생 머리는 실제 시간과 같은 속도로 나아가고, 목표(가장 새 장 - 지연)와 어긋난 만큼만
 * **조금씩** 당겨진다. 목표로 매번 튀게 하면 그 순간마다 판이 튄다 — 지금 고치려는 것이
 * 바로 그 튐이다. 호스트와 이 기계의 시계가 서로 다른 원점을 가져도(둘 다
 * `performance.now()`) 이 방식은 원점 차이를 스스로 흡수한다.
 */

/**
 * 사이를 **지어내지 않는** 이음새 — 그 장을 다음 장의 시각까지 그대로 든다.
 *
 * 고정 박자로 도는 판(1대1 배구는 25fps 고정 스텝)에 쓴다. 그런 판은 위치를 이어 그리면
 * 안 된다 — 두 장 사이에 공이 바닥이나 네트에 맞아 방향을 바꿨을 수 있어서, 곧게 이으면
 * **공이 바닥을 뚫고 들어갔다 되돌아온다.**
 *
 * 이걸 써도 얻는 것이 있다: 재생 머리가 호스트 시계 위에서 돌기 때문에 각 장이 **뜬 순서
 * 그대로의 간격으로** 나타난다. 망 지연이 흔들려 어떤 장은 30ms, 어떤 장은 70ms 만에
 * 나타나던 것이 없어진다 — 지금 고치려는 끊김의 정체가 그것이다.
 */
export const holdMirrorState = (prev: unknown, next: unknown, t: number): unknown =>
  t < 1 ? prev : next;

export interface MirrorSample {
  state: unknown;
  /** 호스트가 이 장을 뜬 시각 (호스트의 performance.now 기준 ms) */
  hostAt: number;
}

export interface MirrorTimeline {
  /** 호스트 시각 오름차순. 재생이 지나간 장은 버린다 */
  samples: MirrorSample[];
  /** 장 사이 간격(ms)의 지수평균 — 지연을 얼마나 둘지 정하는 데 쓴다 */
  gap: number;
  /** 재생 머리 — 호스트 시계 위의 위치. 아직 못 정했으면 null */
  head: number | null;
  /** 마지막으로 머리를 밀어 준 이 기계의 시각 */
  lastNow: number | null;
}

/** 지연의 하한·상한(ms). 20Hz 면 대개 100~130 사이로 잡힌다 */
const MIN_DELAY = 90;
const MAX_DELAY = 320;

/** 간격 추정에 넣어 줄 최대 간격(ms) — 넘으면 「끊겼다 붙은 것」으로 본다 */
const MAX_TRACKED_GAP = 500;

/**
 * 이만큼 어긋나면 조금씩 당기지 않고 곧바로 옮긴다.
 *
 * 판이 새로 시작했거나 한참 끊겼다 붙은 것이라, 그 사이를 이어 그리는 것은 뜻이 없다.
 */
const RESYNC_MS = 1_000;

/** 어긋남을 따라잡는 시상수(ms) — 작을수록 급하게 당긴다 */
const CORRECTION_TAU = 500;

/**
 * 따라잡느라 바뀌는 재생 속도의 상한.
 *
 * 이 값이 곧 화면 속도가 흔들리는 폭이다 — 목표는 장이 도착할 때마다 계단처럼 움직이니
 * 보정은 늘 조금씩 걸려 있다. 8% 로 뒀을 때 실측 흔들림 0.047, 3% 에서 0.02 대로 내려간다.
 * 더 낮추면 끊겼다 붙었을 때 제자리를 찾는 데 오래 걸린다.
 */
const MAX_CORRECTION_RATE = 0.03;

/** 한 번의 프레임에서 인정할 최대 경과(ms) — 탭이 멎었다 돌아온 경우를 자른다 */
const MAX_STEP_MS = 250;

/**
 * 버퍼 상한.
 *
 * 이어 그리는 데 실제로 쓰이는 것은 지연 구간에 걸친 서너 장뿐이다(실측 최대 5). 넉넉히
 * 두되 한계는 둔다 — 보간을 안 쓰는 게임은 지나간 장을 버리는 길을 타지 않아서, 상한이
 * 없으면 판 하나가 끝날 때까지 계속 쌓인다.
 */
const MAX_SAMPLES = 30;

export function createMirrorTimeline(): MirrorTimeline {
  return { samples: [], gap: 0, head: null, lastNow: null };
}

/**
 * 스냅샷 한 장을 타임라인에 놓는다.
 *
 * 호스트 시각이 뒤로 가면(스트리머가 새로고침해 `performance.now()` 원점이 바뀌었거나
 * 다른 화면이 주인 자리를 넘겨받았다) 이어 붙일 수 있는 장이 아니라 처음부터 다시 깐다.
 */
export function pushMirrorSample(tl: MirrorTimeline, state: unknown, hostAt: number): void {
  const last = tl.samples[tl.samples.length - 1];
  if (last) {
    if (hostAt <= last.hostAt) {
      tl.samples = [{ state, hostAt }];
      tl.gap = 0;
      tl.head = null;
      return;
    }
    const gap = hostAt - last.hostAt;
    // 한참 벌어진 것은 끊겼다 붙은 것이라 간격 추정에 넣지 않는다. 이걸 섞으면 공백
    // 한 번에 추정 간격이 몇 배로 뛰고, 그만큼 지연이 늘어난 채 한동안 안 돌아온다.
    // 상한이 넉넉한 이유는 스트리머 탭이 뒤로 가면 호스트가 200ms 간격으로 떨어지는데
    // (resilient-loop) 그건 실제 간격이라 따라가야 하기 때문이다.
    if (gap < MAX_TRACKED_GAP) tl.gap = tl.gap ? tl.gap * 0.7 + gap * 0.3 : gap;
  }
  tl.samples.push({ state, hostAt });
  if (tl.samples.length > MAX_SAMPLES) tl.samples.splice(0, tl.samples.length - MAX_SAMPLES);
}

/** 지금 두는 지연(ms) */
export function mirrorDelay(tl: MirrorTimeline): number {
  return Math.min(MAX_DELAY, Math.max(MIN_DELAY, tl.gap * 2));
}

/**
 * 지금 그려야 할 상태를 읽는다.
 *
 * @param now 이 기계의 시각(performance.now)
 * @param lerp 두 장 사이를 잇는 함수. 없으면 **가장 새 장을 그대로** 준다(보간을 안 쓰는
 *   게임은 예전처럼 도착한 장을 그린다)
 * @returns 그릴 상태. 아직 한 장도 없으면 null
 */
export function readMirrorState(
  tl: MirrorTimeline,
  now: number,
  lerp?: (prev: unknown, next: unknown, t: number) => unknown,
): unknown | null {
  const n = tl.samples.length;
  if (n === 0) return null;

  const newest = tl.samples[n - 1];
  if (!lerp) return newest.state;

  const step = tl.lastNow == null ? 0 : Math.min(Math.max(now - tl.lastNow, 0), MAX_STEP_MS);
  tl.lastNow = now;

  const target = newest.hostAt - mirrorDelay(tl);
  if (tl.head == null || Math.abs(target - tl.head) > RESYNC_MS) {
    tl.head = target;
  } else {
    tl.head += step;
    // 어긋난 만큼 조금씩 당긴다 — 목표로 곧장 튀면 그 순간마다 판이 튄다
    const err = target - tl.head;
    const pull = err * (1 - Math.exp(-step / CORRECTION_TAU));
    const cap = MAX_CORRECTION_RATE * step;
    tl.head += Math.min(cap, Math.max(-cap, pull));
  }
  // 아직 안 온 장을 짐작해 그리지는 않는다
  if (tl.head > newest.hostAt) tl.head = newest.hostAt;

  // 재생이 지나간 장은 버린다 — 남은 첫 두 장이 지금 이어 그릴 짝이 된다
  while (tl.samples.length > 2 && tl.samples[1].hostAt <= tl.head) tl.samples.shift();
  if (tl.samples.length < 2) return tl.samples[tl.samples.length - 1].state;

  const [prev, next] = tl.samples;
  const span = next.hostAt - prev.hostAt;
  const t = span > 0 ? Math.min(1, Math.max(0, (tl.head - prev.hostAt) / span)) : 1;
  return lerp(prev.state, next.state, t);
}
