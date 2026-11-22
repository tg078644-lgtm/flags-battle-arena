import { Trophy } from 'lucide-react';
import { WinRecord } from '../types';
import { FlagAvatar } from './FlagAvatar';

interface TopWinnersHudProps {
  records: WinRecord[];
}

export function TopWinnersHud({ records }: TopWinnersHudProps) {
  const top3 = [...records]
    .sort((a, b) => b.wins - a.wins || b.lastWonAt - a.lastWonAt)
    .slice(0, 3);

  return (
    <div className="pointer-events-none mt-1.5 w-full max-w-[135px] rounded-lg border border-white/10 bg-black/45 p-1.5 backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 font-display text-[10px] leading-none font-bold tracking-[0.1em] text-amber-300 uppercase">
          <Trophy className="h-2.5 w-2.5 shrink-0" />
          <span>Top Winners</span>
        </span>
      </div>

      {top3.length === 0 ? (
        <p className="text-[10px] leading-tight text-slate-400">No winners yet</p>
      ) : (
        <ol className="space-y-0.5">
          {top3.map((entry, idx) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-1 text-[10px] leading-tight"
            >
              <span className="flex min-w-0 items-center gap-1">
                <FlagAvatar
                  imageUrl={entry.imageUrl}
                  code={entry.code}
                  name={entry.name}
                  fallbackColor={entry.fallbackColor}
                  size="xxs"
                />
                <span className="truncate font-medium text-slate-100">
                  {entry.name}
                </span>
              </span>
              <span
                className={`shrink-0 font-mono text-[10px] font-bold tabular-nums ${
                  idx === 0 ? 'text-amber-300' : 'text-cyan-300'
                }`}
              >
                {entry.wins}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
