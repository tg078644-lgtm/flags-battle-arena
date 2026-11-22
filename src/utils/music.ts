/**
 * 100% Original, Copyright-Free Procedural Electronic / Arcade Music Engine
 * Powered purely by Web Audio API — zero audio files, zero API keys, safe for 24/7 streams & Shorts.
 *
 * Tempo: 124 BPM base, dynamically ramps to ~136 BPM when fewer than 10 flags remain.
 * Progression: 4-bar original D minor electro-arcade groove (Dm -> Bb -> C -> Am).
 */

import { audioHub } from './audioHub';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 4-bar bass pattern (16 sixteenth-notes per bar = 64 steps; null = rest)
// Bars: Dm (D2=38), Bb (Bb1=34), C (C2=36), Am (A1=33)
const BASS_STEPS: Array<number | null> = [
  // Bar 1: Dm
  38, null, 38, null, 45, null, 38, 41, 38, null, 50, null, 45, null, 41, null,
  // Bar 2: Bb
  34, null, 34, null, 41, null, 34, 38, 34, null, 46, null, 41, null, 38, null,
  // Bar 3: C
  36, null, 36, null, 43, null, 36, 40, 36, null, 48, null, 43, null, 40, null,
  // Bar 4: Am
  33, null, 33, null, 40, null, 33, 36, 33, null, 45, null, 40, null, 36, 38,
];

// Subtle glassy arcade synth arpeggio (higher octave)
const ARP_STEPS: Array<number | null> = [
  // Bar 1: Dm (D4=62, F4=65, A4=69, D5=74, E5=76)
  62, null, 69, 65, null, 74, 69, null, 65, null, 69, 74, null, 76, 74, 69,
  // Bar 2: Bb (Bb3=58, D4=62, F4=65, Bb4=70, C5=72)
  58, null, 65, 62, null, 70, 65, null, 62, null, 65, 70, null, 72, 70, 65,
  // Bar 3: C (C4=60, E4=64, G4=67, C5=72, D5=74)
  60, null, 67, 64, null, 72, 67, null, 64, null, 67, 72, null, 74, 72, 67,
  // Bar 4: Am (A3=57, C4=60, E4=64, A4=69, B4=71)
  57, null, 64, 60, null, 69, 64, null, 60, null, 64, 69, null, 71, 69, 64,
];

class BackgroundMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private enabled: boolean = true;
  private volume: number = 0.35; // Balanced cleanly underneath voice announcer & SFX
  private paused: boolean = false;
  private highTension: boolean = false; // True when < 10 flags remain

  private isRunning: boolean = false;
  private schedulerId: number | null = null;
  private currentStep: number = 0;
  private nextNoteTime: number = 0;

  private ensureContext(): AudioContext | null {
    const ctx = audioHub.getContext();
    const out = audioHub.getOutputNode();
    if (!ctx || !out) return null;

    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.enabled && !this.paused ? this.volume * 0.45 : 0;
      this.masterGain.connect(out);
      this.noiseBuffer = this.createNoiseBuffer(ctx);
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.15);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public unlockAndStart() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (this.enabled && !this.paused) {
      this.startLoop();
    }
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.updateGainSmooth();
    if (enabled && !this.paused) {
      this.unlockAndStart();
    } else if (!enabled) {
      this.stopLoop();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateGainSmooth();
  }

  public getVolume(): number {
    return this.volume;
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    this.updateGainSmooth();
    if (paused) {
      this.stopLoop();
    } else if (this.enabled && this.ctx && this.ctx.state === 'running') {
      this.startLoop();
    }
  }

  /**
   * Speeds up BPM slightly (~124 -> ~136 BPM) when fewer than 10 flags remain
   */
  public setHighTension(active: boolean) {
    this.highTension = active;
  }

  public destroy() {
    this.stopLoop();
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.masterGain = null;
    }
    this.ctx = null;
    this.noiseBuffer = null;
  }

  private updateGainSmooth() {
    if (!this.ctx || !this.masterGain) return;
    const target = this.enabled && !this.paused ? this.volume * 0.45 : 0;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(target, now, 0.04);
  }

  private startLoop() {
    if (this.isRunning) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.isRunning = true;
    this.nextNoteTime = ctx.currentTime + 0.06;
    this.updateGainSmooth();

    this.schedulerId = window.setInterval(() => {
      this.scheduleAhead();
    }, 25);
  }

  private stopLoop() {
    this.isRunning = false;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private scheduleAhead() {
    if (!this.ctx || !this.masterGain || !this.enabled || this.paused) return;
    if (this.ctx.state !== 'running') return;

    const lookaheadSec = 0.12;
    const bpm = this.highTension ? 136 : 124;
    const stepDuration = 60 / bpm / 4; // 16th note

    // Prevent catch-up burst if tab was hidden
    if (this.nextNoteTime < this.ctx.currentTime - 0.2) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }

    while (this.nextNoteTime < this.ctx.currentTime + lookaheadSec) {
      this.scheduleStep(this.currentStep, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 64;
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number) {
    if (!this.ctx || !this.masterGain) return;
    const stepInBar = step % 16;

    // 1. Light 4-on-the-floor electronic kick pulse (beats 1, 2, 3, 4)
    if (stepInBar % 4 === 0) {
      this.triggerKick(time);
    }

    // 2. Crisp light hi-hat pulse (off-beat 8ths, plus extra 16ths in high tension)
    if (stepInBar % 4 === 2) {
      this.triggerHiHat(time, 0.14);
    } else if (this.highTension && stepInBar % 2 === 1) {
      this.triggerHiHat(time, 0.065);
    }

    // 3. Soft electronic snare/clap tick on beats 2 & 4
    if (stepInBar === 4 || stepInBar === 12) {
      this.triggerClap(time);
    }

    // 4. Energetic electro bassline
    const bassNote = BASS_STEPS[step];
    if (bassNote !== null) {
      this.triggerBass(time, midiToFreq(bassNote), stepDur * 1.45);
    }

    // 5. Subtle glassy synth arpeggio
    const arpNote = ARP_STEPS[step];
    if (arpNote !== null) {
      this.triggerArp(time, midiToFreq(arpNote), stepDur * 1.6);
    }
  }

  private triggerKick(time: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(132, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.46, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.17);
  }

  private triggerHiHat(time: number, peakGain: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7200, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peakGain, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.042);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(time);
    src.stop(time + 0.05);
  }

  private triggerClap(time: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1750, time);
    filter.Q.setValueAtTime(1.4, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.11, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.085);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(time);
    src.stop(time + 0.095);
  }

  private triggerBass(time: number, freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    const peakCutoff = this.highTension ? 780 : 540;
    filter.frequency.setValueAtTime(peakCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + duration);
    filter.Q.setValueAtTime(2.6, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.24, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private triggerArp(time: number, freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.highTension ? 2800 : 1950, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.105, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }
}

export const musicEngine = new BackgroundMusicEngine();
