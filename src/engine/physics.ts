import { ArenaSnapshot, CountryFlag, GameMode, PhysicsSettings } from '../types';
import { soundEngine } from '../utils/audio';

export const ARENA_WIDTH = 540;
export const ARENA_HEIGHT = 960;
export const ARENA_CX = ARENA_WIDTH / 2;
export const ARENA_CY = 515;
export const BASE_RING_RADIUS = 194;
const WALL_THICKNESS = 10;
const CAP_RADIUS = 6;

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /Android|iPhone|iPad|iPod|Mobile|WebView|wv/i.test(ua) || window.innerWidth <= 768;
}

interface Ball {
  flag: CountryFlag;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
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

  private isMobile: boolean = detectMobile();
  private dpr: number = 1;

  private balls: Ball[] = [];
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private confetti: Confetti[] = [];

  // Pre-rendered offscreen flag sprite bitmaps (zero per-frame clipping/borders/shadows)
  private imageCache: Map<string, HTMLImageElement | 'error'> = new Map();
  private spriteCache: Map<string, HTMLCanvasElement> = new Map();
  private currentBallRadius: number = 10;
  private currentSpriteLogicalSize: number = 24;

  // Cached static backdrop canvas (avoids recreating radial gradients 60x/sec)
  private bgCanvas: HTMLCanvasElement | null = null;
  private bgCacheKey: string = '';

