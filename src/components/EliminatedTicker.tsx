import { EliminatedEntry } from '../types';
import { FlagAvatar } from './FlagAvatar';

interface EliminatedTickerProps {
  entries: EliminatedEntry[];
  totalEliminated?: number;
}

export function EliminatedTicker({ entries, totalEliminated }: EliminatedTickerProps) {
  // Show only the last 3 eliminated flags to keep the bottom bar ultra-slim
  const visibleEntries = entries.slice(0, 3);
  const outCount = totalEliminated ?? entries.length;

  return (
    <div className="pointer-events-none w-full border-t border-white/10 bg-black/45 px-2.5 py-1.5 backdrop-blur-sm">
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="font-display text-[10px] leading-none font-bold tracking-[0.12em] text-rose-400 uppercase">
          Eliminated
        </span>
        <span className="font-mono text-[10px] leading-none text-slate-400 tabular-nums">
          {outCount} out
        </span>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="py-1 text-[10px] leading-tight text-slate-400">
          Waiting for first exit...
        </div>
      ) : (
        <ul className="space-y-0.5">
          {visibleEntries.map((entry, idx) => (
            <li
              key={`${entry.flag.id}_${entry.rank}_${entry.timestamp}`}
              className={`animate-feed-enter flex items-center justify-between gap-2 py-0.5 text-[10px] leading-tight ${
                idx === 0 ? 'opacity-100' : idx === 1 ? 'opacity-80' : 'opacity-60'
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <FlagAvatar
                  imageUrl={entry.flag.imageUrl}
                  code={entry.flag.code}
                  name={entry.flag.name}
                  fallbackColor={entry.flag.fallbackColor}
                  size="xxs"
                />
                <span className="truncate font-medium text-slate-100">
                  {entry.flag.name}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] font-semibold text-rose-300 tabular-nums">
                #{entry.rank}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
