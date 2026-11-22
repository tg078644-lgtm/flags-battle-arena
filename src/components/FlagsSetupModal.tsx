import React, { useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { CountryFlag, FlagPreset } from '../types';
import { getFallbackColors, TOP_20_CODES, TOP_50_CODES } from '../data/countries';
import { FlagAvatar } from './FlagAvatar';

interface FlagsSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  allCountries: CountryFlag[];
  customFlags: CountryFlag[];
  activePreset: FlagPreset;
  selectedIds: Set<string>;
  onSelectPreset: (preset: FlagPreset) => void;
  onUpdateSelectedIds: (ids: Set<string>, preset: FlagPreset) => void;
  onAddCustomFlag: (flag: CountryFlag) => void;
  onDeleteCustomFlag: (id: string) => void;
  onApplyAndRestart: () => void;
}

export function FlagsSetupModal({
  isOpen,
  onClose,
  allCountries,
  customFlags,
  activePreset,
  selectedIds,
  onSelectPreset,
  onUpdateSelectedIds,
  onAddCustomFlag,
  onDeleteCustomFlag,
  onApplyAndRestart,
}: FlagsSetupModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customImageData, setCustomImageData] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const combinedFlags = useMemo(
    () => [...customFlags, ...allCountries],
    [customFlags, allCountries]
  );

  const filteredFlags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return combinedFlags;
    return combinedFlags.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q)
    );
  }, [combinedFlags, searchQuery]);

  if (!isOpen) return null;

  const handleToggleFlag = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      if (next.size <= 2) return; // Require at least 2 flags for a battle
      next.delete(id);
    } else {
      next.add(id);
    }
    onUpdateSelectedIds(next, 'custom');
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedIds);
    filteredFlags.forEach((f) => next.add(f.id));
    onUpdateSelectedIds(next, 'custom');
  };

  const handleClearToMinimum = () => {
    // Keep first 2 flags so arena always has a valid battle
    const keep = combinedFlags.slice(0, 2).map((f) => f.id);
    onUpdateSelectedIds(new Set(keep), 'custom');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (PNG, JPG, WebP, or SVG).');
      return;
    }

    if (file.size > 2.5 * 1024 * 1024) {
      setUploadError('Image must be under 2.5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Resize cleanly onto a small 128x128 canvas so localStorage & Canvas stay fast
        const img = new Image();
        img.onload = () => {
          const off = document.createElement('canvas');
          const size = 128;
          off.width = size;
          off.height = size;
          const ctx = off.getContext('2d');
          if (ctx) {
            const scale = Math.max(size / img.width, size / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
            setCustomImageData(off.toDataURL('image/png'));
          } else {
            setCustomImageData(reader.result as string);
          }
        };
        img.onerror = () => {
          setUploadError('Could not read that image file.');
        };
        img.src = reader.result;
      }
    };
    reader.onerror = () => {
      setUploadError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleCreateCustomFlag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = customName.trim();
    if (!trimmedName) {
      setUploadError('Enter a name for your custom flag.');
      return;
    }

    const derivedCode =
      customCode.trim().toLowerCase().slice(0, 3) ||
      trimmedName
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 2)
        .toLowerCase() ||
      'cf';

    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const [fallbackColor, fallbackAccent] = getFallbackColors(trimmedName + id);

    const newFlag: CountryFlag = {
      id,
      code: derivedCode,
      name: trimmedName,
      imageUrl: customImageData,
      fallbackColor,
      fallbackAccent,
      isCustom: true,
    };

    onAddCustomFlag(newFlag);
    setCustomName('');
    setCustomCode('');
    setCustomImageData('');
    setUploadError('');
    setShowAddCustom(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const presetButtons: Array<{ id: FlagPreset; label: string; count: number }> = [
    { id: 'all', label: 'All 195', count: allCountries.length + customFlags.length },
    { id: 'top50', label: 'Top 50', count: TOP_50_CODES.length + customFlags.length },
    { id: 'top20', label: 'Top 20', count: TOP_20_CODES.length + customFlags.length },
    { id: 'custom', label: 'Custom Pick', count: selectedIds.size },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Flags Setup"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b1224] text-slate-100 shadow-2xl sm:rounded-2xl">
        {/* Drag handle on mobile */}
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-700 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold tracking-wide text-white">
              Flags Setup
            </h2>
            <p className="text-xs text-slate-400 tabular-nums">
              {selectedIds.size} selected · {allCountries.length} UN nations
              {customFlags.length > 0 ? ` · ${customFlags.length} custom` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 transition-colors hover:border-white/20 hover:text-white"
            aria-label="Close Flags Setup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Presets + Add Custom Flag Bar */}
        <div className="border-b border-white/10 bg-[#080e1d] px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-900/90 p-1">
              {presetButtons.map((preset) => {
                const isActive = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPreset(preset.id)}
                    className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-cyan-400 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAddCustom((prev) => !prev);
                setUploadError('');
              }}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                showAddCustom
                  ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/15 bg-slate-900 text-slate-100 hover:border-cyan-400/50 hover:text-cyan-200'
              }`}
            >
              <Plus className="h-4 w-4" />
              Add Custom Flag
            </button>
          </div>

          {/* Expandable Custom Flag Creator */}
          {showAddCustom && (
            <form
              onSubmit={handleCreateCustomFlag}
              className="mt-3.5 rounded-xl border border-cyan-500/25 bg-[#0d162c] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <FlagAvatar
                    imageUrl={customImageData}
                    code={customCode || customName.slice(0, 2) || 'CF'}
                    name={customName || 'Custom Flag Preview'}
                    fallbackColor={getFallbackColors(customName || 'custom')[0]}
                    size="lg"
                  />
                  <div className="flex flex-col gap-1">
                    <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-400/50 hover:text-white">
                      <Upload className="h-3.5 w-3.5" />
                      <span>{customImageData ? 'Change Image' : 'Upload Image'}</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Optional · Auto-cropped to circle
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Flag name (e.g. Mars Republic)"
                    maxLength={32}
                    className="min-h-[42px] flex-1 rounded-lg border border-white/15 bg-slate-950/90 px-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    placeholder="Code"
                    maxLength={3}
                    className="min-h-[42px] w-full rounded-lg border border-white/15 bg-slate-950/90 px-3 text-center font-mono text-sm uppercase text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none sm:w-20"
                  />
                </div>
              </div>

              {uploadError && (
                <p className="mt-2 text-xs text-rose-400">{uploadError}</p>
              )}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCustom(false);
                    setUploadError('');
                  }}
                  className="min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[38px] rounded-lg bg-cyan-400 px-4 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300"
                >
                  Save & Include
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Search & Bulk Actions */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search country name or ISO code..."
              className="min-h-[42px] w-full rounded-xl border border-white/10 bg-slate-950/80 py-2 pr-9 pl-9 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/70 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="min-h-[40px] rounded-lg border border-white/10 bg-slate-900 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:text-white"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleClearToMinimum}
              className="min-h-[40px] rounded-lg border border-white/10 bg-slate-900 px-3 text-xs font-medium text-slate-400 transition-colors hover:border-white/25 hover:text-slate-200"
            >
              Reset to 2
            </button>
          </div>
        </div>

        {/* Scrollable Country Grid */}
        <div className="arena-scroll flex-1 overflow-y-auto px-5 py-3">
          {filteredFlags.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No countries match "{searchQuery}".
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {filteredFlags.map((flag) => {
                const checked = selectedIds.has(flag.id);
                return (
                  <div
                    key={flag.id}
                    className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                      checked
                        ? 'border-cyan-400/40 bg-cyan-500/10'
                        : 'border-white/5 bg-slate-900/45 hover:border-white/15'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleFlag(flag.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          checked
                            ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                            : 'border-slate-600 bg-slate-950'
                        }`}
                      >
                        {checked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </span>
                      <FlagAvatar
                        imageUrl={flag.imageUrl}
                        code={flag.code}
                        name={flag.name}
                        fallbackColor={flag.fallbackColor}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-100">
                          {flag.name}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-400 uppercase">
                          {flag.code}
                          {flag.isCustom ? ' · Custom' : ''}
                        </span>
                      </span>
                    </button>

                    {flag.isCustom && (
                      <button
                        type="button"
                        onClick={() => onDeleteCustomFlag(flag.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
                        aria-label={`Remove ${flag.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Footer CTA */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#080e1d] px-5 py-3.5">
          <span className="text-xs text-slate-400 tabular-nums">
            Minimum 2 flags required
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-white/10 px-4 text-sm font-medium text-slate-300 transition-colors hover:border-white/25 hover:text-white"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyAndRestart();
                onClose();
              }}
              className="min-h-[44px] rounded-xl bg-cyan-400 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300"
            >
              Start Battle ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
