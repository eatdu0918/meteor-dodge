import { UI_SCALE } from './constants';
import { getRenderScale } from './display';

/**
 * 글씨체 — 픽셀(비트맵) 글씨체 Galmuri11 한 벌로 통일한다.
 *
 * 예전에는 `system-ui` 였는데, 그러면 보는 사람마다 글씨가 달라지고(윈도우는 맑은 고딕)
 * 우주 아케이드 판에 사무실 글씨가 얹힌 꼴이었다. 임베드가 자기 폰트를 들고 다니면
 * 스트리머 화면·OBS 소스·모바일이 **전부 같은 그림**이 된다.
 *
 * 대체 글씨는 `monospace` — 아직 폰트가 안 왔을 때 글자 폭이 덜 튄다.
 */
export const FONT_FAMILY = "'Galmuri11', monospace";

/**
 * 글씨 크기를 **화면 픽셀 정수**에 맞춘다.
 *
 * 비트맵 글씨체는 정수 배율이 아니면 같은 획이 어떤 데선 1px, 어떤 데선 2px 로 나와
 * 뭉개져 보인다. 여기 들어오는 값은 기본 설계(800×600) 기준 크기이고, 판 좌표(1920)를
 * 거쳐 화면으로 다시 줄어드므로 — 그 최종 배율로 반올림해서 되돌려 준다.
 */
export function font(base: number, bold = false): string {
  const world = base * UI_SCALE;
  const scale = getRenderScale();
  const px = scale > 0 ? Math.max(1, Math.round(world * scale)) / scale : world;
  return `${bold ? '700' : '400'} ${px}px ${FONT_FAMILY}`;
}

/**
 * 폰트가 도착하면 한 장 다시 그린다.
 *
 * 캔버스는 `font-display` 를 보지 않는다 — 폰트가 오기 전에 그린 글씨는 대체 글씨로
 * **박제**되고 저절로 고쳐지지 않는다. 게임 화면은 매 프레임 다시 그리니 상관없지만,
 * OBS 송출 화면은 스냅샷이 올 때만 그리므로 첫 장이 대체 글씨로 나갈 수 있다.
 */
export function redrawWhenFontsReady(redraw: () => void): void {
  const sample = '운석피하기 GAME OVER 0123456789';
  const load = (weight: string) =>
    document.fonts.load(`${weight} 40px 'Galmuri11'`, sample).catch(() => undefined);

  void Promise.all([load('400'), load('700')])
    .then(() => document.fonts.ready)
    .then(redraw)
    .catch(() => undefined);
}
