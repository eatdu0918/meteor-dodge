import { GAME_HEIGHT, GAME_WIDTH, METEOR_COLORS, METEOR_DEFS, MeteorKind, MeteorPalette } from './constants';
import { sc } from './scale';

export interface Meteor {
  id: number;
  kind: MeteorKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  /** For accelerating meteors */
  accelerated: boolean;
  /** For comet: tail direction */
  tailAngle: number;
  /** For orbital: curve control */
  orbitalCenterX?: number;
  orbitalCenterY?: number;
  orbitalAngle?: number;
  orbitalRadius?: number;
  orbitalSpeed?: number;
  alive: boolean;
  warnTime: number;
}

let nextId = 1;

function pickWeightedKind(unlocked: MeteorKind[]): MeteorKind {
  let total = 0;
  for (const k of unlocked) total += METEOR_DEFS[k].weight;
  let r = Math.random() * total;
  for (const k of unlocked) {
    r -= METEOR_DEFS[k].weight;
    if (r <= 0) return k;
  }
  return unlocked[0];
}

function edgeSpawnPosition(playerX: number, playerY: number): { x: number; y: number; side: number } {
  const margin = sc(40);
  const side = Math.floor(Math.random() * 4);
  let x: number;
  let y: number;

  // 60% spawn from opposite side of player
  const useOpposite = Math.random() < 0.6;
  if (useOpposite) {
    const px = playerX / GAME_WIDTH;
    const py = playerY / GAME_HEIGHT;
    if (px < 0.5 && py < 0.5) {
      // player top-left -> spawn bottom or right
      if (Math.random() < 0.5) {
        x = GAME_WIDTH + margin;
        y = Math.random() * GAME_HEIGHT;
        return { x, y, side: 1 };
      }
      x = Math.random() * GAME_WIDTH;
      y = GAME_HEIGHT + margin;
      return { x, y, side: 3 };
    }
    if (px >= 0.5 && py < 0.5) {
      x = -margin;
      y = Math.random() * GAME_HEIGHT;
      return { x, y, side: 0 };
    }
    if (px < 0.5 && py >= 0.5) {
      x = GAME_WIDTH + margin;
      y = Math.random() * GAME_HEIGHT;
      return { x, y, side: 1 };
    }
    x = Math.random() * GAME_WIDTH;
    y = -margin;
    return { x, y, side: 2 };
  }

  switch (side) {
    case 0:
      x = -margin;
      y = Math.random() * GAME_HEIGHT;
      break;
    case 1:
      x = GAME_WIDTH + margin;
      y = Math.random() * GAME_HEIGHT;
      break;
    case 2:
      x = Math.random() * GAME_WIDTH;
      y = -margin;
      break;
    default:
      x = Math.random() * GAME_WIDTH;
      y = GAME_HEIGHT + margin;
  }
  return { x, y, side };
}

function aimAtPlayer(
  sx: number,
  sy: number,
  px: number,
  py: number,
  speed: number,
  spread = 0.15,
): { vx: number; vy: number; angle: number } {
  const dx = px - sx + (Math.random() - 0.5) * spread * GAME_WIDTH;
  const dy = py - sy + (Math.random() - 0.5) * spread * GAME_HEIGHT;
  const len = Math.hypot(dx, dy) || 1;
  return {
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    angle: Math.atan2(dy, dx),
  };
}

function createMeteor(
  kind: MeteorKind,
  sx: number,
  sy: number,
  playerX: number,
  playerY: number,
  speedMult: number,
): Meteor {
  const def = METEOR_DEFS[kind];
  const speed = def.speed * speedMult;
  const { vx, vy, angle } = aimAtPlayer(sx, sy, playerX, playerY, speed, kind === 'belt' ? 0.02 : 0.15);

  const m: Meteor = {
    id: nextId++,
    kind,
    x: sx,
    y: sy,
    vx,
    vy,
    radius: def.radius,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 6,
    accelerated: false,
    tailAngle: angle + Math.PI,
    alive: true,
    warnTime: 0.25,
  };

  if (kind === 'orbital') {
    m.orbitalCenterX = playerX;
    m.orbitalCenterY = playerY;
    m.orbitalAngle = Math.atan2(sy - playerY, sx - playerX);
    m.orbitalRadius = Math.hypot(sx - playerX, sy - playerY);
    m.orbitalSpeed = 1.8 * speedMult;
    m.vx = 0;
    m.vy = 0;
  }

  return m;
}

