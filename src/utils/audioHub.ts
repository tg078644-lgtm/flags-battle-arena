/**
 * Shared Web Audio hub that routes SFX and Background Music to both the user's speakers
 * and a MediaStreamAudioDestinationNode so live 9:16 canvas capture includes game audio.
 */

class SharedAudioHub {
  private ctx: AudioContext | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private masterBus: GainNode | null = null;

  public getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.masterBus = this.ctx.createGain();
      this.masterBus.gain.value = 1;
      this.masterBus.connect(this.ctx.destination);

      if (typeof this.ctx.createMediaStreamDestination === 'function') {
        this.streamDest = this.ctx.createMediaStreamDestination();
        this.masterBus.connect(this.streamDest);
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public getOutputNode(): AudioNode | null {
    this.getContext();
    return this.masterBus;
  }

  public getCaptureAudioStream(): MediaStream | null {
    this.getContext();
    return this.streamDest ? this.streamDest.stream : null;
  }
}

export const audioHub = new SharedAudioHub();
