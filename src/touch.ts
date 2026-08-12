import { Vec2 } from './constants';
import { clientToGame } from './display';
import { sc } from './scale';

/**
 * 화면을 끌어 조종하는 가상 스틱 (터치·펜 전용).
 *
 * 손가락을 댄 자리가 곧 스틱의 중심이 된다(플로팅 스틱) — 화면 어디를 잡아도
 * 조종할 수 있어야 작은 화면에서 우주선을 손가락으로 가리지 않는다.
 * 중심에서 STICK_RADIUS 보다 멀어지면 중심을 끌고 와 손가락을 계속 따라간다.
 */
export class VirtualStick {
  /** 조종 방향 (길이 1). 손을 뗐거나 데드존 안이면 null */
  dir: Vec2 | null = null;
  /** 그리기용 — 스틱 중심 / 손가락 위치 (월드 좌표) */
  anchor: Vec2 | null = null;
  knob: Vec2 | null = null;
  /** 완전히 기울었다고 보는 거리 = 링의 반지름 */
  readonly radius = sc(70);

  /** 손가락 미세 떨림을 정지로 흡수할 거리 */
  private readonly deadZone = sc(6);
  private pointerId: number | null = null;

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      // 마우스는 기존 클릭(난이도 선택·재시작)이 주인이다
      if (e.pointerType === 'mouse' || this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      const p = clientToGame(canvas, e.clientX, e.clientY);
      this.anchor = p;
      this.knob = { ...p };
      this.dir = null;
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId || !this.anchor) return;
      const p = clientToGame(canvas, e.clientX, e.clientY);
      this.knob = p;

      let dx = p.x - this.anchor.x;
      let dy = p.y - this.anchor.y;
      const len = Math.hypot(dx, dy);

      if (len > this.radius) {
        // 중심을 손가락 쪽으로 당겨 붙인다 → 반대로 꺾을 때 즉시 반응한다
        this.anchor = {
          x: p.x - (dx / len) * this.radius,
          y: p.y - (dy / len) * this.radius,
        };
        dx = (dx / len) * this.radius;
        dy = (dy / len) * this.radius;
      }

      this.dir = len > this.deadZone ? { x: dx / len, y: dy / len } : null;
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.reset();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  reset(): void {
    this.pointerId = null;
    this.dir = null;
    this.anchor = null;
    this.knob = null;
  }
}
