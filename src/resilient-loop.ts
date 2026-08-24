/**
 * 탭이 백그라운드로 가도 멎지 않는 프레임 루프.
 *
 * `requestAnimationFrame`은 탭이 숨겨지면 브라우저가 아예 멈춘다(배터리 절약).
 * 방송 중인 판은 스트리머가 다른 탭·앱을 보는 동안에도 계속 굴러야 하므로,
 * 보이는 동안은 rAF로 매끄럽게, 숨겨진 동안은 `setInterval`로 계속 콜백을 불러
 * 진행을 이어간다.
 */
export function startResilientLoop(
  onFrame: (now: number) => void,
  hiddenIntervalMs = 200,
): () => void {
  let rafId: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function rafLoop(now: number) {
    onFrame(now);
    rafId = window.requestAnimationFrame(rafLoop);
  }

  function runHiddenTick() {
    onFrame(performance.now());
  }

  function startVisible() {
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (rafId == null) rafId = window.requestAnimationFrame(rafLoop);
  }

  function startHidden() {
    if (rafId != null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (intervalId == null) intervalId = setInterval(runHiddenTick, hiddenIntervalMs);
  }

  function onVisibilityChange() {
    if (document.hidden) startHidden();
    else startVisible();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  if (document.hidden) startHidden();
  else startVisible();

  return function stop() {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (rafId != null) window.cancelAnimationFrame(rafId);
    if (intervalId != null) clearInterval(intervalId);
  };
}

/**
 * 큰 dt를 고정 크기 서브스텝으로 잘라 물리 적분기에 먹인다.
 *
 * 탭이 오래 숨겨져 있었다면 dt가 한 번에 수십 초가 될 수 있다. 그걸 그대로
 * 적분하면 폭주하므로(고속 충돌 통과 등) `stepSec` 단위로 잘라 여러 번 적분한다.
 * `maxTotalSec`은 아주 오래 숨겨졌던 경우 한 번에 따라잡는 시뮬레이션 시간의
 * 상한이다 — 넘는 시간은 다음 틱들이 이어서 따라잡는다.
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
