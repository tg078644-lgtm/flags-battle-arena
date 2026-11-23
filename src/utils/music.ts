/**
 * Lightweight 100% Original, Copyright-Free Procedural Electronic / Arcade Music Engine
 * Optimized for Android WebView: low polyphony cap, shared master filter, immediate node
 * disconnection on ended, and background-tab auto-sleep.
 */

import { audioHub } from './audioHub';

const MAX_MUSIC_VOICES = 4;

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 4-bar original D minor electro-arcade bassline (64 16th-note steps)
const BASS_STEPS: Array<number | null> = [
  38, null, 38, null, 45, null, 38, 41, 38, null, 50, null, 45, null, 41, null,
  34, null, 34, null, 41, null, 34, 38, 34, null, 46, null, 41, null, 38, null,
  36, null, 36, null, 43, null, 36, 40, 36, null, 48, null, 43, null, 40, null,
  33, null, 33, null, 40, null, 33, 36, 33, null, 45, null, 40, null, 36, 38,
];

// Subtle synth arpeggio (spaced cleanly for low polyphony & voice clarity)
const ARP_STEPS: Array<number | null> = [
  62, null, 69, null, 65, null, 74, null, 69, null, 65, null, 74, null, 76, null,
  58, null, 65, null, 62, null, 70, null, 65, null, 62, null, 70, null, 72, null,
  60, null, 67, null, 64, null, 72, null, 67, null, 64, null, 72, null, 74, null,
  57, null, 64, null, 60, null, 69, null, 64, null, 60, null, 69, null, 71, null,
];

class BackgroundMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bassBusFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private enabled: boolean = true;
  private volume: number = 0.35;
  private paused: boolean = false;
  private pageHidden: boolean = false;
  private highTension: boolean = false;

  private isRunning: boolean = false;
  private schedulerId: number | null = null;
  private currentStep: number = 0;
  private nextNoteTime: number = 0;
  private activeVoices: number = 0;
  private visibilityBound: boolean = false;

  private handleVisibilityChange = () => {
    this.pageHidden = typeof document !== 'undefined' && document.hidden;
    if (this.pageHidden) {
      this.stopLoop();
    } else if (this.enabled && !this.paused && this.ctx && this.ctx.state === 'running') {
      this.startLoop();
    }
  };

  private ensureContext(): AudioContext | null {
    const ctx = audioHub.getContext();
    const out = audioHub.getOutputNode();
    if (!ctx || !out) return null;

    if (!this.visibilityBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityBound = true;
    }

    if (this.ctx !== ctx) {
      this.ctx = ctx;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.enabled && !this.paused ? this.volume * 0.45 : 0;
      this.masterGain.connect(out);

      // Single shared lowpass filter for bassline instead of allocating one per note
      this.bassBusFilter = ctx.createBiquadFilter();
      this.bassBusFilter.type = 'lowpass';
      this.bassBusFilter.frequency.value = 540;
      this.bassBusFilter.Q.value = 2.2;
      this.bassBusFilter.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(ctx);
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.08);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private bindCleanup(source: OscillatorNode | AudioBufferSourceNode, nodes: AudioNode[]) {
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

  public unlockAndStart() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (this.enabled && !this.paused && !this.pageHidden) {
      this.startLoop();
    }
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.updateGainSmooth();
    if (enabled && !this.paused && !this.pageHidden) {
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
    } else if (this.enabled && !this.pageHidden && this.ctx && this.ctx.state === 'running') {
      this.startLoop();
    }
  }

  public setHighTension(active: boolean) {
    if (this.highTension === active) return;
    this.highTension = active;
    if (this.ctx && this.bassBusFilter) {
      this.bassBusFilter.frequency.setTargetAtTime(active ? 760 : 540, this.ctx.currentTime, 0.08);
    }
  }

  public destroy() {
    this.stopLoop();
    if (this.visibilityBound && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityBound = false;
    }
    if (this.bassBusFilter) {
      try {
        this.bassBusFilter.disconnect();
      } catch {
        // Ignore
      }
      this.bassBusFilter = null;
    }
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Ignore
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

    // 50ms scheduler tick with 160ms lookahead minimizes mobile main-thread wakeups
    this.schedulerId = window.setInterval(() => {
      this.scheduleAhead();
    }, 50);
  }

  private stopLoop() {
    this.isRunning = false;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private scheduleAhead() {
    if (!this.ctx || !this.masterGain || !this.enabled || this.paused || this.pageHidden) return;
    if (this.ctx.state !== 'running') return;

    const lookaheadSec = 0.16;
    const bpm = this.highTension ? 136 : 124;
    const stepDuration = 60 / bpm / 4;

    if (this.nextNoteTime < this.ctx.currentTime - 0.25) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }

    let stepsScheduled = 0;
    while (this.nextNoteTime < this.ctx.currentTime + lookaheadSec && stepsScheduled < 4) {
      this.scheduleStep(this.currentStep, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 64;
      stepsScheduled++;
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number) {
    if (!this.ctx || !this.masterGain) return;
    const stepInBar = step % 16;

    // 1. Electronic 4-on-the-floor kick pulse
    if (stepInBar % 4 === 0) {
      this.triggerKick(time);
    }

    // 2. Light off-beat hi-hat pulse
    if (stepInBar % 4 === 2 && this.activeVoices < MAX_MUSIC_VOICES) {
      this.triggerHiHat(time, 0.13);
    }

    // 3. Energetic electro bassline (through shared bassBusFilter)
    const bassNote = BASS_STEPS[step];
    if (bassNote !== null && this.activeVoices < MAX_MUSIC_VOICES + 1) {
      this.triggerBass(time, midiToFreq(bassNote), stepDur * 1.35);
    }

    // 4. Subtle triangle synth arpeggio
    const arpNote = ARP_STEPS[step];
    if (arpNote !== null && this.activeVoices < MAX_MUSIC_VOICES + 1) {
      this.triggerArp(time, midiToFreq(arpNote), stepDur * 1.45);
    }
  }

  private triggerKick(time: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.085);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.45, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    this.bindCleanup(osc, [osc, gain]);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  private triggerHiHat(time: number, peakGain: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peakGain, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.038);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    this.bindCleanup(src, [src, filter, gain]);
    src.start(time);
    src.stop(time + 0.045);
  }

  private triggerBass(time: number, freq: number, duration: number) {
    if (!this.ctx || !this.bassBusFilter) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.24, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.bassBusFilter);
    this.bindCleanup(osc, [osc, gain]);
    osc.start(time);
    osc.stop(time + duration + 0.015);
  }

  private triggerArp(time: number, freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.095, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    this.bindCleanup(osc, [osc, gain]);
    osc.start(time);
    osc.stop(time + duration + 0.015);
  }
}

export const musicEngine = new BackgroundMusicEngine();
