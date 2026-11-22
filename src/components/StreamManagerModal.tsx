import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Radio,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import { StreamPlatformConfig, StreamPlatformId } from '../types';
import {
  generateCompactTeeCommand,
  generateMultiStreamFfmpegCommand,
} from '../utils/streamCapture';
import { PlatformIcon } from './PlatformIcons';

interface StreamManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: StreamPlatformConfig[];
  onUpdatePlatform: (
    id: StreamPlatformId,
    patch: Partial<StreamPlatformConfig>
  ) => void;
  isLive: boolean;
  liveDurationSec: number;
  captureHasAudio: boolean;
  recordedBlobUrl: string | null;
  captureError: string | null;
  onToggleGoLive: () => void;
}

function formatDuration(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${String(hrs).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function StreamManagerModal({
  isOpen,
  onClose,
  platforms,
  onUpdatePlatform,
  isLive,
  liveDurationSec,
  captureHasAudio,
  recordedBlobUrl,
  captureError,
  onToggleGoLive,
}: StreamManagerModalProps) {
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [scriptMode, setScriptMode] = useState<'hf' | 'tee'>('hf');
  const [showScriptPreview, setShowScriptPreview] = useState(false);
  const [copiedState, setCopiedState] = useState<'idle' | 'copied'>('idle');

  if (!isOpen) return null;

  const activePlatforms = platforms.filter((p) => p.enabled);

  const generatedCommand =
    scriptMode === 'hf'
      ? generateMultiStreamFfmpegCommand(activePlatforms)
      : generateCompactTeeCommand(activePlatforms);

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(generatedCommand);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = generatedCommand;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopiedState('copied');
    window.setTimeout(() => setCopiedState('idle'), 2200);
  };

  const toggleRevealKey = (id: string) => {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Multi-Platform Live Stream Manager"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/12 bg-[#0a1122] text-slate-100 shadow-2xl sm:rounded-2xl">
        {/* Mobile Drag Handle */}
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-700 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold tracking-wide text-white">
              Multi-Platform Live Stream Manager
            </h2>
            <p className="text-xs text-slate-400 tabular-nums">
              {activePlatforms.length} of {platforms.length} channels ON · Settings auto-saved
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 transition-colors hover:border-white/25 hover:text-white"
            aria-label="Close Stream Manager"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Master Broadcast Action Bar + Active LIVE Status */}
        <div className="border-b border-white/10 bg-[#070d1b] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onToggleGoLive}
              disabled={!isLive && activePlatforms.length === 0}
              className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                isLive
                  ? 'bg-rose-500 text-white hover:bg-rose-400'
                  : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
              }`}
            >
              {isLive ? (
                <>
                  <Square className="h-4 w-4 fill-current" />
                  <span>Stop Broadcast ({formatDuration(liveDurationSec)})</span>
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4" />
                  <span>
                    Go Live to Active Platforms ({activePlatforms.length})
                  </span>
                </>
              )}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCommand}
                disabled={activePlatforms.length === 0}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-400/35 bg-cyan-500/12 px-3.5 text-xs font-bold text-cyan-200 whitespace-nowrap transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
              >
                {copiedState === 'copied' ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span className="text-emerald-300">Copied Relay Script!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy Multi-Stream FFmpeg / Relay Script</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowScriptPreview((prev) => !prev)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3 text-xs font-semibold text-slate-300 whitespace-nowrap transition-colors hover:border-white/25 hover:text-white"
              >
                <Terminal className="h-4 w-4" />
                <span>{showScriptPreview ? 'Hide Script' : 'View Script'}</span>
              </button>
            </div>
          </div>

          {/* Active Platform LIVE Status Pills */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activePlatforms.length === 0 ? (
              <span className="text-xs text-slate-400">
                Switch at least one platform ON below to enable multistreaming.
              </span>
            ) : (
              activePlatforms.map((platform) => (
                <span
                  key={platform.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    isLive
                      ? 'border-rose-500/45 bg-rose-500/15 text-rose-100'
                      : 'border-white/12 bg-slate-900/85 text-slate-200'
                  }`}
                >
                  <PlatformIcon platform={platform.id} className="h-3.5 w-3.5 shrink-0" />
                  <span>{platform.name}</span>
                  <span
                    className={`font-mono text-[10px] font-bold uppercase ${
                      isLive ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {isLive ? 'LIVE' : 'READY'}
                  </span>
                </span>
              ))
            )}

            {isLive && (
              <span className="ml-auto font-mono text-[11px] text-slate-400 tabular-nums">
                9:16 Canvas 60fps · {captureHasAudio ? 'Audio Mix Active' : 'Video Capture'}
              </span>
            )}
          </div>

          {captureError && (
            <p className="mt-2 text-xs text-rose-400">{captureError}</p>
          )}

          {!isLive && recordedBlobUrl && (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              <span>9:16 stream recording captured locally.</span>
              <a
                href={recordedBlobUrl}
                download={`flags-battle-arena-9x16-${Date.now()}.webm`}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-emerald-400 px-3 font-bold text-slate-950 transition-colors hover:bg-emerald-300"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download WebM</span>
              </a>
            </div>
          )}

          {/* Collapsible FFmpeg -f tee Multi-Stream Command Preview */}
          {showScriptPreview && (
            <div className="mt-3 rounded-xl border border-white/10 bg-[#050914] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-0.5">
                  <button
                    type="button"
                    onClick={() => setScriptMode('hf')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      scriptMode === 'hf'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Hugging Face Space Relay (9:16)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptMode('tee')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      scriptMode === 'tee'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    FFmpeg -f tee One-Liner
                  </button>
                </div>
                <span className="text-[11px] text-slate-400">
                  Uses active ON platforms only
                </span>
              </div>
              <pre className="arena-scroll max-h-48 overflow-auto rounded-lg bg-black/50 p-2.5 font-mono text-[11px] leading-relaxed text-cyan-200">
                <code>{generatedCommand}</code>
              </pre>
            </div>
          )}
        </div>

        {/* 5 Individual Platform Cards */}
        <div className="arena-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {platforms.map((platform) => {
            const isRevealed = Boolean(revealedKeys[platform.id]);
            return (
              <div
                key={platform.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  platform.enabled
                    ? 'border-cyan-400/35 bg-[#0d162c]'
                    : 'border-white/8 bg-[#080f20]/80'
                }`}
              >
                {/* Platform Header Row with Independent ON/OFF Switch */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/90">
                      <PlatformIcon platform={platform.id} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      {platform.id === 'custom' ? (
                        <input
                          type="text"
                          value={platform.name}
                          onChange={(e) =>
                            onUpdatePlatform('custom', { name: e.target.value })
                          }
                          placeholder="Custom Platform Name"
                          maxLength={28}
                          className="w-44 rounded-md border border-white/10 bg-slate-950/80 px-2 py-0.5 text-sm font-bold text-white focus:border-cyan-400 focus:outline-none"
                        />
                      ) : (
                        <h3 className="text-sm font-bold text-white">
                          {platform.name}
                        </h3>
                      )}
                      <p className="text-[11px] text-slate-400">
                        {platform.enabled
                          ? isLive
                            ? 'Streaming active'
                            : 'Enabled for multistream & watermark'
                          : 'Disabled'}
                      </p>
                    </div>
                  </div>

                  {/* Independent Platform ON/OFF Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={platform.enabled}
                    aria-label={`Toggle ${platform.name}`}
                    onClick={() =>
                      onUpdatePlatform(platform.id, { enabled: !platform.enabled })
                    }
                    className="inline-flex min-h-[44px] items-center gap-2.5 rounded-xl px-2 py-1"
                  >
                    <span
                      className={`font-mono text-xs font-bold uppercase ${
                        platform.enabled ? 'text-emerald-300' : 'text-slate-500'
                      }`}
                    >
                      {platform.enabled ? 'ON' : 'OFF'}
                    </span>
                    <span
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                        platform.enabled ? 'bg-emerald-400' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition-transform ${
                          platform.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </span>
                  </button>
                </div>

                {/* Channel Fields */}
                <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Channel Handle + Show Handle on Screen Toggle */}
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label
                        htmlFor={`handle-${platform.id}`}
                        className="text-[11px] font-medium text-slate-300"
                      >
                        Channel Handle / Name
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-300 select-none">
                        <input
                          type="checkbox"
                          checked={platform.showHandleOnScreen}
                          onChange={(e) =>
                            onUpdatePlatform(platform.id, {
                              showHandleOnScreen: e.target.checked,
                            })
                          }
                          className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-cyan-400"
                        />
                        <span>Show Handle on Screen</span>
                      </label>
                    </div>
                    <input
                      id={`handle-${platform.id}`}
                      type="text"
                      value={platform.handle}
                      onChange={(e) =>
                        onUpdatePlatform(platform.id, { handle: e.target.value })
                      }
                      placeholder="@MyChannel"
                      className="min-h-[40px] w-full rounded-lg border border-white/10 bg-slate-950/90 px-3 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  {/* Masked Stream Key with Show/Hide Eye Toggle */}
                  <div>
                    <label
                      htmlFor={`key-${platform.id}`}
                      className="mb-1 block text-[11px] font-medium text-slate-300"
                    >
                      Stream Key
                    </label>
                    <div className="relative">
                      <input
                        id={`key-${platform.id}`}
                        type={isRevealed ? 'text' : 'password'}
                        value={platform.streamKey}
                        onChange={(e) =>
                          onUpdatePlatform(platform.id, { streamKey: e.target.value })
                        }
                        placeholder="Paste private stream key"
                        autoComplete="off"
                        spellCheck={false}
                        className="min-h-[40px] w-full rounded-lg border border-white/10 bg-slate-950/90 py-2 pr-10 pl-3 font-mono text-xs text-white placeholder:font-sans placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => toggleRevealKey(platform.id)}
                        className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                        aria-label={
                          isRevealed
                            ? `Hide ${platform.name} stream key`
                            : `Show ${platform.name} stream key`
                        }
                      >
                        {isRevealed ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* RTMP Server URL (Full Width) */}
                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`rtmp-${platform.id}`}
                      className="mb-1 block text-[11px] font-medium text-slate-300"
                    >
                      RTMP Server URL
                    </label>
                    <input
                      id={`rtmp-${platform.id}`}
                      type="text"
                      value={platform.rtmpUrl}
                      onChange={(e) =>
                        onUpdatePlatform(platform.id, { rtmpUrl: e.target.value })
                      }
                      placeholder="rtmp://..."
                      spellCheck={false}
                      className="min-h-[40px] w-full rounded-lg border border-white/10 bg-slate-950/90 px-3 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#070d1b] px-5 py-3">
          <span className="text-[11px] text-slate-400">
            Stream keys stay strictly in your browser localStorage.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] rounded-xl bg-slate-800 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