  // Zero-allocation flat typed-array 2D spatial hash grid
  private gridCellSize: number = 24;
  private gridCols: number = 25;
  private gridRows: number = 42;
  private cellHead: Int32Array = new Int32Array(25 * 42);
  private ballNext: Int32Array = new Int32Array(256);
  private aliveIndices: Int32Array = new Int32Array(256);

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
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;
    this.callbacks = callbacks;
    this.setupHighDpi();
  }

  public setupHighDpi() {
    this.isMobile = detectMobile();
    const maxDpr = this.isMobile ? 1.5 : 2;
    const nextDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const dprChanged = Math.abs(nextDpr - this.dpr) > 0.05;
    this.dpr = nextDpr;

    this.canvas.width = Math.round(ARENA_WIDTH * this.dpr);
    this.canvas.height = Math.round(ARENA_HEIGHT * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (dprChanged) {
      this.bgCacheKey = '';
      if (this.balls.length > 0) {
        this.rebuildAllSprites();
      }
    }
  }

  public setMode(mode: GameMode) {
    this.mode = mode;
    if (mode !== 'shrinking') {
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

  /**
   * Pre-renders a crisp circular flag sprite (image or colored fallback badge + gloss + white border)
   * onto an offscreen canvas bitmap once, so the 60fps loop only performs a single drawImage blit.
   */
  private bakeFlagSprite(flag: CountryFlag, radius: number): HTMLCanvasElement {
    const pad = 2.5;
    const logicalSize = Math.ceil((radius + pad) * 2);
    const pixelSize = Math.max(16, Math.ceil(logicalSize * this.dpr));

    const off = document.createElement('canvas');
    off.width = pixelSize;
    off.height = pixelSize;
    const sctx = off.getContext('2d');
    if (!sctx) return off;

    sctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cx = logicalSize / 2;
    const cy = logicalSize / 2;

    sctx.save();
    sctx.beginPath();
    sctx.arc(cx, cy, radius, 0, Math.PI * 2);
    sctx.closePath();
    sctx.clip();

    const cached = this.imageCache.get(flag.imageUrl);
    if (cached && cached !== 'error' && cached.complete && cached.naturalWidth > 0) {
      const imgW = cached.naturalWidth;
      const imgH = cached.naturalHeight;
      const diameter = radius * 2;
      const scale = Math.max(diameter / imgW, diameter / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      sctx.drawImage(cached, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    } else {
      // Automatic colored fallback badge with country code
      sctx.fillStyle = flag.fallbackColor;
      sctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

      sctx.fillStyle = flag.fallbackAccent;
      sctx.globalAlpha = 0.32;
      sctx.beginPath();
      sctx.moveTo(cx - radius, cy + radius * 0.2);
      sctx.lineTo(cx + radius, cy - radius * 0.65);
      sctx.lineTo(cx + radius, cy + radius);
      sctx.lineTo(cx - radius, cy + radius);
      sctx.closePath();
      sctx.fill();
      sctx.globalAlpha = 1;

      sctx.fillStyle = '#ffffff';
      const fontSize = Math.max(7, Math.round(radius * 0.78));
      sctx.font = `700 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText(flag.code.toUpperCase().slice(0, 3), cx, cy + 0.5);
    }

    // Subtle specular highlight baked once into sprite
    const sheen = sctx.createLinearGradient(0, cy - radius, 0, cy + radius * 0.2);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    sctx.fillStyle = sheen;
    sctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 1.2);
    sctx.restore();

    // Crisp thin white circular border baked once into sprite
    sctx.beginPath();
    sctx.arc(cx, cy, radius, 0, Math.PI * 2);
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    sctx.lineWidth = radius > 16 ? 1.85 : 1.35;
    sctx.stroke();

    return off;
  }

  private rebuildAllSprites() {
    this.spriteCache.clear();
    const radius = this.currentBallRadius;
    this.currentSpriteLogicalSize = Math.ceil((radius + 2.5) * 2);
    for (let i = 0; i < this.balls.length; i++) {
      const flag = this.balls[i].flag;
      this.spriteCache.set(flag.id, this.bakeFlagSprite(flag, radius));
    }
  }

  private ensureImageAndSprite(flag: CountryFlag, radius: number) {
    // Always bake an immediate sprite (real image if cached, else colored fallback badge)
    this.spriteCache.set(flag.id, this.bakeFlagSprite(flag, radius));

    const url = flag.imageUrl;
    if (!url || this.imageCache.has(url)) return;

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      this.imageCache.set(url, img);
      // Re-bake only this single flag's offscreen sprite once its PNG finishes loading
      if (Math.abs(this.currentBallRadius - radius) < 0.01) {
        this.spriteCache.set(flag.id, this.bakeFlagSprite(flag, radius));
      }
    };
    img.onerror = () => {
      this.imageCache.set(url, 'error');
    };
    img.src = url;
    this.imageCache.set(url, img);
  }

  private ensureBackdropCache(key: string, bgGlow: string) {
    if (this.bgCanvas && this.bgCacheKey === key) return;

    if (!this.bgCanvas) {
      this.bgCanvas = document.createElement('canvas');
    }
    const w = Math.round(ARENA_WIDTH * this.dpr);
    const h = Math.round(ARENA_HEIGHT * this.dpr);
    if (this.bgCanvas.width !== w || this.bgCanvas.height !== h) {
      this.bgCanvas.width = w;
      this.bgCanvas.height = h;
    }

    const bctx = this.bgCanvas.getContext('2d', { alpha: false });
    if (!bctx) return;

    bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    bctx.fillStyle = '#060b18';
    bctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    const ambientGrad = bctx.createRadialGradient(
      ARENA_CX,
      ARENA_CY,
      BASE_RING_RADIUS * 0.15,
      ARENA_CX,
      ARENA_CY,
      BASE_RING_RADIUS * 1.7
    );
    ambientGrad.addColorStop(0, bgGlow);
    ambientGrad.addColorStop(0.55, 'rgba(10, 18, 38, 0.55)');
    ambientGrad.addColorStop(1, 'rgba(6, 11, 24, 0)');
    bctx.fillStyle = ambientGrad;
    bctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    this.bgCacheKey = key;
  }

  private configureSpatialGrid(ballRadius: number, count: number) {
    this.gridCellSize = Math.max(Math.ceil(ballRadius * 2.2), 20);
    this.gridCols = Math.ceil(ARENA_WIDTH / this.gridCellSize) + 2;
    this.gridRows = Math.ceil(ARENA_HEIGHT / this.gridCellSize) + 2;
    const totalCells = this.gridCols * this.gridRows;
    if (this.cellHead.length < totalCells) {
      this.cellHead = new Int32Array(totalCells);
    }
    const neededBalls = Math.max(count + 8, 256);
    if (this.ballNext.length < neededBalls) {
      this.ballNext = new Int32Array(neededBalls);
      this.aliveIndices = new Int32Array(neededBalls);
    }
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
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.confetti.length = 0;
    this.chaosTimer = 0;
    this.chaosBoostRemaining = 0;
    this.ringFlashAlpha = 0;

    // Fisher-Yates shuffle for fair spawn placement every round
    const shuffled = [...activeFlags];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const n = Math.max(shuffled.length, 1);
    const computedRadius = Math.sqrt((0.36 * BASE_RING_RADIUS * BASE_RING_RADIUS) / n);
    const ballRadius = Math.max(9.4, Math.min(23, computedRadius));
    const radiusChanged = Math.abs(ballRadius - this.currentBallRadius) > 0.05;
    this.currentBallRadius = ballRadius;
    this.currentSpriteLogicalSize = Math.ceil((ballRadius + 2.5) * 2);

    if (radiusChanged) {
      this.spriteCache.clear();
    }

    this.configureSpatialGrid(ballRadius, n);

    const spawnLimit = BASE_RING_RADIUS - ballRadius - 11;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    this.balls = shuffled.map((flag, i) => {
      if (!this.spriteCache.has(flag.id)) {
        this.ensureImageAndSprite(flag, ballRadius);
      }

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
        alive: true,
        kickCooldown: Math.random() * 1.2,
      };
    });

    if (this.balls.length === 1) {
      this.isVictory = true;
      this.winnerBall = this.balls[0];
      this.spawnVictoryConfetti(this.isMobile ? 45 : 75);
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
      // Clamp dt to prevent physics tunneling on slow frames or tab switches
      const dt = Math.min(Math.max(rawDt, 0.001), 0.035);

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
    this.spriteCache.clear();
    this.bgCanvas = null;
  }

  private getEffectiveGapRad(): number {
    const baseRad = (this.settings.gapAngleDeg * Math.PI) / 180;
    const minArcWidth = this.currentBallRadius * 2.55;
    const minRad = minArcWidth / Math.max(this.ringRadius, 50);
    return Math.min(Math.PI * 1.35, Math.max(baseRad, minRad));
  }

  private getRingColors(): {
    key: string;
    core: string;
    glow: string;
    bgGlow: string;
  } {
    if (this.mode === 'chaos') {
      return this.chaosBoostRemaining > 0
        ? {
            key: 'chaos_boost',
            core: '#fdf2f8',
            glow: '#f43f5e',
            bgGlow: 'rgba(244, 63, 94, 0.24)',
          }
        : {
            key: 'chaos_idle',
            core: '#f5d0fe',
            glow: '#e879f9',
            bgGlow: 'rgba(217, 70, 239, 0.16)',
          };
    }

    if (this.mode === 'shrinking') {
      const shrinkRatio = 1 - (this.ringRadius - 72) / (BASE_RING_RADIUS - 72);
      return shrinkRatio > 0.55
        ? {
            key: 'shrink_hot',
            core: '#ffedd5',
            glow: '#f97316',
            bgGlow: 'rgba(249, 115, 22, 0.20)',
          }
        : {
            key: 'shrink_warm',
            core: '#fef3c7',
            glow: '#f59e0b',
            bgGlow: 'rgba(245, 158, 11, 0.16)',
          };
    }

    return {
      key: 'classic',
      core: '#ecfeff',
      glow: '#22d3ee',
      bgGlow: 'rgba(34, 211, 238, 0.14)',
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
      this.gapAngle = normalizeAngle(this.gapAngle + 0.55 * dt);
      if (this.winnerBall) {
        const b = this.winnerBall;
        b.x += (ARENA_CX - b.x) * Math.min(1, dt * 4.5);
        b.y += (ARENA_CY - b.y) * Math.min(1, dt * 4.5);
      }
      this.confettiAccum += dt;
      if (this.confettiAccum >= 0.4) {
        this.confettiAccum = 0;
        this.spawnVictoryConfetti(this.isMobile ? 8 : 14);
      }
      return;
    }

    this.elapsedSeconds += dt;

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
      const minRadius = Math.max(72, this.currentBallRadius * 3.8);
      const shrinkSpeed = this.aliveCount <= 12 ? 6.5 : 4.2;
      this.ringRadius = Math.max(minRadius, this.ringRadius - shrinkSpeed * dt);
    }

    const baseAngularVel = 1.15 * this.settings.spinSpeed * spinMult;
    // 2 fixed substeps = 120Hz collision resolution with 33% less mobile CPU cost
    const substeps = 2;
    const subDt = dt / substeps;
    const gravity = 250;
    const maxSpeed = this.mode === 'chaos' ? 920 : 740;
    const effectiveGapHalf = this.getEffectiveGapRad() / 2;

    for (let step = 0; step < substeps; step++) {
      this.gapAngle = normalizeAngle(this.gapAngle + baseAngularVel * subDt);
      this.stepPhysics(subDt, gravity, baseAngularVel, effectiveGapHalf, maxSpeed);
      if (this.isVictory) break;
    }

    // Throttle HUD snapshot callbacks to ~4.5 Hz (every 220ms)
    this.snapshotAccum += dt;
    if (this.snapshotAccum >= 0.22) {
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
      maxRadius: this.ringRadius + 34,
      color: '#f43f5e',
      alpha: 0.72,
    });

    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.alive) continue;
      const angle = Math.random() * Math.PI * 2;
      const impulse = 175 + Math.random() * 145;
      b.vx += Math.cos(angle) * impulse;
      b.vy += Math.sin(angle) * impulse - 65;
    }
  }

  private stepPhysics(
    dt: number,
    gravity: number,
    angularVel: number,
    gapHalf: number,
    maxSpeed: number
  ) {
    const balls = this.balls;
    const total = balls.length;
    const aliveIndices = this.aliveIndices;
    let aliveLen = 0;

    const R = this.ringRadius;
    const restitution = this.settings.bounciness;
    const ballRestitution = Math.min(1.03, Math.max(0.55, restitution * 0.96));
    const maxSpeedSq = maxSpeed * maxSpeed;

    const cols = this.gridCols;
    const rows = this.gridRows;
    const cellHead = this.cellHead;
    const ballNext = this.ballNext;
    const invCell = 1 / this.gridCellSize;

    // Reset flat spatial hash grid with zero heap allocation
    cellHead.fill(-1, 0, cols * rows);

    // 1. Integrate forces, anti-stall kicks, velocity caps, and insert into 2D spatial grid
    for (let i = 0; i < total; i++) {
      const b = balls[i];
      if (!b.alive) continue;

      aliveIndices[aliveLen++] = i;

      b.vy += gravity * dt;
      b.kickCooldown -= dt;
      const speedSq = b.vx * b.vx + b.vy * b.vy;
      if (b.kickCooldown <= 0 || speedSq < 5800) {
        const kickAngle = Math.random() * Math.PI * 2;
        const kickStrength = speedSq < 5800 ? 110 + Math.random() * 80 : 32 + Math.random() * 48;
        b.vx += Math.cos(kickAngle) * kickStrength;
        const bottomBias = b.y > ARENA_CY + R * 0.35 ? -58 : -12;
        b.vy += Math.sin(kickAngle) * kickStrength + bottomBias;
        b.kickCooldown = 0.55 + Math.random() * 1.1;
      }

      b.vx *= 0.9991;
      b.vy *= 0.9991;
      const newSpeedSq = b.vx * b.vx + b.vy * b.vy;
      if (newSpeedSq > maxSpeedSq) {
        const scale = maxSpeed / Math.sqrt(newSpeedSq);
        b.vx *= scale;
        b.vy *= scale;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Insert into flat 2D spatial hash grid
      let gx = Math.floor(b.x * invCell) + 1;
      let gy = Math.floor(b.y * invCell) + 1;
      if (gx < 0) gx = 0;
      else if (gx >= cols) gx = cols - 1;
      if (gy < 0) gy = 0;
      else if (gy >= rows) gy = rows - 1;

      const cellIdx = gy * cols + gx;
      ballNext[i] = cellHead[cellIdx];
      cellHead[cellIdx] = i;
    }

    // 2. Broad-phase + narrow-phase circle-to-circle collisions via half-neighborhood spatial hash
    // Checks own cell (j > i) + 4 forward neighbor cells -> visits each candidate pair exactly once!
    if (aliveLen > 1) {
      for (let k = 0; k < aliveLen; k++) {
        const i = aliveIndices[k];
        const a = balls[i];

        let gx = Math.floor(a.x * invCell) + 1;
        let gy = Math.floor(a.y * invCell) + 1;
        if (gx < 0) gx = 0;
        else if (gx >= cols) gx = cols - 1;
        if (gy < 0) gy = 0;
        else if (gy >= rows) gy = rows - 1;

        const baseCell = gy * cols + gx;

        // Same cell: follow linked list from ballNext[i] to guarantee each pair checked once
        let j = ballNext[i];
        while (j !== -1) {
          this.resolveBallPair(a, balls[j], ballRestitution);
          j = ballNext[j];
        }

        // Right neighbor (gx + 1, gy)
        if (gx + 1 < cols) {
          j = cellHead[baseCell + 1];
          while (j !== -1) {
            this.resolveBallPair(a, balls[j], ballRestitution);
            j = ballNext[j];
          }
        }

        // Bottom row neighbors: (gx - 1, gy + 1), (gx, gy + 1), (gx + 1, gy + 1)
        if (gy + 1 < rows) {
          const nextRowBase = baseCell + cols;
          if (gx > 0) {
            j = cellHead[nextRowBase - 1];
            while (j !== -1) {
              this.resolveBallPair(a, balls[j], ballRestitution);
              j = ballNext[j];
            }
          }

          j = cellHead[nextRowBase];
          while (j !== -1) {
            this.resolveBallPair(a, balls[j], ballRestitution);
            j = ballNext[j];
          }

          if (gx + 1 < cols) {
            j = cellHead[nextRowBase + 1];
            while (j !== -1) {
              this.resolveBallPair(a, balls[j], ballRestitution);
              j = ballNext[j];
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

    for (let k = 0; k < aliveLen; k++) {
      const b = balls[aliveIndices[k]];
      if (!b.alive) continue;

      const dx = b.x - ARENA_CX;
      const dy = b.y - ARENA_CY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const deltaFromGap = Math.abs(angularDiff(angle, this.gapAngle));
      const insideGapArc = deltaFromGap < gapHalf;

      if ((insideGapArc && dist > R) || dist > R + WALL_THICKNESS + b.radius) {
        this.eliminateBall(b, dx, dy, dist);
        if (this.isVictory) return;
        continue;
      }

      if (!insideGapArc && dist + b.radius > R && dist > 0.0001) {
        const invDist = 1 / dist;
        const outNx = dx * invDist;
        const outNy = dy * invDist;
        const inNx = -outNx;
        const inNy = -outNy;

        b.x = ARENA_CX + outNx * (R - b.radius);
        b.y = ARENA_CY + outNy * (R - b.radius);

        const vDotIn = b.vx * inNx + b.vy * inNy;
        if (vDotIn < 0) {
          const wallBounce = Math.min(1.16, Math.max(0.45, restitution));
          b.vx -= (1 + wallBounce) * vDotIn * inNx;
          b.vy -= (1 + wallBounce) * vDotIn * inNy;

          const tx = -outNy;
          const ty = outNx;
          const wallTangentialSpeed = angularVel * R;
          b.vx += tx * wallTangentialSpeed * 0.095;
          b.vy += ty * wallTangentialSpeed * 0.095;

          if (-vDotIn > 185) {
            soundEngine.playWallBounce((-vDotIn - 165) / 380);
            this.spawnWallSparks(
              ARENA_CX + outNx * R,
              ARENA_CY + outNy * R,
              inNx,
              inNy
            );
          }
        }
      }

      this.collideWithCap(b, capAX, capAY, capAngleA, angularVel, restitution);
      this.collideWithCap(b, capBX, capBY, capAngleB, angularVel, restitution);
    }
  }

  private resolveBallPair(a: Ball, b: Ball, ballRestitution: number) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDist = a.radius + b.radius;
    const distSq = dx * dx + dy * dy;

    if (distSq >= minDist * minDist) return;

    let dist = Math.sqrt(distSq);
    let nx: number;
    let ny: number;

    if (dist < 0.0001) {
      const randA = Math.random() * Math.PI * 2;
      nx = Math.cos(randA);
      ny = Math.sin(randA);
      dist = 0.0001;
    } else {
      const invD = 1 / dist;
      nx = dx * invD;
      ny = dy * invD;
    }

    const overlap = (minDist - dist) * 0.505;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;

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
      const invD = 1 / dist;
      const nx = dx * invD;
      const ny = dy * invD;

      const overlap = minDist - dist;
      b.x += nx * overlap;
      b.y += ny * overlap;

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
        this.spawnVictoryConfetti(this.isMobile ? 45 : 75);
        soundEngine.playVictory();
        this.emitSnapshot();
        this.callbacks.onVictory(survivor.flag);
      }
    }
  }

  private spawnWallSparks(x: number, y: number, inNx: number, inNy: number) {
    const cap = this.isMobile ? 70 : 140;
    if (this.particles.length >= cap) return;
    const ringColors = this.getRingColors();
    const count = this.isMobile ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.4;
      const baseA = Math.atan2(inNy, inNx) + spread;
      const spd = 65 + Math.random() * 110;
      this.particles.push({
        x,
        y,
        vx: Math.cos(baseA) * spd,
        vy: Math.sin(baseA) * spd,
        size: 1.8 + Math.random() * 1.5,
        color: i === 0 ? '#ffffff' : ringColors.glow,
        alpha: 0.9,
        life: 0,
        maxLife: 0.2 + Math.random() * 0.12,
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

    if (this.shockwaves.length < 10) {
      this.shockwaves.push({
        x,
        y,
        radius: 8,
        maxRadius: 42,
        color: ringColors.glow,
        alpha: 0.85,
      });
    }

    const cap = this.isMobile ? 80 : 150;
    const count = this.isMobile
      ? this.aliveCount > 60
        ? 5
        : 9
      : this.aliveCount > 60
      ? 9
      : 15;

    for (let i = 0; i < count && this.particles.length < cap; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * 2.2;
      const speed = 110 + Math.random() * 220;
      const pick = i % 3;
      const color = pick === 0 ? '#ffffff' : pick === 1 ? primaryColor : accentColor;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.2 + Math.random() * 3.0,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.38 + Math.random() * 0.26,
      });
    }
  }

  private spawnVictoryConfetti(count: number) {
    const maxConfetti = this.isMobile ? 55 : 95;
    for (let i = 0; i < count && this.confetti.length < maxConfetti; i++) {
      const fromTop = Math.random() > 0.35;
      const x = fromTop ? Math.random() * ARENA_WIDTH : ARENA_CX + (Math.random() - 0.5) * 140;
      const y = fromTop ? -12 - Math.random() * 80 : ARENA_CY - 40 + (Math.random() - 0.5) * 80;
      this.confetti.push({
        x,
        y,
        vx: (Math.random() - 0.5) * (fromTop ? 120 : 320),
        vy: fromTop ? 120 + Math.random() * 190 : -220 - Math.random() * 220,
        w: 6 + Math.random() * 5,
        h: 4 + Math.random() * 4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 9,
        life: 3.2 + Math.random() * 2.2,
      });
    }
  }

  private updateParticles(dt: number) {
    const list = this.particles;
    let i = list.length;
    while (i-- > 0) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        list[i] = list[list.length - 1];
        list.pop();
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
    const list = this.shockwaves;
    let i = list.length;
    while (i-- > 0) {
      const s = list[i];
      s.radius += (s.maxRadius - s.radius) * Math.min(1, dt * 10) + 28 * dt;
      s.alpha -= dt * 2.2;
      if (s.alpha <= 0 || s.radius >= s.maxRadius) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  private updateConfetti(dt: number) {
    const list = this.confetti;
    let i = list.length;
    while (i-- > 0) {
      const c = list[i];
      c.life -= dt;
      if (c.life <= 0 || c.y > ARENA_HEIGHT + 30) {
        list[i] = list[list.length - 1];
        list.pop();
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

    // 1. Blit pre-rendered radial backdrop (zero per-frame gradient allocations)
    this.ensureBackdropCache(colors.key, colors.bgGlow);
    if (this.bgCanvas) {
      ctx.drawImage(this.bgCanvas, 0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    } else {
      ctx.fillStyle = '#060b18';
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    }

    // Dark interior arena disc + tactical inner ring
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, this.ringRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#081023';
    ctx.fill();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, this.ringRadius * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    if (this.mode === 'shrinking' && this.ringRadius < BASE_RING_RADIUS - 3) {
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ARENA_CX, ARENA_CY, BASE_RING_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Shockwaves (no shadowBlur)
    for (let i = 0; i < this.shockwaves.length; i++) {
      const s = this.shockwaves[i];
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 3. Draw thick glowing neon circular ring using fast layered alpha strokes (zero shadowBlur!)
    this.renderNeonRingFast(ctx, colors);

    // 4. Blit all alive flag sprites from pre-rendered offscreen canvases (zero clip/gradient/shadowBlur)
    const showNameLabels = !this.isVictory && this.aliveCount <= 5 && this.aliveCount > 0;
    const spriteSize = this.currentSpriteLogicalSize;
    const halfSprite = spriteSize * 0.5;
    const balls = this.balls;
    const spriteCache = this.spriteCache;

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b.alive) continue;

      const sprite = spriteCache.get(b.flag.id);
      if (this.isVictory && b === this.winnerBall) {
        const winR = Math.max(b.radius * 1.5, 32);
        const winSize = (winR + 2.5) * 2;
        // Layered golden champion halo (no shadowBlur)
        ctx.beginPath();
        ctx.arc(b.x, b.y, winR + 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.22)';
        ctx.lineWidth = 8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(b.x, b.y, winR + 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.78)';
        ctx.lineWidth = 2.6;
        ctx.stroke();

        if (sprite) {
          ctx.drawImage(sprite, b.x - winSize * 0.5, b.y - winSize * 0.5, winSize, winSize);
        }
        continue;
      }

      if (sprite) {
        ctx.drawImage(sprite, b.x - halfSprite, b.y - halfSprite, spriteSize, spriteSize);
      }

      if (showNameLabels) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = b.flag.name.length > 14 ? `${b.flag.name.slice(0, 13)}…` : b.flag.name;
        const w = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(6, 11, 24, 0.84)';
        ctx.fillRect(b.x - w * 0.5, b.y + b.radius + 4, w, 16);
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(label, b.x, b.y + b.radius + 6);
      }
    }

    // 5. Elimination particle bursts (fast rect/arc blits)
    const particles = this.particles;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // 6. Victory confetti
    const confetti = this.confetti;
    for (let i = 0; i < confetti.length; i++) {
      const c = confetti[i];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w * 0.5, -c.h * 0.5, c.w, c.h);
      ctx.restore();
    }
  }

  /**
   * Draws a lush glowing neon ring using layered translucent strokes instead of expensive ctx.shadowBlur.
   */
  private renderNeonRingFast(
    ctx: CanvasRenderingContext2D,
    colors: { core: string; glow: string; bgGlow: string }
  ) {
    const gapHalf = this.getEffectiveGapRad() / 2;
    const startAngle = this.gapAngle + gapHalf;
    const endAngle = this.gapAngle - gapHalf + Math.PI * 2;
    const ringDrawRadius = this.ringRadius + WALL_THICKNESS * 0.45;
    const boostAdd = this.ringFlashAlpha * 10;

    ctx.lineCap = 'round';

    // Open exit-gap subtle dashed guide
    ctx.beginPath();
    ctx.arc(
      ARENA_CX,
      ARENA_CY,
      ringDrawRadius,
      this.gapAngle - gapHalf + 0.06,
      this.gapAngle + gapHalf - 0.06
    );
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.24)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Wide outer neon bloom (replaces shadowBlur cleanly on Android WebView)
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, ringDrawRadius, startAngle, endAngle);
    ctx.globalAlpha = 0.14 + this.ringFlashAlpha * 0.12;
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = WALL_THICKNESS + 20 + boostAdd;
    ctx.stroke();

    // Mid neon bloom
    ctx.globalAlpha = 0.34 + this.ringFlashAlpha * 0.16;
    ctx.lineWidth = WALL_THICKNESS + 9 + boostAdd * 0.5;
    ctx.stroke();

    // Solid saturated neon body
    ctx.globalAlpha = 1;
    ctx.lineWidth = WALL_THICKNESS;
    ctx.stroke();

    // Bright crisp core highlight
    ctx.strokeStyle = colors.core;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Glowing cap nodes marking the two open-gap edges (layered circles, no shadowBlur)
    const capAngles = [this.gapAngle - gapHalf, this.gapAngle + gapHalf];
    for (let i = 0; i < 2; i++) {
      const a = capAngles[i];
      const cx = ARENA_CX + Math.cos(a) * ringDrawRadius;
      const cy = ARENA_CY + Math.sin(a) * ringDrawRadius;

      ctx.beginPath();
      ctx.arc(cx, cy, CAP_RADIUS + 5, 0, Math.PI * 2);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = colors.glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, CAP_RADIUS - 0.4, 0, Math.PI * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }
}
