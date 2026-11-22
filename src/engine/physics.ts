import { ArenaSnapshot, CountryFlag, GameMode, PhysicsSettings } from '../types';
import { soundEngine } from '../utils/audio';

export const ARENA_WIDTH = 540;
export const ARENA_HEIGHT = 960;
export const ARENA_CX = ARENA_WIDTH / 2;
export const ARENA_CY = 515;
export const BASE_RING_RADIUS = 194;
const WALL_THICKNESS = 10;
const CAP_RADIUS = 6;

interface Ball {
  flag: CountryFlag;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  vRot: number;
  alive: boolean;
  kickCooldown: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  angle: number;
  vAngle: number;
  life: number;
}

export interface ArenaCallbacks {
  onEliminate: (flag: CountryFlag, rank: number, aliveCount: number) => void;
  onVictory: (winner: CountryFlag) => void;
  onSnapshot: (snapshot: ArenaSnapshot) => void;
}

function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a < -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function angularDiff(a: number, b: number): number {
  return normalizeAngle(a - b);
}

const CONFETTI_COLORS = [
  '#22d3ee',
  '#facc15',
  '#f43f5e',
  '#34d399',
  '#a78bfa',
  '#fb923c',
  '#ffffff',
];

export class ArenaEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: ArenaCallbacks;

  private balls: Ball[] = [];
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private confetti: Confetti[] = [];
  private imageCache: Map<string, HTMLImageElement | 'error'> = new Map();

  private mode: GameMode = 'classic';
  private settings: PhysicsSettings = {
    spinSpeed: 1.0,
    gapAngleDeg: 46,
    bounciness: 0.92,
  };

  private ringRadius: number = BASE_RING_RADIUS;
  private gapAngle: number = Math.PI * 0.5;
  private elapsedSeconds: number = 0;
  private totalCount: number = 0;
  private aliveCount: number = 0;

  private isPaused: boolean = false;
  private isVictory: boolean = false;
  private winnerBall: Ball | null = null;

  // Chaos mode timers
  private chaosTimer: number = 0;
  private chaosBoostRemaining: number = 0;
  private ringFlashAlpha: number = 0;

  // Animation loop
  private rafId: number | null = null;
  private lastTimestamp: number = 0;
  private snapshotAccum: number = 0;
  private confettiAccum: number = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: ArenaCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;
    this.callbacks = callbacks;
    this.setupHighDpi();
  }

  public setupHighDpi() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = ARENA_WIDTH * dpr;
    this.canvas.height = ARENA_HEIGHT * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public setMode(mode: GameMode) {
    this.mode = mode;
    if (mode !== 'shrinking') {
      // Smoothly allow radius to stay or return? Keep shrinking progress only in shrinking mode
      this.ringRadius = BASE_RING_RADIUS;
    }
    if (mode !== 'chaos') {
      this.chaosBoostRemaining = 0;
    }
  }

  public setSettings(settings: PhysicsSettings) {
    this.settings = { ...settings };
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
    if (!paused) {
      this.lastTimestamp = performance.now();
    }
  }

  private preloadImage(url: string) {
    if (!url || this.imageCache.has(url)) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      this.imageCache.set(url, img);
    };
    img.onerror = () => {
      this.imageCache.set(url, 'error');
    };
    img.src = url;
    // Store immediately so we don't trigger duplicate network fetches while loading
    this.imageCache.set(url, img);
  }

  public initRound(flags: CountryFlag[]) {
    const activeFlags = flags.length > 0 ? flags : [];
    this.totalCount = activeFlags.length;
    this.aliveCount = activeFlags.length;
    this.ringRadius = BASE_RING_RADIUS;
    this.gapAngle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    this.elapsedSeconds = 0;
    this.isVictory = false;
    this.winnerBall = null;
    this.particles = [];
    this.shockwaves = [];
    this.confetti = [];
    this.chaosTimer = 0;
    this.chaosBoostRemaining = 0;
    this.ringFlashAlpha = 0;

    // Shuffle order so spawning positions are completely fair every round
    const shuffled = [...activeFlags];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Dynamic ball radius scaling for optimal visual clarity & physics packing
    const n = Math.max(shuffled.length, 1);
    const computedRadius = Math.sqrt((0.36 * BASE_RING_RADIUS * BASE_RING_RADIUS) / n);
    const ballRadius = Math.max(9.4, Math.min(23, computedRadius));
    const spawnLimit = BASE_RING_RADIUS - ballRadius - 11;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    this.balls = shuffled.map((flag, i) => {
      this.preloadImage(flag.imageUrl);

      const t = n === 1 ? 0 : Math.sqrt((i + 0.5) / n);
      const r = t * spawnLimit;
      const theta = i * goldenAngle + Math.random() * 0.15;

      const x = ARENA_CX + Math.cos(theta) * r;
      const y = ARENA_CY + Math.sin(theta) * r;

      const initAngle = Math.random() * Math.PI * 2;
      const initSpeed = 120 + Math.random() * 140;

      return {
        flag,
        x,
        y,
        vx: Math.cos(initAngle) * initSpeed,
        vy: Math.sin(initAngle) * initSpeed,
        radius: ballRadius,
        rotation: (Math.random() - 0.5) * 0.4,
        vRot: (Math.random() - 0.5) * 2.5,
        alive: true,
        kickCooldown: Math.random() * 1.2,
      };
    });

    // Edge case: only 1 flag selected -> immediate champion display
    if (this.balls.length === 1) {
      this.isVictory = true;
      this.winnerBall = this.balls[0];
      this.spawnVictoryConfetti(70);
      this.callbacks.onVictory(this.balls[0].flag);
    }

    this.emitSnapshot();
  }

  public start() {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      // Clamp dt to prevent tunneling if tab was backgrounded
      const dt = Math.min(Math.max(rawDt, 0.001), 0.04);

      if (!this.isPaused) {
        this.update(dt);
      }
      this.render();

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private getEffectiveGapRad(): number {
    const baseRad = (this.settings.gapAngleDeg * Math.PI) / 180;
    // Guarantee the gap opening is always wide enough for the current ball diameter
    const sampleRadius = this.balls.length > 0 ? this.balls[0].radius : 12;
    const minArcWidth = sampleRadius * 2.55;
    const minRad = minArcWidth / Math.max(this.ringRadius, 50);
    return Math.min(Math.PI * 1.35, Math.max(baseRad, minRad));
  }

  private getRingColors(): { core: string; glow: string; bgGlow: string; accent: string } {
    if (this.mode === 'chaos') {
      return this.chaosBoostRemaining > 0
        ? {
            core: '#fdf2f8',
            glow: '#f43f5e',
            bgGlow: 'rgba(244, 63, 94, 0.24)',
            accent: '#facc15',
          }
        : {
            core: '#f5d0fe',
            glow: '#e879f9',
            bgGlow: 'rgba(217, 70, 239, 0.16)',
            accent: '#f43f5e',
          };
    }

    if (this.mode === 'shrinking') {
      const shrinkRatio = 1 - (this.ringRadius - 90) / (BASE_RING_RADIUS - 90);
      return shrinkRatio > 0.55
        ? {
            core: '#ffedd5',
            glow: '#f97316',
            bgGlow: 'rgba(249, 115, 22, 0.20)',
            accent: '#ef4444',
          }
        : {
            core: '#fef3c7',
            glow: '#f59e0b',
            bgGlow: 'rgba(245, 158, 11, 0.16)',
            accent: '#fb923c',
          };
    }

    return {
      core: '#ecfeff',
      glow: '#22d3ee',
      bgGlow: 'rgba(34, 211, 238, 0.14)',
      accent: '#38bdf8',
    };
  }

  private update(dt: number) {
    this.updateParticles(dt);
    this.updateShockwaves(dt);
    this.updateConfetti(dt);

    if (this.ringFlashAlpha > 0) {
      this.ringFlashAlpha = Math.max(0, this.ringFlashAlpha - dt * 2.2);
    }

    if (this.isVictory) {
      // Gently orbit / float champion ball toward center and keep confetti flowing
      this.gapAngle = normalizeAngle(this.gapAngle + 0.55 * dt);
      if (this.winnerBall) {
        const b = this.winnerBall;
        b.x += (ARENA_CX - b.x) * Math.min(1, dt * 4.5);
        b.y += (ARENA_CY - b.y) * Math.min(1, dt * 4.5);
        b.rotation *= 0.94;
      }
      this.confettiAccum += dt;
      if (this.confettiAccum >= 0.35) {
        this.confettiAccum = 0;
        this.spawnVictoryConfetti(14);
      }
      return;
    }

    this.elapsedSeconds += dt;

    // Mode-specific arena dynamics
    let spinMult = 1.0;
    if (this.mode === 'chaos') {
      spinMult = 1.65;
      this.chaosTimer += dt;
      if (this.chaosBoostRemaining > 0) {
        this.chaosBoostRemaining = Math.max(0, this.chaosBoostRemaining - dt);
        spinMult = 2.65;
      } else if (this.chaosTimer >= 3.2) {
        this.chaosTimer = 0;
        this.chaosBoostRemaining = 0.85;
        this.ringFlashAlpha = 1.0;
        this.triggerChaosImpulse();
      }
    } else if (this.mode === 'shrinking') {
      const sampleR = this.balls.length > 0 ? this.balls[0].radius : 10;
      const minRadius = Math.max(72, sampleR * 3.8);
      // Shrink steadily so rounds accelerate cleanly
      const shrinkSpeed = this.aliveCount <= 12 ? 6.5 : 4.2;
      this.ringRadius = Math.max(minRadius, this.ringRadius - shrinkSpeed * dt);
    }

    const baseAngularVel = 1.15 * this.settings.spinSpeed * spinMult;
    const substeps = 3;
    const subDt = dt / substeps;
    const gravity = 250;
    const maxSpeed = this.mode === 'chaos' ? 920 : 740;
    const effectiveGapHalf = this.getEffectiveGapRad() / 2;

    for (let step = 0; step < substeps; step++) {
      this.gapAngle = normalizeAngle(this.gapAngle + baseAngularVel * subDt);
      this.stepPhysics(subDt, gravity, baseAngularVel, effectiveGapHalf, maxSpeed);
      if (this.isVictory) break;
    }

    this.snapshotAccum += dt;
    if (this.snapshotAccum >= 0.1) {
      this.snapshotAccum = 0;
      this.emitSnapshot();
    }
  }

  private triggerChaosImpulse() {
    soundEngine.playChaosBoost();
    this.shockwaves.push({
      x: ARENA_CX,
      y: ARENA_CY,
      radius: this.ringRadius * 0.25,
      maxRadius: this.ringRadius + 38,
      color: '#f43f5e',
      alpha: 0.75,
    });

    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.alive) continue;
      const angle = Math.random() * Math.PI * 2;
      const impulse = 175 + Math.random() * 145;
      b.vx += Math.cos(angle) * impulse;
      b.vy += Math.sin(angle) * impulse - 65;
      b.vRot += (Math.random() - 0.5) * 6;
    }
  }

  private stepPhysics(
    dt: number,
    gravity: number,
    angularVel: number,
    gapHalf: number,
    maxSpeed: number
  ) {
    const aliveBalls: Ball[] = [];
    for (let i = 0; i < this.balls.length; i++) {
      if (this.balls[i].alive) aliveBalls.push(this.balls[i]);
    }

    const R = this.ringRadius;
    const restitution = this.settings.bounciness;
    const ballRestitution = Math.min(1.03, Math.max(0.55, restitution * 0.96));

    // 1. Integrate forces, anti-stall kicks, and velocity caps
    for (let i = 0; i < aliveBalls.length; i++) {
      const b = aliveBalls[i];
      b.vy += gravity * dt;

      // Subtle random impulse kicks so flags stay energetic and never settle dead
      b.kickCooldown -= dt;
      const speedSq = b.vx * b.vx + b.vy * b.vy;
      if (b.kickCooldown <= 0 || speedSq < 5800) {
        const kickAngle = Math.random() * Math.PI * 2;
        const kickStrength = speedSq < 5800 ? 110 + Math.random() * 80 : 32 + Math.random() * 48;
        b.vx += Math.cos(kickAngle) * kickStrength;
        // Slight upward bias when near bottom of ring so flags keep circulating
        const bottomBias = b.y > ARENA_CY + R * 0.35 ? -58 : -12;
        b.vy += Math.sin(kickAngle) * kickStrength + bottomBias;
        b.kickCooldown = 0.55 + Math.random() * 1.1;
      }

      // Gentle air drag + speed cap
      b.vx *= 0.9993;
      b.vy *= 0.9993;
      const newSpeedSq = b.vx * b.vx + b.vy * b.vy;
      if (newSpeedSq > maxSpeed * maxSpeed) {
        const scale = maxSpeed / Math.sqrt(newSpeedSq);
        b.vx *= scale;
        b.vy *= scale;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rotation += b.vRot * dt;
      b.vRot *= 0.992;
    }

    // 2. Spatial hash grid for fast O(N) circle-to-circle elastic collisions
    if (aliveBalls.length > 1) {
      const cellSize = Math.max(aliveBalls[0].radius * 2.4, 28);
      const grid = new Map<number, number[]>();

      for (let i = 0; i < aliveBalls.length; i++) {
        const b = aliveBalls[i];
        const gx = Math.floor(b.x / cellSize);
        const gy = Math.floor(b.y / cellSize);
        const key = ((gx + 512) << 12) | (gy + 512);
        let cell = grid.get(key);
        if (!cell) {
          cell = [];
          grid.set(key, cell);
        }
        cell.push(i);
      }

      for (let i = 0; i < aliveBalls.length; i++) {
        const a = aliveBalls[i];
        const gx = Math.floor(a.x / cellSize);
        const gy = Math.floor(a.y / cellSize);

        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const key = ((gx + ox + 512) << 12) | (gy + oy + 512);
            const cell = grid.get(key);
            if (!cell) continue;

            for (let c = 0; c < cell.length; c++) {
              const j = cell[c];
              if (j <= i) continue;
              const b = aliveBalls[j];

              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const minDist = a.radius + b.radius;
              const distSq = dx * dx + dy * dy;

              if (distSq < minDist * minDist) {
                let dist = Math.sqrt(distSq);
                let nx: number;
                let ny: number;

                if (dist < 0.0001) {
                  const randA = Math.random() * Math.PI * 2;
                  nx = Math.cos(randA);
                  ny = Math.sin(randA);
                  dist = 0.0001;
                } else {
                  nx = dx / dist;
                  ny = dy / dist;
                }

                // Positional separation
                const overlap = (minDist - dist) * 0.505;
                a.x -= nx * overlap;
                a.y -= ny * overlap;
                b.x += nx * overlap;
                b.y += ny * overlap;

                // Elastic velocity impulse
                const rvx = b.vx - a.vx;
                const rvy = b.vy - a.vy;
                const velAlongNormal = rvx * nx + rvy * ny;

                if (velAlongNormal < 0) {
                  const jImpulse = (-(1 + ballRestitution) * velAlongNormal) * 0.5;
                  const impX = jImpulse * nx;
                  const impY = jImpulse * ny;

                  a.vx -= impX;
                  a.vy -= impY;
                  b.vx += impX;
                  b.vy += impY;

                  // Subtle rotational transfer
                  const tangentVel = -rvx * ny + rvy * nx;
                  a.vRot += tangentVel * 0.008;
                  b.vRot -= tangentVel * 0.008;
                }
              }
            }
          }
        }
      }
    }

    // 3. Rotating ring wall + gap end-cap collisions + elimination detection
    const capAngleA = this.gapAngle - gapHalf;
    const capAngleB = this.gapAngle + gapHalf;
    const capRadialPos = R + WALL_THICKNESS * 0.35;
    const capAX = ARENA_CX + Math.cos(capAngleA) * capRadialPos;
    const capAY = ARENA_CY + Math.sin(capAngleA) * capRadialPos;
    const capBX = ARENA_CX + Math.cos(capAngleB) * capRadialPos;
    const capBY = ARENA_CY + Math.sin(capAngleB) * capRadialPos;

    for (let i = 0; i < aliveBalls.length; i++) {
      const b = aliveBalls[i];
      if (!b.alive) continue;

      const dx = b.x - ARENA_CX;
      const dy = b.y - ARENA_CY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const deltaFromGap = Math.abs(angularDiff(angle, this.gapAngle));

      const insideGapArc = deltaFromGap < gapHalf;

      // Elimination rule: center crosses outside the ring through the open gap
      if ((insideGapArc && dist > R) || dist > R + WALL_THICKNESS + b.radius) {
        this.eliminateBall(b, dx, dy, dist);
        if (this.isVictory) return;
        continue;
      }

      // Solid wall arc collision
      if (!insideGapArc && dist + b.radius > R && dist > 0.0001) {
        const invDist = 1 / dist;
        const outNx = dx * invDist;
        const outNy = dy * invDist;
        const inNx = -outNx;
        const inNy = -outNy;

        // Clamp inside ring wall
        b.x = ARENA_CX + outNx * (R - b.radius);
        b.y = ARENA_CY + outNy * (R - b.radius);

        // Reflect inward
        const vDotIn = b.vx * inNx + b.vy * inNy;
        if (vDotIn < 0) {
          const wallBounce = Math.min(1.16, Math.max(0.45, restitution));
          b.vx -= (1 + wallBounce) * vDotIn * inNx;
          b.vy -= (1 + wallBounce) * vDotIn * inNy;

          // Subtle tangential momentum from spinning wall
          const tx = -outNy;
          const ty = outNx;
          const wallTangentialSpeed = angularVel * R;
          b.vx += tx * wallTangentialSpeed * 0.095;
          b.vy += ty * wallTangentialSpeed * 0.095;
          b.vRot += (angularVel * 2.2) + (-vDotIn * 0.006);

          // Ensure lively rebound energy when hitting bottom wall
          if (-vDotIn > 170) {
            soundEngine.playWallBounce((-vDotIn - 150) / 380);
            this.spawnWallSparks(
              ARENA_CX + outNx * R,
              ARENA_CY + outNy * R,
              inNx,
              inNy
            );
          }
        }
      }

      // Rounded gap endpoint cap collisions (prevents snagging/clipping on gap edges)
      this.collideWithCap(b, capAX, capAY, capAngleA, angularVel, restitution);
      this.collideWithCap(b, capBX, capBY, capAngleB, angularVel, restitution);
    }
  }

  private collideWithCap(
    b: Ball,
    capX: number,
    capY: number,
    capAngle: number,
    angularVel: number,
    restitution: number
  ) {
    const dx = b.x - capX;
    const dy = b.y - capY;
    const minDist = b.radius + CAP_RADIUS;
    const distSq = dx * dx + dy * dy;

    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;

      // Push out from cap
      const overlap = minDist - dist;
      b.x += nx * overlap;
      b.y += ny * overlap;

      // Cap velocity due to ring rotation
      const capVx = -Math.sin(capAngle) * angularVel * this.ringRadius;
      const capVy = Math.cos(capAngle) * angularVel * this.ringRadius;

      const rvx = b.vx - capVx;
      const rvy = b.vy - capVy;
      const vDotN = rvx * nx + rvy * ny;

      if (vDotN < 0) {
        const bounce = Math.min(1.12, Math.max(0.55, restitution));
        b.vx -= (1 + bounce) * vDotN * nx;
        b.vy -= (1 + bounce) * vDotN * ny;
      }
    }
  }

  private eliminateBall(b: Ball, dx: number, dy: number, dist: number) {
    b.alive = false;
    const eliminatedRank = this.aliveCount;
    this.aliveCount = Math.max(0, this.aliveCount - 1);

    const safeDist = Math.max(dist, 1);
    const dirX = dx / safeDist;
    const dirY = dy / safeDist;

    this.spawnEliminationBurst(b.x, b.y, dirX, dirY, b.flag.fallbackColor, b.flag.fallbackAccent);
    soundEngine.playElimination(this.aliveCount / Math.max(this.totalCount, 1));

    this.callbacks.onEliminate(b.flag, eliminatedRank, this.aliveCount);

    if (this.aliveCount === 1) {
      const survivor = this.balls.find((item) => item.alive) || null;
      if (survivor) {
        this.isVictory = true;
        this.winnerBall = survivor;
        this.spawnVictoryConfetti(85);
        soundEngine.playVictory();
        this.emitSnapshot();
        this.callbacks.onVictory(survivor.flag);
      }
    }
  }

  private spawnWallSparks(x: number, y: number, inNx: number, inNy: number) {
    if (this.particles.length > 240) return;
    const ringColors = this.getRingColors();
    for (let i = 0; i < 3; i++) {
      const spread = (Math.random() - 0.5) * 1.4;
      const baseA = Math.atan2(inNy, inNx) + spread;
      const spd = 65 + Math.random() * 110;
      this.particles.push({
        x,
        y,
        vx: Math.cos(baseA) * spd,
        vy: Math.sin(baseA) * spd,
        size: 1.8 + Math.random() * 1.8,
        color: i === 0 ? '#ffffff' : ringColors.glow,
        alpha: 0.9,
        life: 0,
        maxLife: 0.22 + Math.random() * 0.14,
      });
    }
  }

  private spawnEliminationBurst(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    primaryColor: string,
    accentColor: string
  ) {
    const ringColors = this.getRingColors();
    const baseAngle = Math.atan2(dirY, dirX);

    this.shockwaves.push({
      x,
      y,
      radius: 8,
      maxRadius: 46,
      color: ringColors.glow,
      alpha: 0.9,
    });

    const count = this.aliveCount > 60 ? 12 : 20;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * 2.2;
      const speed = 110 + Math.random() * 240;
      const pick = i % 3;
      const color = pick === 0 ? '#ffffff' : pick === 1 ? primaryColor : accentColor;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.4 + Math.random() * 3.6,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.42 + Math.random() * 0.3,
      });
    }
  }

  private spawnVictoryConfetti(count: number) {
    for (let i = 0; i < count; i++) {
      const fromTop = Math.random() > 0.35;
      const x = fromTop ? Math.random() * ARENA_WIDTH : ARENA_CX + (Math.random() - 0.5) * 140;
      const y = fromTop ? -12 - Math.random() * 80 : ARENA_CY - 40 + (Math.random() - 0.5) * 80;
      this.confetti.push({
        x,
        y,
        vx: (Math.random() - 0.5) * (fromTop ? 120 : 340),
        vy: fromTop ? 120 + Math.random() * 190 : -220 - Math.random() * 240,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 10,
        life: 3.5 + Math.random() * 2.5,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.vy += 120 * dt;
      p.alpha = 1 - p.life / p.maxLife;
    }
  }

  private updateShockwaves(dt: number) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += (s.maxRadius - s.radius) * Math.min(1, dt * 10) + 28 * dt;
      s.alpha -= dt * 2.2;
      if (s.alpha <= 0 || s.radius >= s.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  private updateConfetti(dt: number) {
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life -= dt;
      if (c.life <= 0 || c.y > ARENA_HEIGHT + 30) {
        this.confetti.splice(i, 1);
        continue;
      }
      c.vy += 290 * dt;
      c.vx *= 0.985;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.angle += c.vAngle * dt;
    }
  }

  private emitSnapshot() {
    this.callbacks.onSnapshot({
      aliveCount: this.aliveCount,
      totalCount: this.totalCount,
      ringScale: this.ringRadius / BASE_RING_RADIUS,
      chaosBoostActive: this.chaosBoostRemaining > 0,
      elapsedSeconds: this.elapsedSeconds,
    });
  }

  private render() {
    const ctx = this.ctx;
    const colors = this.getRingColors();

    // 1. Deep navy-black backdrop
    ctx.fillStyle = '#060b18';
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Subtle radial ambient glow centered on the arena ring
    const ambientGrad = ctx.createRadialGradient(
      ARENA_CX,
      ARENA_CY,
      this.ringRadius * 0.15,
      ARENA_CX,
      ARENA_CY,
      this.ringRadius * 1.65
    );
    ambientGrad.addColorStop(0, colors.bgGlow);
    ambientGrad.addColorStop(0.55, 'rgba(10, 18, 38, 0.55)');
    ambientGrad.addColorStop(1, 'rgba(6, 11, 24, 0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Subtle dark interior arena disc + reference rings
    ctx.save();
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, this.ringRadius, 0, Math.PI * 2);
    const innerGrad = ctx.createRadialGradient(
      ARENA_CX,
      ARENA_CY,
      0,
      ARENA_CX,
      ARENA_CY,
      this.ringRadius
    );
    innerGrad.addColorStop(0, '#0b1429');
    innerGrad.addColorStop(0.85, '#070e1f');
    innerGrad.addColorStop(1, '#0c1833');
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // Faint tactical inner reference circle (keeps depth crisp without clutter)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, this.ringRadius * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    // Faint original outer ring ghost in Shrinking Mode so players feel the squeeze
    if (this.mode === 'shrinking' && this.ringRadius < BASE_RING_RADIUS - 3) {
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ARENA_CX, ARENA_CY, BASE_RING_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // 2. Shockwaves behind balls & ring
    for (let i = 0; i < this.shockwaves.length; i++) {
      const s = this.shockwaves[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw thick glowing neon circular ring with rotating open exit gap
    this.renderNeonRing(ctx, colors);

    // 4. Draw all alive circular flag balls
    const showNameLabels = !this.isVictory && this.aliveCount <= 5 && this.aliveCount > 0;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.alive) continue;
      this.renderFlagBall(ctx, b, showNameLabels);
    }

    // 5. Elimination particle bursts
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. Victory confetti
    for (let i = 0; i < this.confetti.length; i++) {
      const c = this.confetti[i];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  }

  private renderNeonRing(
    ctx: CanvasRenderingContext2D,
    colors: { core: string; glow: string; bgGlow: string; accent: string }
  ) {
    const gapHalf = this.getEffectiveGapRad() / 2;
    const startAngle = this.gapAngle + gapHalf;
    const endAngle = this.gapAngle - gapHalf + Math.PI * 2;
    const ringDrawRadius = this.ringRadius + WALL_THICKNESS * 0.45;

    ctx.save();
    ctx.lineCap = 'round';

    // Subtle open exit-zone danger arc indicator inside the gap
    ctx.save();
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, ringDrawRadius, this.gapAngle - gapHalf + 0.06, this.gapAngle + gapHalf - 0.06);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.22)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.restore();

    // Outer wide neon bloom
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, ringDrawRadius, startAngle, endAngle);
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 26 + this.ringFlashAlpha * 22;
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = WALL_THICKNESS + 3;
    ctx.stroke();

    // Mid saturated neon ring body
    ctx.shadowBlur = 10;
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = WALL_THICKNESS;
    ctx.stroke();

    // Crisp bright inner core line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colors.core;
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // Glowing cap nodes marking the two edges of the open exit gap
    const caps = [this.gapAngle - gapHalf, this.gapAngle + gapHalf];
    for (const a of caps) {
      const cx = ARENA_CX + Math.cos(a) * ringDrawRadius;
      const cy = ARENA_CY + Math.sin(a) * ringDrawRadius;
      ctx.beginPath();
      ctx.arc(cx, cy, CAP_RADIUS - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 14;
      ctx.fill();
    }

    ctx.restore();
  }

  private renderFlagBall(ctx: CanvasRenderingContext2D, b: Ball, showLabel: boolean) {
    const r = this.isVictory && b === this.winnerBall ? Math.max(b.radius * 1.45, 34) : b.radius;

    ctx.save();
    ctx.translate(b.x, b.y);

    // Champion golden aura or final-5 subtle halo
    if (this.isVictory && b === this.winnerBall) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 24;
      ctx.stroke();
      ctx.restore();
    } else if (showLabel) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Rotate subtle flag spin for lively tactile feel
    ctx.save();
    ctx.rotate(b.rotation);

    // Circular clipping path
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const cached = this.imageCache.get(b.flag.imageUrl);
    if (cached && cached !== 'error' && cached.complete && cached.naturalWidth > 0) {
      // Object-cover crop so rectangular flags fill the circle edge-to-edge cleanly
      const imgW = cached.naturalWidth;
      const imgH = cached.naturalHeight;
      const diameter = r * 2;
      const scale = Math.max(diameter / imgW, diameter / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      ctx.drawImage(cached, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      // Automatic colored fallback badge with country code
      ctx.fillStyle = b.flag.fallbackColor;
      ctx.fillRect(-r, -r, r * 2, r * 2);

      // Subtle diagonal stripe accent
      ctx.fillStyle = b.flag.fallbackAccent;
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.2);
      ctx.lineTo(r, -r * 0.65);
      ctx.lineTo(r, r);
      ctx.lineTo(-r, r);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#ffffff';
      const fontSize = Math.max(8, Math.round(r * 0.78));
      ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.flag.code.toUpperCase().slice(0, 3), 0, 0.5);
    }

    // Subtle glossy rim highlight at top edge
    const sheen = ctx.createLinearGradient(0, -r, 0, r * 0.25);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.26)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-r, -r, r * 2, r * 1.25);

    ctx.restore();

    // Crisp thin white circular border
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = r > 18 ? 2 : 1.45;
    ctx.stroke();

    // Final-5 compact name tag underneath ball
    if (showLabel) {
      ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(6, 11, 24, 0.82)';
      const label = b.flag.name.length > 14 ? `${b.flag.name.slice(0, 13)}…` : b.flag.name;
      const w = ctx.measureText(label).width + 10;
      ctx.fillRect(-w / 2, r + 5, w, 16);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(label, 0, r + 7);
    }

    ctx.restore();
  }
}