export class Spawner {
  timer = 0;
  lastSide = -1;
  sameSideCount = 0;
  beltCooldown = 0;

  reset(): void {
    this.timer = 0;
    this.lastSide = -1;
    this.sameSideCount = 0;
    this.beltCooldown = 0;
  }

  update(
    dt: number,
    _elapsed: number,
    spawnInterval: number,
    maxMeteors: number,
    speedMult: number,
    unlocked: MeteorKind[],
    playerX: number,
    playerY: number,
    currentCount: number,
  ): Meteor[] {
    const spawned: Meteor[] = [];
    this.timer += dt;
    this.beltCooldown = Math.max(0, this.beltCooldown - dt);

    if (currentCount >= maxMeteors) return spawned;

    if (this.timer < spawnInterval) return spawned;
    this.timer = 0;

    // Belt wave: occasional parallel wall
    if (unlocked.includes('belt') && this.beltCooldown <= 0 && Math.random() < 0.08) {
      spawned.push(...this.spawnBelt(playerX, playerY, speedMult));
      this.beltCooldown = 12;
      return spawned;
    }

    const kind = pickWeightedKind(unlocked);

    if (kind === 'split') {
      spawned.push(...this.spawnSplit(playerX, playerY, speedMult));
      return spawned;
    }

    if (kind === 'small' && Math.random() < 0.6) {
      spawned.push(...this.spawnCluster(playerX, playerY, speedMult, 3 + Math.floor(Math.random() * 3)));
      return spawned;
    }

    const pos = this.pickSpawnPos(playerX, playerY);
    spawned.push(createMeteor(kind, pos.x, pos.y, playerX, playerY, speedMult));
    return spawned;
  }

  private pickSpawnPos(playerX: number, playerY: number): { x: number; y: number } {
    let pos = edgeSpawnPosition(playerX, playerY);
    if (pos.side === this.lastSide) {
      this.sameSideCount++;
      if (this.sameSideCount >= 3) {
        pos = edgeSpawnPosition(playerX, playerY);
        this.sameSideCount = 0;
      }
    } else {
      this.sameSideCount = 0;
    }
    this.lastSide = pos.side;
    return { x: pos.x, y: pos.y };
  }

  private spawnCluster(
    px: number,
    py: number,
    speedMult: number,
    count: number,
  ): Meteor[] {
    const pos = this.pickSpawnPos(px, py);
    const meteors: Meteor[] = [];
    const baseAngle = Math.atan2(py - pos.y, px - pos.x);
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.12;
      const angle = baseAngle + spread;
      const speed = METEOR_DEFS.small.speed * speedMult;
      meteors.push({
        id: nextId++,
        kind: 'small',
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: METEOR_DEFS.small.radius,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 8,
        accelerated: false,
        tailAngle: angle + Math.PI,
        alive: true,
        warnTime: 0.2,
      });
    }
    return meteors;
  }

  private spawnSplit(px: number, py: number, speedMult: number): Meteor[] {
    const pos = this.pickSpawnPos(px, py);
    const base = aimAtPlayer(pos.x, pos.y, px, py, METEOR_DEFS.split.speed * speedMult, 0);
    const baseAngle = Math.atan2(base.vy, base.vx);
    const count = 2 + Math.floor(Math.random() * 2);
    const meteors: Meteor[] = [];
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.25;
      const angle = baseAngle + spread;
      const speed = METEOR_DEFS.split.speed * speedMult;
      meteors.push({
        id: nextId++,
        kind: 'split',
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: METEOR_DEFS.split.radius,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 5,
        accelerated: false,
        tailAngle: angle + Math.PI,
        alive: true,
        warnTime: 0.2,
      });
    }
    return meteors;
  }

  private spawnBelt(_px: number, _py: number, speedMult: number): Meteor[] {
    const fromLeft = Math.random() < 0.5;
    const gapIndex = Math.floor(Math.random() * 6);
    const count = 7;
    const meteors: Meteor[] = [];
    const yStart = sc(60);
    const yStep = (GAME_HEIGHT - sc(120)) / (count - 1);

    for (let i = 0; i < count; i++) {
      if (i === gapIndex) continue;
      const sx = fromLeft ? -sc(30) : GAME_WIDTH + sc(30);
      const sy = yStart + i * yStep;
      const tx = fromLeft ? GAME_WIDTH + sc(50) : -sc(50);
      const ty = sy + (Math.random() - 0.5) * sc(20);
      const dx = tx - sx;
      const dy = ty - sy;
      const len = Math.hypot(dx, dy);
      const speed = METEOR_DEFS.belt.speed * speedMult;
      meteors.push({
        id: nextId++,
        kind: 'belt',
        x: sx,
        y: sy,
        vx: (dx / len) * speed,
        vy: (dy / len) * speed,
        radius: METEOR_DEFS.belt.radius,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: 2,
        accelerated: false,
        tailAngle: Math.atan2(dy, dx) + Math.PI,
        alive: true,
        warnTime: 0.4,
      });
    }
    return meteors;
  }
}

