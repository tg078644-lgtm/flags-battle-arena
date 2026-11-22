export interface AnnouncerVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  isRecommended: boolean;
}

interface QueuedSpeech {
  text: string;
  priority: 'normal' | 'high';
}

const PREFERRED_VOICE_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /google us english/i, score: 120 },
  { pattern: /google uk english male/i, score: 115 },
  { pattern: /google uk english female/i, score: 112 },
  { pattern: /online \(natural\)/i, score: 110 },
  { pattern: /\bnatural\b/i, score: 105 },
  { pattern: /\bneural\b/i, score: 100 },
  { pattern: /microsoft (guy|aria|jenny|ryan|sonia|christopher|eric|steffan)/i, score: 96 },
  { pattern: /\b(samantha|daniel|karen|moira|ava|zoe|allison|alex|tessa|serena)\b/i, score: 88 },
  { pattern: /google.*english/i, score: 85 },
];

const AVOID_VOICE_PATTERNS = /(espeak|festival|compact|fred|albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|pipe organ|trinoids|whisper|zarvox|jester|superstar|wobble)/i;

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const lang = (voice.lang || '').toLowerCase();
  if (!lang.startsWith('en')) return -1000;

  let score = 0;
  if (lang === 'en-us') score += 24;
  else if (lang === 'en-gb') score += 22;
  else if (lang === 'en-au' || lang === 'en-ca') score += 14;
  else score += 8;

  if (AVOID_VOICE_PATTERNS.test(voice.name)) {
    score -= 90;
  }

  for (const rule of PREFERRED_VOICE_PATTERNS) {
    if (rule.pattern.test(voice.name)) {
      score += rule.score;
      break;
    }
  }

  if (voice.localService === false && /google|natural|neural/i.test(voice.name)) {
    score += 10;
  }

  return score;
}

class VoiceAnnouncerEngine {
  private enabled: boolean = true;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoiceURI: string = '';
  private userManuallySelected: boolean = false;
  private listeners: Set<() => void> = new Set();

