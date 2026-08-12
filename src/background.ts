import { WORLD_SCALE } from './constants';

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  brightness: number;
}

export class Starfield {
  private stars: Star[] = [];

  constructor(count: number, width: number, height: number) {
    const s = WORLD_SCALE;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: (Math.random() * 2 + 0.5) * s,
        speed: (Math.random() * 20 + 5) * s,
        brightness: Math.random() * 0.6 + 0.2,
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
      ctx.fillStyle = `rgba(255, 255, 255, ${s.brightness})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    width * 0.7,
  );
  grad.addColorStop(0, '#12121f');
  grad.addColorStop(1, '#050508');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}