export function updateMeteor(m: Meteor, dt: number, px: number, py: number): void {
  if (m.warnTime > 0) {
    m.warnTime -= dt;
    return;
  }

  if (m.kind === 'orbital' && m.orbitalCenterX != null && m.orbitalAngle != null && m.orbitalRadius != null && m.orbitalSpeed != null) {
    m.orbitalAngle += m.orbitalSpeed * dt * 0.5;
    m.x = m.orbitalCenterX + Math.cos(m.orbitalAngle) * m.orbitalRadius;
    m.y = m.orbitalCenterY! + Math.sin(m.orbitalAngle) * m.orbitalRadius * 0.6;
    m.vx = -Math.sin(m.orbitalAngle) * m.orbitalRadius * m.orbitalSpeed * 0.5;
    m.vy = Math.cos(m.orbitalAngle) * m.orbitalRadius * m.orbitalSpeed * 0.3;
    m.tailAngle = Math.atan2(m.vy, m.vx) + Math.PI;
  } else if (m.kind === 'accelerating' && !m.accelerated) {
    const dist = Math.hypot(px - m.x, py - m.y);
    if (dist < sc(200)) {
      m.accelerated = true;
      const angle = Math.atan2(py - m.y, px - m.x);
      const speed = METEOR_DEFS.accelerating.speed * 2.2;
      m.vx = Math.cos(angle) * speed;
      m.vy = Math.sin(angle) * speed;
      m.tailAngle = angle + Math.PI;
    }
  } else {
    m.x += m.vx * dt;
    m.y += m.vy * dt;
  }

  m.rotation += m.rotationSpeed * dt;
}

export function isOffScreen(m: Meteor): boolean {
  const margin = sc(80);
  return m.x < -margin || m.x > GAME_WIDTH + margin || m.y < -margin || m.y > GAME_HEIGHT + margin;
}

/**
 * 운석 한 개.
 *
 * 배경(거의 검은 우주)과 섞이지 않게 세 겹으로 그린다.
 *  1) 뒤에 까는 열기 — 어떤 배경 위에서도 운석 둘레에 경계가 생긴다
 *  2) 몸통보다 밝은 테두리 — 실루엣이 별밭에 먹히지 않는다
 *  3) 크레이터 음영 — 별(민무늬 점)과 운석(질감 있는 덩어리)을 눈이 바로 가른다
 */