  // Speech scheduling state
  private isSpeaking: boolean = false;
  private speechQueue: QueuedSpeech[] = [];
  private pendingCluster: string[] = [];
  private clusterTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.refreshVoices();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        this.refreshVoices();
      });
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public refreshVoices() {
    if (!this.isSupported()) return;
    const rawVoices = window.speechSynthesis.getVoices();
    if (!rawVoices || rawVoices.length === 0) return;

    const english = rawVoices
      .filter((v) => (v.lang || '').toLowerCase().startsWith('en'))
      .sort((a, b) => scoreVoice(b) - scoreVoice(a));

    this.voices = english.length > 0 ? english : rawVoices;

    if (!this.userManuallySelected || !this.voices.some((v) => v.voiceURI === this.selectedVoiceURI)) {
      this.selectedVoiceURI = this.voices[0]?.voiceURI ?? '';
    }

    this.notify();
  }

  public getVoiceOptions(): AnnouncerVoiceOption[] {
    return this.voices.map((v, idx) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      isRecommended: idx === 0,
    }));
  }

  public getSelectedVoiceURI(): string {
    return this.selectedVoiceURI;
  }

  public setSelectedVoiceURI(uri: string) {
    this.selectedVoiceURI = uri;
    this.userManuallySelected = true;
    this.notify();
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
    this.notify();
  }

  public stopAll() {
    if (this.clusterTimer !== null) {
      window.clearTimeout(this.clusterTimer);
      this.clusterTimer = null;
    }
    if (this.watchdogTimer !== null) {
      window.clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.pendingCluster = [];
    this.speechQueue = [];
    this.isSpeaking = false;
    this.activeUtterance = null;
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore browser cancel errors
      }
    }
  }

  public testVoice() {
    if (!this.enabled || !this.isSupported()) return;
    this.stopAll();
    this.enqueueImmediate('Three, two, one! Let the battle begin!', 'high');
  }

  /**
   * Speaks each countdown word cleanly in sync with the 3-2-1 arena overlay
   */
  public announceCountdownStep(step: 3 | 2 | 1 | 'go') {
    if (!this.enabled || !this.isSupported()) return;
    this.stopAll();
    const text =
      step === 3
        ? 'Three'
        : step === 2
        ? 'Two'
        : step === 1
        ? 'One'
        : 'Let the battle begin!';
    this.enqueueImmediate(text, 'high');
  }

  /**
   * Clean elimination callouts with zero overlap and automatic multi-drop summary.
   * No Top 10 or remaining-count callouts.
   */
  public announceElimination(countryName: string, remainingCount: number) {
    if (!this.enabled || !this.isSupported()) return;

    // When only 1 flag remains, Victory announcement handles it immediately
    if (remainingCount <= 1) return;

    this.pendingCluster.push(countryName);

    // If currently speaking, let rapid drops accumulate until current speech finishes
    if (this.isSpeaking) return;

    // Brief 240ms cluster window to group simultaneous drops cleanly
    if (this.clusterTimer === null) {
      this.clusterTimer = window.setTimeout(() => {
        this.clusterTimer = null;
        this.flushClusterToQueue();
        if (!this.isSpeaking) {
          this.processNext();
        }
      }, 240);
    }
  }

  /**
   * Immediately interrupts any queued elimination speech and announces the winner.
   */
  public announceVictory(winnerName: string) {
    if (!this.enabled || !this.isSupported()) return;
    this.stopAll();
    this.enqueueImmediate(`Victory! ${winnerName} is the winner!`, 'high');
  }

  private clearClusterTimer() {
    if (this.clusterTimer !== null) {
      window.clearTimeout(this.clusterTimer);
      this.clusterTimer = null;
    }
  }

  private flushClusterToQueue() {
    if (this.pendingCluster.length === 0) return;
    const batch = this.pendingCluster.splice(0, this.pendingCluster.length);
    let phrase: string;

    if (batch.length === 1) {
      phrase = `${batch[0]} is eliminated!`;
    } else {
      const othersCount = batch.length - 1;
      phrase = `${batch[0]} and ${othersCount} ${
        othersCount === 1 ? 'other' : 'others'
      } eliminated!`;
    }

    // Keep elimination queue fresh so commentary never lags behind the action
    if (this.speechQueue.length > 0 && this.speechQueue[0].priority === 'normal') {
      this.speechQueue[0] = { text: phrase, priority: 'normal' };
    } else {
      this.speechQueue.push({ text: phrase, priority: 'normal' });
    }
  }

  private enqueueImmediate(text: string, priority: QueuedSpeech['priority']) {
    this.speechQueue.push({ text, priority });
    if (!this.isSpeaking) {
      this.processNext();
    }
  }

  private processNext() {
    if (!this.enabled || !this.isSupported()) {
      this.isSpeaking = false;
      return;
    }

    if (this.speechQueue.length === 0 && this.pendingCluster.length > 0) {
      this.clearClusterTimer();
      this.flushClusterToQueue();
    }

    const nextItem = this.speechQueue.shift();
    if (!nextItem) {
      this.isSpeaking = false;
      return;
    }

    this.isSpeaking = true;

    try {
      const utterance = new SpeechSynthesisUtterance(nextItem.text);
      utterance.pitch = 1.05;
      utterance.rate = 1.08;
      utterance.volume = 1.0;

      const selectedVoice =
        this.voices.find((v) => v.voiceURI === this.selectedVoiceURI) || this.voices[0];
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = 'en-US';
      }

      this.activeUtterance = utterance;

      const finish = () => {
        if (this.activeUtterance !== utterance) return;
        if (this.watchdogTimer !== null) {
          window.clearTimeout(this.watchdogTimer);
          this.watchdogTimer = null;
        }
        this.activeUtterance = null;
        this.isSpeaking = false;
        this.processNext();
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      const estimatedMs = Math.max(2200, nextItem.text.length * 80 + 2000);
      this.watchdogTimer = window.setTimeout(() => {
        if (this.activeUtterance === utterance) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            // Ignore
          }
          finish();
        }
      }, estimatedMs);

      window.speechSynthesis.speak(utterance);
    } catch {
      this.isSpeaking = false;
      this.activeUtterance = null;
    }
  }
}

export const voiceAnnouncer = new VoiceAnnouncerEngine();
