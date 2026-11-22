import { RotateCcw, Trophy } from 'lucide-react';
import { EliminatedEntry, WinRecord } from '../types';
import { FlagAvatar } from './FlagAvatar';

interface LeaderboardPanelProps {
  records: WinRecord[];
  totalRounds: number;
  recentEliminations: EliminatedEntry[];
  onResetLeaderboard: () => void;
}

export function LeaderboardPanel({
  records,
  totalRounds,
  recentEliminations,
  onResetLeaderboard,
}: LeaderboardPanelProps) {
  const sorted = [...records].sort((a, b) => b.wins - a.wins || b.lastWonAt - a.lastWonAt);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#0a1022]/90 p-5">
      {/* Win Leaderboard */}
      <div>
        <div className="flex items-center justify-between gap-2 pb-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-wide text-white">
              Win Leaderboard
            </h2>
            <p className="text-xs text-slate-400 tabular-nums">
              {totalRounds} {totalRounds === 1 ? 'round' : 'rounds'} completed
            </p>
          </div>
          {sorted.length > 0 && (
            <button
              type="button"
              onClick={onResetLeaderboard}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-medium text-slate-400 transition-colors hover:border-white/25 hover:text-slate-200"
              title="Reset leaderboard"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-slate-950/50 px-4 py-6 text-center">
            <Trophy className="mx-auto mb-2 h-5 w-5 text-slate-500" />
            <p className="text-xs text-slate-400">
              No champions crowned yet. Watch the last surviving flag claim #1.
            </p>
          </div>
        ) : (
          <ol className="arena-scroll max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {sorted.slice(0, 12).map((item, idx) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/55 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`w-5 shrink-0 font-mono text-xs font-bold tabular-nums ${
                      idx === 0
                        ? 'text-amber-400'
                        : idx === 1
                        ? 'text-slate-300'
                        : idx === 2
                        ? 'text-amber-600'
                        : 'text-slate-500'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <FlagAvatar
                    imageUrl={item.imageUrl}
                    code={item.code}
                    name={item.name}
                    fallbackColor={item.fallbackColor}
                    size="sm"
                  />
                  <span className="truncate text-sm font-medium text-slate-100">
                    {item.name}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-xs font-bold text-cyan-300 tabular-nums">
                  {item.wins} {item.wins === 1 ? 'win' : 'wins'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Hairline divider */}
      <div className="h-px bg-white/10" />

      {/* Recent Eliminations Log */}
      <div>
        <div className="flex items-baseline justify-between pb-2.5">
          <h3 className="font-display text-lg font-bold tracking-wide text-slate-200">
            Elimination Feed
          </h3>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {recentEliminations.length} out
          </span>
        </div>

        {recentEliminations.length === 0 ? (
          <p className="text-xs text-slate-500">
            Flags ejected through the rotating gap appear here live.
          </p>
        ) : (
          <ul className="arena-scroll max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {recentEliminations.slice(0, 15).map((entry) => (
              <li
                key={`${entry.flag.id}_${entry.rank}_${entry.timestamp}`}
                className="flex items-center justify-between gap-2.5 rounded-lg bg-slate-950/40 px-2.5 py-1.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FlagAvatar
                    imageUrl={entry.flag.imageUrl}
                    code={entry.flag.code}
                    name={entry.flag.name}
                    fallbackColor={entry.flag.fallbackColor}
                    size="xs"
                  />
                  <span className="truncate font-medium text-slate-200">
                    {entry.flag.name}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-rose-400/90 tabular-nums">
                  #{entry.rank}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
