import { useEffect, useState } from 'react';
import { StreamPlatformConfig } from '../types';
import { PlatformIcon } from './PlatformIcons';

interface SocialWatermarkBarProps {
  platforms: StreamPlatformConfig[];
  isLive: boolean;
}

export function SocialWatermarkBar({ platforms, isLive }: SocialWatermarkBarProps) {
  const activePlatforms = platforms.filter((p) => p.enabled);
  const [pageIdx, setPageIdx] = useState(0);

  // Smoothly cycle 2 at a time when 3 or more platforms are switched ON
  const shouldCycle = activePlatforms.length >= 3;
  const pageCount = shouldCycle ? Math.ceil(activePlatforms.length / 2) : 1;

  useEffect(() => {
    setPageIdx(0);
  }, [activePlatforms.length]);

  useEffect(() => {
    if (!shouldCycle) return;
    const timer = window.setInterval(() => {
      setPageIdx((prev) => (prev + 1) % pageCount);
    }, 3400);
    return () => window.clearInterval(timer);
  }, [shouldCycle, pageCount]);

  if (activePlatforms.length === 0) return null;

  const visibleSlice = shouldCycle
    ? activePlatforms.slice(pageIdx * 2, pageIdx * 2 + 2)
    : activePlatforms;

  // If last page has only 1 item when cycling an odd count (3 or 5), pair cleanly with first
  const displayItems =
    shouldCycle && visibleSlice.length === 1 && activePlatforms.length > 1
      ? [visibleSlice[0], activePlatforms[0]]
      : visibleSlice;

  return (
    <div className="pointer-events-none flex justify-center px-2.5 pb-1.5">
      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/12 bg-black/50 px-2.5 py-1 shadow-md backdrop-blur-md">
        <span
          className={`shrink-0 font-display text-[10px] leading-none font-bold tracking-[0.12em] uppercase ${
            isLive ? 'text-rose-400' : 'text-cyan-300'
          }`}
        >
          {isLive ? 'LIVE ON' : 'FOLLOW'}
        </span>

        <span aria-hidden="true" className="h-3 w-px shrink-0 bg-white/15" />

        <div
          key={pageIdx}
          className="animate-feed-enter flex min-w-0 items-center gap-2.5 overflow-hidden"
        >
          {displayItems.map((platform) => {
            const label =
              platform.showHandleOnScreen && platform.handle.trim()
                ? platform.handle.trim()
                : platform.name;
            return (
              <span
                key={`${platform.id}_${pageIdx}`}
                className="inline-flex min-w-0 items-center gap-1 text-[10px] leading-none font-semibold text-slate-100"
              >
                <PlatformIcon platform={platform.id} className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[105px] truncate">{label}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
