import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flag,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Music,
  Pause,
  Play,
  Radio,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { TOP_20_CODES, TOP_50_CODES, UN_COUNTRIES } from './data/countries';
import { loadStreamPlatforms, saveStreamPlatforms } from './data/streamPlatforms';
import { ArenaEngine } from './engine/physics';
import {
  ArenaSnapshot,
  CountryFlag,
  EliminatedEntry,
  FlagPreset,
  GameMode,
  PhysicsSettings,
  StreamPlatformConfig,
  StreamPlatformId,
  WinRecord,
} from './types';
import { AnnouncerVoiceOption, voiceAnnouncer } from './utils/announcer';
import { soundEngine } from './utils/audio';
import { musicEngine } from './utils/music';
import { LiveStreamCapturer } from './utils/streamCapture';
import { ControlsPanel } from './components/ControlsPanel';
import { EliminatedTicker } from './components/EliminatedTicker';
import { FlagsSetupModal } from './components/FlagsSetupModal';
import { LeaderboardPanel } from './components/LeaderboardPanel';
import { PlatformIcon } from './components/PlatformIcons';
import { SocialWatermarkBar } from './components/SocialWatermarkBar';
import { StreamManagerModal } from './components/StreamManagerModal';
import { TopWinnersHud } from './components/TopWinnersHud';
import { VictoryOverlay } from './components/VictoryOverlay';

const STORAGE_LEADERBOARD_KEY = 'cfba_leaderboard_v1';
const STORAGE_ROUNDS_KEY = 'cfba_rounds_v1';
const STORAGE_CUSTOM_FLAGS_KEY = 'cfba_custom_flags_v1';

function loadStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ArenaEngine | null>(null);

  // Custom user-uploaded flags
  const [customFlags, setCustomFlags] = useState<CountryFlag[]>(() =>
    loadStoredJson<CountryFlag[]>(STORAGE_CUSTOM_FLAGS_KEY, [])
  );

  // Flag preset & selection state
  const [activePreset, setActivePreset] = useState<FlagPreset>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const storedCustom = loadStoredJson<CountryFlag[]>(STORAGE_CUSTOM_FLAGS_KEY, []);
    return new Set([
      ...UN_COUNTRIES.map((c) => c.id),
      ...storedCustom.map((c) => c.id),
    ]);
  });

  // Game mode & live physics controls
  const [mode, setMode] = useState<GameMode>('classic');
  const [settings, setSettings] = useState<PhysicsSettings>({
    spinSpeed: 1.0,
    gapAngleDeg: 46,
    bounciness: 0.92,
  });

  // Playback & UI toggles
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [autoRestart, setAutoRestart] = useState(true);
  const [isFlagsModalOpen, setIsFlagsModalOpen] = useState(false);
  const [streamFocus, setStreamFocus] = useState(false);

  // AI Voice Announcer (Web Speech API)
  const speechSupported = voiceAnnouncer.isSupported();
  const [announcerEnabled, setAnnouncerEnabled] = useState<boolean>(() =>
    voiceAnnouncer.isEnabled()
  );
  const [voiceOptions, setVoiceOptions] = useState<AnnouncerVoiceOption[]>(() =>
    voiceAnnouncer.getVoiceOptions()
  );
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() =>
    voiceAnnouncer.getSelectedVoiceURI()
  );

  // Built-in Copyright-Free Background Music (Web Audio API Synth)
  const [musicEnabled, setMusicEnabled] = useState<boolean>(() => musicEngine.isEnabled());
  const [musicVolume, setMusicVolume] = useState<number>(() => musicEngine.getVolume());

  // Multi-Platform Channel & Live Stream Manager
  const capturerRef = useRef<LiveStreamCapturer | null>(null);
  const [streamPlatforms, setStreamPlatforms] = useState<StreamPlatformConfig[]>(() =>
    loadStreamPlatforms()
  );
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [liveDurationSec, setLiveDurationSec] = useState(0);
  const [captureHasAudio, setCaptureHasAudio] = useState(false);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // 3-2-1 Animated Round Start Countdown (holds flags frozen until "One" finishes)
  const [startCountdown, setStartCountdown] = useState<3 | 2 | 1 | 'go' | null>(3);
  const [roundToken, setRoundToken] = useState<number>(1);

  // Live match telemetry
  const [snapshot, setSnapshot] = useState<ArenaSnapshot>({
    aliveCount: UN_COUNTRIES.length,
    totalCount: UN_COUNTRIES.length,
    ringScale: 1,
    chaosBoostActive: false,
    elapsedSeconds: 0,
  });
  const [eliminated, setEliminated] = useState<EliminatedEntry[]>([]);
  const [winner, setWinner] = useState<CountryFlag | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Persistent Win Leaderboard
  const [leaderboard, setLeaderboard] = useState<WinRecord[]>(() =>
    loadStoredJson<WinRecord[]>(STORAGE_LEADERBOARD_KEY, [])
  );
  const [totalRounds, setTotalRounds] = useState<number>(() =>
    loadStoredJson<number>(STORAGE_ROUNDS_KEY, 0)
  );

  // Active flags list for current selection
  const activeFlags = useMemo(() => {
    const combined = [...customFlags, ...UN_COUNTRIES];
    const picked = combined.filter((f) => selectedIds.has(f.id));
    return picked.length >= 2 ? picked : UN_COUNTRIES.slice(0, 20);
  }, [customFlags, selectedIds]);

  const activeFlagsRef = useRef<CountryFlag[]>(activeFlags);
  activeFlagsRef.current = activeFlags;

  const autoRestartRef = useRef<boolean>(autoRestart);
  autoRestartRef.current = autoRestart;

  // Persist leaderboard & custom flags safely
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(leaderboard));
    } catch {
      // Ignore storage quota errors
    }
  }, [leaderboard]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ROUNDS_KEY, JSON.stringify(totalRounds));
    } catch {
      // Ignore storage quota errors
    }
  }, [totalRounds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CUSTOM_FLAGS_KEY, JSON.stringify(customFlags));
    } catch {
      // Ignore storage quota errors
    }
  }, [customFlags]);

  // Auto-save multi-platform stream configuration to localStorage
  useEffect(() => {
    saveStreamPlatforms(streamPlatforms);
  }, [streamPlatforms]);

  // Live broadcast duration timer
  useEffect(() => {
    if (!isLive) return;
    const interval = window.setInterval(() => {
      setLiveDurationSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isLive]);

  // Clean up live stream capturer on unmount
  useEffect(() => {
    capturerRef.current = new LiveStreamCapturer();
    return () => {
      capturerRef.current?.destroy();
      capturerRef.current = null;
    };
  }, []);

  // Subscribe to Web Speech API voice list updates (Chrome loads voices async)
  useEffect(() => {
    const syncVoices = () => {
      setVoiceOptions(voiceAnnouncer.getVoiceOptions());
      setSelectedVoiceURI(voiceAnnouncer.getSelectedVoiceURI());
      setAnnouncerEnabled(voiceAnnouncer.isEnabled());
    };
    const unsubscribe = voiceAnnouncer.subscribe(syncVoices);
    voiceAnnouncer.refreshVoices();
    syncVoices();
    return () => {
      unsubscribe();
    };
  }, []);

  // Unlock Web Audio API & Background Music on first user gesture anywhere on page
  useEffect(() => {
    const unlock = () => {
      soundEngine.unlock();
      musicEngine.unlockAndStart();
      voiceAnnouncer.refreshVoices();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Batched HUD refs so React re-renders at most ~4.5 times/sec (every 220ms) instead of every physics frame
  const pendingEliminationsRef = useRef<EliminatedEntry[]>([]);
  const pendingSnapshotRef = useRef<ArenaSnapshot | null>(null);
  const snapshotDirtyRef = useRef<boolean>(false);

  const flushPendingHud = useCallback(() => {
    const batch = pendingEliminationsRef.current;
    if (batch.length > 0) {
      pendingEliminationsRef.current = [];
      setEliminated((prev) => {
        const next = [...batch, ...prev];
        return next.length > 60 ? next.slice(0, 60) : next;
      });
    }
    if (snapshotDirtyRef.current && pendingSnapshotRef.current) {
      snapshotDirtyRef.current = false;
      const latest = pendingSnapshotRef.current;
      setSnapshot(latest);
    }
  }, []);

  useEffect(() => {
    const flushTimer = window.setInterval(flushPendingHud, 220);
    return () => window.clearInterval(flushTimer);
  }, [flushPendingHud]);

  const startFreshRound = useCallback((flagsOverride?: CountryFlag[]) => {
    const pool = flagsOverride ?? activeFlagsRef.current;
    voiceAnnouncer.stopAll();
    pendingEliminationsRef.current = [];
    snapshotDirtyRef.current = false;
    const freshSnap: ArenaSnapshot = {
      aliveCount: pool.length,
      totalCount: pool.length,
      ringScale: 1,
      chaosBoostActive: false,
      elapsedSeconds: 0,
    };
    pendingSnapshotRef.current = freshSnap;
    setWinner(null);
    setCountdown(null);
    setEliminated([]);
    setIsPaused(false);
    setSnapshot(freshSnap);
    if (engineRef.current) {
      // Hold flags stationary inside the ring during the 3-2-1 countdown
      engineRef.current.setPaused(true);
      engineRef.current.initRound(pool);
    }
    setStartCountdown(3);
    setRoundToken((t) => t + 1);
  }, []);

  // Initialize Canvas physics engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new ArenaEngine(canvas, {
      onEliminate: (flag, rank, aliveCount) => {
        // Queue into mutable ref; React flushes at most ~4.5 times/sec
        pendingEliminationsRef.current.unshift({
          flag,
          rank,
          timestamp: Date.now(),
        });
        if (pendingEliminationsRef.current.length > 60) {
          pendingEliminationsRef.current.length = 60;
        }
        if (pendingSnapshotRef.current) {
          pendingSnapshotRef.current = {
            ...pendingSnapshotRef.current,
            aliveCount,
          };
          snapshotDirtyRef.current = true;
        }
        voiceAnnouncer.announceElimination(flag.name, aliveCount);
      },
      onVictory: (winningFlag) => {
        // Flush any final queued eliminations & snapshot immediately on victory
        flushPendingHud();
        setWinner(winningFlag);
        setTotalRounds((r) => r + 1);
        voiceAnnouncer.announceVictory(winningFlag.name);
        setLeaderboard((prev) => {
          const idx = prev.findIndex((item) => item.id === winningFlag.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              wins: updated[idx].wins + 1,
              lastWonAt: Date.now(),
              imageUrl: winningFlag.imageUrl,
              name: winningFlag.name,
            };
            return updated;
          }
          return [
            ...prev,
            {
              id: winningFlag.id,
              code: winningFlag.code,
              name: winningFlag.name,
              imageUrl: winningFlag.imageUrl,
              fallbackColor: winningFlag.fallbackColor,
              wins: 1,
              lastWonAt: Date.now(),
              isCustom: winningFlag.isCustom,
            },
          ];
        });
        if (autoRestartRef.current) {
          setCountdown(3);
        }
      },
      onSnapshot: (snap) => {
        pendingSnapshotRef.current = snap;
        snapshotDirtyRef.current = true;
      },
    });

    engineRef.current = engine;
    engine.setPaused(true); // Hold frozen until initial 3-2-1 countdown completes
    engine.initRound(activeFlagsRef.current);
    engine.start();

    const handleResize = () => {
      engine.setupHighDpi();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      voiceAnnouncer.stopAll();
      musicEngine.destroy();
      engine.destroy();
      engineRef.current = null;
    };
  }, [flushPendingHud]);

  // 3, 2, 1 Animated Round Start Countdown (releases flags right as "One" finishes)
  useEffect(() => {
    if (startCountdown === null || isPaused || winner) return;

    if (startCountdown === 3) {
      soundEngine.playCountdownTick(false);
      voiceAnnouncer.announceCountdownStep(3);
      const t = window.setTimeout(() => setStartCountdown(2), 850);
      return () => window.clearTimeout(t);
    }

    if (startCountdown === 2) {
      soundEngine.playCountdownTick(false);
      voiceAnnouncer.announceCountdownStep(2);
      const t = window.setTimeout(() => setStartCountdown(1), 850);
      return () => window.clearTimeout(t);
    }

    if (startCountdown === 1) {
      soundEngine.playCountdownTick(false);
      voiceAnnouncer.announceCountdownStep(1);
      const t = window.setTimeout(() => setStartCountdown('go'), 850);
      return () => window.clearTimeout(t);
    }

    if (startCountdown === 'go') {
      soundEngine.playCountdownTick(true);
      voiceAnnouncer.announceCountdownStep('go');
      const t = window.setTimeout(() => setStartCountdown(null), 650);
      return () => window.clearTimeout(t);
    }
  }, [startCountdown, roundToken, isPaused, winner]);

  // Sync mode, settings, pause, mute, and background music into engines
  useEffect(() => {
    engineRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    engineRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    const frozenByCountdown =
      startCountdown === 3 || startCountdown === 2 || startCountdown === 1;
    engineRef.current?.setPaused(isPaused || frozenByCountdown);
    musicEngine.setPaused(isPaused);
    if (isPaused) {
      voiceAnnouncer.stopAll();
    }
  }, [isPaused, startCountdown]);

  useEffect(() => {
    soundEngine.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    musicEngine.setEnabled(musicEnabled);
  }, [musicEnabled]);

  useEffect(() => {
    musicEngine.setVolume(musicVolume);
  }, [musicVolume]);

  // Speed up background music slightly when fewer than 10 flags remain
  useEffect(() => {
    const intense = !winner && startCountdown === null && snapshot.aliveCount > 1 && snapshot.aliveCount < 10;
    musicEngine.setHighTension(intense);
  }, [snapshot.aliveCount, winner, startCountdown]);

  const handleToggleAnnouncer = useCallback(() => {
    soundEngine.unlock();
    musicEngine.unlockAndStart();
    const next = !voiceAnnouncer.isEnabled();
    voiceAnnouncer.setEnabled(next);
    setAnnouncerEnabled(next);
  }, []);

  const handleSelectVoice = useCallback((uri: string) => {
    voiceAnnouncer.setSelectedVoiceURI(uri);
    setSelectedVoiceURI(uri);
  }, []);

  const handleTestVoice = useCallback(() => {
    soundEngine.unlock();
    musicEngine.unlockAndStart();
    voiceAnnouncer.testVoice();
  }, []);

  const handleToggleMusic = useCallback(() => {
    soundEngine.unlock();
    setMusicEnabled((prev) => {
      const next = !prev;
      if (next) musicEngine.unlockAndStart();
      return next;
    });
  }, []);

  const handleChangeMusicVolume = useCallback((val: number) => {
    setMusicVolume(val);
  }, []);

  const handleUpdatePlatform = useCallback(
    (id: StreamPlatformId, patch: Partial<StreamPlatformConfig>) => {
      setStreamPlatforms((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const handleToggleGoLive = useCallback(async () => {
    soundEngine.unlock();
    musicEngine.unlockAndStart();

    if (isLive) {
      const blobUrl = (await capturerRef.current?.stop()) ?? null;
      setIsLive(false);
      setRecordedBlobUrl(blobUrl);
      return;
    }

    const activeCount = streamPlatforms.filter((p) => p.enabled).length;
    if (activeCount === 0) {
      setIsStreamModalOpen(true);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !capturerRef.current) return;

    setCaptureError(null);
    setRecordedBlobUrl(null);
    const result = capturerRef.current.start(canvas);
    if (result.error) {
      setCaptureError(result.error);
      setIsLive(false);
      return;
    }

    setLiveDurationSec(0);
    setCaptureHasAudio(result.hasAudioTrack);
    setIsLive(true);
  }, [isLive, streamPlatforms]);

  // 3-Second Auto-Restart Countdown Loop
  useEffect(() => {
    if (!winner) {
      setCountdown(null);
      return;
    }

    if (!autoRestart) {
      setCountdown(null);
      return;
    }

    if (countdown === null) {
      setCountdown(3);
      return;
    }

    if (countdown <= 0) {
      soundEngine.playCountdownTick(true);
      startFreshRound();
      return;
    }

    soundEngine.playCountdownTick(false);
    const timer = window.setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [winner, autoRestart, countdown, startFreshRound]);

  // Preset Selection Handlers
  const handleSelectPreset = (preset: FlagPreset) => {
    setActivePreset(preset);
    const customIds = customFlags.map((c) => c.id);
    if (preset === 'all') {
      setSelectedIds(new Set([...UN_COUNTRIES.map((c) => c.id), ...customIds]));
    } else if (preset === 'top50') {
      setSelectedIds(new Set([...TOP_50_CODES, ...customIds]));
    } else if (preset === 'top20') {
      setSelectedIds(new Set([...TOP_20_CODES, ...customIds]));
    }
  };

  const handleUpdateSelectedIds = (ids: Set<string>, preset: FlagPreset) => {
    setSelectedIds(ids);
    setActivePreset(preset);
  };

  const handleAddCustomFlag = (flag: CountryFlag) => {
    setCustomFlags((prev) => [flag, ...prev]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(flag.id);
      return next;
    });
  };

  // Keyboard shortcuts for quick stream operation (Space = Play/Pause, R = Restart, M = Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (isFlagsModalOpen || isStreamModalOpen) {
        if (e.key === 'Escape') {
          setIsFlagsModalOpen(false);
          setIsStreamModalOpen(false);
        }
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        soundEngine.unlock();
        musicEngine.unlockAndStart();
        setIsPaused((p) => !p);
      } else if (e.key === 'r' || e.key === 'R') {
        soundEngine.unlock();
        musicEngine.unlockAndStart();
        startFreshRound();
      } else if (e.key === 'm' || e.key === 'M') {
        soundEngine.unlock();
        musicEngine.unlockAndStart();
        setIsMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFlagsModalOpen, isStreamModalOpen, startFreshRound]);

  const handleDeleteCustomFlag = (id: string) => {
    setCustomFlags((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      if (next.size < 2) {
        for (const c of UN_COUNTRIES) {
          next.add(c.id);
          if (next.size >= 2) break;
        }
      }
      return next;
    });
  };

  const handleResetLeaderboard = () => {
    setLeaderboard([]);
    setTotalRounds(0);
  };

  const modeLabel =
    mode === 'shrinking'
      ? 'Shrinking Arena'
      : mode === 'chaos'
      ? 'Chaos Mode'
      : 'Classic Spinning Gap';

  return (
    <div className="min-h-screen bg-[#040711] text-slate-100">
      {/* Compact Header Bar */}
      <header className="border-b border-white/10 bg-[#060b18]/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <h1 className="font-display text-xl font-extrabold tracking-wide text-white whitespace-nowrap shrink-0 sm:text-2xl">
            Country Flags Battle Arena
          </h1>

          <div className="hidden items-center gap-3 text-xs text-slate-400 md:flex">
            <span>{modeLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{activeFlags.length} Flags</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {totalRounds} {totalRounds === 1 ? 'Round' : 'Rounds'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setStreamFocus((prev) => !prev)}
              className="hidden min-h-[40px] items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors hover:border-white/25 hover:text-white lg:inline-flex"
              title={streamFocus ? 'Show side panels' : 'Focus 9:16 vertical stream stage'}
            >
              {streamFocus ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>Show Panels</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>9:16 Stream View</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsStreamModalOpen(true)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold whitespace-nowrap transition-colors ${
                isLive
                  ? 'border-rose-500/60 bg-rose-500 text-white hover:bg-rose-400'
                  : 'border-white/15 bg-slate-900/85 text-slate-100 hover:border-cyan-400/50 hover:text-cyan-200'
              }`}
            >
              <Radio className="h-3.5 w-3.5 shrink-0" />
              <span>{isLive ? 'LIVE' : 'Go Live'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFlagsModalOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-cyan-400 px-3.5 text-xs font-bold text-slate-950 whitespace-nowrap transition-colors hover:bg-cyan-300"
            >
              <Flag className="h-3.5 w-3.5" />
              <span>Flags Setup</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Arena & Controls Workspace */}
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div
          className={`mx-auto grid items-start gap-6 ${
            streamFocus
              ? 'max-w-[440px] grid-cols-1'
              : 'grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_minmax(340px,430px)_minmax(280px,1fr)]'
          }`}
        >
          {/* Left Column (Desktop): Leaderboard & Elimination Feed */}
          {!streamFocus && (
            <aside className="order-3 lg:order-1">
              <LeaderboardPanel
                records={leaderboard}
                totalRounds={totalRounds}
                recentEliminations={eliminated}
                onResetLeaderboard={handleResetLeaderboard}
              />
            </aside>
          )}

          {/* Center Column: Tall 9:16 Vertical Battle Arena + Compact Touch Bar */}
          <section className="order-1 flex flex-col items-center lg:order-2">
            {/* 9:16 Vertical Arena Stage */}
            <div className="relative aspect-[9/16] w-full max-w-[420px] overflow-hidden rounded-3xl border border-white/15 bg-[#060b18] shadow-[0_0_80px_rgba(34,211,238,0.12)]">
              {/* Top HUD inside 9:16 Arena */}
              <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 flex items-start justify-between bg-gradient-to-b from-[#040814]/88 via-[#040814]/35 to-transparent px-3 pt-2.5 pb-4">
                <div className="min-w-0">
                  <div className="font-display text-2xl leading-none font-extrabold tracking-wide text-white tabular-nums sm:text-3xl">
                    ALIVE: <span className="text-cyan-300">{snapshot.aliveCount}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-300/85">
                    <span>{modeLabel}</span>
                    {mode === 'shrinking' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-amber-300 tabular-nums">
                          Ring {Math.round(snapshot.ringScale * 100)}%
                        </span>
                      </>
                    )}
                    {mode === 'chaos' && snapshot.chaosBoostActive && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-rose-400">SPEED SURGE</span>
                      </>
                    )}
                  </div>

                  {/* Ultra-Compact In-Arena Top 3 Winners Card */}
                  <TopWinnersHud records={leaderboard} />
                </div>

                <div className="shrink-0 text-right font-mono text-[11px] text-slate-400 tabular-nums">
                  <div>{Math.floor(snapshot.elapsedSeconds)}s</div>
                  <div className="text-[10px] text-slate-500">
                    of {snapshot.totalCount}
                  </div>
                </div>
              </div>

              {/* HTML5 Physics Canvas */}
              <canvas
                ref={canvasRef}
                onClick={() => {
                  soundEngine.unlock();
                  musicEngine.unlockAndStart();
                }}
                className="block h-full w-full touch-manipulation"
              />

              {/* Large Animated 3, 2, 1 Round Start Countdown Overlay (centered on ring) */}
              {startCountdown !== null && !isPaused && !winner && (
                <div className="pointer-events-none absolute inset-x-0 top-[53.6%] z-20 flex -translate-y-1/2 flex-col items-center justify-center">
                  <div
                    key={`${roundToken}_${startCountdown}`}
                    className="animate-countdown-pop flex flex-col items-center text-center"
                  >
                    <span
                      className={`font-display leading-none font-extrabold tracking-tight drop-shadow-[0_0_28px_rgba(34,211,238,0.75)] ${
                        startCountdown === 'go'
                          ? 'text-6xl text-amber-300 sm:text-7xl'
                          : 'text-[104px] text-white sm:text-[124px]'
                      }`}
                    >
                      {startCountdown === 'go' ? 'GO!' : startCountdown}
                    </span>
                    <span className="mt-1 font-display text-sm font-bold tracking-[0.2em] text-cyan-200 uppercase drop-shadow-[0_2px_10px_rgba(4,7,17,0.95)]">
                      {startCountdown === 'go'
                        ? 'Let the battle begin!'
                        : 'Get Ready'}
                    </span>
                  </div>
                </div>
              )}

              {/* Paused Scrim */}
              {isPaused && !winner && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#040814]/60 backdrop-blur-[2px]">
                  <div className="font-display text-4xl font-extrabold tracking-[0.14em] text-white uppercase">
                    Paused
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.unlock();
                      musicEngine.unlockAndStart();
                      setIsPaused(false);
                    }}
                    className="mt-4 inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-cyan-400 px-6 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Resume Battle</span>
                  </button>
                </div>
              )}

              {/* Victory Banner Overlay */}
              {winner && (
                <VictoryOverlay
                  winner={winner}
                  leaderboard={leaderboard}
                  countdown={countdown}
                  autoRestart={autoRestart}
                  onStartNextRound={() => startFreshRound()}
                />
              )}

              {/* Bottom Stack inside 9:16 Arena: Social Watermark Bar right above Compact Elimination Feed */}
              <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-10 flex flex-col">
                <SocialWatermarkBar platforms={streamPlatforms} isLive={isLive} />
                <EliminatedTicker
                  entries={eliminated}
                  totalEliminated={Math.max(0, snapshot.totalCount - snapshot.aliveCount)}
                />
              </div>
            </div>

            {/* Active Multi-Platform LIVE Status Strip right under the 9:16 Arena when broadcasting */}
            {isLive && (
              <div className="mt-2.5 flex w-full max-w-[420px] flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {streamPlatforms
                    .filter((p) => p.enabled)
                    .map((platform) => (
                      <span
                        key={platform.id}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-black/50 px-2 py-0.5 text-[10px] font-bold text-rose-100"
                      >
                        <PlatformIcon platform={platform.id} className="h-3 w-3 shrink-0" />
                        <span>{platform.name}</span>
                        <span className="font-mono text-[9px] text-rose-400 uppercase">
                          LIVE
                        </span>
                      </span>
                    ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsStreamModalOpen(true)}
                  className="text-[11px] font-semibold text-rose-200 underline underline-offset-2 hover:text-white"
                >
                  Manage
                </button>
              </div>
            )}

            {/* Compact Quick-Touch Action Strip right beneath 9:16 Arena */}
            <div className="mt-3 grid w-full max-w-[420px] grid-cols-6 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  musicEngine.unlockAndStart();
                  setIsPaused((p) => !p);
                }}
                className={`inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-bold whitespace-nowrap transition-colors ${
                  isPaused
                    ? 'bg-cyan-400 text-slate-950'
                    : 'border border-white/10 bg-[#0b1224] text-slate-100 hover:border-cyan-400/40'
                }`}
              >
                {isPaused ? (
                  <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
                ) : (
                  <Pause className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{isPaused ? 'Play' : 'Pause'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  musicEngine.unlockAndStart();
                  startFreshRound();
                }}
                className="inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-[#0b1224] px-1 text-[10px] font-semibold text-slate-100 whitespace-nowrap transition-colors hover:border-white/25"
              >
                <RotateCw className="h-3.5 w-3.5 shrink-0" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  musicEngine.unlockAndStart();
                  setIsMuted((m) => !m);
                }}
                className={`inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[10px] font-semibold whitespace-nowrap transition-colors ${
                  isMuted
                    ? 'border-rose-500/35 bg-rose-500/10 text-rose-300'
                    : 'border-white/10 bg-[#0b1224] text-slate-100 hover:border-white/25'
                }`}
                aria-label={isMuted ? 'Unmute sound effects' : 'Mute sound effects'}
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>SFX</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMusic}
                className={`inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[10px] font-semibold whitespace-nowrap transition-colors ${
                  musicEnabled
                    ? 'border-fuchsia-400/35 bg-fuchsia-500/12 text-fuchsia-200 hover:bg-fuchsia-500/20'
                    : 'border-white/10 bg-[#0b1224] text-slate-400 hover:border-white/25'
                }`}
                aria-label={musicEnabled ? 'Turn off background music' : 'Turn on background music'}
              >
                <Music className="h-3.5 w-3.5 shrink-0" />
                <span>Music</span>
              </button>

              <button
                type="button"
                onClick={handleToggleAnnouncer}
                disabled={!speechSupported}
                className={`inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[10px] font-semibold whitespace-nowrap transition-colors ${
                  !speechSupported
                    ? 'cursor-not-allowed border-white/5 bg-[#0b1224] text-slate-500'
                    : announcerEnabled
                    ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-200 hover:bg-cyan-500/20'
                    : 'border-white/10 bg-[#0b1224] text-slate-400 hover:border-white/25'
                }`}
                aria-label={announcerEnabled ? 'Turn off announcer voice' : 'Turn on announcer voice'}
              >
                {announcerEnabled && speechSupported ? (
                  <Mic className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <MicOff className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>Voice</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFlagsModalOpen(true)}
                className="inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-1 text-[10px] font-bold text-cyan-200 whitespace-nowrap transition-colors hover:bg-cyan-500/20"
              >
                <Flag className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums">{activeFlags.length}</span>
              </button>
            </div>

            {/* Stream Focus Compact Controls below stage */}
            {streamFocus && (
              <div className="mt-4 w-full max-w-[420px]">
                <ControlsPanel
                  mode={mode}
                  onChangeMode={setMode}
                  settings={settings}
                  onChangeSettings={setSettings}
                  isPaused={isPaused}
                  onTogglePause={() => {
                    soundEngine.unlock();
                    musicEngine.unlockAndStart();
                    setIsPaused((p) => !p);
                  }}
                  onRestart={() => {
                    soundEngine.unlock();
                    musicEngine.unlockAndStart();
                    startFreshRound();
                  }}
                  isMuted={isMuted}
                  onToggleMute={() => {
                    soundEngine.unlock();
                    musicEngine.unlockAndStart();
                    setIsMuted((m) => !m);
                  }}
                  autoRestart={autoRestart}
                  onToggleAutoRestart={() => setAutoRestart((a) => !a)}
                  selectedFlagCount={activeFlags.length}
                  onOpenFlagsSetup={() => setIsFlagsModalOpen(true)}
                  announcerEnabled={announcerEnabled}
                  onToggleAnnouncer={handleToggleAnnouncer}
                  voiceOptions={voiceOptions}
                  selectedVoiceURI={selectedVoiceURI}
                  onSelectVoice={handleSelectVoice}
                  onTestVoice={handleTestVoice}
                  speechSupported={speechSupported}
                  musicEnabled={musicEnabled}
                  onToggleMusic={handleToggleMusic}
                  musicVolume={musicVolume}
                  onChangeMusicVolume={handleChangeMusicVolume}
                  streamPlatforms={streamPlatforms}
                  isLive={isLive}
                  onToggleGoLive={handleToggleGoLive}
                  onOpenStreamManager={() => setIsStreamModalOpen(true)}
                  compact
                />
                <div className="mt-4">
                  <LeaderboardPanel
                    records={leaderboard}
                    totalRounds={totalRounds}
                    recentEliminations={eliminated}
                    onResetLeaderboard={handleResetLeaderboard}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Right Column (Desktop) / Second on Mobile: Modes & Live Sliders */}
          {!streamFocus && (
            <aside className="order-2 lg:order-3">
              <ControlsPanel
                mode={mode}
                onChangeMode={setMode}
                settings={settings}
                onChangeSettings={setSettings}
                isPaused={isPaused}
                onTogglePause={() => {
                  soundEngine.unlock();
                  musicEngine.unlockAndStart();
                  setIsPaused((p) => !p);
                }}
                onRestart={() => {
                  soundEngine.unlock();
                  musicEngine.unlockAndStart();
                  startFreshRound();
                }}
                isMuted={isMuted}
                onToggleMute={() => {
                  soundEngine.unlock();
                  musicEngine.unlockAndStart();
                  setIsMuted((m) => !m);
                }}
                autoRestart={autoRestart}
                onToggleAutoRestart={() => setAutoRestart((a) => !a)}
                selectedFlagCount={activeFlags.length}
                onOpenFlagsSetup={() => setIsFlagsModalOpen(true)}
                announcerEnabled={announcerEnabled}
                onToggleAnnouncer={handleToggleAnnouncer}
                voiceOptions={voiceOptions}
                selectedVoiceURI={selectedVoiceURI}
                onSelectVoice={handleSelectVoice}
                onTestVoice={handleTestVoice}
                speechSupported={speechSupported}
                musicEnabled={musicEnabled}
                onToggleMusic={handleToggleMusic}
                musicVolume={musicVolume}
                onChangeMusicVolume={handleChangeMusicVolume}
                streamPlatforms={streamPlatforms}
                isLive={isLive}
                onToggleGoLive={handleToggleGoLive}
                onOpenStreamManager={() => setIsStreamModalOpen(true)}
              />
            </aside>
          )}
        </div>
      </main>

      {/* Flags Setup Modal / Drawer */}
      <FlagsSetupModal
        isOpen={isFlagsModalOpen}
        onClose={() => setIsFlagsModalOpen(false)}
        allCountries={UN_COUNTRIES}
        customFlags={customFlags}
        activePreset={activePreset}
        selectedIds={selectedIds}
        onSelectPreset={handleSelectPreset}
        onUpdateSelectedIds={handleUpdateSelectedIds}
        onAddCustomFlag={handleAddCustomFlag}
        onDeleteCustomFlag={handleDeleteCustomFlag}
        onApplyAndRestart={() => {
          soundEngine.unlock();
          musicEngine.unlockAndStart();
          startFreshRound();
        }}
      />

      {/* Multi-Platform Channel & Live Stream Manager Modal */}
      <StreamManagerModal
        isOpen={isStreamModalOpen}
        onClose={() => setIsStreamModalOpen(false)}
        platforms={streamPlatforms}
        onUpdatePlatform={handleUpdatePlatform}
        isLive={isLive}
        liveDurationSec={liveDurationSec}
        captureHasAudio={captureHasAudio}
        recordedBlobUrl={recordedBlobUrl}
        captureError={captureError}
        onToggleGoLive={handleToggleGoLive}
      />
    </div>
  );
}
