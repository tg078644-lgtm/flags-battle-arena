import { audioHub } from './audioHub';

class ArenaSoundEngine {
  private muted: boolean = false;
  private lastEliminationTime: number = 0;
  private lastBounceTime: number = 0;

  private ensureAudio(): { ctx: AudioContext; out: AudioNode } | null {
    if (this.muted) return null;
    const ctx = audioHub.getContext();
    const out = audioHub.getOutputNode();
    if (!ctx || !out) return null;
    return { ctx, out };
  }

  public unlock() {
    audioHub.getContext();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Snappy pop + boing sound when a flag exits through the gap.
   * Pitch gently ascends as fewer flags remain for rising tension.
   */
  public playElimination(aliveRatio: number) {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    // Throttle slightly during mass exits so audio stays crisp and never distorts
    if (now - this.lastEliminationTime < 0.045) return;
    this.lastEliminationTime = now;

    const tension = 1 - Math.max(0, Math.min(1, aliveRatio));
    const baseFreq = 260 + tension * 340 + (Math.random() * 40 - 20);

    // Pop transient
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 0.72, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.95, now + 0.065);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, now + 0.16);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.18);

    // Subtle boing harmonic
    const boing = ctx.createOscillator();
    const boingGain = ctx.createGain();
    boing.type = 'sine';
    boing.frequency.setValueAtTime(baseFreq * 1.35, now + 0.015);
    boing.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, now + 0.14);

    boingGain.gain.setValueAtTime(0.0001, now + 0.015);
    boingGain.gain.linearRampToValueAtTime(0.07, now + 0.03);
    boingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    boing.connect(boingGain);
    boingGain.connect(out);
    boing.start(now + 0.015);
    boing.stop(now + 0.16);
  }

  /**
   * Subtle tactile ping for occasional hard wall impacts
   */
  public playWallBounce(intensity: number) {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    if (now - this.lastBounceTime < 0.075) return;
    this.lastBounceTime = now;

    const clamped = Math.max(0.2, Math.min(1, intensity));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const f = 140 + clamped * 160 + Math.random() * 35;
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, now + 0.055);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.032 * clamped, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  /**
   * Energetic upward sweep when Chaos Mode fires a speed boost
   */
  public playChaosBoost() {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.22);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Celebratory fanfare chord when a champion wins
   */
  public playVictory() {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, i) => {
      const start = now + i * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = i === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);

      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + 0.75);
    });
  }

  /**
   * Soft metronome tick during 3-2-1 auto-restart countdown
   */
  public playCountdownTick(finalTick: boolean = false) {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(finalTick ? 880 : 540, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}

export const soundEngine = new ArenaSoundEngine();
