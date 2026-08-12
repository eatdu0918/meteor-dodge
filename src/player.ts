import { GAME_HEIGHT, GAME_WIDTH, Vec2, WORLD_SCALE } from './constants';
import { sc } from './scale';

/** Visual & hitbox scale relative to base design */
const PLAYER_SIZE = 0.5;

export class Player {
  x: number;
  y: number;
  readonly radius = sc(10) * PLAYER_SIZE;
  readonly speed = 260 * WORLD_SCALE;
  vx = 0;
  vy = 0;
  angle = -Math.PI / 2;

  constructor() {
    this.x = GAME_WIDTH / 2;
    this.y = GAME_HEIGHT / 2;
  }

  reset(): void {
    this.x = GAME_WIDTH / 2;
    this.y = GAME_HEIGHT / 2;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
  }

  /** stick 이 있으면(터치 조종 중) 키보드 대신 그 방향을 따른다 */
  update(dt: number, keys: Set<string>, stick: Vec2 | null = null): void {
    let dx = 0;
    let dy = 0;

    if (stick) {
      dx = stick.x;
      dy = stick.y;
    } else {
      if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) dx -= 1;
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dx += 1;
      if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) dy -= 1;
      if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      this.angle = Math.atan2(dy, dx);
    }

    this.vx = dx * this.speed;
    this.vy = dy * this.speed;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const margin = this.radius;
    this.x = Math.max(margin, Math.min(GAME_WIDTH - margin, this.x));
    this.y = Math.max(margin, Math.min(GAME_HEIGHT - margin, this.y));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const s = WORLD_SCALE * PLAYER_SIZE;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    if (this.vx !== 0 || this.vy !== 0) {
      ctx.fillStyle = '#ff7043';
      ctx.beginPath();
      ctx.moveTo(-4 * s, 14 * s);
      ctx.lineTo(0, (22 + Math.random() * 4) * s);
      ctx.lineTo(4 * s, 14 * s);
      ctx.fill();
    }

    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.moveTo(0, -14 * s);
    ctx.lineTo(10 * s, 12 * s);
    ctx.lineTo(0, 8 * s);
    ctx.lineTo(-10 * s, 12 * s);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#81d4fa';
    ctx.lineWidth = sc(1.5) * PLAYER_SIZE;
    ctx.stroke();

    ctx.restore();
  }
}

export function circleCollision(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy) < ar + br;
}
