import {
  Flag,
  Flame,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  Radio,
  Repeat,
  RotateCw,
  Settings2,
  Shrink,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { GameMode, PhysicsSettings, StreamPlatformConfig } from '../types';
import { AnnouncerVoiceOption } from '../utils/announcer';
import { PlatformIcon } from './PlatformIcons';

interface ControlsPanelProps {
  mode: GameMode;
  onChangeMode: (mode: GameMode) => void;
  settings: PhysicsSettings;
  onChangeSettings: (next: PhysicsSettings) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onRestart: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  autoRestart: boolean;
  onToggleAutoRestart: () => void;
  selectedFlagCount: number;
  onOpenFlagsSetup: () => void;
  announcerEnabled: boolean;
  onToggleAnnouncer: () => void;
  voiceOptions: AnnouncerVoiceOption[];
  selectedVoiceURI: string;
  onSelectVoice: (uri: string) => void;
  onTestVoice: () => void;
  speechSupported: boolean;
  musicEnabled: boolean;
  onToggleMusic: () => void;
  musicVolume: number;
  onChangeMusicVolume: (volume: number) => void;
  streamPlatforms: StreamPlatformConfig[];
  isLive: boolean;
  onToggleGoLive: () => void;
  onOpenStreamManager: () => void;
  compact?: boolean;
}

const MODES: Array<{
  id: GameMode;
  label: string;
  desc: string;
  icon: typeof RotateCw;
}> = [
  {
    id: 'classic',
    label: 'Classic',
    desc: 'Spinning neon exit gap',
    icon: RotateCw,
  },
  {
    id: 'shrinking',
    label: 'Shrinking',
    desc: 'Ring tightens over time',
    icon: Shrink,
  },
  {
    id: 'chaos',
    label: 'Chaos',
    desc: 'Fast spin + speed surges',
    icon: Flame,
  },
];

export function ControlsPanel({
  mode,
  onChangeMode,
  settings,
  onChangeSettings,
  isPaused,
  onTogglePause,
  onRestart,
  isMuted,
  onToggleMute,
  autoRestart,
  onToggleAutoRestart,
  selectedFlagCount,
  onOpenFlagsSetup,
  announcerEnabled,
  onToggleAnnouncer,
  voiceOptions,
  selectedVoiceURI,
  onSelectVoice,
  onTestVoice,
  speechSupported,
  musicEnabled,
  onToggleMusic,
  musicVolume,
  onChangeMusicVolume,
  streamPlatforms,
  isLive,
  onToggleGoLive,
  onOpenStreamManager,
  compact = false,
}: ControlsPanelProps) {
  const activePlatforms = streamPlatforms.filter((p) => p.enabled);
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0a1022]/90 ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      {/* Primary Touch Action Row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={onTogglePause}
          className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold whitespace-nowrap transition-colors ${
            isPaused
              ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
              : 'border border-cyan-400/35 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
          }`}
        >
          {isPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4" />}
          <span>{isPaused ? 'Resume' : 'Pause'}</span>
        </button>

        <button
          type="button"
          onClick={onRestart}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-900/90 px-4 text-sm font-semibold text-slate-100 whitespace-nowrap transition-colors hover:border-white/30 hover:bg-slate-800"
        >
          <RotateCw className="h-4 w-4" />
          <span>Restart</span>
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors ${
            isMuted
              ? 'border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
              : 'border-white/10 bg-slate-900/75 text-slate-200 hover:border-white/25'
          }`}
          aria-pressed={isMuted}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          <span>{isMuted ? 'Muted' : 'Sound On'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenFlagsSetup}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-900/75 px-3 text-sm font-semibold text-slate-100 whitespace-nowrap transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
        >
          <Flag className="h-4 w-4" />
          <span>Flags ({selectedFlagCount})</span>
        </button>
      </div>

      {/* Auto-Restart (24/7 Stream Loop) Toggle */}
      <button
        type="button"
        onClick={onToggleAutoRestart}
        role="switch"
        aria-checked={autoRestart}
        className={`flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
          autoRestart
            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
            : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'
        }`}
      >
        <span className="flex items-center gap-2.5">
          <Repeat className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold sm:text-sm">
            Auto-Restart (24/7 Stream Loop)
          </span>
        </span>
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            autoRestart ? 'bg-emerald-400' : 'bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition-transform ${
              autoRestart ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </span>
      </button>

      {/* AI Voice Announcer (Web Speech API) */}
      <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-950/55 p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleAnnouncer}
            role="switch"
            aria-checked={announcerEnabled}
            disabled={!speechSupported}
            className={`flex min-h-[42px] flex-1 items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
              !speechSupported
                ? 'cursor-not-allowed border-white/5 bg-slate-900/50 text-slate-500'
                : announcerEnabled
                ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                : 'border-white/10 bg-slate-900/75 text-slate-300 hover:border-white/25'
            }`}
          >
            <span className="flex items-center gap-2">
              {announcerEnabled && speechSupported ? (
                <Mic className="h-4 w-4 shrink-0 text-cyan-300" />
              ) : (
                <MicOff className="h-4 w-4 shrink-0 text-slate-400" />
              )}
              <span className="text-xs font-semibold whitespace-nowrap">
                Announcer Voice
              </span>
            </span>
            <span className="font-mono text-[11px] font-bold uppercase">
              {!speechSupported ? 'N/A' : announcerEnabled ? 'On' : 'Off'}
            </span>
          </button>

          {speechSupported && (
            <button
              type="button"
              onClick={onTestVoice}
              disabled={!announcerEnabled}
              className="min-h-[42px] shrink-0 rounded-lg border border-white/10 bg-slate-900/80 px-3 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
              title="Preview announcer voice"
            >
              Test
            </button>
          )}
        </div>

        {speechSupported ? (
          <div>
            <label
              htmlFor={`voice-select-${compact ? 'm' : 'd'}`}
              className="mb-1 block text-[11px] text-slate-400"
            >
              Commentator Voice
            </label>
            <select
              id={`voice-select-${compact ? 'm' : 'd'}`}
              value={selectedVoiceURI}
              onChange={(e) => onSelectVoice(e.target.value)}
              disabled={!announcerEnabled || voiceOptions.length === 0}
              className="min-h-[40px] w-full rounded-lg border border-white/10 bg-[#070d1d] px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {voiceOptions.length === 0 ? (
                <option value="">Default System English</option>
              ) : (
                voiceOptions.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.isRecommended ? ' — Auto' : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            Web Speech synthesis is unavailable in this browser.
          </p>
        )}

        {/* Built-In Copyright-Free Background Music */}
        <div className="border-t border-white/10 pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleMusic}
              role="switch"
              aria-checked={musicEnabled}
              className={`flex min-h-[42px] w-full items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                musicEnabled
                  ? 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200'
                  : 'border-white/10 bg-slate-900/75 text-slate-300 hover:border-white/25'
              }`}
            >
              <span className="flex items-center gap-2">
                <Music
                  className={`h-4 w-4 shrink-0 ${
                    musicEnabled ? 'text-fuchsia-300' : 'text-slate-400'
                  }`}
                />
                <span className="text-xs font-semibold whitespace-nowrap">
                  Background Music
                </span>
              </span>
              <span className="font-mono text-[11px] font-bold uppercase">
                {musicEnabled ? 'On' : 'Off'}
              </span>
            </button>
          </div>

          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <label
                htmlFor={`music-vol-${compact ? 'm' : 'd'}`}
                className="text-slate-400"
              >
                Music Volume · Royalty-Free Synth
              </label>
              <span className="font-mono font-semibold text-fuchsia-300 tabular-nums">
                {Math.round(musicVolume * 100)}%
              </span>
            </div>
            <input
              id={`music-vol-${compact ? 'm' : 'd'}`}
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={musicVolume}
              disabled={!musicEnabled}
              onChange={(e) => onChangeMusicVolume(parseFloat(e.target.value))}
              className="arena-slider w-full disabled:opacity-45"
            />
          </div>
        </div>
      </div>

      {/* Multi-Platform Live Stream Quick Control */}
      <div className="space-y-2.5 rounded-xl border border-white/10 bg-slate-950/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200">
            Multi-Platform Stream
          </span>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
            {activePlatforms.length} active
          </span>
        </div>

        {/* Active Platform LIVE / READY Status Pills */}
        {activePlatforms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {activePlatforms.map((platform) => (
              <span
                key={platform.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  isLive
                    ? 'border-rose-500/45 bg-rose-500/15 text-rose-100'
                    : 'border-white/10 bg-slate-900 text-slate-200'
                }`}
              >
                <PlatformIcon platform={platform.id} className="h-3 w-3 shrink-0" />
                <span>{platform.name}</span>
                {isLive && (
                  <span className="font-mono text-[9px] font-bold text-rose-400 uppercase">
                    LIVE
                  </span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            No platforms switched ON. Open Channels to configure.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleGoLive}
            disabled={!isLive && activePlatforms.length === 0}
            className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              isLive
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
            }`}
          >
            {isLive ? (
              <>
                <Square className="h-3.5 w-3.5 shrink-0 fill-current" />
                <span>Stop Live</span>
              </>
            ) : (
              <>
                <Radio className="h-3.5 w-3.5 shrink-0" />
                <span>Go Live</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenStreamManager}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-slate-900 px-2.5 text-xs font-semibold text-slate-100 whitespace-nowrap transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
          >
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            <span>Channels</span>
          </button>
        </div>
      </div>

      {/* Game Modes */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">Arena Mode</span>
          <span className="text-xs text-slate-400">
            {MODES.find((m) => m.id === mode)?.desc}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950/85 p-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            const activeStyle =
              m.id === 'chaos'
                ? 'bg-fuchsia-500 text-white shadow-sm'
                : m.id === 'shrinking'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'bg-cyan-400 text-slate-950 shadow-sm';
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeMode(m.id)}
                className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
                  active ? activeStyle : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Physics Sliders */}
      <div className="space-y-3 border-t border-white/10 pt-3.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
          <span>Live Physics Controls</span>
        </div>

        {/* Spin Speed */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <label htmlFor={`spin-${compact ? 'm' : 'd'}`} className="text-slate-300">
              Spin Speed
            </label>
            <span className="font-mono font-semibold text-cyan-300 tabular-nums">
              {settings.spinSpeed.toFixed(1)}x
            </span>
          </div>
          <input
            id={`spin-${compact ? 'm' : 'd'}`}
            type="range"
            min={0.2}
            max={3.5}
            step={0.1}
            value={settings.spinSpeed}
            onChange={(e) =>
              onChangeSettings({ ...settings, spinSpeed: parseFloat(e.target.value) })
            }
            className="arena-slider w-full"
          />
        </div>

        {/* Gap Angle Size */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <label htmlFor={`gap-${compact ? 'm' : 'd'}`} className="text-slate-300">
              Gap Angle Size
            </label>
            <span className="font-mono font-semibold text-cyan-300 tabular-nums">
              {Math.round(settings.gapAngleDeg)}°
            </span>
          </div>
          <input
            id={`gap-${compact ? 'm' : 'd'}`}
            type="range"
            min={20}
            max={120}
            step={2}
            value={settings.gapAngleDeg}
            onChange={(e) =>
              onChangeSettings({ ...settings, gapAngleDeg: parseFloat(e.target.value) })
            }
            className="arena-slider w-full"
          />
        </div>

        {/* Bounciness */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <label htmlFor={`bounce-${compact ? 'm' : 'd'}`} className="text-slate-300">
              Bounciness
            </label>
            <span className="inline-flex items-center gap-1 font-mono font-semibold text-cyan-300 tabular-nums">
              {settings.bounciness > 1.0 && <Zap className="h-3 w-3 text-amber-400" />}
              {Math.round(settings.bounciness * 100)}%
            </span>
          </div>
          <input
            id={`bounce-${compact ? 'm' : 'd'}`}
            type="range"
            min={0.5}
            max={1.15}
            step={0.05}
            value={settings.bounciness}
            onChange={(e) =>
              onChangeSettings({ ...settings, bounciness: parseFloat(e.target.value) })
            }
            className="arena-slider w-full"
          />
        </div>
      </div>
    </div>
  );
}
