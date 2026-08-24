/**
 * 창이 가려져도 멎지 않는 프레임 루프.
 *
 * `requestAnimationFrame` 은 창이 안 보이면 브라우저가 아예 멈춘다(배터리 절약). 방송
 * 중인 게임은 스트리머가 다른 창을 보는 동안에도 계속 진행돼야 하므로 따로 깨워 주는
 * 시계를 함께 둔다. 콜백은 매번 `now`(rAF 타임스탬프와 같은 시계인 performance.now()
 * 기준)만 받고, dt 계산·서브스텝 처리는 호출부 책임이다.
 *
 * ## 둘을 같이 걸어 두고, 살아 있는 쪽이 끈다
 *
 * 예전에는 `visibilitychange` 를 보고 **rAF 와 타이머를 갈아 끼웠다.** 그런데 「안 보인다」는
 * 신호와 「rAF 가 실제로 도는가」는 환경마다 다르다:
 *
 *   · 스트리머 브라우저 — 창이 다른 창에 완전히 가려지면 크롬이 hidden 으로 잡고 rAF 를
 *     **멈춘다**(실측 0Hz).
 *   · OBS 브라우저 소스 — `document.hidden` 이 늘 true 인데도 rAF 는 소스 합성 주기마다
 *     **돈다**(핀볼 레포 8f387b2 실측). 여기서 hidden 만 보고 rAF 를 끄면 멀쩡한 60Hz 를 버린다.
 *
 * 그래서 신호를 믿지 않고 둘 다 걸어 둔다. rAF 가 최근에 돌았으면 시계 쪽은 그냥 물러난다.
 *
 * ## 가려진 창의 `setInterval` 은 1Hz 로 묶인다 — 그래서 워커로 깨운다
 *
 * 크롬은 안 보이는 문서의 타이머를 **초당 한 번으로 조인다.** 주기를 200ms 로 주든 50ms 로
 * 주든 마찬가지다(실측: 같은 페이지에서 메인 스레드 `setInterval(50)` 이 1Hz). 로드 직후
 * 잠깐은 제 주기로 도는 유예가 있어서, 짧게 재면 멀쩡해 보이는 것에 속기 쉽다.
 *
 * **워커 안의 타이머는 조여지지 않는다**(같은 조건에서 19.8Hz · 중앙 간격 47ms). 그래서
 * 깨우는 일만 워커에 맡긴다 — 판은 그대로 메인 스레드에서 돈다.
 *
 ⚠ 이 파일은 인방모 프론트의 `src/lib/resilient-loop.ts` 와 같은 내용이다.
 *
 * 워커는 **중계 중일 때만** 돈다(`holdBackgroundKeepAlive`). 방송에 나가지도 않는 판을
 * 가려진 탭에서 20Hz 로 계속 돌리면 남의 배터리만 태우기 때문이다 — 중계하지 않는 동안은
 * 예전처럼 평범한 타이머를 쓰고, 가려지면 느려진다(그때는 볼 사람도 없다).
 */

/** 깨우는 주기(ms) — 방송 중계가 20Hz 라 그보다 촘촘할 이유가 없다 */
const TICK_MS = 50;

const subscribers = new Set<() => void>();

let worker: Worker | null = null;
let workerUrl: string | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
/** 지금 「가려져도 계속 돌아야 하는」 화면 수 (중계 중인 게임) */
let keepAliveCount = 0;

function fireAll() {
  // 도는 중에 구독이 바뀔 수 있다(판이 끝나며 루프를 접는 등) — 복사본을 훑는다
  Array.from(subscribers).forEach((notify) => notify());
}

function startWorker(): boolean {
  if (worker) return true;
  if (typeof Worker === "undefined" || typeof URL.createObjectURL !== "function") return false;
  try {
    // 하는 일은 "일정 간격으로 부르기" 하나뿐이다 — 판은 메인 스레드에 그대로 둔다
    const source =
      "let id=null;onmessage=(e)=>{clearInterval(id);id=e.data>0?setInterval(()=>postMessage(0),e.data):null;};";
    workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    worker = new Worker(workerUrl);
    worker.onmessage = fireAll;
    worker.postMessage(TICK_MS);
    return true;
  } catch {
    // CSP 등으로 못 만들면 평범한 타이머로 돌아간다 — 느릴 뿐 멎지는 않는다
    stopWorker();
    return false;
  }
}

function stopWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  if (workerUrl) {
    URL.revokeObjectURL(workerUrl);
    workerUrl = null;
  }
}

function syncTicker() {
  if (subscribers.size === 0) {
    stopWorker();
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    return;
  }
  if (keepAliveCount > 0 && startWorker()) {
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    return;
  }
  stopWorker();
  if (intervalId == null) intervalId = setInterval(fireAll, TICK_MS);
}

/**
 * 「이 화면은 가려져도 제 속도로 돌아야 한다」고 걸어 둔다 — 중계 중인 화면이 부른다.
 *
 * @returns 풀어 주는 함수. 걸어 둔 화면이 하나도 없으면 워커는 곧바로 접힌다.
 */
export function holdBackgroundKeepAlive(): () => void {
  keepAliveCount += 1;
  syncTicker();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    keepAliveCount -= 1;
    syncTicker();
  };
}

export function startResilientLoop(onFrame: (now: number) => void): () => void {
  let rafId: number | null = null;
  /** rAF 가 마지막으로 돈 시각 — 시계 쪽이 물러날지 정하는 데 쓴다 */
  let lastRafAt = Number.NEGATIVE_INFINITY;

  function rafLoop(now: number) {
    lastRafAt = now;
    onFrame(now);
    rafId = requestAnimationFrame(rafLoop);
  }

  const fromTicker = () => {
    const now = performance.now();
    // rAF 가 이 주기 안에 돌았다 = 살아 있다. 굳이 한 번 더 부를 이유가 없다.
    if (now - lastRafAt < TICK_MS) return;
    onFrame(now);
  };

  // 안 보이는 동안 rAF 는 불리지 않을 뿐 요청은 살아 있어서, 창이 다시 보이면 이어 돈다
  rafId = requestAnimationFrame(rafLoop);
  subscribers.add(fromTicker);
  syncTicker();

  return function stop() {
    if (rafId != null) cancelAnimationFrame(rafId);
    subscribers.delete(fromTicker);
    syncTicker();
  };
}

/**
 * 큰 dt를 고정 크기 서브스텝으로 잘라 물리 적분기에 먹인다.
 *
 * 탭이 오래 숨겨져 있었다면 dt가 한 번에 수십 초가 될 수 있다. 그걸 그대로
 * 적분하면 튕기거나(고속 충돌 통과 등) 폭주하므로, `stepSec` 단위로 잘라 여러 번
 * 적분한다. `maxTotalSec`은 아주 오래 숨겨졌던 경우 한 번에 따라잡는 시뮬레이션
 * 시간의 상한이다.
 */
export function integrateWithSubsteps(
  dtSec: number,
  apply: (stepSec: number) => void,
  stepSec = 0.05,
  maxTotalSec = 3,
): void {
  let remaining = Math.min(Math.max(dtSec, 0), maxTotalSec);
  while (remaining > 0) {
    const step = Math.min(remaining, stepSec);
    apply(step);
    remaining -= step;
  }
}