export function drawMeteor(ctx: CanvasRenderingContext2D, m: Meteor): void {
  if (m.warnTime > 0) {
    drawWarn(ctx, m);
    return;
  }

  const colors = METEOR_COLORS[m.kind];

  ctx.save();
  ctx.translate(m.x, m.y);
  drawGlow(ctx, m.kind, m.radius);
  ctx.rotate(m.rotation);

  switch (m.kind) {
    case 'small':
      drawRock(ctx, m.radius, colors, 5);
      break;
    case 'large':
      drawRock(ctx, m.radius, colors, 8);
      break;
    case 'rotating':
      drawRock(ctx, m.radius, colors, 6);
      ctx.strokeStyle = colors.rim;
      ctx.lineWidth = sc(2);
      ctx.beginPath();
      ctx.moveTo(-m.radius * 0.6, 0);
      ctx.lineTo(m.radius * 0.6, 0);
      ctx.stroke();
      break;
    case 'comet':
      drawComet(ctx, m);
      break;
    default:
      drawRock(ctx, m.radius, colors, 6);
  }

  ctx.restore();
}

/**
 * 열기(glow) 스프라이트.
 *
 * 판에 운석이 마흔 개까지 뜨므로 매 프레임 그라디언트를 새로 만들면 그리기가 밀린다.
 * 종류·반지름이 정해져 있으니 한 번 그려 두고 그림으로 얹는다.
 */
const glowCache = new Map<string, HTMLCanvasElement>();

function glowSprite(kind: MeteorKind, radius: number): HTMLCanvasElement {
  const key = `${kind}:${Math.round(radius)}`;
  const cached = glowCache.get(key);
  if (cached) return cached;

  const outer = radius * 2.2;
  const size = Math.ceil(outer * 2);
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(outer, outer, radius * 0.6, outer, outer, outer);
  grad.addColorStop(0, METEOR_COLORS[kind].glow);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  glowCache.set(key, cv);
  return cv;
}

function drawGlow(ctx: CanvasRenderingContext2D, kind: MeteorKind, radius: number): void {
  const sprite = glowSprite(kind, radius);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
}

function drawWarn(ctx: CanvasRenderingContext2D, m: Meteor): void {
  const alpha = 0.5 + Math.sin(Date.now() * 0.02) * 0.5;
  ctx.save();
  ctx.strokeStyle = `rgba(255, 82, 82, ${alpha})`;
  ctx.lineWidth = sc(2);
  ctx.beginPath();
  ctx.arc(m.x, m.y, sc(14), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 82, 82, ${alpha})`;
  ctx.beginPath();
  ctx.arc(m.x, m.y, sc(6), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  r: number,
  colors: MeteorPalette,
  points: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const wobble = 0.75 + (i % 3) * 0.08;
    const pr = r * wobble;
    const px = Math.cos(angle) * pr;
    const py = Math.sin(angle) * pr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = colors.body;
  ctx.fill();

  ctx.strokeStyle = colors.rim;
  ctx.lineWidth = Math.max(sc(1.5), r * 0.13);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.7;
    const dist = r * (0.22 + (i % 2) * 0.2);
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, r * (0.14 + (i % 3) * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawComet(ctx: CanvasRenderingContext2D, m: Meteor): void {
  ctx.rotate(-m.rotation);
  ctx.rotate(m.tailAngle);

  const tailLen = sc(40);
  const grad = ctx.createLinearGradient(-tailLen, 0, m.radius, 0);
  grad.addColorStop(0, 'rgba(255, 171, 64, 0)');
  grad.addColorStop(0.6, 'rgba(255, 171, 64, 0.5)');
  grad.addColorStop(1, 'rgba(255, 224, 130, 0.9)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-tailLen, -m.radius * 0.5);
  ctx.lineTo(m.radius, -m.radius * 0.8);
  ctx.lineTo(m.radius, m.radius * 0.8);
  ctx.lineTo(-tailLen, m.radius * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = METEOR_COLORS.comet.body;
  ctx.beginPath();
  ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Comet: only head is dangerous */
export function getCollisionRadius(m: Meteor): { x: number; y: number; r: number } {
  if (m.kind === 'comet') {
    return { x: m.x, y: m.y, r: m.radius * 0.85 };
  }
  return { x: m.x, y: m.y, r: m.radius * 0.9 };
}

export function drawExplosion(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const maxT = 0.6;
  const p = t / maxT;
  if (p >= 1) return;

  const radius = sc(10) + p * sc(50);
  const alpha = 1 - p;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = sc(3);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ff5722';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
