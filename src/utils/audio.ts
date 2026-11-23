import { audioHub } from './audioHub';

const MAX_SFX_VOICES = 6;

class ArenaSoundEngine {
  private muted: boolean = false;
  private lastEliminationTime: number = 0;
  private lastBounceTime: number = 0;
  private activeVoices: number = 0;

  private ensureAudio(): { ctx: AudioContext; out: AudioNode } | null {
    if (this.muted) return null;
    const ctx = audioHub.getContext();
    const out = audioHub.getOutputNode();
    if (!ctx || !out) return null;
    return { ctx, out };
  }

  private bindCleanup(source: OscillatorNode, nodes: AudioNode[]) {
    this.activeVoices++;
    source.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      for (let i = 0; i < nodes.length; i++) {
        try {
          nodes[i].disconnect();
        } catch {
          // Already disconnected
        }
      }
      source.onended = null;
    };
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
   * Lightweight single-oscillator pop/boing sound when a flag exits through the gap.
   * Immediately disconnects finished nodes to prevent Android WebView memory leaks.
   */
  public playElimination(aliveRatio: number) {
    if (this.activeVoices >= MAX_SFX_VOICES) return;
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    if (now - this.lastEliminationTime < 0.065) return;
    this.lastEliminationTime = now;

    const tension = 1 - Math.max(0, Math.min(1, aliveRatio));
    const baseFreq = 260 + tension * 340 + (Math.random() * 36 - 18);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 0.72, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.9, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.1, now + 0.14);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(out);
    this.bindCleanup(osc, [osc, gain]);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Subtle tactile ping for occasional hard wall impacts (low priority, capped polyphony)
   */
  public playWallBounce(intensity: number) {
    if (this.activeVoices >= 3) return;
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    if (now - this.lastBounceTime < 0.11) return;
    this.lastBounceTime = now;

    const clamped = Math.max(0.2, Math.min(1, intensity));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const f = 140 + clamped * 150 + Math.random() * 30;
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, now + 0.05);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.028 * clamped, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(gain);
    gain.connect(out);
    this.bindCleanup(osc, [osc, gain]);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Energetic upward sweep when Chaos Mode fires a speed boost
   */
  public playChaosBoost() {
    if (this.activeVoices >= MAX_SFX_VOICES) return;
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.2);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1350, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    this.bindCleanup(osc, [osc, filter, gain]);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Celebratory 3-note fanfare when a champion wins
   */
  public playVictory() {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 1046.5]; // C5, E5, C6

    notes.forEach((freq, i) => {
      const start = now + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = i === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62);

      osc.connect(gain);
      gain.connect(out);
      this.bindCleanup(osc, [osc, gain]);
      osc.start(start);
      osc.stop(start + 0.64);
    });
  }

  /**
   * Crisp metronome tick during 3-2-1 countdowns
   */
  public playCountdownTick(finalTick: boolean = false) {
    if (this.activeVoices >= MAX_SFX_VOICES) return;
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
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

    osc.connect(gain);
    gain.connect(out);
    this.bindCleanup(osc, [osc, gain]);
    osc.start(now);
    osc.stop(now + 0.09);
  }
}

export const soundEngine = new ArenaSoundEngine();
