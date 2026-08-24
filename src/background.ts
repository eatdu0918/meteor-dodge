import { WORLD_SCALE } from './constants';

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  brightness: number;
}

/**
 * 별밭.
 *
 * 별이 크고 밝으면 소형 운석과 구별이 안 된다 — 둘 다 검은 배경 위의 밝은 점이다.
 * 그래서 별은 **작고 흐리고 푸르게** 둔다. 운석은 반대로 크고 밝고 따뜻하다.
 */
export class Starfield {
  private stars: Star[] = [];

  constructor(count: number, width: number, height: number) {
    const s = WORLD_SCALE;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: (Math.random() * 1.1 + 0.4) * s,
        speed: (Math.random() * 20 + 5) * s,
        brightness: Math.random() * 0.3 + 0.1,
      });
    }
  }

  update(dt: number, width: number, height: number): void {
    for (const s of this.stars) {
      s.y += s.speed * dt;
      if (s.y > height) {
        s.y = 0;
        s.x = Math.random() * width;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(176, 196, 240, ${s.brightness})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * 우주 배경.
 *
 * 판이 도는 가운데가 가장 어두워야 운석이 튄다 — 밝은 쪽을 바깥 모서리로 돌린 역방향
 * 그라디언트다(가장자리는 UI·여백이라 운석 판정과 겹치는 시간이 짧다).
 */
export function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    width * 0.7,
  );
  grad.addColorStop(0, '#04040a');
  grad.addColorStop(1, '#0a0a16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}
